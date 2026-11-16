import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export const MODEL_URL = '/models/perseverance.glb';
export const TARGET_LENGTH = 3.0; // Perseverance real: 3 m de largo
export const PIVOT_Y = 0.62; // altura del eje de balanceo de la suspensión
const MODEL_YAW = 0; // orientación del GLB respecto al morro (+Z)

// Piezas que son cámaras (se excluyen tapas, cableado y soportes).
const CAMERA_RE = /(mastcam|navcams?|hazcams?|watson|supercam|sherloc|up_look_camera|down_look_camera)/i;
const ACCESSORY_RE = /(cover|wiring|bracket)/i;

// Configuración de los indicadores de cámara (puntos brillantes).
export const CAMERA_INDICATOR_CONFIG = {
  size: 0.3,
  color: 0xffc27a,
  pulseSpeed: 2.2,
  pulseMin: 0.78,
  pulseMax: 1.15,
};

/** Textura radial para el halo luminoso de la cámara. */
function makeGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,214,160,0.95)');
  g.addColorStop(0.5, 'rgba(255,160,80,0.35)');
  g.addColorStop(1, 'rgba(255,140,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Crear un indicador brillante (halo) para una cámara. */
export function createCameraIndicator(scene, position, name) {
  const mat = new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color: CAMERA_INDICATOR_CONFIG.color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(position);
  sprite.name = `cam_indicator_${name}`;
  sprite.renderOrder = 999;
  sprite.scale.setScalar(CAMERA_INDICATOR_CONFIG.size);
  sprite.userData = {
    phase: Math.random() * Math.PI * 2,
    name,
    baseSize: CAMERA_INDICATOR_CONFIG.size,
    hovered: false,
  };
  scene.add(sprite);
  return sprite;
}

/** Hacer parpadear el indicador cada frame. */
export function pulseIndicator(sprite, dt) {
  const ud = sprite.userData;
  ud.phase = (ud.phase + dt * CAMERA_INDICATOR_CONFIG.pulseSpeed) % (Math.PI * 2);
  const u = Math.sin(ud.phase) * 0.5 + 0.5;
  const pulse =
    CAMERA_INDICATOR_CONFIG.pulseMin +
    u * (CAMERA_INDICATOR_CONFIG.pulseMax - CAMERA_INDICATOR_CONFIG.pulseMin);
  const hover = ud.hovered ? 1.45 : 1;
  sprite.scale.setScalar(ud.baseSize * pulse * hover);
}

/**
 * El GLB trae las seis ruedas fusionadas en una sola malla. Las separamos en
 * seis grupos con pivote en el centro de cada rueda para poder girarlas
 * (rodadura) y virarlas (dirección) de forma independiente.
 */
function splitWheels(wheelGroup, { scale, pivotPosition }) {
  const meshes = [];
  wheelGroup.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  if (!meshes.length) return null;

  // Caja local de toda la malla de ruedas (sin transformaciones de padres).
  const box = new THREE.Box3();
  for (const mesh of meshes) {
    mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox);
  }

  const radiusY = (box.max.y - box.min.y) / 2;
  const rowZ = [box.max.z - radiusY, (box.max.z + box.min.z) / 2, box.min.z + radiusY];

  // 6 bolsas: 0-2 lado izquierdo (delantero, medio, trasero), 3-5 derecho.
  const buckets = Array.from({ length: 6 }, () => ({ p: [], n: [], u: [] }));
  const bounds = Array.from({ length: 6 }, () => new THREE.Box3());
  const parts = Array.from({ length: 6 }, () => []);

  for (const mesh of meshes) {
    const src = mesh.geometry;
    const geo = src.index ? src.toNonIndexed() : src;
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const uv = geo.attributes.uv;
    const triCount = Math.floor(pos.count / 3);
    const local = Array.from({ length: 6 }, () => ({ p: [], n: [], u: [] }));

    for (let t = 0; t < triCount; t++) {
      const i = t * 3;
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;

      let row = 0;
      let best = Infinity;
      for (let r = 0; r < 3; r++) {
        const d = Math.abs(cz - rowZ[r]);
        if (d < best) {
          best = d;
          row = r;
        }
      }
      const target = (cx < 0 ? 0 : 3) + row;
      const b = local[target];

      for (let k = 0; k < 3; k++) {
        b.p.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
        if (nrm) b.n.push(nrm.getX(i + k), nrm.getY(i + k), nrm.getZ(i + k));
        if (uv) b.u.push(uv.getX(i + k), uv.getY(i + k));
      }
    }

    if (geo !== src) geo.dispose();

    for (let w = 0; w < 6; w++) {
      const b = local[w];
      if (!b.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      if (b.n.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      if (b.u.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
      g.computeBoundingBox();
      bounds[w].union(g.boundingBox);
      parts[w].push({ geometry: g, material: mesh.material });
    }
  }

  const wheels = [];
  const layout = [];

  for (let w = 0; w < 6; w++) {
    if (!parts[w].length) continue;
    const center = bounds[w].getCenter(new THREE.Vector3());
    const row = w % 3;
    const steer = row !== 1;

    const root = new THREE.Group();
    root.position.copy(center);
    root.name = `wheel_${w}`;
    const spin = new THREE.Group();
    root.add(spin);

    for (const part of parts[w]) {
      part.geometry.translate(-center.x, -center.y, -center.z);
      const mesh = new THREE.Mesh(part.geometry, part.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      spin.add(mesh);
    }

    wheelGroup.add(root);
    wheels.push({ root, spin, side: w < 3 ? -1 : 1, row, steer });

    layout.push({
      x: (wheelGroup.position.x + center.x) * scale + pivotPosition.x,
      z: (wheelGroup.position.z + center.z) * scale + pivotPosition.z,
      steer,
    });
  }

  // Las mallas originales quedan ocultas: las ruedas visibles son las nuevas.
  for (const mesh of meshes) mesh.visible = false;

  return { wheels, layout };
}

/**
 * Carga el modelo oficial del Perseverance de la NASA (GLB con Draco),
 * lo escala a tamaño real y lo apoya sobre el terreno.
 */
export function createRealRover() {
  const group = new THREE.Group();
  group.name = 'perseverance';

  const tilt = new THREE.Group();
  tilt.name = 'tilt';
  tilt.position.y = PIVOT_Y;
  group.add(tilt);

  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });

  const rover = {
    group,
    tilt,
    wheels: [],
    cameraParts: [],
    layout: null,
    ready,
    isReal: true,
  };

  const draco = new DRACOLoader().setDecoderPath('/draco/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  loader.load(
    MODEL_URL,
    (gltf) => {
      const model = gltf.scene;
      const pivot = new THREE.Group();
      pivot.add(model);
      pivot.rotation.y = MODEL_YAW;

      // 1) Escalar a tamaño real usando la dimensión horizontal mayor.
      let box = new THREE.Box3().setFromObject(pivot);
      const raw = box.getSize(new THREE.Vector3());
      const scale = TARGET_LENGTH / Math.max(raw.x, raw.z);
      pivot.scale.setScalar(scale);
      pivot.updateMatrixWorld(true);

      // 2) Centrar usando la huella real de las ruedas y apoyar en y = 0.
      const wheelObj = model.getObjectByName('Wheels_objs');
      box = new THREE.Box3().setFromObject(pivot);
      const wheelBox = wheelObj ? new THREE.Box3().setFromObject(wheelObj) : box;
      const wc = wheelBox.getCenter(new THREE.Vector3());
      pivot.position.set(-wc.x, -box.min.y - PIVOT_Y, -wc.z);
      pivot.updateMatrixWorld(true);

      // 3) Layout de contacto derivado del modelo (para huellas y balanceo).
      const wheelSize = wheelBox.getSize(new THREE.Vector3());
      const wheelRadius = wheelSize.y / 2;
      rover.layout = {
        trackHalf: wheelSize.x / 2 - 0.2,
        wheelRadius,
        wheels: [
          { z: wheelBox.max.z - wheelRadius, steer: true },
          { z: (wheelBox.max.z + wheelBox.min.z) / 2, steer: false },
          { z: wheelBox.min.z + wheelRadius, steer: true },
        ],
      };

      // 4) Sombras y materiales.
      model.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj.material?.envMapIntensity !== undefined) obj.material.envMapIntensity = 1;
      });

      // 5) Separar las ruedas para animar rodadura y dirección.
      if (wheelObj) {
        const rig = splitWheels(wheelObj, { scale, pivotPosition: pivot.position });
        if (rig) {
          rover.wheels = rig.wheels;
          rover.layout.wheels = rig.layout;
          const track = rig.layout.reduce((s, w) => s + Math.abs(w.x), 0) / rig.layout.length;
          rover.layout.trackHalf = track;
        }
      }

      // 6) Identificar las piezas que son cámaras.
      model.traverse((obj) => {
        if (!obj.name) return;
        if (!CAMERA_RE.test(obj.name) || ACCESSORY_RE.test(obj.name)) return;
        obj.userData.isCamera = true;
        rover.cameraParts.push(obj);
      });

      // 7) Crear indicadores brillantes para las 4 cámaras principales.
      // Usamos gltf.scene como el scene Three.js principal.
      const baseScene = gltf.scene;

      const cameraNames = rover.cameraParts.map((o) => o.name);
      const indicatorMap = {
        Mastcam_Z_cams: 'mastcam_z',
        NavCams: 'nav',
        hazcams_front: 'hazcam_front',
        WATSON: 'watson',
      };
      rover.cameraIndicators = [];
      rover.cameraData = {};

      // Cada cámara lleva su propio desplazamiento para que los halos no
      // se solapen (Mastcam y Navcam comparten la cabeza del mástil).
      const INDICATOR_OFFSETS = {
        Mastcam_Z_cams: { x: -0.16, y: 0.3, z: 0 },
        NavCams: { x: 0.16, y: 0.3, z: 0 },
        hazcams_front: { x: 0, y: 0.2, z: 0 },
        WATSON: { x: 0, y: 0.24, z: 0 },
      };

      rover.cameraParts.forEach((obj) => {
        const side = indicatorMap[obj.name];
        if (!side) return;
        const worldPos = obj.getWorldPosition(new THREE.Vector3());
        const off = INDICATOR_OFFSETS[obj.name] || { x: 0, y: 0.25, z: 0 };
        worldPos.x += off.x;
        worldPos.y += off.y;
        worldPos.z += off.z;
        const indicator = createCameraIndicator(baseScene, worldPos, side);
        rover.cameraIndicators.push({ indicator, side, mesh: obj });
        rover.cameraData[side] = {
          name: obj.name,
          mesh: obj,
          indicator,
          worldPos,
        };
      });

      // Nombres de cámara para la consola.
      const names = [...new Set(rover.cameraParts.map((o) => o.name))];

      window.__roverCameras = rover.cameraParts;
      window.__roverCameraNames = cameraNames;
      const dims = box.getSize(new THREE.Vector3());
      console.log(
        '[rover] Modelo NASA cargado · dimensiones (m):',
        dims.toArray().map((n) => +n.toFixed(2)).join(' × ')
      );
      console.log(`[rover] Ruedas animadas: ${rover.wheels.length} · radio ${wheelRadius.toFixed(3)} m`);
      console.log(`[rover] Piezas de cámara (${names.length}): ${names.join(', ')}`);
      names.forEach((n) => console.log(`[rover]   · ${n}`));
      console.log(
        '[rover] Huella · vía:',
        (rover.layout.trackHalf * 2).toFixed(2),
        'm · batalla:',
        Math.abs(rover.layout.wheels[0].z - rover.layout.wheels[2].z).toFixed(2),
        'm · radio rueda:',
        wheelRadius.toFixed(2),
        'm'
      );

      window.__roverCameras = rover.cameraParts;
      window.__roverCameraNames = names;
      tilt.add(pivot);
      resolveReady(true);
    },
    undefined,
    (err) => {
      console.error('[rover] No se pudo cargar el modelo NASA:', err?.message || err);
      resolveReady(false);
    }
  );

  return rover;
}
