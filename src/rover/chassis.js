import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function rod(a, b, radius, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 12), mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  return mesh;
}

/**
 * Cuerpo del Perseverance (WAR): chasis, cubierta, RTG, mástil con
 * Mastcam-Z / SuperCam, antena de alto ganancia, UHF y brazo robótico.
 * Todas las medidas en metros, con el morro hacia +Z.
 */
export function createChassis(mats) {
  const group = new THREE.Group();

  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // --- Chasis y cubierta ---------------------------------------------------
  add(new THREE.BoxGeometry(2.0, 0.5, 1.6), mats.alu, 0, 0, 0);
  add(new THREE.BoxGeometry(1.72, 0.14, 1.32), mats.aluDeep, 0, -0.32, 0);
  add(new THREE.BoxGeometry(2.06, 0.075, 1.68), mats.aluDark, 0, 0.29, 0);

  // Lámina dorada (Kapton) y mantas térmicas en los laterales.
  add(new THREE.BoxGeometry(0.026, 0.2, 1.1), mats.gold, 1.008, -0.01, 0);
  add(new THREE.BoxGeometry(0.026, 0.2, 1.1), mats.gold, -1.008, -0.01, 0);
  add(new THREE.BoxGeometry(0.028, 0.1, 1.24), mats.black, 1.008, 0.15, 0);
  add(new THREE.BoxGeometry(0.028, 0.1, 1.24), mats.black, -1.008, 0.15, 0);

  // Placa frontal blanca y faldón inferior.
  add(new THREE.BoxGeometry(1.64, 0.3, 0.02), mats.white, 0, 0.02, 0.806);
  add(new THREE.BoxGeometry(1.86, 0.06, 0.04), mats.panel, 0, -0.22, 0.806);

  // Cajas de aviónica y paneles.
  add(new THREE.BoxGeometry(0.78, 0.26, 0.58), mats.white, -0.48, 0.45, 0.3);
  add(new THREE.BoxGeometry(0.5, 0.2, 0.52), mats.panel, 0.54, 0.42, -0.34);
  add(new THREE.BoxGeometry(0.3, 0.12, 0.4), mats.gold, -0.35, 0.42, -0.45);

  // --- RTG (MMRTG) en la parte trasera ------------------------------------
  const rtg = add(new THREE.CylinderGeometry(0.31, 0.31, 0.82, 24), mats.black, 0, 0.16, -1.02, Math.PI / 2, 0, 0);
  rtg.name = 'rtg';

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.3, 0.74), mats.black);
    fin.position.set(Math.cos(a) * 0.42, 0.16 + Math.sin(a) * 0.42, -1.02);
    fin.rotation.z = a - Math.PI / 2;
    fin.castShadow = true;
    group.add(fin);
  }
  add(new THREE.BoxGeometry(0.55, 0.1, 0.28), mats.aluDark, 0, 0.16, -0.62);

  // --- Mástil remoto (RSS) con Mastcam-Z y SuperCam ------------------------
  add(new THREE.CylinderGeometry(0.08, 0.11, 0.98, 18), mats.alu, -0.7, 0.82, 0.52);
  add(new THREE.CylinderGeometry(0.13, 0.13, 0.07, 18), mats.aluDark, -0.7, 0.35, 0.52);

  const head = new THREE.Group();
  head.position.set(-0.7, 1.36, 0.52);
  const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.26), mats.white);
  headBox.castShadow = true;
  head.add(headBox);
  for (const dx of [-0.11, 0.11]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 16), mats.aluDark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(dx, -0.01, 0.17);
    barrel.castShadow = true;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.03, 16), mats.lens);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(dx, -0.01, 0.235);
    head.add(barrel, lens);
  }
  const superCam = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.26, 16), mats.copper);
  superCam.rotation.x = Math.PI / 2;
  superCam.position.set(0, 0.13, 0.14);
  superCam.castShadow = true;
  head.add(superCam);
  group.add(head);

  // --- Antenas -------------------------------------------------------------
  add(new THREE.CylinderGeometry(0.36, 0.36, 0.035, 6), mats.white, 0.6, 0.6, -0.16, 0.55, 0, 0.18);
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.52, 6), mats.aluDark, -0.92, 0.57, -0.42);
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 10), mats.aluDark, 0.3, 0.4, 0.62);

  // --- Cámaras de navegación y obstáculos ---------------------------------
  for (const dx of [-0.52, 0.52]) {
    add(new THREE.BoxGeometry(0.16, 0.11, 0.1), mats.aluDark, dx, 0.12, 0.83);
    add(new THREE.BoxGeometry(0.09, 0.07, 0.02), mats.lens, dx, 0.12, 0.885);
  }

  // --- Brazo robótico plegado ---------------------------------------------
  const arm = new THREE.Group();
  const p0 = new THREE.Vector3(-0.82, 0.02, 0.76);
  const p1 = new THREE.Vector3(-0.22, -0.24, 0.9);
  const p2 = new THREE.Vector3(0.42, -0.16, 0.9);
  const p3 = new THREE.Vector3(0.7, -0.2, 0.86);

  for (const [a, b] of [[p0, p1], [p1, p2], [p2, p3]]) {
    const seg = rod(a, b, 0.062, mats.alu);
    seg.castShadow = true;
    arm.add(seg);
  }
  for (const p of [p1, p2]) {
    const j = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), mats.aluDark);
    j.position.copy(p);
    j.castShadow = true;
    arm.add(j);
  }
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.24, 16), mats.white);
  turret.position.copy(p3);
  turret.rotation.z = Math.PI / 2;
  turret.castShadow = true;
  arm.add(turret);

  const drill = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.02, 0.26, 12), mats.aluDark);
  drill.position.set(p3.x, p3.y - 0.24, p3.z);
  drill.castShadow = true;
  arm.add(drill);

  group.add(arm);

  return { group, head, arm };
}
