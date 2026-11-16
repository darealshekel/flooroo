import test from 'node:test';
import assert from 'node:assert/strict';
import { assetUrl } from '../src/assets.js';

test('public assets resolve at the site root and under a Pages repository path', () => {
  assert.equal(assetUrl('/textures/stone.png'), '/textures/stone.png');
  assert.equal(assetUrl('/textures/stone.png', '/flooroo/'), '/flooroo/textures/stone.png');
  assert.equal(assetUrl('textures/stone.png', '/flooroo'), '/flooroo/textures/stone.png');
});
