/**
 * EGG WARS - Offline NPC opponents.
 *
 * Difficulty changes *behaviour*, not just a label:
 *   aim error, reaction delay, turn rate, view range/FOV, movement speed,
 *   cover usage, burst length/pause, strafing and weapon selection all come
 *   from DIFFICULTIES in shared/weapons.ts.
 *
 * NPCs only perceive targets inside their view cone with a clear line of sight
 * (no wall-hacking), and must physically navigate the arena to reach them.
 */
import * as THREE from "three";
import { EggCharacter, nameTagSprite } from "./egg";
import type { OutfitVisual } from "@/shared/catalog";
import { type Box, type Vec3, angleDelta, dist2D, hasLineOfSight, resolveCharacter } from "@/shared/physics";
import { type DifficultyProfile, getWeapon } from "@/shared/weapons";
import type { GeneratedMap } from "@/shared/maps";

export type Combatant = {
  id: string;
  name: string;
  pos: Vec3;
  yaw: number;
  alive: boolean;
  hp: number;
  armor: number;
  crouch: boolean;
  isBot: boolean;
  team: number;
};

export type BotContext = {
  map: GeneratedMap;
  colliders: Box[];
  targets: Combatant[];
  fire: (shooter: Bot, origin: Vec3, dir: Vec3) => void;
  time: number;
};

const BOT_NAMES = [
  "Yolkster", "Sunny", "Benedict", "Shelly", "Scramble", "Poach", "Omelette", "Hatchet",
  "Albumen", "Fryer", "Coddle", "Quiche", "Meringue", "Souffle", "Custard", "Deviled",
];

type AIState = "patrol" | "engage" | "cover" | "hunt";

export class Bot implements Combatant {
  id: string;
  name: string;
  pos: Vec3;
  vel: Vec3 = { x: 0, y: 0, z: 0 };
  yaw = 0;
  pitch = 0;
  hp: number;
  maxHp: number;
  armor = 0;
  alive = true;
  crouch = false;
  isBot = true as const;
  team: number;
  kills = 0;
  deaths = 0;
  weaponId: string;
  mag: number;
  reserve: number;
  character: EggCharacter;
  group = new THREE.Group();
  respawnAt = 0;

  private profile: DifficultyProfile;
  private state: AIState = "patrol";
  private target: Combatant | null = null;
  private reactionLeft = 0;
  private burstLeft = 0;
  private burstCooldown = 0;
  private nextShotAt = 0;
  private reloadUntil = 0;
  private waypoint: Vec3;
  private repathAt = 0;
  private strafeDir = 1;
  private strafeSwapAt = 0;
  private lastKnown: Vec3 | null = null;
  private avoidTimer = 0;
  private stuckTimer = 0;
  private lastPos: Vec3;
  private firingTimer = 0;

  constructor(
    index: number,
    spawn: Vec3,
    profile: DifficultyProfile,
    visual: OutfitVisual,
    team = 0,
  ) {
    this.id = `bot_${index}`;
    this.name = `${BOT_NAMES[index % BOT_NAMES.length]}${index > 15 ? index : ""}`;
    this.profile = profile;
    this.team = team;
    this.pos = { ...spawn };
    this.lastPos = { ...spawn };
    this.maxHp = profile.botHealth;
    this.hp = profile.botHealth;
    this.armor = profile.id === "hard" ? 40 : profile.id === "medium" ? 20 : 0;
    this.weaponId = profile.weapons[index % profile.weapons.length];
    const w = getWeapon(this.weaponId);
    this.mag = w.mag;
    this.reserve = w.reserve;
    this.waypoint = { ...spawn };

    this.character = new EggCharacter(visual, this.weaponId);
    this.group.add(this.character.group);
    const tag = nameTagSprite(this.name, profile.color);
    tag.position.y = 2.1;
    this.group.add(tag);
    this.group.position.set(spawn.x, spawn.y, spawn.z);
  }

  get weapon() {
    return getWeapon(this.weaponId);
  }

  respawn(spawn: Vec3) {
    this.pos = { ...spawn };
    this.vel = { x: 0, y: 0, z: 0 };
    this.hp = this.maxHp;
    this.alive = true;
    this.target = null;
    this.state = "patrol";
    const w = this.weapon;
    this.mag = w.mag;
    this.reserve = w.reserve;
    this.group.visible = true;
  }

  takeDamage(amount: number, fromPos: Vec3): boolean {
    if (!this.alive) return false;
    let rest = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, rest * 0.6);
      this.armor -= absorbed;
      rest -= absorbed;
    }
    this.hp -= rest;
    this.lastKnown = { ...fromPos };
    if (this.state === "patrol") this.state = "hunt";
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deaths++;
      return true;
    }
    return false;
  }

  update(dt: number, ctx: BotContext) {
    if (!this.alive) {
      this.character.update(dt, {
        speed: 0, grounded: true, crouch: false, aim: false, dead: true,
        firing: 1, reloading: false, yaw: this.yaw, pitch: 0,
      });
      return;
    }

    const p = this.profile;
    this.reactionLeft = Math.max(0, this.reactionLeft - dt);
    this.burstCooldown = Math.max(0, this.burstCooldown - dt);
    this.firingTimer += dt;

    /* ---------------------------- perception ---------------------------- */
    const eye = { x: this.pos.x, y: this.pos.y + 1.45, z: this.pos.z };
    let best: Combatant | null = null;
    let bestDist = Infinity;
    for (const t of ctx.targets) {
      if (!t.alive || t.id === this.id) continue;
      if (this.team !== 0 && t.team === this.team) continue;
      const d = dist2D(this.pos, t.pos);
      if (d > p.viewRange || d > bestDist) continue;
      const toward = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      if (Math.abs(angleDelta(this.yaw, toward)) > p.fov / 2) continue;
      const head = { x: t.pos.x, y: t.pos.y + 1.2, z: t.pos.z };
      if (!hasLineOfSight(eye, head, ctx.colliders)) continue;
      best = t;
      bestDist = d;
    }

    if (best && best !== this.target) {
      this.target = best;
      this.reactionLeft = p.reaction * (0.7 + Math.random() * 0.6);
      this.state = "engage";
    } else if (!best) {
      if (this.target) this.lastKnown = { ...this.target.pos };
      this.target = null;
      if (this.state === "engage" || this.state === "cover") this.state = this.lastKnown ? "hunt" : "patrol";
    }

    /* ------------------------------ reload ------------------------------ */
    const w = this.weapon;
    if (this.reloadUntil > ctx.time) {
      // keep moving while reloading
    } else if (this.mag <= 0) {
      if (this.reserve > 0) {
        this.reloadUntil = ctx.time + w.reloadSec * 1000;
        const take = Math.min(w.mag, this.reserve);
        window.setTimeout(() => {
          this.mag = take;
          this.reserve = Math.max(0, this.reserve - take);
        }, w.reloadSec * 1000);
      } else {
        // out of ammo entirely -> scavenge from the nearest loot point
        this.reserve = w.reserve;
        this.mag = w.mag;
      }
    }

    /* --------------------------- desired move --------------------------- */
    let desired: Vec3 = this.waypoint;
    let wantFire = false;

    if (this.state === "engage" && this.target) {
      const d = bestDist;
      const ideal = w.cls === "sniper" ? 34 : w.cls === "shotgun" ? 6 : 16;
      const toTarget = Math.atan2(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z);
      this.yaw += angleDelta(this.yaw, toTarget) * Math.min(1, p.turnRate * dt);
      this.pitch = Math.atan2(this.target.pos.y + 1.2 - (this.pos.y + 1.45), Math.max(0.5, d)) * -1;

      if (ctx.time > this.strafeSwapAt) {
        this.strafeSwapAt = ctx.time + 700 + Math.random() * 1400;
        this.strafeDir *= -1;
        if (Math.random() < p.coverBias * 0.5) this.state = "cover";
      }

      const away = d < ideal * 0.75 ? -1 : d > ideal * 1.3 ? 1 : 0;
      const side = Math.random() < p.strafe ? this.strafeDir : 0;
      desired = {
        x: this.pos.x + Math.sin(toTarget) * away * 6 + Math.cos(toTarget) * side * 6,
        y: 0,
        z: this.pos.z + Math.cos(toTarget) * away * 6 - Math.sin(toTarget) * side * 6,
      };

      wantFire = this.reactionLeft <= 0 && this.reloadUntil <= ctx.time && this.mag > 0 && d < w.range;
      this.crouch = p.id === "hard" && w.cls === "sniper" && d > 25;
    } else if (this.state === "cover" && this.target) {
      const spot = this.findCover(ctx, this.target.pos);
      desired = spot ?? this.pos;
      if (!spot || dist2D(this.pos, spot) < 1.6) this.state = "engage";
      const toTarget = Math.atan2(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z);
      this.yaw += angleDelta(this.yaw, toTarget) * Math.min(1, p.turnRate * dt * 0.6);
    } else if (this.state === "hunt" && this.lastKnown) {
      desired = this.lastKnown;
      const toward = Math.atan2(desired.x - this.pos.x, desired.z - this.pos.z);
      this.yaw += angleDelta(this.yaw, toward) * Math.min(1, p.turnRate * dt * 0.8);
      if (dist2D(this.pos, this.lastKnown) < 2.5) {
        this.lastKnown = null;
        this.state = "patrol";
      }
    } else {
      if (ctx.time > this.repathAt || dist2D(this.pos, this.waypoint) < 2.5) {
        this.waypoint = this.pickWaypoint(ctx);
        this.repathAt = ctx.time + 6000 + Math.random() * 4000;
      }
      desired = this.waypoint;
      const toward = Math.atan2(desired.x - this.pos.x, desired.z - this.pos.z);
      this.yaw += angleDelta(this.yaw, toward) * Math.min(1, 2.6 * dt);
      this.crouch = false;
    }

    /* ----------------------- steering + avoidance ----------------------- */
    let dirX = desired.x - this.pos.x;
    let dirZ = desired.z - this.pos.z;
    const len = Math.hypot(dirX, dirZ) || 1;
    dirX /= len;
    dirZ /= len;

    const probe = { x: this.pos.x + dirX * 1.9, y: this.pos.y + 0.9, z: this.pos.z + dirZ * 1.9 };
    if (!hasLineOfSight({ x: this.pos.x, y: this.pos.y + 0.9, z: this.pos.z }, probe, ctx.colliders)) {
      this.avoidTimer = 0.6;
    }
    if (this.avoidTimer > 0) {
      this.avoidTimer -= dt;
      const nx = -dirZ * this.strafeDir;
      const nz = dirX * this.strafeDir;
      dirX = nx;
      dirZ = nz;
    }

    const speed = (this.crouch ? 2.2 : 5.6) * p.moveScale;
    this.vel.x = dirX * speed;
    this.vel.z = dirZ * speed;
    this.vel.y -= 26 * dt;

    const res = resolveCharacter(this.pos, this.vel, 0.45, 1.65, ctx.colliders, dt);
    this.pos = res.pos;
    this.vel = res.vel;
    const half = ctx.map.theme.half - 1.5;
    this.pos.x = Math.max(-half, Math.min(half, this.pos.x));
    this.pos.z = Math.max(-half, Math.min(half, this.pos.z));

    // anti-stuck: if barely moving while trying to move, repath
    const moved = dist2D(this.pos, this.lastPos);
    this.stuckTimer = moved < 0.04 ? this.stuckTimer + dt : 0;
    if (this.stuckTimer > 1.1) {
      this.waypoint = this.pickWaypoint(ctx);
      this.strafeDir *= -1;
      this.avoidTimer = 0.5;
      this.stuckTimer = 0;
      if (res.grounded) this.vel.y = 7;
    }
    this.lastPos = { ...this.pos };

    /* ------------------------------- firing ----------------------------- */
    if (wantFire && this.target) {
      if (this.burstLeft <= 0 && this.burstCooldown <= 0) {
        this.burstLeft = Math.round(p.burstMin + Math.random() * (p.burstMax - p.burstMin));
      }
      if (this.burstLeft > 0 && ctx.time >= this.nextShotAt) {
        this.nextShotAt = ctx.time + 1000 / w.rps;
        this.burstLeft--;
        this.mag--;
        this.firingTimer = 0;
        if (this.burstLeft <= 0) this.burstCooldown = p.burstPause * (0.7 + Math.random() * 0.6);

        const origin = { x: this.pos.x, y: this.pos.y + 1.45, z: this.pos.z };
        const t = this.target;
        const aimAt = { x: t.pos.x, y: t.pos.y + (t.crouch ? 0.8 : 1.05), z: t.pos.z };
        const dx = aimAt.x - origin.x;
        const dy = aimAt.y - origin.y;
        const dz = aimAt.z - origin.z;
        const l = Math.hypot(dx, dy, dz) || 1;
        const err = p.aimError;
        const dir = {
          x: dx / l + (Math.random() - 0.5) * err * 2,
          y: dy / l + (Math.random() - 0.5) * err,
          z: dz / l + (Math.random() - 0.5) * err * 2,
        };
        ctx.fire(this, origin, dir);
        this.character.kick();
      }
    }

    /* ----------------------------- transform ---------------------------- */
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = this.yaw;
    this.character.update(dt, {
      speed: Math.hypot(this.vel.x, this.vel.z) / 5.6,
      grounded: res.grounded,
      crouch: this.crouch,
      aim: this.state === "engage",
      dead: false,
      firing: this.firingTimer,
      reloading: this.reloadUntil > ctx.time,
      yaw: this.yaw,
      pitch: this.pitch,
    });
  }

  /** Pick a spot behind geometry that breaks line of sight to the threat. */
  private findCover(ctx: BotContext, threat: Vec3): Vec3 | null {
    let best: Vec3 | null = null;
    let bestScore = Infinity;
    for (const b of ctx.colliders) {
      if (b.hy < 0.7) continue;
      const d = dist2D(this.pos, { x: b.cx, y: 0, z: b.cz });
      if (d > 26) continue;
      const away = Math.atan2(b.cx - threat.x, b.cz - threat.z);
      const spot = {
        x: b.cx + Math.sin(away) * (Math.max(b.hx, b.hz) + 1.1),
        y: 0,
        z: b.cz + Math.cos(away) * (Math.max(b.hx, b.hz) + 1.1),
      };
      const eye = { x: spot.x, y: 1.4, z: spot.z };
      if (hasLineOfSight(eye, { x: threat.x, y: threat.y + 1.2, z: threat.z }, ctx.colliders)) continue;
      const score = dist2D(this.pos, spot);
      if (score < bestScore) {
        bestScore = score;
        best = spot;
      }
    }
    return best;
  }

  private pickWaypoint(ctx: BotContext): Vec3 {
    const pool = ctx.map.loot.length ? ctx.map.loot : ctx.map.spawns;
    const candidate = pool[Math.floor(Math.random() * pool.length)];
    return { x: candidate.x, y: 0, z: candidate.z };
  }

  dispose() {
    this.character.dispose();
    this.group.removeFromParent();
  }
}
