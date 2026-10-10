/**
 * EGG WARS - Shared deterministic math & collision.
 *
 * This module is intentionally free of any rendering-engine import so the exact
 * same code runs in the browser (client prediction) and in Node.js (the
 * authoritative multiplayer server). Keeping one implementation avoids the
 * classic "client thinks it hit, server disagrees" class of bugs.
 */

export type Vec3 = { x: number; y: number; z: number };

/** Axis aligned box collider: centre + half extents. */
export type Box = {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
};

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Shortest signed angular difference, result in (-PI, PI]. */
export function angleDelta(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function lerpAngle(a: number, b: number, t: number) {
  return a + angleDelta(a, b) * clamp(t, 0, 1);
}

export function dist2D(a: Vec3, b: Vec3) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

export function dist3D(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Mulberry32 — tiny deterministic PRNG so client & server build identical maps. */
export function makeRng(seed: number) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function boxContainsXZ(b: Box, x: number, z: number, pad = 0) {
  return (
    x >= b.cx - b.hx - pad &&
    x <= b.cx + b.hx + pad &&
    z >= b.cz - b.hz - pad &&
    z <= b.cz + b.hz + pad
  );
}

/**
 * Resolve a vertical-cylinder "character capsule" against static boxes.
 * Position is at the character's feet. Returns the corrected position plus
 * grounded state. Axis-separated resolution keeps players from tunnelling
 * through geometry or getting wedged in corners.
 */
export function resolveCharacter(
  pos: Vec3,
  vel: Vec3,
  radius: number,
  height: number,
  boxes: Box[],
  dt: number,
): { pos: Vec3; vel: Vec3; grounded: boolean } {
  const out = { x: pos.x, y: pos.y, z: pos.z };
  const vout = { x: vel.x, y: vel.y, z: vel.z };
  let grounded = false;

  // --- Horizontal (X then Z) ---
  out.x += vout.x * dt;
  for (const b of boxes) {
    if (!overlapsCylinder(out, radius, height, b)) continue;
    const pen = out.x - b.cx;
    if (pen > 0) out.x = b.cx + b.hx + radius + 1e-4;
    else out.x = b.cx - b.hx - radius - 1e-4;
    vout.x = 0;
  }

  out.z += vout.z * dt;
  for (const b of boxes) {
    if (!overlapsCylinder(out, radius, height, b)) continue;
    const pen = out.z - b.cz;
    if (pen > 0) out.z = b.cz + b.hz + radius + 1e-4;
    else out.z = b.cz - b.hz - radius - 1e-4;
    vout.z = 0;
  }

  // --- Vertical ---
  out.y += vout.y * dt;
  for (const b of boxes) {
    if (!overlapsCylinder(out, radius, height, b)) continue;
    const top = b.cy + b.hy;
    const bottom = b.cy - b.hy;
    if (vout.y <= 0 && out.y + height * 0.5 > top) {
      // landing on top of the box
      out.y = top;
      vout.y = 0;
      grounded = true;
    } else {
      // bumped head
      out.y = bottom - height - 1e-4;
      if (vout.y > 0) vout.y = 0;
    }
  }

  if (out.y <= 0) {
    out.y = 0;
    if (vout.y < 0) vout.y = 0;
    grounded = true;
  }

  return { pos: out, vel: vout, grounded };
}

function overlapsCylinder(p: Vec3, radius: number, height: number, b: Box) {
  const top = p.y + height;
  if (top <= b.cy - b.hy || p.y >= b.cy + b.hy) return false;
  const nx = clamp(p.x, b.cx - b.hx, b.cx + b.hx);
  const nz = clamp(p.z, b.cz - b.hz, b.cz + b.hz);
  const dx = p.x - nx;
  const dz = p.z - nz;
  return dx * dx + dz * dz < radius * radius;
}

/** Slab-method ray/AABB. Returns hit distance or Infinity. */
export function rayBox(origin: Vec3, dir: Vec3, b: Box, maxDist: number): number {
  let tmin = 0;
  let tmax = maxDist;
  const o = [origin.x, origin.y, origin.z];
  const d = [dir.x, dir.y, dir.z];
  const c = [b.cx, b.cy, b.cz];
  const h = [b.hx, b.hy, b.hz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < c[i] - h[i] || o[i] > c[i] + h[i]) return Infinity;
    } else {
      const inv = 1 / d[i];
      let t1 = (c[i] - h[i] - o[i]) * inv;
      let t2 = (c[i] + h[i] - o[i]) * inv;
      if (t1 > t2) [t1, t2] = [t2, t1];
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

/** Ray vs sphere (used for head / body hit spheres). */
export function raySphere(origin: Vec3, dir: Vec3, c: Vec3, r: number, maxDist: number): number {
  const ox = origin.x - c.x;
  const oy = origin.y - c.y;
  const oz = origin.z - c.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc);
  const t0 = -b - sq;
  const t1 = -b + sq;
  const t = t0 >= 0 ? t0 : t1;
  if (t < 0 || t > maxDist) return Infinity;
  return t;
}

/** Nearest world-geometry distance along a ray (walls block bullets & vision). */
export function rayWorld(origin: Vec3, dir: Vec3, boxes: Box[], maxDist: number): number {
  let best = maxDist;
  for (const b of boxes) {
    const t = rayBox(origin, dir, b, best);
    if (t < best) best = t;
  }
  return best;
}

export function hasLineOfSight(a: Vec3, b: Vec3, boxes: Box[]): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.001) return true;
  const dir = { x: dx / len, y: dy / len, z: dz / len };
  return rayWorld(a, dir, boxes, len) >= len - 0.05;
}
