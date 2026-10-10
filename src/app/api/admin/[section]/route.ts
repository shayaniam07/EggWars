import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  adminLogs,
  assets,
  inventory,
  items,
  matchResults,
  missions,
  paymentMethods,
  paymentRequests,
  sessions,
  users,
} from "@/db/schema";
import { AuthError, requireAdmin } from "@/lib/auth";
import { validateAssets } from "@/lib/assets";
import { ensureSeeded, logAdmin } from "@/lib/bootstrap";
import { CATEGORY_META, RARITY_META, type ItemCategory, type Rarity } from "@/shared/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ section: string }> };

const ID_RE = /^[a-z0-9_]{3,48}$/;
const CATEGORIES = Object.keys(CATEGORY_META) as ItemCategory[];
const RARITIES = Object.keys(RARITY_META) as Rarity[];

/* ------------------------------------------------------------------ GET */
export async function GET(req: Request, ctx: Ctx) {
  try {
    await ensureSeeded();
    await requireAdmin();
    const { section } = await ctx.params;
    const url = new URL(req.url);

    if (section === "dashboard") {
      const [itemRows, userRows, pending, logs, assetHealth, recentItems, matchCount] = await Promise.all([
        db.select({ category: items.category, n: count() }).from(items).groupBy(items.category),
        db.select({ n: count() }).from(users),
        db.select({ n: count() }).from(paymentRequests).where(eq(paymentRequests.status, "pending")),
        db.select().from(adminLogs).orderBy(desc(adminLogs.createdAt)).limit(12),
        validateAssets(),
        db.select().from(items).orderBy(desc(items.updatedAt)).limit(6),
        db.select({ n: count() }).from(matchResults),
      ]);
      const banned = await db.select({ n: count() }).from(users).where(eq(users.banned, true));
      return Response.json({
        ok: true,
        itemsByCategory: itemRows,
        totalItems: itemRows.reduce((a, r) => a + Number(r.n), 0),
        totalUsers: Number(userRows[0]?.n ?? 0),
        bannedUsers: Number(banned[0]?.n ?? 0),
        pendingPayments: Number(pending[0]?.n ?? 0),
        totalMatches: Number(matchCount[0]?.n ?? 0),
        logs,
        assetHealth,
        recentItems,
      });
    }

    if (section === "items") {
      const search = url.searchParams.get("search")?.trim() ?? "";
      const category = url.searchParams.get("category") ?? "";
      const rarity = url.searchParams.get("rarity") ?? "";
      const filters = [];
      if (search) filters.push(or(ilike(items.name, `%${search}%`), ilike(items.id, `%${search}%`)));
      if (category) filters.push(eq(items.category, category));
      if (rarity) filters.push(eq(items.rarity, rarity));
      const rows = await db
        .select()
        .from(items)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(items.updatedAt))
        .limit(300);
      return Response.json({ ok: true, items: rows });
    }

    if (section === "users") {
      const search = url.searchParams.get("search")?.trim() ?? "";
      const rows = await db
        .select()
        .from(users)
        .where(search ? or(ilike(users.displayName, `%${search}%`), ilike(users.email, `%${search}%`)) : undefined)
        .orderBy(desc(users.lastSeenAt))
        .limit(200);
      return Response.json({
        ok: true,
        users: rows.map((u) => ({
          id: u.id,
          email: u.email,
          displayName: u.displayName,
          provider: u.provider,
          role: u.role,
          banned: u.banned,
          banReason: u.banReason,
          gold: u.gold,
          diamonds: u.diamonds,
          level: u.level,
          kills: u.kills,
          matches: u.matches,
          createdAt: u.createdAt,
          lastSeenAt: u.lastSeenAt,
        })),
      });
    }

    if (section === "payments") {
      const status = url.searchParams.get("status") ?? "";
      const rows = await db
        .select({
          req: paymentRequests,
          userName: users.displayName,
          userEmail: users.email,
          userDiamonds: users.diamonds,
        })
        .from(paymentRequests)
        .leftJoin(users, eq(users.id, paymentRequests.userId))
        .where(status ? eq(paymentRequests.status, status) : undefined)
        .orderBy(desc(paymentRequests.createdAt))
        .limit(200);
      return Response.json({ ok: true, payments: rows });
    }

    if (section === "methods") {
      const rows = await db.select().from(paymentMethods).orderBy(paymentMethods.sortOrder);
      return Response.json({ ok: true, methods: rows });
    }

    if (section === "missions") {
      const rows = await db.select().from(missions).orderBy(missions.id);
      return Response.json({ ok: true, missions: rows });
    }

    if (section === "logs") {
      const rows = await db.select().from(adminLogs).orderBy(desc(adminLogs.createdAt)).limit(200);
      return Response.json({ ok: true, logs: rows });
    }

    if (section === "assets") {
      const [rows, health] = await Promise.all([
        db.select().from(assets).orderBy(desc(assets.createdAt)).limit(200),
        validateAssets(),
      ]);
      return Response.json({ ok: true, assets: rows, health });
    }

    return Response.json({ ok: false, error: "Unknown section" }, { status: 404 });
  } catch (err) {
    return errorResponse(err);
  }
}

/* ----------------------------------------------------------------- POST */
export async function POST(req: Request, ctx: Ctx) {
  try {
    await ensureSeeded();
    const admin = await requireAdmin();
    const { section } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const op = String(body.op || "");

    /* ---------------------------------------------------------- items */
    if (section === "items") {
      if (op === "create" || op === "update") {
        const payload = (body.item ?? {}) as Record<string, unknown>;
        const id = String(payload.id || "").trim().toLowerCase();
        if (!ID_RE.test(id)) {
          return bad("Item ID must be 3-48 chars: lowercase letters, numbers and underscores only");
        }
        const category = String(payload.category || "");
        if (!CATEGORIES.includes(category as ItemCategory)) return bad("Choose a valid category");
        const rarity = String(payload.rarity || "common");
        if (!RARITIES.includes(rarity as Rarity)) return bad("Choose a valid rarity");
        const name = String(payload.name || "").trim();
        if (name.length < 2 || name.length > 48) return bad("Name must be 2-48 characters");

        const values = {
          id,
          name,
          description: String(payload.description || "").slice(0, 400),
          category,
          rarity,
          priceGold: intOf(payload.priceGold, 0, 1_000_000),
          priceDiamonds: intOf(payload.priceDiamonds, 0, 1_000_000),
          unlock: ["default", "shop", "mission", "event", "admin"].includes(String(payload.unlock))
            ? String(payload.unlock)
            : "shop",
          emoji: String(payload.emoji || "📦").slice(0, 8),
          colorPrimary: colorOf(payload.colorPrimary, "#888888"),
          colorSecondary: colorOf(payload.colorSecondary, "#cccccc"),
          iconUrl: payload.iconUrl ? String(payload.iconUrl).slice(0, 300) : null,
          stats: sanitizeStats(payload.stats, category),
          enabled: payload.enabled === undefined ? true : Boolean(payload.enabled),
          featured: Boolean(payload.featured),
          updatedAt: new Date(),
        };

        const existing = await db.select({ id: items.id }).from(items).where(eq(items.id, id)).limit(1);
        if (op === "create" && existing.length) {
          return bad(`Item ID "${id}" already exists — pick a unique ID`, 409);
        }
        if (op === "update" && !existing.length) return bad("Item not found", 404);

        if (op === "create") {
          await db.insert(items).values({ ...values, createdBy: admin.id });
        } else {
          await db.update(items).set(values).where(eq(items.id, id));
        }
        await logAdmin(admin.id, admin.displayName, `item.${op}`, "item", id, { name, category, rarity });
        return Response.json({ ok: true, item: values });
      }

      if (op === "toggle") {
        const id = String(body.id || "");
        const [row] = await db.select().from(items).where(eq(items.id, id)).limit(1);
        if (!row) return bad("Item not found", 404);
        await db.update(items).set({ enabled: !row.enabled, updatedAt: new Date() }).where(eq(items.id, id));
        await logAdmin(admin.id, admin.displayName, "item.toggle", "item", id, { enabled: !row.enabled });
        return Response.json({ ok: true, enabled: !row.enabled });
      }

      if (op === "delete") {
        const id = String(body.id || "");
        const owners = await db.select({ n: count() }).from(inventory).where(eq(inventory.itemId, id));
        await db.delete(inventory).where(eq(inventory.itemId, id));
        await db.delete(items).where(eq(items.id, id));
        await logAdmin(admin.id, admin.displayName, "item.delete", "item", id, { removedFromInventories: Number(owners[0]?.n ?? 0) });
        return Response.json({ ok: true });
      }

      if (op === "bulk") {
        const list = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
        if (!list.length) return bad("Nothing to import");
        const results: { id: string; ok: boolean; error?: string }[] = [];
        for (const raw of list.slice(0, 200)) {
          const id = String(raw.id || "").trim().toLowerCase();
          const category = String(raw.category || "");
          if (!ID_RE.test(id) || !CATEGORIES.includes(category as ItemCategory)) {
            results.push({ id: id || "(missing id)", ok: false, error: "Invalid id or category" });
            continue;
          }
          try {
            await db
              .insert(items)
              .values({
                id,
                name: String(raw.name || id).slice(0, 48),
                description: String(raw.description || "").slice(0, 400),
                category,
                rarity: RARITIES.includes(String(raw.rarity) as Rarity) ? String(raw.rarity) : "common",
                priceGold: intOf(raw.priceGold, 0, 1_000_000),
                priceDiamonds: intOf(raw.priceDiamonds, 0, 1_000_000),
                unlock: "shop",
                emoji: String(raw.emoji || "📦").slice(0, 8),
                colorPrimary: colorOf(raw.colorPrimary, "#888888"),
                colorSecondary: colorOf(raw.colorSecondary, "#cccccc"),
                iconUrl: raw.iconUrl ? String(raw.iconUrl) : null,
                stats: sanitizeStats(raw.stats, category),
                enabled: true,
                createdBy: admin.id,
              })
              .onConflictDoUpdate({
                target: items.id,
                set: { name: String(raw.name || id).slice(0, 48), updatedAt: new Date() },
              });
            results.push({ id, ok: true });
          } catch (e) {
            results.push({ id, ok: false, error: (e as Error).message });
          }
        }
        await logAdmin(admin.id, admin.displayName, "item.bulk", "item", "", { count: results.length });
        return Response.json({ ok: true, results });
      }
    }

    /* ---------------------------------------------------------- users */
    if (section === "users") {
      const userId = intOf(body.userId, 1, 2_000_000_000);
      const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!target) return bad("User not found", 404);

      if (op === "currency") {
        const gold = intOf(body.gold, -1_000_000, 1_000_000);
        const diamonds = intOf(body.diamonds, -1_000_000, 1_000_000);
        const mode = String(body.mode || "add");
        const nextGold = mode === "set" ? Math.max(0, gold) : Math.max(0, target.gold + gold);
        const nextDiamonds = mode === "set" ? Math.max(0, diamonds) : Math.max(0, target.diamonds + diamonds);
        await db.update(users).set({ gold: nextGold, diamonds: nextDiamonds }).where(eq(users.id, userId));
        await logAdmin(admin.id, admin.displayName, "user.currency", "user", String(userId), {
          mode,
          gold,
          diamonds,
          nextGold,
          nextDiamonds,
        });
        return Response.json({ ok: true, gold: nextGold, diamonds: nextDiamonds });
      }

      if (op === "ban") {
        const banned = Boolean(body.banned);
        const reason = String(body.reason || "Violation of the fair-play rules").slice(0, 200);
        if (target.role === "admin" && banned) return bad("You cannot ban an administrator");
        await db
          .update(users)
          .set({ banned, banReason: banned ? reason : null })
          .where(eq(users.id, userId));
        if (banned) await db.delete(sessions).where(eq(sessions.userId, userId)); // force sign-out
        await logAdmin(admin.id, admin.displayName, banned ? "user.ban" : "user.unban", "user", String(userId), { reason });
        return Response.json({ ok: true, banned });
      }

      if (op === "role") {
        const role = String(body.role || "player");
        if (!["player", "moderator", "admin"].includes(role)) return bad("Invalid role");
        if (target.id === admin.id && role !== "admin") return bad("You cannot demote yourself");
        await db.update(users).set({ role }).where(eq(users.id, userId));
        await logAdmin(admin.id, admin.displayName, "user.role", "user", String(userId), { role });
        return Response.json({ ok: true, role });
      }

      if (op === "grant") {
        const itemId = String(body.itemId || "");
        const [item] = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
        if (!item) return bad("Item not found", 404);
        await db.insert(inventory).values({ userId, itemId, source: "admin" }).onConflictDoNothing();
        await logAdmin(admin.id, admin.displayName, "user.grant_item", "user", String(userId), { itemId });
        return Response.json({ ok: true });
      }
    }

    /* ------------------------------------------------------- payments */
    if (section === "payments") {
      const id = intOf(body.id, 1, 2_000_000_000);
      const [row] = await db.select().from(paymentRequests).where(eq(paymentRequests.id, id)).limit(1);
      if (!row) return bad("Payment request not found", 404);
      if (row.status !== "pending") return bad("This request was already reviewed", 409);
      const note = String(body.note || "").slice(0, 300);

      if (op === "approve") {
        const diamonds = intOf(body.diamonds ?? row.diamondsRequested, 0, 1_000_000);
        await db
          .update(users)
          .set({ diamonds: sql`${users.diamonds} + ${diamonds}` })
          .where(eq(users.id, row.userId));
        await db
          .update(paymentRequests)
          .set({
            status: "approved",
            diamondsGranted: diamonds,
            adminNote: note,
            reviewedBy: admin.id,
            reviewedAt: new Date(),
          })
          .where(eq(paymentRequests.id, id));
        await logAdmin(admin.id, admin.displayName, "payment.approve", "payment", String(id), { diamonds, userId: row.userId });
        return Response.json({ ok: true });
      }

      if (op === "reject") {
        await db
          .update(paymentRequests)
          .set({ status: "rejected", adminNote: note || "Payment could not be verified", reviewedBy: admin.id, reviewedAt: new Date() })
          .where(eq(paymentRequests.id, id));
        await logAdmin(admin.id, admin.displayName, "payment.reject", "payment", String(id), { note });
        return Response.json({ ok: true });
      }
    }

    /* -------------------------------------------------------- methods */
    if (section === "methods") {
      if (op === "save") {
        const m = (body.method ?? {}) as Record<string, unknown>;
        const id = String(m.id || "").trim().toLowerCase();
        if (!ID_RE.test(id)) return bad("Method ID must be 3-48 lowercase chars");
        const values = {
          id,
          name: String(m.name || "").slice(0, 80) || "Payment method",
          kind: String(m.kind || "binance").slice(0, 24),
          address: String(m.address || "").slice(0, 200),
          instructions: String(m.instructions || "").slice(0, 600),
          qrUrl: m.qrUrl ? String(m.qrUrl).slice(0, 300) : null,
          enabled: m.enabled === undefined ? true : Boolean(m.enabled),
          sortOrder: intOf(m.sortOrder, 0, 999),
        };
        await db.insert(paymentMethods).values(values).onConflictDoUpdate({ target: paymentMethods.id, set: values });
        await logAdmin(admin.id, admin.displayName, "method.save", "method", id, { name: values.name });
        return Response.json({ ok: true });
      }
      if (op === "delete") {
        const id = String(body.id || "");
        await db.delete(paymentMethods).where(eq(paymentMethods.id, id));
        await logAdmin(admin.id, admin.displayName, "method.delete", "method", id, {});
        return Response.json({ ok: true });
      }
    }

    /* ------------------------------------------------------- missions */
    if (section === "missions") {
      if (op === "save") {
        const m = (body.mission ?? {}) as Record<string, unknown>;
        const key = String(m.key || "").trim().toLowerCase();
        if (!ID_RE.test(key)) return bad("Mission key must be 3-48 lowercase chars");
        const values = {
          key,
          title: String(m.title || "").slice(0, 80) || key,
          description: String(m.description || "").slice(0, 300),
          type: ["daily", "weekly", "career"].includes(String(m.type)) ? String(m.type) : "daily",
          metric: ["kills", "matches", "wins", "headshots", "damage", "login"].includes(String(m.metric))
            ? String(m.metric)
            : "kills",
          goal: intOf(m.goal, 1, 1_000_000),
          rewardGold: intOf(m.rewardGold, 0, 1_000_000),
          rewardDiamonds: intOf(m.rewardDiamonds, 0, 100_000),
          rewardItemId: m.rewardItemId ? String(m.rewardItemId) : null,
          active: m.active === undefined ? true : Boolean(m.active),
        };
        await db.insert(missions).values(values).onConflictDoUpdate({ target: missions.key, set: values });
        await logAdmin(admin.id, admin.displayName, "mission.save", "mission", key, {});
        return Response.json({ ok: true });
      }
      if (op === "delete") {
        const key = String(body.key || "");
        await db.delete(missions).where(eq(missions.key, key));
        await logAdmin(admin.id, admin.displayName, "mission.delete", "mission", key, {});
        return Response.json({ ok: true });
      }
    }

    if (section === "assets" && op === "validate") {
      const health = await validateAssets();
      return Response.json({ ok: true, health });
    }

    return bad("Unknown operation", 400);
  } catch (err) {
    return errorResponse(err);
  }
}

/* ------------------------------------------------------------- helpers */
function sanitizeStats(raw: unknown, category: string) {
  const s = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (category === "weapon" || category === "throwable" || category === "skin") {
    if (s.weaponId) out.weaponId = String(s.weaponId).slice(0, 40);
    if (s.tint !== undefined) out.tint = Number(s.tint) || 0;
  }
  if (category === "helmet" || category === "vest") out.armor = intOf(s.armor, 0, 200);
  if (category === "consumable") out.heal = intOf(s.heal, 0, 500);
  if (category === "backpack") out.capacity = Math.min(3, Math.max(1, Number(s.capacity) || 1));
  if (category === "outfit") {
    const v = (s.visual ?? {}) as Record<string, unknown>;
    out.visual = {
      body: Number(v.body) || 0xfdf6e3,
      accent: Number(v.accent) || 0xe2c89a,
      hat: ["none", "crown", "cap", "helmet", "bandana", "bubble", "horns", "visor", "hood"].includes(String(v.hat))
        ? String(v.hat)
        : "none",
      face: ["default", "angry", "cool", "happy", "ninja", "fierce"].includes(String(v.face)) ? String(v.face) : "default",
      extra: ["none", "backpack", "cape", "wings", "jetpack"].includes(String(v.extra)) ? String(v.extra) : "none",
      pattern: ["none", "camo", "stripes", "circuit", "scales"].includes(String(v.pattern)) ? String(v.pattern) : "none",
    };
  }
  return out;
}

function intOf(v: unknown, lo: number, hi: number) {
  const n = Math.floor(Number(v) || 0);
  return Math.max(lo, Math.min(hi, n));
}

function colorOf(v: unknown, fallback: string) {
  const s = String(v || "");
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback;
}

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

function errorResponse(err: unknown) {
  if (err instanceof AuthError) return Response.json({ ok: false, error: err.message }, { status: err.status });
  console.error("[admin]", err);
  return Response.json({ ok: false, error: "Admin request failed" }, { status: 500 });
}
