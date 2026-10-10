/**
 * EGG WARS - Authentication & session management.
 *
 * - Email + password  : scrypt hashes (never plaintext), server-side only.
 * - Google / Facebook : the client obtains a token from the provider SDK, the
 *                       server *verifies it with the provider* before trusting
 *                       any identity claim. Nothing is trusted from the client.
 * - Sessions          : opaque random tokens in an HttpOnly cookie.
 */
import "server-only";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

export const SESSION_COOKIE = "ew_session";
const SESSION_DAYS = 30;

export type SessionUser = typeof users.$inferSelect;

/* ----------------------------------------------------------- passwords */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/* ------------------------------------------------------------ sessions */
export async function createSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(sessions).values({ token, userId, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return token;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const rows = await db
      .select()
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
      .limit(1);
    if (!rows.length) return null;
    return rows[0].users;
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Not signed in", 401);
  if (user.banned) throw new AuthError(user.banReason || "This account is banned.", 403);
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "moderator") {
    throw new AuthError("Administrator access required", 403);
  }
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/* --------------------------------------------------------- oauth verify */
export type ExternalIdentity = {
  provider: "google" | "facebook";
  providerId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

/** Verifies a Google ID token server-side against Google's tokeninfo endpoint. */
export async function verifyGoogleIdToken(idToken: string): Promise<ExternalIdentity> {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new AuthError("Google sign-in is not configured on this server.", 503);
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new AuthError("Google token rejected", 401);
  const data = (await res.json()) as Record<string, string>;
  if (data.aud !== clientId) throw new AuthError("Google token audience mismatch", 401);
  if (!data.email) throw new AuthError("Google account has no email", 400);
  return {
    provider: "google",
    providerId: data.sub,
    email: data.email,
    name: data.name || data.email.split("@")[0],
    avatarUrl: data.picture || null,
  };
}

/** Verifies a Facebook access token server-side with the Graph API. */
export async function verifyFacebookToken(accessToken: string): Promise<ExternalIdentity> {
  const appId = process.env.FACEBOOK_APP_ID || process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    throw new AuthError("Facebook sign-in is not configured on this server.", 503);
  }
  const debug = await fetch(
    `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${appId}|${appSecret}`,
    { cache: "no-store" },
  );
  const debugJson = (await debug.json()) as { data?: { app_id?: string; is_valid?: boolean; user_id?: string } };
  if (!debugJson.data?.is_valid || debugJson.data.app_id !== appId) {
    throw new AuthError("Facebook token rejected", 401);
  }
  const me = await fetch(
    `https://graph.facebook.com/me?fields=id,name,email,picture.width(256)&access_token=${encodeURIComponent(accessToken)}`,
    { cache: "no-store" },
  );
  const profile = (await me.json()) as {
    id: string;
    name?: string;
    email?: string;
    picture?: { data?: { url?: string } };
  };
  return {
    provider: "facebook",
    providerId: profile.id,
    email: profile.email || `fb_${profile.id}@facebook.local`,
    name: profile.name || `Egg ${profile.id.slice(-4)}`,
    avatarUrl: profile.picture?.data?.url ?? null,
  };
}

export function authProviderStatus() {
  return {
    google: Boolean(process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID),
    googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
    facebook: Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
    facebookAppId: process.env.FACEBOOK_APP_ID || process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || "",
  };
}

export const sha256 = (s: Buffer | string) => createHash("sha256").update(s).digest("hex");

/** Public-safe projection of a user row (never leaks password hashes). */
export function publicUser(u: SessionUser) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    provider: u.provider,
    role: u.role,
    banned: u.banned,
    banReason: u.banReason,
    gold: u.gold,
    diamonds: u.diamonds,
    xp: u.xp,
    level: u.level,
    kills: u.kills,
    deaths: u.deaths,
    wins: u.wins,
    matches: u.matches,
    headshots: u.headshots,
    damageDealt: u.damageDealt,
    settings: u.settings ?? {},
    createdAt: u.createdAt,
  };
}
export type PublicUser = ReturnType<typeof publicUser>;
