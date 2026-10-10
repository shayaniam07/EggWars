import { AuthError, requireAdmin, requireUser } from "@/lib/auth";
import { saveUpload } from "@/lib/assets";
import { ensureSeeded, logAdmin } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Validated file upload.
 *  kind="payment"   -> any signed-in player (Binance receipt screenshots)
 *  kind="item-icon" -> administrators only
 */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const form = await req.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "item-icon");
    if (!(file instanceof File)) {
      return Response.json({ ok: false, error: "No file received" }, { status: 400 });
    }

    const user = kind === "payment" ? await requireUser() : await requireAdmin();
    const result = await saveUpload(file, kind, user.id);
    if (!result.ok) return Response.json(result, { status: 400 });

    if (kind !== "payment") {
      await logAdmin(user.id, user.displayName, "asset.upload", "asset", result.url, {
        bytes: result.bytes,
        width: result.width,
        height: result.height,
      });
    }
    return Response.json(result);
  } catch (err) {
    if (err instanceof AuthError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    console.error("[upload]", err);
    return Response.json({ ok: false, error: "Upload failed" }, { status: 500 });
  }
}
