import * as THREE from 'three';

const COUNT = 380;

/**
 * Polvo levantado por las ruedas. Partículas tipo point-sprite con
 * vida propia en un shader mínimo.
 */
export function createDust(scene) {
  const positions = new Float32Array(COUNT * 3);
  const lives = new Float32Array(COUNT);
  const sizes = new Float32Array(COUNT);
  const vel = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i++) {
    positions[i * 3 + 1] = -999;
    sizes[i] = 0;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aLife', new THREE.BufferAttribute(lives, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color('#c98b60') } },
    vertexShader: /* glsl */ `
      attribute float aLife;
      attribute float aSize;
      varying float vLife;
      void main() {
        vLife = aLife;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (300.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vLife;
      uniform vec3 uColor;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.04, d) * clamp(vLife, 0.0, 1.0) * 0.5;
        gl_FragColor = vec4(uColor, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  let cursor = 0;
  let spawnAcc = 0;

  const spawn = (x, y, z) => {
    const i = cursor;
    cursor = (cursor + 1) % COUNT;
    positions[i * 3] = x + (Math.random() - 0.5) * 0.5;
    positions[i * 3 + 1] = y + 0.1 + Math.random() * 0.25;
    positions[i * 3 + 2] = z + (Math.random() - 0.5) * 0.5;
    vel[i * 3] = (Math.random() - 0.5) * 0.8 - 0.4;
    vel[i * 3 + 1] = 0.35 + Math.random() * 0.7;
    vel[i * 3 + 2] = (Math.random() - 0.5) * 0.8 + 0.2;
    lives[i] = 1;
    sizes[i] = 0.35 + Math.random() * 0.75;
  };

  return {
    update(dt, moving, wheelWorld) {
      for (let i = 0; i < COUNT; i++) {
        if (lives[i] <= 0) continue;
        lives[i] -= dt * 0.55;
        if (lives[i] <= 0) {
          positions[i * 3 + 1] = -999;
          sizes[i] = 0;
          continue;
        }
        vel[i * 3 + 1] -= 0.5 * dt;
        vel[i * 3] *= 1 - 1.2 * dt;
        vel[i * 3 + 2] *= 1 - 1.2 * dt;
        positions[i * 3] += vel[i * 3] * dt;
        positions[i * 3 + 1] += vel[i * 3 + 1] * dt;
        positions[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (positions[i * 3 + 1] < -900) lives[i] = 0;
      }

      if (moving && wheelWorld?.length >= 6) {
        spawnAcc += dt * 34;
        while (spawnAcc >= 1) {
          spawnAcc -= 1;
          const w = wheelWorld[Math.random() < 0.5 ? 2 : 5];
          spawn(w.x, w.y - 0.15, w.z);
        }
      }

      geo.attributes.position.needsUpdate = true;
      geo.attributes.aLife.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
    },
  };
}
