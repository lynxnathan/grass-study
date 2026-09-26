import * as THREE from 'three';

// A contact footprint in world space, independent of its controller or renderer.
// Strength is an impulse rate; dt is applied exactly once by the simulation tick.
export type ContactSource = {
  id: string;
  kind: 'character' | 'brush' | 'object';
  position: THREE.Vector3;
  radius: number;
  strength: number;
  enabled?: boolean;
};

const SIZE = 256;
const SPAN = 168;

// A world-space spring field shared by all blades, with fixed roots in the shader.
export class GrassInteraction {
  private data = new Uint8Array(SIZE * SIZE * 4);
  private x = new Float32Array(SIZE * SIZE);
  private z = new Float32Array(SIZE * SIZE);
  private vx = new Float32Array(SIZE * SIZE);
  private vz = new Float32Array(SIZE * SIZE);
  private active = new Set<number>();
  readonly texture = new THREE.DataTexture(this.data, SIZE, SIZE, THREE.RGBAFormat);
  energy = 0;

  constructor() {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = this.data[i + 1] = 128;this.data[i + 3] = 255;
    }
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
  }

  apply(source: ContactSource, dt: number) {
    if(source.enabled === false || !(dt > 0) || !Number.isFinite(dt) || !(source.radius > 0) || !Number.isFinite(source.radius)
      || !(source.strength > 0) || !Number.isFinite(source.strength) || !Number.isFinite(source.position.x) || !Number.isFinite(source.position.y) || !Number.isFinite(source.position.z)) return;
    this.disturb(source.position, source.radius, source.strength * dt);
  }

  disturb(position: THREE.Vector3, radius: number, strength: number) {
    const cx = (position.x / SPAN + .5) * SIZE - .5;
    const cz = (position.z / SPAN + .5) * SIZE - .5;
    const cells = radius / SPAN * SIZE;
    for (let iz = Math.max(0, Math.floor(cz - cells)); iz <= Math.min(SIZE - 1, Math.ceil(cz + cells)); iz++) {
      for (let ix = Math.max(0, Math.floor(cx - cells)); ix <= Math.min(SIZE - 1, Math.ceil(cx + cells)); ix++) {
        const dx = (ix - cx) / cells, dz = (iz - cz) / cells;
        const distance = Math.hypot(dx, dz);
        if (distance >= 1) continue;
        const i = iz * SIZE + ix, weight = (1 - distance) * strength;
        this.vx[i] += dx / Math.max(distance, .1) * weight;
        this.vz[i] += dz / Math.max(distance, .1) * weight;
        this.active.add(i);
      }
    }
  }

  update(dt: number) {
    if (!this.active.size) { this.energy = 0;return; }
    this.energy = 0;
    for (const i of this.active) {
      // Semi-implicit spring integration; caller caps the step at 1/60 s.
      this.vx[i] += (-32 * this.x[i] - 6 * this.vx[i]) * dt;
      this.vz[i] += (-32 * this.z[i] - 6 * this.vz[i]) * dt;
      this.x[i] = THREE.MathUtils.clamp(this.x[i] + this.vx[i] * dt, -1, 1);
      this.z[i] = THREE.MathUtils.clamp(this.z[i] + this.vz[i] * dt, -1, 1);
      const energy = Math.abs(this.x[i]) + Math.abs(this.z[i]) + Math.abs(this.vx[i]) + Math.abs(this.vz[i]);
      this.energy += energy;
      if (energy < .002) {
        this.active.delete(i);this.x[i] = this.z[i] = this.vx[i] = this.vz[i] = 0;
      }
      this.data[i * 4] = Math.round(128 + this.x[i] * 127);
      this.data[i * 4 + 1] = Math.round(128 + this.z[i] * 127);
    }
    this.texture.needsUpdate = true;
  }
}
