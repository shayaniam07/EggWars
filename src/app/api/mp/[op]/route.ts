import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { inventory, items } from "@/db/schema";
import { AuthError, requireUser } from "@/lib/auth";
import { ensureSeeded } from "@/lib/bootstrap";
import { awardMatch } from "@/lib/progress";
import {
  applyInput,
  chat,
  createRoom,
  findRoom,
  heartbeat,
  joinRoom,
  leaveRoom,
  listRooms,
  privateState,
  quickMatch,
  requestFire,
  requestReload,
  serialize,
  subscribe,
  switchWeapon,
  type RoomMode,
} from "@/server/arena";
import { getWeapon } from "@/shared/weapons";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ op: string }> };

/* ------------------------------------------------------------------ GET */
export async function GET(req: Request, ctx: Ctx) {
  const { op } = await ctx.params;
  const url = new URL(req.url);

  if (op === "rooms") {
    return Response.json({ ok: true, rooms: listRooms(), serverTime: Date.now() });
  }

  if (op === "stream") {
    const roomId = url.searchParams.get("room") || "";
    const playerId = url.searchParams.get("player") || "";
    const secret = url.searchParams.get("secret") || "";
    const room = findRoom(roomId);
    if (!room) return Response.json({ ok: false, error: "Room not found" }, { status: 404 });
    try {
      heartbeat(room, playerId, secret);
    } catch {
      return Response.json({ ok: false, error: "Invalid session" }, { status: 403 });
    }

    const encoder = new TextEncoder();
    let unsubscribe = () => {};
    let keepAlive: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream({
      start(controller) {
        const send = (payload: string) => controller.enqueue(encoder.encode(payload));
        send(`retry: 2000\n\n`);
        send(`data: ${JSON.stringify(serialize(room))}\n\n`);
        unsubscribe = subscribe(room, playerId, send);
        keepAlive = setInterval(() => {
          try {
            send(`: ping\n\n`);
            heartbeat(room, playerId, secret);
          } catch {
            /* client vanished; cleaned up on cancel */
          }
        }, 10000);
      },
      cancel() {
        unsubscribe();
        if (keepAlive) clearInterval(keepAlive);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  return Response.json({ ok: false, error: "Unknown endpoint" }, { status: 404 });
}

/* ----------------------------------------------------------------- POST */
export async function POST(req: Request, ctx: Ctx) {
  const { op } = await ctx.params;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    /* ---- join / create: requires a real signed-in account ---------- */
    if (op === "join") {
      await ensureSeeded();
      const user = await requireUser();
      const mapId = String(body.mapId || "island");
      const mode = (String(body.mode || "ffa") === "tdm" ? "tdm" : "ffa") as RoomMode;

      let room;
      if (body.roomId || body.code) {
        room = findRoom(String(body.roomId || body.code));
        if (!room) return bad("Room not found — check the invite code", 404);
      } else if (body.create) {
        room = createRoom({
          name: String(body.name || `${user.displayName}'s Arena`),
          mapId,
          mode,
          maxPlayers: Number(body.maxPlayers) || 10,
          isPrivate: Boolean(body.isPrivate),
        });
      } else {
        room = quickMatch(mapId, mode);
      }

      // Loadout + armour are resolved from the DB — the client cannot grant
      // itself weapons it does not own.
      const owned = await db
        .select({ itemId: inventory.itemId, category: items.category, stats: items.stats, equipped: inventory.equipped })
        .from(inventory)
        .innerJoin(items, eq(items.id, inventory.itemId))
        .where(and(eq(inventory.userId, user.id), eq(items.enabled, true)));

      const weaponIds = owned
        .filter((r) => r.category === "weapon" && r.stats?.weaponId)
        .map((r) => String(r.stats!.weaponId));
      const requested = Array.isArray(body.loadout) ? (body.loadout as string[]) : [];
      const loadout = requested.filter((w) => weaponIds.includes(w) && getWeapon(w).id === w).slice(0, 3);
      if (!loadout.length) loadout.push(...(weaponIds.length ? weaponIds.slice(0, 3) : ["cluck9"]));

      const armor = owned
        .filter((r) => r.equipped && (r.category === "helmet" || r.category === "vest"))
        .reduce((a, r) => a + (Number(r.stats?.armor) || 0), 0);
      const outfit = owned.find((r) => r.equipped && r.category === "outfit")?.itemId || "outfit_default";
      const skin = owned.find((r) => r.equipped && r.category === "skin")?.itemId || "";

      const { playerId, secret, team } = joinRoom(room, {
        userId: user.id,
        name: user.displayName,
        outfit,
        skin,
        loadout,
        armor: Math.min(100, armor),
      });
      return Response.json({
        ok: true,
        roomId: room.id,
        code: room.code,
        mapId: room.mapId,
        mode: room.mode,
        playerId,
        secret,
        team,
        loadout,
        snapshot: serialize(room),
      });
    }

    /* ---- in-match traffic ----------------------------------------- */
    const roomId = String(body.roomId || "");
    const playerId = String(body.playerId || "");
    const secret = String(body.secret || "");
    const room = findRoom(roomId);
    if (!room) return bad("Room not found", 404);

    if (op === "input") {
      const state = applyInput(room, playerId, secret, {
        pos: body.pos as { x: number; y: number; z: number },
        yaw: Number(body.yaw) || 0,
        pitch: Number(body.pitch) || 0,
        mv: Number(body.mv) || 0,
        crouch: Boolean(body.crouch),
        ads: Boolean(body.ads),
        grounded: Boolean(body.grounded),
        ping: Number(body.ping) || 0,
      });
      return Response.json({ ok: true, ...state, me: privateState(room, playerId, secret) });
    }

    if (op === "fire") {
      const shots = Math.min(4, Math.max(1, Number(body.shots) || 1));
      let last: unknown = null;
      for (let i = 0; i < shots; i++) {
        last = requestFire(room, playerId, secret, body.dir as { x: number; y: number; z: number });
      }
      return Response.json({ ok: true, result: last, me: privateState(room, playerId, secret) });
    }

    if (op === "reload") {
      requestReload(room, playerId, secret);
      return Response.json({ ok: true, me: privateState(room, playerId, secret) });
    }

    if (op === "switch") {
      switchWeapon(room, playerId, secret, String(body.weaponId || ""));
      return Response.json({ ok: true, me: privateState(room, playerId, secret) });
    }

    if (op === "chat") {
      chat(room, playerId, secret, String(body.message || ""));
      return Response.json({ ok: true });
    }

    if (op === "leave") {
      leaveRoom(room, playerId);
      return Response.json({ ok: true });
    }

    /* ---- results are read from the authoritative room, not the client */
    if (op === "result") {
      const user = await requireUser();
      const me = privateState(room, playerId, secret);
      const snap = serialize(room);
      const sorted = [...snap.players].sort((a, b) => b.k - a.k);
      const placement = Math.max(1, sorted.findIndex((p) => p.id === playerId) + 1);
      const result = await awardMatch(user.id, {
        mode: "multiplayer",
        mapId: room.mapId,
        kills: me.kills,
        deaths: me.deaths,
        headshots: me.headshots,
        damage: Math.round(me.damage),
        placement,
        won: placement === 1 && snap.players.length > 1,
        durationSec: 300,
      });
      return Response.json({ ok: true, ...result, placement });
    }

    return bad("Unknown endpoint", 404);
  } catch (err) {
    if (err instanceof AuthError) return bad(err.message, err.status);
    const message = err instanceof Error ? err.message : "Multiplayer request failed";
    return bad(message, 400);
  }
}

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}
