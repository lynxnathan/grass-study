import * as THREE from 'three';

export type WindKind = 'directional' | 'radial' | 'vortex';
type Wind = { id: number; kind: WindKind; x: number; z: number; radius: number; sense: number;
  heading: number; strength: number; scale: number; speed: number; bias: number; gust: number; phase: number };

// An editable collection, uploaded as three texels per source. The shader loops
// over the live count; adding a wind never changes shader source or program keys.
export class WindField {
  revision = 0;
  private nextId = 0;
  private capacity = 0;
  private data = new Float32Array();
  private sources: Wind[] = [];
  readonly uniforms = {
    grassWinds: { value: new THREE.DataTexture() },
    grassWindCount: { value: 0 }, grassFineWindCount: { value: 0 },
  };

  constructor() { this.reset(); }

  get winds(): readonly Wind[] { return this.sources; }
  get maximumDisplacement() {
    return this.sources.reduce((sum, wind) => sum + wind.strength * (Math.abs(wind.bias) + Math.abs(wind.gust))
      * (wind.kind === 'directional' ? 1 : 1.01), 0);
  }

  reset() {
    this.sources = [
      { id: this.nextId++, kind: 'directional', x: 0, z: 0, radius: 14, sense: 1, heading: Math.atan2(.32, .85) * 180 / Math.PI, strength: Math.hypot(.85, .32), scale: .095, speed: .383, bias: .12, gust: .62, phase: 0 },
      { id: this.nextId++, kind: 'directional', x: 0, z: 0, radius: 14, sense: 1, heading: Math.atan2(.91, -.28) * 180 / Math.PI, strength: Math.hypot(-.28, .91), scale: .24, speed: .516, bias: -.35 * .38, gust: .38, phase: 0 },
    ];
    this.upload();
  }

  add(kind: WindKind = 'directional', randomized = false) {
    const id = this.nextId++;
    const wind: Wind = { id, kind, x: 0, z: 8, radius: 14, sense: 1, heading: (id * 137.5) % 360, strength: kind === 'directional' ? .7 : 1.2, scale: .12, speed: .4, bias: kind === 'directional' ? .08 : .8, gust: kind === 'directional' ? .45 : .2, phase: id * 17 };
    // 08 starts each added source differently, without rewriting existing winds.
    if (randomized) {
      wind.heading = Math.random() * 360;
      wind.strength = .35 + Math.random() * .95;
      wind.radius = 12 + Math.random() * 24;
      wind.x = (Math.random() - .5) * 164;
      wind.z = (Math.random() - .5) * 164;
      wind.sense = Math.random() < .5 ? -1 : 1;
      wind.scale = .06 + Math.random() * .18;
      wind.speed = .2 + Math.random() * .5;
      wind.phase = Math.random() * 100;
    }
    this.sources.push(wind);this.upload();
  }

  remove(id: number) { this.sources = this.sources.filter(wind => wind.id !== id);this.upload(); }

  set(id: number, values: Partial<Pick<Wind, 'heading' | 'strength' | 'kind' | 'x' | 'z' | 'radius'>>) {
    const wind = this.sources.find(source => source.id === id);
    if (!wind) return;
    if (values.heading !== undefined && Number.isFinite(values.heading)) wind.heading = ((values.heading % 360) + 360) % 360;
    if (values.strength !== undefined && Number.isFinite(values.strength)) wind.strength = THREE.MathUtils.clamp(values.strength, 0, 2);
    if (values.kind !== undefined && ['directional', 'radial', 'vortex'].includes(values.kind)) wind.kind = values.kind;
    for (const axis of ['x', 'z'] as const) {
      const value = values[axis];
      if (value !== undefined && Number.isFinite(value)) wind[axis] = THREE.MathUtils.clamp(value, -82, 82);
    }
    if (values.radius !== undefined && Number.isFinite(values.radius)) wind.radius = THREE.MathUtils.clamp(values.radius, 2, 80);
    this.upload();
  }

  reverse(id: number) {
    const wind = this.sources.find(source => source.id === id);
    if (wind) { wind.sense *= -1;this.set(id, { heading: wind.heading + 180 }); }
  }

  oppose(id: number) {
    const first = this.sources[0];
    const wind = this.sources.find(source => source.id === id);
    if (first && wind && first.id !== id) {
      Object.assign(wind, first, { id, heading: (first.heading + 180) % 360, sense: -first.sense });this.upload();
    }
  }

  private upload() {
    this.revision++;
    if (this.sources.length > this.capacity || this.capacity === 0) {
      this.capacity = 2 ** Math.ceil(Math.log2(Math.max(1, this.sources.length)));
      this.data = new Float32Array(this.capacity * 12);
      this.uniforms.grassWinds.value.dispose();
      const texture = new THREE.DataTexture(this.data, 3, this.capacity, THREE.RGBAFormat, THREE.FloatType);
      texture.magFilter = texture.minFilter = THREE.NearestFilter;
      this.uniforms.grassWinds.value = texture;
    }
    this.sources.forEach((wind, i) => {
      const angle = wind.heading * Math.PI / 180;
      this.data.set([Math.cos(angle) * wind.strength, Math.sin(angle) * wind.strength, wind.scale, wind.speed,
        wind.bias, wind.gust, wind.phase, 0, wind.x, wind.z, wind.radius,
        wind.kind === 'directional' ? 0 : (wind.kind === 'radial' ? 1 : 2) * wind.sense], i * 12);
    });
    this.uniforms.grassWindCount.value = this.sources.length;
    this.uniforms.grassFineWindCount.value = this.sources.filter(w => w.kind !== 'directional' && w.radius < 8).length;
    this.uniforms.grassWinds.value.needsUpdate = true;
  }

  snapshot() {
    return this.sources.map((wind, i) => ({ id: wind.id, heading: wind.heading, strength: wind.strength,
      kind: wind.kind, origin: [wind.x, wind.z], radius: wind.radius, sense: wind.sense,
      vector: Array.from(this.data.slice(i * 12, i * 12 + 2)) }));
  }
}

export class WindControls {
  private panel = document.querySelector<HTMLElement>('#wind-panel')!;
  private toggle = document.querySelector<HTMLButtonElement>('#wind-toggle')!;
  private list = document.querySelector<HTMLElement>('#wind-list')!;
  private status = document.querySelector<HTMLElement>('#wind-placement')!;
  private canvas = document.querySelector<HTMLCanvasElement>('#world')!;
  private mode = 0;
  private expanded = new Set<number>();
  placing: number | null = null;

  constructor(private field: WindField) {
    this.toggle.onclick = () => this.open(Boolean(this.panel.hidden));
    document.querySelector<HTMLButtonElement>('#wind-close')!.onclick = () => { this.open(false);this.toggle.focus(); };
    document.querySelector<HTMLButtonElement>('#wind-add')!.onclick = () => this.add('directional');
    document.querySelector<HTMLButtonElement>('#wind-vortex')!.onclick = () => this.add('vortex');
    document.querySelector<HTMLButtonElement>('#wind-reset')!.onclick = () => { this.cancelPlacement();this.field.reset();this.render(); };
    window.addEventListener('keydown', event => { if (event.key === 'Escape') this.cancelPlacement(); });
    window.addEventListener('blur', () => this.cancelPlacement());
    this.canvas.addEventListener('pointercancel', () => this.cancelPlacement());
    this.canvas.addEventListener('inputinterrupted', () => this.cancelPlacement());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancelPlacement(); });
    document.addEventListener('readingopened', () => this.open(false));
    document.addEventListener('controlsopened', () => this.open(false));
    document.addEventListener('weatheropened', () => this.open(false));
    document.addEventListener('coveropened', () => this.open(false));
    this.render();
  }

  private add(kind: WindKind) {
    this.cancelPlacement();this.field.add(kind, this.mode >= 8);
    this.expanded.add(this.field.winds.at(-1)!.id);this.render();
    this.list.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }

  cancelPlacement() {
    this.placing = null;this.status.hidden = true;this.canvas.classList.remove('placing-wind');
    this.list.querySelectorAll('[data-action="place"]').forEach(button => button.setAttribute('aria-pressed', 'false'));
  }

  placeAt(point: THREE.Vector3) {
    if (this.placing === null) return;
    this.field.set(this.placing, { x: point.x, z: point.z });
    this.cancelPlacement();this.render();
  }

  setMode(mode: number) {
    if (mode !== this.mode) this.open(false);
    this.toggle.hidden = mode < 4;
    if (mode < 4) this.open(false);
    const changed = this.mode !== mode;this.mode = mode;
    document.querySelector<HTMLElement>('#wind-vortex')!.hidden = mode < 8;
    if (changed) this.render();
  }

  private open(value: boolean) {
    if (!value) this.cancelPlacement();
    this.panel.hidden = !value;this.toggle.setAttribute('aria-expanded', String(value));
  }

  private render() {
    // Read native disclosure state before rebuilding controls after an edit.
    this.list.querySelectorAll<HTMLDetailsElement>('.wind-entry').forEach(entry => {
      const id = Number(entry.dataset.windId);
      if (entry.open) this.expanded.add(id);else this.expanded.delete(id);
    });
    const liveIds = new Set(this.field.winds.map(wind => wind.id));
    this.expanded.forEach(id => { if (!liveIds.has(id)) this.expanded.delete(id); });
    this.list.replaceChildren();
    document.querySelector('#wind-count')!.textContent = `${this.field.winds.length} active ${this.field.winds.length === 1 ? 'vector' : 'vectors'}`;
    this.field.winds.forEach((wind, index) => {
      const label = `Wind ${index + 1}`;
      const entry = document.createElement('details');
      entry.className = 'wind-entry';entry.dataset.windId = String(wind.id);
      entry.open = this.expanded.has(wind.id);
      const summary = document.createElement('summary');
      summary.setAttribute('aria-label', label);
      summary.innerHTML = `<span>${label}</span><span class="wind-summary"></span>`;
      const describe = () => {
        const flow = wind.kind === 'directional' ? `${Math.round(wind.heading)}°` : wind.kind === 'radial' ? 'From a point' : 'Vortex';
        summary.querySelector('.wind-summary')!.textContent = `${flow} · ${wind.strength.toFixed(2)}`;
      };
      describe();
      entry.ontoggle = () => {
        if (entry.isConnected && !entry.open && this.placing === wind.id) this.cancelPlacement();
      };
      const row = document.createElement('fieldset');
      row.setAttribute('aria-label', label);
      const spatial = wind.kind !== 'directional';
      row.innerHTML = `
        ${this.mode >= 8 ? `<label>Flow<select aria-label="${label} flow">
          <option value="directional">Across the field</option><option value="radial">From a point</option><option value="vortex">Around a point</option>
        </select></label>` : ''}
        ${!spatial ? `<label>Heading <output data-value="heading">${Math.round(wind.heading)}°</output><input data-param="heading" aria-label="${label} heading" type="range" min="0" max="359" step="1" value="${wind.heading}"></label>` : ''}
        <label>Strength <output data-value="strength">${wind.strength.toFixed(2)}</output><input data-param="strength" aria-label="${label} strength" type="range" min="0" max="2" step="0.01" value="${wind.strength}"></label>
        ${this.mode >= 8 ? `<details ${spatial ? 'open' : ''}><summary>Origin${spatial ? ' and reach' : ''}</summary>
          <div class="wind-origin"><label>X<input data-param="x" aria-label="${label} origin X" type="number" min="-82" max="82" step="0.1" value="${wind.x.toFixed(1)}"></label>
          <label>Z<input data-param="z" aria-label="${label} origin Z" type="number" min="-82" max="82" step="0.1" value="${wind.z.toFixed(1)}"></label></div>
          ${spatial ? `<label>Reach <output data-value="radius">${wind.radius.toFixed(0)} m</output><input data-param="radius" aria-label="${label} reach" type="range" min="2" max="80" step="1" value="${wind.radius}"></label>` : ''}
          <button type="button" data-action="place" aria-pressed="${this.placing === wind.id}">Place on ground</button>
          </details>` : ''}
        <div class="wind-row-actions"><button type="button" data-action="reverse">Reverse</button>${index ? '<button type="button" data-action="oppose">Oppose first</button>' : ''}<button type="button" data-action="remove">Remove</button></div>`;
      const select = row.querySelector('select');
      if (select) {
        select.value = wind.kind;
        select.onchange = () => { this.cancelPlacement();this.field.set(wind.id, { kind: select.value as WindKind });this.render();this.list.querySelectorAll('select')[index]?.focus(); };
      }
      row.querySelectorAll<HTMLInputElement>('input').forEach(input => {
        const param = input.dataset.param as 'heading' | 'strength' | 'radius' | 'x' | 'z';
        const edit = () => {
          if (!Number.isFinite(input.valueAsNumber)) return;
          this.field.set(wind.id, { [param]: input.valueAsNumber });describe();
          const output = row.querySelector<HTMLOutputElement>(`[data-value="${param}"]`);
          if (output) output.value = param === 'heading' ? `${input.value}°` : param === 'radius' ? `${input.value} m` : input.valueAsNumber.toFixed(2);
          if (param === 'x' || param === 'z') input.value = wind[param].toFixed(1);
        };
        if (input.type === 'number') input.onchange = edit;else input.oninput = edit;
      });
      row.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
        button.onclick = () => {
          if (button.dataset.action === 'place') {
            const cancel = this.placing === wind.id;this.cancelPlacement();
            if (!cancel) {
              this.placing = wind.id;button.setAttribute('aria-pressed', 'true');
              this.status.textContent = `Place ${label.toLowerCase()}: click the ground. Esc cancels.`;
              this.status.hidden = false;this.canvas.classList.add('placing-wind');
            }
            return;
          }
          this.cancelPlacement();
          if (button.dataset.action === 'remove') this.field.remove(wind.id);
          else if (button.dataset.action === 'oppose') this.field.oppose(wind.id);
          else this.field.reverse(wind.id);
          this.render();
          const entries = this.list.querySelectorAll<HTMLDetailsElement>('.wind-entry');
          const next = entries[Math.min(index, entries.length - 1)];
          const target = next?.querySelector<HTMLElement>(next.open ? `[data-action="${button.dataset.action}"]` : 'summary');
          (target ?? document.querySelector<HTMLButtonElement>('#wind-add')!).focus();
        };
      });
      entry.append(summary, row);this.list.append(entry);
    });
  }
}
