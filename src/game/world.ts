/**
 * EGG WARS - Arena renderer.
 * Converts the shared, deterministic map description into three.js geometry.
 * Props of the same kind+colour are drawn with InstancedMesh to keep draw
 * calls low enough for mobile GPUs.
 */
import * as THREE from "three";
import type { GeneratedMap, Prop } from "@/shared/maps";

export type Quality = "low" | "medium" | "high";

const groundTexCache = new Map<string, THREE.Texture>();

function groundTexture(theme: string, base: number, accent: number): THREE.Texture {
  const key = `${theme}:${base}:${accent}`;
  const hit = groundTexCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#" + base.toString(16).padStart(6, "0");
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#" + accent.toString(16).padStart(6, "0");
  if (theme === "urban") {
    g.globalAlpha = 0.5;
    for (let i = 0; i <= 256; i += 64) {
      g.fillRect(i, 0, 3, 256);
      g.fillRect(0, i, 256, 3);
    }
  } else {
    g.globalAlpha = 0.35;
    for (let i = 0; i < 260; i++) {
      g.beginPath();
      g.ellipse(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 9, 2 + Math.random() * 6, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(26, 26);
  groundTexCache.set(key, tex);
  return tex;
}

export class WorldView {
  group = new THREE.Group();
  sun: THREE.DirectionalLight;
  private disposables: (THREE.Material | THREE.BufferGeometry)[] = [];

  constructor(scene: THREE.Scene, map: GeneratedMap, quality: Quality) {
    const t = map.theme;
    scene.background = new THREE.Color(t.sky);
    scene.fog = new THREE.Fog(t.fog, t.half * 0.9, t.half * 2.6);

    const hemi = new THREE.HemisphereLight(t.ambient, t.ground, 1.05);
    this.sun = new THREE.DirectionalLight(t.sun, 1.25);
    this.sun.position.set(t.half * 0.6, t.half * 1.1, t.half * 0.35);
    if (quality !== "low") {
      this.sun.castShadow = true;
      const s = quality === "high" ? 2048 : 1024;
      this.sun.shadow.mapSize.set(s, s);
      const d = t.half * 0.85;
      this.sun.shadow.camera.left = -d;
      this.sun.shadow.camera.right = d;
      this.sun.shadow.camera.top = d;
      this.sun.shadow.camera.bottom = -d;
      this.sun.shadow.camera.far = t.half * 4;
      this.sun.shadow.bias = -0.0012;
    }
    this.group.add(hemi, this.sun, this.sun.target);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(t.half * 2.2, t.half * 2.2);
    const groundMat = new THREE.MeshLambertMaterial({ map: groundTexture(t.id, t.ground, t.groundAccent) });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);
    this.disposables.push(groundGeo, groundMat);

    // Group props into instanced batches
    const batches = new Map<string, Prop[]>();
    for (const p of map.props) {
      const key = `${p.kind}:${p.color}:${p.accent ?? 0}`;
      const arr = batches.get(key);
      if (arr) arr.push(p);
      else batches.set(key, [p]);
    }

    for (const props of batches.values()) {
      const sample = props[0];
      const geo = this.geometryFor(sample);
      const mat = new THREE.MeshLambertMaterial({
        color: sample.kind === "roof" ? (sample.accent ?? sample.color) : sample.color,
      });
      this.disposables.push(geo, mat);
      const mesh = new THREE.InstancedMesh(geo, mat, props.length);
      mesh.castShadow = quality !== "low";
      mesh.receiveShadow = true;
      const m = new THREE.Matrix4();
      props.forEach((p, i) => {
        m.compose(
          new THREE.Vector3(p.box.cx, p.box.cy, p.box.cz),
          new THREE.Quaternion(),
          new THREE.Vector3(p.box.hx * 2, p.box.hy * 2, p.box.hz * 2),
        );
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);

      // Palm fronds / target faces get a light decorative second pass.
      if (sample.kind === "palm") {
        const leafGeo = new THREE.ConeGeometry(0.5, 0.4, 6);
        const leafMat = new THREE.MeshLambertMaterial({ color: sample.accent ?? 0x3faf63 });
        this.disposables.push(leafGeo, leafMat);
        const leaves = new THREE.InstancedMesh(leafGeo, leafMat, props.length * 4);
        let i = 0;
        for (const p of props) {
          for (let k = 0; k < 4; k++) {
            const a = (k / 4) * Math.PI * 2;
            const mm = new THREE.Matrix4().compose(
              new THREE.Vector3(p.box.cx + Math.cos(a) * 0.7, p.box.cy + p.box.hy * 0.95, p.box.cz + Math.sin(a) * 0.7),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.cos(a) * 0.6, 0, Math.sin(a) * -0.6)),
              new THREE.Vector3(2.4, 1.3, 2.4),
            );
            leaves.setMatrixAt(i++, mm);
          }
        }
        leaves.instanceMatrix.needsUpdate = true;
        leaves.castShadow = quality === "high";
        this.group.add(leaves);
      }
      if (sample.kind === "target") {
        const ringGeo = new THREE.TorusGeometry(0.5, 0.1, 6, 14);
        const ringMat = new THREE.MeshLambertMaterial({ color: sample.accent ?? 0xe4484a });
        this.disposables.push(ringGeo, ringMat);
        const rings = new THREE.InstancedMesh(ringGeo, ringMat, props.length);
        props.forEach((p, i) => {
          rings.setMatrixAt(
            i,
            new THREE.Matrix4().compose(
              new THREE.Vector3(p.box.cx, p.box.cy + 0.6, p.box.cz + p.box.hz + 0.08),
              new THREE.Quaternion(),
              new THREE.Vector3(1, 1, 1),
            ),
          );
        });
        rings.instanceMatrix.needsUpdate = true;
        this.group.add(rings);
      }
    }

    scene.add(this.group);
  }

  private geometryFor(p: Prop): THREE.BufferGeometry {
    switch (p.kind) {
      case "rock":
        return new THREE.DodecahedronGeometry(0.5, 0);
      case "palm":
        return new THREE.CylinderGeometry(0.3, 0.5, 1, 7);
      case "barrel":
        return new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
      case "target":
        return new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
      default:
        return new THREE.BoxGeometry(1, 1, 1);
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    this.group.removeFromParent();
  }
}
