/**
 * Telemetría en pantalla. Se actualiza ~12 veces por segundo.
 */
export class Hud {
  constructor() {
    this.speed = document.getElementById('t-speed');
    this.head = document.getElementById('t-head');
    this.tilt = document.getElementById('t-tilt');
    this.odo = document.getElementById('t-odo');
    this.pos = document.getElementById('t-pos');
    this.acc = 0;
  }

  update(controller, dt) {
    this.acc += dt;
    if (this.acc < 0.08) return;
    this.acc = 0;

    this.speed.textContent = Math.abs(controller.speed).toFixed(2);
    this.head.textContent = String(Math.round(controller.headingDeg)).padStart(3, '0');
    this.tilt.textContent = controller.tiltDeg.toFixed(1);
    this.odo.textContent = controller.odometer.toFixed(1);
    this.pos.textContent = `${controller.x.toFixed(0)}, ${controller.z.toFixed(0)}`;
  }
}
