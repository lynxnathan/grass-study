import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

export const TERRAIN_SIZE = 200;
export const TERRAIN_SEGMENTS = 200;
export const WALKABLE_RADIUS = 73;
const CELL = TERRAIN_SIZE / TERRAIN_SEGMENTS;

// Keep acceleration local to the static terrain; other meshes retain Three's raycast.
class TerrainMesh extends THREE.Mesh {
  override raycast(raycaster: THREE.Raycaster, intersections: THREE.Intersection[]) {
    acceleratedRaycast.call(this, raycaster, intersections);
  }
}

function elevation(x: number, z: number): number {
  const hill = (cx: number, cz: number, width: number, height: number) =>
    height * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (width * width));
  return Math.sin(x * 0.068) * Math.cos(z * 0.054) * 2.2
    + Math.sin(z * 0.13 + x * 0.036) * 0.8
    + hill(-18, -22, 16, 8) + hill(28, -38, 23, 11)
    + hill(36, 22, 17, 6) + hill(-43, 30, 20, 7)
    - hill(3, -17, 13, 2.2);
}

export function heightAt(x: number, z: number): number {
  const gx = (x + TERRAIN_SIZE / 2) / CELL;
  const gz = (z + TERRAIN_SIZE / 2) / CELL;
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = gx - ix, fz = gz - iz;
  const ax = ix * CELL - TERRAIN_SIZE / 2, az = iz * CELL - TERRAIN_SIZE / 2;
  const a = elevation(ax, az), b = elevation(ax + CELL, az);
  const c = elevation(ax, az + CELL), d = elevation(ax + CELL, az + CELL);
  return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz
    : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

export function normalAt(x: number, z: number): THREE.Vector3 {
  const step = 0.15;
  return new THREE.Vector3(heightAt(x - step, z) - heightAt(x + step, z), 2 * step,
    heightAt(x, z - step) - heightAt(x, z + step)).normalize();
}

export function createTerrain(): THREE.Mesh {
  const vertices: number[] = [], colors: number[] = [], indices: number[] = [];
  const low = new THREE.Color('#859767'), high = new THREE.Color('#b6bb80');
  const soil = new THREE.Color('#c3b993'), tint = new THREE.Color();
  for (let iz = 0; iz <= TERRAIN_SEGMENTS; iz++) {
    for (let ix = 0; ix <= TERRAIN_SEGMENTS; ix++) {
      const x = ix * CELL - TERRAIN_SIZE / 2, z = iz * CELL - TERRAIN_SIZE / 2;
      const y = elevation(x, z);
      vertices.push(x, y, z);
      const variation = Math.sin(x * .51 + z * .33) * Math.sin(z * .44) * .045;
      tint.copy(low).lerp(high, THREE.MathUtils.clamp((y + 2) / 14 + variation, 0, 1));
      const pathX = Math.sin(z * .07) * 5;
      const path = Math.exp(-(((x - pathX) / 1.45) ** 4));
      tint.lerp(soil, path * .73);
      colors.push(tint.r, tint.g, tint.b);
      if (ix < TERRAIN_SEGMENTS && iz < TERRAIN_SEGMENTS) {
        const a = iz * (TERRAIN_SEGMENTS + 1) + ix, b = a + 1;
        const c = a + TERRAIN_SEGMENTS + 1, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Indirect indexing preserves the triangle order used by the rendered surface.
  geometry.boundsTree = new MeshBVH(geometry, { indirect: true });
  const mesh = new TerrainMesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

export function createLandmarks(): THREE.Group {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: '#929888', roughness: 1, flatShading: true });
  const rockGeometry = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < 44; i++) {
    const angle = i * 2.399963, radius = 13 + (i * 19.7 % 53);
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    if (Math.abs(x - Math.sin(z * .07) * 5) < 3) continue;
    const rock = new THREE.Mesh(rockGeometry, stone);
    const scale = .25 + (i * .173 % .8);
    rock.scale.set(scale * 1.35, scale * .7, scale);
    rock.position.set(x, heightAt(x, z) - .1, z);
    rock.rotation.set(i * .9, i * 1.7, i * .3);
    rock.castShadow = true; rock.receiveShadow = true; group.add(rock);
  }
  const wood = new THREE.MeshStandardMaterial({ color: '#79684c', roughness: .95 });
  const marker = new THREE.MeshStandardMaterial({ color: '#e8dfc1', roughness: .8 });
  for (const [x, z] of [[-6, 2], [-14, -12], [13, -26]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.065, .085, 1.25, 7), wood);
    post.position.set(x, heightAt(x, z) + .6, z);post.castShadow = true;group.add(post);
    const top = new THREE.Mesh(new THREE.BoxGeometry(.33, .2, .09), marker);
    top.position.copy(post.position).y += .39;top.rotation.y = -.4;top.castShadow = true;group.add(top);
  }
  return group;
}
