import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from 'nbtify';
import { generateFloor } from '../src/generator.js';
import { normalizeSettings } from '../src/catalog.js';
import { exportLegacySchematic, exportLitematic } from '../src/export.js';

test('528 by 528 remains exact through normalization, generation and serialization', () => {
  const settings = normalizeSettings({ width: 528, depth: 528, tile: 32, border: 0 });
  assert.equal(settings.width, 528); assert.equal(settings.depth, 528);
  const floor = generateFloor(JSON.parse(JSON.stringify(settings)));
  assert.equal(floor.width, 528); assert.equal(floor.depth, 528);
  assert.equal(floor.cells.length, 278784);
  assert.equal(floor.total, 278784);
  assert.equal([...floor.counts.values()].reduce((a, b) => a + b), floor.total);
});

test('1024 limit supports rectangular floors but keeps excessive imports bounded', () => {
  const floor = generateFloor({ width: 1024, depth: 1024 });
  assert.equal(floor.cells.length, 1048576);
  assert.equal(normalizeSettings({ width: 999999, depth: 999999 }).width, 1024);
  assert.equal(normalizeSettings({ width: 999999, depth: 999999 }).depth, 1024);
  const rectangle = generateFloor({ width: 1024, depth: 528 });
  assert.equal(rectangle.cells.length, 1024 * 528);
});

test('528 by 528 modern schematic retains dimensions and material totals', async () => {
  const floor = generateFloor({ width: 528, depth: 528, raised: true });
  const nbt = await read(await exportLitematic(floor));
  assert.equal(+nbt.data.Regions.Floor.Size.x, 528);
  assert.equal(+nbt.data.Regions.Floor.Size.z, 528);
  assert.equal(+nbt.data.Metadata.TotalBlocks, floor.total);
  assert.equal(+nbt.data.Metadata.TotalVolume, 528 * 528 * 3);
});

test('528 by 528 legacy schematic retains dimensions and all columns', async () => {
  const floor = generateFloor({ version: '1.12.2', width: 528, depth: 528, raised: true });
  const nbt = await read(await exportLegacySchematic(floor));
  assert.equal(+nbt.data.Width, 528); assert.equal(+nbt.data.Length, 528);
  assert.equal(nbt.data.Blocks.length, 528 * 528 * 3);
  assert.equal(nbt.data.Blocks.filter(block => block !== 0).length, floor.total);
});
