import * as THREE from 'three';
import { terrainHeight, terrainNormal, fbm, noise2 } from './terrain.js';

const mulberry32 = (seed) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Mapa normal de grano para que las rocas no se vean plásticas. */
function makeRockDetailMap(size = 256) {
  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      field[y * size + x] =
        fbm(x * 0.045, y * 0.045, 4) * 0.65 + noise2(x * 0.22, y * 0.22) * 0.35;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => field[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 1.9;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 1.9;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.5, 2.5);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Roca procedural: desplazamiento multi-escala (no radial) + una fractura
 * plana que deja facetas como las piedras partidas del cráter.
 */
function rockGeometry(seed, detail = 2, opts = {}) {
  const { flatten = 0.78, jagged = 1, stretch = 1, facet = 0.88 } = opts;
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const plane = new THREE.Vector3(
    Math.sin(seed * 1.7),
    0.25 + Math.abs(Math.sin(seed * 0.9)) * 0.75,
    Math.cos(seed * 2.3)
  ).normalize();
  const cut = 0.5 + Math.sin(seed * 3.1) * 0.16;

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = v.clone().normalize();

    const n1 = fbm(d.x * 1.7 + seed, d.z * 1.7 - seed, 3);
    const n2 = fbm(d.y * 2.4 - seed, d.x * 2.1 + seed * 0.6, 3);
    const n3 = fbm(d.z * 3.8 + seed, d.y * 3.1 - seed * 1.4, 2);

    let disp =
      0.74 +
      (n1 - 0.5) * 1.05 * jagged +
      (n2 - 0.5) * 0.5 * jagged +
      (n3 - 0.5) * 0.22 * jagged;
    v.multiplyScalar(Math.max(0.38, disp));

    // Fractura plana.
    const pd = v.dot(plane);
    if (pd > cut) v.addScaledVector(plane, (cut - pd) * facet);

    v.y *= flatten;
    v.x *= stretch;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

const ROCK_COLORS = ['#553124', '#663c2c', '#754a34', '#4a2c20', '#835c43'];

export function createRocks(scene) {
  const rng = mulberry32(20210218);
  const group = new THREE.Group();
  group.name = 'rocks';

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0.02,
    flatShading: true,
    normalMap: makeRockDetailMap(),
    normalScale: new THREE.Vector2(0.8, 0.8),
  });

  const boulders = [];
  const placements = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const normal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const smallVariants = [
    rockGeometry(3.1, 1, { flatten: 0.7, jagged: 1.15, facet: 0.8 }),
    rockGeometry(17.7, 1, { flatten: 0.9, jagged: 0.95, facet: 0.85 }),
    rockGeometry(41.3, 1, { flatten: 0.6, jagged: 1.05, facet: 0.75 }),
  ];
  const bigVariants = [
    rockGeometry(3.1, 3, { flatten: 0.72, jagged: 1.05, stretch: 0.92, facet: 0.9 }),
    rockGeometry(17.7, 3, { flatten: 0.86, jagged: 1.2, stretch: 1.06, facet: 0.8 }),
    rockGeometry(41.3, 3, { flatten: 0.58, jagged: 0.92, stretch: 0.88, facet: 0.95 }),
  ];
  const pebbleVariant = rockGeometry(91.7, 0, { flatten: 0.72, jagged: 1.2, facet: 0.8 });

  const place = (mesh, count, radiusMin, radiusMax, sizeMin, sizeMax, minDist, shadow = true) => {
    let n = 0;
    let guard = 0;
    const minD2 = minDist * minDist;

    while (n < count && guard < count * 30) {
      guard++;
      const a = rng() * Math.PI * 2;
      const r = radiusMin + Math.sqrt(rng()) * (radiusMax - radiusMin);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;

      // No bloquear la zona de despliegue.
      if (Math.hypot(x, z) < 12) continue;
      if (placements.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < minD2)) continue;

      const s = sizeMin + Math.pow(rng(), 2.2) * (sizeMax - sizeMin);
      const y = terrainHeight(x, z);

      dummy.position.set(x, y + s * 0.26, z);
      terrainNormal(x, z, normal);
      dummy.quaternion.setFromUnitVectors(up, normal);
      dummy.rotateY(rng() * Math.PI * 2);
      dummy.rotateX((rng() - 0.5) * 0.45);
      dummy.scale.set(s * (0.78 + rng() * 0.55), s * (0.6 + rng() * 0.55), s * (0.78 + rng() * 0.55));
      dummy.updateMatrix();

      mesh.setMatrixAt(n, dummy.matrix);
      color.set(ROCK_COLORS[Math.floor(rng() * ROCK_COLORS.length)]);
      mesh.setColorAt(n, color);

      placements.push({ x, z });
      if (s > 0.75) boulders.push({ x, z, r: s * 0.85 });
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // Guijarros y rocas medianas: más densidad y variedad de tamaño.
  place(
    new THREE.InstancedMesh(smallVariants[0], material, 620),
    620, 12, 720, 0.1, 1.05, 1.15
  );
  place(
    new THREE.InstancedMesh(smallVariants[1], material, 380),
    380, 12, 420, 0.08, 0.75, 0.8
  );

  // Piedrecillas muy pequeñas cerca del recorrido.
  place(
    new THREE.InstancedMesh(pebbleVariant, material, 1100),
    1100, 13, 320, 0.045, 0.22, 0.32, false
  );

  // Rocas pequeñas extra en el entorno cercano, donde más se aprecian.
  place(
    new THREE.InstancedMesh(smallVariants[1], material, 200),
    200, 12, 95, 0.07, 0.42, 0.55
  );

  // Rocas grandes: obstáculos reales, repartidas entre tres formas.
  bigVariants.forEach((geo, i) => {
    place(new THREE.InstancedMesh(geo, material, 34), 34, 20, 700, 1.05, 3.3, 9);
  });

  // Bloques lejanos para silueta.
  place(new THREE.InstancedMesh(smallVariants[2], material, 70), 70, 260, 740, 2.2, 5.0, 12);

  // Rocas "héroe" que enmarcan la composición inicial.
  const heroSpots = [
    { x: -14, z: -9, s: 1.6 },
    { x: -20, z: -18, s: 2.5 },
    { x: 16.5, z: -7, s: 1.15 },
    { x: -3, z: -26, s: 2.9 },
    { x: 18, z: 6, s: 1.3 },
  ];
  const hero = new THREE.InstancedMesh(bigVariants[0], material, heroSpots.length);
  heroSpots.forEach((spot, i) => {
    const y = terrainHeight(spot.x, spot.z);
    dummy.position.set(spot.x, y + spot.s * 0.26, spot.z);
    terrainNormal(spot.x, spot.z, normal);
    dummy.quaternion.setFromUnitVectors(up, normal);
    dummy.rotateY(i * 1.7);
    dummy.scale.set(spot.s * 1.08, spot.s * 0.8, spot.s);
    dummy.updateMatrix();

    hero.setMatrixAt(i, dummy.matrix);
    color.set(ROCK_COLORS[i % ROCK_COLORS.length]);
    hero.setColorAt(i, color);
    boulders.push({ x: spot.x, z: spot.z, r: spot.s * 0.9 });
  });
  hero.count = heroSpots.length;
  hero.castShadow = true;
  hero.receiveShadow = true;
  group.add(hero);

  scene.add(group);
  return { group, boulders };
}
