import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCKS } from '../src/catalog.js';
import atlas from '../src/top-textures.json' with { type: 'json' };

test('top-view atlas covers every catalog block at native texture resolution or higher', () => {
  assert.deepEqual(atlas.ids, BLOCKS.map(b => b.id), 'Run node scripts/build-top-textures.mjs after catalog changes');
  assert.ok(atlas.size >= 16);
  const png = readFileSync(new URL('../src/assets/block-tops.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), atlas.columns * atlas.size);
  assert.equal(png.readUInt32BE(20), Math.ceil(BLOCKS.length / atlas.columns) * atlas.size);
});
