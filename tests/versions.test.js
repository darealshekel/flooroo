import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from 'nbtify';
import { existsSync } from 'node:fs';
import { BLOCKS, BY_ID, PALETTES, availableBlocks, supportsBlock, compatiblePalette, normalizeSettings, randomPalette, nextDesign, convertVersionBlocks } from '../src/catalog.js';
import { VERSIONS } from '../src/versions.js';
import { encodeCell, decodeCell, isProtected, editCells, protectedLayer } from '../src/editing.js';
import { generateFloor } from '../src/generator.js';
import { schematicData, exportLitematic, exportLegacySchematic, incompatibleBlocks } from '../src/export.js';

test('catalog indices stay stable, IDs are unique, textures and legacy mappings exist', () => {
  assert.equal(BLOCKS[0].id, 'polished_deepslate'); assert.equal(BLOCKS[31].id, 'gold_block');
  assert.equal(new Set(BLOCKS.map(b => b.id)).size, BLOCKS.length);
  assert.ok(BLOCKS.length < 65529, 'Cell material indices fit in Uint16, including seven palette slots');
  for (const b of BLOCKS) {
    assert.ok(existsSync(new URL(`../public${b.texture}`, import.meta.url)), b.id);
    if (supportsBlock(b.id, '1.12.2')) assert.ok(b.legacy?.length === 2, b.id);
  }
  assert.equal(supportsBlock('__proto__', '26.3'), false);
});

test('version boundaries exclude future blocks and include actual newer materials', () => {
  for (const [id, before, after] of [
    ['polished_blackstone', '1.15.2', '1.16.5'], ['calcite', '1.16.5', '1.17.1'],
    ['mud_bricks', '1.18.2', '1.19.4'], ['cherry_planks', '1.19.4', '1.20.1'],
    ['tuff_bricks', '1.20.6', '1.21'], ['resin_bricks', '1.21', '1.21.4'],
    ['sulfur_bricks', '26.1', '26.2'], ['poplar_planks', '26.2', '26.3'],
  ]) { assert.equal(supportsBlock(id, before), false); assert.equal(supportsBlock(id, after), true); }
});

for (const version of VERSIONS) test(`${version.id}: presets, constrained random palettes and export metadata`, async () => {
  for (const p of PALETTES) assert.ok(compatiblePalette(p.colors, version.id).every(id => supportsBlock(id, version.id)));
  for (let seed = 0; seed < 20; seed++) {
    const palette = randomPalette(String(seed), version.id);
    assert.equal(new Set(palette).size, 7); assert.ok(palette.every(id => supportsBlock(id, version.id)));
  }
  const allowed = ['white_wool', 'blue_wool'];
  const s = normalizeSettings({ version: version.id, paletteMode: 'random', allowedBlocks: allowed });
  assert.ok(nextDesign(s, 'another').materials.every(id => allowed.includes(id)));
  const floor = generateFloor({ version: version.id, width: 32, depth: 32, tile: 32 });
  const nbt = await read(await (version.legacy ? exportLegacySchematic(floor) : exportLitematic(floor)));
  if (version.legacy) { assert.equal(nbt.rootName, 'Schematic'); assert.equal(+nbt.data.Width, 32); }
  else assert.equal(+nbt.data.MinecraftDataVersion, version.dataVersion);
});

test('single-block pools work; malformed or incompatible selection cannot crash generation', () => {
  assert.deepEqual(randomPalette('one', '1.12.2', ['white_wool']), Array(7).fill('white_wool'));
  for (const allowedBlocks of [[], ['unknown'], ['poplar_planks'], ['__proto__']]) {
    const s = normalizeSettings({ version: '1.12.2', palette: 'random', allowedBlocks });
    assert.ok(s.materials.every(id => supportsBlock(id, s.version)));
  }
  assert.equal(normalizeSettings({ version: '<script>' }).version, '1.21');
});

test('extended cell banks round trip without treating unlocked blocks as protected', () => {
  const codes = new Set();
  for (let i = 0; i < BLOCKS.length; i++) for (const height of [1, 2, 3]) for (const locked of [false, true]) {
    const code = encodeCell(i, height, locked); codes.add(code);
    assert.deepEqual(decodeCell(code), { block: i, height, locked });
    assert.equal(isProtected(code), locked);
  }
  assert.equal(codes.size, BLOCKS.length * 6);
  const i = BLOCKS.findIndex(b => b.id === 'poplar_planks'), cells = [encodeCell(i), encodeCell(i, 3, true)];
  assert.deepEqual(protectedLayer({ size: 32, cells }).cells, [0, cells[1]]);
  editCells(cells, {}, new Set([0, 1]), 'erase', 0, 1, {});
  assert.equal(cells[0], 0); assert.equal(decodeCell(cells[1]).locked, true);
});

test('version changes preserve incompatible protected edits until explicitly converted', () => {
  const index = BLOCKS.findIndex(b => b.id === 'poplar_planks');
  const cells = Array(32 ** 2).fill(0); cells[20] = encodeCell(index, 3, true);
  const original = normalizeSettings({ version: '26.3', tile: 32, width: 32, depth: 32, border: 0, editLayer: { size: 32, cells } });
  const older = normalizeSettings({ ...original, version: '1.12.2' });
  assert.deepEqual(older.editLayer, original.editLayer);
  assert.ok(incompatibleBlocks(generateFloor(older)).includes('poplar_planks'));
  assert.throws(() => schematicData(generateFloor(older)), /unavailable/);
  const converted = convertVersionBlocks(older);
  assert.deepEqual(incompatibleBlocks(generateFloor(converted)), []);
  assert.equal(decodeCell(converted.editLayer.cells[20]).height, 3);
  assert.equal(isProtected(converted.editLayer.cells[20]), true);
  assert.deepEqual(original.editLayer.cells, cells);
});

test('all legacy block IDs, dye metadata, orientation and raised columns round trip', async () => {
  const candidates = availableBlocks('1.12.2'), cells = Array(32 ** 2).fill(0);
  candidates.forEach((b, i) => { cells[i] = encodeCell(BLOCKS.indexOf(b), i % 3 + 1); });
  const floor = generateFloor({ version: '1.12.2', tile: 32, width: 32, depth: 32, border: 0, editLayer: { size: 32, cells } });
  const { data } = await read(await exportLegacySchematic(floor));
  for (let y = 0; y < 3; y++) for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) {
    const i = z * 32 + x, out = (y * 32 + z) * 32 + x;
    const [id, meta] = y < floor.heights[i] ? BY_ID[floor.materials[floor.cells[i]]].legacy : [0, 0];
    assert.equal(data.Blocks[out] & 255, id); assert.equal(data.Data[out], meta);
  }
});

test('every modern catalog block survives palette packing, including new block banks', async () => {
  const cells = Array(32 ** 2).fill(0);
  BLOCKS.forEach((b, i) => { cells[i] = encodeCell(i, i % 3 + 1, i % 2 === 0); });
  const floor = generateFloor({ version: '26.3', tile: 32, width: 32, depth: 32, border: 0, editLayer: { size: 32, cells } });
  const { data } = await read(await exportLitematic(floor));
  const region = data.Regions.Floor, bits = BigInt(Math.ceil(Math.log2(region.BlockStatePalette.length))), mask = (1n << bits) - 1n;
  for (let y = 0; y < 3; y++) for (let i = 0; i < BLOCKS.length; i++) {
    const bit = BigInt(y * 1024 + i) * bits, word = Number(bit / 64n), offset = bit % 64n;
    let value = BigInt.asUintN(64, region.BlockStates[word]) >> offset;
    if (offset + bits > 64n) value |= BigInt.asUintN(64, region.BlockStates[word + 1]) << (64n - offset);
    assert.equal(region.BlockStatePalette[Number(value & mask)].Name, y < i % 3 + 1 ? `minecraft:${BLOCKS[i].id}` : 'minecraft:air');
  }
});
