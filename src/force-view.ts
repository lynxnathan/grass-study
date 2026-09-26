// A view of the existing forces, independent of their simulation and renderer.
export class ForceView {
  enabled = true;
  wind = true;
  contact = true;
  readonly uniforms = {
    grassForceView: { value: 1 },
    grassWindHighlight: { value: 1 }, grassContactHighlight: { value: 1 },
  };

  update(dt: number) {
    for (const [uniform, goal] of [[this.uniforms.grassForceView, this.enabled],
      [this.uniforms.grassWindHighlight, this.wind], [this.uniforms.grassContactHighlight, this.contact]] as const) {
      const target = Number(goal);
      uniform.value += Math.sign(target-uniform.value)*Math.min(Math.abs(target-uniform.value), dt/(uniform === this.uniforms.grassForceView ? .45 : .3));
    }
  }

  snapshot() { return { enabled: this.enabled, weight: this.uniforms.grassForceView.value, wind: this.wind, contact: this.contact }; }
}

export class ForceViewControls {
  constructor(view: ForceView) {
    const master = document.querySelector<HTMLButtonElement>('#force-view-toggle')!;
    const wind = document.querySelector<HTMLButtonElement>('#wind-highlight')!;
    const contact = document.querySelector<HTMLButtonElement>('#contact-highlight')!;
    const sync = () => {
      master.setAttribute('aria-pressed', String(view.enabled));
      wind.setAttribute('aria-pressed', String(view.wind));
      contact.setAttribute('aria-pressed', String(view.contact));
    };
    const toggle = (channel: 'enabled' | 'wind' | 'contact') => {
      view[channel] = !view[channel];sync();
      const name = channel === 'enabled' ? 'Force view' : channel === 'wind' ? 'Wind highlights' : 'Contact tint';
      document.querySelector('#announcement')!.textContent = `${name} ${view[channel] ? 'on' : 'off'}.`;
    };
    master.onclick = () => toggle('enabled');wind.onclick = () => toggle('wind');contact.onclick = () => toggle('contact');
    window.addEventListener('keydown', event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'))) return;
      // Tab toggles the scene view. Shift+Tab enters the toolbar; inside the
      // interface, Tab retains normal keyboard focus navigation.
      if (event.code === 'Tab' && (target === document.body || target === document.querySelector('#world'))) {
        event.preventDefault();
        if (event.shiftKey) { master.focus();return; }
        if (!event.repeat) toggle('enabled');
      } else if (!event.repeat && !event.shiftKey && (event.code === 'KeyV' || event.code === 'KeyB')) {
        event.preventDefault();toggle(event.code === 'KeyV' ? 'wind' : 'contact');
      }
    });
    sync();
  }
}
