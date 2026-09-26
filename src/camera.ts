import * as THREE from 'three';
import { heightAt } from './terrain';

export class FollowCamera {
  // Pointer input sets targets; the rendered orbit follows with a 35 ms time constant.
  yaw = .25;
  pitch = .24;
  distance = 8.5;
  viewYaw = .25;
  private viewPitch = .24;
  private viewDistance = 8.5;
  private target = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private dragging: number | null = null;
  private captured: number | null = null;
  private lastX = 0;
  private lastY = 0;

  constructor(readonly camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
    const startOrbit = (event: PointerEvent) => {
      this.dragging = event.pointerId;canvas.classList.add('orbiting');
      this.lastX = event.clientX;this.lastY = event.clientY;
    };
    const stopOrbit = () => { this.dragging = null;canvas.classList.remove('orbiting'); };
    const release = () => {
      stopOrbit();
      const pointer = this.captured;this.captured = null;
      if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    };
    canvas.addEventListener('pointerdown', event => {
      if (this.captured !== null) return;
      canvas.focus({ preventScroll: true });
      this.captured = event.pointerId;canvas.setPointerCapture(event.pointerId);
      if (event.pointerType !== 'mouse' || (event.buttons & 2) !== 0) startOrbit(event);
    });
    canvas.addEventListener('pointermove', event => {
      if (this.captured !== event.pointerId) return;
      // Chorded mouse buttons change `buttons` through pointermove rather than
      // sending another pointerdown/pointerup for every button transition.
      if (event.pointerType === 'mouse') {
        if ((event.buttons & 2) === 0) { stopOrbit();return; }
        if (this.dragging === null) { startOrbit(event);return; }
      }
      if (this.dragging !== event.pointerId) return;
      this.yaw -= (event.clientX - this.lastX) * .005;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (event.clientY - this.lastY) * .004, .12, 1.05);
      this.lastX = event.clientX;this.lastY = event.clientY;
    });
    canvas.addEventListener('pointerup', event => { if (this.captured === event.pointerId) release(); });
    canvas.addEventListener('pointercancel', event => { if (this.captured === event.pointerId) release(); });
    canvas.addEventListener('lostpointercapture', event => {
      if (this.captured !== event.pointerId) return;
      // Some browsers release capture after a chord's left-button click even
      // while right remains held. Reacquire only within the same active gesture.
      if (event.pointerType === 'mouse' && event.buttons !== 0 && document.hasFocus()) {
        try { canvas.setPointerCapture(event.pointerId);return; } catch { /* Pointer is no longer active. */ }
      }
      release();
    });
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
    canvas.addEventListener('wheel', event => {
      if (event.ctrlKey) return;
      event.preventDefault();this.distance = THREE.MathUtils.clamp(this.distance + event.deltaY * .009, 3.5, 17);
    }, { passive: false });
  }

  reset(position: THREE.Vector3) {
    this.yaw = .25;this.pitch = .24;this.distance = 8.5;this.target.copy(position).y += 1.1;
    this.update(1, position, true);
  }

  update(dt: number, position: THREE.Vector3, snap = false) {
    this.desired.copy(position).y += 1.1;
    this.target.lerp(this.desired, snap ? 1 : 1 - Math.exp(-9 * dt));
    const ease = snap ? 1 : 1 - Math.exp(-dt / .035);
    this.viewYaw = THREE.MathUtils.lerp(this.viewYaw, this.yaw, ease);
    this.viewPitch = THREE.MathUtils.lerp(this.viewPitch, this.pitch, ease);
    this.viewDistance = THREE.MathUtils.lerp(this.viewDistance, this.distance, ease);
    const flat = Math.cos(this.viewPitch) * this.viewDistance;
    this.desired.set(this.target.x + Math.sin(this.viewYaw) * flat,
      this.target.y + Math.sin(this.viewPitch) * this.viewDistance, this.target.z + Math.cos(this.viewYaw) * flat);
    // Lift the eye above the highest terrain intersection along the viewing segment.
    for (let i = 1; i <= 24; i++) {
      const t = i / 24;
      const x = THREE.MathUtils.lerp(this.target.x, this.desired.x, t);
      const z = THREE.MathUtils.lerp(this.target.z, this.desired.z, t);
      this.desired.y = Math.max(this.desired.y, this.target.y + (heightAt(x, z) + .35 - this.target.y) / t);
    }
    this.camera.position.copy(this.desired);this.camera.lookAt(this.target);
  }
}
