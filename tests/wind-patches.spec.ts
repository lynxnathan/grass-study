import { expect, test } from '@playwright/test';
import { FIELD_PATCHES } from '../src/patch-grid';

test('modulo slots preserve world identities across negative coordinates and rolling windows', () => {
  const grid = FIELD_PATCHES;
  expect(grid.key(-.01, -.01)).toBe('-1,-1');expect(grid.key(0, 0)).toBe('0,0');
  for (const center of [[0, 0], [-13, 25], [84, -84], [-600, 1000]]) {
    const origin = grid.origin(...center as [number, number]);const ids = new Set<string>();
    for (let slot = 0; slot < grid.side ** 2; slot++) {
      const [x, z] = grid.worldAt(slot, origin);ids.add(`${x},${z}`);
      expect(grid.slot(x, z)).toBe(slot);
      expect(x).toBeGreaterThanOrEqual(origin[0]);expect(x).toBeLessThan(origin[0] + grid.side);
      expect(z).toBeGreaterThanOrEqual(origin[1]);expect(z).toBeLessThan(origin[1] + grid.side);
      expect(grid.slot(x + grid.side, z)).toBe(slot);
    }
    expect(ids.size).toBe(grid.side ** 2);
  }
});

test('GPU wind patches preserve phase through handoff, reversals, seams and live source edits', async ({ page }, info) => {
  const errors: string[] = [];page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?s=0');await expect(page.locator('#loading')).toBeHidden();
  const result = await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js');
    const { WindField } = await import('/src/wind.ts');
    const { WIND } = await import('/src/wind-shader.ts');
    const { WindPatchAtlas, WIND_PATCH_LOOKUP } = await import('/src/wind-patches.ts');
    const winds = new WindField(), cache = new WindPatchAtlas(winds);
    const renderer = new T.WebGLRenderer();renderer.setSize(32, 32);
    const scene = new T.Scene(), camera = new T.Camera();
    const points: number[] = [];
    // Include tile seams, negative modulo boundaries, guard regions and the
    // smallest editable vortex radius. The final points are outside both windows.
    for (let x = -18; x <= 18; x += .31) points.push(x, 0.23, 80, 0);
    for (const x of [-84.01, -84, -83.99, -.001, 0, .001, 11.999, 12, 12.001, 83.999, 84, 84.001, 190]) points.push(x, -.001, 80, 0);
    for (let x = -2; x <= 2; x += .1) for (const z of [-.7, .1, .7]) points.push(x, z, 80, 0);
    const count = points.length / 4;
    const data = new T.DataTexture(new Float32Array(points), count, 1, T.RGBAFormat, T.FloatType);data.needsUpdate = true;
    const material = new T.ShaderMaterial({ uniforms: { ...winds.uniforms, ...cache.uniforms,
      grassTime: { value: 11 }, grassMode: { value: 8 }, points: { value: data }, reference: { value: false } },
      vertexShader: 'void main(){gl_Position=vec4(position.xy,0,1);}',
      fragmentShader: WIND + WIND_PATCH_LOOKUP + `
        uniform sampler2D points;uniform bool reference;
        void main(){vec3 p=texelFetch(points,ivec2(int(gl_FragCoord.x),0),0).xyz;
          gl_FragColor=vec4(reference?grassWind(p.xy):grassPatchWind(p.xy,p.z),0,1);}`,
      depthTest: false, depthWrite: false, toneMapped: false, blending: T.NoBlending });
    const mesh = new T.Mesh(new T.PlaneGeometry(2, 2), material);mesh.frustumCulled = false;scene.add(mesh);
    const target = new T.WebGLRenderTarget(count, 1, { type: T.FloatType, depthBuffer: false });
    const render = (reference = false) => {
      material.uniforms.reference.value = reference;renderer.setRenderTarget(target);renderer.render(scene, camera);
      const pixels = new Float32Array(count * 4);renderer.readRenderTargetPixels(target, 0, 0, count, 1, pixels);renderer.setRenderTarget(null);return pixels;
    };
    const difference = (a: Float32Array, b: Float32Array) => {
      let max = 0, squared = 0;for (let i = 0; i < a.length; i += 4) {
        const d = Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1]);max = Math.max(max, d);squared += d * d;
      }return { max, rms: Math.sqrt(squared / count), finite: [...a, ...b].every(Number.isFinite) };
    };
    cache.render(renderer, 0, 0, 11);const initial = render(), direct = render(true);
    const initialError = difference(initial, direct);
    cache.render(renderer, 12.01, 0, 11);const start = render();const beginning = cache.snapshot();
    cache.advance(.15);cache.render(renderer, -24, 0, 11);const half = render();const halfway = cache.snapshot();
    cache.advance(.15);cache.render(renderer, -24, 0, 11);const reverse = cache.snapshot();
    cache.advance(.3);cache.render(renderer, -24, 0, 11);const completed = cache.snapshot();
    // A global clock is shared by both windows; edits are rendered into both.
    winds.add('vortex');const vortex = winds.winds.at(-1)!;winds.set(vortex.id, { x: 0, z: 0, radius: 2, strength: 2 });
    winds.add('radial');winds.set(winds.winds.at(-1)!.id, { x: 12, z: 0, radius: 14, strength: 1.2 });
    material.uniforms.grassTime.value = 17;cache.render(renderer, -12, 0, 17);
    const editedError = difference(render(), render(true));const edited = cache.snapshot();
    winds.reverse(vortex.id);cache.advance(.15);cache.render(renderer, -12, 0, 17);
    const reversedError = difference(render(), render(true));
    cache.setEnabled(false);cache.advance(.3);cache.render(renderer, -12, 0, 17);
    const offError = difference(render(), render(true));const disabled = cache.snapshot();
    cache.setEnabled(true);cache.advance(.15);cache.render(renderer, 36, -12, 17);const resumed = cache.snapshot();
    const resumedError = difference(render(), render(true));
    // Hardware fallback retains direct evaluation even when blending is requested.
    (cache as any).supported = false;cache.render(renderer, 36, -12, 17);
    const fallbackError = difference(render(), render(true));
    renderer.setRenderTarget(target);const retained = renderer.getRenderTarget();
    (cache as any).supported = true;cache.render(renderer, 36, -12, 17);const restoresTarget = renderer.getRenderTarget() === retained;
    target.dispose();data.dispose();renderer.dispose();
    return { initialError, startError: difference(initial, start), halfError: difference(initial, half), beginning, halfway,
      reverse, completed, editedError, reversedError, edited, offError, disabled, resumed, resumedError, fallbackError, restoresTarget };
  });
  await info.attach('patch-wind-comparison', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.initialError.finite).toBe(true);expect(result.initialError.max).toBeLessThan(.01);
  expect(result.startError.max).toBe(0);expect(result.halfError.max).toBeLessThan(.003);
  expect(result.beginning.handoff).toBe(0);expect(result.beginning.passes).toBe(2);
  expect(result.halfway.handoff).toBeCloseTo(.5);expect(result.halfway.to).toEqual(result.beginning.to);
  expect(result.reverse.from).toEqual(result.beginning.to);expect(result.reverse.to).toEqual([-9, -7]);
  expect(result.completed.handoff).toBe(1);expect(result.completed.passes).toBe(1);
  expect(result.edited.time).toBe(17);expect(result.edited.passes).toBe(2);
  expect(result.editedError.max).toBeLessThan(.02);expect(result.reversedError.max).toBeLessThan(.02);
  expect(result.offError.max).toBe(0);expect(result.disabled.passes).toBe(0);
  expect(result.resumed.weight).toBeCloseTo(.5);expect(result.resumedError.finite).toBe(true);
  expect(result.fallbackError.max).toBe(0);expect(result.restoresTarget).toBe(true);
  expect(errors).toEqual([]);
});

test('wind detail can fade out, resume, survive navigation and keep contact moving', async ({ page }) => {
  await page.goto('/?s=8');await expect(page.locator('#loading')).toBeHidden();
  const state = () => page.evaluate(() => (window as any).__study.snapshot().grass);
  await expect.poll(async () => (await state()).windPatches.ready).toBe(true);
  const initial = await state();await page.getByRole('button', { name: 'Winds', exact: true }).click();
  const blend = page.getByRole('button', { name: 'Blend wind detail', exact: true });await blend.click();
  await expect.poll(async () => (await state()).windPatches.weight).toBe(0);
  expect((await state()).winds).toEqual(initial.winds);
  await page.locator('#world').focus();await page.keyboard.press('7');
  await expect.poll(async () => (await state()).mode).toBe(7);
  await page.keyboard.press('8');await expect.poll(async () => (await state()).mode).toBe(8);
  await page.getByRole('button', { name: 'Winds', exact: true }).click();await expect(blend).toHaveAttribute('aria-pressed', 'false');
  await blend.click();await expect.poll(async () => (await state()).windPatches.weight).toBe(1);
  await page.getByRole('button', { name: 'Close wind controls' }).click();
  const before = await state();await page.mouse.move(800, 620);await page.mouse.down();await page.waitForTimeout(250);await page.mouse.up();
  await expect.poll(async () => (await state()).contactEnergy).toBeGreaterThan(before.contactEnergy);
  expect((await state()).time).toBeGreaterThan(before.time);
});
