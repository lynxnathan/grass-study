import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { firefox, expect } from '@playwright/test';
import { discoverGpuCounters, sampleGpuDuring } from './gpu-utilization.mjs';

const { values } = parseArgs({ options: {
  headed: { type: 'boolean', default: false },
  study: { type: 'string', default: '8' },
  tufts: { type: 'string', default: 'opaque' },
  'hide-tall': { type: 'boolean', default: false },
  url: { type: 'string', default: 'http://127.0.0.1:5173/' },
  width: { type: 'string', default: '1440' },
  'wind-detail': { type: 'string', default: 'blended' },
  height: { type: 'string', default: '900' },
} });
assert(['blended', 'direct'].includes(values['wind-detail']), '--wind-detail must be blended or direct');
const viewport = { width: Number(values.width), height: Number(values.height) };
for (const size of Object.values(viewport)) assert(Number.isInteger(size) && size >= 800 && size <= 7680);
assert(['8','9','10','11','12','13'].includes(values.study), '--study must be 8–13');
assert(['opaque','cards'].includes(values.tufts), '--tufts must be opaque or cards');
const url = new URL(values.url);url.searchParams.set('s', values.study);
let browser;
const report = {
  date: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  referenceObservations: JSON.parse(await readFile(new URL('../docs/performance-observations.json', import.meta.url), 'utf8')).observations,
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  url: url.href, study: Number(values.study), tufts: values.tufts, tallBlades: !values['hide-tall'], viewport, windDetail: values['wind-detail'], headless: !values.headed, phases: [], errors: [],
};
const summary = samples => {
  if (!samples.length) return { count: 0, mean: null, p50: null, p95: null, max: null };
  const sorted = [...samples].sort((a, b) => a - b);
  return { count: sorted.length, mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p50: sorted[Math.ceil(sorted.length * .5) - 1], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1) };
};

const devices = await discoverGpuCounters();
const gpuSummary = samples => devices.map(device => ({ card: device.card,
  percent: summary(samples.filter(sample => sample.card === device.card).map(sample => sample.percent)) }));
report.gpuUtilization = { source: 'linux-sysfs-gpu_busy_percent', scope: 'whole-device',
  intervalMs: 250, available: devices.length > 0, devices, samples: [], errors: [] };

try {
  // Record the desktop before creating the isolated benchmark browser.
  const background = await sampleGpuDuring(devices, () => new Promise(resolve => setTimeout(resolve, 1000)));
  report.gpuUtilization.background = gpuSummary(background.samples);
  report.gpuUtilization.samples.push(...background.samples.map(sample => ({ phase: 'background', ...sample })));
  report.gpuUtilization.errors.push(...background.errors.map(error => ({ phase: 'background', ...error })));
  browser = await firefox.launch({ headless: !values.headed });
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(url.href);await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  assert(await page.evaluate(() => Boolean(window.__study)), 'Use the local Vite development server for this benchmark.');
  await expect(page.locator('#study-number')).toHaveText(values.study.padStart(2,'0'));
  await page.getByRole('button', { name: 'Close passage' }).click();
  if(Number(values.study)>=10){
    await page.getByRole('button',{name:'Layers',exact:true}).click();
    if(values['hide-tall'])await page.getByLabel('Tall blades',{exact:true}).uncheck();
    if(values.study==='11')await page.getByLabel('Build the tuft with').selectOption(values.tufts);
    await page.getByRole('button',{name:'Close layer controls'}).click();
  }
  if (values['wind-detail'] === 'direct') {
    await page.getByRole('button', { name: 'Winds', exact: true }).click();
    await page.getByRole('button', { name: 'Blend wind detail', exact: true }).click();
    await page.getByRole('button', { name: 'Close wind controls' }).click();
  }
  await page.getByRole('button', { name: 'Stats', exact: true }).click();
  report.environment = await page.evaluate(() => {
    const mesh = window.__study.terrain, raycast = mesh.raycast;
    const probe = window.__interactionProbe = { phase: null, picks: [], frames: [], hits: 0 };
    // Observe the real terrain picking path, without changing the application.
    // Instrument the actual mesh, including its specialized raycast implementation.
    mesh.raycast = function (raycaster, hits) {
      if (this.name !== 'terrain' || !probe.phase) return raycast.call(this, raycaster, hits);
      const before = hits.length, start = performance.now();
      raycast.call(this, raycaster, hits);
      probe.picks.push({ phase: probe.phase, ms: performance.now() - start });
      if (hits.length > before) probe.hits++;
    };
    let previous = null;
    const tick = now => {
      if (probe.phase && previous !== null) probe.frames.push({ phase: probe.phase, ms: now - previous });
      previous = now;probe.raf = requestAnimationFrame(tick);
    };
    probe.raf = requestAnimationFrame(tick);
    const canvas = document.querySelector('#world'), gl = canvas.getContext('webgl2');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { userAgent: navigator.userAgent, devicePixelRatio, drawingBuffer: [canvas.width, canvas.height],
      rendererReportedByBrowser: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      gpuTimersSupported: Boolean(gl.getExtension('EXT_disjoint_timer_query_webgl2')) };
  });
  await page.waitForTimeout(2500);
  const initial = await page.evaluate(() => window.__study.snapshot());
  const phases = report.phases;
  async function phase(name, action) {
    await page.evaluate(name => { window.__interactionProbe.phase = name; }, name);
    const gpu = await sampleGpuDuring(devices, action);
    report.gpuUtilization.samples.push(...gpu.samples.map(sample => ({ phase: name, ...sample })));
    report.gpuUtilization.errors.push(...gpu.errors.map(error => ({ phase: name, ...error })));
    const result = await page.evaluate(() => {
      // The general snapshot itself raycasts the ground. Exclude it from timing.
      window.__interactionProbe.phase = null;
      const state = window.__study.snapshot();
      return { contactEnergy: state.grass.contactEnergy, position: state.position,
        yaw: state.yaw, distance: state.distance, winds: state.grass.winds.length,
        windPatches: state.grass.windPatches, contactHighlight: state.grass.contactHighlight,
        windHighlight: state.grass.windHighlight, highlightWeight: state.grass.windHighlightWeight,
        outlinedPatches: state.grass.outlinedPatches, naturalPatches: state.grass.naturalPatches,
        hud: Object.fromEntries([...document.querySelectorAll('[data-metric]')].map(el => [el.dataset.metric, el.textContent])) };
    });
    phases.push({ name, ...result, gpuUtilization: gpuSummary(gpu.samples) });
  }
  const point = { x: viewport.width * .6, y: viewport.height * .72 };
  await page.mouse.move(point.x, point.y);
  await phase('idle', () => page.waitForTimeout(4000));
  await page.mouse.down({ button: 'left' });
  await phase('held', () => page.waitForTimeout(4000));
  await phase('drag', async () => {
    for (let i = 0; i < 50; i++) {
      await page.mouse.move(point.x + Math.sin(i * .25) * viewport.width * .08,
        point.y + Math.cos(i * .25) * viewport.height * .04);
      await page.waitForTimeout(80);
    }
  });
  await page.mouse.up({ button: 'left' });
  await phase('released', () => page.waitForTimeout(4000));
  await page.mouse.down({ button: 'left' });await page.waitForTimeout(300);
  // Controlled interruption fixture; normal release above uses actual mouse input.
  await page.locator('#world').dispatchEvent('pointercancel', { pointerType: 'mouse', buttons: 1 });
  await phase('cancelled', () => page.waitForTimeout(1000));
  await page.mouse.up({ button: 'left' });
  const raw = await page.evaluate(() => {
    cancelAnimationFrame(window.__interactionProbe.raf);
    return { picks: window.__interactionProbe.picks, frames: window.__interactionProbe.frames, hits: window.__interactionProbe.hits };
  });
  report.raw = raw;
  for (const phase of phases) {
    phase.frameMs = summary(raw.frames.filter(s => s.phase === phase.name).map(s => s.ms));
    phase.pickMs = summary(raw.picks.filter(s => s.phase === phase.name).map(s => s.ms));
  }
  report.checks = {
    terrainWasHit: raw.hits > 0,
    heldAndDragged: phases.slice(1, 3).every(p => p.pickMs.count > 0),
    noPickingWhenReleased: phases.filter(p => ['idle', 'released', 'cancelled'].includes(p.name)).every(p => p.pickMs.count === 0),
    contactResponds: phases[1].contactEnergy > phases[0].contactEnergy + 5,
    contactRecovers: phases[3].contactEnergy < Math.max(phases[1].contactEnergy, phases[2].contactEnergy),
    cameraAndCharacterStayPut: phases.every(p => JSON.stringify(p.position) === JSON.stringify(initial.position)
      && p.yaw === initial.yaw && p.distance === initial.distance),
    renderWorkStaysConstant: phases.every(p => p.hud.calls === phases[0].hud.calls && p.hud.triangles === phases[0].hud.triangles),
    twoWindsThroughout: phases.every(p => p.winds === 2),
    noPageErrors: report.errors.length === 0,
  };
  await mkdir('state', { recursive: true });
  const path = `state/interaction-${report.date.replaceAll(':', '-')}.json`;
  await writeFile(path, JSON.stringify(report, null, 2));
  console.table(phases.map(p => ({ phase: p.name, frames: p.frameMs.count,
    frameP95Ms: p.frameMs.p95, pickMeanMs: p.pickMs.mean, pickP95Ms: p.pickMs.p95,
    cpu: p.hud.cpu, gpu: p.hud.gpu,
    gpuBusyMean: p.gpuUtilization.map(gpu => `${gpu.card}: ${gpu.percent.mean === null ? 'unavailable' : gpu.percent.mean.toFixed(1) + '%'}`).join(', ') || 'unavailable' })));
  console.log('GPU utilization (whole device):', report.gpuUtilization.devices);
  console.log('Browser:', report.environment.rendererReportedByBrowser);
  console.log('Checks:', report.checks);console.log('Report:', path);
  assert(Object.values(report.checks).every(Boolean), 'Interaction flow failed; see the saved report.');
} finally {
  await browser?.close();
}
