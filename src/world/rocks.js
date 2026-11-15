import * as THREE from 'three';
import { terrainHeight, terrainNormal, fbm } from './terrain.js';

const mulberry32 = (seed) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function rockGeometry(seed, detail = 2) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm(v.x * 1.6 + seed, v.z * 1.6 - seed, 3);
    const s = 0.72 + n * 0.62;
    v.multiplyScalar(s);
    v.y *= 0.78;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

const ROCK_COLORS = ['#5a3226', '#6d4030', '#7d4a35', '#4e2c22', '#8a5a41'];

export function createRocks(scene) {
  const rng = mulberry32(20210218);
  const group = new THREE.Group();
  group.name = 'rocks';

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0.04,
    flatShading: true,
  });

  const boulders = [];
  const placements = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const normal = new THREE.Vector3();

  const variants = [rockGeometry(3.1), rockGeometry(17.7), rockGeometry(41.3)];

  const place = (mesh, count, radiusMin, radiusMax, sizeMin, sizeMax) => {
    let n = 0;
    let guard = 0;
    while (n < count && guard < count * 30) {
      guard++;
      const a = rng() * Math.PI * 2;
      const r = radiusMin + Math.sqrt(rng()) * (radiusMax - radiusMin);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;

      // No bloquear la zona de despliegue.
      if (Math.hypot(x, z) < 16) continue;
      if (placements.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 6)) continue;

      const s = sizeMin + Math.pow(rng(), 2.2) * (sizeMax - sizeMin);
      const y = terrainHeight(x, z);

      dummy.position.set(x, y + s * 0.28, z);
      terrainNormal(x, z, normal);
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      dummy.rotateY(rng() * Math.PI * 2);
      dummy.rotateX((rng() - 0.5) * 0.4);
      dummy.scale.set(s * (0.8 + rng() * 0.5), s * (0.62 + rng() * 0.55), s * (0.8 + rng() * 0.5));
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
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  // Guijarros y rocas medianas.
  const small = new THREE.InstancedMesh(variants[0], material, 520);
  place(small, 520, 12, 720, 0.12, 1.1);

  // Rocas grandes: obstáculos reales.
  const big = new THREE.InstancedMesh(variants[1], material, 90);
  place(big, 90, 20, 700, 1.1, 3.1);

  // Bloques lejanos para silueta.
  const far = new THREE.InstancedMesh(variants[2], material, 60);
  place(far, 60, 260, 740, 2.2, 5.0);

  // Rocas "héroe" que enmarcan la composición inicial.
  const heroSpots = [
    { x: -14, z: -9, s: 1.6 },
    { x: -20, z: -18, s: 2.5 },
    { x: 16.5, z: -7, s: 1.15 },
    { x: -3, z: -26, s: 2.9 },
    { x: 18, z: 6, s: 1.3 },
  ];
  const hero = new THREE.InstancedMesh(variants[1], material, heroSpots.length);
  heroSpots.forEach((spot, i) => {
    const y = terrainHeight(spot.x, spot.z);
    dummy.position.set(spot.x, y + spot.s * 0.3, spot.z);
    terrainNormal(spot.x, spot.z, normal);
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    dummy.rotateY(i * 1.7);
    dummy.scale.set(spot.s * 1.1, spot.s * 0.82, spot.s);
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
