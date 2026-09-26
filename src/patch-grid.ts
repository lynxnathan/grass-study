// Spatial identity is world-relative; modulo only selects a reusable storage slot.
// Consumers share this partition but choose their own resolution and working set.
export class PatchGrid {
  constructor(readonly size: number, readonly side: number) {
    if (!(size > 0) || !Number.isFinite(size) || !Number.isInteger(side) || side < 2 || side % 2 !== 0) throw new Error('A patch grid needs a positive size and an even slot count.');
  }
  coordinate(value: number) { return Math.floor(value / this.size); }
  key(x: number, z: number) { return `${this.coordinate(x)},${this.coordinate(z)}`; }
  wrap(value: number) { return ((value % this.side) + this.side) % this.side; }
  slot(x: number, z: number) { return this.wrap(z) * this.side + this.wrap(x); }
  origin(x: number, z: number): [number, number] { return [this.coordinate(x) - this.side / 2, this.coordinate(z) - this.side / 2]; }
  worldAt(slot: number, origin: readonly number[]): [number, number] {
    return [origin[0] + this.wrap(slot % this.side - origin[0]), origin[1] + this.wrap(Math.floor(slot / this.side) - origin[1])];
  }
}

export const FIELD_PATCHES = new PatchGrid(12, 14);
