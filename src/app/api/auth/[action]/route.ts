import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  AuthError,
  authProviderStatus,
  createSession,
  destroySession,
  getSessionUser,
  hashPassword,
  publicUser,
  verifyFacebookToken,
  verifyGoogleIdToken,
  verifyPassword,
  type ExternalIdentity,
} from "@/lib/auth";
import { ensureSeeded, grantDefaultLoadout } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ action: string }> };

function fail(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

export async function GET(_req: Request, ctx: Ctx) {
  const { action } = await ctx.params;
  if (action === "providers") {
    const s = authProviderStatus();
    return Response.json({
      ok: true,
      google: s.google,
      googleClientId: s.googleClientId,
      facebook: s.facebook,
      facebookAppId: s.facebookAppId,
    });
  }
  if (action === "me") {
    await ensureSeeded();
    const user = await getSessionUser();
    return Response.json({ ok: true, user: user ? publicUser(user) : null });
  }
  return fail("Unknown endpoint", 404);
}

export async function POST(req: Request, ctx: Ctx) {
  const { action } = await ctx.params;
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as Record<string, string>;

    if (action === "logout") {
      await destroySession();
      return Response.json({ ok: true });
    }

    if (action === "signup") {
      const email = String(body.email || "").trim();
      const password = String(body.password || "");
      const displayName = String(body.displayName || "").trim() || email.split("@")[0];
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Enter a valid email address");
      if (password.length < 8) return fail("Password must be at least 8 characters");
      if (displayName.length < 3 || displayName.length > 20) return fail("Name must be 3-20 characters");
      const lower = email.toLowerCase();
      const existing = await db.select({ id: users.id }).from(users).where(eq(users.emailLower, lower)).limit(1);
      if (existing.length) return fail("An account with that email already exists", 409);
      const [created] = await db
        .insert(users)
        .values({ email, emailLower: lower, displayName, passwordHash: hashPassword(password), provider: "email" })
        .returning();
      await grantDefaultLoadout(created.id);
      await createSession(created.id);
      return Response.json({ ok: true, user: publicUser(created) });
    }

    if (action === "login") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const rows = await db.select().from(users).where(eq(users.emailLower, email)).limit(1);
      if (!rows.length || !verifyPassword(password, rows[0].passwordHash)) {
        return fail("Incorrect email or password", 401);
      }
      if (rows[0].banned) return fail(rows[0].banReason || "This account is banned.", 403);
      await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, rows[0].id));
      await createSession(rows[0].id);
      return Response.json({ ok: true, user: publicUser(rows[0]) });
    }

    if (action === "guest") {
      const n = Math.floor(Math.random() * 1_000_000);
      const email = `guest_${Date.now()}_${n}@guest.local`;
      const [created] = await db
        .insert(users)
        .values({
          email,
          emailLower: email,
          displayName: `Guest_${String(n).padStart(6, "0")}`,
          provider: "guest",
          gold: 1500,
          diamonds: 10,
        })
        .returning();
      await grantDefaultLoadout(created.id);
      await createSession(created.id);
      return Response.json({ ok: true, user: publicUser(created) });
    }

    if (action === "google" || action === "facebook") {
      let identity: ExternalIdentity;
      if (action === "google") identity = await verifyGoogleIdToken(String(body.credential || body.idToken || ""));
      else identity = await verifyFacebookToken(String(body.accessToken || ""));
      const user = await upsertExternal(identity);
      if (user.banned) return fail(user.banReason || "This account is banned.", 403);
      await createSession(user.id);
      return Response.json({ ok: true, user: publicUser(user) });
    }

    return fail("Unknown endpoint", 404);
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    console.error("[auth]", action, err);
    return fail("Authentication failed. Please try again.", 500);
  }
}

async function upsertExternal(identity: ExternalIdentity) {
  const lower = identity.email.toLowerCase();
  const existing = await db.select().from(users).where(eq(users.emailLower, lower)).limit(1);
  if (existing.length) {
    const [updated] = await db
      .update(users)
      .set({
        provider: identity.provider,
        providerId: identity.providerId,
        avatarUrl: identity.avatarUrl ?? existing[0].avatarUrl,
        lastSeenAt: new Date(),
      })
      .where(eq(users.id, existing[0].id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(users)
    .values({
      email: identity.email,
      emailLower: lower,
      displayName: identity.name.slice(0, 20),
      provider: identity.provider,
      providerId: identity.providerId,
      avatarUrl: identity.avatarUrl,
    })
    .returning();
  await grantDefaultLoadout(created.id);
  return created;
}
