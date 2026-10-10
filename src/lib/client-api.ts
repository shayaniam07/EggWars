/** EGG WARS - Typed browser API client. */
"use client";

import type { ItemStats, Rarity, ItemCategory, OutfitVisual } from "@/shared/catalog";
import type { GameSettings } from "@/game/engine";
import { DEFAULT_SETTINGS } from "@/game/engine";

export type Item = {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  rarity: Rarity;
  priceGold: number;
  priceDiamonds: number;
  unlock: string;
  emoji: string;
  colorPrimary: string;
  colorSecondary: string;
  iconUrl: string | null;
  stats: ItemStats;
  enabled: boolean;
  featured: boolean;
};

export type Mission = {
  id: number;
  key: string;
  title: string;
  description: string;
  type: string;
  metric: string;
  goal: number;
  rewardGold: number;
  rewardDiamonds: number;
  rewardItemId: string | null;
  active: boolean;
};

export type Catalog = {
  gameName: string;
  tagline: string;
  items: Item[];
  missions: Mission[];
  paymentMethods: { id: string; name: string; kind: string; address: string; instructions: string; qrUrl: string | null }[];
  diamondPacks: { id: string; diamonds: number; usd: number; bonus: number }[];
  maps: { id: string; name: string; blurb: string; emoji: string }[];
  difficulties: { id: string; label: string; color: string; botCount: number }[];
  weapons: { id: string; name: string; cls: string; damage: number; rps: number; mag: number; reloadSec: number; range: number; emoji: string }[];
};

export type User = {
  id: number;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  provider: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  gold: number;
  diamonds: number;
  xp: number;
  level: number;
  kills: number;
  deaths: number;
  wins: number;
  matches: number;
  headshots: number;
  damageDealt: number;
  settings: Record<string, unknown>;
};

export type InventoryRow = { id: number; userId: number; itemId: string; quantity: number; equipped: boolean; source: string };
export type MissionProgressRow = { missionKey: string; periodKey: string; progress: number; claimed: boolean };
export type MatchRow = {
  id: number;
  mode: string;
  mapId: string;
  kills: number;
  deaths: number;
  won: boolean;
  rewardGold: number;
  createdAt: string;
};
export type PaymentRow = {
  id: number;
  methodId: string;
  packId: string | null;
  amountUsd: number;
  diamondsRequested: number;
  diamondsGranted: number;
  status: string;
  adminNote: string;
  screenshotUrl: string;
  createdAt: string;
};

export type PlayerBundle = {
  user: User;
  inventory: InventoryRow[];
  missionProgress: MissionProgressRow[];
  recentMatches: MatchRow[];
  payments: PaymentRow[];
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", ...init });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    throw new ApiError("Server returned an unreadable response", res.status);
  }
  const body = json as { ok?: boolean; error?: string };
  if (!res.ok || body.ok === false) {
    throw new ApiError(body.error || `Request failed (${res.status})`, res.status);
  }
  return json as T;
}

export const api = {
  me: () => request<{ user: User | null }>("/api/auth/me"),
  providers: () => request<{ google: boolean; googleClientId: string; facebook: boolean; facebookAppId: string }>("/api/auth/providers"),
  login: (email: string, password: string) =>
    request<{ user: User }>("/api/auth/login", jsonBody({ email, password })),
  signup: (email: string, password: string, displayName: string) =>
    request<{ user: User }>("/api/auth/signup", jsonBody({ email, password, displayName })),
  guest: () => request<{ user: User }>("/api/auth/guest", jsonBody({})),
  google: (credential: string) => request<{ user: User }>("/api/auth/google", jsonBody({ credential })),
  facebook: (accessToken: string) => request<{ user: User }>("/api/auth/facebook", jsonBody({ accessToken })),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", jsonBody({})),

  catalog: () => request<Catalog>("/api/catalog"),
  player: () => request<PlayerBundle>("/api/player"),
  playerAction: <T>(body: Record<string, unknown>) => request<T>("/api/player", jsonBody(body)),

  rooms: () => request<{ rooms: RoomInfo[] }>("/api/mp/rooms"),
  joinRoom: (body: Record<string, unknown>) =>
    request<{ roomId: string; code: string; playerId: string; secret: string; mapId: string; mode: string; loadout: string[] }>(
      "/api/mp/join",
      jsonBody(body),
    ),
  mpResult: (body: Record<string, unknown>) => request<{ rewardGold: number; placement: number; user: User }>("/api/mp/result", jsonBody(body)),

  upload: async (file: File, kind: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    return request<{ url: string; width: number; height: number; bytes: number }>("/api/upload", { method: "POST", body: fd });
  },

  admin: <T>(section: string, params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : "";
    return request<T>(`/api/admin/${section}${q}`);
  },
  adminPost: <T>(section: string, body: Record<string, unknown>) => request<T>(`/api/admin/${section}`, jsonBody(body)),
};

export type RoomInfo = {
  id: string;
  name: string;
  mapId: string;
  mode: string;
  state: string;
  players: number;
  maxPlayers: number;
  timeLeft: number;
};

function jsonBody(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/* ---------------------------------------------------------- settings */
const SETTINGS_KEY = "eggwars.settings.v1";

export function loadSettings(): GameSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<GameSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: GameSettings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode) - settings stay in memory */
  }
}

/* ------------------------------------------------------ helper logic */
export const DEFAULT_VISUAL: OutfitVisual = {
  body: 0xfdf6e3,
  accent: 0xe2c89a,
  hat: "none",
  face: "default",
  extra: "none",
  pattern: "none",
};

export function visualOf(item: Item | undefined): OutfitVisual {
  const v = item?.stats?.visual;
  return v ? { ...DEFAULT_VISUAL, ...v } : DEFAULT_VISUAL;
}

export function equippedItem(items: Item[], inv: InventoryRow[], category: ItemCategory): Item | undefined {
  const owned = inv.filter((i) => i.equipped);
  for (const row of owned) {
    const item = items.find((it) => it.id === row.itemId);
    if (item?.category === category) return item;
  }
  return undefined;
}

export function ownedLoadout(items: Item[], inv: InventoryRow[]): string[] {
  const ids = new Set(inv.map((i) => i.itemId));
  const weapons = items.filter((i) => i.category === "weapon" && ids.has(i.id) && i.stats?.weaponId);
  const list = weapons.map((w) => String(w.stats.weaponId));
  return list.length ? list.slice(0, 3) : ["cluck9"];
}

/* ------------------------------------------------- offline resilience */
/**
 * The catalog and player bundle are mirrored into localStorage after every
 * successful load. If the device is offline the menu + offline matches still
 * work from this cache, and match results are queued until the server is
 * reachable again.
 */
const CACHE_KEY = "eggwars.cache.v1";
const QUEUE_KEY = "eggwars.queue.v1";

export function cacheSet(key: "catalog" | "player", value: unknown) {
  try {
    const all = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "{}") as Record<string, unknown>;
    all[key] = value;
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    /* ignore quota / private mode */
  }
}

export function cacheGet<T>(key: "catalog" | "player"): T | null {
  try {
    const all = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "{}") as Record<string, T>;
    return all[key] ?? null;
  } catch {
    return null;
  }
}

export function queueMatch(payload: Record<string, unknown>) {
  try {
    const q = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || "[]") as Record<string, unknown>[];
    q.push(payload);
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-25)));
  } catch {
    /* ignore */
  }
}

/** Flush queued offline results. Returns the number successfully submitted. */
export async function flushQueue(): Promise<number> {
  let q: Record<string, unknown>[] = [];
  try {
    q = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || "[]") as Record<string, unknown>[];
  } catch {
    return 0;
  }
  if (!q.length) return 0;
  const remaining: Record<string, unknown>[] = [];
  let done = 0;
  for (const payload of q) {
    try {
      await api.playerAction({ action: "match", ...payload });
      done++;
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) continue; // drop rejected entries
      remaining.push(payload);
    }
  }
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  } catch {
    /* ignore */
  }
  return done;
}

export function isMobileDevice() {
  if (typeof window === "undefined") return false;
  return (
    /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && window.innerWidth < 1024)
  );
}
