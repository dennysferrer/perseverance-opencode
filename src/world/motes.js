import * as THREE from 'three';

const COUNT = 260;
const SPAN = 38;

/**
 * Polvo fino suspendido en el aire. Rodea a la cámara y se recicla
 * para dar sensación de atmósfera densa.
 */
export function createMotes(scene) {
  const positions = new Float32Array(COUNT * 3);
  const drift = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * SPAN * 2;
    positions[i * 3 + 1] = Math.random() * 9;
    positions[i * 3 + 2] = (Math.random() - 0.5) * SPAN * 2;
    drift[i * 3] = 0.25 + Math.random() * 0.5;
    drift[i * 3 + 1] = 0.02 + Math.random() * 0.06;
    drift[i * 3 + 2] = 0.1 + Math.random() * 0.3;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

  const mat = new THREE.PointsMaterial({
    color: 0xe8b98e,
    size: 0.09,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    fog: true,
    blending: THREE.NormalBlending,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  return {
    update(dt, camera) {
      const cx = camera.position.x;
      const cy = camera.position.y;
      const cz = camera.position.z;

      for (let i = 0; i < COUNT; i++) {
        const ix = i * 3;
        positions[ix] += drift[ix] * dt;
        positions[ix + 1] += drift[ix + 1] * dt;
        positions[ix + 2] += drift[ix + 2] * dt;

        // Reciclado alrededor de la cámara.
        if (positions[ix] - cx > SPAN) positions[ix] -= SPAN * 2;
        if (positions[ix] - cx < -SPAN) positions[ix] += SPAN * 2;
        if (positions[ix + 2] - cz > SPAN) positions[ix + 2] -= SPAN * 2;
        if (positions[ix + 2] - cz < -SPAN) positions[ix + 2] += SPAN * 2;
        if (positions[ix + 1] - cy > 12) positions[ix + 1] = cy - 1;
        if (positions[ix + 1] < cy - 6) positions[ix + 1] = cy + 6;
      }

      geo.attributes.position.needsUpdate = true;
    },
  };
}
