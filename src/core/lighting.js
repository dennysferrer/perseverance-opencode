import * as THREE from 'three';

/**
 * Sol bajo y cálido de Marte + relleno atmosférico.
 * Sombras suaves (VSM) que siguen al rover para mantener resolución.
 */
export function createLighting(scene, sunDir) {
  const sun = new THREE.DirectionalLight(0xffb877, 4.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -28;
  cam.right = 28;
  cam.top = 28;
  cam.bottom = -28;
  cam.near = 1;
  cam.far = 230;
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 2.6;
  sun.shadow.blurSamples = 10;
  scene.add(sun);
  scene.add(sun.target);

  // Cielo cálido + rebote del suelo.
  const hemi = new THREE.HemisphereLight(0xefc197, 0x6b3a24, 1.15);
  scene.add(hemi);

  const bounce = new THREE.DirectionalLight(0xb06a44, 0.45);
  bounce.position.set(-1, -0.5, 0.7);
  scene.add(bounce);

  // Relleno desde el lado de la cámara para mantener legible el rover
  // en el contraluz del atardecer.
  const fill = new THREE.DirectionalLight(0xffd2ab, 0.6);
  fill.position.set(7000, 5000, 10000);
  scene.add(fill);

  return {
    sun,
    update(focus) {
      sun.position.copy(focus).addScaledVector(sunDir, 95);
      sun.target.position.copy(focus);
      sun.target.updateMatrixWorld();
    },
  };
}
