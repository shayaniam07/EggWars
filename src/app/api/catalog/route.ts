import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { items, missions, paymentMethods } from "@/db/schema";
import { ensureSeeded } from "@/lib/bootstrap";
import { DIAMOND_PACKS, GAME_NAME, GAME_TAGLINE } from "@/shared/catalog";
import { MAP_THEMES } from "@/shared/maps";
import { DIFFICULTIES, WEAPONS } from "@/shared/weapons";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public game catalog. Admin-created items appear here immediately, which is
 * how the admin panel "syncs" with the live game (shop, inventory, world loot
 * and the character screen all read this endpoint).
 */
export async function GET() {
  try {
    await ensureSeeded();
    const [allItems, allMissions, methods] = await Promise.all([
      db.select().from(items).orderBy(asc(items.category), asc(items.priceGold)),
      db.select().from(missions).where(eq(missions.active, true)),
      db.select().from(paymentMethods).where(eq(paymentMethods.enabled, true)).orderBy(asc(paymentMethods.sortOrder)),
    ]);

    return Response.json({
      ok: true,
      gameName: GAME_NAME,
      tagline: GAME_TAGLINE,
      items: allItems.filter((i) => i.enabled),
      missions: allMissions,
      paymentMethods: methods.map((m) => ({
        id: m.id,
        name: m.name,
        kind: m.kind,
        address: m.address,
        instructions: m.instructions,
        qrUrl: m.qrUrl,
      })),
      diamondPacks: DIAMOND_PACKS,
      maps: MAP_THEMES.map((m) => ({ id: m.id, name: m.name, blurb: m.blurb, emoji: m.emoji })),
      difficulties: Object.values(DIFFICULTIES).map((d) => ({
        id: d.id,
        label: d.label,
        color: d.color,
        botCount: d.botCount,
      })),
      weapons: Object.values(WEAPONS).map((w) => ({
        id: w.id,
        name: w.name,
        cls: w.cls,
        damage: w.damage,
        rps: w.rps,
        mag: w.mag,
        reloadSec: w.reloadSec,
        range: w.range,
        emoji: w.emoji,
      })),
    });
  } catch (err) {
    console.error("[catalog]", err);
    return Response.json({ ok: false, error: "Catalog unavailable" }, { status: 500 });
  }
}
