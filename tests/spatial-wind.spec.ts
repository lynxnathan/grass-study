import { expect, test } from '@playwright/test';

test('the production GPU field has finite vortex centers, movable origins and additive N sources', async ({ page }) => {
  await page.goto('/?s=0');await expect(page.locator('#loading')).toBeHidden();
  const result = await page.evaluate(async () => {
    const { WIND } = await import('/src/field.ts');
    const { WindField } = await import('/src/wind.ts');
    const field = new WindField();field.winds.forEach((w: any) => field.remove(w.id));field.add('vortex');
    const id = field.winds[0].id;field.set(id, { x: 3, z: -2, radius: 14, strength: 1 });
    const gl = document.createElement('canvas').getContext('webgl2')!;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;gl.shaderSource(shader, source);gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader)!);
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, `#version 300 es
      precision highp float;
      #define texture2D texture
      ${WIND}
      layout(location=0) in vec2 root;out vec2 result;
      void main(){result=grassWind(root);gl_Position=vec4(0,0,0,1);}`);
    const fragment = compile(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;out vec4 color;void main(){color=vec4(1); }');
    const program = gl.createProgram()!;gl.attachShader(program, vertex);gl.attachShader(program, fragment);
    gl.transformFeedbackVaryings(program, ['result'], gl.INTERLEAVED_ATTRIBS);gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program)!);
    gl.useProgram(program);gl.uniform1f(gl.getUniformLocation(program, 'grassMode'), 8);
    gl.uniform1f(gl.getUniformLocation(program, 'grassTime'), 1.25);
    gl.uniform1i(gl.getUniformLocation(program, 'grassWinds'), 0);
    const texture = gl.createTexture();gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const input = gl.createBuffer(), output = gl.createBuffer();
    const vao = gl.createVertexArray();gl.bindVertexArray(vao);
    const feedback = gl.createTransformFeedback();gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
    const sample = (points: number[], data?: Float32Array, count?: number) => {
      const image = field.uniforms.grassWinds.value.image;
      const n = count ?? field.winds.length;
      const values = data ?? (image.data as Float32Array).slice(0, n * 12);
      gl.bindTexture(gl.TEXTURE_2D, texture);gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 3, n, 0, gl.RGBA, gl.FLOAT, values);
      gl.uniform1i(gl.getUniformLocation(program, 'grassWindCount'), n);
      gl.bindBuffer(gl.ARRAY_BUFFER, input);gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, output);gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, points.length * 4, gl.STREAM_READ);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, output);
      gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS, 0, points.length / 2);gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);
      const out = new Float32Array(points.length);gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, out);return Array.from(out);
    };
    const points = [3,-2, 7,-2, -1,-2, 3,2, 17,-2, 20,-2];
    const initial = sample(points);field.reverse(id);const reversed = sample(points);
    field.reverse(id);field.set(id, { x: 13, z: 8 });
    const translated = sample(points.map(p => p + 10));
    for (let i = 0; i < 4; i++) { field.add(i % 2 ? 'radial' : 'vortex');field.set(field.winds.at(-1)!.id, { x: i * 3, z: i - 3, radius: 9 + i }); }
    const combined = sample(points);
    const data = field.uniforms.grassWinds.value.image.data as Float32Array;
    const sum = new Array(points.length).fill(0);
    for (let i = 0; i < field.winds.length; i++) sample(points, data.slice(i * 12, (i + 1) * 12), 1).forEach((v, j) => sum[j] += v);
    const error = gl.getError();
    gl.deleteTransformFeedback(feedback);gl.deleteVertexArray(vao);gl.deleteBuffer(input);gl.deleteBuffer(output);gl.deleteTexture(texture);gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);
    return { initial, reversed, translated, combined, sum, count: field.winds.length, error };
  });
  expect(result.error).toBe(0);expect(result.count).toBe(5);
  expect(result.initial.every(Number.isFinite)).toBe(true);
  expect(result.initial.slice(0, 2)).toEqual([0, 0]);
  expect(result.initial[2]).toBeCloseTo(0, 6);expect(result.initial[3]).toBeGreaterThan(0);
  expect(result.initial[5]).toBeLessThan(0);expect(result.initial[6]).toBeLessThan(0);
  result.initial.slice(8).forEach(v => expect(v).toBeCloseTo(0, 6));
  result.initial.forEach((v, i) => { expect(result.reversed[i]).toBeCloseTo(-v, 5);expect(result.translated[i]).toBeCloseTo(v, 5); });
  result.combined.forEach((v, i) => expect(v).toBeCloseTo(result.sum[i], 5));
});

test('place, brush, cancel, remove and reset spatial winds through the interface', async ({ page }) => {
  const errors: string[] = [];page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?s=8');await expect(page.locator('#loading')).toBeHidden();
  const snapshot = () => page.evaluate(() => (window as any).__study.snapshot());
  await page.getByRole('button', { name: 'Winds', exact: true }).click();
  await page.getByRole('button', { name: 'Add vortex', exact: true }).click();
  const row = page.getByRole('group', { name: 'Wind 3', exact: true });
  await expect(row.getByRole('combobox')).toHaveValue('vortex');
  const first = (await snapshot()).grass.winds[2];expect(first.kind).toBe('vortex');
  await row.getByRole('button', { name: 'Place on ground' }).click();
  await expect(page.locator('#wind-placement')).toBeVisible();
  const before = (await snapshot()).grass.contactEnergy;
  await page.mouse.move(710, 580);await page.mouse.down();await page.waitForTimeout(300);
  await expect(page.locator('#wind-placement')).toBeHidden();
  const placed = (await snapshot()).grass.winds[2];expect(placed.origin).not.toEqual(first.origin);
  expect((await snapshot()).grass.contactEnergy).toBeLessThan(before + 3);
  await page.mouse.up();
  // After placement ends, the next press brushes normally.
  await page.mouse.down();await expect.poll(async () => (await snapshot()).grass.contactEnergy).toBeGreaterThan(before + 5);await page.mouse.up();
  await row.getByRole('button', { name: 'Reverse', exact: true }).click();
  expect((await snapshot()).grass.winds[2].sense).toBe(-placed.sense);
  await row.getByRole('button', { name: 'Place on ground' }).click();await page.keyboard.press('Escape');
  await expect(page.locator('#wind-placement')).toBeHidden();expect((await snapshot()).grass.winds[2].origin).toEqual(placed.origin);
  await row.getByRole('button', { name: 'Place on ground' }).click();
  await page.locator('#world').dispatchEvent('pointercancel', { pointerType: 'mouse', pointerId: 1 });
  await expect(page.locator('#wind-placement')).toBeHidden();
  await row.getByRole('button', { name: 'Place on ground' }).click();await row.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('#wind-placement')).toBeHidden();expect((await snapshot()).grass.winds).toHaveLength(2);
  await page.getByRole('button', { name: 'Add vortex', exact: true }).click();
  await row.getByLabel('Wind 3 origin X', { exact: true }).fill('12');await page.keyboard.press('Tab');
  expect((await snapshot()).grass.winds[2].origin[0]).toBe(12);
  await row.getByRole('button', { name: 'Place on ground' }).click();
  await page.locator('#world').focus();await page.keyboard.press('7');
  await expect(page.locator('#app')).toHaveAttribute('data-study', 'ghost');await expect(page.locator('#wind-placement')).toBeHidden();
  await page.keyboard.press('8');await expect(page.locator('#app')).toHaveAttribute('data-transition', 'idle');
  await page.getByRole('button', { name: 'Winds', exact: true }).click();await page.getByRole('button', { name: 'Reset winds', exact: true }).click();
  expect((await snapshot()).grass.winds.map((w: any) => w.kind)).toEqual(['directional', 'directional']);
  expect(errors).toEqual([]);
});


test('08 adds winds with varied starting parameters while preserving existing sources and navigation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?s=8');await expect(page.locator('#loading')).toBeHidden();
  const snapshot = () => page.evaluate(() => (window as any).__study.snapshot());
  await page.getByRole('button', { name: 'Winds', exact: true }).click();
  const before = await snapshot();
  await page.getByRole('button', { name: 'Add wind', exact: true }).click();
  const third = (await snapshot()).grass.winds[2];
  await page.getByRole('button', { name: 'Add wind', exact: true }).click();
  await page.getByRole('button', { name: 'Add vortex', exact: true }).click();
  const after = await snapshot();
  expect(after.position).toEqual(before.position);expect(after.yaw).toBe(before.yaw);
  expect(after.grass.winds.slice(0, 2)).toEqual(before.grass.winds);
  expect(after.grass.winds[2]).toEqual(third);
  expect(after.grass.winds[3].heading).not.toBe(third.heading);
  expect(after.grass.winds[3].strength).not.toBe(third.strength);
  expect(after.grass.winds[3].origin).not.toEqual(third.origin);
  expect(after.grass.winds.map((w: any) => w.kind)).toEqual(['directional', 'directional', 'directional', 'directional', 'vortex']);
  after.grass.winds.slice(2).forEach((wind: any) => {
    expect(wind.strength).toBeGreaterThanOrEqual(.35);expect(wind.strength).toBeLessThanOrEqual(1.3);
    expect(Math.abs(wind.origin[0])).toBeLessThanOrEqual(82);
    expect(Math.abs(wind.origin[1])).toBeLessThanOrEqual(82);
  });
  await page.locator('#world').focus();await page.keyboard.press('7');await page.keyboard.press('8');
  await page.getByRole('button', { name: 'Winds', exact: true }).click();
  expect((await snapshot()).grass.winds).toEqual(after.grass.winds);
  await page.getByRole('button', { name: 'Reset winds', exact: true }).click();
  expect((await snapshot()).grass.winds.map((w: any) => w.vector)).toEqual(before.grass.winds.map((w: any) => w.vector));
});
