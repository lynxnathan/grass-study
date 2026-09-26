function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || target.matches('input, textarea, select'));
}

export class Input {
  keys = new Set<string>();
  touchRunning = false;
  private activePointers = new Map<number, string>();

  constructor(private canvas: HTMLCanvasElement) {
    const interrupt = () => {
      this.clear();canvas.dispatchEvent(new Event('inputinterrupted'));
    };
    canvas.addEventListener('pointercancel', interrupt);
    canvas.addEventListener('lostpointercapture', event => {
      if (event.buttons === 0) return;
      // Let the camera's same-event capture recovery run before judging loss.
      setTimeout(() => { if (!canvas.hasPointerCapture(event.pointerId)) interrupt(); }, 0);
    });
    window.addEventListener('keydown', (event) => {
      if (isEditable(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
        event.preventDefault();
        // A held key repeating after focus loss must not revive cleared input.
        if (event.repeat && !this.keys.has(event.code)) return;
        this.keys.add(event.code);
      }
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    document.addEventListener('focusin', event => { if (isEditable(event.target)) this.clear(); });
    window.addEventListener('blur', interrupt);
    document.addEventListener('visibilitychange', () => { if (document.hidden) interrupt(); });
    document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button => {
      button.addEventListener('pointerdown', event => {
        event.preventDefault();const key = button.dataset.key!;
        button.setPointerCapture(event.pointerId);this.activePointers.set(event.pointerId, key);this.keys.add(key);
      });
      const release = (event: PointerEvent) => {
        const key = this.activePointers.get(event.pointerId);
        this.activePointers.delete(event.pointerId);
        if (key && ![...this.activePointers.values()].includes(key)) this.keys.delete(key);
      };
      button.addEventListener('pointerup', release);button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });
    const run = document.querySelector<HTMLButtonElement>('#touch-run')!;
    run.addEventListener('click', () => {
      this.touchRunning = !this.touchRunning;run.setAttribute('aria-pressed', String(this.touchRunning));
    });
  }

  clear() { this.keys.clear(); this.activePointers.clear(); }
  focus() { this.canvas.focus({ preventScroll: true }); }
  get running() { return this.touchRunning || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
  get axis() {
    const has = (...keys: string[]) => keys.some(key => this.keys.has(key)) ? 1 : 0;
    return { x: has('KeyD', 'ArrowRight') - has('KeyA', 'ArrowLeft'),
      z: has('KeyW', 'ArrowUp') - has('KeyS', 'ArrowDown') };
  }
}
