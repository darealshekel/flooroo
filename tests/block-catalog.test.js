import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { BLOCKS, BY_ID, supportsBlock, normalizeSettings, nextDesign, compatiblePalette } from '../src/catalog.js';
import { encodeCell, decodeCell } from '../src/editing.js';
import { generateFloor } from '../src/generator.js';
import { schematicData, legacySchematicData } from '../src/export.js';
import { blockGeometry, SHAPE_BOXES } from '../src/block-geometry.js';

test('all slab, stair and decorative families have textures and correct version boundaries', () => {
  for (const [id, before, since] of [
    ['prismarine_stairs', '1.12.2', '1.13.2'],
    ['andesite_slab', '1.13.2', '1.14.4'],
    ['stone_slab', '1.13.2', '1.14.4'],
    ['blackstone_slab', '1.15.2', '1.16.5'],
    ['waxed_oxidized_cut_copper_stairs', '1.16.5', '1.17.1'],
    ['mud_brick_slab', '1.18.2', '1.19.4'],
    ['cherry_stairs', '1.19.4', '1.20.1'],
    ['bamboo_mosaic_slab', '1.19.4', '1.20.1'],
    ['chiseled_tuff_bricks', '1.20.6', '1.21'],
    ['waxed_oxidized_copper_grate', '1.20.6', '1.21'],
    ['pale_oak_stairs', '1.21', '1.21.4'],
    ['resin_brick_slab', '1.21', '1.21.4'],
    ['poplar_stairs', '26.2', '26.3'],
  ]) {
    assert.equal(supportsBlock(id, before), false, `${id} unavailable in ${before}`);
    assert.equal(supportsBlock(id, since), true, `${id} available in ${since}`);
  }
  for (const id of ['oak_stairs', 'oak_slab', 'smooth_stone_slab', 'chiseled_sandstone', 'cut_red_sandstone', 'quartz_pillar', 'white_glazed_terracotta', 'glass', 'pink_stained_glass']) {
    assert.equal(supportsBlock(id, '1.12.2'), true, id);
  }
  for (const b of BLOCKS) for (const texture of b.faces || []) assert.ok(existsSync(new URL(`../public${texture}`, import.meta.url)), `${b.id}: ${texture}`);
});

test('slabs and stairs export real block states, including legacy metadata', () => {
  assert.deepEqual(BY_ID.oak_stairs.legacy, [53, 3]);
  assert.deepEqual(BY_ID.oak_slab.legacy, [126, 0]);
  assert.deepEqual(BY_ID.smooth_stone_slab.legacy, [44, 0]);
  for (const id of ['oak_stairs', 'oak_slab', 'smooth_stone_slab']) {
    const floor = generateFloor({ width: 16, depth: 16, tile: 32, materials: Array(7).fill(id), version: '1.12.2' });
    const legacy = legacySchematicData(floor);
    assert.equal(legacy.Blocks[0] & 255, BY_ID[id].legacy[0]);
    assert.equal(legacy.Data[0], BY_ID[id].legacy[1]);
    floor.settings.version = '1.21';
    assert.deepEqual(schematicData(floor).Regions.Floor.BlockStatePalette[1].Properties, BY_ID[id].properties);
  }
});

test('automatic version conversion preserves shape and opacity where compatible choices exist', () => {
  const converted = compatiblePalette(['polished_deepslate', 'pale_oak_stairs', 'mud_brick_slab'], '1.12.2');
  assert.deepEqual(converted.map(id => BY_ID[id].shape), ['cube', 'stairs', 'slab']);
  assert.ok(converted.every(id => !BY_ID[id].transparent));
  assert.deepEqual(compatiblePalette(['polished_deepslate'], '1.12.2', ['glass']), ['glass'], 'Explicit glass-only pools still work');
});

test('shaped geometry matches bottom slabs and north-facing steps, without full-cube bounds', () => {
  for (const [shape, height, volume] of [['cube', 1, 1], ['slab', .5, .5], ['stairs', 1, .75]]) {
    const geometry = blockGeometry(shape);
    geometry.computeBoundingBox();
    assert.equal(geometry.boundingBox.min.y, 0);
    assert.equal(geometry.boundingBox.max.y, height);
    assert.equal(SHAPE_BOXES[shape].reduce((sum, [x, y, z, a, b, c]) => sum + (a - x) * (b - y) * (c - z), 0), volume);
    assert.ok(geometry.groups.every(g => g.materialIndex >= 0 && g.materialIndex < 6));
    assert.ok([...geometry.attributes.uv.array].every(n => Number.isFinite(n) && n >= 0 && n <= 1));
    geometry.dispose();
  }
  assert.equal(SHAPE_BOXES.stairs[1][5], .5, 'upper step faces north');
});

test('catalog indices above 255 survive saved edits and material generation', () => {
  assert.ok(BLOCKS.length > 500);
  const index = BLOCKS.length - 1, code = encodeCell(index, 3, true);
  const settings = normalizeSettings({ version: '26.3', tile: 32, width: 32, depth: 32, border: 0, editLayer: { size: 32, cells: [code] } });
  assert.equal(settings.editLayer.cells[0], code);
  const floor = generateFloor(settings);
  assert.equal(floor.materials[floor.cells[0]], BLOCKS[index].id);
  assert.equal(decodeCell(code).block, index);
});

test('explicit block pools remain within 2-16, including invalid and legacy saved selections', () => {
  const ids = BLOCKS.slice(0, 30).map(b => b.id);
  for (const allowedBlocks of [ids, [ids[0]], [ids[0], ids[0]], [null, {}, '__proto__', ...ids]]) {
    const s = normalizeSettings({ version: '26.3', allowedBlocks, paletteMode: 'random' });
    assert.ok(s.allowedBlocks.length >= 2 && s.allowedBlocks.length <= 16);
    assert.equal(s.allowedBlocks.length, new Set(s.allowedBlocks).size);
    assert.ok(nextDesign(s, 'pool').materials.every(id => s.allowedBlocks.includes(id)));
  }
  const allowedBlocks = ['oak_slab', 'oak_stairs'];
  const s = normalizeSettings({ version: '1.12.2', allowedBlocks, paletteMode: 'random' });
  assert.deepEqual(s.allowedBlocks, allowedBlocks);
  assert.ok(nextDesign(s, 'stairs').materials.every(id => allowedBlocks.includes(id)));
});
