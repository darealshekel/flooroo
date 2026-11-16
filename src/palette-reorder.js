export function bindPaletteReorder(element, onMove) {
  let drag = null, suppressClick = false;
  const buttons = () => [...element.querySelectorAll('[data-role]')];

  function clearTarget() {
    buttons().forEach(button => button.classList.remove('palette-drop-before', 'palette-drop-after'));
  }

  function cancel() {
    if (!drag) return;
    const previous = drag;
    drag = null;
    if (previous.ghost) suppressClick = true;
    previous.ghost?.remove();
    previous.button.classList.remove('palette-drag-source');
    element.classList.remove('palette-dragging');
    clearTarget();
    if (element.hasPointerCapture(previous.pointerId)) element.releasePointerCapture(previous.pointerId);
    if (previous.button.hasPointerCapture(previous.pointerId)) previous.button.releasePointerCapture(previous.pointerId);
  }

  function targetAt(x, y) {
    const bounds = element.getBoundingClientRect();
    if (x < bounds.left || x > bounds.right || y < bounds.top - 12 || y > bounds.bottom + 12) return -1;
    return buttons().reduce((nearest, button, index, all) => {
      const distance = item => { const r = item.getBoundingClientRect(); return Math.hypot(x - r.left - r.width / 2, y - r.top - r.height / 2); };
      return distance(button) < distance(all[nearest]) ? index : nearest;
    }, 0);
  }

  element.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    cancel(); suppressClick = false;
    const button = event.target.closest('[data-role]');
    if (!button) return;
    drag = { button, from: Number(button.dataset.role), pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    button.setPointerCapture(event.pointerId);
  });
  element.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.ghost) {
      const dx = Math.abs(event.clientX - drag.x), dy = Math.abs(event.clientY - drag.y);
      if (Math.max(dx, dy) < 6) return;
      const rect = drag.button.getBoundingClientRect();
      drag.size = rect.width;
      drag.ghost = drag.button.querySelector('img').cloneNode();
      drag.ghost.className = 'palette-drag-ghost';
      drag.ghost.style.width = `${drag.size}px`;
      drag.ghost.style.height = `${rect.height}px`;
      drag.ghost.setAttribute('aria-hidden', 'true');
      document.body.append(drag.ghost);
      drag.button.classList.add('palette-drag-source');
      element.classList.add('palette-dragging');
      element.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    drag.ghost.style.transform = `translate(${event.clientX - drag.size / 2}px, ${event.clientY - drag.size / 2}px)`;
    clearTarget();
    const to = targetAt(event.clientX, event.clientY);
    if (to >= 0 && to !== drag.from) buttons()[to].classList.add(to < drag.from ? 'palette-drop-before' : 'palette-drop-after');
  });
  element.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { from, ghost } = drag;
    const to = targetAt(event.clientX, event.clientY);
    cancel();
    if (ghost && to >= 0 && to !== from) onMove(from, to);
  });
  element.addEventListener('pointercancel', event => { if (event.pointerId === drag?.pointerId) cancel(); });
  // Touch starts with implicit capture on the image; transferring it is not cancellation.
  element.addEventListener('lostpointercapture', event => { if (event.target === element && event.pointerId === drag?.pointerId) cancel(); });
  element.addEventListener('dragstart', event => event.preventDefault());
  element.addEventListener('click', event => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault(); event.stopImmediatePropagation();
  }, true);
  element.addEventListener('keydown', event => {
    if (drag) return;
    suppressClick = false;
    const button = event.target.closest('[data-role]');
    if (!button || !event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const from = Number(button.dataset.role), to = from + (event.key === 'ArrowLeft' ? -1 : 1);
    if (to >= 0 && to < buttons().length) onMove(from, to);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drag) { event.preventDefault(); cancel(); }
  });
  window.addEventListener('blur', cancel);
  window.addEventListener('resize', cancel);
  return cancel;
}
