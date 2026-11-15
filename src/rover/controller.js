import * as THREE from 'three';
import { terrainHeight } from '../world/terrain.js';
import { TRACK_HALF, WHEEL_LAYOUT } from './index.js';
import { WHEEL_RADIUS } from './wheels.js';
const MAX_FORWARD = 2.8;
const MAX_TURBO = 4.8;
const MAX_REVERSE = 1.4;
const ACCEL = 3.4;
const DRAG = 2.1;
const TURN_RATE = 0.95;
const BOUNDS = 615;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Conducción diferencial + suspensión adaptativa: cada rueda se pega al
 * terreno con su propia altura y el chasis se inclina según los contactos.
 */
export class RoverController {
  constructor(rover, { heightAt = terrainHeight, boulders = [], layout = null } = {}) {
    this.rover = rover;
    this.heightAt = heightAt;
    this.boulders = boulders;
    this.trackHalf = layout?.trackHalf ?? TRACK_HALF;
    this.layout = layout?.wheels ?? WHEEL_LAYOUT;

    this.x = 0;
    this.z = 0;
    this.y = heightAt(0, 0);
    this.heading = 0;
    this.speed = 0;
    this.steer = 0;
    this.pitch = 0;
    this.roll = 0;
    this.spinAngle = 0;
    this.odometer = 0;

    this.wheelHeights = new Float32Array(6);
    this.wheelWorld = Array.from({ length: 6 }, () => new THREE.Vector3());
    this.tmp = new THREE.Vector3();

    this.rover.group.position.set(this.x, this.y, this.z);
    this.placeWheels(0);
  }

  get forwardVector() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  update(dt, input) {
    const maxSpeed = input?.turbo ? MAX_TURBO : MAX_FORWARD;

    if (input?.forward) this.speed += ACCEL * dt;
    else if (input?.back) this.speed -= ACCEL * dt;
    else this.speed *= Math.exp(-DRAG * dt);
    this.speed = clamp(this.speed, -MAX_REVERSE, maxSpeed);

    const turn = (input?.left ? 1 : 0) - (input?.right ? 1 : 0);
    if (turn !== 0) {
      const factor = 0.62 + 0.38 * Math.min(1, Math.abs(this.speed) / MAX_FORWARD);
      this.heading += turn * TURN_RATE * factor * dt;
    }
    this.steer += (turn * 0.36 - this.steer) * (1 - Math.exp(-9 * dt));

    const step = this.speed * dt;
    this.x += Math.sin(this.heading) * step;
    this.z += Math.cos(this.heading) * step;
    this.odometer += Math.abs(step);

    this.resolveCollisions();

    const pose = this.placeWheels(dt);
    this.applyBodyPose(pose, dt);

    this.spinAngle += (this.speed * dt) / WHEEL_RADIUS;
    for (const wheel of this.rover.wheels) wheel.spin.rotation.x = this.spinAngle;
  }

  resolveCollisions() {
    for (const b of this.boulders) {
      const dx = this.x - b.x;
      const dz = this.z - b.z;
      const min = b.r + 1.12;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-5) {
        const d = Math.sqrt(d2);
        const push = min - d;
        this.x += (dx / d) * push;
        this.z += (dz / d) * push;
        this.speed *= 0.3;
      }
    }

    const r = Math.hypot(this.x, this.z);
    if (r > BOUNDS) {
      const k = BOUNDS / r;
      this.x *= k;
      this.z *= k;
      this.speed = 0;
    }
  }

  placeWheels(dt) {
    const cos = Math.cos(this.heading);
    const sin = Math.sin(this.heading);
    const layout = this.rover.layout?.wheels ?? this.layout;
    const trackHalf = this.rover.layout?.trackHalf ?? this.trackHalf;
    let sum = 0;

    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1;
      const spec = layout[i % 3];
      const lx = side * trackHalf;
      const lz = spec.z;

      const wx = this.x + lx * cos + lz * sin;
      const wz = this.z - lx * sin + lz * cos;
      const h = this.heightAt(wx, wz);

      this.wheelHeights[i] = h;
      this.wheelWorld[i].set(wx, h + WHEEL_RADIUS, wz);
      sum += h;
    }

    const avg = sum / 6;
    const k = dt > 0 ? 1 - Math.exp(-14 * dt) : 1;
    this.y += (avg - this.y) * k;

    this.rover.group.position.set(this.x, this.y, this.z);
    this.rover.group.rotation.y = this.heading;

    return {
      front: (this.wheelHeights[0] + this.wheelHeights[3]) / 2,
      rear: (this.wheelHeights[2] + this.wheelHeights[5]) / 2,
      left: (this.wheelHeights[0] + this.wheelHeights[1] + this.wheelHeights[2]) / 3,
      right: (this.wheelHeights[3] + this.wheelHeights[4] + this.wheelHeights[5]) / 3,
    };
  }

  applyBodyPose(pose, dt) {
    const k = dt > 0 ? 1 - Math.exp(-7 * dt) : 1;
    const pitchTarget = -Math.atan2(pose.front - pose.rear, 2.13);
    const rollTarget = Math.atan2(pose.right - pose.left, 2.12);

    this.pitch += (pitchTarget - this.pitch) * k;
    this.roll += (rollTarget - this.roll) * k;

    this.rover.tilt.rotation.x = this.pitch;
    this.rover.tilt.rotation.z = this.roll;
    this.rover.group.updateMatrixWorld(true);

    for (let i = 0; i < this.rover.wheels.length; i++) {
      const wheel = this.rover.wheels[i];
      this.tmp.copy(this.wheelWorld[i]);
      this.rover.tilt.worldToLocal(this.tmp);
      wheel.root.position.copy(this.tmp);

      const layout = this.rover.layout?.wheels ?? this.layout;
      const spec = layout[i % 3];
      if (spec.steer) wheel.root.rotation.y = i < 3 ? this.steer : -this.steer;
    }
  }

  get tiltDeg() {
    return (Math.hypot(this.pitch, this.roll) * 180) / Math.PI;
  }

  get headingDeg() {
    return ((this.heading * 180) / Math.PI % 360 + 360) % 360;
  }
}
