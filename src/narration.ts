type Passage = { number: string; title: string; description: string; cost: string; guide?: string };

// Reader-controlled presentation. The scene's existing frame loop advances the
// letters; there are no queued timers that can outlive a change of study.
export class StudyNarration {
  private panel = document.querySelector<HTMLElement>('#study-caption')!;
  private toggle = document.querySelector<HTMLButtonElement>('#passage-toggle')!;
  private advance = document.querySelector<HTMLButtonElement>('#passage-advance')!;
  private copy = document.querySelector<HTMLElement>('#study-copy')!;
  private controls = document.querySelector<HTMLElement>('#controls-help')!;
  private controlsToggle = document.querySelector<HTMLButtonElement>('#controls-toggle')!;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private letters: { element: HTMLSpanElement; at: number }[] = [];
  private revealed = 0;
  private started = 0;
  private complete = false;
  private enabled = false;
  private guide: HTMLElement | null = null;

  constructor() {
    this.toggle.onclick = () => this.panel.hidden ? this.open() : this.close();
    this.advance.onclick = () => this.complete ? this.close() : this.finish();
    document.querySelector<HTMLButtonElement>('#passage-close')!.onclick = () => this.close();
    document.querySelector('#weather-toggle')!.addEventListener('click', () => { this.close();this.closeControls(); });
    document.querySelector('#wind-toggle')!.addEventListener('click', () => {
      this.close();this.closeControls();
    });
    document.addEventListener('coveropened', () => { this.close();this.closeControls(); });
    this.controlsToggle.onclick = () => {
      this.close();this.controls.hidden = !this.controls.hidden;
      this.controlsToggle.setAttribute('aria-expanded', String(!this.controls.hidden));
      if (!this.controls.hidden) document.dispatchEvent(new Event('controlsopened'));
    };
    this.reducedMotion.addEventListener('change', () => { if (this.reducedMotion.matches && !this.panel.hidden) this.finish(); });
    window.addEventListener('keydown', event => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.matches('input,textarea,select'))) return;
      if (event.code === 'KeyR') { event.preventDefault();this.panel.hidden ? this.open() : this.close(); }
      else if (event.code === 'Escape') {
        this.close();this.closeControls();
      } else if (event.code === 'Enter' && !this.panel.hidden &&
        (event.target === document.body || event.target === document.querySelector('#world'))) {
        event.preventDefault();this.complete ? this.close() : this.finish();
      }
    });
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;this.toggle.disabled = !enabled;
    if (enabled) this.open();else this.close();
  }

  setStudy(study: Passage) {
    this.guide?.classList.remove('passage-guide');
    this.guide = study.guide ? document.querySelector<HTMLElement>(study.guide) : null;
    document.querySelector('#passage-title')!.textContent = study.title;
    document.querySelector('#passage-number')!.textContent = study.number;
    // Assistive technology receives the complete sentence, never letter-by-letter updates.
    document.querySelector('#study-description')!.textContent = study.description;
    document.querySelector('#study-cost')!.textContent = study.cost;
    document.querySelector<HTMLDetailsElement>('#passage-details')!.open = false;
    let at = 440;
    this.letters = Array.from(study.description, letter => {
      const element = document.createElement('span');element.className = 'passage-letter';element.textContent = letter;
      const entry = { element, at };
      at += /[.!?]/.test(letter) ? 180 : /[,;:]/.test(letter) ? 85 : /\s/.test(letter) ? 12 : 23;
      return entry;
    });
    this.copy.replaceChildren(...this.letters.map(letter => letter.element));
    this.revealed = 0;this.complete = false;
    if (this.enabled) this.open();
  }

  open() {
    if (!this.enabled) return;
    this.closeControls();
    document.dispatchEvent(new Event('readingopened'));
    this.panel.hidden = false;this.guide?.classList.add('passage-guide');this.toggle.setAttribute('aria-expanded', 'true');
    this.panel.dataset.reading = this.complete ? 'complete' : 'revealing';
    this.advance.textContent = this.complete ? 'Into the field →' : 'Show all';
    this.started = performance.now() - (this.letters[this.revealed]?.at ?? 0) + (this.revealed ? 0 : 440);
    if (this.reducedMotion.matches) this.finish();
  }

  close() {
    const heldFocus = this.panel.contains(document.activeElement);
    this.panel.hidden = true;this.guide?.classList.remove('passage-guide');this.toggle.setAttribute('aria-expanded', 'false');
    if (heldFocus) document.querySelector<HTMLCanvasElement>('#world')!.focus({ preventScroll: true });
  }

  private closeControls() {
    this.controls.hidden = true;this.controlsToggle.setAttribute('aria-expanded', 'false');
  }

  private finish() {
    for (; this.revealed < this.letters.length; this.revealed++) this.letters[this.revealed].element.classList.add('revealed');
    this.complete = true;this.panel.dataset.reading = 'complete';this.advance.textContent = 'Into the field →';
  }

  update(now: number) {
    if (this.panel.hidden || this.complete) return;
    while (this.revealed < this.letters.length && now - this.started >= this.letters[this.revealed].at) {
      this.letters[this.revealed++].element.classList.add('revealed');
    }
    if (this.revealed === this.letters.length) this.finish();
  }
}
