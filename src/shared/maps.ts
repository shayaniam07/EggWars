/**
 * EGG WARS - Deterministic procedural arenas.
 *
 * Maps are generated from a seed with a shared PRNG, so the browser renderer
 * and the authoritative server produce byte-identical collision geometry.
 * Nothing here depends on downloaded assets => maps can never "fail to load".
 */
import { type Box, type Vec3, makeRng } from "./physics";

export type PropKind =
  | "building"
  | "roof"
  | "crate"
  | "barrel"
  | "rock"
  | "tree"
  | "palm"
  | "wall"
  | "ramp"
  | "platform"
  | "tent"
  | "target"
  | "container";

export type Prop = {
  kind: PropKind;
  box: Box;
  color: number;
  accent?: number;
};

export type MapTheme = {
  id: string;
  name: string;
  blurb: string;
  half: number; // playable half-size in metres
  sky: number;
  fog: number;
  ground: number;
  groundAccent: number;
  sun: number;
  ambient: number;
  emoji: string;
};

export const MAP_THEMES: MapTheme[] = [
  {
    id: "island",
    name: "Yolk Island",
    blurb: "Beaches, beach huts and palm cover. Wide open fire lanes.",
    half: 72,
    sky: 0x7fd4ff,
    fog: 0xa9e6ff,
    ground: 0x66c27a,
    groundAccent: 0xe8d9a0,
    sun: 0xfff3d0,
    ambient: 0x9fd8ff,
    emoji: "🏝️",
  },
  {
    id: "desert",
    name: "Scramble Dunes",
    blurb: "Rocky outcrops, warehouses and elevated sniper nests.",
    half: 76,
    sky: 0xffd49b,
    fog: 0xf3cda0,
    ground: 0xdfb173,
    groundAccent: 0xb98a4f,
    sun: 0xfff0c0,
    ambient: 0xffd9a8,
    emoji: "🏜️",
  },
  {
    id: "urban",
    name: "Shell City",
    blurb: "Tight streets, alleys and rooftops. Close quarters chaos.",
    half: 64,
    sky: 0x9fb6d8,
    fog: 0xb9c7dd,
    ground: 0x6f7682,
    groundAccent: 0x4c525c,
    sun: 0xffffff,
    ambient: 0xaebfd8,
    emoji: "🏙️",
  },
  {
    id: "training",
    name: "The Coop",
    blurb: "Safe range with target dummies. Learn the controls here.",
    half: 44,
    sky: 0xbfe6ff,
    fog: 0xd6f0ff,
    ground: 0x8fd08f,
    groundAccent: 0xd9e8c0,
    sun: 0xffffff,
    ambient: 0xcfeaff,
    emoji: "🎯",
  },
];

export function getTheme(id: string): MapTheme {
  return MAP_THEMES.find((m) => m.id === id) ?? MAP_THEMES[0];
}

export type GeneratedMap = {
  theme: MapTheme;
  props: Prop[];
  colliders: Box[];
  spawns: Vec3[];
  loot: Vec3[];
};

const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): Box => ({
  cx,
  cy,
  cz,
  hx,
  hy,
  hz,
});

/** Build one arena. Pure + deterministic for a given (mapId, seed). */
export function buildMap(mapId: string, seed = 1337): GeneratedMap {
  const theme = getTheme(mapId);
  const rng = makeRng(seed + theme.id.length * 7919);
  const props: Prop[] = [];
  const spawns: Vec3[] = [];
  const loot: Vec3[] = [];
  const H = theme.half;

  // --- Playable boundary (solid, 8m tall) ---
  const t = 2;
  props.push({ kind: "wall", box: box(0, 4, -H, H + t, 4, t), color: 0x2f3d55 });
  props.push({ kind: "wall", box: box(0, 4, H, H + t, 4, t), color: 0x2f3d55 });
  props.push({ kind: "wall", box: box(-H, 4, 0, t, 4, H + t), color: 0x2f3d55 });
  props.push({ kind: "wall", box: box(H, 4, 0, t, 4, H + t), color: 0x2f3d55 });

  const pushBuilding = (x: number, z: number, w: number, d: number, h: number, color: number) => {
    props.push({ kind: "building", box: box(x, h / 2, z, w / 2, h / 2, d / 2), color });
    props.push({
      kind: "roof",
      box: box(x, h + 0.25, z, w / 2 + 0.4, 0.25, d / 2 + 0.4),
      color: 0x000000,
      accent: color,
    });
    loot.push({ x: x + w / 2 + 2.2, y: 0, z });
    loot.push({ x, y: h + 0.6, z });
  };

  if (theme.id === "island") {
    for (let i = 0; i < 9; i++) {
      const x = (rng() - 0.5) * H * 1.5;
      const z = (rng() - 0.5) * H * 1.5;
      pushBuilding(x, z, 9 + rng() * 7, 8 + rng() * 7, 4 + rng() * 4, [0xf0e2c0, 0xe8c9a0, 0xd9f0ee][i % 3]);
    }
    for (let i = 0; i < 34; i++) {
      const x = (rng() - 0.5) * H * 1.9;
      const z = (rng() - 0.5) * H * 1.9;
      props.push({ kind: "palm", box: box(x, 3.2, z, 0.45, 3.2, 0.45), color: 0x8a6230, accent: 0x3faf63 });
    }
    for (let i = 0; i < 22; i++) {
      const x = (rng() - 0.5) * H * 1.8;
      const z = (rng() - 0.5) * H * 1.8;
      props.push({ kind: "crate", box: box(x, 0.8, z, 0.8, 0.8, 0.8), color: 0xc98a4b });
      loot.push({ x: x + 1.6, y: 0, z });
    }
    for (let i = 0; i < 10; i++) {
      const x = (rng() - 0.5) * H * 1.7;
      const z = (rng() - 0.5) * H * 1.7;
      const r = 1.4 + rng() * 2.2;
      props.push({ kind: "rock", box: box(x, r * 0.6, z, r, r * 0.6, r), color: 0x8e9aa6 });
    }
  } else if (theme.id === "desert") {
    for (let i = 0; i < 7; i++) {
      const x = (rng() - 0.5) * H * 1.5;
      const z = (rng() - 0.5) * H * 1.5;
      pushBuilding(x, z, 11 + rng() * 9, 9 + rng() * 8, 4 + rng() * 5, [0xd8b489, 0xc49a6c, 0xe5cfa8][i % 3]);
    }
    for (let i = 0; i < 16; i++) {
      const x = (rng() - 0.5) * H * 1.85;
      const z = (rng() - 0.5) * H * 1.85;
      const r = 2 + rng() * 3.5;
      props.push({ kind: "rock", box: box(x, r * 0.55, z, r, r * 0.55, r * 0.8), color: 0xa9825a });
    }
    for (let i = 0; i < 12; i++) {
      const x = (rng() - 0.5) * H * 1.7;
      const z = (rng() - 0.5) * H * 1.7;
      props.push({ kind: "container", box: box(x, 1.4, z, 3.2, 1.4, 1.3), color: [0xc2543f, 0x3f7cc2, 0xd8a33f][i % 3] });
      loot.push({ x: x + 4, y: 0, z });
      loot.push({ x, y: 2.9, z });
    }
    for (let i = 0; i < 10; i++) {
      const x = (rng() - 0.5) * H * 1.6;
      const z = (rng() - 0.5) * H * 1.6;
      props.push({ kind: "barrel", box: box(x, 0.75, z, 0.6, 0.75, 0.6), color: 0x8f5a3a });
    }
    props.push({ kind: "platform", box: box(0, 5, 0, 9, 0.6, 9), color: 0xb5845a });
    props.push({ kind: "ramp", box: box(0, 2.5, 12, 3, 2.5, 3), color: 0xa0764f });
    loot.push({ x: 0, y: 5.8, z: 0 });
  } else if (theme.id === "urban") {
    const grid = 4;
    const step = (H * 2) / (grid + 1);
    for (let gx = 0; gx < grid; gx++) {
      for (let gz = 0; gz < grid; gz++) {
        if ((gx + gz) % 3 === 2) continue;
        const x = -H + step * (gx + 1) + (rng() - 0.5) * 3;
        const z = -H + step * (gz + 1) + (rng() - 0.5) * 3;
        pushBuilding(x, z, 12 + rng() * 5, 12 + rng() * 5, 6 + rng() * 8, [0x8c93a1, 0x6d7585, 0xa3a9b5, 0x7b6f66][(gx + gz) % 4]);
      }
    }
    for (let i = 0; i < 26; i++) {
      const x = (rng() - 0.5) * H * 1.85;
      const z = (rng() - 0.5) * H * 1.85;
      props.push({ kind: "crate", box: box(x, 0.9, z, 0.9, 0.9, 0.9), color: 0x5f6b7a });
      if (i % 2 === 0) loot.push({ x: x + 1.8, y: 0, z });
    }
    for (let i = 0; i < 10; i++) {
      const x = (rng() - 0.5) * H * 1.6;
      const z = (rng() - 0.5) * H * 1.6;
      props.push({ kind: "container", box: box(x, 1.4, z, 3, 1.4, 1.2), color: [0xcf4b3c, 0x2f7bbd, 0xe0b23d][i % 3] });
    }
  } else {
    // Training range: clean sightlines + dummies + a couple of cover walls.
    for (let i = 0; i < 8; i++) {
      props.push({
        kind: "target",
        box: box(-18 + i * 5.2, 1.3, -24 - (i % 2) * 6, 0.7, 1.3, 0.7),
        color: 0xffffff,
        accent: 0xe4484a,
      });
    }
    for (let i = 0; i < 6; i++) {
      props.push({ kind: "wall", box: box(-20 + i * 8, 1.5, 4, 3, 1.5, 0.6), color: 0xb98f5e });
    }
    for (let i = 0; i < 10; i++) {
      const x = (rng() - 0.5) * H * 1.4;
      const z = 12 + rng() * (H - 14);
      props.push({ kind: "crate", box: box(x, 0.8, z, 0.8, 0.8, 0.8), color: 0xc98a4b });
      loot.push({ x: x + 1.7, y: 0, z });
    }
    props.push({ kind: "platform", box: box(0, 3, 24, 7, 0.5, 5), color: 0x9a7b55 });
    loot.push({ x: 0, y: 3.6, z: 24 });
  }

  // --- Spawn ring: evenly spaced, never inside geometry ---
  const colliders = props.filter((p) => p.kind !== "roof").map((p) => p.box);
  const ringR = H * 0.74;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    let x = Math.cos(a) * ringR;
    let z = Math.sin(a) * ringR;
    let tries = 0;
    while (tries++ < 24 && blocked(colliders, x, z)) {
      const rr = ringR * (0.45 + rng() * 0.5);
      const aa = rng() * Math.PI * 2;
      x = Math.cos(aa) * rr;
      z = Math.sin(aa) * rr;
    }
    spawns.push({ x, y: 0, z });
  }

  // Extra ground loot scattered in open space
  for (let i = 0; i < 18; i++) {
    let x = (rng() - 0.5) * H * 1.7;
    let z = (rng() - 0.5) * H * 1.7;
    let tries = 0;
    while (tries++ < 12 && blocked(colliders, x, z)) {
      x = (rng() - 0.5) * H * 1.7;
      z = (rng() - 0.5) * H * 1.7;
    }
    loot.push({ x, y: 0, z });
  }

  return { theme, props, colliders, spawns, loot };
}

function blocked(colliders: Box[], x: number, z: number) {
  for (const b of colliders) {
    if (
      x > b.cx - b.hx - 1.6 &&
      x < b.cx + b.hx + 1.6 &&
      z > b.cz - b.hz - 1.6 &&
      z < b.cz + b.hz + 1.6
    ) {
      return true;
    }
  }
  return false;
}
