/**
 * EGG WARS - Procedural egg soldier.
 *
 * The whole character (shell, face, limbs, outfit, weapon) is generated with
 * geometry + canvas textures at runtime. There is no external model or texture
 * download, so a character can never render as a missing/black asset.
 */
import * as THREE from "three";
import type { OutfitVisual } from "@/shared/catalog";
import { getWeapon } from "@/shared/weapons";

const texCache = new Map<string, THREE.Texture>();
const geoCache = new Map<string, THREE.BufferGeometry>();

function cachedGeo(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

/* ------------------------------------------------------------- textures */
function faceTexture(face: OutfitVisual["face"]): THREE.Texture {
  const key = `face:${face}`;
  const hit = texCache.get(key);
  if (hit) return hit;

  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 256);

  const eye = (x: number, y: number, r: number, pupilDx = 0) => {
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.ellipse(x, y, r, r * 1.15, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#14161c";
    g.beginPath();
    g.arc(x + pupilDx, y + 2, r * 0.48, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,.85)";
    g.beginPath();
    g.arc(x + pupilDx - r * 0.18, y - r * 0.2, r * 0.16, 0, Math.PI * 2);
    g.fill();
  };

  const brow = (x: number, y: number, rot: number, w = 46, h = 11) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = "#1b1d24";
    g.fillRect(-w / 2, -h / 2, w, h);
    g.restore();
  };

  if (face === "ninja") {
    g.fillStyle = "#1c1f28";
    g.fillRect(28, 86, 200, 58);
    eye(94, 116, 17, 2);
    eye(162, 116, 17, -2);
  } else if (face === "cool") {
    g.fillStyle = "#101319";
    g.beginPath();
    g.roundRect(44, 92, 168, 48, 14);
    g.fill();
    g.fillStyle = "rgba(255,255,255,.22)";
    g.beginPath();
    g.roundRect(54, 100, 60, 16, 8);
    g.fill();
    g.strokeStyle = "#101319";
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(100, 180);
    g.quadraticCurveTo(128, 200, 156, 180);
    g.stroke();
  } else {
    const angry = face === "angry" || face === "fierce";
    eye(96, 112, 24, face === "fierce" ? 4 : 0);
    eye(160, 112, 24, face === "fierce" ? -4 : 0);
    if (angry) {
      brow(92, 80, 0.38);
      brow(164, 80, -0.38);
    } else if (face === "happy") {
      brow(92, 76, -0.18, 40, 8);
      brow(164, 76, 0.18, 40, 8);
    }
    g.strokeStyle = "#171a21";
    g.lineWidth = 9;
    g.lineCap = "round";
    g.beginPath();
    if (face === "happy") {
      g.moveTo(100, 172);
      g.quadraticCurveTo(128, 202, 156, 172);
    } else if (angry) {
      g.moveTo(98, 190);
      g.quadraticCurveTo(128, 164, 158, 190);
    } else {
      g.moveTo(104, 180);
      g.lineTo(152, 180);
    }
    g.stroke();
    if (face === "fierce") {
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.moveTo(112, 182);
      g.lineTo(122, 200);
      g.lineTo(130, 182);
      g.closePath();
      g.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

function shellTexture(pattern: OutfitVisual["pattern"], body: number, accent: number): THREE.Texture | null {
  if (pattern === "none") return null;
  const key = `shell:${pattern}:${body}:${accent}`;
  const hit = texCache.get(key);
  if (hit) return hit;

  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const base = "#" + body.toString(16).padStart(6, "0");
  const acc = "#" + accent.toString(16).padStart(6, "0");
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);

  if (pattern === "camo") {
    const blobs = ["#4c5a3a", "#6b7a4a", "#39402c", acc];
    for (let i = 0; i < 70; i++) {
      g.fillStyle = blobs[i % blobs.length];
      g.beginPath();
      g.ellipse(Math.random() * 256, Math.random() * 256, 12 + Math.random() * 26, 10 + Math.random() * 20, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
  } else if (pattern === "stripes") {
    g.fillStyle = acc;
    for (let i = 0; i < 8; i++) g.fillRect(0, i * 32, 256, 14);
  } else if (pattern === "circuit") {
    g.strokeStyle = acc;
    g.lineWidth = 3;
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() > 0.5 ? 40 : 0), y + (Math.random() > 0.5 ? 40 : 0));
      g.stroke();
      g.fillStyle = acc;
      g.fillRect(x - 3, y - 3, 6, 6);
    }
  } else if (pattern === "scales") {
    for (let row = 0; row < 14; row++) {
      for (let col = 0; col < 14; col++) {
        g.fillStyle = (row + col) % 2 ? acc : base;
        g.beginPath();
        g.arc(col * 19 + (row % 2) * 9, row * 19, 11, Math.PI, Math.PI * 2);
        g.fill();
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

export function nameTagSprite(text: string, color = "#ffffff"): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(8,12,20,.6)";
  g.beginPath();
  g.roundRect(8, 12, 240, 40, 12);
  g.fill();
  g.font = "bold 26px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = color;
  g.fillText(text.slice(0, 14), 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(1.5, 0.375, 1);
  return sprite;
}

/* ------------------------------------------------------------ character */
export type EggState = {
  speed: number;
  grounded: boolean;
  crouch: boolean;
  aim: boolean;
  dead: boolean;
  firing: number; // seconds since last shot
  reloading: boolean;
  yaw: number;
  pitch: number;
};

export class EggCharacter {
  group = new THREE.Group();
  private body: THREE.Mesh;
  private faceMesh: THREE.Mesh;
  private armL: THREE.Group;
  private armR: THREE.Group;
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private hatGroup = new THREE.Group();
  private extraGroup = new THREE.Group();
  private weaponGroup = new THREE.Group();
  private torso = new THREE.Group();
  private phase = Math.random() * 10;
  private recoil = 0;
  private visual: OutfitVisual;
  private disposables: (THREE.Material | THREE.BufferGeometry)[] = [];

  constructor(visual: OutfitVisual, weaponId: string, opts: { tint?: number; scale?: number } = {}) {
    this.visual = visual;
    const scale = opts.scale ?? 1;
    this.group.scale.setScalar(scale);
    this.group.add(this.torso);

    const shellTex = shellTexture(visual.pattern, visual.body, visual.accent);
    const bodyMat = new THREE.MeshLambertMaterial({
      color: shellTex ? 0xffffff : visual.body,
      map: shellTex ?? undefined,
    });
    this.disposables.push(bodyMat);

    // Egg shell: a sphere squashed into an egg silhouette.
    const bodyGeo = cachedGeo("eggBody", () => {
      const g = new THREE.SphereGeometry(0.46, 22, 18);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const taper = 1 - Math.max(0, y) * 0.34;
        pos.setX(i, pos.getX(i) * taper);
        pos.setZ(i, pos.getZ(i) * taper);
        pos.setY(i, y * 1.32);
      }
      g.computeVertexNormals();
      return g;
    });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.body.position.y = 0.92;
    this.body.castShadow = true;
    this.torso.add(this.body);

    // Face decal
    const faceGeo = cachedGeo("face", () => new THREE.PlaneGeometry(0.62, 0.62));
    const faceMat = new THREE.MeshBasicMaterial({ map: faceTexture(visual.face), transparent: true, depthWrite: false });
    this.disposables.push(faceMat);
    this.faceMesh = new THREE.Mesh(faceGeo, faceMat);
    this.faceMesh.position.set(0, 1.03, 0.41);
    this.torso.add(this.faceMesh);

    // Limbs
    const limbMat = new THREE.MeshLambertMaterial({ color: visual.accent });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xf6d7a8 });
    this.disposables.push(limbMat, skinMat);
    const armGeo = cachedGeo("arm", () => new THREE.CapsuleGeometry(0.075, 0.3, 4, 8));
    const handGeo = cachedGeo("hand", () => new THREE.SphereGeometry(0.1, 10, 8));

    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    for (const [arm, side] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      const upper = new THREE.Mesh(armGeo, limbMat);
      upper.position.y = -0.2;
      upper.castShadow = true;
      const hand = new THREE.Mesh(handGeo, skinMat);
      hand.position.y = -0.4;
      arm.add(upper, hand);
      arm.position.set(side * 0.42, 1.0, 0);
      this.torso.add(arm);
    }

    const legGeo = cachedGeo("leg", () => new THREE.CapsuleGeometry(0.085, 0.28, 4, 8));
    this.legL = new THREE.Mesh(legGeo, limbMat);
    this.legR = new THREE.Mesh(legGeo, limbMat);
    this.legL.position.set(-0.17, 0.25, 0);
    this.legR.position.set(0.17, 0.25, 0);
    this.legL.castShadow = this.legR.castShadow = true;
    this.torso.add(this.legL, this.legR);

    this.torso.add(this.hatGroup, this.extraGroup);
    this.buildHat();
    this.buildExtra();

    this.armR.add(this.weaponGroup);
    this.weaponGroup.position.set(0.02, -0.38, 0.16);
    this.setWeapon(weaponId, opts.tint);
  }

  /* ------------------------------------------------------- accessories */
  private buildHat() {
    const { hat, accent, body } = this.visual;
    const mat = new THREE.MeshLambertMaterial({ color: accent });
    this.disposables.push(mat);
    const g = this.hatGroup;
    g.clear();
    g.position.y = 1.45;

    if (hat === "crown") {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.1, 12), new THREE.MeshLambertMaterial({ color: 0xffc23a }));
      base.position.y = 0.05;
      g.add(base);
      for (let i = 0; i < 6; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 6), new THREE.MeshLambertMaterial({ color: 0xffd862 }));
        const a = (i / 6) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.21, 0.16, Math.sin(a) * 0.21);
        g.add(spike);
      }
    } else if (hat === "cap") {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.3), mat);
      brim.position.set(0, 0.02, 0.26);
      g.add(dome, brim);
    } else if (hat === "helmet") {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), mat);
      dome.position.y = -0.06;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 6, 18), mat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = -0.06;
      g.add(dome, rim);
    } else if (hat === "bandana") {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.12, 14), mat);
      band.position.y = -0.14;
      g.add(band);
    } else if (hat === "bubble") {
      const glass = new THREE.Mesh(
        new THREE.SphereGeometry(0.44, 18, 14),
        new THREE.MeshPhongMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.32, shininess: 90 }),
      );
      glass.position.y = -0.38;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.045, 6, 18), mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.72;
      g.add(glass, ring);
    } else if (hat === "horns") {
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 8), mat);
        horn.position.set(s * 0.22, 0.06, -0.02);
        horn.rotation.z = s * -0.5;
        g.add(horn);
      }
    } else if (hat === "visor") {
      const v = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.14, 0.1),
        new THREE.MeshBasicMaterial({ color: accent }),
      );
      v.position.set(0, -0.38, 0.33);
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 14), new THREE.MeshLambertMaterial({ color: body }));
      strap.position.y = -0.38;
      g.add(v, strap);
    } else if (hat === "hood") {
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.68), new THREE.MeshLambertMaterial({ color: this.visual.body }));
      hood.position.y = -0.2;
      g.add(hood);
    }
  }

  private buildExtra() {
    const { extra, accent } = this.visual;
    const g = this.extraGroup;
    g.clear();
    const mat = new THREE.MeshLambertMaterial({ color: accent });
    this.disposables.push(mat);

    if (extra === "backpack") {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.22), mat);
      pack.position.set(0, 0.95, -0.42);
      pack.castShadow = true;
      g.add(pack);
    } else if (extra === "cape") {
      const cape = new THREE.Mesh(
        new THREE.PlaneGeometry(0.72, 0.95),
        new THREE.MeshLambertMaterial({ color: accent, side: THREE.DoubleSide }),
      );
      cape.position.set(0, 0.82, -0.44);
      cape.rotation.x = 0.16;
      g.add(cape);
    } else if (extra === "wings") {
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(
          new THREE.ConeGeometry(0.3, 0.8, 4),
          new THREE.MeshLambertMaterial({ color: accent, side: THREE.DoubleSide }),
        );
        wing.position.set(s * 0.42, 1.05, -0.36);
        wing.rotation.set(Math.PI / 2, 0, s * 0.7);
        wing.scale.set(0.5, 1, 1);
        g.add(wing);
      }
    } else if (extra === "jetpack") {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.46, 0.2), new THREE.MeshLambertMaterial({ color: 0xd6dbe4 }));
      pack.position.set(0, 0.95, -0.42);
      g.add(pack);
      for (const s of [-1, 1]) {
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.16, 8), mat);
        nozzle.position.set(s * 0.12, 0.66, -0.42);
        g.add(nozzle);
      }
    }
  }

  /* ------------------------------------------------------------ weapon */
  private currentWeaponId = "";
  private currentTint: number | undefined;

  /** Cheap guard used by the network layer — rebuilds only on real changes. */
  setWeaponIfChanged(weaponId: string, tint?: number) {
    if (weaponId === this.currentWeaponId && tint === this.currentTint) return;
    this.setWeapon(weaponId, tint);
  }

  setWeapon(weaponId: string, tint?: number) {
    this.currentWeaponId = weaponId;
    this.currentTint = tint;
    this.weaponGroup.clear();
    const w = getWeapon(weaponId);
    const m = w.model;
    const mainMat = new THREE.MeshLambertMaterial({ color: tint ?? m.color });
    const accMat = new THREE.MeshLambertMaterial({ color: m.accent });
    this.disposables.push(mainMat, accMat);

    if (w.cls === "melee") {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), accMat);
      handle.rotation.x = Math.PI / 2;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mainMat);
      head.position.z = 0.26;
      head.scale.set(0.7, 1, 1.4);
      this.weaponGroup.add(handle, head);
    } else if (w.cls === "throwable") {
      const nade = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mainMat);
      const pin = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 5, 8), accMat);
      pin.position.y = 0.11;
      this.weaponGroup.add(nade, pin);
    } else {
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(m.w, m.h * 0.55, m.len), mainMat);
      barrel.position.z = m.len * 0.35;
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(m.w * 1.3, m.h, m.len * 0.4), mainMat);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(m.w, m.h * 1.1, m.h * 0.9), accMat);
      grip.position.set(0, -m.h * 0.8, -m.len * 0.05);
      grip.rotation.x = -0.25;
      const mag = new THREE.Mesh(new THREE.BoxGeometry(m.w * 0.9, m.h * 1.4, m.h * 0.8), accMat);
      mag.position.set(0, -m.h * 1.0, m.len * 0.12);
      this.weaponGroup.add(barrel, receiver, grip, mag);
      if (m.stock) {
        const stock = new THREE.Mesh(new THREE.BoxGeometry(m.w, m.h * 0.9, m.len * 0.34), accMat);
        stock.position.z = -m.len * 0.3;
        this.weaponGroup.add(stock);
      }
      if (m.scope) {
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 8), accMat);
        scope.rotation.x = Math.PI / 2;
        scope.position.set(0, m.h * 0.85, m.len * 0.1);
        this.weaponGroup.add(scope);
      }
    }
    this.weaponGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
  }

  get muzzleWorld(): THREE.Vector3 {
    const v = new THREE.Vector3(0, 0, 0.7);
    this.weaponGroup.localToWorld(v);
    return v;
  }

  kick() {
    this.recoil = 1;
  }

  /* --------------------------------------------------------- animation */
  update(dt: number, s: EggState) {
    this.phase += dt * (1 + s.speed * 1.4);
    this.recoil = Math.max(0, this.recoil - dt * 7);

    if (s.dead) {
      this.torso.rotation.x = THREE.MathUtils.lerp(this.torso.rotation.x, -Math.PI / 2.1, dt * 7);
      this.torso.position.y = THREE.MathUtils.lerp(this.torso.position.y, -0.25, dt * 7);
      return;
    }
    this.torso.rotation.x = THREE.MathUtils.lerp(this.torso.rotation.x, 0, dt * 9);

    const crouchY = s.crouch ? -0.28 : 0;
    this.torso.position.y = THREE.MathUtils.lerp(this.torso.position.y, crouchY, dt * 12);
    this.torso.scale.y = THREE.MathUtils.lerp(this.torso.scale.y, s.crouch ? 0.86 : 1, dt * 12);

    const moving = s.speed > 0.1;
    const swing = Math.sin(this.phase * 6.2) * Math.min(1, s.speed) * 0.85;
    const bob = moving ? Math.abs(Math.sin(this.phase * 6.2)) * 0.05 * Math.min(1, s.speed) : Math.sin(this.phase * 1.6) * 0.016;
    this.body.position.y = 0.92 + bob;
    this.faceMesh.position.y = 1.03 + bob;
    this.hatGroup.position.y = 1.45 + bob;

    if (!s.grounded) {
      this.legL.rotation.x = THREE.MathUtils.lerp(this.legL.rotation.x, -0.7, dt * 10);
      this.legR.rotation.x = THREE.MathUtils.lerp(this.legR.rotation.x, 0.35, dt * 10);
    } else {
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
    }

    // Arms: aiming pose vs running pose
    const aimBlend = s.aim ? 1 : 0;
    const targetRx = -Math.PI / 2 + s.pitch * 0.9;
    const idleRx = moving ? -swing * 0.8 : Math.sin(this.phase * 1.6) * 0.08;

    this.armR.rotation.x = THREE.MathUtils.lerp(
      this.armR.rotation.x,
      THREE.MathUtils.lerp(-1.15 + s.pitch * 0.7, targetRx, aimBlend) - this.recoil * 0.45,
      dt * 14,
    );
    this.armR.rotation.z = THREE.MathUtils.lerp(this.armR.rotation.z, -0.22 - aimBlend * 0.1, dt * 12);

    if (s.reloading) {
      this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, -0.4 + Math.sin(this.phase * 16) * 0.4, dt * 16);
      this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, 0.5, dt * 12);
    } else {
      this.armL.rotation.x = THREE.MathUtils.lerp(
        this.armL.rotation.x,
        THREE.MathUtils.lerp(idleRx, targetRx + 0.12, aimBlend),
        dt * 14,
      );
      this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, aimBlend ? -0.42 : 0.22, dt * 12);
    }

    this.weaponGroup.position.z = 0.16 - this.recoil * 0.09;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh && !geoCache.has("") && o.geometry && !isCached(o.geometry)) o.geometry.dispose();
    });
    this.group.removeFromParent();
  }
}

function isCached(g: THREE.BufferGeometry) {
  for (const v of geoCache.values()) if (v === g) return true;
  return false;
}
