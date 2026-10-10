/**
 * EGG WARS - Central item catalog.
 *
 * Every shop entry, inventory slot, world pickup, admin-panel row and in-match
 * cosmetic resolves through this one definition shape. Admin-created items are
 * stored in Postgres using the exact same shape, so new content flows into the
 * game without touching code.
 */

export const GAME_NAME = process.env.NEXT_PUBLIC_GAME_NAME || "EGG WARS";
export const GAME_TAGLINE = "Free Fire × Shell Shockers — Shoot · Survive · Win";

export type ItemCategory =
  | "weapon"
  | "outfit"
  | "helmet"
  | "vest"
  | "backpack"
  | "consumable"
  | "throwable"
  | "skin";

export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";

export const RARITY_META: Record<Rarity, { label: string; color: string; glow: string }> = {
  common: { label: "Common", color: "#9ca3af", glow: "rgba(156,163,175,.45)" },
  rare: { label: "Rare", color: "#38bdf8", glow: "rgba(56,189,248,.5)" },
  epic: { label: "Epic", color: "#a855f7", glow: "rgba(168,85,247,.55)" },
  legendary: { label: "Legendary", color: "#f59e0b", glow: "rgba(245,158,11,.6)" },
  mythic: { label: "Mythic", color: "#ef4444", glow: "rgba(239,68,68,.6)" },
};

export const CATEGORY_META: Record<ItemCategory, { label: string; emoji: string }> = {
  weapon: { label: "Weapons", emoji: "🔫" },
  outfit: { label: "Outfits", emoji: "🥚" },
  helmet: { label: "Helmets", emoji: "⛑️" },
  vest: { label: "Vests", emoji: "🦺" },
  backpack: { label: "Backpacks", emoji: "🎒" },
  consumable: { label: "Consumables", emoji: "🧪" },
  throwable: { label: "Throwables", emoji: "🧨" },
  skin: { label: "Weapon Skins", emoji: "🎨" },
};

/** Purely visual description of an egg soldier — drives the procedural model. */
export type OutfitVisual = {
  body: number;
  accent: number;
  hat: "none" | "crown" | "cap" | "helmet" | "bandana" | "bubble" | "horns" | "visor" | "hood";
  face: "default" | "angry" | "cool" | "happy" | "ninja" | "fierce";
  extra: "none" | "backpack" | "cape" | "wings" | "jetpack";
  pattern: "none" | "camo" | "stripes" | "circuit" | "scales";
};

export type ItemStats = {
  /** weapon items link to the balance table */
  weaponId?: string;
  /** vest / helmet protection points */
  armor?: number;
  /** consumable restore amount */
  heal?: number;
  /** backpack extra ammo reserve multiplier */
  capacity?: number;
  /** skin tint applied to the equipped weapon */
  tint?: number;
  visual?: OutfitVisual;
};

export type CatalogItem = {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  rarity: Rarity;
  priceGold: number;
  priceDiamonds: number;
  unlock: "default" | "shop" | "mission" | "event" | "admin";
  emoji: string;
  colorPrimary: string;
  colorSecondary: string;
  iconUrl?: string | null;
  stats: ItemStats;
  enabled: boolean;
  featured?: boolean;
};

const outfit = (
  id: string,
  name: string,
  description: string,
  rarity: Rarity,
  gold: number,
  diamonds: number,
  unlock: CatalogItem["unlock"],
  emoji: string,
  visual: OutfitVisual,
  featured = false,
): CatalogItem => ({
  id,
  name,
  description,
  category: "outfit",
  rarity,
  priceGold: gold,
  priceDiamonds: diamonds,
  unlock,
  emoji,
  colorPrimary: "#" + visual.body.toString(16).padStart(6, "0"),
  colorSecondary: "#" + visual.accent.toString(16).padStart(6, "0"),
  stats: { visual },
  enabled: true,
  featured,
});

export const DEFAULT_ITEMS: CatalogItem[] = [
  // ---------- OUTFITS ----------
  outfit("outfit_default", "Recruit Egg", "The classic shell. Free for every new soldier.", "common", 0, 0, "default", "🥚", {
    body: 0xfdf6e3,
    accent: 0xe2c89a,
    hat: "none",
    face: "default",
    extra: "none",
    pattern: "none",
  }),
  outfit("outfit_street", "Street Shell", "Red cap, cool shades, zero chill.", "common", 450, 0, "shop", "🧢", {
    body: 0xfdf2df,
    accent: 0xd93f3f,
    hat: "cap",
    face: "cool",
    extra: "backpack",
    pattern: "stripes",
  }),
  outfit("outfit_military", "Commando Yolk", "Field-tested camo with a combat helmet.", "rare", 1200, 0, "shop", "🪖", {
    body: 0xa8b088,
    accent: 0x4c5a3a,
    hat: "helmet",
    face: "angry",
    extra: "backpack",
    pattern: "camo",
  }),
  outfit("outfit_ninja", "Shadow Shell", "Silent, deadly, suspiciously breakfast-shaped.", "epic", 0, 120, "shop", "🥷", {
    body: 0x2b2f3a,
    accent: 0xe4e8f0,
    hat: "hood",
    face: "ninja",
    extra: "cape",
    pattern: "none",
  }),
  outfit("outfit_space", "Orbit Egg", "Pressurised bubble helmet and a jetpack shell.", "epic", 0, 150, "shop", "🧑‍🚀", {
    body: 0xf3f6ff,
    accent: 0x4f8cff,
    hat: "bubble",
    face: "happy",
    extra: "jetpack",
    pattern: "circuit",
  }),
  outfit("outfit_dragon", "Dragon Yolk", "Scaled armour and horns. Breathes fire (cosmetically).", "legendary", 0, 320, "shop", "🐲", {
    body: 0xc23a2a,
    accent: 0xf5c04a,
    hat: "horns",
    face: "fierce",
    extra: "wings",
    pattern: "scales",
  }, true),
  outfit("outfit_cyber", "Cyber Shell", "Neon visor, circuit plating, pure future yolk.", "mythic", 0, 480, "shop", "🤖", {
    body: 0x1b2a3a,
    accent: 0x22e6c8,
    hat: "visor",
    face: "fierce",
    extra: "jetpack",
    pattern: "circuit",
  }, true),
  outfit("outfit_royal", "Golden Monarch", "Awarded to players who finish the Season 1 missions.", "legendary", 0, 0, "mission", "👑", {
    body: 0xfff4d0,
    accent: 0xffc23a,
    hat: "crown",
    face: "cool",
    extra: "cape",
    pattern: "none",
  }),

  // ---------- WEAPONS ----------
  {
    id: "weapon_cluck9",
    name: "Cluck-9",
    description: "Reliable sidearm. Always in your pocket.",
    category: "weapon",
    rarity: "common",
    priceGold: 0,
    priceDiamonds: 0,
    unlock: "default",
    emoji: "🔫",
    colorPrimary: "#30343c",
    colorSecondary: "#b9bec6",
    stats: { weaponId: "cluck9" },
    enabled: true,
  },
  {
    id: "weapon_shellstorm",
    name: "Shellstorm SMG",
    description: "High fire-rate close-quarters shredder.",
    category: "weapon",
    rarity: "common",
    priceGold: 800,
    priceDiamonds: 0,
    unlock: "shop",
    emoji: "🔫",
    colorPrimary: "#2b2f36",
    colorSecondary: "#d0d4da",
    stats: { weaponId: "shellstorm" },
    enabled: true,
  },
  {
    id: "weapon_scrambler",
    name: "Scrambler 12",
    description: "Eight pellets of breakfast-ending power.",
    category: "weapon",
    rarity: "rare",
    priceGold: 1500,
    priceDiamonds: 0,
    unlock: "shop",
    emoji: "💥",
    colorPrimary: "#4a2f22",
    colorSecondary: "#9aa0a8",
    stats: { weaponId: "scrambler" },
    enabled: true,
  },
  {
    id: "weapon_yolk_ar",
    name: "Yolk-47",
    description: "The all-rounder assault rifle. Balanced and brutal.",
    category: "weapon",
    rarity: "epic",
    priceGold: 2600,
    priceDiamonds: 60,
    unlock: "shop",
    emoji: "🔫",
    colorPrimary: "#3a3f46",
    colorSecondary: "#8a5a2b",
    stats: { weaponId: "yolk_ar" },
    enabled: true,
    featured: true,
  },
  {
    id: "weapon_eggsniper",
    name: "Shell Piercer",
    description: "One shot, one omelette. 3.4× scope.",
    category: "weapon",
    rarity: "legendary",
    priceGold: 0,
    priceDiamonds: 180,
    unlock: "shop",
    emoji: "🎯",
    colorPrimary: "#273040",
    colorSecondary: "#5f6b7a",
    stats: { weaponId: "eggsniper" },
    enabled: true,
    featured: true,
  },
  {
    id: "weapon_whisk",
    name: "Battle Whisk",
    description: "Melee backup. Surprisingly lethal.",
    category: "weapon",
    rarity: "common",
    priceGold: 200,
    priceDiamonds: 0,
    unlock: "shop",
    emoji: "🥄",
    colorPrimary: "#c0c6ce",
    colorSecondary: "#6b4a2a",
    stats: { weaponId: "whisk" },
    enabled: true,
  },

  // ---------- GEAR ----------
  {
    id: "helmet_lvl1",
    name: "Shell Helmet I",
    description: "+25 armour. Reduces headshot damage.",
    category: "helmet",
    rarity: "common",
    priceGold: 300,
    priceDiamonds: 0,
    unlock: "shop",
    emoji: "⛑️",
    colorPrimary: "#8d99ae",
    colorSecondary: "#2b2d42",
    stats: { armor: 25 },
    enabled: true,
  },
  {
    id: "helmet_lvl2",
    name: "Shell Helmet II",
    description: "+45 armour. Reinforced composite shell.",
    category: "helmet",
    rarity: "rare",
    priceGold: 900,
    priceDiamonds: 0,
    unlock: "shop",
    emoji: "⛑️",
    colorPrimary: "#4f6d7a",
    colorSecondary: "#dbe9ee",
    stats: { armor: 45 },
    enabled: true,
  },
  {
    id: "vest_lvl1",
    name: "Yolk Vest I",
    description: "+30 armour absorbed before health.",
    category: "vest",
    rarity: "common",
    priceGold: 350,
    priceDiamonds: 0,
    unlock: "shop",
    emoji: "🦺",
    colorPrimary: "#6b705c",
    colorSecondary: "#cb997e",
    stats: { armor: 30 },
    enabled: true,
  },
  {
    id: "vest_lvl2",
    name: "Yolk Vest II",
    description: "+55 armour. Heavy plating for frontliners.",
    category: "vest",
    rarity: "epic",
    priceGold: 1800,
    priceDiamonds: 40,
    unlock: "shop",
    emoji: "🦺",
    colorPrimary: "#283d3b",
    colorSecondary: "#edddd4",
    stats: { armor: 55 },
    enabled: true,
  },
  {
    id: "backpack_lvl1",
    name: "Field Backpack",
    description: "+50% reserve ammunition capacity.",
    category: "backpack",
    rarity: "rare",
    priceGold: 700,
    priceDiamonds: 0,
    unlock: "shop",
    emoji: "🎒",
    colorPrimary: "#6b4f3a",
    colorSecondary: "#d8c3a5",
    stats: { capacity: 1.5 },
    enabled: true,
  },
  {
    id: "consumable_medkit",
    name: "Med Kit",
    description: "Restores 75 HP over 3 seconds.",
    category: "consumable",
    rarity: "common",
    priceGold: 120,
    priceDiamonds: 0,
    unlock: "shop",
    emoji: "🧰",
    colorPrimary: "#e63946",
    colorSecondary: "#f1faee",
    stats: { heal: 75 },
    enabled: true,
  },
  {
    id: "consumable_healthpack",
    name: "Health Pack",
    description: "Instantly restores 40 HP.",
    category: "consumable",
    rarity: "common",
    priceGold: 60,
    priceDiamonds: 0,
    unlock: "shop",
    emoji: "❤️",
    colorPrimary: "#ef476f",
    colorSecondary: "#ffd166",
    stats: { heal: 40 },
    enabled: true,
  },
  {
    id: "throwable_yolknade",
    name: "Yolk Grenade",
    description: "Explosive splash damage in a 7m radius.",
    category: "throwable",
    rarity: "rare",
    priceGold: 250,
    priceDiamonds: 0,
    unlock: "shop",
    emoji: "🧨",
    colorPrimary: "#4e6b36",
    colorSecondary: "#d8c25a",
    stats: { weaponId: "yolk_nade" },
    enabled: true,
  },

  // ---------- WEAPON SKINS ----------
  {
    id: "skin_lava_ar",
    name: "Lava Yolk-47",
    description: "Molten finish for the Yolk-47.",
    category: "skin",
    rarity: "epic",
    priceGold: 0,
    priceDiamonds: 90,
    unlock: "shop",
    emoji: "🌋",
    colorPrimary: "#ff5722",
    colorSecondary: "#ffc107",
    stats: { weaponId: "yolk_ar", tint: 0xff5722 },
    enabled: true,
  },
  {
    id: "skin_frost_smg",
    name: "Frostbite SMG",
    description: "Sub-zero chrome for the Shellstorm.",
    category: "skin",
    rarity: "rare",
    priceGold: 1400,
    priceDiamonds: 0,
    unlock: "shop",
    emoji: "❄️",
    colorPrimary: "#67e8f9",
    colorSecondary: "#e0f2fe",
    stats: { weaponId: "shellstorm", tint: 0x67e8f9 },
    enabled: true,
  },
  {
    id: "skin_gold_sniper",
    name: "Midas Piercer",
    description: "Solid gold sniper plating.",
    category: "skin",
    rarity: "mythic",
    priceGold: 0,
    priceDiamonds: 260,
    unlock: "shop",
    emoji: "🥇",
    colorPrimary: "#ffd700",
    colorSecondary: "#a17c1a",
    stats: { weaponId: "eggsniper", tint: 0xffd700 },
    enabled: true,
    featured: true,
  },
];

export type MissionDef = {
  key: string;
  title: string;
  description: string;
  type: "daily" | "weekly" | "career";
  metric: "kills" | "matches" | "wins" | "headshots" | "damage" | "login";
  goal: number;
  rewardGold: number;
  rewardDiamonds: number;
  rewardItemId?: string | null;
};

export const DEFAULT_MISSIONS: MissionDef[] = [
  { key: "daily_login", title: "Daily Check-In", description: "Open the game today.", type: "daily", metric: "login", goal: 1, rewardGold: 150, rewardDiamonds: 1 },
  { key: "daily_kills_10", title: "Scramble 10 Eggs", description: "Eliminate 10 opponents.", type: "daily", metric: "kills", goal: 10, rewardGold: 300, rewardDiamonds: 0 },
  { key: "daily_matches_3", title: "Triple Threat", description: "Finish 3 matches.", type: "daily", metric: "matches", goal: 3, rewardGold: 200, rewardDiamonds: 0 },
  { key: "daily_headshots_5", title: "Crack Shot", description: "Land 5 headshots.", type: "daily", metric: "headshots", goal: 5, rewardGold: 250, rewardDiamonds: 1 },
  { key: "weekly_wins_3", title: "Last Egg Standing", description: "Win 3 matches this week.", type: "weekly", metric: "wins", goal: 3, rewardGold: 1200, rewardDiamonds: 5 },
  { key: "weekly_damage", title: "Omelette Maker", description: "Deal 5000 damage this week.", type: "weekly", metric: "damage", goal: 5000, rewardGold: 900, rewardDiamonds: 3 },
  { key: "career_kills_100", title: "Season 1: Centurion", description: "Eliminate 100 opponents.", type: "career", metric: "kills", goal: 100, rewardGold: 2500, rewardDiamonds: 10, rewardItemId: "outfit_royal" },
];

export const DEFAULT_PAYMENT_METHODS = [
  {
    id: "binance_usdt",
    name: "Binance Pay (USDT TRC20)",
    kind: "binance",
    address: "TX-SET-YOUR-BINANCE-ADDRESS",
    instructions:
      "Send USDT (TRC20) to the address above, then upload your Binance payment screenshot. Diamonds are issued after an admin verifies the transfer.",
    enabled: true,
    sortOrder: 1,
  },
  {
    id: "binance_id",
    name: "Binance Pay ID",
    kind: "binance",
    address: "000000000",
    instructions: "Use Binance Pay → Send → Pay ID, then upload the receipt screenshot.",
    enabled: true,
    sortOrder: 2,
  },
];

/** Diamond bundles offered on the top-up screen. */
export const DIAMOND_PACKS = [
  { id: "pack_small", diamonds: 100, usd: 1, bonus: 0 },
  { id: "pack_mid", diamonds: 550, usd: 5, bonus: 50 },
  { id: "pack_large", diamonds: 1200, usd: 10, bonus: 200 },
  { id: "pack_mega", diamonds: 2600, usd: 20, bonus: 600 },
];
