import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { inventory, items, matchResults, missionProgress, missions, paymentRequests, users } from "@/db/schema";
import { AuthError, publicUser, requireUser } from "@/lib/auth";
import { ensureSeeded, logAdmin, periodKey } from "@/lib/bootstrap";
import { awardMatch, clampInt } from "@/lib/progress";
import { DIAMOND_PACKS } from "@/shared/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SLOT_CATEGORIES = new Set(["outfit", "helmet", "vest", "backpack", "skin"]);

/* ------------------------------------------------------------------ GET */
export async function GET() {
  try {
    await ensureSeeded();
    const user = await requireUser();
    const [inv, prog, recent, payments] = await Promise.all([
      db.select().from(inventory).where(eq(inventory.userId, user.id)),
      db.select().from(missionProgress).where(eq(missionProgress.userId, user.id)),
      db.select().from(matchResults).where(eq(matchResults.userId, user.id)).orderBy(desc(matchResults.createdAt)).limit(10),
      db.select().from(paymentRequests).where(eq(paymentRequests.userId, user.id)).orderBy(desc(paymentRequests.createdAt)).limit(10),
    ]);
    return Response.json({
      ok: true,
      user: publicUser(user),
      inventory: inv,
      missionProgress: prog,
      recentMatches: recent,
      payments,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/* ----------------------------------------------------------------- POST */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "");

    switch (action) {
      case "equip":
        return await equip(user.id, String(body.itemId || ""));
      case "buy":
        return await buy(user.id, String(body.itemId || ""), String(body.currency || "gold"));
      case "claim":
        return await claim(user.id, String(body.missionKey || ""));
      case "match":
        return await submitMatch(user.id, body);
      case "settings": {
        const settings = (body.settings ?? {}) as Record<string, unknown>;
        const [updated] = await db.update(users).set({ settings }).where(eq(users.id, user.id)).returning();
        return Response.json({ ok: true, user: publicUser(updated) });
      }
      case "topup":
        return await topUp(user.id, body);
      default:
        return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return errorResponse(err);
  }
}

/* ------------------------------------------------------------- handlers */
async function equip(userId: number, itemId: string) {
  const owned = await db
    .select()
    .from(inventory)
    .where(and(eq(inventory.userId, userId), eq(inventory.itemId, itemId)))
    .limit(1);
  if (!owned.length) return Response.json({ ok: false, error: "You do not own that item" }, { status: 403 });
  const [item] = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
  if (!item || !item.enabled) return Response.json({ ok: false, error: "Item unavailable" }, { status: 404 });

  if (SLOT_CATEGORIES.has(item.category)) {
    // one equipped item per exclusive slot
    const sameCat = await db
      .select({ id: inventory.id, itemId: inventory.itemId })
      .from(inventory)
      .innerJoin(items, eq(items.id, inventory.itemId))
      .where(and(eq(inventory.userId, userId), eq(items.category, item.category)));
    const ids = sameCat.map((r) => r.itemId);
    if (ids.length) {
      await db
        .update(inventory)
        .set({ equipped: false })
        .where(and(eq(inventory.userId, userId), inArray(inventory.itemId, ids)));
    }
  }
  await db
    .update(inventory)
    .set({ equipped: true })
    .where(and(eq(inventory.userId, userId), eq(inventory.itemId, itemId)));
  const inv = await db.select().from(inventory).where(eq(inventory.userId, userId));
  return Response.json({ ok: true, inventory: inv });
}

async function buy(userId: number, itemId: string, currency: string) {
  const [item] = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
  if (!item || !item.enabled) return Response.json({ ok: false, error: "Item unavailable" }, { status: 404 });
  if (item.unlock !== "shop") {
    return Response.json({ ok: false, error: "This item cannot be purchased" }, { status: 403 });
  }
  const already = await db
    .select({ id: inventory.id })
    .from(inventory)
    .where(and(eq(inventory.userId, userId), eq(inventory.itemId, itemId)))
    .limit(1);
  if (already.length) return Response.json({ ok: false, error: "Already owned" }, { status: 409 });

  const [me] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const useDiamonds = currency === "diamonds";
  const price = useDiamonds ? item.priceDiamonds : item.priceGold;
  if (price <= 0) {
    return Response.json({ ok: false, error: "Item is not sold for that currency" }, { status: 400 });
  }
  if (useDiamonds ? me.diamonds < price : me.gold < price) {
    return Response.json({ ok: false, error: "Not enough " + (useDiamonds ? "diamonds" : "gold coins") }, { status: 402 });
  }

  const [updated] = await db
    .update(users)
    .set(useDiamonds ? { diamonds: me.diamonds - price } : { gold: me.gold - price })
    .where(eq(users.id, userId))
    .returning();
  await db.insert(inventory).values({ userId, itemId, source: "shop" }).onConflictDoNothing();
  const inv = await db.select().from(inventory).where(eq(inventory.userId, userId));
  return Response.json({ ok: true, user: publicUser(updated), inventory: inv });
}

async function claim(userId: number, missionKey: string) {
  const [mission] = await db.select().from(missions).where(eq(missions.key, missionKey)).limit(1);
  if (!mission || !mission.active) return Response.json({ ok: false, error: "Mission unavailable" }, { status: 404 });
  const pk = periodKey(mission.type);
  const [row] = await db
    .select()
    .from(missionProgress)
    .where(
      and(
        eq(missionProgress.userId, userId),
        eq(missionProgress.missionKey, missionKey),
        eq(missionProgress.periodKey, pk),
      ),
    )
    .limit(1);
  const progress = row?.progress ?? 0;
  if (row?.claimed) return Response.json({ ok: false, error: "Reward already claimed" }, { status: 409 });
  if (progress < mission.goal) return Response.json({ ok: false, error: "Mission not complete yet" }, { status: 400 });

  await db
    .insert(missionProgress)
    .values({ userId, missionKey, periodKey: pk, progress, claimed: true })
    .onConflictDoUpdate({
      target: [missionProgress.userId, missionProgress.missionKey, missionProgress.periodKey],
      set: { claimed: true, updatedAt: new Date() },
    });

  const [me] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [updated] = await db
    .update(users)
    .set({ gold: me.gold + mission.rewardGold, diamonds: me.diamonds + mission.rewardDiamonds })
    .where(eq(users.id, userId))
    .returning();
  if (mission.rewardItemId) {
    await db
      .insert(inventory)
      .values({ userId, itemId: mission.rewardItemId, source: "mission" })
      .onConflictDoNothing();
  }
  const [inv, prog] = await Promise.all([
    db.select().from(inventory).where(eq(inventory.userId, userId)),
    db.select().from(missionProgress).where(eq(missionProgress.userId, userId)),
  ]);
  return Response.json({
    ok: true,
    user: publicUser(updated),
    inventory: inv,
    missionProgress: prog,
    reward: { gold: mission.rewardGold, diamonds: mission.rewardDiamonds, itemId: mission.rewardItemId },
  });
}

/**
 * Offline results are reported by the client, so they are clamped to sane
 * values and rewards are capped (see lib/progress). Multiplayer results are
 * taken from the authoritative arena server instead (see /api/mp/result).
 */
async function submitMatch(userId: number, body: Record<string, unknown>) {
  const result = await awardMatch(userId, {
    mode: "offline",
    mapId: String(body.mapId || "island"),
    difficulty: String(body.difficulty || "medium"),
    kills: clampInt(body.kills, 0, 100),
    deaths: clampInt(body.deaths, 0, 100),
    headshots: clampInt(body.headshots, 0, 300),
    damage: clampInt(body.damage, 0, 40000),
    placement: clampInt(body.placement, 0, 64),
    won: Boolean(body.won),
    durationSec: clampInt(body.durationSec, 0, 7200),
  });
  return Response.json({ ok: true, ...result });
}

async function topUp(userId: number, body: Record<string, unknown>) {
  const methodId = String(body.methodId || "");
  const packId = String(body.packId || "");
  const txRef = String(body.txRef || "").slice(0, 120);
  const screenshotUrl = String(body.screenshotUrl || "");
  const pack = DIAMOND_PACKS.find((p) => p.id === packId);
  if (!pack) return Response.json({ ok: false, error: "Choose a diamond pack" }, { status: 400 });
  if (!methodId) return Response.json({ ok: false, error: "Choose a payment method" }, { status: 400 });
  if (!screenshotUrl.startsWith("/uploads/")) {
    return Response.json({ ok: false, error: "Upload your payment screenshot first" }, { status: 400 });
  }
  const [created] = await db
    .insert(paymentRequests)
    .values({
      userId,
      methodId,
      packId,
      amountUsd: pack.usd,
      diamondsRequested: pack.diamonds + pack.bonus,
      txRef,
      screenshotUrl,
      status: "pending",
    })
    .returning();
  await logAdmin(userId, "player", "payment.requested", "payment", String(created.id), {
    packId,
    usd: pack.usd,
    diamonds: pack.diamonds + pack.bonus,
  });
  const payments = await db
    .select()
    .from(paymentRequests)
    .where(eq(paymentRequests.userId, userId))
    .orderBy(desc(paymentRequests.createdAt))
    .limit(10);
  return Response.json({ ok: true, payments });
}

function errorResponse(err: unknown) {
  if (err instanceof AuthError) return Response.json({ ok: false, error: err.message }, { status: err.status });
  console.error("[player]", err);
  return Response.json({ ok: false, error: "Request failed" }, { status: 500 });
}
