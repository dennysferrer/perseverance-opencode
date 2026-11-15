import * as THREE from 'three';

const fract = (x) => x - Math.floor(x);
const hash = (ix, iy) => fract(Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123);
const smoothstep = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------------------
// Ruido de valor 2D + fBm
// ---------------------------------------------------------------------------
export function noise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = smoothstep(fx);
  const v = smoothstep(fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function fbm(x, y, oct = 5) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise2(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

// ---------------------------------------------------------------------------
// Altura del terreno: colinas, dunas y grano fino
// ---------------------------------------------------------------------------
function rawHeight(x, z) {
  const rolling = (fbm(x * 0.0034, z * 0.0046, 5) - 0.5) * 30;
  const medium = (fbm(x * 0.018 + 9.3, z * 0.015 - 4.1, 4) - 0.5) * 4.2;
  const drift = fbm(x * 0.0055 - 2.2, z * 0.0061 + 7.7, 3);
  const dunePhase = x * 0.045 + z * 0.017 + drift * 9.0;
  const dunes = Math.pow(Math.abs(Math.sin(dunePhase)), 2.4) * 3.0;
  const fine = (noise2(x * 0.7, z * 0.7) - 0.5) * 0.09;
  return rolling + medium + dunes + fine;
}

const BASE = rawHeight(0, 0);

/** Altura del suelo en coordenadas de mundo (metros). */
export function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  // Zona de aterrizaje algo más suave alrededor del origen.
  const k = smoothstep(clamp((r - 8) / 55, 0, 1));
  return (rawHeight(x, z) - BASE) * (0.42 + 0.58 * k);
}

/** Normal aproximada del terreno. */
export function terrainNormal(x, z, out = new THREE.Vector3()) {
  const e = 0.75;
  const hL = terrainHeight(x - e, z);
  const hR = terrainHeight(x + e, z);
  const hD = terrainHeight(x, z - e);
  const hU = terrainHeight(x, z + e);
  return out.set(hL - hR, 2 * e, hD - hU).normalize();
}

// ---------------------------------------------------------------------------
// Mapa normal procedural de ondulaciones de arena
// ---------------------------------------------------------------------------
function makeSandNormalMap(size = 256) {
  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      field[y * size + x] =
        noise2(x * 0.11, y * 0.11) * 0.7 +
        noise2(x * 0.29 + 31, y * 0.29 - 17) * 0.3 +
        Math.sin(u * 4 + Math.sin(v * 3) * 0.8) * 0.06;
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
      const dx = (at(x + 1, y) - at(x - 1, y)) * 1.15;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 1.15;
      const nx = -dx;
      const ny = -dy;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (nx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(200, 200);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
export const TERRAIN_SIZE = 1500;
const TERRAIN_SEG = 320;

export function createTerrain() {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEG, TERRAIN_SEG);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  const colors = new Float32Array(pos.count * 3);
  const normals = geo.attributes.normal;
  const cDark = new THREE.Color('#7c4529');
  const cMid = new THREE.Color('#b1704a');
  const cLight = new THREE.Color('#dca274');
  const cRock = new THREE.Color('#8a6249');
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = pos.getY(i);
    const slope = 1 - normals.getY(i);
    const grain = noise2(x * 0.022, z * 0.022);
    const broad = fbm(x * 0.004, z * 0.004, 3);

    c.copy(cDark)
      .lerp(cMid, clamp(grain * 0.95 + 0.12, 0, 1))
      .lerp(cLight, clamp(y * 0.028 + broad * 0.42, 0, 1))
      .lerp(cRock, clamp(slope * 2.4, 0, 1));

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
    normalMap: makeSandNormalMap(),
    normalScale: new THREE.Vector2(0.46, 0.46),
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
