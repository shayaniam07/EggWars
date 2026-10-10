/**
 * EGG WARS - Game client engine.
 *
 * Owns the three.js renderer, the local player controller, the offline match
 * simulation (bots, loot, scoring) and the online mode (client prediction +
 * authoritative server reconciliation).
 *
 * The HUD is a React layer; the engine pushes an immutable HudState snapshot
 * ~12 times a second through the onHud callback.
 */
import * as THREE from "three";
import { EggCharacter, nameTagSprite } from "./egg";
import { Effects } from "./fx";
import { AudioEngine } from "./audio";
import { InputManager } from "./input";
import { Bot, type Combatant } from "./bots";
import { WorldView, type Quality } from "./world";
import type { OutfitVisual } from "@/shared/catalog";
import { buildMap, type GeneratedMap } from "@/shared/maps";
import { clamp, dist2D, hasLineOfSight, rayWorld, raySphere, resolveCharacter, type Vec3 } from "@/shared/physics";
import { DIFFICULTIES, damageAtRange, getWeapon, type Difficulty } from "@/shared/weapons";

export type LootKind = "weapon" | "ammo" | "armor" | "heal";
export type LootPickup = {
  id: number;
  kind: LootKind;
  weaponId?: string;
  amount: number;
  pos: Vec3;
  mesh: THREE.Object3D;
  taken: boolean;
  label: string;
};

export type KillFeedEntry = { killer: string; victim: string; weapon: string; head: boolean; at: number };

export type HudState = {
  ready: boolean;
  mode: "offline" | "online";
  matchState: "countdown" | "live" | "ended";
  countdown: number;
  timeLeft: number;
  hp: number;
  maxHp: number;
  armor: number;
  alive: boolean;
  respawnIn: number;
  weaponName: string;
  weaponEmoji: string;
  mag: number;
  reserve: number;
  reloading: boolean;
  reloadPct: number;
  slots: { id: string; name: string; emoji: string; active: boolean; mag: number }[];
  kills: number;
  deaths: number;
  damage: number;
  headshots: number;
  crosshair: number;
  ads: boolean;
  sprinting: boolean;
  crouching: boolean;
  hitMarker: number;
  damageDirs: { dir: number; at: number }[];
  killFeed: KillFeedEntry[];
  scoreboard: { name: string; kills: number; deaths: number; isSelf: boolean; ping?: number }[];
  interact: string | null;
  minimap: { self: { x: number; z: number; yaw: number }; blips: { x: number; z: number; enemy: boolean }[]; half: number };
  alivePlayers: number;
  connection: "offline" | "connecting" | "live" | "lost";
  chat: { name: string; msg: string; at: number }[];
  fps: number;
};

export type MatchResultSummary = {
  kills: number;
  deaths: number;
  headshots: number;
  damage: number;
  placement: number;
  won: boolean;
  durationSec: number;
  mapId: string;
  difficulty: Difficulty;
  mode: "offline" | "online";
  scoreboard: { name: string; kills: number; deaths: number; isSelf: boolean }[];
};

export type GameSettings = {
  sensitivity: number;
  adsSensitivity: number;
  invertY: boolean;
  quality: Quality;
  fov: number;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  showFps: boolean;
  bindings: Record<string, string>;
  fpsLimit: number;
};

export const DEFAULT_SETTINGS: GameSettings = {
  sensitivity: 1,
  adsSensitivity: 0.6,
  invertY: false,
  quality: "medium",
  fov: 75,
  masterVolume: 0.8,
  musicVolume: 0.3,
  sfxVolume: 0.85,
  showFps: false,
  bindings: {},
  fpsLimit: 0,
};

export type MatchConfig = {
  mode: "offline" | "online";
  mapId: string;
  difficulty: Difficulty;
  loadout: string[];
  outfit: OutfitVisual;
  playerName: string;
  armor: number;
  weaponTint?: number;
  matchSeconds: number;
  scoreLimit: number;
  online?: { roomId: string; playerId: string; secret: string };
};

type RemotePlayer = {
  id: string;
  name: string;
  character: EggCharacter;
  group: THREE.Group;
  target: THREE.Vector3;
  prev: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  alive: boolean;
  kills: number;
  deaths: number;
  hp: number;
  mv: number;
  crouch: boolean;
  ads: boolean;
  ping: number;
  lastUpdate: number;
};

const GRAVITY = 26;
const WALK = 5.0;
const SPRINT = 8.0;
const CROUCH_SPEED = 2.4;
const JUMP_V = 8.4;
const PLAYER_R = 0.45;
const PLAYER_H = 1.65;

export class GameClient {
  readonly input: InputManager;
  readonly audio = new AudioEngine();
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: WorldView | null = null;
  private fx: Effects;
  private map: GeneratedMap;
  private cfg: MatchConfig | null = null;
  private settings: GameSettings = { ...DEFAULT_SETTINGS };

  // local player
  private pos: Vec3 = { x: 0, y: 0, z: 0 };
  private vel: Vec3 = { x: 0, y: 0, z: 0 };
  private yaw = 0;
  private pitch = 0;
  private grounded = true;
  private hp = 100;
  private armor = 0;
  private maxArmor = 0;
  private alive = true;
  private respawnAt = 0;
  private kills = 0;
  private deaths = 0;
  private damage = 0;
  private headshots = 0;
  private slotIndex = 0;
  private loadout: string[] = ["cluck9"];
  private ammo: Record<string, { mag: number; reserve: number }> = {};
  private nextFireAt = 0;
  private reloadUntil = 0;
  private recoilPitch = 0;
  private spread = 0;
  private firingTimer = 10;
  private avatar: EggCharacter | null = null;
  private avatarGroup = new THREE.Group();

  // match
  private bots: Bot[] = [];
  private loot: LootPickup[] = [];
  private lootGroup = new THREE.Group();
  private matchState: "countdown" | "live" | "ended" = "countdown";
  private countdown = 3;
  private matchEndsAt = 0;
  private startedAt = 0;
  private killFeed: KillFeedEntry[] = [];
  private damageDirs: { dir: number; at: number }[] = [];
  private hitMarker = 0;
  private chatLog: { name: string; msg: string; at: number }[] = [];

  // online
  private remote = new Map<string, RemotePlayer>();
  private es: EventSource | null = null;
  private netTimer: ReturnType<typeof setInterval> | null = null;
  private connection: HudState["connection"] = "offline";
  private serverState: "lobby" | "countdown" | "live" | "ended" = "lobby";
  private serverTimeLeft = 0;
  private lastPingSent = 0;
  private ping = 0;
  private pendingShots = 0;

  // loop
  private raf = 0;
  private last = 0;
  private hudAccum = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private fps = 0;
  private paused = false;
  private running = false;
  private disposed = false;
  private resizeObs: ResizeObserver | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private callbacks: {
      onHud: (s: HudState) => void;
      onEnd: (r: MatchResultSummary) => void;
      onNotice?: (msg: string) => void;
    },
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 500);
    this.scene.add(this.camera);
    this.scene.add(this.avatarGroup, this.lootGroup);
    this.fx = new Effects(this.scene);
    this.input = new InputManager(canvas);
    this.map = buildMap("island");
    this.handleResize();
    this.resizeObs = new ResizeObserver(() => this.handleResize());
    this.resizeObs.observe(canvas.parentElement ?? canvas);
  }

  /* ------------------------------------------------------------ setup */
  setSettings(s: GameSettings) {
    this.settings = { ...DEFAULT_SETTINGS, ...s };
    this.input.invertY = this.settings.invertY;
    this.input.setBindings(this.settings.bindings || {});
    this.audio.applySettings({
      master: this.settings.masterVolume,
      music: this.settings.musicVolume,
      sfx: this.settings.sfxVolume,
    });
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    const q = this.settings.quality;
    this.renderer.setPixelRatio(q === "low" ? 1 : Math.min(window.devicePixelRatio, q === "high" ? 2 : 1.5));
    this.renderer.shadowMap.enabled = q !== "low";
  }

  async start(cfg: MatchConfig) {
    this.cleanupMatch();
    this.cfg = cfg;
    this.map = buildMap(cfg.mapId);
    this.world = new WorldView(this.scene, this.map, this.settings.quality);

    this.loadout = cfg.loadout.length ? cfg.loadout.slice(0, 3) : ["cluck9"];
    this.ammo = {};
    for (const id of this.loadout) {
      const w = getWeapon(id);
      this.ammo[id] = { mag: w.mag, reserve: w.reserve };
    }
    this.slotIndex = 0;
    this.maxArmor = cfg.armor;
    this.armor = cfg.armor;
    this.hp = 100;
    this.alive = true;
    this.kills = this.deaths = this.damage = this.headshots = 0;
    this.killFeed = [];
    this.chatLog = [];
    this.matchState = "countdown";
    this.countdown = 3;
    this.startedAt = performance.now();
    this.matchEndsAt = performance.now() + cfg.matchSeconds * 1000;

    const spawn = this.map.spawns[Math.floor(Math.random() * this.map.spawns.length)];
    this.pos = { ...spawn };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = Math.atan2(-spawn.x, -spawn.z);
    this.pitch = 0;

    this.avatar = new EggCharacter(cfg.outfit, this.loadout[0], { tint: cfg.weaponTint });
    this.avatarGroup.add(this.avatar.group);

    if (cfg.mode === "offline") {
      this.spawnBots();
      this.spawnLoot();
      this.connection = "offline";
    } else {
      this.connectOnline();
    }

    this.audio.resume();
    this.audio.startMusic();
    this.running = true;
    this.last = performance.now();
    this.loop();
  }

  private spawnBots() {
    const profile = DIFFICULTIES[this.cfg!.difficulty];
    const palettes: OutfitVisual[] = [
      { body: 0xfdf2df, accent: 0xd93f3f, hat: "cap", face: "cool", extra: "backpack", pattern: "stripes" },
      { body: 0xa8b088, accent: 0x4c5a3a, hat: "helmet", face: "angry", extra: "backpack", pattern: "camo" },
      { body: 0x2b2f3a, accent: 0xe4e8f0, hat: "hood", face: "ninja", extra: "cape", pattern: "none" },
      { body: 0xc23a2a, accent: 0xf5c04a, hat: "horns", face: "fierce", extra: "wings", pattern: "scales" },
      { body: 0xf3f6ff, accent: 0x4f8cff, hat: "bubble", face: "happy", extra: "jetpack", pattern: "circuit" },
    ];
    for (let i = 0; i < profile.botCount; i++) {
      const spawn = this.map.spawns[(i * 3 + 5) % this.map.spawns.length];
      const bot = new Bot(i, spawn, profile, palettes[i % palettes.length]);
      this.bots.push(bot);
      this.scene.add(bot.group);
    }
  }

  private spawnLoot() {
    let id = 1;
    const kinds: LootKind[] = ["weapon", "ammo", "armor", "heal"];
    for (const spot of this.map.loot) {
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const weaponPool = ["yolk_ar", "shellstorm", "scrambler", "eggsniper", "cluck9"];
      const weaponId = weaponPool[Math.floor(Math.random() * weaponPool.length)];
      const color =
        kind === "weapon" ? 0x7c8ca0 : kind === "ammo" ? 0xd8a33f : kind === "armor" ? 0x4f9cf5 : 0xe4484a;
      const geo = new THREE.BoxGeometry(0.45, 0.45, 0.45);
      const mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.25 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(spot.x, spot.y + 0.6, spot.z);
      mesh.castShadow = false;
      this.lootGroup.add(mesh);
      this.loot.push({
        id: id++,
        kind,
        weaponId: kind === "weapon" ? weaponId : undefined,
        amount: kind === "ammo" ? 60 : kind === "armor" ? 35 : 45,
        pos: { x: spot.x, y: spot.y, z: spot.z },
        mesh,
        taken: false,
        label:
          kind === "weapon"
            ? `Pick up ${getWeapon(weaponId).name}`
            : kind === "ammo"
              ? "Pick up ammo"
              : kind === "armor"
                ? "Pick up armour"
                : "Pick up med kit",
      });
    }
  }

  /* ------------------------------------------------------------- loop */
  private loop = () => {
    if (!this.running || this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    if (this.settings.fpsLimit > 0 && dt < 1 / this.settings.fpsLimit) return;
    this.last = now;
    dt = Math.min(dt, 0.05);

    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    if (!this.paused) this.step(dt, now);
    this.fx.update(dt);
    this.renderer.render(this.scene, this.camera);

    this.hudAccum += dt;
    if (this.hudAccum > 0.08) {
      this.hudAccum = 0;
      this.callbacks.onHud(this.hudState());
    }
    this.input.clearFrame();
  };

  private step(dt: number, now: number) {
    // countdown gate
    if (this.matchState === "countdown") {
      this.countdown -= dt;
      if (this.cfg?.mode === "online") {
        if (this.serverState === "live") this.matchState = "live";
      } else if (this.countdown <= 0) {
        this.matchState = "live";
        this.audio.countdown(true);
      }
    }

    this.updateLook(dt);
    this.updatePlayer(dt, now);
    this.updateWeapon(dt, now);

    if (this.cfg?.mode === "offline") {
      this.updateOffline(dt, now);
    } else {
      this.updateRemote(dt);
    }

    this.updateLoot(dt, now);
    this.updateCamera(dt);
    this.damageDirs = this.damageDirs.filter((d) => now - d.at < 1200);
    this.hitMarker = Math.max(0, this.hitMarker - dt);

    if (this.matchState === "live") {
      const timeLeft = (this.matchEndsAt - now) / 1000;
      if (this.cfg?.mode === "offline" && timeLeft <= 0) this.finishMatch();
    }
  }

  /* ------------------------------------------------------ player ctrl */
  private updateLook(dt: number) {
    const look = this.input.consumeLook();
    const ads = this.isAds();
    const sens = (this.settings.sensitivity * (ads ? this.settings.adsSensitivity : 1)) * 0.0022;
    this.yaw -= look.dx * sens;
    this.pitch -= look.dy * sens;
    this.pitch = clamp(this.pitch, -1.25, 1.1);
    this.recoilPitch = Math.max(0, this.recoilPitch - dt * 3.2);
  }

  private isAds() {
    return this.alive && this.input.isDown("aim") && this.matchState !== "ended";
  }

  private updatePlayer(dt: number, now: number) {
    if (!this.alive) {
      if (now >= this.respawnAt) this.respawnLocal();
      this.avatar?.update(dt, {
        speed: 0, grounded: true, crouch: false, aim: false, dead: true,
        firing: 10, reloading: false, yaw: this.yaw, pitch: 0,
      });
      return;
    }

    const canMove = this.matchState === "live";
    const mv = canMove ? this.input.moveVector() : { x: 0, y: 0 };
    const crouch = canMove && this.input.isDown("crouch");
    const sprint = canMove && this.input.isDown("sprint") && mv.y > 0.1 && !crouch && !this.isAds();
    const speed = crouch ? CROUCH_SPEED : sprint ? SPRINT : this.isAds() ? WALK * 0.6 : WALK;

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const wishX = mv.x * cos - mv.y * sin;
    const wishZ = -mv.x * sin - mv.y * cos;
    const accel = this.grounded ? 14 : 5;
    this.vel.x += (wishX * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wishZ * speed - this.vel.z) * Math.min(1, accel * dt);
    if (this.grounded && mv.x === 0 && mv.y === 0) {
      this.vel.x *= Math.max(0, 1 - 12 * dt);
      this.vel.z *= Math.max(0, 1 - 12 * dt);
    }

    if (canMove && this.input.consumePress("jump") && this.grounded) {
      this.vel.y = JUMP_V;
      this.grounded = false;
      this.audio.jump();
    }
    this.vel.y -= GRAVITY * dt;

    const res = resolveCharacter(this.pos, this.vel, PLAYER_R, PLAYER_H, this.map.colliders, dt);
    const wasGrounded = this.grounded;
    this.pos = res.pos;
    this.vel = res.vel;
    this.grounded = res.grounded;
    if (!wasGrounded && this.grounded) this.audio.ui();

    const half = this.map.theme.half - 1.4;
    this.pos.x = clamp(this.pos.x, -half, half);
    this.pos.z = clamp(this.pos.z, -half, half);

    this.avatarGroup.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.avatarGroup.rotation.y = this.yaw;
    this.firingTimer += dt;
    this.avatar?.update(dt, {
      speed: Math.hypot(this.vel.x, this.vel.z) / WALK,
      grounded: this.grounded,
      crouch,
      aim: this.isAds() || this.firingTimer < 0.4,
      dead: false,
      firing: this.firingTimer,
      reloading: this.reloadUntil > now,
      yaw: this.yaw,
      pitch: this.pitch,
    });
  }

  private respawnLocal() {
    const spawn = this.map.spawns[Math.floor(Math.random() * this.map.spawns.length)];
    this.pos = { ...spawn };
    this.vel = { x: 0, y: 0, z: 0 };
    this.hp = 100;
    this.armor = this.maxArmor;
    this.alive = true;
    for (const id of this.loadout) {
      const w = getWeapon(id);
      this.ammo[id] = { mag: w.mag, reserve: w.reserve };
    }
  }

  /* ----------------------------------------------------------- weapon */
  private get weaponId() {
    return this.loadout[this.slotIndex] ?? this.loadout[0];
  }

  private updateWeapon(dt: number, now: number) {
    const w = getWeapon(this.weaponId);
    const ammo = this.ammo[this.weaponId] ?? { mag: 0, reserve: 0 };

    for (let i = 0; i < 3; i++) {
      if (this.input.consumePress(`slot${i + 1}` as "slot1") && this.loadout[i] && i !== this.slotIndex) {
        this.slotIndex = i;
        this.reloadUntil = 0;
        this.nextFireAt = now + 220;
        this.avatar?.setWeapon(this.loadout[i], this.cfg?.weaponTint);
        this.audio.ui();
        if (this.cfg?.mode === "online") void this.post("switch", { weaponId: this.loadout[i] });
      }
    }

    if (this.input.consumePress("reload")) this.startReload(now);
    if (this.reloadUntil && now >= this.reloadUntil) {
      const need = w.mag - ammo.mag;
      const take = Math.min(need, ammo.reserve);
      ammo.mag += take;
      ammo.reserve -= take;
      this.reloadUntil = 0;
    }

    const targetSpread = this.isAds() ? w.spreadAds : w.spreadHip;
    this.spread += (targetSpread - this.spread) * Math.min(1, dt * 6);

    const wantFire = this.input.isDown("fire") && this.alive && this.matchState === "live";
    if (wantFire && now >= this.nextFireAt && !this.reloadUntil) {
      if (w.cls !== "melee" && ammo.mag <= 0) {
        if (ammo.reserve > 0) this.startReload(now);
        else this.nextFireAt = now + 400;
      } else {
        this.fireLocal(now);
        if (!w.auto) this.input.setButton("fire", false);
      }
    }
  }

  private startReload(now: number) {
    const w = getWeapon(this.weaponId);
    const ammo = this.ammo[this.weaponId];
    if (!ammo || this.reloadUntil || ammo.mag >= w.mag || ammo.reserve <= 0) return;
    this.reloadUntil = now + w.reloadSec * 1000;
    this.audio.reload();
    if (this.cfg?.mode === "online") void this.post("reload", {});
  }

  private fireLocal(now: number) {
    const w = getWeapon(this.weaponId);
    const ammo = this.ammo[this.weaponId];
    this.nextFireAt = now + 1000 / w.rps;
    if (w.cls !== "melee") ammo.mag -= 1;
    this.firingTimer = 0;
    this.avatar?.kick();
    this.audio.shoot(w);
    this.recoilPitch = Math.min(0.35, this.recoilPitch + w.recoil * 0.02);
    this.pitch = clamp(this.pitch + w.recoil * 0.011, -1.25, 1.1);
    this.spread = Math.min(0.25, this.spread + w.recoil * 0.006);

    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const origin = this.camera.position.clone();
    const muzzle = this.avatar?.muzzleWorld ?? origin;
    this.fx.muzzle(muzzle);

    for (let p = 0; p < w.pellets; p++) {
      const dir = camDir.clone();
      if (w.pellets > 1 || this.spread > 0.0001) {
        dir.x += (Math.random() - 0.5) * this.spread * 2;
        dir.y += (Math.random() - 0.5) * this.spread * 2;
        dir.z += (Math.random() - 0.5) * this.spread * 2;
        dir.normalize();
      }
      if (this.cfg?.mode === "offline") this.resolveShotOffline(origin, dir, w.id, muzzle);
      else this.resolveShotOnline(origin, dir, muzzle);
    }
  }

  /** Offline: the client is the authority (no server involved). */
  private resolveShotOffline(origin: THREE.Vector3, dir: THREE.Vector3, weaponId: string, muzzle: THREE.Vector3) {
    const w = getWeapon(weaponId);
    const o = { x: origin.x, y: origin.y, z: origin.z };
    const d = { x: dir.x, y: dir.y, z: dir.z };
    let bestT = rayWorld(o, d, this.map.colliders, w.range);
    let victim: Bot | null = null;
    let head = false;

    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const bodyC = { x: bot.pos.x, y: bot.pos.y + 0.78, z: bot.pos.z };
      const headC = { x: bot.pos.x, y: bot.pos.y + (bot.crouch ? 1.15 : 1.5), z: bot.pos.z };
      const tH = raySphere(o, d, headC, 0.42, bestT);
      const tB = raySphere(o, d, bodyC, 0.6, bestT);
      const t = Math.min(tH, tB);
      if (t < bestT) {
        bestT = t;
        victim = bot;
        head = tH <= tB;
      }
    }

    const end = new THREE.Vector3().copy(dir).multiplyScalar(Math.min(bestT, w.range)).add(origin);
    this.fx.tracer(muzzle, end);

    if (victim) {
      let dmg = damageAtRange(w, bestT);
      if (head) dmg *= w.headMult;
      dmg = Math.round(dmg);
      this.damage += dmg;
      if (head) this.headshots++;
      this.hitMarker = 0.18;
      this.audio.hit(head);
      this.fx.impact(end, head ? 0xff5566 : 0xffd45e, head ? 8 : 5);
      this.fx.popup(new THREE.Vector3(victim.pos.x, victim.pos.y + 1.9, victim.pos.z), String(dmg), head ? "#ff6b7a" : "#ffe27a");
      const died = victim.takeDamage(dmg, this.pos);
      if (died) {
        this.kills++;
        this.audio.kill();
        this.pushKill(this.cfg!.playerName, victim.name, w.id, head);
        victim.respawnAt = performance.now() + 6000;
        victim.group.visible = true;
        if (this.kills >= (this.cfg?.scoreLimit ?? 20)) this.finishMatch();
      }
    } else {
      this.fx.impact(end, 0xd8d8d8, 3);
    }
  }

  /** Online: prediction only — the server decides the real outcome. */
  private resolveShotOnline(origin: THREE.Vector3, dir: THREE.Vector3, muzzle: THREE.Vector3) {
    const w = getWeapon(this.weaponId);
    const end = new THREE.Vector3().copy(dir).multiplyScalar(Math.min(60, w.range)).add(origin);
    this.fx.tracer(muzzle, end, 0xfff3b0);
    this.pendingShots++;
    void this.post("fire", { dir: { x: dir.x, y: dir.y, z: dir.z }, shots: 1 });
  }

  private pushKill(killer: string, victim: string, weapon: string, head: boolean) {
    this.killFeed.unshift({ killer, victim, weapon, head, at: Date.now() });
    this.killFeed = this.killFeed.slice(0, 6);
  }

  /* ----------------------------------------------------- offline sim */
  private updateOffline(dt: number, now: number) {
    const targets: Combatant[] = [
      {
        id: "player",
        name: this.cfg!.playerName,
        pos: this.pos,
        yaw: this.yaw,
        alive: this.alive,
        hp: this.hp,
        armor: this.armor,
        crouch: this.input.isDown("crouch"),
        isBot: false,
        team: 0,
      },
      ...this.bots,
    ];

    for (const bot of this.bots) {
      if (!bot.alive && now >= bot.respawnAt && this.matchState === "live") {
        bot.respawn(this.map.spawns[Math.floor(Math.random() * this.map.spawns.length)]);
      }
      if (this.matchState !== "live") {
        bot.character.update(dt, {
          speed: 0, grounded: true, crouch: false, aim: false, dead: !bot.alive,
          firing: 10, reloading: false, yaw: bot.yaw, pitch: 0,
        });
        continue;
      }
      bot.update(dt, {
        map: this.map,
        colliders: this.map.colliders,
        targets,
        time: now,
        fire: (shooter, origin, dir) => this.botFire(shooter, origin, dir),
      });
    }
  }

  private botFire(shooter: Bot, origin: Vec3, dir: Vec3) {
    const w = shooter.weapon;
    const profile = DIFFICULTIES[this.cfg!.difficulty];
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const d = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
    let bestT = rayWorld(origin, d, this.map.colliders, w.range);
    let hitPlayer = false;
    let head = false;
    let victimBot: Bot | null = null;

    if (this.alive) {
      const bodyC = { x: this.pos.x, y: this.pos.y + 0.78, z: this.pos.z };
      const headC = { x: this.pos.x, y: this.pos.y + 1.5, z: this.pos.z };
      const tH = raySphere(origin, d, headC, 0.4, bestT);
      const tB = raySphere(origin, d, bodyC, 0.58, bestT);
      const t = Math.min(tH, tB);
      if (t < bestT) {
        bestT = t;
        hitPlayer = true;
        head = tH <= tB;
      }
    }
    for (const other of this.bots) {
      if (other === shooter || !other.alive) continue;
      const bodyC = { x: other.pos.x, y: other.pos.y + 0.78, z: other.pos.z };
      const t = raySphere(origin, d, bodyC, 0.6, bestT);
      if (t < bestT) {
        bestT = t;
        hitPlayer = false;
        victimBot = other;
      }
    }

    const start = new THREE.Vector3(origin.x, origin.y, origin.z);
    const end = start.clone().add(new THREE.Vector3(d.x, d.y, d.z).multiplyScalar(Math.min(bestT, w.range)));
    const distToCam = this.camera.position.distanceTo(start);
    this.fx.tracer(start, end, 0xff9d6b);
    this.fx.muzzle(start);
    this.audio.shoot(w, distToCam);

    if (hitPlayer) {
      let dmg = damageAtRange(w, bestT) * profile.damageScale;
      if (head) dmg *= w.headMult;
      dmg = Math.round(dmg);
      this.applyDamageToSelf(dmg, shooter);
      this.fx.impact(end, 0xff5566, 4);
    } else if (victimBot) {
      const dmg = Math.round(damageAtRange(w, bestT) * profile.damageScale);
      const died = victimBot.takeDamage(dmg, shooter.pos);
      this.fx.impact(end, 0xffd45e, 3);
      if (died) {
        shooter.kills++;
        this.pushKill(shooter.name, victimBot.name, w.id, false);
        victimBot.respawnAt = performance.now() + 6000;
      }
    } else {
      this.fx.impact(end, 0xd8d8d8, 2);
    }
  }

  private applyDamageToSelf(dmg: number, from: { pos: Vec3; name: string; weaponId?: string }) {
    if (!this.alive) return;
    let rest = dmg;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, rest * 0.6);
      this.armor -= absorbed;
      rest -= absorbed;
    }
    this.hp -= rest;
    this.audio.damage();
    const ang = Math.atan2(from.pos.x - this.pos.x, from.pos.z - this.pos.z);
    this.damageDirs.push({ dir: ang - this.yaw, at: Date.now() });
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deaths++;
      this.respawnAt = performance.now() + 5000;
      this.audio.death();
      this.pushKill(from.name, this.cfg!.playerName, from.weaponId ?? "", false);
    }
  }

  /* --------------------------------------------------------- pickups */
  private updateLoot(dt: number, now: number) {
    let nearest: LootPickup | null = null;
    let nearestD = 2.4;
    for (const l of this.loot) {
      if (l.taken) continue;
      l.mesh.rotation.y += dt * 1.6;
      l.mesh.position.y = l.pos.y + 0.6 + Math.sin(now / 420 + l.id) * 0.1;
      const d = dist2D(this.pos, l.pos);
      if (d < nearestD && Math.abs(this.pos.y - l.pos.y) < 2.5) {
        nearest = l;
        nearestD = d;
      }
    }
    this.nearLoot = nearest;
    if (nearest && this.input.consumePress("interact") && this.alive) {
      this.takeLoot(nearest);
    }
  }

  private nearLoot: LootPickup | null = null;

  private takeLoot(l: LootPickup) {
    l.taken = true;
    l.mesh.visible = false;
    this.audio.pickup();
    if (l.kind === "weapon" && l.weaponId) {
      const w = getWeapon(l.weaponId);
      if (!this.loadout.includes(l.weaponId)) {
        if (this.loadout.length < 3) this.loadout.push(l.weaponId);
        else this.loadout[this.slotIndex] = l.weaponId;
        this.ammo[l.weaponId] = { mag: w.mag, reserve: w.reserve };
        this.slotIndex = this.loadout.indexOf(l.weaponId);
        this.avatar?.setWeapon(l.weaponId, this.cfg?.weaponTint);
      } else {
        this.ammo[l.weaponId].reserve += w.mag * 2;
      }
      this.callbacks.onNotice?.(`Picked up ${w.name}`);
    } else if (l.kind === "ammo") {
      const a = this.ammo[this.weaponId];
      if (a) a.reserve += l.amount;
      this.callbacks.onNotice?.(`+${l.amount} ammo`);
    } else if (l.kind === "armor") {
      this.maxArmor = Math.min(100, this.maxArmor + 10);
      this.armor = Math.min(100, this.armor + l.amount);
      this.callbacks.onNotice?.(`+${l.amount} armour`);
    } else {
      this.hp = Math.min(100, this.hp + l.amount);
      this.callbacks.onNotice?.(`+${l.amount} HP`);
    }
  }

  /* ---------------------------------------------------------- camera */
  private updateCamera(dt: number) {
    const crouch = this.input.isDown("crouch");
    const ads = this.isAds();
    const w = getWeapon(this.weaponId);
    const headY = this.pos.y + (crouch ? 1.15 : 1.55);
    const head = new THREE.Vector3(this.pos.x, headY, this.pos.z);

    const pitch = clamp(this.pitch + this.recoilPitch * 0.4, -1.25, 1.1);
    const dist = ads ? 1.9 : 3.5;
    const sideOff = ads ? 0.42 : 0.72;
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(this.yaw) * Math.cos(pitch),
    );
    const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const anchor = head.clone().addScaledVector(side, sideOff);
    let wanted = dist;
    const back = dir.clone().multiplyScalar(-1);
    const hit = rayWorld({ x: anchor.x, y: anchor.y, z: anchor.z }, { x: back.x, y: back.y, z: back.z }, this.map.colliders, dist + 0.4);
    if (hit < dist + 0.4) wanted = Math.max(0.6, hit - 0.35);

    const camPos = anchor.clone().addScaledVector(back, wanted);
    camPos.y = Math.max(0.4, camPos.y);
    this.camera.position.lerp(camPos, Math.min(1, dt * 18));
    this.camera.lookAt(anchor.clone().addScaledVector(dir, 10));

    const targetFov = this.settings.fov / (ads ? w.adsZoom : 1);
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12);
      this.camera.updateProjectionMatrix();
    }
  }

  /* ---------------------------------------------------------- online */
  private connectOnline() {
    const o = this.cfg?.online;
    if (!o) return;
    this.connection = "connecting";
    const url = `/api/mp/stream?room=${encodeURIComponent(o.roomId)}&player=${encodeURIComponent(o.playerId)}&secret=${encodeURIComponent(o.secret)}`;
    const es = new EventSource(url);
    this.es = es;
    es.onopen = () => {
      this.connection = "live";
    };
    es.onerror = () => {
      this.connection = "lost";
    };
    es.onmessage = (ev) => {
      try {
        this.onSnapshot(JSON.parse(ev.data));
      } catch (err) {
        console.warn("[eggwars] bad snapshot", err);
      }
    };
    this.netTimer = setInterval(() => void this.sendInput(), 66); // ~15 Hz
  }

  private async post(op: string, body: Record<string, unknown>) {
    const o = this.cfg?.online;
    if (!o) return null;
    try {
      const res = await fetch(`/api/mp/${op}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: o.roomId, playerId: o.playerId, secret: o.secret, ...body }),
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (json.me) this.applyPrivateState(json.me as Record<string, unknown>);
      return json;
    } catch {
      this.connection = "lost";
      return null;
    }
  }

  private async sendInput() {
    if (!this.cfg?.online) return;
    const sent = performance.now();
    this.lastPingSent = sent;
    const res = await this.post("input", {
      pos: this.pos,
      yaw: this.yaw,
      pitch: this.pitch,
      mv: Math.hypot(this.vel.x, this.vel.z) / WALK,
      crouch: this.input.isDown("crouch"),
      ads: this.isAds(),
      grounded: this.grounded,
      ping: Math.round(this.ping),
    });
    this.ping = performance.now() - this.lastPingSent;
    if (res && res.corrected) {
      const c = res.corrected as Vec3;
      const drift = Math.hypot(c.x - this.pos.x, c.y - this.pos.y, c.z - this.pos.z);
      // Server reconciliation: hard snap only on a big divergence.
      if (drift > 2.2) {
        this.pos = { ...c };
        this.vel = { x: 0, y: 0, z: 0 };
      }
    }
  }

  private applyPrivateState(me: Record<string, unknown>) {
    const hp = Number(me.hp);
    if (Number.isFinite(hp)) {
      if (hp < this.hp && this.alive) this.audio.damage();
      this.hp = hp;
    }
    this.armor = Number(me.armor) || 0;
    const alive = Boolean(me.alive);
    if (this.alive && !alive) {
      this.audio.death();
      this.deaths = Number(me.deaths) || this.deaths;
    }
    this.alive = alive;
    this.kills = Number(me.kills) || 0;
    this.deaths = Number(me.deaths) || 0;
    this.damage = Number(me.damage) || 0;
    this.headshots = Number(me.headshots) || 0;
    const wid = String(me.weaponId || this.weaponId);
    if (!this.ammo[wid]) this.ammo[wid] = { mag: 0, reserve: 0 };
    this.ammo[wid].mag = Number(me.mag) || 0;
    this.ammo[wid].reserve = Number(me.reserve) || 0;
    if (me.reloading) this.reloadUntil = performance.now() + Number(me.reloadMs || 0);
    const respawnIn = Number(me.respawnIn) || 0;
    if (!alive) this.respawnAt = performance.now() + respawnIn * 1000;
  }

  private onSnapshot(snap: {
    state: "lobby" | "countdown" | "live" | "ended";
    timeLeft: number;
    players: Record<string, number | string>[];
    events: Record<string, unknown>[];
    killFeed: KillFeedEntry[];
  }) {
    this.connection = "live";
    this.serverState = snap.state;
    this.serverTimeLeft = snap.timeLeft;
    if (snap.state === "live" && this.matchState !== "live") this.matchState = "live";
    if (snap.state === "ended" && this.matchState !== "ended") {
      this.matchState = "ended";
      this.finishMatch();
    }
    this.killFeed = (snap.killFeed || []).map((k) => ({ ...k }));

    const seen = new Set<string>();
    const myId = this.cfg?.online?.playerId;
    for (const p of snap.players) {
      const id = String(p.id);
      seen.add(id);
      if (id === myId) {
        // authoritative position check handled in sendInput()
        continue;
      }
      let r = this.remote.get(id);
      if (!r) {
        const visual: OutfitVisual = {
          body: 0xfdf6e3,
          accent: [0xd93f3f, 0x4f8cff, 0x3faf63, 0xf5c04a, 0xa855f7][this.remote.size % 5],
          hat: ["cap", "helmet", "bandana", "visor", "none"][this.remote.size % 5] as OutfitVisual["hat"],
          face: "angry",
          extra: "backpack",
          pattern: "none",
        };
        const character = new EggCharacter(visual, String(p.w || "cluck9"));
        const group = new THREE.Group();
        group.add(character.group);
        const tag = nameTagSprite(String(p.n), "#ffd166");
        tag.position.y = 2.1;
        group.add(tag);
        this.scene.add(group);
        r = {
          id,
          name: String(p.n),
          character,
          group,
          target: new THREE.Vector3(Number(p.x), Number(p.y), Number(p.z)),
          prev: new THREE.Vector3(Number(p.x), Number(p.y), Number(p.z)),
          yaw: Number(p.yaw),
          targetYaw: Number(p.yaw),
          alive: Number(p.al) === 1,
          kills: Number(p.k),
          deaths: Number(p.d),
          hp: Number(p.hp),
          mv: Number(p.mv),
          crouch: Number(p.cr) === 1,
          ads: Number(p.ad) === 1,
          ping: Number(p.ping),
          lastUpdate: performance.now(),
        };
        this.remote.set(id, r);
      }
      r.prev.copy(r.group.position);
      r.target.set(Number(p.x), Number(p.y), Number(p.z));
      r.targetYaw = Number(p.yaw);
      r.alive = Number(p.al) === 1;
      r.kills = Number(p.k);
      r.deaths = Number(p.d);
      r.hp = Number(p.hp);
      r.mv = Number(p.mv);
      r.crouch = Number(p.cr) === 1;
      r.ads = Number(p.ad) === 1;
      r.ping = Number(p.ping);
      r.lastUpdate = performance.now();
      r.character.setWeaponIfChanged(String(p.w));
    }
    for (const [id, r] of this.remote) {
      if (!seen.has(id)) {
        r.character.dispose();
        r.group.removeFromParent();
        this.remote.delete(id);
      }
    }

    for (const raw of snap.events || []) {
      const e = raw as { t: string } & Record<string, number | string | boolean>;
      if (e.t === "shot" && e.by !== myId) {
        const from = new THREE.Vector3(Number(e.ox), Number(e.oy), Number(e.oz));
        const dir = new THREE.Vector3(Number(e.dx), Number(e.dy), Number(e.dz));
        const w = getWeapon(String(e.w));
        const to = from.clone().addScaledVector(dir, Math.min(w.range, 50));
        this.fx.tracer(from, to, 0xffc46b);
        this.fx.muzzle(from);
        this.audio.shoot(w, this.camera.position.distanceTo(from));
      } else if (e.t === "hit" && e.by === myId) {
        this.hitMarker = 0.18;
        this.audio.hit(Boolean(e.head));
        if (e.head) this.headshots++;
      } else if (e.t === "damaged" && e.on === myId) {
        const ang = Math.atan2(-Number(e.dirX), -Number(e.dirZ));
        this.damageDirs.push({ dir: ang - this.yaw, at: Date.now() });
      } else if (e.t === "kill") {
        if (e.killer === myId) this.audio.kill();
      } else if (e.t === "chat") {
        this.chatLog.push({ name: String(e.name), msg: String(e.msg), at: Date.now() });
        this.chatLog = this.chatLog.slice(-8);
      }
    }
  }

  private updateRemote(dt: number) {
    for (const r of this.remote.values()) {
      r.group.position.lerp(r.target, Math.min(1, dt * 12));
      const delta = Math.atan2(Math.sin(r.targetYaw - r.yaw), Math.cos(r.targetYaw - r.yaw));
      r.yaw += delta * Math.min(1, dt * 12);
      r.group.rotation.y = r.yaw;
      r.group.visible = true;
      r.character.update(dt, {
        speed: r.mv,
        grounded: true,
        crouch: r.crouch,
        aim: r.ads,
        dead: !r.alive,
        firing: 10,
        reloading: false,
        yaw: r.yaw,
        pitch: 0,
      });
    }
  }

  sendChat(message: string) {
    if (this.cfg?.mode === "online") void this.post("chat", { message });
    else {
      this.chatLog.push({ name: this.cfg?.playerName ?? "You", msg: message, at: Date.now() });
      this.chatLog = this.chatLog.slice(-8);
    }
  }

  /* ------------------------------------------------------------- HUD */
  private hudState(): HudState {
    const w = getWeapon(this.weaponId);
    const ammo = this.ammo[this.weaponId] ?? { mag: 0, reserve: 0 };
    const now = performance.now();
    const scoreboard =
      this.cfg?.mode === "offline"
        ? [
            { name: this.cfg.playerName, kills: this.kills, deaths: this.deaths, isSelf: true },
            ...this.bots.map((b) => ({ name: b.name, kills: b.kills, deaths: b.deaths, isSelf: false })),
          ].sort((a, b) => b.kills - a.kills)
        : [
            { name: this.cfg?.playerName ?? "You", kills: this.kills, deaths: this.deaths, isSelf: true, ping: Math.round(this.ping) },
            ...[...this.remote.values()].map((r) => ({
              name: r.name,
              kills: r.kills,
              deaths: r.deaths,
              isSelf: false,
              ping: r.ping,
            })),
          ].sort((a, b) => b.kills - a.kills);

    const eye = { x: this.pos.x, y: this.pos.y + 1.5, z: this.pos.z };
    const blips: { x: number; z: number; enemy: boolean }[] = [];
    if (this.cfg?.mode === "offline") {
      for (const b of this.bots) {
        if (!b.alive) continue;
        const d = dist2D(this.pos, b.pos);
        if (d > 48) continue;
        if (!hasLineOfSight(eye, { x: b.pos.x, y: b.pos.y + 1.2, z: b.pos.z }, this.map.colliders)) continue;
        blips.push({ x: b.pos.x, z: b.pos.z, enemy: true });
      }
    } else {
      for (const r of this.remote.values()) {
        if (!r.alive) continue;
        const p = { x: r.group.position.x, y: r.group.position.y, z: r.group.position.z };
        const d = dist2D(this.pos, p);
        if (d > 48) continue;
        if (!hasLineOfSight(eye, { x: p.x, y: p.y + 1.2, z: p.z }, this.map.colliders)) continue;
        blips.push({ x: p.x, z: p.z, enemy: true });
      }
    }

    const timeLeft =
      this.cfg?.mode === "online" ? this.serverTimeLeft : Math.max(0, Math.round((this.matchEndsAt - now) / 1000));

    return {
      ready: true,
      mode: this.cfg?.mode ?? "offline",
      matchState: this.matchState,
      countdown: Math.max(0, Math.ceil(this.countdown)),
      timeLeft,
      hp: Math.round(this.hp),
      maxHp: 100,
      armor: Math.round(this.armor),
      alive: this.alive,
      respawnIn: this.alive ? 0 : Math.max(0, Math.ceil((this.respawnAt - now) / 1000)),
      weaponName: w.name,
      weaponEmoji: w.emoji,
      mag: ammo.mag,
      reserve: ammo.reserve,
      reloading: this.reloadUntil > now,
      reloadPct: this.reloadUntil > now ? 1 - (this.reloadUntil - now) / (w.reloadSec * 1000) : 0,
      slots: this.loadout.map((id, i) => {
        const def = getWeapon(id);
        return { id, name: def.name, emoji: def.emoji, active: i === this.slotIndex, mag: this.ammo[id]?.mag ?? 0 };
      }),
      kills: this.kills,
      deaths: this.deaths,
      damage: Math.round(this.damage),
      headshots: this.headshots,
      crosshair: this.spread,
      ads: this.isAds(),
      sprinting: this.input.isDown("sprint"),
      crouching: this.input.isDown("crouch"),
      hitMarker: this.hitMarker,
      damageDirs: this.damageDirs,
      killFeed: this.killFeed,
      scoreboard,
      interact: this.nearLoot ? this.nearLoot.label : null,
      minimap: {
        self: { x: this.pos.x, z: this.pos.z, yaw: this.yaw },
        blips,
        half: this.map.theme.half,
      },
      alivePlayers:
        this.cfg?.mode === "offline"
          ? this.bots.filter((b) => b.alive).length + (this.alive ? 1 : 0)
          : [...this.remote.values()].filter((r) => r.alive).length + (this.alive ? 1 : 0),
      connection: this.connection,
      chat: this.chatLog,
      fps: this.fps,
    };
  }

  /* --------------------------------------------------------- control */
  setPaused(p: boolean) {
    this.paused = p;
    if (p) this.input.exitPointerLock();
  }

  requestLock() {
    this.audio.resume();
    this.input.requestPointerLock();
  }

  private finishMatch() {
    if (this.matchState === "ended" && this.startedAt === 0) return;
    this.matchState = "ended";
    const board =
      this.cfg?.mode === "offline"
        ? [
            { name: this.cfg.playerName, kills: this.kills, deaths: this.deaths, isSelf: true },
            ...this.bots.map((b) => ({ name: b.name, kills: b.kills, deaths: b.deaths, isSelf: false })),
          ].sort((a, b) => b.kills - a.kills)
        : [
            { name: this.cfg?.playerName ?? "You", kills: this.kills, deaths: this.deaths, isSelf: true },
            ...[...this.remote.values()].map((r) => ({ name: r.name, kills: r.kills, deaths: r.deaths, isSelf: false })),
          ].sort((a, b) => b.kills - a.kills);
    const placement = Math.max(1, board.findIndex((b) => b.isSelf) + 1);
    const summary: MatchResultSummary = {
      kills: this.kills,
      deaths: this.deaths,
      headshots: this.headshots,
      damage: Math.round(this.damage),
      placement,
      won: placement === 1,
      durationSec: Math.round((performance.now() - this.startedAt) / 1000),
      mapId: this.cfg?.mapId ?? "island",
      difficulty: this.cfg?.difficulty ?? "medium",
      mode: this.cfg?.mode ?? "offline",
      scoreboard: board,
    };
    this.startedAt = 0;
    this.input.exitPointerLock();
    this.audio.stopMusic();
    this.callbacks.onEnd(summary);
  }

  private handleResize() {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || window.innerWidth;
    const h = parent?.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  private cleanupMatch() {
    for (const b of this.bots) b.dispose();
    this.bots = [];
    for (const r of this.remote.values()) {
      r.character.dispose();
      r.group.removeFromParent();
    }
    this.remote.clear();
    for (const l of this.loot) {
      (l.mesh as THREE.Mesh).geometry?.dispose();
      ((l.mesh as THREE.Mesh).material as THREE.Material)?.dispose();
      l.mesh.removeFromParent();
    }
    this.loot = [];
    this.avatar?.dispose();
    this.avatar = null;
    this.world?.dispose();
    this.world = null;
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    if (this.netTimer) {
      clearInterval(this.netTimer);
      this.netTimer = null;
    }
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.cfg?.mode === "online" && this.cfg.online) void this.post("leave", {});
    this.cleanupMatch();
    this.audio.stopMusic();
    this.input.exitPointerLock();
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.fx.dispose();
    this.input.dispose();
    this.audio.dispose();
    this.resizeObs?.disconnect();
    this.renderer.dispose();
  }
}
