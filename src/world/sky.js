import * as THREE from 'three';

/**
 * Bóveda del cielo marciano: gradiente caramelo, banda de polvo en el
 * horizonte y halo cálido alrededor del sol. Se centra en la cámara.
 */
export function createSky(sunDir) {
  const geo = new THREE.SphereGeometry(3000, 48, 32);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSun: { value: sunDir.clone().normalize() },
      uHorizon: { value: new THREE.Color('#e3a06d') },
      uZenith: { value: new THREE.Color('#9c7486') },
      uGlow: { value: new THREE.Color('#ffcf9c') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      uniform vec3 uGlow;
      varying vec3 vDir;

      void main() {
        vec3 d = normalize(vDir);
        float t = smoothstep(-0.04, 0.72, d.y);
        vec3 col = mix(uHorizon, uZenith, t);

        // Banda de polvo suspendido sobre el horizonte.
        float band = exp(-abs(d.y) * 8.0);
        col = mix(col, uHorizon * 1.06, band * 0.6);

        float s = max(dot(d, normalize(uSun)), 0.0);
        col += uGlow * pow(s, 900.0) * 4.0;   // disco solar
        col += uGlow * pow(s, 14.0) * 0.34;   // halo
        col += uGlow * pow(s, 3.0) * 0.08;    // resplandor amplio

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}
