import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverGpuCounters, sampleGpuDuring } from './gpu-utilization.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'grass-gpu-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, 'card1', 'device');await mkdir(dir, { recursive: true });
  for (const [name, value] of Object.entries({ vendor: '0x1002', device: '0x7550', gpu_busy_percent: '20' })) await writeFile(join(dir, name), value);
  return { root, path: join(dir, 'gpu_busy_percent') };
}

test('discovers counters and preserves measured zero; missing devices stay unavailable', async t => {
  const f = await fixture(t), devices = await discoverGpuCounters(f.root);
  assert.equal(devices.length, 1);assert.equal(devices[0].vendor, '0x1002');
  await writeFile(f.path, '0\n');
  const zero = await sampleGpuDuring(devices, async () => 'complete');
  assert.equal(zero.value, 'complete');assert.equal(zero.samples[0].percent, 0);assert.deepEqual(zero.errors, []);
  const absent = await discoverGpuCounters(join(f.root, 'missing'));
  assert.deepEqual(absent, []);
  const empty = await sampleGpuDuring(absent, async () => 7);
  assert.equal(empty.value, 7);assert.deepEqual(empty.samples, []);
});

test('samples changes and records malformed or disappearing counters without invented percentages', async t => {
  const f = await fixture(t), devices = await discoverGpuCounters(f.root);
  const result = await sampleGpuDuring(devices, async () => {
    await writeFile(f.path, 'bad');await new Promise(resolve => setTimeout(resolve, 50));
    await writeFile(f.path, '100');await new Promise(resolve => setTimeout(resolve, 50));
    await rm(f.path);await new Promise(resolve => setTimeout(resolve, 50));
  }, 5);
  assert.equal(result.samples[0].percent, 20);
  assert(result.samples.some(sample => sample.percent === 100));
  assert(result.samples.every(sample => [20, 100].includes(sample.percent)));
  assert(result.errors.some(error => error.error === 'Invalid GPU percentage'));
  assert(result.errors.some(error => error.error === 'ENOENT'));
});

test('an interrupted action releases the sampler timer', async t => {
  const f = await fixture(t), devices = await discoverGpuCounters(f.root);
  const original = globalThis.clearInterval;
  const clear = t.mock.method(globalThis, 'clearInterval', timer => original(timer));
  await assert.rejects(sampleGpuDuring(devices, async () => { throw new Error('interrupted'); }), /interrupted/);
  assert.equal(clear.mock.callCount(), 1);
});
