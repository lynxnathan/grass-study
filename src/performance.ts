import type { WebGLRenderer } from 'three';

const WINDOW_MS = 3000;
const UPDATE_MS = 250;
const GPU_SAMPLE_EVERY = 4;
const MAX_PENDING_QUERIES = 6;
const STORAGE_KEY = 'grass-study.performance-visible';

type TimerExtension = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
type FrameSample = { at: number; frame: number; cpu: number };

export class PerformanceHud {
  private panel = document.querySelector<HTMLElement>('#performance')!;
  private toggle = document.querySelector<HTMLButtonElement>('#performance-toggle')!;
  private gl: WebGL2RenderingContext;
  private extension: TimerExtension | null;
  private pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  private samples: FrameSample[] = [];
  private gpuSamples: { at: number; ms: number }[] = [];
  private lastFrame: number | null = null;
  private lastUpdate = 0;
  private frameNumber = 0;
  private visible = false;
  private lost = false;

  constructor(private renderer: WebGLRenderer) {
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    this.extension = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) this.visible = stored === 'true';
    } catch { /* The HUD remains usable when browser storage is unavailable. */ }
    this.sync();
    this.toggle.onclick = () => this.setVisible(!this.visible);
    window.addEventListener('keydown', event => {
      if (event.code === 'F3' && !event.repeat) { event.preventDefault();this.setVisible(!this.visible); }
    });
    document.addEventListener('visibilitychange', () => this.reset());
    renderer.domElement.addEventListener('webglcontextlost', () => {
      this.lost = true;this.active = null;this.pending = [];this.reset();
      this.panel.dataset.status = 'lost';
      this.write('gpu', 'unavailable');
    });
  }

  private write(key: string, value: string) { this.panel.querySelector<HTMLElement>(`[data-metric="${key}"]`)!.textContent = value; }

  private sync() {
    this.panel.hidden = !this.visible;
    this.toggle.setAttribute('aria-pressed', String(this.visible));
    this.toggle.setAttribute('aria-expanded', String(this.visible));
  }

  private setVisible(value: boolean) {
    this.visible = value;this.reset();this.sync();
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* Optional preference. */ }
  }

  private clearQueries() {
    if (!this.lost) for (const query of this.pending) this.gl.deleteQuery(query);
    this.pending = [];
  }

  reset() {
    this.samples = [];this.gpuSamples = [];this.lastFrame = null;this.lastUpdate = 0;
    this.clearQueries();
    for (const metric of ['fps', 'frame', 'p95', 'cpu', 'gpu', 'calls', 'triangles']) this.write(metric, '—');
    this.panel.querySelector<SVGPathElement>('[data-frame-line]')!.setAttribute('d', '');
    this.panel.dataset.status = 'warming';
  }

  begin(now: number): number {
    const start = performance.now();
    if (!this.visible || this.lost) return start;
    const ext = this.extension;
    if (ext) {
      if (this.gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        this.clearQueries();this.gpuSamples = [];
      } else {
        while (this.pending.length && this.gl.getQueryParameter(this.pending[0], this.gl.QUERY_RESULT_AVAILABLE)) {
          const query = this.pending.shift()!;
          const ns = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT) as number;
          this.gl.deleteQuery(query);
          if (Number.isFinite(ns) && ns > 0) this.gpuSamples.push({ at: now, ms: ns / 1e6 });
        }
      }
    }
    return start;
  }

  beginRender() {
    if (!this.visible || this.lost || !this.extension) return;
    this.frameNumber++;
    if (this.frameNumber % GPU_SAMPLE_EVERY === 0 && this.pending.length < MAX_PENDING_QUERIES
      && !this.gl.getParameter(this.extension.GPU_DISJOINT_EXT)) {
      this.active = this.gl.createQuery();
      if (this.active) this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, this.active);
    }
  }

  end(now: number, start: number) {
    const cpu = performance.now() - start;
    if (this.active && this.extension && !this.lost) {
      this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);this.pending.push(this.active);this.active = null;
    }
    if (!this.visible || this.lost) return;
    if (this.lastFrame !== null && now > this.lastFrame) this.samples.push({ at: now, frame: now - this.lastFrame, cpu });
    this.lastFrame = now;
    while (this.samples.length && this.samples[0].at < now - WINDOW_MS) this.samples.shift();
    while (this.gpuSamples.length && this.gpuSamples[0].at < now - WINDOW_MS) this.gpuSamples.shift();
    if (now - this.lastUpdate < UPDATE_MS || this.samples.length < 2) return;
    this.lastUpdate = now;
    const frames = this.samples.map(sample => sample.frame);
    const mean = frames.reduce((sum, frame) => sum + frame, 0) / frames.length;
    const sorted = [...frames].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(sorted.length * .95) - 1];
    this.write('fps', (1000 / mean).toFixed(0));
    this.write('frame', `${mean.toFixed(1)} ms`);this.write('p95', `${p95.toFixed(1)} ms`);
    this.write('cpu', `${(this.samples.reduce((sum, sample) => sum + sample.cpu, 0) / this.samples.length).toFixed(2)} ms`);
    const gpu = this.gpuSamples;
    this.write('gpu', !this.extension ? 'not available' : gpu.length
      ? `${(gpu.reduce((sum, sample) => sum + sample.ms, 0) / gpu.length).toFixed(2)} ms` : 'waiting…');
    this.write('calls', this.renderer.info.render.calls.toLocaleString('en-US'));
    this.write('triangles', this.renderer.info.render.triangles.toLocaleString('en-US'));
    const canvas = this.renderer.domElement;
    this.write('resolution', `${canvas.width} × ${canvas.height} · ${this.renderer.getPixelRatio().toFixed(1)}× DPR`);
    const ceiling = Math.max(33.4, ...frames);
    const line = this.samples.map((sample, i) => `${i ? 'L' : 'M'}${(190 * (sample.at - (now - WINDOW_MS)) / WINDOW_MS).toFixed(1)},${(39 - Math.min(sample.frame / ceiling, 1) * 37).toFixed(1)}`).join(' ');
    this.panel.querySelector<SVGPathElement>('[data-frame-line]')!.setAttribute('d', line);
    const reference = 39 - 16.7 / ceiling * 37;
    const guide = this.panel.querySelector<SVGLineElement>('[data-frame-guide]')!;
    guide.setAttribute('y1', String(reference));guide.setAttribute('y2', String(reference));
    this.write('ceiling', `${ceiling.toFixed(0)} ms`);this.panel.dataset.status = 'live';
  }
}
