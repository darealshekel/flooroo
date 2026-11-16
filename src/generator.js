import { normalizeSettings, BLOCKS } from './catalog.js';
import { generateOrnament } from './ornament.js';
import { generateField } from './fields.js';
import { decodeCell } from './editing.js';

function hash(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// Distances are in block units. Each motif is mirrored before rasterization,
// so palette/seed changes cannot introduce one-sided seams or broken symmetry.
export function generateTile(input) {
  const s = normalizeSettings(input);
  const tile = generateBaseTile(s), materials = [...s.materials], heights = new Uint8Array(tile.cells.length);
  tile.cells = new Uint16Array(tile.cells);
  for (let i = 0; i < tile.cells.length; i++) {
    const role = tile.cells[i];
    heights[i] = s.raised ? role === 5 ? 3 : [2, 3, 6].includes(role) ? 2 : 1 : 1;
    // Generators keep seven geometry roles; smaller palettes reuse their blocks.
    tile.cells[i] = role % s.materials.length;
    const code = s.editLayer.cells[i];
    if (code) {
      const { block, height } = decodeCell(code), id = BLOCKS[block].id;
      let index = materials.indexOf(id);
      if (index === -1) { index = materials.length; materials.push(id); }
      tile.cells[i] = index; heights[i] = height;
    }
  }
  return { ...tile, heights, materials };
}

function generateBaseTile(s) {
  if (s.pattern === 'reference') {
    const n = s.tile, ref = s.reference;
    const cells = Uint8Array.from({ length: n * n }, (_, i) => ref.cells[Math.min(ref.size - 1, Math.floor(Math.floor(i / n) * ref.size / n)) * ref.size + Math.min(ref.size - 1, Math.floor((i % n) * ref.size / n))]);
    return { width: n, depth: n, cells, settings: s, plan: { name: ref.mode === 'inspired' ? 'Image-inspired pattern' : 'Recreated image' } };
  }
  if (s.pattern === 'field') return generateField(s);
  if (s.pattern === 'generated') return generateOrnament(s);
  const n = s.tile, c = (n - 1) / 2, scale = n / 64;
  const cells = new Uint8Array(n * n);
  const seed = hash(s.seed);
  const inset = (seed % 5) - 2;
  const centerSize = 4 + ((seed >>> 4) % 3);
  const petalLength = 10 + ((seed >>> 7) % 4);
  const band = s.detail === 3 ? 1 : 1.3;
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const u = (x - c) / scale, v = (z - c) / scale;
    const a = Math.abs(u), b = Math.abs(v), hi = Math.max(a, b), lo = Math.min(a, b);
    const r = Math.hypot(u, v), d = a + b, edge = 32 - hi;
    const angle = Math.atan2(v, u);
    let role = 0;
    if (s.pattern === 'cathedral') {
      if (d > 24 + inset && d < 32 + inset) role = 2;
      if (Math.abs(d - (25 + inset)) < band || Math.abs(d - (32 + inset)) < band) role = 1;
      if (Math.abs(d - (35 + inset)) < .75 && s.detail > 1) role = 3;
      if (d > 37 && d < 41) role = 4;
      if (Math.abs(d - 43) < 1) role = 6;
      if (Math.abs(d - (17 + centerSize / 2)) < 1 || Math.abs(d - (11 + centerSize)) < .8) role = 4;
      const cross = lo < 2.2 + Math.max(0, 5 - hi) * .5 && hi < 18;
      if (cross) role = 3;
      if (lo < .9 && hi > 5 && hi < 17) role = 1;
      if (hi < centerSize + .5) role = 2;
      if (d < centerSize + .3) role = 6;
      if (hi < 1.8 || (hi > 15.7 && hi < 18.6 && lo < 1.7)) role = 5;
      if (s.symmetry === 8 && Math.abs(a - b) < .8 && r > 10 && r < 21) role = 6;
      if (s.detail > 1 && Math.abs(d - 21) < .8 && Math.floor(hi / 3) % 2 === 0) role = 5;
      const corner = Math.hypot(32 - a, 32 - b);
      if (corner < 9.5 && corner > 7) role = 3;
      if (corner < 5.5 && corner > 3) role = 2;
      if (corner < 2) role = 5;
    } else if (s.pattern === 'rosette') {
      if (edge < 3) role = 2;
      if (edge < 1) role = 1;
      if (edge > 3 && edge < 5 && Math.floor(lo / 2) % 2 === 0) role = 4;
      if (Math.abs(d - 28) < 1) role = 4;
      // Fold into one octant and choose the closest petal. Painting petals in
      // sequence would let one contour overwrite its neighbor asymmetrically.
      const ellipse = (along, across) => ((along - 13) / petalLength) ** 2 + (across / (s.symmetry === 8 ? 4.6 : 7)) ** 2;
      let along = hi, across = lo, shape = ellipse(hi, lo);
      const diagonalAlong = (hi + lo) / Math.SQRT2, diagonalAcross = (hi - lo) / Math.SQRT2;
      const diagonalShape = ellipse(diagonalAlong, diagonalAcross);
      if (s.symmetry === 8 && diagonalShape < shape) { along = diagonalAlong; across = diagonalAcross; shape = diagonalShape; }
      if (shape < 1.38 && along > 2) role = 1;
      if (shape < .94 && along > 3) role = 2;
      if (shape < .53 && along > 5) role = 4;
      if (across < .6 && along > 8 && along < 13 + petalLength && s.detail > 1) role = 6;
      if (Math.abs(r - 25) < .7 && s.detail === 3) role = 3;
      if (r < centerSize + .5) role = 1;
      if (d < centerSize + .5) role = 4;
      if (hi < 1.4) role = 5;
      if (hi > 26 && lo > 26) role = 1;
      if (Math.hypot(29 - a, 29 - b) < 2) role = 5;
    } else if (s.pattern === 'mosaic') {
      const oct = Math.max(hi, d / 1.42);
      if (oct < 24 + inset) role = 2;
      if (oct < 22 + inset) role = 1;
      if (oct < 20 + inset) role = 3;
      if (oct < 18 + inset) role = 2;
      if (oct < 16 + inset) role = 0;
      if (s.detail > 1 && Math.abs(oct - 21 - inset) < 1 && Math.floor(hi / 3) % 2 === 0) role = 6;
      const star = centerSize + 2 + 3 * Math.cos(angle * s.symmetry);
      if (r < star + 2) role = 1;
      if (r < star) role = 4;
      if (r < star - 2) role = 2;
      if (hi < 2) role = 5;
      if (r > 12 && r < 15 && Math.abs(a - b) < 1.5) role = 3;
      const corner = Math.hypot(32 - a, 32 - b);
      if (corner < 12) role = 2;
      if (corner < 10) role = 1;
      if (corner < 7.7) role = 3;
      if (corner < 5.5) role = 0;
      if (corner < 2.8) role = 6;
      if (hi > 26 && lo < 2) role = 4;
      if (hi > 29 && lo < 1) role = 5;
    } else {
      const wave = s.symmetry === 8 ? d : hi + lo * .4;
      if (Math.abs(wave - 26 - inset) < 4) role = 1;
      if (Math.abs(wave - 26 - inset) < 2.2) role = 2;
      if (Math.abs(wave - 20 - inset) < 1.2) role = 3;
      if (Math.abs(wave - 15 - inset) < 1) role = 6;
      if (lo < 2 && hi < 27) role = 4;
      if (lo < .6 && hi > 7 && hi < 25) role = 1;
      if (Math.abs(a - b) < 1.5 && hi < 18) role = 3;
      if (hi < centerSize) role = 4;
      if (hi < centerSize - 2) role = 6;
      if (hi < 1) role = 5;
      if (edge < 2.5) role = 1;
      if (edge > 3.5 && edge < 5) role = 2;
      if (edge < 1 && Math.floor(lo / 4) % 2 === 0) role = 4;
      if (hi > 24 && lo > 24) role = 4;
      if (hi > 26 && lo > 26) role = 1;
      if (hi > 28 && lo > 28) role = 5;
      if (s.detail > 1 && hi > 9 && hi < 25 && lo > 5 && lo < 7 && Math.floor(hi / 3) % 2 === 0) role = 6;
    }
    cells[z * n + x] = role;
  }
  return { width: n, depth: n, cells, settings: s };
}

export function generateFloor(input) {
  const tile = generateTile(input), s = tile.settings;
  const cells = new Uint16Array(s.width * s.depth);
  const heights = new Uint8Array(cells.length);
  const counts = new Map();
  // Center incomplete tiles rather than leaving a visibly unbalanced cut edge.
  const ox = ((s.tile - s.width % s.tile) % s.tile) / 2;
  const oz = ((s.tile - s.depth % s.tile) % s.tile) / 2;
  let total = 0, maxHeight = 1;
  for (let z = 0; z < s.depth; z++) for (let x = 0; x < s.width; x++) {
    const i = z * s.width + x;
    const tx = Math.floor(x + ox) % s.tile, tz = Math.floor(z + oz) % s.tile;
    let role = tile.cells[tz * s.tile + tx];
    const edge = Math.min(x, z, s.width - 1 - x, s.depth - 1 - z);
    if (edge < s.border) role = (edge === 0 ? 1 : edge === s.border - 1 ? 6 : 2) % s.materials.length;
    cells[i] = role;
    const h = edge >= s.border ? tile.heights[tz * s.tile + tx] : 1;
    heights[i] = h;
    maxHeight = Math.max(maxHeight, h);
    total += h;
    const id = tile.materials[role];
    counts.set(id, (counts.get(id) || 0) + h);
  }
  return { width: s.width, depth: s.depth, cells, heights, materials: tile.materials, maxHeight, counts, total, tile, settings: s };
}
