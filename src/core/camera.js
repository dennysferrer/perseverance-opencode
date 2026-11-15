import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Órbita cinematográfica alrededor del rover.
 * Arrastrar = rotar · rueda = zoom · C = ciclar encuadres.
 */
export class CameraRig {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.yaw = 0.75;
    this.pitch = 0.05;
    this.dist = 10.5;
    this.target = new THREE.Vector3(0, 1.2, 0);
    this.soft = new THREE.Vector3(0, 1.2, 0);
    this.dragging = false;
    this.last = { x: 0, y: 0 };
    this.autoFollow = true;
    this.lastInteraction = -1e9;
    this.presets = [
      { yaw: 0.75, pitch: 0.12, dist: 10.0 },
      { yaw: -1.25, pitch: 0.14, dist: 8.0 },
      { yaw: 0.05, pitch: 0.85, dist: 14.5 },
      { yaw: 2.35, pitch: 0.2, dist: 7.4 },
    ];
    this.preset = 0;

    domElement.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.autoFollow = false;
      this.lastInteraction = performance.now();
      this.last.x = e.clientX;
      this.last.y = e.clientY;
      domElement.setPointerCapture(e.pointerId);
    });
    domElement.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.last.x;
      const dy = e.clientY - this.last.y;
      this.last.x = e.clientX;
      this.last.y = e.clientY;
      this.lastInteraction = performance.now();
      this.yaw -= dx * 0.0055;
      this.pitch = clamp(this.pitch + dy * 0.0045, 0.04, 1.32);
    });
    const end = () => { this.dragging = false; };
    domElement.addEventListener('pointerup', end);
    domElement.addEventListener('pointercancel', end);
    domElement.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.dist = clamp(this.dist * Math.exp(e.deltaY * 0.0011), 4.2, 42);
    }, { passive: false });
  }

  nextPreset() {
    this.preset = (this.preset + 1) % this.presets.length;
    const p = this.presets[this.preset];
    this.autoFollow = false;
    this.lastInteraction = performance.now();
    this.yaw = p.yaw;
    this.pitch = p.pitch;
    this.dist = p.dist;
  }

  update(dt, position, heightAt, heading = null) {
    // Tras unos segundos sin tocar la cámara, vuelve a seguir al rover.
    if (!this.dragging && performance.now() - this.lastInteraction > 2600) {
      this.autoFollow = true;
    }
    if (this.autoFollow && Number.isFinite(heading)) {
      const target = heading + Math.PI; // detrás del morro
      const delta = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
      this.yaw += delta * (1 - Math.exp(-3.4 * dt));
    }

    this.target.set(position.x, position.y + 1.15, position.z);
    const k = 1 - Math.pow(0.0008, dt);
    this.soft.lerp(this.target, k);

    const cp = Math.cos(this.pitch);
    const x = this.soft.x + Math.sin(this.yaw) * cp * this.dist;
    const z = this.soft.z + Math.cos(this.yaw) * cp * this.dist;
    let y = this.soft.y + Math.sin(this.pitch) * this.dist;
    const floor = heightAt(x, z) + 1.1;
    if (y < floor) y = floor;

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.soft);
  }
}
