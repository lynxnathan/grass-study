import { expect, test } from '@playwright/test';
import * as THREE from 'three';
import { createTerrain, TERRAIN_SEGMENTS } from '../src/terrain';

let terrain: THREE.Mesh;
test.beforeAll(() => { terrain = createTerrain();terrain.updateMatrixWorld(true); });
test.afterAll(() => {
  terrain.geometry.dispose();
  (terrain.material as THREE.Material).dispose();
});

function query(ray: THREE.Raycaster, accelerated: boolean) {
  const hits: THREE.Intersection[] = [];
  (accelerated ? terrain.raycast : THREE.Mesh.prototype.raycast).call(terrain, ray, hits);
  return hits.sort((a, b) => a.distance - b.distance);
}

test('accelerated picking matches the original terrain at slopes, seams, misses and repeated crossings', () => {
  const ray = new THREE.Raycaster();ray.firstHitOnly = true;
  let hits = 0, misses = 0, repeatedCrossings = 0;
  const compare = () => {
    const expected = query(ray, false), actual = query(ray, true);
    expect(actual.length).toBe(expected.length ? 1 : 0);
    if (expected.length) {
      hits++;
      expect(actual[0].point.distanceTo(expected[0].point)).toBeLessThan(1e-6);
      expect(Math.abs(actual[0].distance - expected[0].distance)).toBeLessThan(1e-6);
    } else misses++;
    if (expected.some(hit => hit.distance > expected[0].distance + .01)) repeatedCrossings++;
    return expected;
  };
  // Include grid vertices, diagonal seams, boundaries and points outside the mesh.
  for (const x of [-101, -100, -43.5, -18, 0, .5, 28.25, 99.5, 100, 101]) {
    for (const z of [-101, -100, -38, -22.5, 0, .5, 22.75, 99.5, 100, 101]) {
      ray.set(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0));compare();
    }
  }
  for (const height of [0, 1, 2, 4, 6]) {
    for (const z of [-40, -20, 0, 20, 40]) {
      ray.set(new THREE.Vector3(-110, height, z), new THREE.Vector3(1, -.002, .03).normalize());
      const all = compare();
      if (all.length) {
        ray.far = all[0].distance - .01;compare();ray.far = Infinity;
        ray.near = all[0].distance + .01;compare();ray.near = 0;
      }
    }
  }
  ray.set(new THREE.Vector3(0, 40, 0), new THREE.Vector3(0, 1, 0));compare();
  expect(hits).toBeGreaterThan(40);expect(misses).toBeGreaterThan(20);
  expect(repeatedCrossings).toBeGreaterThan(0);
});

test('the spatial index preserves the original terrain triangle order', () => {
  const indices = terrain.geometry.index!.array;
  const expected: number[] = [];
  for (let z = 0; z < TERRAIN_SEGMENTS; z++) {
    for (let x = 0; x < TERRAIN_SEGMENTS; x++) {
      const a = z * (TERRAIN_SEGMENTS + 1) + x, b = a + 1;
      const c = a + TERRAIN_SEGMENTS + 1, d = c + 1;
      expected.push(a, c, b, b, c, d);
    }
  }
  expect(Array.from(indices)).toEqual(expected);
});

test('a brush query tests a small fraction of the terrain instead of scanning every triangle', async ({}, info) => {
  const ray = new THREE.Raycaster(new THREE.Vector3(12.3, 30, 7.8), new THREE.Vector3(0, -1, 0));
  ray.firstHitOnly = true;
  const intersect = THREE.Ray.prototype.intersectTriangle;
  let triangles = 0;
  THREE.Ray.prototype.intersectTriangle = function (...args) {
    triangles++;return intersect.apply(this, args);
  };
  let linear = 0, accelerated = 0;
  try {
    expect(query(ray, false)).toHaveLength(1);linear = triangles;
    triangles = 0;expect(query(ray, true)).toHaveLength(1);accelerated = triangles;
  } finally { THREE.Ray.prototype.intersectTriangle = intersect; }
  expect(linear).toBe(80000);
  expect(accelerated).toBeGreaterThan(0);
  expect(accelerated).toBeLessThan(linear / 100);
  await info.attach('triangle-work.json', { body: JSON.stringify({ linear, accelerated }), contentType: 'application/json' });
});
