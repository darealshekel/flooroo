import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from 'nbtify';
import { BLOCKS, LAYOUTS, normalizeSettings, nextDesign } from '../src/catalog.js';
import { generateTile, generateFloor } from '../src/generator.js';
import { encodeCell, decodeCell, normalizeLayer, protectedLayer, mirrorPoints, linePoints, brushIndices, regionIndices, editCells, LOCK } from '../src/editing.js';
import { exportLitematic } from '../src/export.js';

const index = Object.fromEntries(BLOCKS.map((b, i) => [b.id, i]));
const layer = size => ({ size, cells: Array(size * size).fill(0) });
const blockAt = (tile, i) => tile.materials[tile.cells[i]];

test('all 32 blocks, three heights and protection states round trip', () => {
  assert.ok(BLOCKS.length >= 32);
  const codes = new Set();
  for (let block = 0; block < 32; block++) for (let height = 1; height <= 3; height++) for (const locked of [false, true]) {
    const code = encodeCell(block, height, locked); codes.add(code);
    assert.deepEqual(decodeCell(code), { block, height, locked });
    assert.ok(code > 0 && code <= 224);
  }
  assert.equal(codes.size, 192);
});

test('imported layers reject invalid values and stay bounded to tile size', () => {
  const result = normalizeLayer({ size: 32, cells: [null, -1, 0.5, 128, 97, 225, '129', 129, 224, Infinity] }, 32);
  assert.equal(result.cells.length, 1024);
  assert.deepEqual(result.cells.slice(0, 10), [0, 0, 0, 0, 0, 0, 0, 129, 224, 0]);
  assert.deepEqual(normalizeLayer({ size: 1e9, cells: {} }, 32), { size: 32, cells: [] });
  const settings = normalizeSettings({ materials: ['constructor', '__proto__'], shapeScale: Infinity, fineDetail: -30, emptySpace: 999 });
  assert.ok(settings.materials.every(id => BLOCKS.some(block => block.id === id)));
  assert.equal(settings.shapeScale, 100); assert.equal(settings.fineDetail, 0); assert.equal(settings.emptySpace, 85);
});

test('resizing centers and crops edits without modifying the old snapshot', () => {
  const old = layer(32); old.cells[0] = 129; old.cells[16 * 32 + 16] = 224;
  const bigger = normalizeLayer(old, 64);
  assert.equal(bigger.cells[16 * 64 + 16], 129);
  assert.equal(bigger.cells[32 * 64 + 32], 224);
  assert.deepEqual(normalizeLayer(bigger, 32), old);
  const cropped = layer(64); cropped.cells[0] = 129;
  assert.deepEqual(normalizeLayer(cropped, 32), { size: 32, cells: [] });
  assert.equal(cropped.cells[0], 129);
});

test('mirroring supports independent axes, eight-way reflection and off-center axes', () => {
  assert.deepEqual(mirrorPoints(2, 3, 32, 'none'), [98]);
  assert.deepEqual(new Set(mirrorPoints(2, 3, 32, 'both')), new Set([98, 125, 898, 925]));
  assert.equal(mirrorPoints(2, 3, 32, 'eight').length, 8);
  assert.deepEqual(mirrorPoints(2, 3, 32, 'horizontal', 5, 5), [98, 104]);
  assert.ok(mirrorPoints(31, 31, 32, 'eight', 0, 0).every(i => i >= 0 && i < 1024));
});

test('brush interpolation leaves no gaps and clips large brushes at the boundary', () => {
  const path = linePoints({ x: 1, z: 3 }, { x: 22, z: 30 });
  assert.equal(path.length, 28);
  assert.deepEqual(path[0], { x: 1, z: 3 }); assert.deepEqual(path.at(-1), { x: 22, z: 30 });
  path.slice(1).forEach((p, i) => assert.ok(Math.max(Math.abs(p.x - path[i].x), Math.abs(p.z - path[i].z)) <= 1));
  assert.equal(brushIndices({ x: 0, z: 0 }, { x: 0, z: 0 }, { size: 32, brush: 3, mirror: 'none' }).size, 4);
  assert.equal(brushIndices({ x: 2, z: 3 }, { x: 2, z: 3 }, { size: 32, brush: 1, mirror: 'eight' }).size, 8);
});

test('fill stays connected and protected cells act as barriers; replace reaches disconnected matches', () => {
  const data = { width: 4, cells: Uint8Array.from([0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0]), materials: ['quartz_block', 'black_concrete'] };
  const locks = Array(16).fill(0); locks[4] = 129;
  assert.deepEqual([...regionIndices(data, 0, locks)], [0]);
  assert.equal(regionIndices(data, 4, locks).size, 0);
  assert.equal(regionIndices(data, 2, locks).size, 8);
  assert.equal(regionIndices(data, 0, locks, true).size, 11);
  assert.equal(regionIndices(data, 0, [], true).size, 12);
});

test('protection captures the rendered block and height; drawing cannot overwrite a lock', () => {
  const data = generateTile({ tile: 32, raised: true }), edits = layer(32);
  editCells(edits.cells, data, new Set([12]), 'protect', index.gold_block, 1, index);
  assert.deepEqual(decodeCell(edits.cells[12]), { block: index[blockAt(data, 12)], height: data.heights[12], locked: true });
  const code = edits.cells[12];
  for (const tool of ['brush', 'line', 'fill', 'replace', 'erase']) editCells(edits.cells, data, new Set([12]), tool, index.gold_block, 3, index);
  assert.equal(edits.cells[12], code);
  editCells(edits.cells, data, new Set([12]), 'unprotect', 0, 1, index);
  assert.equal(edits.cells[12], code - LOCK);
  editCells(edits.cells, data, new Set([12]), 'erase', 0, 1, index);
  assert.equal(edits.cells[12], 0);
});

test('generation preserves exact protected materials and heights, but clears unprotected edits', () => {
  const edits = layer(32);
  edits.cells[33] = encodeCell(index.gold_block, 3, true);
  edits.cells[34] = encodeCell(index.calcite, 2);
  const before = normalizeSettings({ tile: 32, editLayer: edits, paletteMode: 'random' });
  const next = nextDesign(before, 'new-palette');
  assert.equal(next.editLayer.cells[33], edits.cells[33]); assert.equal(next.editLayer.cells[34], 0);
  const tile = generateTile({ ...next, weirdness: 100, emptySpace: 85, shapeScale: 200, raised: false });
  assert.equal(blockAt(tile, 33), 'gold_block'); assert.equal(tile.heights[33], 3);
  assert.equal(before.editLayer.cells[34], edits.cells[34], 'Snapshots must not be mutated');
  assert.deepEqual(protectedLayer(edits).cells, next.editLayer.cells);
});

test('manual block edits repeat correctly with exact counts and heights in the full floor', () => {
  const edits = layer(32); edits.cells[33] = encodeCell(index.gold_block, 3);
  const f = generateFloor({ tile: 32, width: 64, depth: 64, border: 0, editLayer: edits });
  for (const z of [1, 33]) for (const x of [1, 33]) {
    assert.equal(blockAt(f, z * 64 + x), 'gold_block'); assert.equal(f.heights[z * 64 + x], 3);
  }
  assert.equal(f.counts.get('gold_block'), 12);
  assert.equal(f.total, 64 * 64 + 8);
});

test('all 32 edited materials and protected heights survive NBT export', async () => {
  const edits = layer(32);
  for (let i = 0; i < 32; i++) edits.cells[i] = encodeCell(i, i % 3 + 1, true);
  const f = generateFloor({ tile: 32, width: 32, depth: 32, border: 0, editLayer: edits });
  const { data } = await read(await exportLitematic(f)), r = data.Regions.Floor;
  assert.equal(r.BlockStatePalette.length, 33);
  const bits = 6, words = r.BlockStates;
  for (let y = 0; y < 3; y++) for (let i = 0; i < 32; i++) {
    const position = (y * 1024 + i) * bits, word = Math.floor(position / 64), offset = position % 64;
    let value = BigInt.asUintN(64, words[word]) >> BigInt(offset);
    if (offset + bits > 64) value |= BigInt.asUintN(64, words[word + 1]) << BigInt(64 - offset);
    const id = r.BlockStatePalette[Number(value & 63n)].Name;
    assert.equal(id, y < i % 3 + 1 ? `minecraft:${BLOCKS[i].id}` : 'minecraft:air');
  }
  assert.equal(+data.Metadata.TotalBlocks, f.total);
});

for (const [layout] of LAYOUTS.slice(1)) test(`${layout}: independent shape, detail, space and weirdness controls`, () => {
  const base = { layout, seed: 'control-check', tile: 64 };
  const small = generateTile({ ...base, shapeScale: 50 }), large = generateTile({ ...base, shapeScale: 200 });
  assert.notDeepEqual(small.cells, large.cells);
  assert.notDeepEqual(generateTile({ ...base, fineDetail: 0 }).cells, generateTile({ ...base, fineDetail: 100 }).cells);
  let previous = 0;
  for (const emptySpace of [0, 25, 50, 85]) {
    const tile = generateTile({ ...base, emptySpace });
    const empty = tile.cells.reduce((sum, role) => sum + (role === 0), 0);
    assert.ok(empty >= previous && empty >= tile.cells.length * emptySpace / 100);
    previous = empty;
  }
  const off = generateTile({ ...base, weirdness: 100, weirdnessEnabled: false });
  assert.equal(off.settings.weirdness, 100);
  assert.deepEqual(off.cells, generateTile({ ...base, weirdness: 0 }).cells);
  assert.notDeepEqual(off.cells, generateTile({ ...base, weirdness: 100, weirdnessEnabled: true }).cells);
});
