import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { read } from 'nbtify';
import { VERSIONS } from '../src/versions.js';
import { availableBlocks, BLOCKS } from '../src/catalog.js';
import { encodeCell, isProtected } from '../src/editing.js';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true }), errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1040 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto('http://127.0.0.1:4406'); await page.locator('#loading').waitFor({ state: 'hidden' });
  const settings = () => page.evaluate(() => JSON.parse(localStorage.getItem('mmm-floor-v3')));
  await page.locator('#tab-blocks').click();
  for (const version of VERSIONS) {
    await page.locator('#version').selectOption(version.id);
    const count = availableBlocks(version.id).length;
    assert.equal(await page.locator('#block-pool-count').innerText(), `${count} / ${count}`);
  }
  await page.locator('#swatches button').first().click();
  await page.locator('#block-search').fill('poplar');
  assert.equal(await page.locator('#block-picker [data-block="poplar_planks"]').count(), 1);
  await page.locator('[data-block="poplar_planks"]').click();
  await page.locator('#version').selectOption('26.2');
  assert.ok(await page.locator('#version-warning').isVisible());
  await page.locator('#swatches button').first().click();
  await page.locator('#block-search').fill('poplar');
  assert.equal(await page.locator('#block-picker [data-block]').count(), 0);
  await page.locator('[data-close="material-dialog"]').click();
  await page.locator('#version').selectOption('1.12.2');
  assert.ok(await page.locator('#export-litematic').isDisabled());
  await page.locator('#convert-blocks').click();
  assert.ok(await page.locator('#version-warning').isHidden());
  await page.locator('#undo').click(); assert.ok(await page.locator('#version-warning').isVisible());
  await page.locator('#redo').click();
  await page.locator('#export').click();
  assert.match(await page.locator('#export-litematic small').innerText(), /\.schematic.*1\.12\.2/);
  const waitLegacy = page.waitForEvent('download'); await page.locator('#export-litematic').click();
  const legacy = await waitLegacy;
  assert.ok(legacy.suggestedFilename().endsWith('.schematic'));
  const nbt = await read(await readFile(await legacy.path()));
  assert.equal(nbt.rootName, 'Schematic'); assert.equal(nbt.data.Materials, 'Alpha');
  await page.locator('[data-close="export-dialog"]').click();

  await page.locator('#block-library').click();
  assert.equal(await page.locator('#library-blocks input').count(), availableBlocks('1.12.2').length);
  await page.locator('#clear-shown').click(); assert.ok(await page.locator('#apply-blocks').isDisabled());
  await page.locator('#library-group').selectOption('Wool');
  assert.equal(await page.locator('#library-blocks input').count(), 16);
  await page.locator('#select-shown').click(); assert.equal(await page.locator('#selection-count').innerText(), '16 / 16 selected');
  await page.locator('#library-search').fill('blue');
  await page.locator('input[value="light_blue_wool"]').uncheck();
  assert.equal(await page.locator('#selection-count').innerText(), '15 / 16 selected');
  await page.locator('#apply-blocks').click();
  assert.equal((await settings()).allowedBlocks.length, 15);
  await page.locator('[data-palette-mode="random"]').click();
  for (let i = 0; i < 3; i++) {
    await page.locator('#generate').click();
    assert.ok((await settings()).materials.every(id => id.endsWith('_wool') && id !== 'light_blue_wool'));
  }
  const palette = (await settings()).materials;
  await page.locator('#palette-name').fill('My wool palette'); await page.locator('#save-palette').click();
  await page.locator('#random-palette').click(); await page.locator('#palette').selectOption('saved:0');
  assert.deepEqual((await settings()).materials, palette);
  await page.reload(); await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.locator('#tab-blocks').click();
  assert.equal(await page.locator('#palette option[value="saved:0"]').innerText(), 'My wool palette');
  assert.equal((await settings()).allowedBlocks.length, 15);
  await page.locator('#delete-palette').click(); assert.equal(await page.locator('#palette option[value="saved:0"]').count(), 0);

  // New-bank painting and protection must survive version conversion, save and import.
  const poplar = BLOCKS.findIndex(b => b.id === 'poplar_planks');
  const cells = Array(32 ** 2).fill(0); cells[500] = encodeCell(poplar, 3, true);
  const design = { format: 'mmm-floor-studio', version: 4, settings: { version: '26.3', tile: 32, width: 32, depth: 32, border: 0, editLayer: { size: 32, cells } } };
  await page.locator('#import-file').setInputFiles({ name: 'new-blocks.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(design)) });
  await page.waitForFunction(() => document.getElementById('version').value === '26.3');
  assert.equal((await settings()).editLayer.cells[500], cells[500]);
  await page.locator('#version').selectOption('1.12.2'); await page.locator('#convert-blocks').click();
  assert.ok(isProtected((await settings()).editLayer.cells[500]));
  await page.locator('#undo').click(); assert.equal((await settings()).editLayer.cells[500], cells[500]);
  await page.locator('#undo').click(); assert.equal((await settings()).version, '26.3');
  await page.locator('#export').click();
  const waitModern = page.waitForEvent('download'); await page.locator('#export-litematic').click();
  const modern = await waitModern, parsed = await read(await readFile(await modern.path()));
  assert.equal(+parsed.data.MinecraftDataVersion, 5023);
  assert.ok(parsed.data.Regions.Floor.BlockStatePalette.some(b => b.Name === 'minecraft:poplar_planks'));
  await page.locator('[data-close="export-dialog"]').click();
  await page.locator('#view-3d').click(); await page.waitForTimeout(350);
  await page.screenshot({ path: 'test-results/versions-three-check.png', animations: 'disabled' });
  const pixels = await page.locator('#three-container canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl'), data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return data.filter((value, i) => i % 4 === 3 && value > 0).length;
  });
  assert.ok(pixels > 1000);
  await page.locator('#view-top').click();
  await page.screenshot({ path: 'test-results/versions-desktop.png', fullPage: true, animations: 'disabled' });
  await page.locator('#block-library').click();
  await page.screenshot({ path: 'test-results/block-library-desktop.png', animations: 'disabled' });
  assert.ok(await page.locator('#library-blocks img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)));
  await page.getByRole('button', { name: 'Close block selection', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#block-library').click();
  await page.screenshot({ path: 'test-results/block-library-mobile.png', animations: 'disabled' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok(await page.locator('#library-dialog').evaluate(el => el.scrollWidth <= el.clientWidth));
  await page.locator('#library-group').selectOption('Concrete');
  assert.ok(await page.locator('#clear-shown').isDisabled(), 'No concrete is selected in the default palette');
  await page.locator('input[value="white_concrete"]').check();
  await page.locator('#clear-shown').click();
  await page.locator('#apply-blocks').click();
  assert.ok((await settings()).allowedBlocks.every(id => !id.endsWith('_concrete')));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', versions: VERSIONS.length, blocks: BLOCKS.length, legacyExport: true, modernDataVersion: 5023, threePixels: pixels, savedPalettes: true, restrictedGeneration: true, protectedConversionUndo: true, mobile: true, errors }, null, 2));
} finally { await browser.close(); }
