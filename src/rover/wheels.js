import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const WHEEL_RADIUS = 0.2625; // 52,5 cm de diámetro (Perseverance real)
export const WHEEL_WIDTH = 0.42;

/**
 * Rueda de aluminio con 24 garras (grousers), buje y tornillería.
 * Devuelve { root, spin }: root sirve para dirección y posición,
 * spin gira sobre el eje X.
 */
export function createWheel(mats) {
  const R = WHEEL_RADIUS;
  const W = WHEEL_WIDTH;
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);

  // Banda de rodadura + garras, fusionadas en una geometría.
  const treadParts = [];
  const tire = new THREE.CylinderGeometry(R, R, W, 40, 1, true);
  tire.rotateZ(Math.PI / 2);
  treadParts.push(tire);

  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const grouser = new THREE.BoxGeometry(W * 0.96, 0.055, 0.05);
    grouser.translate(0, R - 0.004, 0);
    grouser.rotateX(a);
    treadParts.push(grouser);
  }

  const tread = new THREE.Mesh(mergeGeometries(treadParts), mats.wheel);

  // Llanta interior, buje y tornillos.
  const hubParts = [];
  const rim = new THREE.CylinderGeometry(R * 0.66, R * 0.66, W * 1.02, 28);
  rim.rotateZ(Math.PI / 2);
  hubParts.push(rim);

  const hub = new THREE.CylinderGeometry(R * 0.24, R * 0.24, W * 1.14, 16);
  hub.rotateZ(Math.PI / 2);
  hubParts.push(hub);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const bolt = new THREE.CylinderGeometry(0.028, 0.028, W * 1.2, 8);
    bolt.rotateZ(Math.PI / 2);
    bolt.translate(0, Math.cos(a) * R * 0.43, Math.sin(a) * R * 0.43);
    hubParts.push(bolt);
  }

  const rimMesh = new THREE.Mesh(mergeGeometries(hubParts), mats.hub);

  tread.castShadow = true;
  tread.receiveShadow = true;
  rimMesh.castShadow = true;
  rimMesh.receiveShadow = true;

  spin.add(tread, rimMesh);
  return { root, spin };
}
