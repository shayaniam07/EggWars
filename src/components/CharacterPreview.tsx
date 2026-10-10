"use client";

/** EGG WARS - Live 3D outfit preview (drag to rotate). */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EggCharacter } from "@/game/egg";
import type { OutfitVisual } from "@/shared/catalog";

export function CharacterPreview({
  visual,
  weaponId = "yolk_ar",
  tint,
  height = 280,
  autoRotate = true,
}: {
  visual: OutfitVisual;
  weaponId?: string;
  tint?: number;
  height?: number;
  autoRotate?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef(0.6);
  const dragRef = useRef<{ active: boolean; x: number }>({ active: false, x: 0 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, height, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = `${height}px`;
    renderer.domElement.style.touchAction = "pan-y";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, host.clientWidth / height, 0.1, 50);
    camera.position.set(0, 1.25, 4.6);
    camera.lookAt(0, 1.0, 0);

    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x30405a, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(2.5, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7dd3fc, 0.8);
    rim.position.set(-3, 2, -2.5);
    scene.add(rim);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.2, 0.16, 28),
      new THREE.MeshLambertMaterial({ color: 0x1b2534 }),
    );
    pedestal.position.y = -0.08;
    scene.add(pedestal);

    const char = new EggCharacter(visual, weaponId, { tint });
    const root = new THREE.Group();
    root.add(char.group);
    scene.add(root);

    let raf = 0;
    let last = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (autoRotate && !dragRef.current.active) spinRef.current += dt * 0.55;
      root.rotation.y = spinRef.current;
      char.update(dt, {
        speed: 0,
        grounded: true,
        crouch: false,
        aim: false,
        dead: false,
        firing: 10,
        reloading: false,
        yaw: 0,
        pitch: 0,
      });
      renderer.render(scene, camera);
    };
    loop();

    const onResize = () => {
      if (!host.clientWidth) return;
      renderer.setSize(host.clientWidth, height, false);
      camera.aspect = host.clientWidth / height;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    const down = (x: number) => {
      dragRef.current = { active: true, x };
    };
    const move = (x: number) => {
      if (!dragRef.current.active) return;
      spinRef.current += (x - dragRef.current.x) * 0.012;
      dragRef.current.x = x;
    };
    const up = () => {
      dragRef.current.active = false;
    };
    const el = renderer.domElement;
    const onMouseDown = (e: MouseEvent) => down(e.clientX);
    const onMouseMove = (e: MouseEvent) => move(e.clientX);
    const onTouchStart = (e: TouchEvent) => down(e.touches[0].clientX);
    const onTouchMove = (e: TouchEvent) => move(e.touches[0].clientX);
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", up);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", up);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", up);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", up);
      char.dispose();
      pedestal.geometry.dispose();
      (pedestal.material as THREE.Material).dispose();
      renderer.dispose();
      el.remove();
    };
  }, [visual, weaponId, tint, height, autoRotate]);

  return <div ref={hostRef} className="w-full overflow-hidden rounded-2xl bg-gradient-to-b from-slate-800/60 to-slate-950/80" style={{ height }} />;
}
