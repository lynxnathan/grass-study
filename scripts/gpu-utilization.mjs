import { readFile, readdir, realpath, access } from 'node:fs/promises';
import { join, basename } from 'node:path';

// Read-only Linux counters. This measures the whole device, including other apps.
export async function discoverGpuCounters(root = '/sys/class/drm') {
  let entries;
  try { entries = await readdir(root); } catch { return []; }
  const devices = [];
  for (const card of entries.filter(name => /^card\d+$/.test(name)).sort()) {
    const device = join(root, card, 'device'), path = join(device, 'gpu_busy_percent');
    try {
      await access(path);
      const [vendor, model, resolved] = await Promise.all([
        readFile(join(device, 'vendor'), 'utf8'), readFile(join(device, 'device'), 'utf8'), realpath(device),
      ]);
      devices.push({ card, pci: basename(resolved), vendor: vendor.trim(), device: model.trim(), path });
    } catch { /* Unsupported or inaccessible counters are absent, never zero load. */ }
  }
  return devices;
}

export async function sampleGpuDuring(devices, action, intervalMs = 250) {
  const samples = [], errors = [];
  let pending = null, timer;
  const sample = async () => {
    for (const device of devices) {
      try {
        const raw = (await readFile(device.path, 'utf8')).trim();
        if (!/^\d+$/.test(raw) || Number(raw) > 100) throw new Error('Invalid GPU percentage');
        samples.push({ card: device.card, at: Date.now(), percent: Number(raw) });
      } catch (error) {
        errors.push({ card: device.card, at: Date.now(), error: error.code ?? error.message });
      }
    }
  };
  try {
    if (devices.length) {
      await sample();
      timer = setInterval(() => {
        if (!pending) pending = sample().finally(() => { pending = null; });
      }, intervalMs);
    }
    const value = await action();
    return { value, samples, errors };
  } finally {
    clearInterval(timer);
    if (pending) await pending;
  }
}
