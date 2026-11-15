/**
 * Estado del teclado. Se consulta cada frame.
 */
export class Input {
  constructor() {
    this.keys = new Set();
    this.onCamera = null;

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (!e.repeat) {
        this.keys.add(e.code);
        if (e.code === 'KeyC' && this.onCamera) this.onCamera();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get forward() {
    return this.keys.has('KeyW') || this.keys.has('ArrowUp');
  }
  get back() {
    return this.keys.has('KeyS') || this.keys.has('ArrowDown');
  }
  get left() {
    return this.keys.has('KeyA') || this.keys.has('ArrowLeft');
  }
  get right() {
    return this.keys.has('KeyD') || this.keys.has('ArrowRight');
  }
  get turbo() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }
}
