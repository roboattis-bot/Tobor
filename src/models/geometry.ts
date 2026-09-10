import * as THREE from 'three';
import type { ModelKind } from './types';

// Geometry and materials are shared across all illustrations.
export function createModelLibrary() {
  const geometries = new Map<string, THREE.BufferGeometry>();
  const materials = new Map<string, THREE.Material>();
  const geometry = (key: string, create: () => THREE.BufferGeometry) => {
    if (!geometries.has(key)) geometries.set(key, create());
    return geometries.get(key)!;
  };
  const material = (color: number, metal = false) => {
    const key = `${color}:${metal}`;
    if (!materials.has(key))
      materials.set(
        key,
        new THREE.MeshStandardMaterial({
          color,
          roughness: metal ? 0.3 : 0.55,
          metalness: metal ? 0.45 : 0.08,
        }),
      );
    return materials.get(key)!;
  };
  const palette = {
    cream: 0xe9f0de,
    green: 0x28564a,
    dark: 0x173b34,
    lime: 0xc9f377,
    gold: 0xe9bb70,
    silver: 0x8da9a0,
    paper: 0xfffdf3,
  };
  function box(
    parent: THREE.Group,
    size: number[],
    position: number[],
    color: number,
    metal = false,
  ) {
    const mesh = new THREE.Mesh(
      geometry(`box:${size}`, () => new THREE.BoxGeometry(...(size as [number, number, number]))),
      material(color, metal),
    );
    mesh.position.set(...(position as [number, number, number]));
    parent.add(mesh);
    return mesh;
  }
  function cylinder(
    parent: THREE.Group,
    radius: number,
    height: number,
    position: number[],
    color: number,
    metal = false,
  ) {
    const mesh = new THREE.Mesh(
      geometry(
        `cylinder:${radius}:${height}`,
        () => new THREE.CylinderGeometry(radius, radius, height, 32),
      ),
      material(color, metal),
    );
    mesh.position.set(...(position as [number, number, number]));
    parent.add(mesh);
    return mesh;
  }
  function group(parent?: THREE.Group) {
    const value = new THREE.Group();
    parent?.add(value);
    return value;
  }
  function gear(parent: THREE.Group, color = palette.lime) {
    const result = group(parent);
    const shape = geometry('gear', () => {
      const outline = new THREE.Shape();
      for (let i = 0; i < 48; i++) {
        const angle = (i / 48) * Math.PI * 2;
        const radius = i % 4 === 0 || i % 4 === 3 ? 0.78 : 0.96;
        const x = Math.cos(angle) * radius,
          y = Math.sin(angle) * radius;
        if (!i) outline.moveTo(x, y);
        else outline.lineTo(x, y);
      }
      outline.closePath();
      const hole = new THREE.Path();
      hole.absarc(0, 0, 0.27, 0, Math.PI * 2, true);
      outline.holes.push(hole);
      const value = new THREE.ExtrudeGeometry(outline, {
        depth: 0.24,
        bevelEnabled: true,
        bevelSize: 0.04,
        bevelThickness: 0.04,
        bevelSegments: 2,
        steps: 1,
        curveSegments: 24,
      });
      value.center();
      return value;
    });
    const mesh = new THREE.Mesh(shape, material(color));
    mesh.rotation.x = -Math.PI / 2;
    result.add(mesh);
    return result;
  }
  function bracket(parent: THREE.Group) {
    const result = group(parent);
    box(result, [1.8, 0.18, 1.45], [0, -0.48, 0], palette.cream);
    box(result, [1.8, 1.5, 0.18], [0, 0.18, -0.63], palette.cream);
    [-0.59, 0.59].forEach((x) => {
      cylinder(result, 0.14, 0.025, [x, -0.37, 0.38], palette.dark);
      const hole = cylinder(result, 0.15, 0.028, [x, 0.54, -0.52], palette.dark);
      hole.rotation.x = Math.PI / 2;
      const rib = box(result, [0.12, 0.9, 0.14], [x, -0.05, -0.28], palette.lime);
      rib.rotation.x = -0.65;
    });
    return result;
  }
  function printer(parent: THREE.Group) {
    const result = group(parent);
    box(result, [2.2, 0.28, 1.95], [0, -1, 0], palette.cream);
    box(result, [1.85, 0.12, 1.6], [0, -0.79, 0], palette.green);
    box(result, [1.5, 0.05, 1.3], [0, -0.7, 0], palette.silver, true);
    [-0.94, 0.94].forEach((x) =>
      [-0.8, 0.8].forEach((z) => {
        box(result, [0.14, 2.06, 0.14], [x, 0.05, z], palette.cream);
        box(result, [0.24, 0.12, 0.23], [x, -1.2, z], palette.dark);
      }),
    );
    box(result, [2.2, 0.2, 1.95], [0, 1.12, 0], palette.cream);
    box(result, [1.83, 0.21, 1.62], [0, 1.13, 0], palette.green);
    [-0.7, 0.7].forEach((z) =>
      box(result, [1.78, 0.055, 0.055], [0, 0.65, z], palette.silver, true),
    );
    const head = group(result);
    head.name = 'print-head';
    box(head, [0.12, 0.1, 1.5], [0, 0.65, 0], palette.silver, true);
    box(head, [0.42, 0.4, 0.38], [0, 0.4, 0], palette.dark);
    cylinder(head, 0.06, 0.2, [0, 0.1, 0], palette.gold, true);
    box(result, [0.56, 0.28, 0.07], [0.5, -0.98, 1.02], palette.dark);
    box(result, [0.4, 0.14, 0.02], [0.5, -0.97, 1.06], palette.lime);
    const part = gear(result);
    part.scale.setScalar(0.55);
    part.position.y = -0.59;
    const spool = cylinder(result, 0.44, 0.34, [1.31, 0.58, 0], palette.dark);
    spool.rotation.z = Math.PI / 2;
    const filament = cylinder(result, 0.34, 0.37, [1.31, 0.58, 0], palette.lime);
    filament.rotation.z = Math.PI / 2;
    cylinder(result, 1.77, 0.12, [0, -1.33, 0], palette.green);
    return result;
  }
  function robot(parent: THREE.Group) {
    const result = group(parent);
    cylinder(result, 0.86, 0.23, [0, -1.05, 0], palette.green);
    cylinder(result, 0.56, 0.3, [0, -0.81, 0], palette.silver, true);
    const shoulder = group(result);
    shoulder.position.y = -0.59;
    shoulder.rotation.z = -0.28;
    const joint = cylinder(shoulder, 0.29, 0.57, [0, 0, 0], palette.gold);
    joint.rotation.x = Math.PI / 2;
    box(shoulder, [0.39, 1.12, 0.37], [0, 0.57, 0], palette.cream);
    const elbow = group(shoulder);
    elbow.position.y = 1.07;
    elbow.rotation.z = -1.02;
    elbow.name = 'robot-elbow';
    const endJoint = cylinder(elbow, 0.23, 0.53, [0, 0, 0], palette.green);
    endJoint.rotation.x = Math.PI / 2;
    box(elbow, [0.32, 0.91, 0.31], [0, 0.44, 0], palette.lime);
    const hand = group(elbow);
    hand.position.y = 0.95;
    box(hand, [0.53, 0.16, 0.36], [0, 0, 0], palette.dark);
    [-0.2, 0.2].forEach((x) => box(hand, [0.11, 0.32, 0.18], [x, 0.2, 0], palette.silver, true));
    return result;
  }
  function parcel(parent: THREE.Group) {
    const result = group(parent);
    box(result, [1.65, 1.35, 1.4], [0, 0, 0], palette.gold);
    box(result, [0.27, 1.38, 1.44], [0, 0, 0], palette.cream);
    box(result, [0.65, 0.44, 0.03], [0.38, 0.12, 0.72], palette.paper);
    [0.03, 0.14, 0.25].forEach((y) =>
      box(result, [0.4, 0.035, 0.035], [0.38, y, 0.745], palette.green),
    );
    box(result, [1.72, 0.12, 1.47], [0, 0.72, 0], palette.gold);
    box(result, [0.27, 0.125, 1.49], [0, 0.725, 0], palette.cream);
    return result;
  }
  function check(parent: THREE.Group) {
    const result = group(parent);
    const shield = geometry('shield', () => {
      const shape = new THREE.Shape();
      shape.moveTo(-0.9, 0.92);
      shape.lineTo(0, 1.14);
      shape.lineTo(0.9, 0.92);
      shape.lineTo(0.78, -0.35);
      shape.quadraticCurveTo(0.6, -0.82, 0, -1.08);
      shape.quadraticCurveTo(-0.6, -0.82, -0.78, -0.35);
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, {
        depth: 0.2,
        bevelEnabled: true,
        bevelSegments: 3,
        bevelSize: 0.05,
        bevelThickness: 0.05,
      });
      g.center();
      return g;
    });
    result.add(new THREE.Mesh(shield, material(palette.green)));
    const left = box(result, [0.25, 0.63, 0.13], [-0.23, -0.07, 0.24], palette.lime);
    left.rotation.z = 0.7;
    const right = box(result, [0.25, 1.02, 0.13], [0.26, 0.08, 0.24], palette.lime);
    right.rotation.z = -0.65;
    return result;
  }
  function receipt(parent: THREE.Group, blueprint = false) {
    const result = group(parent);
    box(result, [1.5, 2.05, 0.15], [0, 0, 0], palette.green);
    box(result, [1.29, 1.82, 0.045], [0, -0.01, 0.1], palette.paper);
    box(result, [0.57, 0.24, 0.12], [0, 0.94, 0.13], palette.gold);
    [0.52, 0.2, -0.12, -0.44].forEach((y, i) =>
      box(
        result,
        [i === 3 ? 0.48 : 0.92, 0.075, 0.035],
        [i === 3 ? -0.22 : 0, y, 0.14],
        blueprint ? palette.silver : palette.green,
      ),
    );
    if (blueprint) {
      const part = gear(result);
      part.scale.setScalar(0.55);
      part.rotation.x = Math.PI / 2;
      part.position.set(0.42, -0.6, 0.45);
    } else
      for (let i = 0; i < 4; i++)
        cylinder(result, 0.4, 0.12, [0.78, -0.87 + i * 0.13, 0.5], palette.gold, true);
    return result;
  }
  function create(kind: ModelKind) {
    const result = group();
    switch (kind) {
      case 'printer':
        printer(result);
        break;
      case 'robot':
        robot(result);
        break;
      case 'gear': {
        const part = gear(result);
        part.rotation.x = 0.5;
        break;
      }
      case 'bracket':
        bracket(result);
        break;
      case 'parcel':
        parcel(result);
        break;
      case 'check':
        check(result);
        break;
      case 'receipt':
        receipt(result);
        break;
      case 'blueprint':
        receipt(result, true);
        break;
      case 'library': {
        box(result, [2.7, 0.16, 1.45], [0, -0.9, 0], palette.green);
        const first = gear(result);
        first.scale.setScalar(0.75);
        first.position.set(-0.63, -0.64, 0.1);
        const second = bracket(result);
        second.scale.setScalar(0.65);
        second.position.set(0.64, -0.44, -0.05);
        break;
      }
      case 'workshop': {
        const machine = printer(result);
        machine.position.set(-0.75, 0, -0.28);
        const arm = robot(result);
        arm.position.set(1.7, -0.07, 0.28);
        arm.scale.setScalar(0.9);
        const delivery = parcel(result);
        delivery.position.set(0.32, -0.92, 1.73);
        delivery.scale.setScalar(0.55);
        const floating = gear(result);
        floating.position.set(-2.3, 0.76, 0.7);
        floating.scale.setScalar(0.55);
        floating.rotation.x = 0.7;
        floating.name = 'floating-gear';
        break;
      }
    }
    return result;
  }
  return {
    create,
    dispose() {
      geometries.forEach((value) => value.dispose());
      materials.forEach((value) => value.dispose());
    },
  };
}
