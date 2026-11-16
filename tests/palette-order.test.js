import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, movePaletteSlot, normalizeSettings, nextDesign } from '../src/catalog.js';
import { generateTile } from '../src/generator.js';
import { encodeCell } from '../src/editing.js';

const materials = ['stone', 'black_concrete', 'quartz_block', 'gold_block', 'purpur_block', 'sea_lantern', 'red_concrete'];

test('palette moves insert in either direction without mutating the previous order', () => {
  const original = Object.freeze([...materials]);
  assert.deepEqual(movePaletteSlot(original, 0, 6), [...materials.slice(1), materials[0]]);
  assert.deepEqual(movePaletteSlot(original, 6, 0), [materials[6], ...materials.slice(0, 6)]);
  assert.deepEqual(movePaletteSlot(original, 1, 4), [materials[0], ...materials.slice(2, 5), materials[1], ...materials.slice(5)]);
  assert.deepEqual(original, materials);
});

test('reordering handles repeated blocks and ignores invalid or unchanged positions', () => {
  const repeated = ['stone', 'stone', 'quartz_block', 'stone', 'quartz_block', 'stone', 'stone'];
  assert.deepEqual(movePaletteSlot(repeated, 2, 0), ['quartz_block', 'stone', 'stone', 'stone', 'quartz_block', 'stone', 'stone']);
  for (const [from, to] of [[0, 0], [-1, 2], [2, -1], [0, 7], [7, 0], [0, NaN], [0, 2.5], ['0', 1]]) {
    assert.equal(movePaletteSlot(repeated, from, to), repeated);
  }
});

test('palette order survives normalization, JSON and Keep palette generation', () => {
  const before = normalizeSettings({ materials, paletteMode: 'keep', allowedBlocks: materials });
  const moved = normalizeSettings({ ...before, materials: movePaletteSlot(before.materials, 5, 1) });
  assert.deepEqual(moved.materials, [materials[0], materials[5], ...materials.slice(1, 5), materials[6]]);
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(moved))), moved);
  assert.deepEqual(nextDesign(moved, 'new seed').materials, moved.materials);
  assert.deepEqual(moved.allowedBlocks, before.allowedBlocks);
});

for (const pattern of ['field', 'reference']) test(`${pattern}: rearranging materials preserves geometry, heights and painted overrides`, () => {
  const cells = Array(32 * 32).fill(0);
  cells[33] = encodeCell(BLOCKS.findIndex(b => b.id === 'diamond_block'), 3, true);
  cells[34] = encodeCell(BLOCKS.findIndex(b => b.id === 'red_concrete'), 2);
  const settings = normalizeSettings({ materials, tile: 32, raised: true, pattern,
    reference: { size: 32, mode: 'recreate', cells: Array.from({ length: 1024 }, (_, i) => i % 7) },
    editLayer: { size: 32, cells },
  });
  const next = normalizeSettings({ ...settings, materials: movePaletteSlot(settings.materials, 6, 0) });
  const before = generateTile(settings), after = generateTile(next);
  assert.deepEqual(after.heights, before.heights);
  for (let i = 0; i < before.cells.length; i++) {
    if (cells[i]) assert.equal(after.materials[after.cells[i]], before.materials[before.cells[i]]);
    else assert.equal(after.cells[i], before.cells[i]);
  }
  assert.deepEqual(next.editLayer, settings.editLayer);
  assert.deepEqual(next.reference, settings.reference);
});
