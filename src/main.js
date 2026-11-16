import * as THREE from 'three';
import { createRenderer, createCamera, bindResize } from './core/renderer.js';
import { createLighting } from './core/lighting.js';
import { CameraRig } from './core/camera.js';
import { Input } from './core/input.js';
import { createTerrain, terrainHeight } from './world/terrain.js';
import { createSky } from './world/sky.js';
import { createRocks } from './world/rocks.js';
import { createTracks } from './world/tracks.js';
import { createDust } from './world/dust.js';
import { createMoons } from './world/moons.js';
import { createMotes } from './world/motes.js';
import { createRealRover, pulseIndicator } from './rover/real.js';
import { RoverController } from './rover/controller.js';
import { Hud } from './ui/hud.js';
import { initCameraPhotos } from './ui/camera-photos.js';

// ---------------------------------------------------------------------------
// Escena
// ---------------------------------------------------------------------------
const renderer = createRenderer(document.getElementById('app'));
const camera = createCamera();
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd8a077, 150, 960);

const sunDir = (() => {
  const az = THREE.MathUtils.degToRad(208);
  const el = THREE.MathUtils.degToRad(5.5);
  return new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el)
  ).normalize();
})();

const sky = createSky(sunDir);
scene.add(sky);

const terrain = createTerrain();
scene.add(terrain);

const lighting = createLighting(scene, sunDir);

const { boulders } = createRocks(scene);

const rover = createRealRover();
scene.add(rover.group);

let modelReady = false;
rover.ready.then((ok) => {
  modelReady = ok;
  // Inicializar el visor de fotos de cámaras.
  if (ok) initCameraPhotos(rover, scene, camera, renderer);
});

const controller = new RoverController(rover, { heightAt: terrainHeight, boulders });
const tracks = createTracks(scene);
const dust = createDust(scene);
const moons = createMoons();
scene.add(moons.group);
const motes = createMotes(scene);

// Entorno IBL a partir del propio cielo: da reflejos creíbles al metal.
const pmrem = new THREE.PMREMGenerator(renderer);
{
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(sky.geometry, sky.material));
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000),
    new THREE.MeshBasicMaterial({ color: 0x8a4e30 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -3;
  envScene.add(ground);
  const envRT = pmrem.fromScene(envScene, 0.02, 0.5, 6000);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.85;
  pmrem.dispose();
}

const rig = new CameraRig(camera, renderer.domElement);
const input = new Input();
input.onCamera = () => rig.nextPreset();
const hud = new Hud();

bindResize(renderer, camera);

// ---------------------------------------------------------------------------
// Bucle
// ---------------------------------------------------------------------------
let ready = false;
let loader = document.getElementById('loader');
const hint = document.getElementById('hint');

function step(dt) {
  controller.update(dt, input);
  const driving = Math.abs(controller.speed) > 0.15;
  rig.update(dt, rover.group.position, terrainHeight, driving ? controller.heading : null);
  lighting.update(rover.group.position);
  sky.position.copy(camera.position);
  moons.update(camera.position);
  motes.update(dt, camera);
  tracks.update(controller.wheelWorld, controller.heading);
  dust.update(dt, Math.abs(controller.speed) > 0.4, controller.wheelWorld);
  hud.update(controller, dt);
}

function markReady() {
  ready = true;
  window.__roverReady = true;
  if (loader) {
    loader.classList.add('done');
    const el = loader;
    setTimeout(() => el.remove(), 900);
    loader = null;
  }
  setTimeout(() => hint?.classList.add('hide'), 9000);
}

const timer = new THREE.Timer();
timer.connect(document);

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 1 / 20);
  if (!window.__paused) step(dt);

  // Actualizar pulsación de indicadores de cámara.
  if (rover.cameraIndicators) {
    rover.cameraIndicators.forEach(({ indicator }) => {
      pulseIndicator(indicator, dt);
    });
  }

  renderer.render(scene, camera);
  if (!ready && modelReady) markReady();
});

// Hooks para la verificación automática.
window.__sim = (frames = 1, dt = 1 / 60) => {
  for (let i = 0; i < frames; i++) step(dt);
  renderer.render(scene, camera);
};
window.__test = { controller, rover, rig, camera, renderer, scene, terrainHeight };

// Posición inicial de cámara.
rig.update(1, rover.group.position, terrainHeight);
