import { LEGACY_LAYOUTS as LAYOUTS } from './catalog.js';
import { randomSource } from './random.js';

const TAU = Math.PI * 2;
const MOTIFS = ['lotus', 'compass', 'quatrefoil', 'knot', 'fern', 'gear', 'rose', 'diamond'];
const PROFILES = ['octagon', 'diamond', 'circle', 'square', 'scallop', 'star'];
const STYLE_MOTIFS = {
  any: MOTIFS,
  botanical: ['lotus', 'fern', 'quatrefoil', 'rose'],
  geometric: ['compass', 'diamond', 'gear', 'rose'],
  architectural: ['quatrefoil', 'compass', 'gear', 'diamond'],
  woven: ['knot', 'quatrefoil', 'lotus', 'diamond'],
};
const NAMES = { lotus: 'Lotus', compass: 'Windrose', quatrefoil: 'Clover', knot: 'Knotwork', fern: 'Palmette', gear: 'Clockwork', rose: 'Roseglass', diamond: 'Filigree' };
const FRAME_NAMES = { octagon: 'Court', diamond: 'Diamonds', circle: 'Halo', square: 'Garden', scallop: 'Lace', star: 'Stars' };

// The seed selects a composition grammar, not a fixed finished tile. Every
// major and minor ornament gets its own recipe but shares a visual vocabulary.
export function composeDesign(settings) {
  const random = randomSource(`ornament-v1:${settings.seed}:${settings.style}`);
  const pick = list => list[Math.floor(random() * list.length)];
  const range = (a, b) => a + random() * (b - a);
  const recipe = () => ({
    motif: pick(STYLE_MOTIFS[settings.style]), profile: pick(PROFILES),
    petals: settings.symmetry === 4 ? 4 : pick([8, 8, 16]),
    phase: pick([0, .5]), inner: range(.16, .28),
    slenderness: range(.1, .18), length: range(.34, .45),
    rim: pick(['beaded', 'ladder', 'dashed', 'plain', 'braid']),
    spokes: pick([8, 12, 16, 24]), ringCount: pick([2, 3, 4]),
    accent: pick([3, 4, 6]), invert: random() > .5,
  });
  const layout = settings.layout === 'auto' ? pick(LAYOUTS.slice(1).map(([id]) => id)) : settings.layout;
  const main = recipe(), secondary = recipe(), corner = recipe();
  const plan = {
    layout, main, secondary, corner,
    frame: pick(PROFILES), border: pick(['greek', 'ladder', 'braid', 'pearls', 'steps']),
    field: pick(['crosshatch', 'diamonds', 'scales', 'plain', 'rosettes']),
    connector: pick(['diagonal', 'axial', 'both', 'arcs']),
    spacing: pick([8, 10, 12, 16]), radius: range(33, 41),
    band: range(1.1, 2), satellite: range(7, 11),
    rings: pick([2, 3, 4]),
    detail: settings.detail, symmetry: settings.symmetry,
  };
  plan.name = `${NAMES[main.motif]} ${FRAME_NAMES[plan.frame]}`;
  return plan;
}

function profile(x, y, kind) {
  const a = Math.abs(x), b = Math.abs(y), hi = Math.max(a, b), lo = Math.min(a, b);
  if (kind === 'square') return hi;
  if (kind === 'diamond') return (a + b) / Math.SQRT2;
  if (kind === 'octagon') return Math.max(hi, (hi + lo) / Math.SQRT2);
  const r = Math.hypot(x, y), t = Math.atan2(lo, hi);
  if (kind === 'scallop') return r / (.9 + .1 * Math.cos(t * 8));
  if (kind === 'star') return r / (.78 + .22 * Math.cos(t * 8));
  return r;
}

function ribbon(distance, width, color = 2, highlight = 6) {
  const d = Math.abs(distance);
  if (d > width + .75) return -1;
  if (d > width) return 1;
  if (d < width * .25) return highlight;
  return color;
}

function angularDistance(angle, count, phase = 0) {
  const period = TAU / count;
  return Math.abs(((angle - phase * period + period / 2) % period + period) % period - period / 2);
}

function medallion(x, y, radius, recipe, detail) {
  const a = Math.abs(x / radius), b = Math.abs(y / radius);
  const hi = Math.max(a, b), lo = Math.min(a, b), r = Math.hypot(a, b);
  const angle = Math.atan2(lo, hi), q = profile(a, b, recipe.profile);
  const stroke = Math.max(.018, .65 / radius);
  if (q > 1.03) return -1;
  let role = 0;
  const rimWidth = .13 + .018 * Math.min(detail, recipe.ringCount);
  if (q > 1 - rimWidth) {
    if (q > .985 || q < 1 - rimWidth + stroke) role = 1;
    else if (q > .955) role = 6;
    else if (q > .89) role = 2;
    else role = 4;
    const tangent = angle * recipe.spokes / (Math.PI / 2);
    if (detail > 1 && q > .9 && q < .952) {
      if (recipe.rim === 'beaded' && Math.abs(tangent - Math.round(tangent)) < .19) role = recipe.accent;
      if (recipe.rim === 'ladder' && Math.floor(tangent * 2) % 2 === 0) role = 1;
      if (recipe.rim === 'dashed' && Math.floor(tangent) % 2 === 0) role = 6;
      if (recipe.rim === 'braid' && Math.abs(q - (.923 + Math.cos(tangent * Math.PI) * .025)) < stroke) role = 3;
    }
    return role;
  }
  const t = angularDistance(angle, recipe.petals, recipe.phase);
  const along = r * Math.cos(t), across = r * Math.sin(t);
  const accent = recipe.accent;
  if (recipe.motif === 'lotus') {
    const petal = ((along - .43) / recipe.length) ** 2 + (across / recipe.slenderness) ** 2;
    if (petal < 1.18) role = 1;
    if (petal < .92) role = 2;
    if (petal < .55) role = accent;
    if (petal < .27) role = 4;
    if (detail > 1 && across < stroke && along > .23 && along < .78) role = 6;
    if (detail === 3 && Math.abs(petal - .69) < .07) role = 6;
  } else if (recipe.motif === 'compass') {
    const width = .16 * Math.max(0, 1 - along / .86);
    if (across < width + stroke && along < .84) role = 1;
    if (across < width && along < .82) role = 3;
    if (across < width * .48 && along > .25 && along < .75) role = 0;
    if (Math.abs(profile(a, b, 'diamond') - .48) < stroke) role = 2;
    if (detail > 1 && Math.abs(r - .64) < stroke && across > .1) role = 6;
  } else if (recipe.motif === 'quatrefoil') {
    const curve = Math.hypot(hi - .34, lo) - .31;
    if (Math.abs(curve) < .095) role = Math.abs(curve) > .075 ? 1 : Math.abs(curve) < .026 ? 6 : accent;
    if (curve < -.1) role = 4;
    if (detail > 1 && Math.abs(profile(a, b, 'diamond') - .52) < stroke) role = 2;
    if (detail === 3 && Math.abs(curve + .17) < stroke) role = 2;
  } else if (recipe.motif === 'knot') {
    const line1 = Math.abs(a + b - .66) / Math.SQRT2;
    const line2 = Math.abs(hi - .44);
    const line3 = Math.abs(a - b) / Math.SQRT2;
    if (hi < .72) {
      const d = Math.min(line1, line2);
      if (d < .075) role = 1;
      if (d < .05) role = 2;
      if (d < .02) role = accent;
      if (detail > 1 && line3 < .055 && r > .24 && r < .71) role = 1;
      if (detail > 1 && line3 < .025 && r > .24 && r < .71) role = 6;
      if (Math.abs(hi - .44) < .065 && Math.abs(lo - .22) < .07) role = 3;
    }
  } else if (recipe.motif === 'fern') {
    if (along > .18 && along < .82 && across < stroke * 1.5) role = 6;
    for (let leaf = 0; leaf < (detail === 1 ? 3 : 5); leaf++) {
      const center = .26 + leaf * .103;
      const length = .16 - leaf * .017;
      const leafQ = ((along - center - across * .65) / .075) ** 2 + ((across - length * .5) / (length * .7)) ** 2;
      if (leafQ < 1.5) role = 1;
      if (leafQ < 1) role = accent;
      if (leafQ < .4) role = 2;
    }
  } else if (recipe.motif === 'gear') {
    const oct = profile(a, b, 'octagon');
    const tooth = Math.floor(hi * (recipe.spokes + 4)) % 2;
    if (oct > .47 && oct < .7 + tooth * .06) role = 1;
    if (oct > .51 && oct < .66 + tooth * .06) role = 2;
    if (oct > .56 && oct < .61 + tooth * .04) role = accent;
    if (lo < .045 && hi < .53) role = 3;
    if (detail > 1 && Math.abs(a - b) < .035 && hi < .39) role = 6;
  } else if (recipe.motif === 'rose') {
    const petal = Math.hypot(along - .49, across) - (.15 + recipe.slenderness * .3);
    if (petal < .045) role = 1;
    if (petal < .012) role = 2;
    if (petal < -.04) role = accent;
    if (Math.abs(r - .75) < stroke) role = 6;
    if (detail > 1 && Math.abs(r - .32) < stroke * 1.5) role = 3;
    if (detail === 3 && across < stroke && r > .63 && r < .78) role = 5;
  } else {
    const diamond = a + b;
    const stepped = Math.max(hi, diamond / 1.5);
    const bands = Math.floor(stepped * 18 + recipe.phase * 3);
    if (stepped < .73 && stepped > .25) role = [1, 2, 6, 4, 0, 0][bands % 6];
    if (detail > 1 && lo < .045 && hi < .76) role = accent;
    if (detail === 3 && Math.abs(hi - lo) < stroke && hi < .54) role = 3;
  }
  // A small nested center gives large and small ornaments the same finish.
  const center = profile(a, b, recipe.invert ? 'diamond' : 'octagon');
  if (center < recipe.inner + .04) role = 1;
  if (center < recipe.inner) role = 2;
  if (center < recipe.inner * .7) role = 6;
  if (center < recipe.inner * .42) role = accent;
  if (center < Math.max(.025, .6 / radius)) role = 5;
  return role;
}

function frameBand(x, y, radius, kind, plan) {
  const distance = profile(x, y, kind) - radius;
  if (Math.abs(distance) > plan.rings * 1.4 + .6) return -1;
  const band = Math.floor(Math.abs(distance) / 1.2);
  const sequence = [plan.main.accent, 1, 2, 6, 1, 4];
  let role = sequence[band % sequence.length];
  if (plan.detail > 1 && band === 2 && Math.floor((Math.abs(x) + Math.abs(y)) / 2) % 2 === 0) role = 1;
  return role;
}

function background(x, y, plan) {
  if (plan.detail === 1 || plan.field === 'plain') return 0;
  const a = Math.abs(x), b = Math.abs(y), spacing = plan.spacing;
  const mod = value => Math.abs(value - Math.round(value / spacing) * spacing);
  if (plan.field === 'crosshatch' && Math.min(mod(a + b), mod(a - b)) < .55) return 4;
  if (plan.field === 'diamonds' && Math.abs(mod(a) + mod(b) - spacing * .48) < .6) return 4;
  if (plan.field === 'scales' && Math.abs(Math.hypot(mod(a), mod(b)) - spacing * .42) < .6) return 4;
  if (plan.field === 'rosettes' && Math.max(mod(a), mod(b)) < .85) return 2;
  return 0;
}

function edgeBand(a, b, plan) {
  const hi = Math.max(a, b), lo = Math.min(a, b), edge = 64 - hi;
  if (edge > 5.2) return -1;
  if (edge < .9 || edge > 4.3) return 1;
  if (edge < 1.5 || edge > 3.7) return 6;
  if (plan.detail === 1) return 2;
  if (plan.border === 'ladder') return Math.floor(lo / 2) % 2 ? 2 : 4;
  if (plan.border === 'pearls') return Math.hypot((lo % 5) - 2.5, edge - 2.5) < .95 ? 3 : 2;
  if (plan.border === 'greek') return (Math.floor(lo / 2) + Math.floor(edge * 1.5)) % 3 === 0 ? 4 : 2;
  if (plan.border === 'braid') return Math.abs(edge - (2.5 + Math.sin(lo * Math.PI / 4) * .8)) < .6 ? 3 : 2;
  return Math.abs(edge - (1.5 + Math.floor(lo / 2) % 3)) < .6 ? 4 : 2;
}

export function generateOrnament(s) {
  const plan = composeDesign(s), n = s.tile;
  const cells = new Uint8Array(n * n);
  const apply = (old, next) => next >= 0 ? next : old;
  // Work in a canonical octant. Reflection is exact even at fractional block
  // boundaries, and opposite tile edges have identical seam signatures.
  for (let z = 0; z < Math.ceil(n / 2); z++) for (let x = z; x < Math.ceil(n / 2); x++) {
    const a = ((n - 1) / 2 - x) * 128 / n, b = ((n - 1) / 2 - z) * 128 / n;
    const hi = Math.max(a, b), lo = Math.min(a, b), r = Math.hypot(a, b);
    let role = background(a, b, plan);
    if (plan.layout === 'medallion' || plan.layout === 'radial') {
      role = apply(role, frameBand(a, b, plan.radius + 9, plan.frame, plan));
      if (plan.connector === 'axial' || plan.connector === 'both') role = apply(role, ribbon(lo, plan.band, 4, 2));
      if (plan.connector === 'diagonal' || plan.connector === 'both') role = apply(role, ribbon((hi - lo) / Math.SQRT2, plan.band, 4, 2));
      if (plan.layout === 'radial') {
        const angle = Math.atan2(lo, hi), count = s.symmetry === 4 ? 4 : 8;
        const t = angularDistance(angle, count, .5);
        const along = r * Math.cos(t), across = r * Math.sin(t);
        role = apply(role, medallion(along - 36, across, plan.satellite + 3, plan.secondary, s.detail));
        role = apply(role, medallion(a, b, plan.radius * .66, plan.main, s.detail));
      } else role = apply(role, medallion(a, b, plan.radius, plan.main, s.detail));
      role = apply(role, medallion(64 - a, 64 - b, 18 + plan.satellite * .4, plan.corner, s.detail));
      role = apply(role, medallion(hi - 64, lo, plan.satellite + 1, plan.secondary, s.detail));
    } else if (plan.layout === 'quartered') {
      const u = Math.abs(a - 31), v = Math.abs(b - 31);
      role = apply(role, frameBand(u, v, 23, plan.frame, { ...plan, rings: 2 }));
      role = apply(role, medallion(u, v, 19 + plan.radius * .07, plan.main, s.detail));
      if (lo < 5) role = apply(role, ribbon(lo - 2.2, 1.1, 2, 6));
      role = apply(role, medallion(a, b, 13 + plan.satellite * .3, plan.secondary, s.detail));
      role = apply(role, medallion(hi - 62, lo, 11, plan.corner, s.detail));
      role = apply(role, medallion(64 - a, 64 - b, 10, plan.secondary, s.detail));
    } else if (plan.layout === 'lattice') {
      role = apply(role, frameBand(a, b, 40, 'diamond', plan));
      role = apply(role, frameBand(a, b, 52, plan.frame, { ...plan, rings: 2 }));
      role = apply(role, medallion(a, b, 27 + plan.radius * .12, plan.main, s.detail));
      role = apply(role, medallion(64 - a, 64 - b, 28 + plan.satellite * .3, plan.corner, s.detail));
      role = apply(role, medallion(hi - 64, lo, 9 + plan.satellite * .4, plan.secondary, s.detail));
      if (s.detail === 3 && Math.abs(a + b - 57) < .65 && Math.floor(hi / 3) % 3 === 0) role = 5;
    } else if (plan.layout === 'interlock') {
      const curve = Math.hypot(64 - hi, lo) - (39 + plan.radius * .1);
      role = apply(role, ribbon(curve, plan.band + .9, 2, 3));
      if (s.detail > 1) role = apply(role, ribbon(Math.abs(curve) - 5, .6, 4, 6));
      role = apply(role, medallion(hi - 64, lo, 28, plan.secondary, s.detail));
      role = apply(role, medallion(a, b, 25 + plan.satellite * .4, plan.main, s.detail));
      role = apply(role, medallion(64 - a, 64 - b, 19, plan.corner, s.detail));
      role = apply(role, medallion(a - 33, b - 33, 7.5, plan.corner, s.detail));
    } else {
      const wave = 4 * Math.cos(lo * Math.PI / 20);
      role = apply(role, ribbon(hi - 38 - wave, plan.band + 1.1, 2, 3));
      role = apply(role, ribbon((hi - lo) / Math.SQRT2 - 17, plan.band, 4, 6));
      role = apply(role, frameBand(a, b, 26, plan.frame, { ...plan, rings: 2 }));
      role = apply(role, medallion(a, b, 22, plan.main, s.detail));
      role = apply(role, medallion(64 - a, 64 - b, 18, plan.corner, s.detail));
      role = apply(role, medallion(hi - 53, lo - 25, 9 + plan.satellite * .2, plan.secondary, s.detail));
    }
    if (['medallion', 'quartered', 'radial'].includes(plan.layout)) role = apply(role, edgeBand(a, b, plan));
    // Sparse light inlays stay subordinate to the ornament, even in small tiles.
    if (Math.max(a, b) < Math.max(.55, 64 / n)) role = 5;
    const positions = [[x, z], [z, x], [n - 1 - x, z], [z, n - 1 - x], [x, n - 1 - z], [n - 1 - z, x], [n - 1 - x, n - 1 - z], [n - 1 - z, n - 1 - x]];
    for (const [px, pz] of positions) cells[pz * n + px] = role;
  }
  return { width: n, depth: n, cells, settings: s, plan };
}
