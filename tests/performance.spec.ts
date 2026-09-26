import { expect, test } from '@playwright/test';

test('performance samples live work, toggles with F3/button, and remembers visibility', async ({ page }) => {
  await page.goto('/');
  const hud = page.getByRole('complementary', { name: 'Performance monitor' });
  await expect(hud).toBeHidden();
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(hud).toBeVisible();
  await expect(hud).toHaveAttribute('data-status', 'live');
  const metric = (key: string) => page.locator(`[data-metric="${key}"]`);
  await expect.poll(async () => Number(await metric('fps').textContent())).toBeGreaterThan(0);
  expect(Number((await metric('triangles').textContent())!.replaceAll(',', ''))).toBeGreaterThan(80000);
  expect(Number(await metric('calls').textContent())).toBeGreaterThan(1);
  await expect(metric('cpu')).toHaveText(/\d+\.\d+ ms/);
  await expect(metric('p95')).toHaveText(/\d+\.\d ms/);
  await expect(metric('resolution')).toContainText('1280 × 800');
  await expect(page.locator('[data-frame-line]')).not.toHaveAttribute('d', '');
  await page.keyboard.press('F3');await expect(hud).toBeHidden();
  await page.reload();await expect(hud).toBeHidden();
  await expect(page.getByRole('button', { name: 'Stats', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(hud).toBeVisible();await expect(hud).toHaveAttribute('data-status', 'live');
  await page.screenshot({ path: 'state/performance-desktop.png' });
});

test('missing GPU timer support is explicit and the narrow HUD stays within the viewport', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true });
  await context.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.getExtension;
    WebGL2RenderingContext.prototype.getExtension = function (name: string) {
      return name === 'EXT_disjoint_timer_query_webgl2' ? null : original.call(this, name);
    };
  });
  const page = await context.newPage();await page.goto('/');
  const hud = page.getByRole('complementary', { name: 'Performance monitor' });
  await expect(hud).toBeHidden();
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(page.locator('[data-metric="gpu"]')).toHaveText('not available');
  const bounds = (await hud.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x + bounds.width).toBeLessThanOrEqual(360);
  expect(bounds.y + bounds.height).toBeLessThan(500);
  await expect(page.getByRole('button', { name: 'Walk forward', exact: true })).toBeVisible();
  await page.screenshot({ path: 'state/performance-mobile.png' });
  await context.close();
});

test('GPU queries wait asynchronously, stay bounded, discard disjoint results, and stop when hidden', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { available: false, disjoint: false, reads: 0, created: 0, deleted: 0 };
    (window as any).__timerFixture = state;
    const proto = WebGL2RenderingContext.prototype;
    const extension = proto.getExtension, begin = proto.beginQuery, end = proto.endQuery;
    const parameter = proto.getParameter, queryParameter = proto.getQueryParameter, remove = proto.deleteQuery;
    const timers = new WeakSet<WebGLQuery>();
    const target = 0x88bf, disjoint = 0x8fbb;
    proto.getExtension = function (name: string) {
      return name === 'EXT_disjoint_timer_query_webgl2'
        ? { TIME_ELAPSED_EXT: target, GPU_DISJOINT_EXT: disjoint } : extension.call(this, name);
    };
    proto.beginQuery = function (type, query) {
      if (type === target) { timers.add(query);state.created++; } else begin.call(this, type, query);
    };
    proto.endQuery = function (type) { if (type !== target) end.call(this, type); };
    proto.getParameter = function (name) { return name === disjoint ? state.disjoint : parameter.call(this, name); };
    proto.getQueryParameter = function (query, name) {
      if (!timers.has(query)) return queryParameter.call(this, query, name);
      if (name === this.QUERY_RESULT_AVAILABLE) return state.available;
      state.reads++;
      if (!state.available || state.disjoint) throw new Error('Read an invalid or unavailable GPU result');
      return 5_000_000;
    };
    proto.deleteQuery = function (query) { if (query && timers.has(query)) state.deleted++;remove.call(this, query); };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__timerFixture.created)).toBe(6);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as any).__timerFixture.reads)).toBe(0);
  expect(await page.evaluate(() => (window as any).__timerFixture.created)).toBe(6);
  await page.evaluate(() => { (window as any).__timerFixture.available = true; });
  await expect(page.locator('[data-metric="gpu"]')).toHaveText('5.00 ms');
  await page.evaluate(() => { (window as any).__timerFixture.disjoint = true; });
  await expect(page.locator('[data-metric="gpu"]')).toHaveText('waiting…');
  expect(await page.evaluate(() => (window as any).__timerFixture.deleted)).toBeGreaterThanOrEqual(6);
  await page.evaluate(() => { (window as any).__timerFixture.disjoint = false; });
  await expect(page.locator('[data-metric="gpu"]')).toHaveText('5.00 ms');
  await page.keyboard.press('F3');
  const count = await page.evaluate(() => (window as any).__timerFixture.created);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => (window as any).__timerFixture.created)).toBe(count);
});
