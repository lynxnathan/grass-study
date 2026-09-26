import { expect, test } from '@playwright/test';

test('walking matches the planted foot stride and sprint keeps its accepted speed', async ({ page }) => {
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  // Exercise the real player and imported skeleton at fixed simulation steps,
  // independent of the test machine's rendering rate.
  const result = await page.evaluate(async () => {
    const path = '/src/player.ts';const { Player } = await import(path);
    const player = new Player();await player.load();
    const input = { axis: { x: 0, z: 1 }, running: false };
    const dt = 1 / 120;
    for (let i = 0; i < 240; i++) player.update(dt, input, 0);
    const samples: { y: number; z: number }[] = [];
    const foot = player.root.getObjectByName('ball_l');
    for (let i = 0; i < 320; i++) {
      player.update(dt, input, 0);player.root.updateMatrixWorld(true);
      samples.push({ y: foot.matrixWorld.elements[13] - player.root.position.y, z: foot.matrixWorld.elements[14] });
    }
    const lowest = Math.min(...samples.map(s => s.y));
    const slip = samples.slice(1).flatMap((s, i) =>
      s.y < lowest + .008 && samples[i].y < lowest + .008 ? [Math.abs(s.z - samples[i].z) / dt] : []);
    slip.sort((a, b) => a - b);
    const walkState = player.state, walkSpeed = player.velocity.length();
    input.running = true;
    for (let i = 0; i < 240; i++) player.update(dt, input, 0);
    const runSpeed = player.velocity.length(), runState = player.state;
    input.axis.z = 0;
    for (let i = 0; i < 240; i++) player.update(dt, input, 0);
    return { medianSlip: slip[Math.floor(slip.length / 2)], samples: slip.length, walkState, walkSpeed, runSpeed, runState, stopped: player.state };
  });
  expect(result.samples).toBeGreaterThan(50);
  expect(result.medianSlip).toBeLessThan(.08);
  expect(result.walkState).toBe('walk');expect(result.runState).toBe('run');
  expect(result.walkSpeed).toBeCloseTo(1.127, 3);
  expect(result.runSpeed).toBeCloseTo(5.8, 3);expect(result.stopped).toBe('idle');
});

test('grass transitions leave the scene and interface fully visible while animation continues', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 500 });
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('PageDown');
  await expect(page.locator('#app')).toHaveAttribute('data-study', 'billboards');
  await expect(page.locator('#app')).toHaveAttribute('data-transition', 'idle');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const before = await page.evaluate(() => (window as any).__study.snapshot());
  await page.evaluate(() => {
    (window as any).fadeSamples = [];
    const sample = () => {
      (window as any).fadeSamples.push({
        coverage: (window as any).__study.snapshot().grass.coverage,
        opacity: ['#world', '.chapter', '#study-caption'].map(s => getComputedStyle(document.querySelector(s)!).opacity),
      });
      (window as any).fadeFrame = requestAnimationFrame(sample);
    };sample();
  });
  await page.keyboard.press('PageDown');
  await expect(page.locator('#app')).toHaveAttribute('data-study', 'crossed-cards');
  await expect(page.locator('#app')).toHaveAttribute('data-transition', 'idle');
  const samples = await page.evaluate(() => { cancelAnimationFrame((window as any).fadeFrame);return (window as any).fadeSamples; });
  expect(samples.some((s: any) => s.coverage < 1)).toBe(true);
  expect(samples.every((s: any) => s.opacity.every((o: string) => o === '1'))).toBe(true);
  const after = await page.evaluate(() => (window as any).__study.snapshot());
  expect(after.grass.coverage).toBe(1);expect(after.position).toEqual(before.position);
  expect(after.animationTime).toBeGreaterThan(before.animationTime);
});
