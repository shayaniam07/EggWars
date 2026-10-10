/**
 * EGG WARS - Postgres schema (Drizzle ORM).
 * Apply with:  npx drizzle-kit push
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ItemStats } from "@/shared/catalog";

/* ------------------------------------------------------------------ users */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    emailLower: text("email_lower").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash"),
    provider: text("provider").notNull().default("email"), // email | google | facebook | guest
    providerId: text("provider_id"),
    avatarUrl: text("avatar_url"),
    role: text("role").notNull().default("player"), // player | moderator | admin
    banned: boolean("banned").notNull().default(false),
    banReason: text("ban_reason"),
    gold: integer("gold").notNull().default(1500),
    diamonds: integer("diamonds").notNull().default(25),
    xp: integer("xp").notNull().default(0),
    level: integer("level").notNull().default(1),
    kills: integer("kills").notNull().default(0),
    deaths: integer("deaths").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    matches: integer("matches").notNull().default(0),
    headshots: integer("headshots").notNull().default(0),
    damageDealt: integer("damage_dealt").notNull().default(0),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_lower_idx").on(t.emailLower)],
);

export const sessions = pgTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    userId: integer("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ items */
export const items = pgTable(
  "items",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull(),
    rarity: text("rarity").notNull().default("common"),
    priceGold: integer("price_gold").notNull().default(0),
    priceDiamonds: integer("price_diamonds").notNull().default(0),
    unlock: text("unlock").notNull().default("shop"),
    emoji: text("emoji").notNull().default("📦"),
    colorPrimary: text("color_primary").notNull().default("#888888"),
    colorSecondary: text("color_secondary").notNull().default("#cccccc"),
    iconUrl: text("icon_url"),
    stats: jsonb("stats").$type<ItemStats>().notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    featured: boolean("featured").notNull().default(false),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("items_category_idx").on(t.category)],
);

export const inventory = pgTable(
  "inventory",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    itemId: text("item_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
    equipped: boolean("equipped").notNull().default(false),
    source: text("source").notNull().default("shop"), // shop | mission | admin | default
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("inventory_user_item_idx").on(t.userId, t.itemId)],
);

/* --------------------------------------------------------------- missions */
export const missions = pgTable("missions", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  type: text("type").notNull().default("daily"),
  metric: text("metric").notNull().default("kills"),
  goal: integer("goal").notNull().default(1),
  rewardGold: integer("reward_gold").notNull().default(0),
  rewardDiamonds: integer("reward_diamonds").notNull().default(0),
  rewardItemId: text("reward_item_id"),
  active: boolean("active").notNull().default(true),
});

export const missionProgress = pgTable(
  "mission_progress",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    missionKey: text("mission_key").notNull(),
    periodKey: text("period_key").notNull(), // e.g. 2026-04-11 / 2026-W15 / career
    progress: integer("progress").notNull().default(0),
    claimed: boolean("claimed").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("mission_progress_unique_idx").on(t.userId, t.missionKey, t.periodKey)],
);

/* --------------------------------------------------------------- payments */
export const paymentMethods = pgTable("payment_methods", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("binance"),
  address: text("address").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  qrUrl: text("qr_url"),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const paymentRequests = pgTable(
  "payment_requests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    methodId: text("method_id").notNull(),
    packId: text("pack_id"),
    amountUsd: real("amount_usd").notNull().default(0),
    diamondsRequested: integer("diamonds_requested").notNull().default(0),
    diamondsGranted: integer("diamonds_granted").notNull().default(0),
    txRef: text("tx_ref").notNull().default(""),
    screenshotUrl: text("screenshot_url").notNull().default(""),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    adminNote: text("admin_note").notNull().default(""),
    reviewedBy: integer("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_requests_status_idx").on(t.status)],
);

/* ------------------------------------------------------------ match stats */
export const matchResults = pgTable(
  "match_results",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    mode: text("mode").notNull().default("offline"),
    mapId: text("map_id").notNull().default("island"),
    difficulty: text("difficulty"),
    kills: integer("kills").notNull().default(0),
    deaths: integer("deaths").notNull().default(0),
    headshots: integer("headshots").notNull().default(0),
    damage: integer("damage").notNull().default(0),
    placement: integer("placement").notNull().default(0),
    won: boolean("won").notNull().default(false),
    durationSec: integer("duration_sec").notNull().default(0),
    rewardGold: integer("reward_gold").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("match_results_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------- admin logs */
export const adminLogs = pgTable("admin_logs", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id"),
  actorName: text("actor_name").notNull().default("system"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull().default(""),
  targetId: text("target_id").notNull().default(""),
  details: jsonb("details").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------- key/value game config */
export const gameConfig = pgTable("game_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Asset registry — lets the admin panel verify every uploaded file is readable. */
export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  path: text("path").notNull().unique(),
  originalName: text("original_name").notNull().default(""),
  mime: text("mime").notNull().default(""),
  bytes: integer("bytes").notNull().default(0),
  width: integer("width").notNull().default(0),
  height: integer("height").notNull().default(0),
  checksum: text("checksum").notNull().default(""),
  kind: text("kind").notNull().default("item-icon"),
  uploadedBy: integer("uploaded_by"),
  valid: boolean("valid").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
