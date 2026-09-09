import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export default function PrinterScene({ large = false }: { large?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      });
    } catch {
      setFallback(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 100);
    camera.position.set(5.2, 3.3, 6.2);
    camera.lookAt(0, 0.1, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x88a398, 3));
    const key = new THREE.DirectionalLight(0xffffff, 4);
    key.position.set(3, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbff28b, 2);
    fill.position.set(-4, 1, -2);
    scene.add(fill);
    const group = new THREE.Group();
    group.rotation.y = -0.25;
    scene.add(group);
    const material = (color: number, roughness = 0.5, metalness = 0.08) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const shell = material(0xe5eee6),
      dark = material(0x234a40),
      rail = material(0x718c80, 0.25, 0.7),
      lime = material(0xc3ee77),
      rubber = material(0x1f3430);
    const box = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    box(2.2, 0.28, 1.95, 0, -1, 0, shell);
    box(1.88, 0.12, 1.65, 0, -0.79, 0, dark);
    box(1.53, 0.05, 1.35, 0, -0.7, 0, rail);
    [-0.94, 0.94].forEach((x) =>
      [-0.8, 0.8].forEach((z) => {
        box(0.16, 2.06, 0.16, x, 0.05, z, shell);
        box(0.24, 0.13, 0.23, x, -1.19, z, rubber);
      }),
    );
    box(2.2, 0.2, 1.95, 0, 1.12, 0, shell);
    box(1.83, 0.22, 1.62, 0, 1.12, 0, dark);
    [-0.73, 0.73].forEach((z) => box(1.78, 0.045, 0.045, 0, 0.62, z, rail));
    box(0.08, 0.09, 1.51, 0, 0.62, 0, rail);
    const head = box(0.43, 0.43, 0.39, 0, 0.4, 0, dark);
    box(0.22, 0.09, 0.2, 0, 0.13, 0, rail);
    box(0.095, 0.07, 0.09, 0, 0.05, 0, lime);
    box(0.59, 0.3, 0.07, 0.52, -0.98, 1.02, dark);
    box(0.43, 0.16, 0.02, 0.52, -0.96, 1.064, lime);
    const gear = new THREE.Group();
    gear.position.set(0, -0.67, 0);
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.23, 32), lime);
    cylinder.position.y = 0.12;
    gear.add(cylinder);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.23, 0.17), lime);
      tooth.position.set(Math.cos(a) * 0.43, 0.12, Math.sin(a) * 0.43);
      tooth.rotation.y = -a;
      gear.add(tooth);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.015, 24), dark);
    hub.position.y = 0.24;
    gear.add(hub);
    group.add(gear);
    const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.36, 48), dark);
    spool.rotation.z = Math.PI / 2;
    spool.position.set(1.34, 0.61, 0);
    group.add(spool);
    const filament = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.39, 48), lime);
    filament.rotation.z = Math.PI / 2;
    filament.position.copy(spool.position);
    group.add(filament);
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(1.95, 2.05, 0.13, 64),
      material(0x355d4e),
    );
    floor.position.y = -1.33;
    floor.receiveShadow = true;
    group.add(floor);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.23, 0.009, 6, 90),
      new THREE.MeshBasicMaterial({ color: 0x7aa58c, transparent: true, opacity: 0.4 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -1.39;
    group.add(ring);
    let frame = 0,
      visible = true,
      pointer = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const render = () => renderer.render(scene, camera);
    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      syncAnimation();
    });
    intersection.observe(el);
    const move = (event: PointerEvent) => {
      pointer = (event.clientX - el.getBoundingClientRect().left) / el.clientWidth - 0.5;
    };
    el.addEventListener('pointermove', move);
    let last = 0;
    const animate = (time: number) => {
      if (!visible || document.hidden || reduced.matches) {
        frame = 0;
        return;
      }
      frame = requestAnimationFrame(animate);
      if (time - last < 32) return;
      last = time;
      group.rotation.y +=
        (-0.28 + pointer * 0.35 + Math.sin(time * 0.00022) * 0.12 - group.rotation.y) * 0.045;
      head.position.x = Math.sin(time * 0.001) * 0.26;
      render();
    };
    const syncAnimation = () => {
      if (!visible || document.hidden || reduced.matches) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (!frame) frame = requestAnimationFrame(animate);
    };
    document.addEventListener('visibilitychange', syncAnimation);
    reduced.addEventListener('change', syncAnimation);
    resize();
    syncAnimation();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', syncAnimation);
      reduced.removeEventListener('change', syncAnimation);
      el.removeEventListener('pointermove', move);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const mats = Array.isArray(object.material) ? object.material : [object.material];
          mats.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div
      className={`printer-scene ${large ? 'large' : ''}`}
      ref={host}
      role="img"
      aria-label="Animated three-dimensional illustration of a Tobor 3D printer"
    >
      {fallback && (
        <div className="printer-fallback">
          <span>▦</span>
          <p>Your next idea, taking shape.</p>
        </div>
      )}
    </div>
  );
}
