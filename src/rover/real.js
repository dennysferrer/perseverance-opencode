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

      // 5) Identificar las piezas que son cámaras.
      model.traverse((obj) => {
        if (!obj.name) return;
        if (!CAMERA_RE.test(obj.name) || ACCESSORY_RE.test(obj.name)) return;
        obj.userData.isCamera = true;
        rover.cameraParts.push(obj);
      });

      const names = [...new Set(rover.cameraParts.map((o) => o.name))];
      const dims = box.getSize(new THREE.Vector3());
      console.log(
        '[rover] Modelo NASA cargado · dimensiones (m):',
        dims.toArray().map((n) => +n.toFixed(2)).join(' × ')
      );
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
