import * as THREE from 'three';

const std = (params) => new THREE.MeshStandardMaterial(params);

/**
 * Paleta del Perseverance: aluminio, paneles, lámina dorada (Kapton)
 * y cristal de instrumentos.
 */
export function createMaterials() {
  return {
    alu: std({ color: 0xc3c6c8, metalness: 0.88, roughness: 0.34 }),
    aluDark: std({ color: 0x6f7378, metalness: 0.88, roughness: 0.48 }),
    aluDeep: std({ color: 0x4b4f55, metalness: 0.85, roughness: 0.55 }),
    gold: std({ color: 0x9a7038, metalness: 0.92, roughness: 0.46 }),
    black: std({ color: 0x18191b, metalness: 0.35, roughness: 0.72 }),
    wheel: std({ color: 0x9b9ea3, metalness: 0.92, roughness: 0.42 }),
    hub: std({ color: 0x5b5f64, metalness: 0.9, roughness: 0.5 }),
    lens: std({ color: 0x080b10, metalness: 0.9, roughness: 0.1 }),
    panel: std({ color: 0x2d323b, metalness: 0.55, roughness: 0.62 }),
    white: std({ color: 0xd6d2c8, metalness: 0.25, roughness: 0.55 }),
    copper: std({ color: 0x8d5a34, metalness: 0.9, roughness: 0.42 }),
  };
}
