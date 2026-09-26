import { expect, test } from '@playwright/test';

const ids = ['ground', 'billboards', 'crossed-cards', 'sway', 'gusts', 'blades', 'contact', 'ghost', 'wind-vectors', 'rain', 'woven-ground', 'short-tufts', 'shell-turf', 'implicit-turf'];

test('the full presentation changes rendered techniques while preserving the character and camera', async ({ page }) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  const snapshot = () => page.evaluate(() => (window as any).__study.snapshot());
  const initial = await snapshot();expect(initial.grass.count).toBeGreaterThan(20000);
  const calls = () => page.locator('[data-metric="calls"]').innerText().then(Number);
  await expect.poll(calls).toBeGreaterThan(0);const withoutGrass = await calls();
  const previous = page.getByRole('button', { name: 'Previous study', exact: true });
  const next = page.getByRole('button', { name: 'Next study', exact: true });
  await expect(page.locator('#app')).toHaveAttribute('data-transition', 'idle');
  await expect(previous).toHaveAttribute('aria-disabled', 'true');
  expect(initial.grass.layers).toEqual([]);
  const screenshots: Buffer[] = [];
  for (let i = 0; i < ids.length; i++) {
    if (i) await next.click();
    await expect(page.locator('#app')).toHaveAttribute('data-study', ids[i]);
    await expect(page.locator('#app')).toHaveAttribute('data-transition', 'idle');
    await expect(page.locator('#study-progress')).toHaveText(`${i + 1} / ${ids.length}`);
    await expect(page.locator('#world')).toHaveCSS('opacity', '1');
    const state = await snapshot();
    expect(state.position).toEqual(initial.position);
    expect(state.yaw).toBe(initial.yaw);expect(state.distance).toBe(initial.distance);
    expect(state.animationTime).toBeGreaterThan(initial.animationTime);
    expect(state.grass.mode).toBe(i);
    if (i === 1) await expect.poll(calls).toBe(withoutGrass + 1);
    await page.keyboard.press('Escape');
    // Compare only the scene, excluding changing captions and live HUD counters.
    screenshots.push(await page.screenshot({ clip: { x: 430, y: 330, width: 450, height: 350 } }));
    if ([0, 5, 7].includes(i)) await page.screenshot({ path: `state/presentation-${ids[i]}.png` });
  }
  // Rendered appearance changes between geometry and shading families.
  for (const [a, b] of [[0, 1], [1, 2], [2, 4], [4, 5], [6, 7]]) {
    expect(screenshots[a].equals(screenshots[b])).toBe(false);
  }
  await expect(next).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('PageDown');await expect(page.locator('#app')).toHaveAttribute('data-study', 'implicit-turf');
  const ghost = await snapshot();
  expect(ghost.grass.lodPatches.every((count: number) => count > 0)).toBe(true);
  // A complete reverse cycle leaves all earlier implementations selectable.
  for (let i = ids.length - 2; i >= 0; i--) {
    await page.keyboard.press('PageUp');
    await expect(page.locator('#app')).toHaveAttribute('data-study', ids[i]);
    await expect(page.locator('#app')).toHaveAttribute('data-transition', 'idle');
  }
  expect((await snapshot()).position).toEqual(initial.position);expect(errors).toEqual([]);
});

test('rapid navigation settles on the latest request; reduced motion and keyboard movement work', async ({ page }) => {
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  await page.keyboard.press('PageDown');
  await expect(page.locator('#app')).toHaveAttribute('data-study', 'billboards');
  await expect(page.locator('#app')).toHaveAttribute('data-transition', 'idle');
  await page.keyboard.press('PageDown');await page.keyboard.press('PageDown');await page.keyboard.press('PageUp');
  await expect(page.locator('#app')).toHaveAttribute('data-study', 'crossed-cards');
  await expect(page.locator('#app')).toHaveAttribute('data-transition', 'idle');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('PageUp');
  await expect(page.locator('#app')).toHaveAttribute('data-study', 'billboards');
  await expect(page.locator('#app')).toHaveAttribute('data-transition', 'idle');
  await page.getByRole('button', { name: 'Next study' }).focus();
  await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(() => (window as any).__study.snapshot().state)).toBe('walk');
  await page.keyboard.up('KeyW');
  await expect.poll(() => page.evaluate(() => (window as any).__study.snapshot().state)).toBe('idle');
});

test('number keys jump directly; H/L navigate and respect focused controls', async ({ page }) => {
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  const app = page.locator('#app');
  // A direct jump followed by relative navigation shares the same pending target.
  await page.keyboard.press('8');await page.keyboard.press('h');await page.keyboard.press('h');
  await expect(app).toHaveAttribute('data-study', 'contact');
  await expect(app).toHaveAttribute('data-transition', 'idle');
  await page.keyboard.press('l');
  await expect(app).toHaveAttribute('data-study', 'ghost');
  await expect(app).toHaveAttribute('data-transition', 'idle');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const i of [9, 8, 0, 7, 1, 6, 2, 5, 3, 4]) {
    await page.keyboard.press(String(i));await expect(app).toHaveAttribute('data-study', ids[i]);
  }
  await page.keyboard.press('8');await page.keyboard.press('l');
  await expect(app).toHaveAttribute('data-study', ids[9]);
  await page.keyboard.press('h');
  await expect(app).toHaveAttribute('data-study', ids[8]);
  await page.getByRole('button', { name: 'Winds', exact: true }).click();
  await page.locator('.wind-entry > summary').first().click();
  const slider = page.getByRole('slider', { name: 'Wind 1 strength', exact: true });
  await slider.focus();
  await page.keyboard.press('0');await page.keyboard.press('h');
  await expect(app).toHaveAttribute('data-study', ids[8]);
  await page.locator('#world').focus();
  await page.keyboard.press('0');await page.keyboard.press('h');
  await expect(app).toHaveAttribute('data-study', ids[0]);
});

test('study links open directly, follow navigation and survive reload', async ({ page }) => {
  await page.goto('/?s=8&from=friend#field');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#app')).toHaveAttribute('data-study', 'wind-vectors');
  await expect(page.locator('#wind-panel')).toBeHidden();
  await page.keyboard.press('h');
  await expect(page).toHaveURL(/\?s=7&from=friend#field$/);
  await page.reload();await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#app')).toHaveAttribute('data-study', 'ghost');
  for (const invalid of ['99', '-1', '2.5', 'grass']) {
    await page.goto(`/?s=${invalid}`);await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#app')).toHaveAttribute('data-study', 'ground');
    await expect(page).toHaveURL(/\?s=0$/);
  }
});

test('wind keeps advancing and brushing adds displacement that recovers', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (let i = 0; i < 6; i++) await page.keyboard.press('PageDown');
  await expect(page.locator('#app')).toHaveAttribute('data-study', 'contact');
  await expect(page.locator('#app')).toHaveAttribute('data-transition', 'idle');
  const snapshot = () => page.evaluate(() => (window as any).__study.snapshot());
  const start = await snapshot();
  await expect.poll(async () => (await snapshot()).grass.time).toBeGreaterThan(start.grass.time + .7);
  const baseline = (await snapshot()).grass.contactEnergy;
  await page.mouse.move(820, 550);await page.mouse.down({ button: 'left' });
  await expect.poll(async () => (await snapshot()).grass.contactEnergy).toBeGreaterThan(baseline + 5);
  await page.mouse.move(950, 580, { steps: 8 });
  const pressed = await snapshot();expect(pressed.yaw).toBe(start.yaw);
  await page.mouse.up({ button: 'left' });
  const peak = (await snapshot()).grass.contactEnergy;
  await expect.poll(async () => (await snapshot()).grass.contactEnergy, { timeout: 30000 }).toBeLessThan(peak * .8);
  const released = await snapshot();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot()).grass.time).toBeGreaterThan(released.grass.time + .3);
  await page.screenshot({ path: 'state/presentation-contact-play.png' });
  expect(errors).toEqual([]);
});
