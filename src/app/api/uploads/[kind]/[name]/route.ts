import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_ROOT, sniffImage } from "@/lib/assets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Serves runtime-uploaded assets.
 *
 * `next start` only serves files that existed in /public at build time, so
 * admin icons and payment screenshots uploaded after deployment are streamed
 * through this handler instead. A rewrite maps /uploads/:kind/:name here, so
 * stored URLs stay stable and human-readable.
 *
 * Hardening: strict name/kind patterns + a realpath containment check, so a
 * crafted URL can never escape the uploads directory.
 */
const SAFE_KIND = /^[a-z0-9-]{2,24}$/;
const SAFE_NAME = /^[a-z0-9_]+\.(png|jpg|jpeg|webp|gif)$/i;

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string; name: string }> }) {
  const { kind, name } = await ctx.params;
  if (!SAFE_KIND.test(kind) || !SAFE_NAME.test(name)) {
    return new Response("Not found", { status: 404 });
  }
  const abs = path.join(UPLOAD_ROOT, kind, name);
  if (!abs.startsWith(UPLOAD_ROOT + path.sep)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const info = await stat(abs);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
    const buf = await readFile(abs);
    // Re-verify the bytes really are an image before handing them to a browser.
    const sniff = sniffImage(buf);
    if (!sniff.ok) return new Response("Invalid asset", { status: 422 });
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": MIME[name.split(".").pop()!.toLowerCase()] ?? sniff.mime,
        "Content-Length": String(buf.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
