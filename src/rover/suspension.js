import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function beam(a, b, width, height, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, len), mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Z_AXIS, dir.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function rod(a, b, radius, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 12), mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

function joint(at, radius, mat) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.16, 14), mat);
  mesh.rotation.z = Math.PI / 2;
  mesh.position.copy(at);
  mesh.castShadow = true;
  return mesh;
}

/**
 * Suspensión rocker-bogie: balancín (rocker) que une la rueda delantera
 * con el bogie trasero, y bogie que sostiene las dos ruedas traseras.
 * Coordenadas locales al centro del chasis.
 */
export function createSuspension(mats) {
  const group = new THREE.Group();

  for (const side of [-1, 1]) {
    const rockerPivot = new THREE.Vector3(side * 0.82, 0.02, 0.22);
    const frontHub = new THREE.Vector3(side * 1.02, -0.6875, 1.05);
    const bogiePivot = new THREE.Vector3(side * 1.02, -0.24, -0.46);
    const midHub = new THREE.Vector3(side * 1.02, -0.6875, -0.02);
    const rearHub = new THREE.Vector3(side * 1.02, -0.6875, -1.08);

    group.add(beam(rockerPivot, frontHub, 0.075, 0.1, mats.aluDark));
    group.add(beam(rockerPivot, bogiePivot, 0.075, 0.1, mats.aluDark));
    group.add(beam(bogiePivot, midHub, 0.065, 0.09, mats.aluDark));
    group.add(beam(bogiePivot, rearHub, 0.065, 0.09, mats.aluDark));

    group.add(joint(rockerPivot, 0.075, mats.aluDeep));
    group.add(joint(bogiePivot, 0.065, mats.aluDeep));

    // Amortiguadores decorativos entre chasis y balancín.
    group.add(rod(
      new THREE.Vector3(side * 0.62, 0.16, 0.12),
      new THREE.Vector3(side * 0.94, -0.1, -0.1),
      0.032,
      mats.copper
    ));
  }

  return group;
}
