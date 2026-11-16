import { availableBlocks, normalizeSettings } from './catalog.js';
import { protectedLayer } from './editing.js';
import { generateFloor } from './generator.js';
import { paintMap } from './preview.js';
import { assetUrl } from './assets.js';
import { FULL_CROP, readReferenceImage, referencePattern, validCrop } from './reference.js';

export function openReferenceDialog({ settings, textures, icon, renderIcons, apply }) {
  const base = structuredClone(settings), dialog = document.createElement('dialog');
  dialog.id = 'reference-dialog'; dialog.setAttribute('aria-labelledby', 'reference-title');
  dialog.innerHTML = `
    <div class="dialog-heading"><div><h2 id="reference-title">Image to floor</h2><span class="reference-meta">Java ${base.version} &middot; ${base.tile} &times; ${base.tile} tile</span></div><button class="icon-button" id="reference-close" aria-label="Close image import">${icon('x')}</button></div>
    <div class="reference-upload"><button class="explore-button" id="reference-upload">${icon('image')}Choose image</button><span id="reference-file-name">PNG, JPEG or WebP &middot; up to 12 MB</span><input type="file" id="reference-file" accept="image/png,image/jpeg,image/webp" hidden></div>
    <fieldset class="reference-modes"><legend class="sr-only">Image mode</legend>
      <label><input type="radio" name="reference-mode" value="inspired" checked><span>Inspired by</span></label>
      <label><input type="radio" name="reference-mode" value="recreate"><span>Recreate</span></label>
      <label><input type="radio" name="reference-mode" value="palette"><span>Palette only</span></label>
    </fieldset>
    <div class="reference-previews">
      <section><div class="section-heading"><h3>Reference area</h3><button class="icon-button small" id="reference-reset" aria-label="Reset image crop" title="Reset image crop" disabled>${icon('rotate-ccw')}</button></div><canvas id="reference-source" width="640" height="480" tabindex="0" aria-label="Reference image crop" role="img"></canvas>
        <div class="reference-corners"><label for="reference-corner">Corner</label><select id="reference-corner" disabled><option value="0">Top left</option><option value="1">Top right</option><option value="2">Bottom right</option><option value="3">Bottom left</option></select><label>X %<input id="reference-x" type="number" min="0" max="100" step="0.5" disabled></label><label>Y %<input id="reference-y" type="number" min="0" max="100" step="0.5" disabled></label></div>
      </section>
      <section id="reference-result" aria-busy="false"><div class="section-heading"><h3>Floor preview</h3><button class="icon-button small" id="reference-variation" aria-label="New image-inspired variation" title="New image-inspired variation" disabled>${icon('shuffle')}</button></div><div class="reference-preview-wrap"><canvas id="reference-preview" width="400" height="400" aria-label="Image-derived floor preview"></canvas><div id="reference-working" hidden><span class="reference-spinner"></span><span>Preparing preview</span></div></div><div id="reference-swatches" class="reference-swatches"></div><output id="reference-output" class="reference-meta">${base.width} &times; ${base.depth} blocks &middot; repeating tile</output></section>
    </div>
    <p id="reference-error" role="alert"></p>
    <div class="reference-footer"><span class="reference-meta">Local processing &middot; image stays on this device</span><div><button id="reference-cancel" class="text-button">Cancel</button><button id="reference-apply" class="primary-button" disabled>${icon('check')}Apply to floor</button></div></div>`;
  document.body.append(dialog); renderIcons();
  const $ = id => dialog.querySelector(`#reference-${id}`);
  let image, candidate, corners = structuredClone(FULL_CROP), selected = 0, epoch = 0, timer, drag = false;
  let seed = String(crypto.getRandomValues(new Uint32Array(1))[0]);
  const mode = () => dialog.querySelector('[name="reference-mode"]:checked').value;
  const source = $('source'), context = source.getContext('2d');
  const frame = () => {
    const scale = image ? Math.min(592 / image.canvas.width, 432 / image.canvas.height) : 1;
    const width = image ? image.canvas.width * scale : 592, height = image ? image.canvas.height * scale : 432;
    return { x: (640 - width) / 2, y: (480 - height) / 2, width, height };
  };
  function drawSource() {
    context.fillStyle = '#181b1e'; context.fillRect(0, 0, 640, 480);
    if (!image) return;
    const f = frame(); context.drawImage(image.canvas, f.x, f.y, f.width, f.height);
    const positions = corners.map(([x, y]) => [f.x + x * f.width, f.y + y * f.height]);
    context.beginPath(); positions.forEach(([x, y], i) => i ? context.lineTo(x, y) : context.moveTo(x, y)); context.closePath();
    context.strokeStyle = validCrop(corners) ? '#88d4b6' : '#ff8b81'; context.lineWidth = 3; context.stroke();
    positions.forEach(([x, y], i) => {
      context.beginPath(); context.arc(x, y, i === selected ? 13 : 10, 0, Math.PI * 2); context.fillStyle = i === selected ? '#88d4b6' : '#ffffff'; context.fill();
      context.fillStyle = '#111111'; context.font = 'bold 14px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(String(i + 1), x, y);
    });
    $('corner').value = selected; $('x').value = Math.round(corners[selected][0] * 1000) / 10; $('y').value = Math.round(corners[selected][1] * 1000) / 10;
  }
  function busy(value) { $('working').hidden = !value; $('result').setAttribute('aria-busy', String(value)); }
  function schedule() {
    clearTimeout(timer); candidate = null; $('apply').disabled = true; $('error').textContent = '';
    const inspired = mode() === 'inspired'; $('variation').hidden = !inspired; $('variation').disabled = !image;
    if (!image) return;
    busy(true);
    timer = setTimeout(() => {
      try {
        const result = referencePattern(image.pixels, corners, { mode: mode(), size: base.tile, seed, candidates: availableBlocks(base.version, base.allowedBlocks) });
        candidate = normalizeSettings({ ...base, materials: mode() === 'palette' ? result.materials.slice(0, base.materials.length) : result.materials,
          ...(mode() === 'palette' ? {} : { pattern: 'reference', reference: result.reference, raised: false, editLayer: protectedLayer(base.editLayer) }),
        });
        const floor = generateFloor(candidate), canvas = $('preview'), ctx = canvas.getContext('2d');
        const map = paintMap(floor, textures, Math.min(4, Math.floor(2048 / Math.max(floor.width, floor.depth)))), scale = Math.min(400 / map.width, 400 / map.height);
        ctx.fillStyle = '#181b1e'; ctx.fillRect(0, 0, 400, 400); ctx.imageSmoothingEnabled = false;
        ctx.drawImage(map, (400 - map.width * scale) / 2, (400 - map.height * scale) / 2, map.width * scale, map.height * scale);
        $('swatches').replaceChildren(...candidate.materials.map(id => {
          const b = availableBlocks(base.version, base.allowedBlocks).find(block => block.id === id), img = document.createElement('img');
          img.src = assetUrl(b.texture); img.alt = b.name; img.title = b.name; return img;
        }));
        $('output').textContent = mode() === 'palette' ? `${base.width} x ${base.depth} blocks / geometry unchanged` : `${base.width} x ${base.depth} blocks / ${base.tile} x ${base.tile} repeating tile`;
        $('apply').disabled = false;
      } catch (error) { $('error').textContent = error.message; candidate = null; }
      finally { busy(false); }
    }, 120);
  }
  async function load(file) {
    const current = ++epoch;
    clearTimeout(timer); image = null; candidate = null; $('apply').disabled = true; $('error').textContent = ''; busy(true);
    for (const id of ['reset', 'corner', 'x', 'y', 'variation']) $(id).disabled = true;
    drawSource(); $('preview').getContext('2d').clearRect(0, 0, 400, 400); $('swatches').replaceChildren();
    try {
      const decoded = await readReferenceImage(file);
      if (epoch !== current || !dialog.open) return;
      image = decoded; corners = structuredClone(FULL_CROP); selected = 0;
      $('file-name').textContent = file.name;
      for (const id of ['reset', 'corner', 'x', 'y', 'variation']) $(id).disabled = false;
      drawSource(); schedule();
    } catch (error) { if (epoch === current && dialog.open) { $('error').textContent = error.message; busy(false); } }
  }
  $('upload').onclick = () => $('file').click();
  $('file').onchange = event => { const file = event.target.files?.[0]; if (file) load(file); event.target.value = ''; };
  dialog.querySelectorAll('[name="reference-mode"]').forEach(input => input.onchange = schedule);
  $('variation').onclick = () => { seed = String(crypto.getRandomValues(new Uint32Array(1))[0]); schedule(); };
  $('reset').onclick = () => { corners = structuredClone(FULL_CROP); drawSource(); schedule(); };
  $('corner').onchange = event => { selected = Number(event.target.value); drawSource(); };
  for (const [id, axis] of [['x', 0], ['y', 1]]) $(id).onchange = event => {
    const value = Number(event.target.value);
    if (Number.isFinite(value)) corners[selected][axis] = Math.min(1, Math.max(0, value / 100));
    drawSource(); schedule();
  };
  function position(event) {
    const rect = source.getBoundingClientRect(), f = frame();
    return [((event.clientX - rect.left) * 640 / rect.width - f.x) / f.width, ((event.clientY - rect.top) * 480 / rect.height - f.y) / f.height];
  }
  source.onpointerdown = event => {
    if (!image || event.button !== 0) return;
    event.preventDefault(); source.focus(); const p = position(event);
    selected = corners.reduce((best, corner, i) => Math.hypot(corner[0] - p[0], corner[1] - p[1]) < Math.hypot(corners[best][0] - p[0], corners[best][1] - p[1]) ? i : best, 0);
    drag = true; source.setPointerCapture(event.pointerId); drawSource();
  };
  source.onpointermove = event => { if (drag) { corners[selected] = position(event).map(v => Math.max(0, Math.min(1, v))); drawSource(); schedule(); } };
  source.onpointerup = source.onpointercancel = event => { drag = false; if (source.hasPointerCapture(event.pointerId)) source.releasePointerCapture(event.pointerId); };
  source.onlostpointercapture = () => { drag = false; };
  source.onkeydown = event => {
    if (!image || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); const axis = ['ArrowLeft', 'ArrowRight'].includes(event.key) ? 0 : 1, direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
    corners[selected][axis] = Math.max(0, Math.min(1, corners[selected][axis] + direction * (event.shiftKey ? .05 : .005)));
    drawSource(); schedule();
  };
  $('close').onclick = $('cancel').onclick = () => dialog.close();
  $('apply').onclick = () => { if (!candidate) return; apply(candidate); dialog.close(); };
  dialog.addEventListener('close', () => { epoch++; clearTimeout(timer); image = candidate = null; dialog.remove(); document.getElementById('reference-open')?.focus(); }, { once: true });
  drawSource(); dialog.showModal();
}
