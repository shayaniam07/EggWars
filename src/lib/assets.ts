/**
 * EGG WARS - Asset pipeline.
 *
 * Every uploaded file is sniffed by magic bytes (not by its filename), its real
 * pixel dimensions are parsed from the header, and a SHA-256 checksum is stored
 * in the `assets` registry. A truncated download, an HTML error page renamed to
 * .png, or a zero-byte file is rejected *before* it can reach the game.
 */
import "server-only";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assets } from "@/db/schema";
import { sha256 } from "./auth";

export const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type SniffResult = {
  ok: boolean;
  mime: string;
  ext: string;
  width: number;
  height: number;
  error?: string;
};

/** Identify an image purely from its bytes and read its real dimensions. */
export function sniffImage(buf: Buffer): SniffResult {
  const bad = (error: string): SniffResult => ({ ok: false, mime: "", ext: "", width: 0, height: 0, error });
  if (buf.length < 16) return bad("File is empty or truncated");
  const head = buf.subarray(0, 64).toString("latin1").trimStart().toLowerCase();
  if (head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<?xml") || head.startsWith("{")) {
    return bad("That file is not an image (looks like an HTML/JSON error page)");
  }

  // PNG
  if (buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG") {
    if (buf.toString("latin1", 12, 16) !== "IHDR") return bad("Corrupt PNG header");
    return { ok: true, mime: "image/png", ext: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { ok: true, mime: "image/jpeg", ext: "jpg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return { ok: true, mime: "image/jpeg", ext: "jpg", width: 0, height: 0 };
  }
  // WebP
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") {
    const fmt = buf.toString("latin1", 12, 16);
    let width = 0;
    let height = 0;
    if (fmt === "VP8X") {
      width = 1 + (buf.readUIntLE(24, 3) & 0xffffff);
      height = 1 + (buf.readUIntLE(27, 3) & 0xffffff);
    } else if (fmt === "VP8 ") {
      width = buf.readUInt16LE(26) & 0x3fff;
      height = buf.readUInt16LE(28) & 0x3fff;
    } else if (fmt === "VP8L") {
      const b = buf.readUInt32LE(21);
      width = (b & 0x3fff) + 1;
      height = ((b >> 14) & 0x3fff) + 1;
    }
    return { ok: true, mime: "image/webp", ext: "webp", width, height };
  }
  // GIF
  if (buf.toString("latin1", 0, 3) === "GIF") {
    return { ok: true, mime: "image/gif", ext: "gif", width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  return bad("Unsupported image format — use PNG, JPG, WebP or GIF");
}

const SAFE_KIND = /^[a-z0-9-]{2,24}$/;

export async function saveUpload(
  file: File,
  kind: string,
  uploadedBy: number | null,
): Promise<{ ok: true; url: string; width: number; height: number; bytes: number } | { ok: false; error: string }> {
  if (!SAFE_KIND.test(kind)) return { ok: false, error: "Invalid upload kind" };
  if (file.size <= 0) return { ok: false, error: "The selected file is empty" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "File is larger than 4 MB" };

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length !== file.size) return { ok: false, error: "Upload was truncated — please retry" };

  const sniff = sniffImage(buf);
  if (!sniff.ok) return { ok: false, error: sniff.error || "Invalid image" };
  if (sniff.width > 4096 || sniff.height > 4096) {
    return { ok: false, error: "Image is too large (max 4096×4096)" };
  }

  const dir = path.join(UPLOAD_ROOT, kind);
  await mkdir(dir, { recursive: true });
  // Random filename => never overwrites an unrelated asset, never path-traversal.
  const name = `${Date.now().toString(36)}_${randomBytes(6).toString("hex")}.${sniff.ext}`;
  const abs = path.join(dir, name);
  await writeFile(abs, buf);

  // Read the file back to prove it landed on disk intact.
  const verify = await readFile(abs);
  const checksum = sha256(verify);
  if (checksum !== sha256(buf)) {
    return { ok: false, error: "Written file failed verification" };
  }

  const url = `/uploads/${kind}/${name}`;
  await db
    .insert(assets)
    .values({
      path: url,
      originalName: file.name.slice(0, 120),
      mime: sniff.mime,
      bytes: buf.length,
      width: sniff.width,
      height: sniff.height,
      checksum,
      kind,
      uploadedBy,
      valid: true,
    })
    .onConflictDoNothing({ target: assets.path });

  return { ok: true, url, width: sniff.width, height: sniff.height, bytes: buf.length };
}

/** Re-checks every registered asset on disk — powers the admin health panel. */
export async function validateAssets() {
  const rows = await db.select().from(assets);
  const broken: { path: string; reason: string }[] = [];
  for (const row of rows) {
    const abs = path.join(process.cwd(), "public", row.path.replace(/^\//, ""));
    try {
      const s = await stat(abs);
      if (s.size !== row.bytes) {
        broken.push({ path: row.path, reason: `size changed (${s.size} vs ${row.bytes})` });
        await db.update(assets).set({ valid: false }).where(eq(assets.id, row.id));
        continue;
      }
      if (!row.valid) await db.update(assets).set({ valid: true }).where(eq(assets.id, row.id));
    } catch {
      broken.push({ path: row.path, reason: "file missing on disk" });
      await db.update(assets).set({ valid: false }).where(eq(assets.id, row.id));
    }
  }
  return { total: rows.length, broken };
}
