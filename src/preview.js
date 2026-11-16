import { BLOCKS, BY_ID } from './catalog.js';
import { isProtected, brushIndices } from './editing.js';
import { assetUrl } from './assets.js';

export async function loadTextures() {
  const textures = {};
  const paths = new Set(BLOCKS.flatMap(block => [block.texture, ...(block.faces || [])]));
  await Promise.all([...paths].map(async path => {
    const image = new Image();
    image.src = assetUrl(path);
    await image.decode();
    textures[path] = image;
  }));
  for (const block of BLOCKS) textures[block.id] = textures[block.texture];
  return textures;
}

export function paintMap(data, textures, size = 8, showHeight = false) {
  const canvas = document.createElement('canvas');
  canvas.width = data.width * size; canvas.height = data.depth * size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let z = 0; z < data.depth; z++) for (let x = 0; x < data.width; x++) {
    const i = z * data.width + x, id = data.materials[data.cells[i]];
    const image = textures[id];
    if (image) ctx.drawImage(image, 0, 0, image.width, image.width, x * size, z * size, size, size);
    else { ctx.fillStyle = BY_ID[id].color; ctx.fillRect(x * size, z * size, size, size); }
    if (BY_ID[id].shape === 'stairs') {
      ctx.fillStyle = '#00000030'; ctx.fillRect(x * size, (z + .5) * size, size, size / 2);
    }
    if (showHeight && data.heights?.[i] > 1) {
      ctx.fillStyle = '#ffffff35'; ctx.fillRect(x * size, z * size, size, 1);
      ctx.fillStyle = '#00000045'; ctx.fillRect(x * size, (z + 1) * size - 1, size, 1);
    }
  }
  return canvas;
}

export class FlatPreview {
  constructor(canvas, onHover, onZoom, onEdit = () => {}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.onHover = onHover; this.onZoom = onZoom; this.zoom = 1; this.pan = { x: 0, y: 0 };
    this.grid = false;
    this.editor = { tool: 'pan', brush: 1, mirror: 'none' }; this.onEdit = onEdit;
    this.resize = new ResizeObserver(() => this.draw()); this.resize.observe(canvas.parentElement);
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.setZoom(this.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
    canvas.addEventListener('pointerdown', e => {
      if (this.activePointer !== undefined || e.button > 1) return;
      canvas.focus({ preventScroll: true }); this.activePointer = e.pointerId; canvas.setPointerCapture(e.pointerId);
      const point = this.hit(e);
      if (this.editor.tool !== 'pan' && !e.altKey && e.button === 0 && point) {
        this.strokeStart = point; this.cursor = point; this.onEdit('start', point);
      } else { this.drag = { x: e.clientX, y: e.clientY }; canvas.classList.add('dragging'); }
    });
    const finish = (e, cancel = false) => {
      if (this.activePointer !== e.pointerId) return;
      if (this.strokeStart) this.onEdit(cancel ? 'cancel' : 'end', this.hit(e) || this.cursor);
      this.strokeStart = null; this.drag = null; this.activePointer = undefined;
      canvas.classList.remove('dragging');
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      this.draw();
    };
    canvas.addEventListener('pointerup', e => finish(e));
    canvas.addEventListener('pointercancel', e => finish(e, true));
    canvas.addEventListener('lostpointercapture', e => finish(e, true));
    canvas.addEventListener('pointermove', e => {
      if (this.activePointer !== undefined && this.activePointer !== e.pointerId) return;
      if (this.drag) { this.pan.x += e.clientX - this.drag.x; this.pan.y += e.clientY - this.drag.y; this.drag = { x: e.clientX, y: e.clientY }; this.draw(); }
      const point = this.hit(e); this.cursor = point;
      if (this.strokeStart && point) this.onEdit('move', point);
      this.onHover(point ? { ...point, id: this.data.materials[this.data.cells[point.z * this.data.width + point.x]] } : null);
      if (this.editor.tool !== 'pan') this.draw();
    });
    canvas.addEventListener('pointerleave', () => { this.onHover(null); if (!this.strokeStart) { this.cursor = null; this.draw(); } });
    canvas.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.strokeStart) { this.onEdit('cancel'); this.strokeStart = null; this.activePointer = undefined; this.draw(); }
      if (this.editor.tool === 'pan') return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
        this.cursor ||= { x: Math.floor(this.data.width / 2), z: Math.floor(this.data.depth / 2) };
        const c = this.cursor;
        if (e.key === ' ') { this.onEdit('start', c); this.onEdit('end', c); }
        else { c.x = Math.max(0, Math.min(this.data.width - 1, c.x + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0))); c.z = Math.max(0, Math.min(this.data.depth - 1, c.z + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0))); }
        this.draw();
      }
    });
  }
  hit(e) {
    if (!this.layout || !this.data) return null;
    const rect = this.canvas.getBoundingClientRect(), { x, y, bw } = this.layout;
    const bx = Math.floor((e.clientX - rect.left - x) / bw), bz = Math.floor((e.clientY - rect.top - y) / bw);
    return bx >= 0 && bz >= 0 && bx < this.data.width && bz < this.data.depth ? { x: bx, z: bz } : null;
  }
  update(data, textures) {
    // Bound the backing canvas for large floors; block data and exports remain exact.
    const pixelsPerBlock = Math.max(1, Math.min(8, Math.floor(4096 / Math.max(data.width, data.depth))));
    this.data = data; this.map = paintMap(data, textures, pixelsPerBlock, true);
    this.mask = document.createElement('canvas'); this.mask.width = data.width; this.mask.height = data.depth;
    if (data.width === data.settings.tile && data.depth === data.settings.tile) {
      const ctx = this.mask.getContext('2d'); ctx.fillStyle = '#57e6c955';
      data.settings.editLayer.cells.forEach((code, i) => { if (isProtected(code)) ctx.fillRect(i % data.width, Math.floor(i / data.width), 1, 1); });
    }
    this.draw();
  }
  setZoom(value) { this.zoom = Math.min(12, Math.max(.5, value)); this.draw(); this.onZoom(this.zoom); }
  fit() { this.pan = { x: 0, y: 0 }; this.setZoom(1); }
  draw() {
    if (!this.map) return;
    const { width: w, height: h } = this.canvas.parentElement.getBoundingClientRect();
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio, 2);
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    const ctx = this.ctx; ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h); ctx.imageSmoothingEnabled = false;
    const bw = Math.min((w - 100) / this.data.width, (h - 100) / this.data.depth) * this.zoom;
    const pw = this.data.width * bw, ph = this.data.depth * bw;
    const x = (w - pw) / 2 + this.pan.x, y = (h - ph) / 2 + this.pan.y;
    this.layout = { x, y, bw };
    ctx.shadowColor = '#00000070'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 12;
    ctx.drawImage(this.map, x, y, pw, ph); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    if (this.showProtected) ctx.drawImage(this.mask, x, y, pw, ph);
    if (this.grid) {
      ctx.beginPath();
      const step = bw > 9 ? 1 : this.data.settings.tile;
      for (let i = 0; i <= this.data.width; i += step) { ctx.moveTo(x + i * bw, y); ctx.lineTo(x + i * bw, y + ph); }
      for (let i = 0; i <= this.data.depth; i += step) { ctx.moveTo(x, y + i * bw); ctx.lineTo(x + pw, y + i * bw); }
      ctx.strokeStyle = step === 1 ? '#ffffff25' : '#ffffff80'; ctx.lineWidth = .7; ctx.stroke();
    }
    ctx.strokeStyle = '#ffffff28'; ctx.lineWidth = 1; ctx.strokeRect(x - .5, y - .5, pw + 1, ph + 1);
    if (this.editor.tool !== 'pan') {
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, pw, ph); ctx.clip();
      if (this.editor.mirror !== 'none') {
        const ex = this.editor.axisX ?? (this.data.width - 1) / 2, ez = this.editor.axisZ ?? (this.data.depth - 1) / 2;
        ctx.strokeStyle = '#ffa970aa'; ctx.setLineDash([5, 5]); ctx.beginPath();
        if (['horizontal', 'both', 'eight'].includes(this.editor.mirror)) { ctx.moveTo(x + (ex + .5) * bw, y); ctx.lineTo(x + (ex + .5) * bw, y + ph); }
        if (['vertical', 'both', 'eight'].includes(this.editor.mirror)) { ctx.moveTo(x, y + (ez + .5) * bw); ctx.lineTo(x + pw, y + (ez + .5) * bw); }
        ctx.stroke(); ctx.setLineDash([]);
      }
      if (this.cursor) {
        const start = this.editor.tool === 'line' && this.strokeStart ? this.strokeStart : this.cursor;
        const indices = brushIndices(start, this.cursor, { ...this.editor, size: this.data.width });
        ctx.fillStyle = this.editor.tool === 'protect' ? '#57e6c970' : '#ffffff50'; ctx.strokeStyle = '#ffffffbb';
        for (const i of indices) { const cx = x + i % this.data.width * bw, cy = y + Math.floor(i / this.data.width) * bw; ctx.fillRect(cx, cy, bw, bw); if (bw > 3) ctx.strokeRect(cx, cy, bw, bw); }
      }
      ctx.restore();
    }
    ctx.fillStyle = '#929797'; ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'center';
    ctx.fillText(`${this.data.width} blocks`, x + pw / 2, y - 16);
    ctx.save(); ctx.translate(x - 20, y + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(`${this.data.depth} blocks`, 0, 0); ctx.restore();
  }
}
