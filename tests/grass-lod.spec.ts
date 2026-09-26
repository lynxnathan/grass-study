import { expect, test } from '@playwright/test';
import { grassDensity, grassDrawCount, grassGeometryLevel, GRASS_LOD, smoothStep, grassProjectionScale } from '../src/grass-lod';

test('conservative batch trimming keeps every blade with nonzero width through a round trip', () => {
  const count = 127;
  const outward: number[] = [];
  let largestDiscardedWidth = 0;
  for (let nearest = 0; nearest <= 120; nearest += .25) {
    const submitted = grassDrawCount(count, nearest);outward.push(submitted);
    for (let i = submitted; i < count; i++) {
      const rank = (i + .5) / count;
      // Roots inside a batch can only be farther away than its nearest bound.
      for (const offset of [0, .01, 4, 12, 18]) {
        largestDiscardedWidth = Math.max(largestDiscardedWidth, smoothStep(rank - GRASS_LOD.feather, rank + GRASS_LOD.feather, grassDensity(nearest + offset)));
      }
    }
  }
  expect(largestDiscardedWidth).toBe(0);
  expect(outward.every((n, i) => i === 0 || n <= outward[i - 1])).toBe(true);
  for (const [distance, level] of [[18, 1], [56, 2], [96, 3]]) {
    expect(grassGeometryLevel(distance - .001)).toBe(level - 1);expect(grassGeometryLevel(distance)).toBe(level);
  }
  const projection = 1 / Math.tan(24 * Math.PI / 180);
  expect(grassProjectionScale(projection, 900)).toBeCloseTo(1);
  expect(grassProjectionScale(projection, 1800)).toBeCloseTo(2);
  // Equal apparent size retains equal geometry and density across resolutions.
  expect(grassGeometryLevel(80 / grassProjectionScale(projection, 1800))).toBe(grassGeometryLevel(40));
  expect(grassDrawCount(count, 80 / grassProjectionScale(projection, 1800))).toBe(grassDrawCount(count, 40));
  expect(Array.from({ length: outward.length }, (_, i) => grassDrawCount(count, (outward.length - 1 - i) * .25))).toEqual([...outward].reverse());
});

test('rendered LOD swaps preserve silhouettes and trimming removes only invisible blades', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?s=0');await expect(page.locator('#loading')).toBeHidden();
  const result = await page.evaluate(async () => {
    // An isolated render fixture shares the production shaders and instance data.
    // Its camera stays fixed while comparing alternate topology at a completed morph.
    const { GrassField } = await import('/src/field.ts');
    const { grassProjectionScale } = await import('/src/grass-lod.ts');
    const T = await import('/node_modules/three/build/three.module.js');
    const field = new GrassField();field.setMode(8);
    const patch = (field as any).patches.find((p: any) => p.count > 1800);
    const scene = new T.Scene();scene.add(patch.mesh);scene.add(new T.HemisphereLight(0xffffff, 0x778855, 2));
    const camera = new T.PerspectiveCamera(22, 1, .1, 200);
    const center = patch.roots.getCenter(new T.Vector3());
    const renderer = new T.WebGLRenderer({ antialias: false });renderer.setSize(256, 256);
    const target = new T.WebGLRenderTarget(256, 256);renderer.setRenderTarget(target);
    const render = (level: number, count: number) => {
      patch.mesh.geometry = patch.geometries[level];patch.mesh.geometry.instanceCount = count;
      renderer.render(scene, camera);
      const pixels = new Uint8Array(256 * 256 * 4);renderer.readRenderTargetPixels(target, 0, 0, 256, 256, pixels);
      return pixels;
    };
    const difference = (a: Uint8Array, b: Uint8Array) => {
      let total = 0, occupied = 0, changed = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i] + a[i + 1] + a[i + 2] > 0) occupied++;
        let delta = 0;for (let c = 0; c < 3; c++) delta += Math.abs(a[i + c] - b[i + c]);
        total += delta;if (delta > 3) changed++;
      }
      return { meanChannelError: total / (256 * 256 * 3), occupied, changed };
    };
    const swaps = [];
    for (const [threshold, high, low] of [[18, 0, 1], [56, 1, 2], [96, 2, 3]]) {
      const distance = threshold * grassProjectionScale(camera.projectionMatrix.elements[5], 256) + .01;
      camera.position.set(center.x, center.y + 4, patch.roots.max.z + distance);
      camera.lookAt(center);camera.updateMatrixWorld();field.updateDetail(camera, 256);field.prepare(renderer, camera);
      const count = patch.mesh.geometry.instanceCount;
      const detailed = render(high, count), reduced = render(low, count);
      const untrimmed = render(low, patch.count);
      swaps.push({ distance, topology: difference(detailed, reduced), trimming: difference(untrimmed, reduced) });
    }
    const attributes = patch.geometries[0].attributes;
    const buffersShared = patch.geometries.every((g: any) => g.attributes.bladeRootHeight === attributes.bladeRootHeight
      && g.attributes.bladeShape === attributes.bladeShape && g.attributes.color === attributes.color);
    const instanceBytes = attributes.bladeRootHeight.array.byteLength + attributes.bladeShape.array.byteLength + attributes.color.array.byteLength;
    renderer.dispose();target.dispose();
    return { swaps, buffersShared, instanceBytes, count: patch.count };
  });
  await testInfo.attach('render-comparison', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  for (const swap of result.swaps) {
    expect(swap.topology.occupied).toBeGreaterThan(100);
    expect(swap.topology.meanChannelError).toBeLessThan(.15);
    expect(swap.trimming.meanChannelError).toBe(0);
  }
  expect(result.buffersShared).toBe(true);expect(result.instanceBytes).toBe(result.count * 44);
  expect(errors).toEqual([]);
});
