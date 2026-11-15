import * as THREE from 'three';
import { terrainHeight, terrainNormal } from './terrain.js';

const CAPACITY = 1500;
const STEP = 0.3; // metros entre marcas

/**
 * Huellas de las ruedas: dos cintas de quads instanciados que se
 * colocan sobre el terreno y se reciclan en anillo.
 */
export function createTracks(scene) {
  const geo = new THREE.PlaneGeometry(0.42, 0.95);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshBasicMaterial({
    color: 0x422316,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });

  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3();
  const dummy = new THREE.Object3D();

  const sides = [-1, 1].map(() => {
    const mesh = new THREE.InstancedMesh(geo, mat, CAPACITY);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    return { mesh, cursor: 0, filled: 0, last: null, dist: 0 };
  });

  const emit = (side, x, z, heading = 0) => {
    const s = sides[side];
    if (s.last) {
      s.dist += Math.hypot(x - s.last.x, z - s.last.z);
      if (s.dist < STEP) return;
    }
    s.dist = 0;
    s.last = { x, z };

    const y = terrainHeight(x, z);
    terrainNormal(x, z, normal);
    dummy.position.set(x, y + 0.018, z);
    dummy.quaternion.setFromUnitVectors(up, normal);
    dummy.rotateY(heading);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    s.mesh.setMatrixAt(s.cursor, dummy.matrix);

    s.cursor = (s.cursor + 1) % CAPACITY;
    s.filled = Math.min(CAPACITY, s.filled + 1);
    s.mesh.count = s.filled;
    s.mesh.instanceMatrix.needsUpdate = true;
  };

  return {
    /** wheelWorld: [izqDel, izqMed, izqTra, derDel, derMed, derTra] */
    update(wheelWorld, heading = 0) {
      if (!wheelWorld || wheelWorld.length < 6) return;
      emit(0, wheelWorld[1].x, wheelWorld[1].z, heading);
      emit(1, wheelWorld[4].x, wheelWorld[4].z, heading);
    },
  };
}
