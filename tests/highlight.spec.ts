import { expect, test } from '@playwright/test';

test('V fades wind highlights, preserves winds and contact, and survives a study round trip', async ({ page }) => {
  await page.goto('/?s=8');await expect(page.locator('#loading')).toBeHidden();
  const snapshot = () => page.evaluate(() => (window as any).__study.snapshot().grass);
  const initial = await snapshot();
  await page.keyboard.press('Escape');await page.locator('#world').focus();
  await page.keyboard.press('v');
  await expect.poll(async () => (await snapshot()).windHighlightWeight).toBe(0);
  expect((await snapshot()).winds).toEqual(initial.winds);
  expect((await snapshot()).time).toBeGreaterThan(initial.time);
  await page.keyboard.press('7');await expect.poll(async () => (await snapshot()).mode).toBe(7);
  await page.keyboard.press('8');await expect.poll(async () => (await snapshot()).mode).toBe(8);
  expect((await snapshot()).windHighlight).toBe(false);
  await page.getByRole('button', { name: 'Winds', exact: true }).click();
  const toggle = page.getByRole('button', { name: 'Wind highlights · V', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');await toggle.click();
  await expect.poll(async () => (await snapshot()).windHighlightWeight).toBe(1);
  await page.locator('.wind-entry > summary').first().click();
  const input = page.locator('#wind-list input').first();await input.focus();
  await page.keyboard.press('v');expect((await snapshot()).windHighlight).toBe(true);
  await page.locator('#world').focus();await page.keyboard.down('v');await page.keyboard.down('v');await page.keyboard.up('v');
  await expect.poll(async () => (await snapshot()).windHighlightWeight).toBe(0);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

test('highlight fades preserve silhouettes and shader simplification is invisible', async ({ page }, testInfo) => {
  const errors: string[] = [];page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?s=0');await expect(page.locator('#loading')).toBeHidden();
  const result = await page.evaluate(async () => {
    const { GrassField } = await import('/src/field.ts');
    const T = await import('/node_modules/three/build/three.module.js');
    const field = new GrassField(), f = field as any;field.setMode(8);
    // A steady wind makes differences in shading independent of simulation time.
    for (const [i, wind] of field.winds.winds.entries()) {
      (wind as any).bias = 1;(wind as any).gust = 0;field.winds.set(wind.id, { strength: i ? 0 : 1 });
    }
    const patch = f.patches.find((p: any) => p.count > 1800);
    const center = patch.roots.getCenter(new T.Vector3());
    const scene = new T.Scene();scene.add(patch.mesh, new T.HemisphereLight(0xffffff, 0x778855, 2));
    const camera = new T.PerspectiveCamera(48, 1, .1, 200);
    camera.position.copy(center).add(new T.Vector3(0, 4, 8));camera.lookAt(center);camera.updateMatrixWorld();
    const renderer = new T.WebGLRenderer({ antialias: false, alpha: true });renderer.setSize(256, 256);
    renderer.toneMapping = T.ACESFilmicToneMapping;
    const target = new T.WebGLRenderTarget(256, 256);renderer.setRenderTarget(target);
    patch.mesh.geometry = patch.geometries[0];patch.mesh.geometry.instanceCount = patch.count;
    f.uniforms.grassProjection.value = 4;
    const render = (material = f.edgeMaterial) => {
      patch.mesh.material = material;renderer.render(scene, camera);
      const pixels = new Uint8Array(256 * 256 * 4);renderer.readRenderTargetPixels(target, 0, 0, 256, 256, pixels);return pixels;
    };
    const diff = (a: Uint8Array, b: Uint8Array) => {
      let color = 0, silhouette = 0, maxChannelError = 0;
      for (let i = 0; i < a.length; i += 4) {
        for (let j = 0; j < 3; j++) { const delta = Math.abs(a[i + j] - b[i + j]);color += delta;maxChannelError = Math.max(maxChannelError, delta); }
        silhouette += Number(a[i + 3] !== b[i + 3]);
      }
      return { color: color / (256 * 256 * 3), silhouette, maxChannelError };
    };
    const blue = (pixels: Uint8Array) => {
      let n = 0;for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 2] > pixels[i] * 1.3 && pixels[i + 2] > pixels[i + 1] * 1.1) n++;return n;
    };
    const on = render();field.setWindHighlight(false);
    const weights = [];
    for (let i = 0; i < 3; i++) { field.update(.1, new T.Vector3(1000, 0, 1000), null);weights.push(field.snapshot().windHighlightWeight); }
    const off = render();
    for (let i = 0; i < 30; i++) { field.interaction.disturb(center, 4, 65 / 60);field.interaction.update(1 / 60); }
    const contact = render();
    const boundaries = [];
    field.setWindHighlight(true);for (let i = 0; i < 18; i++) field.update(1 / 60, new T.Vector3(1000, 0, 1000), null);
    for (const [distance, material] of [[42.01, f.plainMaterial], [85.01, f.naturalMaterial]] as const) {
      f.uniforms.grassProjection.value = patch.roots.distanceToPoint(camera.position) / distance;
      boundaries.push(diff(render(f.edgeMaterial), render(material)));
    }
    // The fade has many intermediate rendered states, not a batch-wide pop.
    const colors = [];
    for (const distance of [30, 42, 55, 70, 86]) {
      f.uniforms.grassProjection.value = patch.roots.distanceToPoint(camera.position) / distance;
      colors.push(diff(render(f.edgeMaterial), render(f.naturalMaterial)).color);
    }
    target.dispose();renderer.dispose();
    return { toggle: diff(on, off), onBlue: blue(on), offBlue: blue(off), contactBlue: blue(contact), weights, boundaries, colors };
  });
  await testInfo.attach('highlight-comparison', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.toggle.silhouette).toBe(0);expect(result.toggle.color).toBeGreaterThan(1);
  expect(result.onBlue).toBeGreaterThan(100);expect(result.offBlue).toBe(0);expect(result.contactBlue).toBeGreaterThan(10);
  expect(result.weights[0]).toBeCloseTo(2 / 3);expect(result.weights[1]).toBeCloseTo(1 / 3);expect(result.weights[2]).toBe(0);
  for (const boundary of result.boundaries) { expect(boundary.color).toBeLessThan(.0001);expect(boundary.maxChannelError).toBeLessThanOrEqual(1);expect(boundary.silhouette).toBe(0); }
  expect(result.colors[0]).toBeGreaterThan(result.colors[2]);expect(result.colors[2]).toBeGreaterThan(result.colors[3]);expect(result.colors[4]).toBeLessThan(.0001);
  expect(errors).toEqual([]);
});

test('B controls contact tint independently, including editable focus and navigation', async ({ page }) => {
  await page.goto('/?s=8');await expect(page.locator('#loading')).toBeHidden();
  const state = () => page.evaluate(() => (window as any).__study.snapshot().grass);
  await page.keyboard.press('Escape');await page.locator('#world').focus();
  await page.keyboard.press('b');await expect.poll(async () => (await state()).contactHighlightWeight).toBe(0);
  expect((await state()).windHighlight).toBe(true);
  await page.keyboard.press('v');await expect.poll(async () => (await state()).windHighlightWeight).toBe(0);
  const before = await state();await page.mouse.move(800, 620);await page.mouse.down();await page.waitForTimeout(250);await page.mouse.up();
  await expect.poll(async () => (await state()).contactEnergy).toBeGreaterThan(before.contactEnergy);
  await page.getByRole('button', { name: 'Winds', exact: true }).click();
  const contact = page.getByRole('button', { name: 'Contact tint · B', exact: true });
  await expect(contact).toHaveAttribute('aria-pressed', 'false');await contact.click();
  await expect.poll(async () => (await state()).contactHighlightWeight).toBe(1);
  await page.locator('.wind-entry > summary').first().click();
  await page.locator('#wind-list input').first().focus();await page.keyboard.press('b');expect((await state()).contactHighlight).toBe(true);
  await page.locator('#world').focus();await page.keyboard.down('b');await page.keyboard.down('b');await page.keyboard.up('b');
  await expect.poll(async () => (await state()).contactHighlightWeight).toBe(0);
  await page.keyboard.press('6');await expect.poll(async () => (await state()).mode).toBe(6);
  expect((await state()).contactHighlight).toBe(false);await page.keyboard.press('b');
  await expect.poll(async () => (await state()).contactHighlightWeight).toBe(1);
});

test('wind/contact tint combinations change color without changing the bend', async ({ page }, info) => {
  await page.goto('/?s=0');await expect(page.locator('#loading')).toBeHidden();
  const result = await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js');
    const { GrassField } = await import('/src/field.ts');
    const field = new GrassField(), f = field as any;field.setMode(8);
    for (const [i, wind] of field.winds.winds.entries()) {
      (wind as any).bias = 1;(wind as any).gust = 0;field.winds.set(wind.id, { strength: i ? 0 : 1 });
    }
    // Uniform contact keeps identical deformation while inspecting all four
    // visualization combinations at an identical time and camera position.
    const data = field.interaction.texture.image.data as Uint8Array;
    for (let i = 0; i < data.length; i += 4) { data[i] = 230;data[i + 1] = 128; }
    field.interaction.texture.needsUpdate = true;
    const patch = f.patches.find((p: any) => p.count > 1800);
    const center = patch.roots.getCenter(new T.Vector3());
    const scene = new T.Scene();scene.add(patch.mesh, new T.HemisphereLight(0xffffff, 0x778855, 2));
    const camera = new T.PerspectiveCamera(48, 1, .1, 200);camera.position.copy(center).add(new T.Vector3(0, 4, 8));camera.lookAt(center);camera.updateMatrixWorld();
    f.uniforms.grassProjection.value = 4;
    const renderer = new T.WebGLRenderer({ antialias: false, alpha: true });renderer.setSize(256, 256);renderer.toneMapping = T.ACESFilmicToneMapping;
    const target = new T.WebGLRenderTarget(256, 256);renderer.setRenderTarget(target);
    const results = [];
    for (const mode of [6, 7, 8]) {
      field.setMode(mode);let silhouette: Uint8Array | undefined;
      for (const [wind, contact] of [[1, 1], [0, 1], [1, 0], [0, 0]]) {
        f.uniforms.grassWindHighlight.value = wind;f.uniforms.grassContactHighlight.value = contact;
        renderer.render(scene, camera);const pixels = new Uint8Array(256 * 256 * 4);renderer.readRenderTargetPixels(target, 0, 0, 256, 256, pixels);
        let blue = 0, orange = 0, silhouetteChanges = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 2] > pixels[i] * 1.3 && pixels[i + 2] > pixels[i + 1] * 1.1) blue++;
          if (pixels[i] > pixels[i + 1] * 1.3 && pixels[i + 1] > pixels[i + 2] * 1.5) orange++;
          if (silhouette && pixels[i + 3] !== silhouette[i + 3]) silhouetteChanges++;
        }
        silhouette ??= pixels;results.push({ mode, wind, contact, blue, orange, silhouetteChanges });
      }
    }
    target.dispose();renderer.dispose();return results;
  });
  await info.attach('tint-combinations', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  for (const r of result) {
    expect(r.silhouetteChanges).toBe(0);
    if (r.mode === 6) { expect(r.orange).toBe(0);expect(r.blue > 100).toBe(Boolean(r.contact)); }
    else if (r.wind && r.contact) { expect(r.orange).toBeGreaterThan(100); }
    else { expect(r.orange).toBe(0);expect(r.blue > 100).toBe(Boolean(r.wind || r.contact)); }
  }
});
