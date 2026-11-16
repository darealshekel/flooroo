import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from 'nbtify';
import { BLOCKS, BY_ID, PATTERNS, PALETTE_LIMITS, normalizeSettings, nextDesign, randomPalette, removePaletteSlot, movePaletteSlot, convertVersionBlocks } from '../src/catalog.js';
import { generateFloor, generateTile } from '../src/generator.js';
import { encodeCell } from '../src/editing.js';
import { exportLegacySchematic, exportLitematic } from '../src/export.js';

const blocks = ['stone', 'quartz_block', 'gold_block', 'black_concrete', 'red_concrete', 'sea_lantern', 'purpur_block'];

test('removal preserves order and stops at two without mutating the old palette', () => {
  const original = Object.freeze([...blocks]);
  assert.deepEqual(removePaletteSlot(original, 2), [...blocks.slice(0, 2), ...blocks.slice(3)]);
  for (const index of [-1, 7, NaN, 1.5, '0']) assert.equal(removePaletteSlot(original, index), original);
  let materials = original;
  while (materials.length > 2) materials = removePaletteSlot(materials, 0);
  assert.deepEqual(materials, blocks.slice(-2));
  assert.equal(removePaletteSlot(materials, 0), materials);
  assert.deepEqual(original, blocks);
});

test('normalization bounds palette size and keeps valid old seven-slot designs exact', () => {
  for (const materials of [null, [], ['bad'], Array(20).fill('stone'), [null, {}]]) {
    const result = normalizeSettings({ materials });
    assert.ok(result.materials.length >= PALETTE_LIMITS.min && result.materials.length <= PALETTE_LIMITS.max);
    assert.ok(result.materials.every(id => BY_ID[id]));
  }
  assert.deepEqual(normalizeSettings({ materials: blocks }).materials, blocks);
});

for (let size = 2; size <= 7; size++) test(`${size}-block palettes survive generation, reordering, conversion and JSON`, () => {
  const settings = normalizeSettings({ materials: blocks.slice(0, size), allowedBlocks: blocks, tile: 32, width: 37, depth: 43 });
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(settings))), settings);
  assert.deepEqual(nextDesign(settings, 'next').materials, settings.materials);
  const moved = movePaletteSlot(settings.materials, 0, size - 1);
  assert.deepEqual(normalizeSettings({ ...settings, materials: moved }).materials, moved);
  assert.deepEqual(convertVersionBlocks({ ...settings, version: '1.12.2' }).materials, settings.materials);
  const rolled = nextDesign({ ...settings, paletteMode: 'random' }, 'new');
  assert.equal(rolled.materials.length, size);
  assert.deepEqual(rolled.materials, randomPalette('new', settings.version, blocks, size));
  for (const pattern of [...PATTERNS.map(p => p.id), 'reference']) {
    const floor = generateFloor({ ...settings, pattern, raised: true,
      reference: { size: 32, mode: 'recreate', cells: Array.from({ length: 1024 }, (_, i) => i % 7) },
    });
    assert.ok(floor.cells.every(index => index < size), `${pattern}: floor and border indices`);
    assert.ok(floor.tile.cells.every(index => index < size), `${pattern}: tile indices`);
    assert.ok([...floor.counts.keys()].every(id => settings.materials.includes(id)));
    assert.equal([...floor.counts.values()].reduce((sum, n) => sum + n, 0), floor.total);
  }
});

test('shrinking preserves heights and exact painted/protected blocks, including removed materials', () => {
  const cells = Array(1024).fill(0);
  cells[0] = encodeCell(BLOCKS.findIndex(b => b.id === 'gold_block'), 3, true);
  cells[33] = encodeCell(BLOCKS.findIndex(b => b.id === 'diamond_block'), 2);
  const settings = normalizeSettings({ materials: blocks, tile: 32, width: 32, depth: 32, raised: true, editLayer: { size: 32, cells } });
  const small = { ...settings, materials: blocks.slice(0, 2) };
  const before = generateTile(settings), after = generateTile(small), floor = generateFloor(small);
  assert.deepEqual(after.heights, before.heights);
  assert.equal(after.materials[after.cells[0]], 'gold_block');
  assert.equal(after.materials[after.cells[33]], 'diamond_block');
  assert.equal(floor.materials[floor.cells[2 * 32 + 16]], 'stone', 'Border cannot accidentally reference appended paint materials');
  assert.deepEqual(normalizeSettings(small).editLayer, settings.editLayer);
});

for (const version of ['1.12.2', '1.21']) test(`${version}: two-block export round-trips every block and raised layer`, async () => {
  const floor = generateFloor({ version, tile: 32, width: 37, depth: 43, materials: blocks.slice(0, 2), raised: true });
  const legacy = version === '1.12.2';
  const { data } = await read(await (legacy ? exportLegacySchematic(floor) : exportLitematic(floor)));
  const region = data.Regions?.Floor;
  const bits = region ? Math.max(2, Math.ceil(Math.log2(region.BlockStatePalette.length))) : 0;
  for (let y = 0; y < floor.maxHeight; y++) for (let z = 0; z < floor.depth; z++) for (let x = 0; x < floor.width; x++) {
    const i = z * floor.width + x, offset = (y * floor.depth + z) * floor.width + x;
    const id = y < floor.heights[i] ? floor.materials[floor.cells[i]] : 'air';
    if (legacy) {
      assert.equal(data.Blocks[offset] & 255, id === 'air' ? 0 : BY_ID[id].legacy[0]);
      assert.equal(data.Data[offset] & 255, id === 'air' ? 0 : BY_ID[id].legacy[1]);
    } else {
      const bit = offset * bits, word = Math.floor(bit / 64), shift = bit % 64;
      let value = BigInt.asUintN(64, region.BlockStates[word]) >> BigInt(shift);
      if (shift + bits > 64) value |= BigInt.asUintN(64, region.BlockStates[word + 1]) << BigInt(64 - shift);
      const index = Number(value & ((1n << BigInt(bits)) - 1n));
      assert.equal(region.BlockStatePalette[index].Name, `minecraft:${id}`);
    }
  }
});
