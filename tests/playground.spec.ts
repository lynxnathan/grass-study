import { expect, test, type Page } from '@playwright/test';

type Snapshot = {
  ready: boolean;state: string;position: number[];surface: number;
  camera: number[];cameraGround: number;yaw: number;distance: number;animationTime: number;bones: number[];
};
const snapshot = (page: Page): Promise<Snapshot> => page.evaluate(() => (window as any).__study.snapshot());
const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[2] - b[2]);
async function ready(page: Page) {
  await page.goto('/');
  await expect.poll(async () => (await snapshot(page)).ready).toBe(true);
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#world').focus();
}
async function advance(page: Page, seconds: number) {
  const start = (await snapshot(page)).animationTime;
  await expect.poll(async () => (await snapshot(page)).animationTime - start, { timeout: 25000 }).toBeGreaterThan(seconds);
}

test('idle → walk → run → release → idle → move again → reset; animated skeleton stays on hills', async ({ page }) => {
  const errors: string[] = [];page.on('pageerror', e => errors.push(e.message));
  await ready(page);
  const initial = await snapshot(page);expect(initial.state).toBe('idle');
  await page.keyboard.down('KeyW');await advance(page, 1.2);
  const walking = await snapshot(page);expect(walking.state).toBe('walk');
  expect(distance(initial.position, walking.position)).toBeGreaterThan(.9);
  expect(walking.bones.length).toBeGreaterThan(0);expect(walking.bones).not.toEqual(initial.bones);
  await page.keyboard.down('ShiftLeft');await advance(page, 3);
  // Poll the actual hill transition instead of assuming an exact position after
  // a wall-time-dependent number of rendered frames on software WebGL.
  await expect.poll(async () => Math.abs((await snapshot(page)).position[1] - initial.position[1])).toBeGreaterThan(.3);
  const running = await snapshot(page);expect(running.state).toBe('run');
  expect(distance(walking.position, running.position)).toBeGreaterThan(12);
  expect(Math.abs(running.position[1] - initial.position[1])).toBeGreaterThan(.3);
  expect(Math.abs(running.position[1] - running.surface)).toBeLessThan(.002);
  expect(running.camera[1]).toBeGreaterThan(running.cameraGround + .3);
  await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');await advance(page, .9);
  expect((await snapshot(page)).state).toBe('idle');
  const resting = await snapshot(page);await advance(page, .4);
  expect(distance((await snapshot(page)).position, resting.position)).toBeLessThan(.002);
  await page.keyboard.down('KeyD');await advance(page, .7);await page.keyboard.up('KeyD');
  expect(distance(resting.position, (await snapshot(page)).position)).toBeGreaterThan(.5);
  await page.getByRole('button', { name: 'Start over' }).click();
  expect((await snapshot(page)).position).toEqual(initial.position);
  expect((await snapshot(page)).state).toBe('idle');expect(errors).toEqual([]);
});

test('camera orbit/zoom works after blur while animation continues', async ({ page }) => {
  await ready(page);const initial = await snapshot(page);
  await page.mouse.move(700, 400);await page.mouse.down();await page.mouse.move(950, 450, { steps: 8 });await page.mouse.up();
  expect((await snapshot(page)).yaw).toBe(initial.yaw);
  await page.mouse.down({ button: 'right' });await page.mouse.move(700, 400, { steps: 8 });await page.mouse.up({ button: 'right' });
  expect((await snapshot(page)).yaw).not.toBe(initial.yaw);
  expect(await page.locator('#world').evaluate(canvas => !canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))).toBe(true);
  await page.mouse.wheel(0, -250);await expect.poll(async () => (await snapshot(page)).distance).toBeLessThan(initial.distance);
  await page.keyboard.down('KeyW');await advance(page, .4);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const stopped = await snapshot(page);
  await page.keyboard.up('KeyW');
  await advance(page, 1);
  expect((await snapshot(page)).state).toBe('idle');
  expect(distance(stopped.position, (await snapshot(page)).position)).toBeLessThan(.4);
});

test('failed character download → visible recovery → successful retry', async ({ page }) => {
  await page.route('**/assets/quaternius-ual.glb', route => route.abort());
  await page.goto('/');await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.locator('#load-title')).toHaveText('The character could not load.');
  await expect(page.getByRole('button', { name: 'Start over' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next study', exact: true })).toBeDisabled();
  await page.unroute('**/assets/quaternius-ual.glb');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(async () => (await snapshot(page)).ready).toBe(true);
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Next study', exact: true })).toBeEnabled();
});

test('narrow touch layout stays reachable and movement stops on pointer cancellation', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();await ready(page);
  const forward = page.getByRole('button', { name: 'Walk forward', exact: true });
  await expect(forward).toBeVisible();const start = await snapshot(page);
  const box = (await forward.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);await page.mouse.down();await advance(page, .8);
  expect(distance(start.position, (await snapshot(page)).position)).toBeGreaterThan(.5);
  await forward.dispatchEvent('pointercancel', { pointerId: 1 });await page.mouse.up();await advance(page, 1);
  expect((await snapshot(page)).state).toBe('idle');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const locator of [forward, page.locator('#performance-toggle'), page.locator('#home')]) {
    const rect = (await locator.boundingBox())!;expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.y + rect.height).toBeLessThanOrEqual(740);
  }
  await page.screenshot({ path: 'state/mobile.png' });await context.close();
});
