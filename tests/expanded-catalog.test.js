import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { BLOCKS, BY_ID, availableBlocks, supportsBlock } from '../src/catalog.js';
import { modelGeometry } from '../src/block-geometry.js';
import { generateFloor } from '../src/generator.js';
import { schematicData, legacySchematicData } from '../src/export.js';

test('catalog expansion preserves all 588 original saved-edit indices', () => {
  assert.equal(createHash('sha256').update(JSON.stringify(BLOCKS.slice(0, 588).map(b => b.id))).digest('hex'), '4e7bbfebc237a7694b935671ffb20a70712f796803dc277b7695768e849c4a83');
  assert.ok(BLOCKS.length >= 1283);
  assert.ok(availableBlocks('1.12.2').length >= 491);
});

test('all previously excluded legacy block families are selectable', () => {
  for (const id of ['bedrock', 'grass_block', 'dirt_path', 'short_grass', 'oak_leaves', 'spruce_leaves', 'birch_leaves',
    'white_carpet', 'red_carpet', 'oak_fence', 'nether_brick_fence', 'cobblestone_wall', 'mossy_cobblestone_wall',
    'oak_trapdoor', 'iron_trapdoor', 'stone_button', 'oak_button', 'oak_pressure_plate', 'rail', 'iron_bars',
    'glass_pane', 'white_stained_glass_pane', 'snow', 'chest', 'anvil', 'hopper', 'vine', 'chorus_plant',
    'mushroom_stem', 'oak_sign', 'oak_wall_sign', 'fire', 'red_bed', 'white_bed', 'petrified_oak_slab',
    'creeper_head', 'dragon_head', 'wither_skeleton_skull', 'zombie_head', 'player_head']) {
    assert.ok(supportsBlock(id, '1.12.2'), id);
    assert.equal(BY_ID[id].legacy.length, 2);
  }
});

test('expanded families retain release boundaries, excluding experimental-only entries', () => {
  for (const [id, before, after] of [['bamboo_sapling','1.13.2','1.14.4'], ['azalea_leaves','1.16.5','1.17.1'],
    ['mangrove_leaves','1.18.2','1.19.4'], ['cherry_sapling','1.19.4','1.20.1'], ['stripped_cherry_log','1.19.4','1.20.1'],
    ['pink_petals','1.19.4','1.20.1'], ['trial_spawner','1.20.6','1.21'], ['vault','1.20.6','1.21'],
    ['copper_trapdoor','1.20.6','1.21'], ['tuff_wall','1.20.6','1.21'], ['pale_oak_leaves','1.21','1.21.4']]) {
    assert.equal(supportsBlock(id,before), false, `${id} before release`);
    assert.equal(supportsBlock(id,after), true, `${id} after release`);
  }
});

test('all new model faces have textures, finite geometry, UVs and valid material groups', () => {
  for (const block of BLOCKS.filter(b => b.models)) {
    const geometry = modelGeometry(block.models);
    assert.ok(geometry.attributes.position.count > 0, block.id);
    assert.ok([...geometry.attributes.position.array, ...geometry.attributes.uv.array, ...geometry.attributes.normal.array].every(Number.isFinite), block.id);
    assert.ok(geometry.groups.every(g => g.materialIndex < geometry.userData.textures.length), block.id);
    for (const texture of geometry.userData.textures) assert.ok(existsSync(new URL(`../public${texture}`, import.meta.url)), `${block.id}: ${texture}`);
    geometry.dispose();
  }
  for (const [id, height] of [['white_carpet',1/16],['oak_trapdoor',3/16],['oak_fence',1]]) {
    const g = modelGeometry(BY_ID[id].models); g.computeBoundingBox();
    assert.equal(g.boundingBox.max.y, height, id); g.dispose();
  }
});

test('exports use historical block names and property vocabularies', () => {
  const state = (id, version) => schematicData(generateFloor({ width:16, depth:16, border:0, version, materials:Array(7).fill(id) })).Regions.Floor.BlockStatePalette[1];
  assert.equal(state('smooth_stone_slab','1.13.2').Name, 'minecraft:stone_slab');
  assert.equal(state('dirt_path','1.13.2').Name, 'minecraft:grass_path');
  assert.equal(state('short_grass','1.20.1').Name, 'minecraft:grass');
  assert.equal(state('short_grass','1.21').Name, 'minecraft:short_grass');
  assert.equal(state('cobblestone_wall','1.13.2').Properties.north, 'false');
  assert.equal(state('cobblestone_wall','1.21').Properties.north, 'none');
  assert.equal(state('oak_leaves','1.13.2').Properties.waterlogged, undefined);
});

test('legacy beds, banners and heads include their block-entity data', () => {
  for (const [id, key, value] of [['blue_bed','color',11],['blue_banner','Base',4],['creeper_head','SkullType',4]]) {
    const data = legacySchematicData(generateFloor({ width:16, depth:16, border:0, version:'1.12.2', materials:Array(7).fill(id) }));
    assert.equal(data.TileEntities.length, 256);
    assert.equal(+data.TileEntities[0][key], value);
    assert.deepEqual([+data.TileEntities[255].x,+data.TileEntities[255].y,+data.TileEntities[255].z], [15,0,15]);
  }
});
