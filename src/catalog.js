import { randomSource } from './random.js';
import { normalizeLayer, protectedLayer, decodeCell, encodeCell } from './editing.js';
import { getVersion, atLeast } from './versions.js';
import { LEGACY, INTRODUCED, DYES, DYE_COLORS } from './block-data.js';
import textureColors from './texture-colors.json' with { type: 'json' };
import vanillaBlocks from './vanilla-blocks.json' with { type: 'json' };
import { PALETTE_FAMILIES } from './palette-families.js';

const block = (id, color, texture = id) => ({ id, name: id.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' '), color, texture: `/textures/${texture}.png` });

export const BLOCKS = [
  block('polished_deepslate', '#444348'), block('deepslate_tiles', '#333239'),
  block('deepslate_bricks', '#424047'), block('polished_blackstone', '#38343b'),
  block('polished_blackstone_bricks', '#302b33'), block('black_concrete', '#13151a'),
  block('gray_concrete', '#373b3e'), block('light_gray_concrete', '#7e7e75'),
  block('white_concrete', '#cfd5d6'), block('quartz_block', '#e8e3da', 'quartz_block_top'),
  block('calcite', '#d5d4ce'), block('sea_lantern', '#b4d9d0'),
  block('red_nether_bricks', '#510e13'), block('nether_bricks', '#302022'),
  block('red_terracotta', '#8e3c2e'), block('red_concrete', '#8e2020'),
  block('shroomlight', '#ee9b63'), block('copper_block', '#bf6b4f'),
  block('cut_copper', '#b5664c'), block('oxidized_copper', '#52a484'),
  block('oxidized_cut_copper', '#4f9981'), block('dark_prismarine', '#315a4c'),
  block('prismarine_bricks', '#64a098'), block('amethyst_block', '#8b62bd'),
  block('purpur_block', '#a57aa5'), block('end_stone_bricks', '#d9db9b'),
  block('moss_block', '#5b7033'), block('mud_bricks', '#89674e'),
  block('polished_andesite', '#8a8b89'), block('stone_bricks', '#7c7d7b'),
  block('chiseled_stone_bricks', '#777876'), block('gold_block', '#f3cf4d'),
];
// Keep the original 32 indices stable: saved tile edits refer to these indices.
for (const suffix of ['concrete', 'wool', 'terracotta']) DYES.forEach((dye, i) => {
  const id = `${dye}_${suffix}`;
  if (!BLOCKS.some(b => b.id === id)) BLOCKS.push(block(id, DYE_COLORS[i]));
});
for (const [ids, color] of [
  ['stone cobblestone andesite polished_diorite diorite', '#999991'],
  ['granite polished_granite bricks', '#a57161'],
  ['mossy_stone_bricks cracked_stone_bricks mossy_cobblestone', '#6c7261'],
  ['obsidian blackstone coal_block netherite_block cobbled_deepslate', '#302d36'],
  ['end_stone', '#d9db9b'], ['netherrack terracotta', '#865240'],
  ['iron_block', '#d5d5d5'], ['diamond_block', '#55d8cf'], ['emerald_block', '#30b34c'],
  ['lapis_block', '#285ab5'], ['glowstone', '#c9a35e'], ['prismarine', '#63a18d'],
  ['oak_planks spruce_planks birch_planks jungle_planks acacia_planks dark_oak_planks', '#ac8454'],
  ['crimson_planks', '#71354f'], ['warped_planks', '#2b756a'], ['mangrove_planks', '#79362e'],
  ['cherry_planks', '#dfa7a0'], ['bamboo_planks bamboo_mosaic', '#c6ae54'],
  ['tuff polished_tuff tuff_bricks packed_mud', '#777965'],
  ['pale_oak_planks', '#dedad0'], ['resin_bricks resin_block', '#d76723'],
  ['cinnabar polished_cinnabar cinnabar_bricks', '#b2463c'],
  ['sulfur polished_sulfur sulfur_bricks', '#d8c254'], ['poplar_planks', '#b9975d'],
]) for (const id of ids.split(' ')) BLOCKS.push(block(id, color));
for (const b of BLOCKS) {
  b.color = textureColors[b.id] || b.color;
  b.since = Object.entries(INTRODUCED).find(([, ids]) => ids.includes(b.id))?.[0] || '1.12.2';
  b.legacy = LEGACY[b.id];
  b.group = b.id.endsWith('_wool') ? 'Wool' : b.id.endsWith('_concrete') ? 'Concrete' : b.id.endsWith('terracotta') ? 'Terracotta' : /planks|bamboo_mosaic/.test(b.id) ? 'Wood' : /lantern|glowstone|shroomlight/.test(b.id) ? 'Lighting' : /copper|gold_block|iron_block|diamond_block|emerald_block|lapis_block|amethyst|netherite/.test(b.id) ? 'Metals & gems' : 'Stone & natural';
}
// Append only: saved edits address the original catalog by index.
for (const entry of vanillaBlocks) {
  let b = BLOCKS.find(b => b.id === entry.id);
  if (!b) { b = block(entry.id, textureColors[entry.id] || '#888888'); BLOCKS.push(b); }
  Object.assign(b, entry);
  b.transparent = ['glass', 'tinted_glass', 'ice'].includes(b.id) || b.id.endsWith('_stained_glass');
  b.group = entry.shape === 'slab' ? 'Slabs' : entry.shape === 'stairs' ? 'Stairs'
    : entry.id.endsWith('_glazed_terracotta') ? 'Glazed terracotta'
    : /(^|_)glass$/.test(entry.id) ? 'Glass'
    : entry.id.endsWith('_concrete_powder') ? 'Concrete powder'
    : /(_log|_wood|_stem|_hyphae)$/.test(entry.id) ? 'Logs & wood'
    : b.group || (/copper/.test(entry.id) ? 'Metals & gems' : 'Stone & natural');
}
export const BY_ID = Object.fromEntries(BLOCKS.map(b => [b.id, b]));
const RGB = Object.fromEntries(BLOCKS.map(b => [b.id, b.color.match(/[a-f\d]{2}/gi).map(n => parseInt(n, 16))]));
const colorDistance = (a, b) => RGB[a].reduce((sum, n, i) => sum + (n - RGB[b][i]) ** 2, 0);
export const supportsBlock = (id, version) => typeof id === 'string' && Object.hasOwn(BY_ID, id) && atLeast(getVersion(version).id, BY_ID[id].since);
export const availableBlocks = (version, allowed = null) => BLOCKS.filter(b => supportsBlock(b.id, version) && (!allowed || allowed.includes(b.id)));
export function closestBlock(id, candidates) {
  const original = BY_ID[id];
  const sameShape = candidates.filter(b => b.shape === original.shape && b.transparent === original.transparent);
  const pool = sameShape.length ? sameShape : candidates;
  return pool.reduce((best, b) => {
    const distance = colorDistance(id, b.id);
    return distance < best.distance ? { id: b.id, distance } : best;
  }, { id: pool[0]?.id, distance: Infinity }).id;
}
export function compatiblePalette(ids, version, allowed = null) {
  const candidates = availableBlocks(version, allowed);
  return ids.map(id => candidates.some(b => b.id === id) ? id : closestBlock(id, candidates));
}
export function convertVersionBlocks(input) {
  const s = normalizeSettings(input), candidates = availableBlocks(s.version, s.allowedBlocks);
  const replace = id => supportsBlock(id, s.version) ? id : closestBlock(id, candidates);
  s.materials = s.materials.map(replace);
  s.editLayer.cells = s.editLayer.cells.map(code => {
    if (!code) return 0;
    const cell = decodeCell(code), id = replace(BLOCKS[cell.block].id);
    return encodeCell(BLOCKS.findIndex(b => b.id === id), cell.height, cell.locked);
  });
  return s;
}
export const ROLES = ['Foundation', 'Outline', 'Main motif', 'Accent', 'Inlay', 'Light', 'Trim'];
export const PALETTES = [
  { id: 'obsidian', name: 'Moonstone', colors: ['deepslate_tiles', 'polished_blackstone', 'polished_andesite', 'quartz_block', 'deepslate_bricks', 'sea_lantern', 'light_gray_concrete'] },
  { id: 'crimson', name: 'Crimson forge', colors: ['red_nether_bricks', 'nether_bricks', 'red_terracotta', 'deepslate_tiles', 'polished_blackstone', 'shroomlight', 'red_concrete'] },
  { id: 'verdant', name: 'Overgrown', colors: ['moss_block', 'dark_prismarine', 'mud_bricks', 'purpur_block', 'oxidized_cut_copper', 'sea_lantern', 'end_stone_bricks'] },
  { id: 'amethyst', name: 'Amethyst & copper', colors: ['polished_deepslate', 'polished_blackstone', 'oxidized_copper', 'purpur_block', 'cut_copper', 'sea_lantern', 'end_stone_bricks'] },
];
export const PATTERNS = [
  { id: 'field', name: 'Procedural design', palette: 'amethyst' },
  { id: 'generated', name: 'Generated design', description: 'Procedural ornament', palette: 'obsidian' },
  { id: 'cathedral', name: 'Cathedral', description: 'Stars & diamonds', palette: 'obsidian' },
  { id: 'rosette', name: 'Rosette', description: 'Eight-petal geometry', palette: 'crimson' },
  { id: 'mosaic', name: 'Garden mosaic', description: 'Interlocking medallions', palette: 'verdant' },
  { id: 'foundry', name: 'Foundry', description: 'Stepped machinery', palette: 'amethyst' },
];
export const STYLES = [ ['any', 'Everything'], ['botanical', 'Botanical'], ['geometric', 'Geometric'], ['architectural', 'Architectural'], ['woven', 'Interlaced'] ];
export const LEGACY_LAYOUTS = [ ['auto', 'Automatic'], ['medallion', 'Grand medallion'], ['quartered', 'Quartered panels'], ['lattice', 'Diamond lattice'], ['interlock', 'Interlocking circles'], ['tapestry', 'Woven tapestry'], ['radial', 'Radial ornament'] ];
export const LAYOUTS = [ ['auto', 'Automatic'], ['contours', 'Contour fields'], ['channels', 'Braided channels'], ['faults', 'Fractured inlay'], ['cells', 'Cellular terraces'], ['circuit', 'Folded circuits'], ['interference', 'Wave interference'] ];
export const TILE_SIZES = [32, 48, 64, 96, 128, 192];
export const FLOOR_SIZE_LIMITS = { min: 16, max: 1024 };
export const BLOCK_POOL_LIMITS = { min: 2, max: 16 };
export const DEFAULTS = { pattern: 'field', fieldVersion: 2, style: 'any', layout: 'auto', palette: 'amethyst', paletteMode: 'keep', weirdness: 25, weirdnessEnabled: true, shapeScale: 100, fineDetail: 100, emptySpace: 0, width: 256, depth: 256, tile: 128, detail: 3, symmetry: 8, border: 3, raised: false, seed: '104', materials: null, editLayer: null };

export function randomPalette(seed, version = '1.21', allowed = null) {
  const random = randomSource(`palette-v2:${seed}`);
  let pool = availableBlocks(version, allowed);
  if (!pool.length) throw new Error('Select at least one compatible block.');
  const pick = list => list[Math.floor(random() * list.length)];
  let families = PALETTE_FAMILIES;
  if (allowed) {
    // Choose a whole color scheme that fits the selected pool before assigning roles.
    const scored = families.map(family => ({ family, score: family.roles.reduce((sum, ids) => sum + Math.min(...ids.flatMap(id => pool.map(b => colorDistance(id, b.id)))), 0) }))
      .sort((a, b) => a.score - b.score);
    families = scored.filter(entry => entry.score <= scored[0].score * 1.15 + 3000).map(entry => entry.family);
  } else {
    families = families.filter(family => pool.filter(b => family.roles.flat().includes(b.id)).length >= ROLES.length);
  }
  const family = pick(families);
  if (!allowed) pool = pool.filter(b => family.roles.flat().includes(b.id));
  const used = new Set(), lights = new Set(['sea_lantern', 'shroomlight', 'glowstone']);
  return family.roles.map((ids, role) => {
    let candidates = pool.filter(b => !used.has(b.id));
    if (!candidates.length) candidates = pool;
    const lighting = candidates.filter(b => lights.has(b.id));
    if (role === 5 && lighting.length) candidates = lighting;
    else if (role !== 5 && pool.length >= ROLES.length) {
      const nonLights = candidates.filter(b => !lights.has(b.id));
      if (nonLights.length) candidates = nonLights;
    }
    const matching = candidates.filter(b => ids.includes(b.id));
    const id = matching.length ? pick(matching).id : closestBlock(pick(ids), candidates);
    used.add(id);
    return id;
  });
}

export function nextDesign(input, seed) {
  const s = normalizeSettings(input);
  return normalizeSettings({ ...s, seed, pattern: 'field', fieldVersion: 2,
    editLayer: protectedLayer(s.editLayer),
    layout: LAYOUTS.some(([id]) => id === s.layout) ? s.layout : 'auto',
    ...(s.paletteMode === 'random' ? { palette: 'random', materials: randomPalette(seed, s.version, s.allowedBlocks) } : {}),
  });
}

export function normalizeSettings(input = {}) {
  const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Math.round(Number(value)))) : fallback;
  const s = { ...DEFAULTS, ...input };
  s.version = getVersion(input.version).id;
  s.allowedBlocks = Array.isArray(input.allowedBlocks) ? [...new Set(input.allowedBlocks.filter(id => supportsBlock(id, s.version)))].slice(0, BLOCK_POOL_LIMITS.max) : null;
  if (s.allowedBlocks?.length === 1) s.allowedBlocks.push(availableBlocks(s.version).find(b => !s.allowedBlocks.includes(b.id)).id);
  if (s.allowedBlocks?.length === 0) s.allowedBlocks = null;
  s.pattern = PATTERNS.some(p => p.id === s.pattern) ? s.pattern : DEFAULTS.pattern;
  s.fieldVersion = Number(s.fieldVersion) === 1 ? 1 : 2;
  s.palette = s.palette === 'random' || PALETTES.some(p => p.id === s.palette) ? s.palette : DEFAULTS.palette;
  s.paletteMode = s.paletteMode === 'random' ? 'random' : 'keep';
  s.weirdness = number(s.weirdness, DEFAULTS.weirdness, 0, 100);
  s.weirdnessEnabled = s.weirdnessEnabled !== false;
  s.shapeScale = number(s.shapeScale, 100, 50, 200);
  s.fineDetail = number(input?.fineDetail ?? (input?.detail ? (Number(input.detail) - 1) * 50 : 100), 100, 0, 100);
  s.emptySpace = number(s.emptySpace, 0, 0, 85);
  s.style = STYLES.some(([id]) => id === s.style) ? s.style : 'any';
  s.layout = (s.pattern === 'generated' ? LEGACY_LAYOUTS : LAYOUTS).some(([id]) => id === s.layout) ? s.layout : 'auto';
  s.width = number(s.width, DEFAULTS.width, FLOOR_SIZE_LIMITS.min, FLOOR_SIZE_LIMITS.max);
  s.depth = number(s.depth, DEFAULTS.depth, FLOOR_SIZE_LIMITS.min, FLOOR_SIZE_LIMITS.max);
  s.tile = TILE_SIZES.includes(Number(s.tile)) ? Number(s.tile) : DEFAULTS.tile;
  s.detail = number(s.detail, DEFAULTS.detail, 1, 3);
  s.symmetry = Number(s.symmetry) === 4 ? 4 : 8;
  s.border = number(s.border, 3, 0, 8);
  s.raised = s.raised === true;
  s.seed = String(s.seed ?? '1472').slice(0, 32);
  const fallback = s.palette === 'random' ? randomPalette(s.seed, s.version, s.allowedBlocks) : compatiblePalette(PALETTES.find(p => p.id === s.palette).colors, s.version, s.allowedBlocks);
  s.materials = fallback.map((id, i) => typeof s.materials?.[i] === 'string' && Object.hasOwn(BY_ID, s.materials[i]) ? s.materials[i] : id);
  s.editLayer = normalizeLayer(s.editLayer, s.tile, BLOCKS.length);
  return s;
}
