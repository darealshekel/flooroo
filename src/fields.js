import { LAYOUTS } from './catalog.js';
import { randomSource } from './random.js';

const TAU = Math.PI * 2;
const fract = value => value - Math.floor(value);
const lineDistance = value => Math.abs(value - Math.round(value));

export function composeField(s) {
  const random = randomSource(`field-v1:${s.seed}:${s.style}`);
  const pick = list => list[Math.floor(random() * list.length)];
  const range = (a, b) => a + random() * (b - a);
  const layouts = LAYOUTS.slice(1).map(([id]) => id);
  const layout = s.layout === 'auto' ? pick(layouts) : s.layout;
  const plan = {
    layout, secondary: pick(layouts.filter(id => id !== layout)),
    frequency: range(1.8, 3.5), spacing: range(2.2, 4.2),
    phase: Array.from({ length: 6 }, () => range(0, TAU)),
    harmonics: Array.from({ length: 4 }, () => [pick([1, 2, 3, 4]), pick([1, 2, 3]), range(.12, .4)]),
    sites: Array.from({ length: 9 }, () => [range(-.1, 1.1), range(-.1, 1.1)]),
    angular: s.style === 'architectural' || s.style === 'geometric',
    flowing: s.style === 'botanical' || s.style === 'woven',
    weirdness: s.weirdnessEnabled ? s.weirdness : 0, detail: s.fineDetail < 30 ? 1 : s.fineDetail < 70 ? 2 : 3,
    accent: pick([2, 3, 4]),
  };
  const names = { contours: 'Strata', channels: 'Current', faults: 'Faultline', cells: 'Archipelago', circuit: 'Switchboard', interference: 'Resonance' };
  plan.name = `${pick(['Drifting', 'Folded', 'Split', 'Wandering', 'Echoing', 'Offset', 'Tidal', 'Broken', 'Hidden', 'Parallel', 'Shifting', 'Entangled'])} ${names[layout]}`;
  return plan;
}

function field(u, v, p) {
  let value = 0;
  for (let i = 0; i < p.harmonics.length; i++) {
    const [a, b, weight] = p.harmonics[i];
    value += weight * Math.cos(u * a * Math.PI + p.phase[i]) * Math.sin(v * b * Math.PI + p.phase[i + 1]);
  }
  return value;
}

function terraces(value, p) {
  const level = Math.floor(value), part = fract(value);
  if (part < .065) return 1;
  if (part < .15) return 6;
  if (part < .27) return p.accent;
  if (p.detail > 1 && part > .7 && part < .76) return 4;
  if (p.detail === 3 && part > .91) return 1;
  return [0, 2, 0, 3][((level % 4) + 4) % 4];
}

function ribbon(distance, width, role, detail) {
  if (distance > width + .035) return -1;
  if (distance > width) return 1;
  if (distance > width - .035) return 6;
  if (detail > 1 && distance < .022) return 4;
  return role;
}

function sample(layout, u, v, p, w) {
  const f = p.frequency, a = p.phase;
  if (layout === 'contours') {
    const height = field(u, v, p) + .32 * Math.sin((u + v) * Math.PI + a[5]);
    return terraces((height + 2) * (2.2 + w * 1.8), p);
  }
  if (layout === 'channels') {
    const bend = .16 + .48 * w + (p.flowing ? .12 : 0);
    const x = u * f + Math.cos(v * TAU + a[0]) * bend;
    const y = v * p.spacing + Math.sin(u * Math.PI * 3 + a[1]) * bend;
    const dx = lineDistance(x), dy = lineDistance(y);
    const first = ribbon(dx, .13, 2, p.detail), second = ribbon(dy, .09, 3, p.detail);
    let role = first >= 0 ? first : 0;
    if (second >= 0 && (first < 0 || (Math.floor(x) + Math.floor(y)) % 2 === 0)) role = second;
    if (p.detail === 3 && dx < .025 && dy < .025) role = 5;
    if (first < 0 && second < 0 && lineDistance(x + y) < .04) role = 4;
    return role;
  }
  if (layout === 'faults' || layout === 'cells') {
    let nearest = Infinity, second = Infinity, index = 0;
    for (let i = 0; i < p.sites.length; i++) {
      const [x, y] = p.sites[i], dx = Math.abs(u - x), dy = Math.abs(v - y);
      const distance = layout === 'faults' || p.angular ? Math.max(dx, dy) + Math.min(dx, dy) * .45 : Math.hypot(dx, dy);
      if (distance < nearest) { second = nearest; nearest = distance; index = i; }
      else if (distance < second) second = distance;
    }
    const gap = second - nearest;
    if (gap < .012) return 1;
    if (gap < .027) return 6;
    if (gap < .055) return p.accent;
    if (layout === 'cells') return terraces(nearest * (11 + w * 8) + index * .37, p);
    const stripe = lineDistance((u * Math.cos(a[index % 6]) + v * Math.sin(a[index % 6])) * (8 + w * 7));
    if (p.detail > 1 && stripe < .055) return 4;
    if (p.detail === 3 && gap > .07 && gap < .085) return 2;
    return index % 3 === 0 ? 3 : 0;
  }
  if (layout === 'circuit') {
    const step = .08 + (1 - w) * .08;
    const x = u * f + Math.floor(v / step) * .17;
    const y = v * p.spacing - Math.floor(u / step) * .12;
    const dx = lineDistance(x), dy = lineDistance(y);
    const d = Math.min(dx, dy);
    if (dx < .055 && dy < .055) return 5;
    const trace = ribbon(d, .085, 2, p.detail);
    if (trace >= 0) return trace;
    if (p.detail > 1 && Math.abs(dx - .3) < .035 && dy > .2) return 3;
    return p.detail === 3 && lineDistance((u - v) * 12) < .045 ? 4 : 0;
  }
  const wave = Math.sin(u * f * TAU + a[0]) + Math.cos(v * p.spacing * TAU + a[1]);
  const echo = Math.sin((u + v) * (2 + w * 3) * Math.PI + a[2]);
  return terraces((wave + echo * (.2 + w * .65) + 3) * 1.7, p);
}

export function generateField(s) {
  const plan = composeField(s), n = s.tile, w = plan.weirdness / 100, scale = 100 / s.shapeScale;
  const cells = new Uint8Array(n * n);
  const spaces = [];
  // Sample continuous structures, then reflect actual block cells. Exact edge
  // agreement survives domain warping and does not depend on floating-point seams.
  for (let z = 0; z < n / 2; z++) for (let x = s.symmetry === 8 ? z : 0; x < n / 2; x++) {
    const a = ((n - 1) / 2 - x) * 2 / n, b = ((n - 1) / 2 - z) * 2 / n;
    const displacement = .02 + w * .42;
    let u = a * scale + displacement * Math.sin(b * TAU + plan.phase[2]);
    let v = b * scale + displacement * Math.cos(a * TAU + plan.phase[3]);
    u += w * w * .24 * field(b * 2, a * 2, plan);
    v += w * w * .24 * field(a * 2, b * 2, plan);
    const blendRegion = field(a + .7, b + .4, plan);
    const layout = w > .5 && blendRegion > .62 - (w - .5) * 1.4 ? plan.secondary : plan.layout;
    let role = sample(layout, u, v, plan, w);
    // Sparse inset lights follow contour crossings rather than a central emblem.
    if (plan.detail > 1 && role === 6 && lineDistance((u - v) * 5 + plan.phase[4]) < .055) role = 5;
    if (role === 4 && (field(a * 2, b * 2, plan) + 1) / 2 > s.fineDetail / 100) role = 0;
    const positions = [[x, z], [n - 1 - x, z], [x, n - 1 - z], [n - 1 - x, n - 1 - z]];
    if (s.symmetry === 8) positions.push([z, x], [z, n - 1 - x], [n - 1 - z, x], [n - 1 - z, n - 1 - x]);
    for (const [px, pz] of positions) cells[pz * n + px] = role;
    if (s.emptySpace) spaces.push({ score: field(a * .8 + .4, b * .8 + .7, plan), positions });
  }
  // Remove coherent areas, not random individual pixels. Existing foundation
  // counts toward the requested minimum; manual/protected edits are applied later.
  if (spaces.length) {
    let empty = cells.reduce((total, role) => total + (role === 0), 0);
    const target = Math.ceil(n * n * s.emptySpace / 100);
    spaces.sort((a, b) => a.score - b.score);
    for (const space of spaces) {
      if (empty >= target) break;
      for (const [x, z] of space.positions) { const i = z * n + x; if (cells[i] !== 0) { cells[i] = 0; empty++; } }
    }
  }
  return { width: n, depth: n, cells, settings: s, plan };
}
