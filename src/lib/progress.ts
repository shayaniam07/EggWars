/**
 * EGG WARS - Progression, rewards and mission tracking.
 * Shared by the player API (offline results) and the multiplayer result
 * endpoint (server-derived results). Rewards are always computed here.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchResults, missionProgress, missions, users } from "@/db/schema";
import { periodKey } from "./bootstrap";
import { publicUser } from "./auth";
import { DIFFICULTIES, type Difficulty } from "@/shared/weapons";

export type MatchPayload = {
  mode: string;
  mapId: string;
  difficulty?: string;
  kills: number;
  deaths: number;
  headshots: number;
  damage: number;
  placement: number;
  won: boolean;
  durationSec: number;
};

export function clampInt(v: unknown, lo: number, hi: number) {
  const n = Math.floor(Number(v) || 0);
  return Math.max(lo, Math.min(hi, n));
}

export async function bumpMissions(userId: number, deltas: Record<string, number>) {
  const active = await db.select().from(missions).where(eq(missions.active, true));
  for (const m of active) {
    const delta = deltas[m.metric] ?? 0;
    if (delta <= 0) continue;
    const pk = periodKey(m.type);
    const [row] = await db
      .select()
      .from(missionProgress)
      .where(
        and(
          eq(missionProgress.userId, userId),
          eq(missionProgress.missionKey, m.key),
          eq(missionProgress.periodKey, pk),
        ),
      )
      .limit(1);
    const next = Math.min(m.goal, (row?.progress ?? 0) + delta);
    await db
      .insert(missionProgress)
      .values({ userId, missionKey: m.key, periodKey: pk, progress: next })
      .onConflictDoUpdate({
        target: [missionProgress.userId, missionProgress.missionKey, missionProgress.periodKey],
        set: { progress: next, updatedAt: new Date() },
      });
  }
}

export async function awardMatch(userId: number, raw: MatchPayload) {
  const kills = clampInt(raw.kills, 0, 100);
  const deaths = clampInt(raw.deaths, 0, 100);
  const headshots = clampInt(raw.headshots, 0, Math.max(1, kills) * 3);
  const damage = clampInt(raw.damage, 0, 40000);
  const durationSec = clampInt(raw.durationSec, 0, 7200);
  const placement = clampInt(raw.placement, 0, 64);
  const difficulty = (raw.difficulty || "medium") as Difficulty;
  const diff = DIFFICULTIES[difficulty] ?? DIFFICULTIES.medium;
  const mult = raw.mode === "multiplayer" ? 1.3 : diff.rewardMult;

  let gold = Math.round((40 + kills * 22 + damage / 24 + (raw.won ? 220 : 0)) * mult);
  if (durationSec < 20) gold = Math.min(gold, 25); // anti-farm guard
  gold = Math.min(gold, 1800);

  const [me] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!me) throw new Error("User not found");
  const xp = kills * 12 + (raw.won ? 150 : 40);
  const totalXp = me.xp + xp;

  const [updated] = await db
    .update(users)
    .set({
      gold: me.gold + gold,
      xp: totalXp,
      level: Math.max(1, Math.floor(totalXp / 1000) + 1),
      kills: me.kills + kills,
      deaths: me.deaths + deaths,
      wins: me.wins + (raw.won ? 1 : 0),
      matches: me.matches + 1,
      headshots: me.headshots + headshots,
      damageDealt: me.damageDealt + damage,
      lastSeenAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  await db.insert(matchResults).values({
    userId,
    mode: raw.mode,
    mapId: raw.mapId,
    difficulty: raw.difficulty ?? null,
    kills,
    deaths,
    headshots,
    damage,
    placement,
    won: raw.won,
    durationSec,
    rewardGold: gold,
  });

  await bumpMissions(userId, {
    kills,
    matches: 1,
    wins: raw.won ? 1 : 0,
    headshots,
    damage,
    login: 1,
  });

  const prog = await db.select().from(missionProgress).where(eq(missionProgress.userId, userId));
  return { user: publicUser(updated), rewardGold: gold, xp, missionProgress: prog };
}
