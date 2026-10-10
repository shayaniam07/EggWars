/**
 * EGG WARS - Weapon balance table (single source of truth).
 * The HUD, the offline simulation, the bots and the authoritative multiplayer
 * server all read these numbers; nothing is hard-coded anywhere else.
 */

export type WeaponClass = "ar" | "smg" | "shotgun" | "sniper" | "pistol" | "melee" | "throwable";

export type WeaponDef = {
  id: string;
  name: string;
  cls: WeaponClass;
  /** damage per bullet/pellet at point blank */
  damage: number;
  headMult: number;
  /** rounds per second */
  rps: number;
  mag: number;
  reserve: number;
  reloadSec: number;
  /** metres before damage starts falling off, and hard max range */
  falloff: number;
  range: number;
  /** radians of cone, hip-fire and aimed */
  spreadHip: number;
  spreadAds: number;
  recoil: number;
  pellets: number;
  auto: boolean;
  adsZoom: number;
  /** 0 = hitscan, >0 = projectile speed (m/s) */
  projectile: number;
  emoji: string;
  /** procedural model dimensions (metres) + colours */
  model: { len: number; h: number; w: number; color: number; accent: number; stock: boolean; scope: boolean };
  sfx: { freq: number; type: OscillatorType; dur: number; noise: number };
};

const W = (w: WeaponDef) => w;

export const WEAPONS: Record<string, WeaponDef> = {
  yolk_ar: W({
    id: "yolk_ar",
    name: "Yolk-47",
    cls: "ar",
    damage: 24,
    headMult: 2,
    rps: 9,
    mag: 30,
    reserve: 150,
    reloadSec: 2.0,
    falloff: 45,
    range: 140,
    spreadHip: 0.045,
    spreadAds: 0.012,
    recoil: 0.9,
    pellets: 1,
    auto: true,
    adsZoom: 1.45,
    projectile: 0,
    emoji: "🔫",
    model: { len: 1.05, h: 0.17, w: 0.09, color: 0x3a3f46, accent: 0x8a5a2b, stock: true, scope: false },
    sfx: { freq: 220, type: "square", dur: 0.09, noise: 0.5 },
  }),
  shellstorm: W({
    id: "shellstorm",
    name: "Shellstorm SMG",
    cls: "smg",
    damage: 16,
    headMult: 1.7,
    rps: 14,
    mag: 35,
    reserve: 175,
    reloadSec: 1.6,
    falloff: 24,
    range: 90,
    spreadHip: 0.055,
    spreadAds: 0.022,
    recoil: 0.6,
    pellets: 1,
    auto: true,
    adsZoom: 1.3,
    projectile: 0,
    emoji: "🔫",
    model: { len: 0.72, h: 0.16, w: 0.08, color: 0x2b2f36, accent: 0xd0d4da, stock: false, scope: false },
    sfx: { freq: 300, type: "square", dur: 0.06, noise: 0.45 },
  }),
  scrambler: W({
    id: "scrambler",
    name: "Scrambler 12",
    cls: "shotgun",
    damage: 13,
    headMult: 1.4,
    rps: 1.25,
    mag: 6,
    reserve: 36,
    reloadSec: 2.6,
    falloff: 12,
    range: 42,
    spreadHip: 0.12,
    spreadAds: 0.075,
    recoil: 2.4,
    pellets: 8,
    auto: false,
    adsZoom: 1.15,
    projectile: 0,
    emoji: "💥",
    model: { len: 1.0, h: 0.2, w: 0.1, color: 0x4a2f22, accent: 0x9aa0a8, stock: true, scope: false },
    sfx: { freq: 120, type: "sawtooth", dur: 0.22, noise: 0.9 },
  }),
  eggsniper: W({
    id: "eggsniper",
    name: "Shell Piercer",
    cls: "sniper",
    damage: 92,
    headMult: 2.2,
    rps: 0.85,
    mag: 5,
    reserve: 30,
    reloadSec: 3.0,
    falloff: 150,
    range: 300,
    spreadHip: 0.09,
    spreadAds: 0.0012,
    recoil: 3.2,
    pellets: 1,
    auto: false,
    adsZoom: 3.4,
    projectile: 0,
    emoji: "🎯",
    model: { len: 1.5, h: 0.17, w: 0.08, color: 0x273040, accent: 0x5f6b7a, stock: true, scope: true },
    sfx: { freq: 90, type: "sawtooth", dur: 0.3, noise: 0.7 },
  }),
  cluck9: W({
    id: "cluck9",
    name: "Cluck-9",
    cls: "pistol",
    damage: 21,
    headMult: 2,
    rps: 5.5,
    mag: 12,
    reserve: 72,
    reloadSec: 1.3,
    falloff: 22,
    range: 80,
    spreadHip: 0.035,
    spreadAds: 0.009,
    recoil: 0.8,
    pellets: 1,
    auto: false,
    adsZoom: 1.25,
    projectile: 0,
    emoji: "🔫",
    model: { len: 0.4, h: 0.15, w: 0.06, color: 0x30343c, accent: 0xb9bec6, stock: false, scope: false },
    sfx: { freq: 260, type: "square", dur: 0.08, noise: 0.4 },
  }),
  whisk: W({
    id: "whisk",
    name: "Battle Whisk",
    cls: "melee",
    damage: 55,
    headMult: 1.5,
    rps: 1.8,
    mag: 1,
    reserve: 0,
    reloadSec: 0,
    falloff: 3,
    range: 3.2,
    spreadHip: 0,
    spreadAds: 0,
    recoil: 0.2,
    pellets: 1,
    auto: false,
    adsZoom: 1,
    projectile: 0,
    emoji: "🥄",
    model: { len: 0.55, h: 0.1, w: 0.1, color: 0xc0c6ce, accent: 0x6b4a2a, stock: false, scope: false },
    sfx: { freq: 420, type: "triangle", dur: 0.12, noise: 0.2 },
  }),
  yolk_nade: W({
    id: "yolk_nade",
    name: "Yolk Grenade",
    cls: "throwable",
    damage: 95,
    headMult: 1,
    rps: 0.8,
    mag: 1,
    reserve: 3,
    reloadSec: 0.9,
    falloff: 7,
    range: 48,
    spreadHip: 0.01,
    spreadAds: 0.005,
    recoil: 0.3,
    pellets: 1,
    auto: false,
    adsZoom: 1,
    projectile: 22,
    emoji: "🧨",
    model: { len: 0.22, h: 0.22, w: 0.22, color: 0x4e6b36, accent: 0xd8c25a, stock: false, scope: false },
    sfx: { freq: 70, type: "sawtooth", dur: 0.5, noise: 1 },
  }),
};

export const WEAPON_IDS = Object.keys(WEAPONS);

export function getWeapon(id: string): WeaponDef {
  return WEAPONS[id] ?? WEAPONS.cluck9;
}

/** Damage after range falloff (min 45% at max range). */
export function damageAtRange(w: WeaponDef, dist: number) {
  if (dist <= w.falloff) return w.damage;
  const t = Math.min(1, (dist - w.falloff) / Math.max(1, w.range - w.falloff));
  return w.damage * (1 - 0.55 * t);
}

export type Difficulty = "very_easy" | "medium" | "hard";

export type DifficultyProfile = {
  id: Difficulty;
  label: string;
  color: string;
  botCount: number;
  botHealth: number;
  /** radians of random aim error added to every shot */
  aimError: number;
  /** seconds before the bot reacts to a newly spotted target */
  reaction: number;
  /** how fast the bot turns toward its target (rad/s) */
  turnRate: number;
  viewRange: number;
  fov: number;
  moveScale: number;
  /** probability per decision tick to reposition to cover */
  coverBias: number;
  burstMin: number;
  burstMax: number;
  /** seconds of pause between bursts */
  burstPause: number;
  /** multiplier applied to damage the bot deals */
  damageScale: number;
  /** chance to strafe while engaging */
  strafe: number;
  weapons: string[];
  rewardMult: number;
};

export const DIFFICULTIES: Record<Difficulty, DifficultyProfile> = {
  very_easy: {
    id: "very_easy",
    label: "Very Easy",
    color: "#22c55e",
    botCount: 5,
    botHealth: 70,
    aimError: 0.14,
    reaction: 1.15,
    turnRate: 1.6,
    viewRange: 42,
    fov: Math.PI * 0.52,
    moveScale: 0.68,
    coverBias: 0.1,
    burstMin: 2,
    burstMax: 4,
    burstPause: 1.5,
    damageScale: 0.55,
    strafe: 0.15,
    weapons: ["cluck9", "shellstorm"],
    rewardMult: 0.7,
  },
  medium: {
    id: "medium",
    label: "Medium",
    color: "#f59e0b",
    botCount: 8,
    botHealth: 100,
    aimError: 0.055,
    reaction: 0.55,
    turnRate: 3.2,
    viewRange: 62,
    fov: Math.PI * 0.72,
    moveScale: 0.92,
    coverBias: 0.4,
    burstMin: 4,
    burstMax: 7,
    burstPause: 0.85,
    damageScale: 0.85,
    strafe: 0.45,
    weapons: ["yolk_ar", "shellstorm", "scrambler", "cluck9"],
    rewardMult: 1,
  },
  hard: {
    id: "hard",
    label: "Hard",
    color: "#ef4444",
    botCount: 11,
    botHealth: 120,
    aimError: 0.018,
    reaction: 0.22,
    turnRate: 6.5,
    viewRange: 85,
    fov: Math.PI * 0.95,
    moveScale: 1.12,
    coverBias: 0.72,
    burstMin: 6,
    burstMax: 11,
    burstPause: 0.4,
    damageScale: 1,
    strafe: 0.8,
    weapons: ["yolk_ar", "eggsniper", "scrambler", "shellstorm"],
    rewardMult: 1.45,
  },
};
