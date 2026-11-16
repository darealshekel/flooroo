import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE_FAMILIES } from '../src/palette-families.js';
import { BY_ID, randomPalette, normalizeSettings, nextDesign, supportsBlock } from '../src/catalog.js';
import { VERSIONS } from '../src/versions.js';
import { generateFloor } from '../src/generator.js';
import { encodeCell } from '../src/editing.js';

test('palette families define complete coordinated roles with real materials', () => {
  assert.equal(PALETTE_FAMILIES.length, 12);
  for (const family of PALETTE_FAMILIES) {
    assert.equal(family.roles.length, 7, family.name);
    assert.ok(family.roles.every(ids => ids.length && ids.every(id => BY_ID[id])), family.name);
  }
});

test('every unrestricted roll stays inside one whole material family across all versions', () => {
  const seen = new Set();
  for (const version of VERSIONS) for (let seed = 0; seed < 80; seed++) {
    const palette = randomPalette(`cohesion-${seed}`, version.id);
    const family = PALETTE_FAMILIES.find(f => palette.every(id => f.roles.flat().includes(id)));
    assert.ok(family, `Mixed unrelated families: ${version.id}: ${palette}`);
    seen.add(family.name);
    assert.equal(new Set(palette).size, 7);
    assert.ok(palette.every(id => supportsBlock(id, version.id)));
    assert.ok(['sea_lantern', 'shroomlight', 'glowstone'].includes(palette[5]));
    const brightness = id => {
      const [r, g, b] = BY_ID[id].color.match(/\w{2}/g).map(n => parseInt(n, 16));
      return .2126 * r + .7152 * g + .0722 * b;
    };
    assert.ok(brightness(palette[6]) - brightness(palette[1]) > 25, 'Trim contrasts with outline');
  }
  assert.equal(seen.size, PALETTE_FAMILIES.length, 'All coordinated families are reachable');
});

test('coordinated selection honors custom pools including stairs, unusual colors, and two blocks', () => {
  for (const allowed of [
    ['oak_slab', 'oak_stairs'],
    ['glass', 'black_concrete'],
    ['red_wool', 'blue_wool', 'green_wool', 'purple_wool', 'white_wool', 'black_wool', 'yellow_wool', 'pink_wool'],
    ['deepslate_tiles', 'polished_deepslate', 'copper_block', 'cut_copper', 'oxidized_copper', 'oxidized_cut_copper', 'sea_lantern', 'calcite'],
  ]) for (let seed = 0; seed < 30; seed++) {
    const palette = randomPalette(`restricted-${seed}`, '1.21', allowed);
    assert.equal(palette.length, 7);
    assert.ok(palette.every(id => allowed.includes(id)));
    assert.equal(new Set(palette).size, Math.min(allowed.length, 7));
    assert.deepEqual(palette, randomPalette(`restricted-${seed}`, '1.21', allowed));
  }
});

test('existing random-mode saves keep their exact materials until explicitly rerolled', () => {
  const materials = ['white_wool', 'blue_concrete', 'gold_block', 'stone', 'pink_terracotta', 'glowstone', 'diamond_block'];
  const original = normalizeSettings({ palette: 'random', materials, tile: 32, width: 32, depth: 32, editLayer: { size: 32, cells: [encodeCell(0, 2, true)] } });
  assert.deepEqual(original.materials, materials);
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(original))), original);
  assert.deepEqual(nextDesign(original, 'keep').materials, materials);
  const rerolled = nextDesign({ ...original, paletteMode: 'random' }, 'new-family');
  assert.deepEqual(rerolled.materials, randomPalette('new-family'));
  assert.equal(rerolled.editLayer.cells[0], original.editLayer.cells[0]);
  const changedPaletteOnly = generateFloor({ ...original, materials: randomPalette('palette-only') });
  assert.deepEqual(changedPaletteOnly.cells, generateFloor(original).cells);
  assert.deepEqual(changedPaletteOnly.heights, generateFloor(original).heights);
});
