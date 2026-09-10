import * as THREE from 'three';
import { createModelLibrary } from './geometry';
import type { ModelEngine, ModelOptions } from './types';

// All visible models share one WebGL context using clipped canvas viewports.
export function createModelEngine(canvas: HTMLCanvasElement): ModelEngine {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = false;
  const library = createModelLibrary();
  const views = new Map<
    HTMLElement,
    {
      scene: THREE.Scene;
      camera: THREE.OrthographicCamera;
      model: THREE.Group;
      options: ModelOptions;
      visible: boolean;
      pointer: number;
      move: (event: PointerEvent) => void;
    }
  >();
  let enabled = true,
    disposed = false,
    contextLost = false,
    frame = 0,
    last = 0,
    clock = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const animate = () => enabled && !reduced.matches && !document.hidden;
  const draw = (time: number) => {
    frame = 0;
    if (disposed || contextLost || document.hidden) return;
    const moving = animate();
    if (moving && time - last < 40) {
      frame = requestAnimationFrame(draw);
      return;
    }
    if (moving) clock += Math.min(time - last, 60) / 1000;
    last = time;
    const width = innerWidth,
      height = innerHeight;
    if (canvas.clientWidth !== width || canvas.clientHeight !== height)
      renderer.setSize(width, height, true);
    renderer.setScissorTest(false);
    renderer.clear(true, true, true);
    renderer.setScissorTest(true);
    let visibleCount = 0;
    for (const [element, view] of views) {
      if (!view.visible) continue;
      const rect = element.getBoundingClientRect();
      if (
        !rect.width ||
        !rect.height ||
        rect.bottom <= 0 ||
        rect.top >= height ||
        rect.right <= 0 ||
        rect.left >= width
      )
        continue;
      visibleCount++;
      const aspect = rect.width / rect.height;
      const scale =
        view.options.kind === 'workshop' ? 2.62 : view.options.kind === 'printer' ? 1.95 : 1.6;
      view.camera.left = -scale * Math.max(aspect, 1);
      view.camera.right = -view.camera.left;
      view.camera.top = scale * Math.max(1 / aspect, 1);
      view.camera.bottom = -view.camera.top;
      view.camera.updateProjectionMatrix();
      const scroll = view.options.hero
        ? Math.max(-1, Math.min(1, (height * 0.45 - rect.top) / height))
        : 0;
      const target =
        -0.17 + (moving ? Math.sin(clock * 0.35) * 0.09 + view.pointer * 0.25 + scroll * 0.17 : 0);
      view.model.rotation.y += (target - view.model.rotation.y) * (moving ? 0.12 : 1);
      if (moving) {
        const head = view.model.getObjectByName('print-head');
        if (head) head.position.x = Math.sin(clock * 1.2) * 0.3;
        const arm = view.model.getObjectByName('robot-elbow');
        if (arm) arm.rotation.z = -1.02 + Math.sin(clock * 0.75) * 0.13;
        const gear = view.model.getObjectByName('floating-gear');
        if (gear) {
          gear.rotation.y = clock * 0.2;
          gear.position.y = 0.76 + Math.sin(clock * 1.1) * 0.12;
        }
      }
      renderer.setViewport(rect.left, height - rect.bottom, rect.width, rect.height);
      const left = Math.max(0, rect.left),
        top = Math.max(0, rect.top),
        right = Math.min(width, rect.right),
        bottom = Math.min(height, rect.bottom);
      renderer.setScissor(left, height - bottom, right - left, bottom - top);
      renderer.render(view.scene, view.camera);
      element.dataset.modelReady = 'true';
    }
    canvas.dataset.visibleModels = String(visibleCount);
    canvas.dataset.renderCount = String(renderer.info.render.frame);
    canvas.dataset.motion = moving ? 'running' : 'paused';
    if (moving && visibleCount) frame = requestAnimationFrame(draw);
  };
  const invalidate = () => {
    if (!disposed && !contextLost && !frame) frame = requestAnimationFrame(draw);
  };
  const intersection = new IntersectionObserver((entries) => {
    for (const item of entries) {
      const view = views.get(item.target as HTMLElement);
      if (view) view.visible = item.isIntersecting;
    }
    invalidate();
  });
  const resize = new ResizeObserver(invalidate);
  const visibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else invalidate();
  };
  const lost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    canvas.dataset.motion = 'paused';
    canvas.dataset.status = 'fallback';
    cancelAnimationFrame(frame);
    frame = 0;
    views.forEach((_view, el) => {
      delete el.dataset.modelReady;
    });
  };
  const restored = () => {
    contextLost = false;
    canvas.dataset.status = 'ready';
    invalidate();
  };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  window.addEventListener('resize', invalidate);
  window.addEventListener('scroll', invalidate, { passive: true, capture: true });
  document.addEventListener('visibilitychange', visibility);
  reduced.addEventListener('change', invalidate);
  renderer.setSize(innerWidth, innerHeight, true);
  canvas.dataset.status = 'ready';
  return {
    add(element, options) {
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8aa79c, 2.8));
      const light = new THREE.DirectionalLight(0xffffff, 3.2);
      light.position.set(3, 5, 4);
      scene.add(light);
      const fill = new THREE.DirectionalLight(0xd7f6ad, 1.3);
      fill.position.set(-3, 1, -2);
      scene.add(fill);
      const model = library.create(options.kind);
      scene.add(model);
      const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 60);
      camera.position.set(5.2, 3.6, 6.5);
      camera.lookAt(0, options.kind === 'workshop' ? -0.05 : 0, 0);
      const move = (event: PointerEvent) => {
        const view = views.get(element);
        if (view) {
          view.pointer =
            (event.clientX - element.getBoundingClientRect().left) / element.clientWidth - 0.5;
          if (animate()) invalidate();
        }
      };
      views.set(element, { scene, camera, model, options, visible: true, pointer: 0, move });
      element.addEventListener('pointermove', move);
      intersection.observe(element);
      resize.observe(element);
      invalidate();
    },
    remove(element) {
      const view = views.get(element);
      if (view) element.removeEventListener('pointermove', view.move);
      intersection.unobserve(element);
      resize.unobserve(element);
      views.delete(element);
      delete element.dataset.modelReady;
      invalidate();
    },
    setMotion(value) {
      enabled = value;
      invalidate();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      intersection.disconnect();
      resize.disconnect();
      views.forEach((view, element) => {
        element.removeEventListener('pointermove', view.move);
        delete element.dataset.modelReady;
      });
      views.clear();
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('scroll', invalidate, true);
      document.removeEventListener('visibilitychange', visibility);
      reduced.removeEventListener('change', invalidate);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      library.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
