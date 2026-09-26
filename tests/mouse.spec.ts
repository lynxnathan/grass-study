import { expect, test } from '@playwright/test';

test('scene click/drag defaults and bubbling stay contained while toolbar controls remain usable', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => {
    const report = { escaped: [] as string[], sceneClicks: [] as boolean[], uiClicks: 0 };
    (window as any).__mouseReport = report;
    const canvas = document.querySelector('#world')!;
    canvas.addEventListener('click', event => report.sceneClicks.push(event.defaultPrevented));
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mouseup', 'click', 'auxclick', 'contextmenu', 'dragstart', 'selectstart', 'dblclick']) {
      document.addEventListener(type, event => {
        if (event.target === canvas) report.escaped.push(type);
        if (type === 'click' && (event.target as Element).closest('button')) report.uiClicks++;
      });
    }
  });
  await page.mouse.click(550, 400);
  await page.mouse.dblclick(550, 400);
  const passage = (await page.locator('.passage-copy').boundingBox())!;
  const x = passage.x + passage.width / 2, y = passage.y + passage.height / 2;
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, { x, y })).toBe('world');
  await page.mouse.move(550, 400);await page.mouse.down();await page.mouse.move(x, y, { steps: 8 });await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
  const cancelled = await page.locator('#world').evaluate(canvas => {
    return ['mousedown', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu', 'dragstart', 'selectstart']
      .map(type => !canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true })));
  });
  expect(cancelled.every(Boolean)).toBe(true);
  const report = await page.evaluate(() => (window as any).__mouseReport);
  expect(report.escaped).toEqual([]);expect(report.sceneClicks.length).toBeGreaterThan(0);
  expect(report.sceneClicks.every(Boolean)).toBe(true);
  const stats = page.getByRole('button', { name: 'Stats', exact: true });
  const previous = await stats.getAttribute('aria-pressed');await stats.click();
  await expect(stats).toHaveAttribute('aria-pressed', String(previous !== 'true'));
  expect(await page.evaluate(() => (window as any).__mouseReport.uiClicks)).toBe(1);
});

test('overlapping left/right presses keep right-drag independent; release and blur stop orbiting', async ({ page }) => {
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  const yaw = () => page.evaluate(() => (window as any).__study.snapshot().yaw);
  await page.mouse.move(550, 350);const initial = await yaw();
  await page.mouse.down({ button: 'left' });await page.mouse.move(600, 350, { steps: 5 });
  expect(await yaw()).toBe(initial);
  await page.mouse.down({ button: 'right' });await page.mouse.move(750, 360, { steps: 8 });
  expect(await yaw()).not.toBe(initial);
  await page.mouse.up({ button: 'right' });const afterRight = await yaw();
  await page.mouse.move(650, 380, { steps: 5 });expect(await yaw()).toBe(afterRight);
  await page.mouse.up({ button: 'left' });
  await page.mouse.down({ button: 'right' });await page.mouse.down({ button: 'left' });
  await page.mouse.move(750, 380, { steps: 5 });const both = await yaw();
  await page.mouse.up({ button: 'left' });await page.mouse.move(650, 380, { steps: 5 });
  expect(await yaw()).not.toBe(both);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const blurred = await yaw();await page.mouse.move(550, 400, { steps: 5 });
  expect(await yaw()).toBe(blurred);await page.mouse.up({ button: 'right' });
  await expect(page.locator('#world')).not.toHaveClass(/orbiting/);
});
