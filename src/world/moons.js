import * as THREE from 'three';

/**
 * Textura procedural de regolito para las lunas.
 */
function moonTexture(seed, craters = 90) {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#a89a8c';
  ctx.fillRect(0, 0, size, size);

  // Grano fino.
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 26;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  // Cráteres con borde claro e interior sombreado.
  for (let i = 0; i < craters; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 4 + Math.pow(rnd(), 3) * 52;
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.1, x, y, r);
    g.addColorStop(0, 'rgba(60,54,48,0.55)');
    g.addColorStop(0.65, 'rgba(105,96,86,0.35)');
    g.addColorStop(0.88, 'rgba(206,196,182,0.45)');
    g.addColorStop(1, 'rgba(168,154,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeMoon(radius, dir, seed, stretch, craters) {
  const geo = new THREE.SphereGeometry(radius, 48, 32);
  const mat = new THREE.MeshStandardMaterial({
    map: moonTexture(seed, craters),
    roughness: 1,
    metalness: 0,
    fog: false,
    emissive: new THREE.Color(0x14100d),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(dir).normalize().multiplyScalar(2400);
  mesh.scale.copy(stretch);
  mesh.rotation.y = seed;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/**
 * Fobos (grande, irregular) y Deimos (pequeña) sobre el horizonte.
 * El grupo sigue a la cámara para mantenerlos "en el infinito".
 */
export function createMoons() {
  const dirFrom = (azDeg, elDeg) => {
    const az = THREE.MathUtils.degToRad(azDeg);
    const el = THREE.MathUtils.degToRad(elDeg);
    return new THREE.Vector3(
      Math.sin(az) * Math.cos(el),
      Math.sin(el),
      Math.cos(az) * Math.cos(el)
    );
  };

  const group = new THREE.Group();
  group.name = 'moons';

  const phobos = makeMoon(
    44,
    dirFrom(250, 10),
    1234567,
    new THREE.Vector3(1.16, 0.94, 1.04),
    120
  );
  const deimos = makeMoon(
    20,
    dirFrom(228, 13),
    7654321,
    new THREE.Vector3(1.05, 0.97, 1),
    60
  );

  group.add(phobos, deimos);

  return {
    group,
    update(cameraPosition) {
      group.position.copy(cameraPosition);
    },
  };
}
