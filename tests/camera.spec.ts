import { expect, test } from '@playwright/test';

test('camera damping eases toward input, agrees at 60/144 Hz, and reset snaps', async ({ page }) => {
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  // Component check: controlled time steps, with pointer capture stubbed locally.
  const result = await page.evaluate(async () => {
    const modulePath = '/src/camera.ts', threePath = '/node_modules/three/build/three.module.js';
    const { FollowCamera } = await import(modulePath), THREE = await import(threePath);
    function simulate(hz: number) {
      const canvas = document.createElement('canvas');
      canvas.setPointerCapture = () => {};canvas.hasPointerCapture = () => false;
      const camera = new FollowCamera(new THREE.PerspectiveCamera(), canvas);
      const position = new THREE.Vector3(0, 0, 8);camera.reset(position);
      canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', buttons: 2, clientX: 100, clientY: 100 }));
      canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', buttons: 2, clientX: 200, clientY: 150 }));
      const before = camera.viewYaw, target = camera.yaw;
      camera.update(1 / hz, position);const first = camera.viewYaw;
      for (let i = 1; i < hz / 2; i++) camera.update(1 / hz, position);
      const settled = camera.viewYaw;camera.reset(position);
      return { before, target, first, settled, reset: camera.viewYaw, resetTarget: camera.yaw };
    }
    return [simulate(60), simulate(144)];
  });
  for (const sample of result) {
    expect(sample.before).toBe(.25);expect(sample.target).toBe(-.25);
    expect(sample.first).toBeLessThan(sample.before);expect(sample.first).toBeGreaterThan(sample.target);
    expect(sample.settled).toBeCloseTo(sample.target, 5);
    expect(sample.reset).toBe(.25);expect(sample.reset).toBe(sample.resetTarget);
  }
  expect(result[0].settled).toBeCloseTo(result[1].settled, 8);
});
