import test from 'node:test';
import assert from 'node:assert/strict';
import { read, Int32 } from 'nbtify';
import { generateFloor, generateTile } from '../src/generator.js';
import { PATTERNS, PALETTES, BY_ID, DEFAULTS, LAYOUTS, normalizeSettings, randomPalette, nextDesign } from '../src/catalog.js';
import { composeDesign } from '../src/ornament.js';
import { exportLitematic, packStates, materialCsv } from '../src/export.js';

function unpack(words, length, paletteSize) {
  const bits = Math.max(2, Math.ceil(Math.log2(paletteSize))), mask = (1n << BigInt(bits)) - 1n;
  return Array.from({ length }, (_, i) => {
    const pos = i * bits, word = Math.floor(pos / 64), shift = pos % 64;
    let value = BigInt.asUintN(64, words[word]) >> BigInt(shift);
    if (shift + bits > 64) value |= BigInt.asUintN(64, words[word + 1]) << BigInt(64 - shift);
    return Number(value & mask);
  });
}

for (const pattern of PATTERNS) {
  for (const tile of [32, 48, 64, 96]) {
    test(`${pattern.id} ${tile}: valid, repeatable and mirror symmetric`, () => {
      const result = generateTile({ pattern: pattern.id, tile, seed: 'same-seed' });
      assert.deepEqual(result.cells, generateTile({ pattern: pattern.id, tile, seed: 'same-seed' }).cells);
      assert.ok(new Set(result.cells).size >= 5);
      for (let z = 0; z < tile; z++) for (let x = 0; x < tile; x++) {
        const value = result.cells[z * tile + x];
        assert.ok(value <= 6);
        assert.equal(value, result.cells[z * tile + tile - 1 - x]);
        assert.equal(value, result.cells[(tile - 1 - z) * tile + x]);
        assert.equal(value, result.cells[x * tile + z]);
      }
    });
  }
}

test('input constraints prevent excessive allocations and invalid palette blocks', () => {
  const s = normalizeSettings({ width: 999999, depth: -1, tile: 0, materials: ['bad'], detail: Infinity, border: -10, seed: 'x'.repeat(100) });
  assert.equal(s.width, 1024); assert.equal(s.depth, 16); assert.equal(s.tile, DEFAULTS.tile);
  assert.equal(s.border, 0); assert.equal(s.detail, DEFAULTS.detail); assert.equal(s.seed.length, 32);
  assert.ok(s.materials.every(id => BY_ID[id]));
});

test('full-floor material counts equal all solid blocks including raised columns', () => {
  for (const p of PALETTES) for (const raised of [true, false]) {
    const f = generateFloor({ width: 121, depth: 87, raised, palette: p.id });
    assert.equal([...f.counts.values()].reduce((a, b) => a + b, 0), f.total);
    assert.equal(f.heights.reduce((a, b) => a + b, 0), f.total);
    assert.equal(f.cells.length, 121 * 87);
    assert.ok(f.heights.every(h => h >= 1 && h <= 3));
    assert.equal(f.maxHeight, raised ? 3 : 1);
  }
});

test('seamless tile repetition without an outer border', () => {
  const f = generateFloor({ width: 192, depth: 128, tile: 64, border: 0 });
  for (let z = 0; z < f.depth; z++) for (let x = 0; x < f.width; x++) assert.equal(f.cells[z * f.width + x], f.tile.cells[(z % 64) * 64 + x % 64]);
});

test('256 seeds generate distinct compositions, not resized copies of four tiles', () => {
  const fingerprints = new Set(), structures = new Set(), layouts = new Set(), motifs = new Set();
  let differences = 0, previous;
  for (let i = 0; i < 256; i++) {
    const tile = generateTile({ pattern: 'generated', seed: String(i), tile: 128 });
    const p = tile.plan;
    fingerprints.add(Buffer.from(tile.cells).toString('base64'));
    structures.add([p.layout, p.main.motif, p.main.profile, p.corner.motif, p.secondary.motif, p.frame, p.border].join(':'));
    layouts.add(p.layout); motifs.add(p.main.motif);
    if (previous) differences += tile.cells.reduce((sum, role, index) => sum + (role !== previous[index] ? 1 : 0), 0) / tile.cells.length;
    previous = tile.cells;
  }
  assert.equal(fingerprints.size, 256);
  assert.ok(structures.size >= 250);
  assert.equal(layouts.size, 6); assert.equal(motifs.size, 8);
  assert.ok(differences / 255 > .35, 'New seeds should change substantial geometry');
});

for (const layout of ['medallion', 'quartered', 'lattice', 'interlock', 'tapestry', 'radial']) {
  for (const tile of [128, 192]) test(`${layout} at ${tile}: complete symmetry and matching tile edges`, () => {
    const result = generateTile({ pattern: 'generated', layout, tile, seed: 'seam-check' });
    for (let z = 0; z < tile; z++) for (let x = 0; x < tile; x++) {
      assert.equal(result.cells[z * tile + x], result.cells[x * tile + z]);
      assert.equal(result.cells[z * tile + x], result.cells[z * tile + tile - 1 - x]);
    }
    for (let i = 0; i < tile; i++) {
      assert.equal(result.cells[i], result.cells[(tile - 1) * tile + i]);
      assert.equal(result.cells[i * tile], result.cells[i * tile + tile - 1]);
    }
  });
}

test('changing palette never changes geometry or composition', () => {
  const a = generateTile({ palette: 'obsidian', seed: '42' });
  const b = generateTile({ palette: 'verdant', seed: '42' });
  assert.deepEqual(a.cells, b.cells); assert.deepEqual(a.plan, b.plan);
});

test('style and layout constraints survive serialization and import', () => {
  const settings = normalizeSettings({ pattern: 'generated', style: 'botanical', layout: 'lattice', seed: 'botany' });
  const plan = composeDesign(settings);
  assert.equal(plan.layout, 'lattice');
  assert.ok(['lotus', 'fern', 'quatrefoil', 'rose'].includes(plan.main.motif));
  assert.deepEqual(generateTile(settings).cells, generateTile(JSON.parse(JSON.stringify(settings))).cells);
});

test('duplicate material slots collapse to one count', () => {
  const f = generateFloor({ materials: Array(7).fill('stone_bricks') });
  assert.equal(f.counts.size, 1); assert.equal(f.counts.get('stone_bricks'), f.total);
});

test('weirdness and palette behavior are bounded and survive serialization', () => {
  assert.equal(normalizeSettings({ weirdness: -9 }).weirdness, 0);
  assert.equal(normalizeSettings({ weirdness: 999 }).weirdness, 100);
  assert.equal(normalizeSettings({ weirdness: NaN }).weirdness, DEFAULTS.weirdness);
  assert.equal(normalizeSettings({ paletteMode: 'invalid' }).paletteMode, 'keep');
  const s = normalizeSettings({ palette: 'random', paletteMode: 'random', weirdness: 100 });
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(s))), s);
});

test('random palettes are real block combinations, diverse, deterministic and high contrast', () => {
  const palettes = new Set();
  for (let i = 0; i < 100; i++) {
    const colors = randomPalette(String(i));
    assert.equal(new Set(colors).size, 7);
    assert.ok(colors.every(id => BY_ID[id]));
    assert.ok(['sea_lantern', 'shroomlight', 'glowstone'].includes(colors[5]));
    assert.deepEqual(colors, randomPalette(String(i)));
    palettes.add(colors.join(','));
    assert.ok(!PALETTES.some(p => p.colors.join(',') === colors.join(',')));
  }
  assert.equal(palettes.size, 100);
});

test('generation keeps exact custom materials or rolls a palette according to the selected mode', () => {
  const s = normalizeSettings({ palette: 'random', materials: randomPalette('saved'), paletteMode: 'keep' });
  const kept = nextDesign(s, 'another');
  assert.deepEqual(kept.materials, s.materials);
  assert.notEqual(kept.seed, s.seed);
  const rolled = nextDesign({ ...s, paletteMode: 'random' }, 'another');
  assert.deepEqual(rolled.materials, randomPalette('another'));
  assert.notDeepEqual(rolled.materials, s.materials);
  assert.deepEqual(normalizeSettings({ ...rolled, weirdness: 90 }).materials, rolled.materials);
  assert.deepEqual(normalizeSettings({ ...rolled, width: 32 }).materials, rolled.materials);
  assert.deepEqual(generateTile(kept).cells, generateTile(rolled).cells);
  assert.equal(nextDesign({ pattern: 'generated', layout: 'lattice' }, 'new').layout, 'auto');
});

test('new generation does not select any reference-derived ornament layout', () => {
  const fingerprints = new Set(), layouts = new Set();
  for (let i = 0; i < 128; i++) {
    const tile = generateTile({ seed: String(i), tile: 64 });
    assert.equal(tile.settings.pattern, 'field');
    assert.ok(LAYOUTS.some(([id]) => id === tile.plan.layout));
    fingerprints.add(Buffer.from(tile.cells).toString('base64'));
    layouts.add(tile.plan.layout);
    assert.notDeepEqual(tile.cells, generateTile({ pattern: 'generated', seed: String(i), tile: 64 }).cells);
  }
  assert.equal(fingerprints.size, 128); assert.equal(layouts.size, 6);
});

for (const [layout] of LAYOUTS.slice(1)) for (const weirdness of [0, 50, 100]) {
  test(`${layout} at ${weirdness}%: deterministic, valid, seamless and responsive to weirdness`, () => {
    const input = { layout, weirdness, seed: 'wildness', tile: 128 };
    const a = generateTile(input), b = generateTile({ ...input, weirdness: weirdness === 100 ? 0 : 100 });
    assert.deepEqual(a.cells, generateTile(input).cells);
    const difference = a.cells.reduce((n, role, i) => n + (role !== b.cells[i]), 0) / a.cells.length;
    assert.ok(difference > .25, `Weirdness must alter geometry, difference: ${difference}`);
    assert.ok(a.cells.every(role => role >= 0 && role < 7));
    for (let i = 0; i < 128; i++) {
      assert.equal(a.cells[i], a.cells[127 * 128 + i]);
      assert.equal(a.cells[i * 128], a.cells[i * 128 + 127]);
    }
  });
}

test('packed block states cross 64-bit boundaries without loss', () => {
  for (const paletteSize of [2, 4, 5, 8, 9, 17]) {
    const ids = Array.from({ length: 1025 }, (_, i) => i % paletteSize);
    assert.deepEqual(unpack(packStates(ids, paletteSize), ids.length, paletteSize), ids);
  }
});

for (const raised of [false, true]) test(`Litematic round trip matches every ${raised ? 'layered' : 'flat'} block`, async () => {
  const f = generateFloor({ width: 37, depth: 42, raised });
  const bytes = await exportLitematic(f);
  assert.equal(bytes[0], 0x1f); assert.equal(bytes[1], 0x8b);
  const { data } = await read(bytes);
  assert.equal(+data.Version, 6); assert.ok(data.Version instanceof Int32);
  assert.equal(+data.Metadata.TotalBlocks, f.total);
  const region = data.Regions.Floor;
  assert.equal(+region.Size.x, 37); assert.equal(+region.Size.z, 42); assert.equal(+region.Size.y, f.maxHeight);
  assert.equal(region.BlockStatePalette[0].Name, 'minecraft:air');
  const ids = unpack(region.BlockStates, f.width * f.depth * f.maxHeight, region.BlockStatePalette.length);
  let solidCount = 0;
  for (let y = 0; y < f.maxHeight; y++) for (let z = 0; z < f.depth; z++) for (let x = 0; x < f.width; x++) {
    const i = z * f.width + x;
    const actual = region.BlockStatePalette[ids[(y * f.depth + z) * f.width + x]].Name;
    const expected = y < f.heights[i] ? `minecraft:${f.settings.materials[f.cells[i]]}` : 'minecraft:air';
    assert.equal(actual, expected); if (actual !== 'minecraft:air') solidCount++;
  }
  assert.equal(solidCount, f.total);
});

test('CSV material quantities are exact and all block names exist', () => {
  const f = generateFloor({ width: 16, depth: 16 });
  const lines = materialCsv(f).split('\r\n');
  assert.equal(lines.length, f.counts.size + 1);
  assert.equal(lines.slice(1).reduce((sum, line) => sum + Number(line.split(',')[1]), 0), f.total);
});
