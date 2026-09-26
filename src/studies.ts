import { StudyNarration } from './narration';

export const studies = [
  {
    id: 'ground', number: '00', title: 'The ground beneath',
    subtitle: 'Terrain · a common starting point', guide: '#study-next',
    description: 'Walk the hills with WASD and follow the path. Bare ground shows the surface; the right-hand arrow brings the first grass silhouettes.',
    cost: 'Bare terrain · no grass geometry', mode: 0,
  },
  {
    id: 'billboards', number: '01', title: 'The first blades',
    subtitle: 'Static billboards · camera-facing cutouts',
    description: 'A handful of painted blades becomes a tuft. Hold the right mouse button and drag to look around it: the upright card turns with the camera, keeping its face in view.',
    cost: '2 triangles per tuft · 1 instanced grass draw', mode: 1,
  },
  {
    id: 'crossed-cards', number: '02', title: 'A little volume',
    subtitle: 'Crossed cards · fixed in the world',
    description: 'Two cutouts cross at the root. Hold the right mouse button and drag around a tuft: a second face holds the silhouette when the first turns edge-on.',
    cost: '4 triangles per tuft · more overlapping pixels', mode: 2,
  },
  {
    id: 'sway', number: '03', title: 'The first breath',
    subtitle: 'Simple sway · anchored roots',
    description: 'The tips lean while the roots stay planted. One shared rhythm sets the field in motion; watch how quickly that rhythm becomes visible.',
    cost: 'Same cards · vertex motion on the GPU', mode: 3,
  },
  {
    id: 'gusts', number: '04', title: 'Winds, plural',
    subtitle: 'Traveling gusts · two crossing flows', guide: '#wind-toggle',
    description: 'Broad gusts travel across the hills while a smaller crosswind interrupts them. Open Winds at the bottom right to turn either flow. Watch a wave arrive, pass through, and leave.',
    cost: 'Same geometry · spatial noise at two scales', mode: 4,
  },
  {
    id: 'blades', number: '05', title: 'Every blade a shape',
    subtitle: 'Curved geometry · light and silhouette',
    description: 'Each blade tapers and bends along its length. Scroll to move closer; hold the right mouse button and drag to look around. Light follows the changing surface.',
    cost: '7 triangles per blade · shaded geometry', mode: 5,
  },
  {
    id: 'contact', number: '06', title: 'Leave a wake',
    subtitle: 'Contact · spring recovery',
    description: 'Step off the path. Reacting blades turn blue with bright cyan edges; stronger bends deepen the blue. Shape and color settle together. Hold and drag left mouse to brush the field.',
    cost: 'Shared displacement field · damped springs', mode: 6,
  },
  {
    id: 'ghost', number: '07', title: 'A field in motion',
    subtitle: 'Inspired by Ghost of Tsushima',
    description: 'Watch blue waves cross the hills. Hold the left mouse button and drag through the grass. Orange marks your touch as wind and contact combine to bend each blade.',
    cost: '1–15 triangles per blade · distance-based density', mode: 7,
  },
  {
    id: 'wind-vectors', number: '08', title: 'Where winds meet',
    subtitle: 'Many vectors · one living field', guide: '#wind-toggle',
    description: 'Open Winds at the bottom right and choose Add vortex. Choose Place on ground, then click the field to give it a center. Reverse its spin or add another wind; each blade feels their combined pull at its own position.',
    cost: 'Direct and sampled wind · gradual handoff', mode: 8,
  },
  {
    id: 'rain', number: '09', title: 'When the rain arrives',
    subtitle: 'Water on a surface · light after rain', guide: '#weather-toggle',
    description: 'Rain crosses the field. The path darkens and a thin sheen follows the blades. Open Weather to let evening arrive, or stop the rain: the surface takes longer to forget the water than the sky does.',
    cost: 'Instanced rain · roughness and clearcoat · gradual wetting and drying', mode: 9,
  },
  {
    id: 'woven-ground', number: '10', title: 'A woven ground',
    subtitle: 'A surface full of smaller things', guide: '#cover-toggle',
    description: 'Between the tall blades, a finer weave covers the earth. Open Layers and hide the tall blades. The small marks catch the light, but look along a hill: the silhouette still belongs to the ground.',
    cost: 'Surface color and normal detail · no raised turf geometry', mode: 10,
  },
  {
    id: 'short-tufts', number: '11', title: 'Small shapes, many strands',
    subtitle: 'Short tufts · shapes and cutouts', guide: '#cover-toggle',
    description: 'Short growth rises between the taller stems. Open Layers to change solid blades into painted clusters. Circle them, brush through them, and look at their edges: the same patch can be built from very different work.',
    cost: 'Instanced tufts · opaque triangles or crossed cutouts · shared contact', mode: 11,
  },
  {
    id: 'shell-turf', number: '12', title: 'A little depth everywhere',
    subtitle: 'Shells and fins · slices of a living volume', guide: '#cover-toggle',
    description: 'Thin layers stack above the earth. Open Layers and separate them to see the slices hiding inside the turf. Bring them together, then look low across a hill: upright fins help hold the edges.',
    cost: '4–24 textured shells · grazing-angle fins · repeated pixel work', mode: 12,
  },
  {
    id: 'implicit-turf', number: '13', title: 'Through the grass',
    subtitle: 'Implicit slices · depth inside a pixel', guide: '#cover-toggle',
    description: 'A pixel looks through the turf, collecting strands until its view fills. Open Layers to reveal how many samples it visits. Brush the field: the same contact moves grass that is now being found inside the shader.',
    cost: 'Bounded volume sampling · early opacity exit · local depth reconstruction', mode: 13,
  },
] as const;

type Study = typeof studies[number];

// The presentation changes the technique inside one persistent scene.
export class StudyPresentation {
  private narration = new StudyNarration();
  private index = 0;
  private requested = this.index;
  private enabled = false;
  private changing = false;
  private previous = document.querySelector<HTMLButtonElement>('#study-previous')!;
  private next = document.querySelector<HTMLButtonElement>('#study-next')!;
  private app = document.querySelector<HTMLElement>('#app')!;
  private coverage = 1;
  private fadeState: { from: number; to: number; start: number; finish: () => void } | null = null;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private apply: (study: Study) => void, private setCoverage: (value: number) => void) {
    const number = new URL(location.href).searchParams.get('s');
    const linked = number !== null && /^\d+$/.test(number)
      ? studies.findIndex(study => Number(study.number) === Number(number)) : -1;
    this.index = this.requested = linked === -1 ? 0 : linked;
    this.previous.onclick = () => this.move(-1);
    this.next.onclick = () => this.move(1);
    window.addEventListener('keydown', event => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement &&
        (event.target.isContentEditable || event.target.matches('input, textarea, select'))) return;
      if (['PageUp', 'KeyH', 'PageDown', 'KeyL'].includes(event.code)) {
        event.preventDefault();this.move(event.code === 'PageUp' || event.code === 'KeyH' ? -1 : 1);
      } else if (/^[0-9]$/.test(event.key)) {
        const index = studies.findIndex(study => Number(study.number) === Number(event.key));
        if (index !== -1) { event.preventDefault();this.select(index); }
      }
    });
    this.show();this.app.dataset.transition = 'idle';
  }

  get current() { return studies[this.index]; }

  setEnabled(enabled: boolean) { this.enabled = enabled;this.syncButtons();this.narration.setEnabled(enabled); }

  private syncButtons() {
    this.previous.disabled = this.next.disabled = !this.enabled;
    this.previous.setAttribute('aria-disabled', String(!this.enabled || this.requested === 0));
    this.next.setAttribute('aria-disabled', String(!this.enabled || this.requested === studies.length - 1));
  }

  private show() {
    const study = this.current;
    this.apply(study);
    const write = (selector: string, value: string) => { document.querySelector(selector)!.textContent = value; };
    write('#study-number', study.number);write('#study-title', study.title);
    write('#study-subtitle', study.subtitle);this.narration.setStudy(study);
    write('#study-progress', `${this.index + 1} / ${studies.length}`);
    document.title = `Grass, not what you think — ${study.title}`;
    this.app.dataset.study = study.id;
    const url = new URL(location.href);
    if (this.index !== 0 || url.searchParams.has('s')) {
      url.searchParams.set('s', String(Number(study.number)));
      history.replaceState(history.state, '', url);
    }
    this.syncButtons();
  }

  private move(direction: number) {
    this.select(this.requested + direction);
  }

  private select(index: number) {
    if (!this.enabled) return;
    this.requested = Math.max(0, Math.min(studies.length - 1, index));
    this.syncButtons();
    if (this.requested !== this.index) this.narration.close();
    if (!this.changing && this.requested !== this.index) void this.transition();
  }

  update(now: number) {
    this.narration.update(now);
    const fade = this.fadeState;
    if (!fade) return;
    const t = Math.max(0, Math.min(1, (now - fade.start) / 180));
    this.coverage = fade.from + (fade.to - fade.from) * t * t * (3 - 2 * t);
    this.setCoverage(this.coverage);
    if (t === 1) { this.fadeState = null;fade.finish(); }
  }

  private async fade(coverage: number) {
    if (this.reducedMotion.matches) {
      this.coverage = coverage;this.setCoverage(coverage);return;
    }
    await new Promise<void>(finish => {
      this.fadeState = { from: this.coverage, to: coverage, start: performance.now(), finish };
    });
  }

  private async transition() {
    this.changing = true;
    while (this.index !== this.requested && this.enabled) {
      this.app.dataset.transition = 'out';
      await this.fade(0);
      if (this.enabled) { this.index = this.requested;this.show(); }
      this.app.dataset.transition = 'in';
      await this.fade(1);
    }
    this.changing = false;this.app.dataset.transition = 'idle';
    document.querySelector('#announcement')!.textContent = `Study ${this.current.number}. ${this.current.title}.`;
  }
}
