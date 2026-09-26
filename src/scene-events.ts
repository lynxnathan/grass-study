export function containSceneEvents(canvas: HTMLCanvasElement) {
  const app = canvas.closest('#app')!;
  app.addEventListener('contextmenu', event => event.preventDefault(), { capture: true });
  app.addEventListener('keydown', event => {
    const key = event as KeyboardEvent;
    if (key.code === 'ContextMenu' || (key.code === 'F10' && key.shiftKey)) event.preventDefault();
  }, { capture: true });
  const contain = (event: Event) => {
    if (event instanceof WheelEvent && event.ctrlKey) return;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
  };
  // Cancelling pointerdown does not cancel click/auxclick/contextmenu or every
  // compatibility mouse event. Keep each event on the scene's own target.
  for (const type of [
    'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
    'mousedown', 'mousemove', 'mouseup', 'click', 'auxclick', 'dblclick',
    'contextmenu', 'dragstart', 'selectstart', 'wheel',
  ]) canvas.addEventListener(type, contain, { passive: false });
}
