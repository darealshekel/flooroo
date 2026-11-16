import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from 'nbtify';
import { FULL_CROP, validCrop, rectifyImage, referencePattern, readReferenceImage } from '../src/reference.js';
import { availableBlocks, BY_ID, normalizeSettings, nextDesign } from '../src/catalog.js';
import { generateFloor, generateTile } from '../src/generator.js';
import { exportLitematic, exportLegacySchematic } from '../src/export.js';
import { encodeCell, protectedLayer } from '../src/editing.js';

const candidates = ['black_concrete', 'white_concrete', 'red_concrete', 'blue_concrete'].map(id => BY_ID[id]);
function sample(n = 32) {
  const data = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const color = candidates[(x < n / 2 ? 0 : 1) + (y < n / 2 ? 0 : 2)].color.match(/[\da-f]{2}/gi).map(v => parseInt(v, 16));
    data.set([...color, 255], (y * n + x) * 4);
  }
  return { width: n, height: n, data };
}
const convert = (image = sample(), mode = 'recreate', extra = {}) => referencePattern(image, FULL_CROP, { mode, size: 32, candidates, ...extra });

test('recreate retains the reference orientation and each visible block-color region', () => {
  const result = convert();
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    assert.equal(result.materials[result.reference.cells[y * 32 + x]], candidates[(x < 16 ? 0 : 1) + (y < 16 ? 0 : 2)].id);
  }
  assert.deepEqual(rectifyImage(sample(), FULL_CROP, 32).data, sample().data);
});

test('perspective crop validates convex corners, rejects crossing and tiny selections', () => {
  assert.ok(validCrop([[.2, .1], [.85, .2], [.95, .8], [.05, .9]]));
  for (const points of [null, [[0, 0], [1, 1], [1, 0], [0, 1]], [[0, 0], [1, 0], [1, 0], [0, 0]], [[0, 0], [.01, 0], [.01, .01], [0, .01]], [[0, 0], [2, 0], [1, 1], [0, 1]]]) {
    assert.equal(validCrop(points), false);
    assert.throws(() => rectifyImage(sample(), points, 32), /corners/);
  }
  const cropped = rectifyImage(sample(), [[0, 0], [.5, 0], [.5, .5], [0, .5]], 32);
  assert.equal(new Set(Array.from({ length: 1024 }, (_, i) => Array.from(cropped.data.subarray(i * 4, i * 4 + 3)).join(','))).size, 1);
  const warped = rectifyImage(sample(), [[.1, .1], [.9, .2], [.8, .9], [.2, .8]], 32);
  assert.equal(warped.data.length, 4096);
  assert.ok(warped.data.every(Number.isFinite));
  const gradient = sample(64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) gradient.data.set([x, y, 0, 255], (y * 64 + x) * 4);
  const trapezoid = rectifyImage(gradient, [[.25, 0], [.75, 0], [1, 1], [0, 1]], 33);
  assert.deepEqual(Array.from(trapezoid.data.subarray((16 * 33 + 16) * 4, (16 * 33 + 16) * 4 + 2)), [32, 21], 'Projective center differs from an affine or bilinear crop');
});

test('inspired mode transforms reference shapes with reproducible, seamless variations', () => {
  const image = sample(64);
  for (let i = 0; i < 4096; i++) {
    const x = i % 64, y = Math.floor(i / 64);
    if ((x * 3 + y * 2) % 19 < 6) image.data.set([210, 213, 214, 255], i * 4);
  }
  const fingerprints = new Set();
  for (const seed of ['one', 'two', 'three', 'four', 'five']) {
    const result = convert(image, 'inspired', { seed });
    assert.deepEqual(result, convert(image, 'inspired', { seed }));
    fingerprints.add(result.reference.cells.join(''));
    assert.notDeepEqual(result.reference.cells, convert(image).reference.cells);
    const cells = result.reference.cells;
    for (let i = 0; i < 32; i++) {
      assert.equal(cells[i], cells[31 * 32 + i]);
      assert.equal(cells[i * 32], cells[i * 32 + 31]);
    }
  }
  assert.equal(fingerprints.size, 5);
});

test('image palette respects selected pools, old versions, flat images and transparency', () => {
  for (const version of ['1.12.2', '1.21', '26.3']) {
    const pool = availableBlocks(version, ['oak_slab', 'stone_bricks']);
    const result = convert(sample(), 'palette', { candidates: pool });
    assert.equal(result.materials.length, 7);
    assert.ok(result.materials.every(id => pool.some(b => b.id === id)));
  }
  const flat = sample(); flat.data.fill(255);
  assert.ok(convert(flat).materials.every(id => id === 'white_concrete'), 'Empty quantizer buckets cannot introduce unrelated colors');
  flat.data.fill(0);
  assert.throws(() => convert(flat), /transparent/);
  assert.throws(() => convert(sample(), 'invalid'), /mode/);
  assert.throws(() => convert(sample(), 'recreate', { size: 4096 }), /resolution/);
});

test('reference metadata is bounded, survives JSON and resizing, and clears on Generate', () => {
  const result = convert();
  const settings = normalizeSettings({ ...result, pattern: 'reference', tile: 32, border: 0 });
  const restored = normalizeSettings(JSON.parse(JSON.stringify(settings)));
  assert.deepEqual(generateTile(settings).cells, generateTile(restored).cells);
  const large = generateTile({ ...settings, tile: 64 });
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) assert.equal(large.cells[y * 64 + x], result.reference.cells[Math.floor(y / 2) * 32 + Math.floor(x / 2)]);
  assert.equal(nextDesign(settings, 'new').reference, null);
  for (const reference of [{ size: 9999, cells: [] }, { size: 32, cells: Array(1024).fill(7) }, { size: 32, cells: [0] }, { size: 32, cells: Array(1024).fill(NaN) }]) {
    const invalid = normalizeSettings({ pattern: 'reference', reference });
    assert.equal(invalid.reference, null); assert.equal(invalid.pattern, 'field');
  }
  assert.deepEqual(result.reference.cells, restored.reference.cells);
});

test('image floor preserves protected heights and supports modern and legacy export', async () => {
  const result = convert(), editLayer = { size: 32, cells: Array(1024).fill(0) };
  editLayer.cells[0] = encodeCell(0, 3, true);
  editLayer.cells[1] = encodeCell(1, 2, false);
  const floor = generateFloor({ ...result, pattern: 'reference', width: 64, depth: 32, tile: 32, border: 0, editLayer: protectedLayer(editLayer) });
  assert.equal(floor.heights[0], 3); assert.equal(floor.heights[1], 1);
  assert.equal([...floor.counts.values()].reduce((a, b) => a + b, 0), floor.total);
  const modern = await read(await exportLitematic(floor));
  assert.equal(+modern.data.Regions.Floor.Size.x, 64);
  const legacy = generateFloor({ ...result, pattern: 'reference', version: '1.12.2', width: 32, depth: 32, tile: 32, border: 0 });
  const old = await read(await exportLegacySchematic(legacy));
  assert.equal(+old.data.Width, 32);
});

test('invalid upload types and excessive file size are rejected before decoding', async () => {
  await assert.rejects(readReferenceImage({ type: 'image/svg+xml', size: 10 }), /PNG/);
  await assert.rejects(readReferenceImage({ type: 'image/png', size: 13 * 1024 * 1024 }), /12 MB/);
});
