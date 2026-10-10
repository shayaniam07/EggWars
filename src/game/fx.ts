/**
 * EGG WARS - Pooled combat effects.
 * Everything is allocated once up-front and recycled, so firing thousands of
 * rounds never triggers a GC spike mid-fight.
 */
import * as THREE from "three";

type Tracer = { line: THREE.Line; mat: THREE.LineBasicMaterial; life: number };
type Spark = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; vel: THREE.Vector3 };
type Popup = { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; life: number; tex: THREE.CanvasTexture; canvas: HTMLCanvasElement };

export class Effects {
  private tracers: Tracer[] = [];
  private sparks: Spark[] = [];
  private popups: Popup[] = [];
  private flash: THREE.PointLight;
  private flashLife = 0;
  group = new THREE.Group();

  constructor(scene: THREE.Scene, budget = { tracers: 28, sparks: 48, popups: 10 }) {
    for (let i = 0; i < budget.tracers; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const mat = new THREE.LineBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0 });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      line.frustumCulled = false;
      this.group.add(line);
      this.tracers.push({ line, mat, life: 0 });
    }
    const sparkGeo = new THREE.IcosahedronGeometry(0.06, 0);
    for (let i = 0; i < budget.sparks; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd45e, transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(sparkGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.sparks.push({ mesh, mat, life: 0, vel: new THREE.Vector3() });
    }
    for (let i = 0; i < budget.popups; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 64;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0 });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.scale.set(1.1, 0.55, 1);
      this.group.add(sprite);
      this.popups.push({ sprite, mat, tex, canvas, life: 0 });
    }
    this.flash = new THREE.PointLight(0xffd27a, 0, 9, 2);
    this.group.add(this.flash);
    scene.add(this.group);
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xfff0a0) {
    const t = this.tracers.find((x) => x.life <= 0) ?? this.tracers[0];
    const pos = t.line.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.mat.color.setHex(color);
    t.mat.opacity = 0.95;
    t.life = 0.07;
    t.line.visible = true;
  }

  muzzle(at: THREE.Vector3) {
    this.flash.position.copy(at);
    this.flash.intensity = 7;
    this.flashLife = 0.055;
  }

  impact(at: THREE.Vector3, color = 0xffd45e, count = 5) {
    let used = 0;
    for (const s of this.sparks) {
      if (s.life > 0) continue;
      s.mesh.position.copy(at);
      s.vel.set((Math.random() - 0.5) * 5, Math.random() * 4 + 1, (Math.random() - 0.5) * 5);
      s.mat.color.setHex(color);
      s.mat.opacity = 1;
      s.life = 0.35 + Math.random() * 0.2;
      s.mesh.visible = true;
      if (++used >= count) break;
    }
  }

  popup(at: THREE.Vector3, text: string, color = "#ffe27a") {
    const p = this.popups.find((x) => x.life <= 0) ?? this.popups[0];
    const g = p.canvas.getContext("2d")!;
    g.clearRect(0, 0, 128, 64);
    g.font = "bold 40px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 6;
    g.strokeStyle = "rgba(10,12,18,.85)";
    g.strokeText(text, 64, 32);
    g.fillStyle = color;
    g.fillText(text, 64, 32);
    p.tex.needsUpdate = true;
    p.sprite.position.copy(at);
    p.mat.opacity = 1;
    p.life = 0.85;
    p.sprite.visible = true;
  }

  update(dt: number) {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mat.opacity = Math.max(0, t.life / 0.07) * 0.95;
      if (t.life <= 0) t.line.visible = false;
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= 14 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mat.opacity = Math.max(0, s.life / 0.5);
      if (s.life <= 0) s.mesh.visible = false;
    }
    for (const p of this.popups) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.sprite.position.y += dt * 1.3;
      p.mat.opacity = Math.max(0, p.life / 0.85);
      if (p.life <= 0) p.sprite.visible = false;
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flash.intensity = Math.max(0, (this.flashLife / 0.055) * 7);
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
      if (o instanceof THREE.Sprite) o.material.dispose();
    });
    this.group.removeFromParent();
  }
}
