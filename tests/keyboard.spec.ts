import { expect, test } from '@playwright/test';

const position = (page: import('@playwright/test').Page): Promise<number[]> =>
  page.evaluate(() => (window as any).__study.snapshot().position);

test('blur and cancellation release movement without freezing animation or camera; stale repeats stay cleared', async ({ page }) => {
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  await expect(page.getByRole('button', { name: /^(Pause|Continue)$/ })).toHaveCount(0);
  const snapshot = () => page.evaluate(() => (window as any).__study.snapshot());
  for (const [index, key] of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp'].entries()) {
    if (index % 2 === 0) await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.locator('#world').dispatchEvent('pointercancel', { pointerId: 1 });
    const interrupted = await snapshot();
    await page.keyboard.press('Escape');
    await page.mouse.move(550, 350);await page.mouse.down({ button: 'right' });
    await page.mouse.move(610, 370, { steps: 3 });await page.mouse.up({ button: 'right' });
    expect((await snapshot()).yaw).not.toBe(interrupted.yaw);
    await expect.poll(async () => (await snapshot()).animationTime).toBeGreaterThan(interrupted.animationTime + .2);
    const before = await position(page);
    await page.locator('#world').dispatchEvent('keydown', { code: key, repeat: true });
    await page.locator('#world').dispatchEvent('keydown', { code: key, ctrlKey: true });
    await page.keyboard.down('ShiftLeft');
    const time = (await snapshot()).animationTime;
    await expect.poll(async () => (await snapshot()).animationTime).toBeGreaterThan(time + .2);
    expect(await position(page)).toEqual(before);
    await page.keyboard.down(key);
    await expect.poll(async () => (await snapshot()).state).toBe('run');
    await expect.poll(async () => {
      const after = await position(page);return Math.hypot(after[0] - before[0], after[2] - before[2]);
    }).toBeGreaterThan(.3);
    await page.keyboard.up(key);await page.keyboard.up('ShiftLeft');
    await expect.poll(async () => (await snapshot()).state).toBe('idle');
  }
});

test('WASD keeps moving after Stats receives focus; Enter still activates the button', async ({ page }) => {
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  const stats = page.getByRole('button', { name: 'Stats', exact: true });
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
    await stats.click();await expect(stats).toBeFocused();
    const before = await position(page);
    await page.keyboard.down(key);
    await expect.poll(async () => {
      const after = await position(page);
      return Math.hypot(after[0] - before[0], after[2] - before[2]);
    }, { timeout: 6000, message: `${key} must move while Stats has focus` }).toBeGreaterThan(.5);
    await page.keyboard.up(key);
    await expect.poll(() => page.evaluate(() => (window as any).__study.snapshot().state)).toBe('idle');
    await expect(stats).toBeFocused();
  }
  const pressed = await stats.getAttribute('aria-pressed');
  await page.keyboard.press('Enter');
  await expect(stats).toHaveAttribute('aria-pressed', String(pressed !== 'true'));
});

test('typing in an editable control does not move the character and shortcuts are not consumed', async ({ page }) => {
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => {
    const textarea = document.createElement('textarea');textarea.id = 'typing-fixture';
    textarea.style.cssText = 'position:fixed;top:200px;left:20px;z-index:10';document.body.appendChild(textarea);
  });
  await page.locator('#typing-fixture').focus();
  const before = await position(page);
  const start = await page.evaluate(() => (window as any).__study.snapshot().animationTime);
  await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(() => (window as any).__study.snapshot().animationTime)).toBeGreaterThan(start + .6);
  await page.keyboard.up('KeyW');
  expect(await position(page)).toEqual(before);
  await expect(page.locator('#typing-fixture')).toHaveValue('w');
  await page.locator('#world').focus();
  const shortcut = await page.locator('#world').evaluate(canvas => {
    const event = new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', ctrlKey: true, bubbles: true, cancelable: true });
    canvas.dispatchEvent(event);return event.defaultPrevented;
  });
  expect(shortcut).toBe(false);
});

test('sprint and right-drag coexist; toolbar context menu is cancelled', async ({ page }) => {
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#world').focus();
  await page.keyboard.down('KeyW');await page.keyboard.down('ShiftLeft');
  await expect.poll(() => page.evaluate(() => (window as any).__study.snapshot().state)).toBe('run');
  const yaw = await page.evaluate(() => (window as any).__study.snapshot().yaw);
  await page.mouse.move(550, 400);await page.mouse.down({ button: 'right' });
  await page.mouse.move(650, 420, { steps: 8 });await page.mouse.up({ button: 'right' });
  const moving = await page.evaluate(() => (window as any).__study.snapshot());
  expect(moving.yaw).not.toBe(yaw);expect(moving.state).toBe('run');
  await page.keyboard.up('ShiftLeft');await page.keyboard.up('KeyW');
  await expect.poll(() => page.evaluate(() => (window as any).__study.snapshot().state)).toBe('idle');
  expect(await page.getByRole('button', { name: 'Stats', exact: true }).evaluate(button =>
    !button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))).toBe(true);
});

test('pointer cancellation clears held movement even if keyup never reaches the app', async ({ page }) => {
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#world').focus();await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(() => (window as any).__study.snapshot().state)).toBe('walk');
  await page.evaluate(() => window.addEventListener('keyup', event => event.stopImmediatePropagation(), { capture: true }));
  await page.locator('#world').dispatchEvent('pointercancel', { pointerId: 1 });await page.keyboard.up('KeyW');
  const stopped = await position(page);
  await expect.poll(() => page.evaluate(() => (window as any).__study.snapshot().state)).toBe('idle');
  await page.waitForTimeout(400);expect(await position(page)).toEqual(stopped);
});

test('returning after a long frame gap clears held controls and immediately advances the field', async ({ page }) => {
  // Model a browser withholding frames without relying on headless tab throttling.
  await page.addInitScript(() => {
    const frame = window.requestAnimationFrame.bind(window);
    (window as any).frameGap = 0;
    window.requestAnimationFrame = callback => frame(time => callback(time + (window as any).frameGap));
  });
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#world').focus();await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(() => (window as any).__study.snapshot().state)).toBe('walk');
  const returned = await page.evaluate(async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    const before = (window as any).__study.snapshot();
    delete (document as any).hidden;
    document.dispatchEvent(new Event('visibilitychange'));
    (window as any).frameGap = 60 * 60 * 1000;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    return { before, after: (window as any).__study.snapshot() };
  });
  await page.keyboard.up('KeyW');
  expect(returned.after.position).toEqual(returned.before.position);
  const elapsed = returned.after.grass.time - returned.before.grass.time;
  expect(elapsed).toBeGreaterThan(0);expect(elapsed).toBeLessThanOrEqual(.101);
  await expect.poll(() => page.evaluate(() => (window as any).__study.snapshot().grass.time)).toBeGreaterThan(returned.after.grass.time + .3);
  await page.keyboard.down('KeyD');
  await expect.poll(async () => {
    const current = await position(page);return Math.hypot(current[0] - returned.after.position[0], current[2] - returned.after.position[2]);
  }).toBeGreaterThan(.3);
  await page.keyboard.up('KeyD');
});
