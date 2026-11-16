import * as THREE from 'three';
import { terrainHeight, terrainNormal } from './terrain.js';

const STEP = 0.085; // metros entre muestras de la huella
const CAPACITY = 2400; // muestras por lado (~200 m de historial)
const FADE = 620; // muestras sobre las que se desvanece lo más antiguo
const HALF_WIDTH = 0.23; // media anchura total (surco + arena removida)
const LIFT = 0.012; // separación sobre el terreno
const PATTERN = 1.65; // longitud de una vuelta de rueda (m)
const FULL_ALPHA_TAIL = 70; // últimas muestras siempre opacas

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Textura procedural de huella: surco irregular con garras transversales
 * (24 por vuelta de rueda), grano, piedrecillas y borde de arena removida.
 */
function makeTrackTexture() {
  const W = 256;
  const H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const data = img.data;
  const TAU = Math.PI * 2;

  for (let y = 0; y < H; y++) {
    const v = y / H;

    // Borde del surco: ondulación periódica para que la textura sea continua.
    const edgeVar =
      Math.sin(v * TAU * 3 + 0.7) * 0.06 +
      Math.sin(v * TAU * 7 + 2.1) * 0.03 +
      Math.sin(v * TAU * 13 + 4.4) * 0.016 +
      Math.sin(v * TAU * 23 + 1.9) * 0.008;

    for (let x = 0; x < W; x++) {
      const u = x / W;
      const across = u * 2 - 1;
      const aa = Math.abs(across);
      const edge = 0.60 + edgeVar + Math.sin(across * 5.3 + v * TAU * 2) * 0.03;

      const inside = smoothstep(edge + 0.04, edge - 0.16, aa);
      const rim = smoothstep(edge + 0.38, edge + 0.005, aa) * (1 - inside);

      // Garras en chevrón, como las del Perseverance.
      const phase =
        (v * 24 + 0.30 * Math.abs(across) + 0.08 * across * across + 0.02 * Math.sin(across * 2.4)) % 1;
      const bar = smoothstep(0.02, 0.08, phase) * smoothstep(0.32, 0.22, phase);
      const barEdge = smoothstep(0.32, 0.37, phase) * smoothstep(0.46, 0.40, phase);
      // No todas las garras imprimen igual: unas quedan más marcadas.
      const barDepth =
        0.2 + 0.12 * Math.sin(v * TAU * 2 + 1.3) + 0.07 * Math.sin(v * TAU * 5 + 0.6);

      // Grano fino, no periódico: se lee como arena.
      let h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      h -= Math.floor(h);
      const grit = h;

      // Vetas largas (arena que rellena unas zonas más que otras).
      const patch =
        0.5 +
        0.22 * Math.sin(v * TAU * 2 + 1.1) +
        0.16 * Math.sin(v * TAU * 5 + 2.7) +
        0.12 * Math.sin(v * TAU * 9 + 0.4);

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      if (inside > 0.001) {
        // Surco: pardo oscuro con grano y garras algo más marcadas.
        const tone = 0.55 + grit * 0.45;
        const dark = 1 - bar * barDepth;
        const lighten = barEdge * barDepth;
        r = (64 + tone * 38 + lighten * 90 + patch * 16) * dark;
        g = (38 + tone * 29 + lighten * 66 + patch * 12) * dark;
        b = (23 + tone * 19 + lighten * 44 + patch * 8) * dark;
        a = (0.34 + grit * 0.14) * inside * (0.86 + patch * 0.24);
        // Pequeños huecos y granos claros atrapados en el surco.
        if (grit > 0.986) a *= 0.2;
        else if (grit < 0.012) {
          r += 54;
          g += 40;
          b += 26;
        }
      }

      if (rim > 0.001) {
        // Arena desplazada hacia los lados: halo claro e irregular.
        const tone = 0.45 + grit * 0.55;
        r += (168 + tone * 30) * rim * 0.30;
        g += (119 + tone * 25) * rim * 0.30;
        b += (84 + tone * 18) * rim * 0.30;
        a += rim * (0.10 + grit * 0.10);
      }

      const i = (y * W + x) * 4;
      data[i] = clamp(r, 0, 255);
      data[i + 1] = clamp(g, 0, 255);
      data[i + 2] = clamp(b, 0, 255);
      data[i + 3] = clamp(a, 0, 1) * 255;
    }
  }

  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Huellas de las ruedas: una cinta continua por lado que se adapta al
 * terreno, usa una textura de banda de rodadura y se desvanece con el
 * tiempo (como si el viento fuese borrando la arena).
 */
export function createTracks(scene) {
  const material = new THREE.MeshStandardMaterial({
    map: makeTrackTexture(),
    transparent: true,
    depthWrite: false,
    roughness: 0.98,
    metalness: 0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });

  // Atributo extra por vértice para desvanecer la cola de cada huella.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aTrackAlpha;\nvarying float vTrackAlpha;'
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTrackAlpha = aTrackAlpha;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTrackAlpha;')
      .replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\ngl_FragColor.a *= vTrackAlpha;'
      );
  };
  material.customProgramCacheKey = () => 'tracks-ribbon';

  const sides = [0, 1].map(() => {
    const positions = new Float32Array(CAPACITY * 2 * 3);
    const normals = new Float32Array(CAPACITY * 2 * 3);
    const uvs = new Float32Array(CAPACITY * 2 * 2);
    const alphas = new Float32Array(CAPACITY * 2);
    const indices = new Uint16Array((CAPACITY - 1) * 6);

    for (let i = 0; i < CAPACITY - 1; i++) {
      const a = i * 2;
      const o = i * 6;
      indices[o] = a;
      indices[o + 1] = a + 1;
      indices[o + 2] = a + 2;
      indices[o + 3] = a + 1;
      indices[o + 4] = a + 3;
      indices[o + 5] = a + 2;
    }

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
    const nrmAttr = new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage);
    const uvAttr = new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage);
    const alphaAttr = new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('normal', nrmAttr);
    geo.setAttribute('uv', uvAttr);
    geo.setAttribute('aTrackAlpha', alphaAttr);
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.setDrawRange(0, 0);

    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    scene.add(mesh);

    return {
      points: [],
      prevX: null,
      prevZ: null,
      acc: 0,
      v: 0,
      geo,
      positions,
      normals,
      uvs,
      alphas,
      posAttr,
      nrmAttr,
      uvAttr,
      alphaAttr,
    };
  });

  const rebuild = (s) => {
    const n = s.points.length;
    if (!n) return;

    const fadeStart = Math.max(0, n - FADE);
    const fadeEnd = Math.max(fadeStart + 1, n - FULL_ALPHA_TAIL);

    for (let i = 0; i < n; i++) {
      const p = s.points[i];
      const pj = i * 6;
      s.positions[pj] = p.lx;
      s.positions[pj + 1] = p.ly;
      s.positions[pj + 2] = p.lz;
      s.positions[pj + 3] = p.rx;
      s.positions[pj + 4] = p.ry;
      s.positions[pj + 5] = p.rz;

      const nj = i * 6;
      s.normals[nj] = p.lnx;
      s.normals[nj + 1] = p.lny;
      s.normals[nj + 2] = p.lnz;
      s.normals[nj + 3] = p.rnx;
      s.normals[nj + 4] = p.rny;
      s.normals[nj + 5] = p.rnz;

      const uj = i * 4;
      s.uvs[uj] = 0;
      s.uvs[uj + 1] = p.v;
      s.uvs[uj + 2] = 1;
      s.uvs[uj + 3] = p.v;

      const t = clamp((i - fadeStart) / (fadeEnd - fadeStart), 0, 1);
      const a = t * t * (3 - 2 * t);
      s.alphas[i * 2] = a;
      s.alphas[i * 2 + 1] = a;
    }

    s.posAttr.needsUpdate = true;
    s.nrmAttr.needsUpdate = true;
    s.uvAttr.needsUpdate = true;
    s.alphaAttr.needsUpdate = true;
    s.geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
  };

  const tmpNormal = new THREE.Vector3();

  const pushPoint = (s, cx, cz, heading) => {
    // Perpendicular al rumbo del rover: evita cintas retorcidas al reverso.
    const rx = Math.cos(heading) * HALF_WIDTH;
    const rz = -Math.sin(heading) * HALF_WIDTH;
    const lx = cx - rx;
    const lz = cz - rz;
    const px = cx + rx;
    const pz = cz + rz;

    terrainNormal(lx, lz, tmpNormal);
    const lnx = tmpNormal.x;
    const lny = tmpNormal.y;
    const lnz = tmpNormal.z;
    terrainNormal(px, pz, tmpNormal);
    const rnx = tmpNormal.x;
    const rny = tmpNormal.y;
    const rnz = tmpNormal.z;

    s.v += STEP / PATTERN;
    s.points.push({
      lx,
      ly: terrainHeight(lx, lz) + LIFT,
      lz,
      lnx,
      lny,
      lnz,
      rx: px,
      ry: terrainHeight(px, pz) + LIFT,
      rz: pz,
      rnx,
      rny,
      rnz,
      v: s.v,
    });

    if (s.points.length > CAPACITY) s.points.splice(0, s.points.length - CAPACITY + 160);
    rebuild(s);
  };

  const emit = (s, cx, cz, heading) => {
    if (s.prevX === null) {
      s.prevX = cx;
      s.prevZ = cz;
      s.acc = 0;
      pushPoint(s, cx, cz, heading);
      return;
    }

    const dx = cx - s.prevX;
    const dz = cz - s.prevZ;
    const d = Math.hypot(dx, dz);
    if (d < 1e-5) return;

    s.acc += d;
    while (s.acc >= STEP) {
      const back = s.acc - STEP;
      const t = (d - back) / d;
      pushPoint(s, s.prevX + dx * t, s.prevZ + dz * t, heading);
      s.acc -= STEP;
    }

    s.prevX = cx;
    s.prevZ = cz;
  };

  return {
    /** wheelWorld: [izqDel, izqMed, izqTra, derDel, derMed, derTra] */
    update(wheelWorld, heading = 0) {
      if (!wheelWorld || wheelWorld.length < 6) return;
      for (let side = 0; side < 2; side++) {
        const a = wheelWorld[side * 3];
        const b = wheelWorld[side * 3 + 1];
        const c = wheelWorld[side * 3 + 2];
        const cx = (a.x + b.x + c.x) / 3;
        const cz = (a.z + b.z + c.z) / 3;
        emit(sides[side], cx, cz, heading);
      }
    },
  };
}
