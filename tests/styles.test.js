import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { STYLES, LAYOUTS, normalizeSettings, nextDesign } from '../src/catalog.js';
import { composeField } from '../src/fields.js';
import { generateTile } from '../src/generator.js';

test('Everything selects all four real styles and Automatic reaches every layout for each', () => {
  const combinations = new Set();
  for (let seed = 0; seed < 1024; seed++) {
    const settings = normalizeSettings({ seed: String(seed), style: 'any', layout: 'auto' });
    const plan = composeField(settings);
    assert.notEqual(plan.style, 'any');
    assert.ok(STYLES.some(([id]) => id === plan.style));
    assert.deepEqual(plan, composeField(settings));
    assert.deepEqual(plan, composeField({ ...settings, style: plan.style }));
    combinations.add(`${plan.style}:${plan.layout}`);
  }
  assert.equal(combinations.size, (STYLES.length - 1) * (LAYOUTS.length - 1));
});

test('Everything renders the selected style, not just its name or flags', () => {
  const covered = new Set();
  for (let seed = 0; seed < 64; seed++) {
    const settings = { seed: String(seed), style: 'any', layout: 'auto', tile: 32 };
    const tile = generateTile(settings);
    assert.deepEqual(tile.cells, generateTile({ ...settings, style: tile.plan.style }).cells);
    covered.add(tile.plan.style);
  }
  assert.equal(covered.size, 4);
});

test('style choice survives settings changes, explicit layout constraints, and JSON round trips', () => {
  const settings = nextDesign({ style: 'any', layout: 'channels' }, 'fixed-style');
  const original = composeField(settings);
  for (const changes of [{ weirdness: 100 }, { paletteMode: 'random' }, { width: 528 }, { symmetry: 4 }]) {
    const plan = composeField(normalizeSettings({ ...settings, ...changes }));
    assert.equal(plan.style, original.style);
    assert.equal(plan.layout, 'channels');
  }
  assert.deepEqual(generateTile(settings).cells, generateTile(JSON.parse(JSON.stringify(settings))).cells);
  assert.equal(settings.style, 'any', 'Everything stays selected for the next generation');
});

test('explicit styles and legacy Everything designs retain their exact old geometry', () => {
  const hashes = {
    any: '4112b2f3731e28cf117d4c1d79156770117a187d759b7aaa09c0474788c29c1b',
    botanical: '0421386ad8001fe98962ef5139aff261fc1d9f5dda8d62f0b225ea9f24aac76c',
    geometric: '43fc8bfc248850edb60399f270f4e8dba125f5a85b5307829f728f77a13d23ca',
    architectural: 'c8c19172d56f1beff199253bc18630603d84fdde433ba1f9355f477ae795a100',
    woven: '79d55b07bc9a53f160192e16add635334bde97fdcedd9ad06f96b1d0cefbab81',
  };
  for (const [style, expected] of Object.entries(hashes)) {
    const tile = generateTile({ seed: 'style-regression', style, tile: 64, layout: 'auto', fieldVersion: style === 'any' ? 1 : 2 });
    assert.equal(createHash('sha256').update(Buffer.from(tile.cells)).digest('hex'), expected);
  }
  const legacy = normalizeSettings({ fieldVersion: 1, style: 'any', seed: 'old' });
  assert.equal(composeField(legacy).style, 'any');
  const next = nextDesign(legacy, 'new');
  assert.equal(next.fieldVersion, 2);
  assert.notEqual(composeField(next).style, 'any');
});
