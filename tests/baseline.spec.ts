import { expect, test } from '@playwright/test';

test('opens on bare ground; billboards and crossed cards render separately; returning restores the baseline', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const snapshot = () => page.evaluate(() => (window as any).__study.snapshot());
  const triangles = () => page.locator('[data-metric="triangles"]').innerText().then(text => Number(text.replaceAll(',', '')));
  const original = await snapshot();
  await expect(page.locator('#study-title')).toHaveText('The ground beneath');
  await expect(page.locator('#study-progress')).toHaveText('1 / 14');
  expect(original.grass.visible).toBe(false);expect(original.grass.layers).toEqual([]);
  // Discard the loading-era HUD sample before recording the complete scene.
  await page.keyboard.press('PageDown');await page.keyboard.press('PageUp');
  await expect(page.locator('#app')).toHaveAttribute('data-study', 'ground');
  await expect.poll(triangles).toBeGreaterThan(0);const bareTriangles = await triangles();
  const advance = async (key: string, id: string) => {
    await page.keyboard.press(key);
    await expect(page.locator('#app')).toHaveAttribute('data-study', id);
    await expect(page.locator('#app')).toHaveAttribute('data-transition', 'idle');
  };
  await advance('PageDown', 'billboards');
  expect((await snapshot()).grass.layers).toEqual(['static-grass-billboards']);
  await expect.poll(triangles).toBe(bareTriangles + original.grass.count * 2);
  await advance('PageDown', 'crossed-cards');
  expect((await snapshot()).grass.layers).toEqual(['crossed-cards']);
  await expect.poll(triangles).toBe(bareTriangles + original.grass.count * 4);
  // Orbit the active technique through the real camera controls.
  await page.mouse.move(600, 370);await page.mouse.down({ button: 'right' });
  await page.mouse.move(840, 390, { steps: 6 });await page.mouse.up({ button: 'right' });
  expect((await snapshot()).yaw).not.toBe(original.yaw);
  expect((await snapshot()).grass.layers).toEqual(['crossed-cards']);
  // Restore the view too: orbiting changes landmark frustum culling and its cost.
  await page.getByRole('button', { name: 'Start over from the beginning', exact: true }).click();
  await advance('PageUp', 'billboards');
  await expect.poll(triangles).toBe(bareTriangles + original.grass.count * 2);
  await advance('PageUp', 'ground');
  expect((await snapshot()).grass.layers).toEqual([]);
  await expect.poll(triangles).toBe(bareTriangles);
  expect((await snapshot()).position).toEqual(original.position);
  expect(errors).toEqual([]);
});
