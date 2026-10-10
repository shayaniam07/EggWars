/**
 * EGG WARS - Idempotent content bootstrap.
 *
 * Runs once per server process (and is safe to run repeatedly). It seeds the
 * default catalog, missions, payment methods and the administrator account so
 * a fresh database is immediately playable.
 *
 * Admin credentials come from ADMIN_EMAIL / ADMIN_PASSWORD when provided.
 */
import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminLogs, inventory, items, missions, paymentMethods, users } from "@/db/schema";
import { DEFAULT_ITEMS, DEFAULT_MISSIONS, DEFAULT_PAYMENT_METHODS } from "@/shared/catalog";
import { hashPassword } from "./auth";

export const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@eggwars.gg";
export const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "EggWars#Admin2026";

const g = globalThis as typeof globalThis & { __ewBootstrap?: Promise<void> };

export function ensureSeeded(): Promise<void> {
  if (!g.__ewBootstrap) g.__ewBootstrap = runSeed().catch((err) => {
    console.error("[eggwars] bootstrap failed:", err);
    g.__ewBootstrap = undefined;
    throw err;
  });
  return g.__ewBootstrap;
}

async function runSeed() {
  // --- catalog ---------------------------------------------------------
  for (const item of DEFAULT_ITEMS) {
    await db
      .insert(items)
      .values({
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        rarity: item.rarity,
        priceGold: item.priceGold,
        priceDiamonds: item.priceDiamonds,
        unlock: item.unlock,
        emoji: item.emoji,
        colorPrimary: item.colorPrimary,
        colorSecondary: item.colorSecondary,
        stats: item.stats,
        enabled: item.enabled,
        featured: item.featured ?? false,
      })
      .onConflictDoNothing({ target: items.id });
  }

  // --- missions --------------------------------------------------------
  for (const m of DEFAULT_MISSIONS) {
    await db
      .insert(missions)
      .values({
        key: m.key,
        title: m.title,
        description: m.description,
        type: m.type,
        metric: m.metric,
        goal: m.goal,
        rewardGold: m.rewardGold,
        rewardDiamonds: m.rewardDiamonds,
        rewardItemId: m.rewardItemId ?? null,
        active: true,
      })
      .onConflictDoNothing({ target: missions.key });
  }

  // --- payment methods -------------------------------------------------
  for (const p of DEFAULT_PAYMENT_METHODS) {
    await db.insert(paymentMethods).values(p).onConflictDoNothing({ target: paymentMethods.id });
  }

  // --- administrator ---------------------------------------------------
  const email = DEFAULT_ADMIN_EMAIL.trim();
  const lower = email.toLowerCase();
  const existing = await db.select().from(users).where(eq(users.emailLower, lower)).limit(1);
  if (!existing.length) {
    const [admin] = await db
      .insert(users)
      .values({
        email,
        emailLower: lower,
        displayName: "Game Admin",
        passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
        provider: "email",
        role: "admin",
        gold: 999999,
        diamonds: 999999,
      })
      .returning();
    await grantDefaultLoadout(admin.id);
    await db.insert(adminLogs).values({
      actorId: admin.id,
      actorName: "system",
      action: "bootstrap.admin_created",
      targetType: "user",
      targetId: String(admin.id),
      details: { email },
    });
  } else if (existing[0].role !== "admin") {
    await db.update(users).set({ role: "admin" }).where(eq(users.id, existing[0].id));
  }
}

/** Every new account owns the free starter content. */
export async function grantDefaultLoadout(userId: number) {
  const defaults = DEFAULT_ITEMS.filter((i) => i.unlock === "default").map((i) => i.id);
  for (const itemId of defaults) {
    await db
      .insert(inventory)
      .values({ userId, itemId, equipped: true, source: "default" })
      .onConflictDoNothing();
  }
}

export async function logAdmin(
  actorId: number | null,
  actorName: string,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown> = {},
) {
  await db.insert(adminLogs).values({ actorId, actorName, action, targetType, targetId, details });
}

/** Mission period bucket keys (daily resets at UTC midnight, weekly on Monday). */
export function periodKey(type: string, now = new Date()): string {
  if (type === "daily") return now.toISOString().slice(0, 10);
  if (type === "weekly") {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - day + 1);
    return `W${d.toISOString().slice(0, 10)}`;
  }
  return "career";
}

export const nowSql = sql`now()`;
