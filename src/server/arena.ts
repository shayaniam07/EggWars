/**
 * EGG WARS - Authoritative multiplayer arena server.
 *
 * Architecture
 * ------------
 * Runs inside the Next.js Node runtime as a single in-process simulation.
 * Clients talk to it through two HTTP endpoints:
 *   POST /api/mp/action  -> join / input / fire / reload / chat / leave
 *   GET  /api/mp/stream  -> Server-Sent-Events snapshot feed (20 Hz)
 *
 * Trust model (nothing below is decided by the client):
 *   - movement is speed-clamped and re-collided against the real map geometry
 *   - fire rate, magazine contents and reloads are tracked server-side
 *   - hit detection, damage, armour, head-shots and kills are raycast here
 *   - match timer, scores, kill feed and results are owned by the server
 *
 * Scaling note: this is a single-instance authoritative server. Run exactly one
 * Node process (or add a sticky-session load balancer + shared room registry)
 * for multiplayer. See README "Multiplayer deployment".
 */
import { randomBytes } from "node:crypto";
import { buildMap, type GeneratedMap } from "@/shared/maps";
import { clamp, dist3D, hasLineOfSight, rayWorld, raySphere, resolveCharacter, type Vec3 } from "@/shared/physics";
import { damageAtRange, getWeapon } from "@/shared/weapons";

export const TICK_HZ = 20;
const TICK_MS = 1000 / TICK_HZ;
const PLAYER_RADIUS = 0.45;
const PLAYER_HEIGHT = 1.65;
const MAX_SPEED = 9.2; // sprint speed + head-room for slopes/lag
const RESPAWN_SEC = 5;
const MATCH_SEC = 300;
const IDLE_KICK_MS = 15000;
const EMPTY_ROOM_TTL_MS = 120000;

export type RoomMode = "ffa" | "tdm";

export type PlayerSnapshot = {
  id: string;
  n: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  mv: number;
  cr: 0 | 1;
  ad: 0 | 1;
  gr: 0 | 1;
  hp: number;
  ar: number;
  al: 0 | 1;
  k: number;
  d: number;
  w: string;
  team: number;
  outfit: string;
  skin: string;
  ping: number;
};

export type ArenaEvent =
  | { t: "kill"; killer: string; victim: string; weapon: string; head: boolean }
  | { t: "hit"; by: string; on: string; dmg: number; head: boolean }
  | { t: "shot"; by: string; ox: number; oy: number; oz: number; dx: number; dy: number; dz: number; w: string; hit: boolean }
  | { t: "reload"; by: string; w: string }
  | { t: "spawn"; id: string }
  | { t: "join"; id: string; name: string }
  | { t: "leave"; id: string; name: string }
  | { t: "chat"; id: string; name: string; msg: string }
  | { t: "state"; state: RoomState }
  | { t: "damaged"; on: string; by: string; dmg: number; dirX: number; dirZ: number };

export type RoomState = "lobby" | "countdown" | "live" | "ended";

type ServerPlayer = {
  id: string;
  secret: string;
  userId: number | null;
  name: string;
  outfit: string;
  skin: string;
  team: number;
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;
  mv: number;
  crouch: boolean;
  ads: boolean;
  grounded: boolean;
  hp: number;
  armor: number;
  maxArmor: number;
  alive: boolean;
  kills: number;
  deaths: number;
  damage: number;
  headshots: number;
  weaponId: string;
  loadout: string[];
  ammo: Record<string, { mag: number; reserve: number }>;
  nextFireAt: number;
  reloadDoneAt: number;
  respawnAt: number;
  lastSeen: number;
  lastInputAt: number;
  ready: boolean;
  ping: number;
  violations: number;
};

type Subscriber = (payload: string) => void;

export type Room = {
  id: string;
  name: string;
  code: string;
  mapId: string;
  mode: RoomMode;
  maxPlayers: number;
  isPrivate: boolean;
  state: RoomState;
  map: GeneratedMap;
  players: Map<string, ServerPlayer>;
  subs: Map<string, Subscriber>;
  events: ArenaEvent[];
  killFeed: { killer: string; victim: string; weapon: string; head: boolean; at: number }[];
  tick: number;
  stateUntil: number;
  endsAt: number;
  createdAt: number;
  emptySince: number | null;
  scoreLimit: number;
};

const g = globalThis as typeof globalThis & {
  __ewArena?: { rooms: Map<string, Room>; timer: NodeJS.Timeout | null };
};

function store() {
  if (!g.__ewArena) g.__ewArena = { rooms: new Map(), timer: null };
  if (!g.__ewArena.timer) {
    g.__ewArena.timer = setInterval(stepAll, TICK_MS);
    // Never keep the process alive just for an empty arena loop.
    g.__ewArena.timer.unref?.();
  }
  return g.__ewArena;
}

export function listRooms() {
  const { rooms } = store();
  return [...rooms.values()]
    .filter((r) => !r.isPrivate)
    .map((r) => ({
      id: r.id,
      name: r.name,
      mapId: r.mapId,
      mode: r.mode,
      state: r.state,
      players: r.players.size,
      maxPlayers: r.maxPlayers,
      timeLeft: Math.max(0, Math.round((r.endsAt - Date.now()) / 1000)),
    }));
}

export function createRoom(opts: {
  name: string;
  mapId: string;
  mode: RoomMode;
  maxPlayers?: number;
  isPrivate?: boolean;
}): Room {
  const { rooms } = store();
  const id = randomBytes(6).toString("hex");
  const room: Room = {
    id,
    name: opts.name.slice(0, 40) || "Egg Arena",
    code: randomBytes(3).toString("hex").toUpperCase(),
    mapId: opts.mapId,
    mode: opts.mode,
    maxPlayers: clamp(opts.maxPlayers ?? 10, 2, 16),
    isPrivate: Boolean(opts.isPrivate),
    state: "lobby",
    map: buildMap(opts.mapId, 1337),
    players: new Map(),
    subs: new Map(),
    events: [],
    killFeed: [],
    tick: 0,
    stateUntil: 0,
    endsAt: Date.now() + MATCH_SEC * 1000,
    createdAt: Date.now(),
    emptySince: Date.now(),
    scoreLimit: 25,
  };
  rooms.set(id, room);
  return room;
}

export function findRoom(idOrCode: string): Room | undefined {
  const { rooms } = store();
  const direct = rooms.get(idOrCode);
  if (direct) return direct;
  const code = idOrCode.toUpperCase();
  return [...rooms.values()].find((r) => r.code === code);
}

/** Quick-match: first open public room on the map, else a brand-new one. */
export function quickMatch(mapId: string, mode: RoomMode): Room {
  const { rooms } = store();
  const open = [...rooms.values()].find(
    (r) => !r.isPrivate && r.mapId === mapId && r.mode === mode && r.players.size < r.maxPlayers && r.state !== "ended",
  );
  return open ?? createRoom({ name: "Quick Match", mapId, mode });
}

export function joinRoom(
  room: Room,
  info: { userId: number | null; name: string; outfit: string; skin: string; loadout: string[]; armor: number },
) {
  if (room.players.size >= room.maxPlayers) throw new Error("Room is full");
  const id = randomBytes(5).toString("hex");
  const secret = randomBytes(16).toString("hex");
  const team = room.mode === "tdm" ? (room.players.size % 2) + 1 : 0;
  const spawn = pickSpawn(room);
  const loadout = info.loadout.length ? info.loadout.slice(0, 3) : ["cluck9"];
  const player: ServerPlayer = {
    id,
    secret,
    userId: info.userId,
    name: info.name.slice(0, 20) || "Egg",
    outfit: info.outfit || "outfit_default",
    skin: info.skin || "",
    team,
    pos: { ...spawn },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    mv: 0,
    crouch: false,
    ads: false,
    grounded: true,
    hp: 100,
    armor: clamp(info.armor, 0, 100),
    maxArmor: clamp(info.armor, 0, 100),
    alive: true,
    kills: 0,
    deaths: 0,
    damage: 0,
    headshots: 0,
    weaponId: loadout[0],
    loadout,
    ammo: Object.fromEntries(
      loadout.map((wid) => {
        const w = getWeapon(wid);
        return [wid, { mag: w.mag, reserve: w.reserve }];
      }),
    ),
    nextFireAt: 0,
    reloadDoneAt: 0,
    respawnAt: 0,
    lastSeen: Date.now(),
    lastInputAt: Date.now(),
    ready: false,
    ping: 0,
    violations: 0,
  };
  room.players.set(id, player);
  room.emptySince = null;
  pushEvent(room, { t: "join", id, name: player.name });
  if (room.state === "lobby" && room.players.size >= 2) startCountdown(room);
  return { playerId: id, secret, team };
}

function startCountdown(room: Room) {
  room.state = "countdown";
  room.stateUntil = Date.now() + 5000;
  pushEvent(room, { t: "state", state: "countdown" });
}

function startMatch(room: Room) {
  room.state = "live";
  room.endsAt = Date.now() + MATCH_SEC * 1000;
  room.killFeed = [];
  for (const p of room.players.values()) respawn(room, p, true);
  pushEvent(room, { t: "state", state: "live" });
}

function endMatch(room: Room) {
  room.state = "ended";
  room.stateUntil = Date.now() + 12000;
  pushEvent(room, { t: "state", state: "ended" });
}

export function leaveRoom(room: Room, playerId: string) {
  const p = room.players.get(playerId);
  if (!p) return;
  room.players.delete(playerId);
  room.subs.delete(playerId);
  pushEvent(room, { t: "leave", id: playerId, name: p.name });
  if (room.players.size === 0) room.emptySince = Date.now();
}

function pickSpawn(room: Room): Vec3 {
  const spawns = room.map.spawns;
  let best = spawns[0];
  let bestScore = -Infinity;
  for (let i = 0; i < spawns.length; i++) {
    const s = spawns[(i * 7 + room.tick) % spawns.length];
    let nearest = Infinity;
    for (const p of room.players.values()) {
      if (!p.alive) continue;
      nearest = Math.min(nearest, dist3D(s, p.pos));
    }
    const score = nearest === Infinity ? 1000 + Math.random() * 10 : nearest + Math.random() * 4;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return { x: best.x, y: best.y, z: best.z };
}

function respawn(room: Room, p: ServerPlayer, full = false) {
  const s = pickSpawn(room);
  p.pos = { ...s };
  p.vel = { x: 0, y: 0, z: 0 };
  p.hp = 100;
  p.armor = p.maxArmor;
  p.alive = true;
  p.respawnAt = 0;
  if (full) {
    p.kills = 0;
    p.deaths = 0;
    p.damage = 0;
    p.headshots = 0;
  }
  for (const wid of p.loadout) {
    const w = getWeapon(wid);
    p.ammo[wid] = { mag: w.mag, reserve: w.reserve };
  }
  p.weaponId = p.loadout[0];
  pushEvent(room, { t: "spawn", id: p.id });
}

/* ------------------------------------------------------------- messages */
export type ClientInput = {
  pos: Vec3;
  yaw: number;
  pitch: number;
  mv: number;
  crouch: boolean;
  ads: boolean;
  grounded: boolean;
  ping?: number;
};

export function applyInput(room: Room, playerId: string, secret: string, input: ClientInput) {
  const p = auth(room, playerId, secret);
  const now = Date.now();
  const dt = Math.max(0.016, (now - p.lastInputAt) / 1000);
  p.lastInputAt = now;
  p.lastSeen = now;
  p.ping = clamp(Math.round(input.ping ?? 0), 0, 999);

  if (p.alive && room.state === "live") {
    // --- server-side movement validation -----------------------------
    const maxStep = MAX_SPEED * Math.min(dt, 0.5) * 1.6 + 0.6;
    const want = input.pos;
    const d = dist3D(p.pos, want);
    let target = want;
    if (!Number.isFinite(d) || d > maxStep) {
      p.violations++;
      // clamp the move instead of teleporting the player
      const k = d > 0 ? maxStep / d : 0;
      target = {
        x: p.pos.x + (want.x - p.pos.x) * k,
        y: p.pos.y + (want.y - p.pos.y) * k,
        z: p.pos.z + (want.z - p.pos.z) * k,
      };
    }
    // Re-collide against authoritative geometry so nobody walks through walls.
    const corrected = resolveCharacter(
      target,
      { x: 0, y: 0, z: 0 },
      PLAYER_RADIUS,
      PLAYER_HEIGHT,
      room.map.colliders,
      0,
    );
    const half = room.map.theme.half;
    p.pos = {
      x: clamp(corrected.pos.x, -half + 1, half - 1),
      y: clamp(corrected.pos.y, 0, 60),
      z: clamp(corrected.pos.z, -half + 1, half - 1),
    };
  }

  p.yaw = input.yaw;
  p.pitch = clamp(input.pitch, -1.4, 1.4);
  p.mv = clamp(input.mv, 0, 1.4);
  p.crouch = Boolean(input.crouch);
  p.ads = Boolean(input.ads);
  p.grounded = Boolean(input.grounded);
  return { corrected: p.pos, violations: p.violations };
}

export function switchWeapon(room: Room, playerId: string, secret: string, weaponId: string) {
  const p = auth(room, playerId, secret);
  if (!p.loadout.includes(weaponId)) throw new Error("Weapon not in loadout");
  p.weaponId = weaponId;
  p.reloadDoneAt = 0;
  p.nextFireAt = Math.max(p.nextFireAt, Date.now() + 250);
}

export function requestReload(room: Room, playerId: string, secret: string) {
  const p = auth(room, playerId, secret);
  const w = getWeapon(p.weaponId);
  const ammo = p.ammo[p.weaponId];
  if (!ammo || ammo.mag >= w.mag || ammo.reserve <= 0 || p.reloadDoneAt > Date.now()) return;
  p.reloadDoneAt = Date.now() + w.reloadSec * 1000;
  pushEvent(room, { t: "reload", by: p.id, w: p.weaponId });
}

/**
 * Server-side hit resolution. The client sends *where it was aiming*; the
 * server decides the origin, consumes ammo, enforces the fire rate and runs
 * the raycast against its own copy of the world.
 */
export function requestFire(
  room: Room,
  playerId: string,
  secret: string,
  dir: Vec3,
) {
  const p = auth(room, playerId, secret);
  const now = Date.now();
  if (room.state !== "live" || !p.alive) return { ok: false, reason: "not-live" };
  if (now < p.nextFireAt) return { ok: false, reason: "rate" };
  if (p.reloadDoneAt > now) return { ok: false, reason: "reloading" };

  const w = getWeapon(p.weaponId);
  const ammo = p.ammo[p.weaponId] ?? { mag: 0, reserve: 0 };
  if (w.cls !== "melee" && ammo.mag <= 0) return { ok: false, reason: "empty" };

  p.nextFireAt = now + 1000 / w.rps;
  if (w.cls !== "melee") ammo.mag -= 1;

  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const d = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
  const origin = { x: p.pos.x, y: p.pos.y + (p.crouch ? 1.0 : 1.45), z: p.pos.z };

  let anyHit = false;
  for (let pellet = 0; pellet < w.pellets; pellet++) {
    const spread = p.ads ? w.spreadAds : w.spreadHip;
    const pd =
      pellet === 0 && w.pellets === 1
        ? d
        : normalize({
            x: d.x + (Math.random() - 0.5) * spread * 2,
            y: d.y + (Math.random() - 0.5) * spread * 2,
            z: d.z + (Math.random() - 0.5) * spread * 2,
          });
    const wallDist = rayWorld(origin, pd, room.map.colliders, w.range);
    let bestT = wallDist;
    let victim: ServerPlayer | null = null;
    let head = false;

    for (const other of room.players.values()) {
      if (other.id === p.id || !other.alive) continue;
      if (room.mode === "tdm" && other.team === p.team) continue;
      const bodyC = { x: other.pos.x, y: other.pos.y + 0.75, z: other.pos.z };
      const headC = { x: other.pos.x, y: other.pos.y + (other.crouch ? 1.15 : 1.58), z: other.pos.z };
      const tHead = raySphere(origin, pd, headC, 0.42, bestT);
      const tBody = raySphere(origin, pd, bodyC, 0.62, bestT);
      const t = Math.min(tHead, tBody);
      if (t < bestT) {
        bestT = t;
        victim = other;
        head = tHead <= tBody;
      }
    }

    if (victim) {
      anyHit = true;
      let dmg = damageAtRange(w, bestT);
      if (head) dmg *= w.headMult;
      if (head && victim.maxArmor >= 40) dmg *= 0.85; // helmet mitigation
      dmg = Math.round(dmg);
      applyDamage(room, victim, p, dmg, head, w.id);
    }
  }

  pushEvent(room, {
    t: "shot",
    by: p.id,
    ox: origin.x,
    oy: origin.y,
    oz: origin.z,
    dx: d.x,
    dy: d.y,
    dz: d.z,
    w: p.weaponId,
    hit: anyHit,
  });
  return { ok: true, mag: ammo.mag, reserve: ammo.reserve };
}

function applyDamage(room: Room, victim: ServerPlayer, attacker: ServerPlayer, dmg: number, head: boolean, weapon: string) {
  let remaining = dmg;
  if (victim.armor > 0) {
    const absorbed = Math.min(victim.armor, Math.round(remaining * 0.6));
    victim.armor -= absorbed;
    remaining -= absorbed;
  }
  victim.hp -= remaining;
  attacker.damage += dmg;
  if (head) attacker.headshots += 1;

  const dx = victim.pos.x - attacker.pos.x;
  const dz = victim.pos.z - attacker.pos.z;
  const l = Math.hypot(dx, dz) || 1;
  pushEvent(room, { t: "damaged", on: victim.id, by: attacker.id, dmg, dirX: dx / l, dirZ: dz / l });
  pushEvent(room, { t: "hit", by: attacker.id, on: victim.id, dmg, head });

  if (victim.hp <= 0) {
    victim.hp = 0;
    victim.alive = false;
    victim.deaths += 1;
    victim.respawnAt = Date.now() + RESPAWN_SEC * 1000;
    attacker.kills += 1;
    room.killFeed.unshift({ killer: attacker.name, victim: victim.name, weapon, head, at: Date.now() });
    room.killFeed = room.killFeed.slice(0, 8);
    pushEvent(room, { t: "kill", killer: attacker.id, victim: victim.id, weapon, head });
    if (attacker.kills >= room.scoreLimit) endMatch(room);
  }
}

export function chat(room: Room, playerId: string, secret: string, msg: string) {
  const p = auth(room, playerId, secret);
  const clean = msg.replace(/[\u0000-\u001f]/g, "").slice(0, 140).trim();
  if (!clean) return;
  pushEvent(room, { t: "chat", id: p.id, name: p.name, msg: clean });
}

function auth(room: Room, playerId: string, secret: string): ServerPlayer {
  const p = room.players.get(playerId);
  if (!p || p.secret !== secret) throw new Error("Invalid player credentials");
  p.lastSeen = Date.now();
  return p;
}

export function heartbeat(room: Room, playerId: string, secret: string) {
  auth(room, playerId, secret);
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function pushEvent(room: Room, e: ArenaEvent) {
  room.events.push(e);
  if (room.events.length > 120) room.events.splice(0, room.events.length - 120);
}

/* ----------------------------------------------------------- simulation */
function stepAll() {
  const { rooms } = store();
  const now = Date.now();
  for (const room of rooms.values()) {
    step(room, now);
    if (room.players.size === 0) {
      if (room.emptySince === null) room.emptySince = now;
      if (now - room.emptySince > EMPTY_ROOM_TTL_MS) rooms.delete(room.id);
    }
  }
}

function step(room: Room, now: number) {
  room.tick++;

  // drop timed-out clients
  for (const p of [...room.players.values()]) {
    if (now - p.lastSeen > IDLE_KICK_MS) leaveRoom(room, p.id);
  }

  if (room.state === "countdown" && now >= room.stateUntil) {
    if (room.players.size >= 2) startMatch(room);
    else {
      room.state = "lobby";
      pushEvent(room, { t: "state", state: "lobby" });
    }
  }

  if (room.state === "live") {
    if (room.players.size < 1) {
      room.state = "lobby";
      pushEvent(room, { t: "state", state: "lobby" });
    } else if (now >= room.endsAt) {
      endMatch(room);
    }
    for (const p of room.players.values()) {
      if (!p.alive && p.respawnAt && now >= p.respawnAt) respawn(room, p);
      // auto-finish reloads
      if (p.reloadDoneAt && now >= p.reloadDoneAt) {
        const w = getWeapon(p.weaponId);
        const ammo = p.ammo[p.weaponId];
        if (ammo) {
          const need = w.mag - ammo.mag;
          const take = Math.min(need, ammo.reserve);
          ammo.mag += take;
          ammo.reserve -= take;
        }
        p.reloadDoneAt = 0;
      }
    }
  }

  if (room.state === "ended" && now >= room.stateUntil) {
    room.state = "lobby";
    for (const p of room.players.values()) p.ready = false;
    pushEvent(room, { t: "state", state: "lobby" });
    if (room.players.size >= 2) startCountdown(room);
  }

  if (room.subs.size === 0) {
    room.events.length = 0;
    return;
  }

  const snapshot = serialize(room, now);
  const payload = `data: ${JSON.stringify(snapshot)}\n\n`;
  for (const [pid, send] of room.subs) {
    try {
      send(payload);
    } catch {
      room.subs.delete(pid);
    }
  }
  room.events.length = 0;
}

export function serialize(room: Room, now = Date.now()) {
  const players: PlayerSnapshot[] = [];
  for (const p of room.players.values()) {
    players.push({
      id: p.id,
      n: p.name,
      x: round(p.pos.x),
      y: round(p.pos.y),
      z: round(p.pos.z),
      yaw: round(p.yaw),
      pitch: round(p.pitch),
      mv: round(p.mv),
      cr: p.crouch ? 1 : 0,
      ad: p.ads ? 1 : 0,
      gr: p.grounded ? 1 : 0,
      hp: Math.round(p.hp),
      ar: Math.round(p.armor),
      al: p.alive ? 1 : 0,
      k: p.kills,
      d: p.deaths,
      w: p.weaponId,
      team: p.team,
      outfit: p.outfit,
      skin: p.skin,
      ping: p.ping,
    });
  }
  return {
    tick: room.tick,
    now,
    state: room.state,
    mapId: room.mapId,
    mode: room.mode,
    name: room.name,
    code: room.code,
    timeLeft: room.state === "live" ? Math.max(0, Math.round((room.endsAt - now) / 1000)) : Math.max(0, Math.round((room.stateUntil - now) / 1000)),
    scoreLimit: room.scoreLimit,
    players,
    events: room.events.slice(),
    killFeed: room.killFeed,
  };
}
export type ArenaSnapshot = ReturnType<typeof serialize>;

export function subscribe(room: Room, playerId: string, send: Subscriber) {
  room.subs.set(playerId, send);
  return () => room.subs.delete(playerId);
}

/** Per-player authoritative state the client needs but others don't see. */
export function privateState(room: Room, playerId: string, secret: string) {
  const p = auth(room, playerId, secret);
  const w = getWeapon(p.weaponId);
  const ammo = p.ammo[p.weaponId] ?? { mag: 0, reserve: 0 };
  return {
    pos: p.pos,
    hp: p.hp,
    armor: p.armor,
    alive: p.alive,
    weaponId: p.weaponId,
    mag: ammo.mag,
    reserve: ammo.reserve,
    reloading: p.reloadDoneAt > Date.now(),
    reloadMs: Math.max(0, p.reloadDoneAt - Date.now()),
    reloadTotal: w.reloadSec * 1000,
    respawnIn: p.alive ? 0 : Math.max(0, Math.ceil((p.respawnAt - Date.now()) / 1000)),
    kills: p.kills,
    deaths: p.deaths,
    damage: p.damage,
    headshots: p.headshots,
    loadout: p.loadout,
  };
}

export function roomVisibility(room: Room, a: Vec3, b: Vec3) {
  return hasLineOfSight(a, b, room.map.colliders);
}

const round = (n: number) => Math.round(n * 100) / 100;
