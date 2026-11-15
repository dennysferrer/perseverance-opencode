import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { createChassis } from './chassis.js';
import { createSuspension } from './suspension.js';
import { createWheel, WHEEL_RADIUS } from './wheels.js';

export const WHEEL_LAYOUT = [
  { z: 1.05, steer: true },
  { z: -0.02, steer: false },
  { z: -1.08, steer: true },
];

export const TRACK_HALF = 1.22;
export const RIDE_HEIGHT = 0.95;

/**
 * Ensambla el rover: grupo raíz (posición/rumbo), grupo de inclinación
 * (pitch/roll) y seis ruedas con dirección y giro independientes.
 */
export function createRover() {
  const mats = createMaterials();

  const group = new THREE.Group();
  group.name = 'perseverance';

  const tilt = new THREE.Group();
  tilt.name = 'tilt';
  tilt.position.y = RIDE_HEIGHT;
  group.add(tilt);

  const chassis = createChassis(mats);
  tilt.add(chassis.group);
  tilt.add(createSuspension(mats));

  const wheels = [];
  for (const side of [-1, 1]) {
    for (const spec of WHEEL_LAYOUT) {
      const wheel = createWheel(mats);
      wheel.root.position.set(side * TRACK_HALF, -RIDE_HEIGHT + WHEEL_RADIUS, spec.z);
      wheel.root.userData = { side, steer: spec.steer };
      tilt.add(wheel.root);
      wheels.push(wheel);
    }
  }

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return { group, tilt, wheels, chassis, materials: mats };
}
