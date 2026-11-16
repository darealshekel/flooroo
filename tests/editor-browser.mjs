import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { encodeCell, isProtected } from '../src/editing.js';
import { BLOCKS } from '../src/catalog.js';
import { generateFloor, generateTile } from '../src/generator.js';
import { read } from 'nbtify';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
async function check3D(page) {
  await page.locator('#three-container canvas').waitFor(); await page.waitForTimeout(250);
  const result = await page.locator('#three-container canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let count = 0, minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (pixels[(y * w + x) * 4 + 3]) {
      count++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return { count, minX, minY, maxX, maxY, w, h };
  });
  assert.ok(result.count > 1000, 'Edited 3D floor must have visible geometry');
  assert.ok(result.minX > 5 && result.minY > 5 && result.maxX < result.w - 5 && result.maxY < result.h - 5, 'Edited 3D floor must be framed without clipping');
  return result.count;
}
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:4406');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  const settings = () => page.evaluate(() => JSON.parse(localStorage.getItem('mmm-floor-v3')));
  const pickTool = name => page.locator(`[data-tool="${name}"]`).click();
  const cellPoint = async (x, z) => {
    const r = await page.locator('#floor-canvas').boundingBox(), n = Number(await page.locator('#tile').inputValue());
    const bw = Math.min((r.width - 100) / n, (r.height - 100) / n);
    return { x: r.x + (r.width - n * bw) / 2 + (x + .5) * bw, y: r.y + (r.height - n * bw) / 2 + (z + .5) * bw };
  };
  const clickCell = async (x, z) => { const p = await cellPoint(x, z); await page.mouse.click(p.x, p.y); };
  const drag = async (from, to) => {
    const a = await cellPoint(...from), b = await cellPoint(...to);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
  };
  await page.locator('#tile').selectOption('64');
  await pickTool('brush');
  assert.equal(await page.locator('#scope').inputValue(), 'tile');
  assert.equal(await page.locator('#view-top').getAttribute('aria-pressed'), 'true');
  await page.locator('#paint-height').fill('2'); await page.locator('#paint-height').press('Tab');
  await drag([10, 12], [24, 12]);
  let s = await settings();
  const quartz = BLOCKS.findIndex(b => b.id === 'quartz_block');
  for (let x = 10; x <= 24; x++) for (const z of [12, 51]) {
    assert.equal(s.editLayer.cells[z * 64 + x], encodeCell(quartz, 2));
    assert.equal(s.editLayer.cells[z * 64 + 63 - x], encodeCell(quartz, 2));
  }
  const painted = s.editLayer;
  await page.locator('#undo').click(); assert.deepEqual((await settings()).editLayer.cells, [], 'A whole brush stroke is one undo step');
  await page.locator('#redo').click(); assert.deepEqual((await settings()).editLayer, painted);

  // Escape rolls back an in-progress stroke without leaving capture or a pending render behind.
  const a = await cellPoint(30, 8), b = await cellPoint(34, 8);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.locator('#floor-canvas').press('Escape'); await page.mouse.up();
  assert.deepEqual((await settings()).editLayer, painted);
  await pickTool('protect'); await page.locator('#brush-size').selectOption('5'); await clickCell(12, 12);
  s = await settings(); const locked = s.editLayer.cells.map((code, i) => isProtected(code) ? [i, code] : null).filter(Boolean);
  assert.equal(locked.length, 100);
  await pickTool('brush'); await page.locator('#brush-size').selectOption('1'); await clickCell(12, 12);
  assert.equal((await settings()).editLayer.cells[12 * 64 + 12], s.editLayer.cells[12 * 64 + 12]);
  await page.locator('#tab-blocks').click();
  await page.locator('[data-palette-mode="random"]').click(); await page.locator('#generate').click();
  s = await settings();
  for (const [i, code] of locked) assert.equal(s.editLayer.cells[i], code);
  assert.ok(s.editLayer.cells.every(code => !code || isProtected(code)), 'Generate discards only unprotected edits');

  await pickTool('line'); await page.locator('#edit-mirror').selectOption('none');
  await drag([18, 28], [38, 28]);
  s = await settings();
  for (let x = 18; x <= 38; x++) assert.equal(s.editLayer.cells[28 * 64 + x], encodeCell(quartz, 2));
  await pickTool('erase'); await clickCell(28, 28);
  assert.equal((await settings()).editLayer.cells[28 * 64 + 28], 0);
  await page.locator('#undo').click();

  await pickTool('brush'); await page.locator('#edit-mirror').selectOption('horizontal');
  await page.locator('#axis-x').fill('20'); await page.locator('#axis-x').press('Tab'); await clickCell(18, 32);
  s = await settings(); assert.equal(s.editLayer.cells[32 * 64 + 22], encodeCell(quartz, 2));
  await page.locator('#center-axes').click(); assert.equal(await page.locator('#axis-x').inputValue(), '31.5');
  await page.locator('#edit-mirror').selectOption('eight'); await clickCell(20, 25);
  s = await settings(); assert.equal(s.editLayer.cells[20 * 64 + 25], encodeCell(quartz, 2));

  await page.locator('#paint-block').click(); await page.locator('#block-search').fill('calcite'); await page.locator('[data-block="calcite"]').click();
  const beforeReplace = await settings(), beforeTile = generateTile(beforeReplace);
  await pickTool('replace');
  assert.ok(await page.locator('#edit-mirror').isDisabled());
  await clickCell(20, 28);
  s = await settings();
  const calcite = BLOCKS.findIndex(b => b.id === 'calcite');
  assert.equal(s.editLayer.cells[28 * 64 + 20], encodeCell(calcite, 2));
  s.editLayer.cells.forEach((code, i) => { if (code !== beforeReplace.editLayer.cells[i]) assert.equal(beforeTile.materials[beforeTile.cells[i]], 'quartz_block', 'Replace must not alter nonmatching mirrored blocks'); });
  for (const [i, code] of locked) assert.equal(s.editLayer.cells[i], code);
  await pickTool('fill'); await page.locator('#edit-mirror').selectOption('none'); await clickCell(4, 4);
  s = await settings(); assert.ok(s.editLayer.cells[4 * 64 + 4] > 0);

  await page.locator('#tab-pattern').click();
  await page.locator('#weirdness').fill('88'); await page.locator('#weirdness').dispatchEvent('change');
  await page.locator('#weirdness-enabled').uncheck();
  assert.ok(await page.locator('#weirdness').isDisabled()); assert.equal(await page.locator('#weirdness').inputValue(), '88');
  await page.locator('#advanced-settings summary').click();
  for (const [id, value] of [['shapeScale', '160'], ['fineDetail', '40'], ['emptySpace', '65']]) {
    await page.locator('#' + id).fill(value); await page.locator('#' + id).dispatchEvent('change');
    assert.equal((await settings())[id], Number(value));
  }
  await page.locator('#weirdness-enabled').check(); assert.equal(await page.locator('#weirdness').inputValue(), '88');
  s = await settings(); for (const [i, code] of locked) assert.equal(s.editLayer.cells[i], code);

  await pickTool('protect');
  await page.locator('#fit').click();
  await page.screenshot({ path: 'test-results/editor-desktop.png', fullPage: true });
  const waitJson = page.waitForEvent('download'); await page.locator('#save').click();
  const saved = await waitJson, json = JSON.parse(await readFile(await saved.path(), 'utf8'));
  assert.equal(json.version, 4);
  assert.deepEqual(json.settings.editLayer, s.editLayer);
  await page.reload(); await page.locator('#loading').waitFor({ state: 'hidden' });
  assert.deepEqual((await settings()).editLayer, s.editLayer);
  await page.locator('#reset').click();
  await page.locator('#import-file').setInputFiles({ name: 'edited.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
  await page.waitForFunction(() => document.getElementById('toast').textContent === 'Design opened.');
  assert.deepEqual((await settings()).editLayer, s.editLayer);

  await page.locator('#export').click(); const waitSchematic = page.waitForEvent('download'); await page.locator('#export-litematic').click();
  const schematic = await waitSchematic, nbt = await read(await readFile(await schematic.path()));
  const expected = generateFloor(s);
  assert.equal(+nbt.data.Metadata.TotalBlocks, expected.total);
  assert.ok(nbt.data.Regions.Floor.BlockStatePalette.some(b => b.Name === 'minecraft:quartz_block'));
  assert.ok(nbt.data.Regions.Floor.BlockStatePalette.some(b => b.Name === 'minecraft:calcite'));
  await page.locator('[data-close="export-dialog"]').click();
  await page.locator('#unlock-all').click(); assert.ok((await settings()).editLayer.cells.every(code => !isProtected(code)));
  await page.locator('#undo').click(); assert.deepEqual((await settings()).editLayer, s.editLayer);

  await page.locator('#scope').selectOption('tile'); await page.locator('#view-3d').click();
  const desktopPixels = await check3D(page);
  await page.screenshot({ path: 'test-results/editor-desktop-3d.png', fullPage: true });
  await page.locator('#clear-edits').click(); assert.ok((await settings()).editLayer.cells.every(code => !code || isProtected(code)));
  await page.locator('#undo').click(); assert.deepEqual((await settings()).editLayer, s.editLayer);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on('pageerror', e => errors.push(e.message));
  await mobile.goto('http://127.0.0.1:4406'); await mobile.locator('#loading').waitFor({ state: 'hidden' });
  await mobile.locator('[data-tool="brush"]').click(); await mobile.locator('#fit').click();
  const r = await mobile.locator('#floor-canvas').boundingBox();
  await mobile.touchscreen.tap(r.x + r.width * .4, r.y + r.height * .45);
  const mobileEdits = await mobile.evaluate(() => JSON.parse(localStorage.getItem('mmm-floor-v3')).editLayer.cells);
  assert.ok(mobileEdits.some(Boolean), 'Touch paints actual cells');
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mobile.screenshot({ path: 'test-results/editor-mobile.png', fullPage: true });
  await mobile.locator('#view-3d').click(); await mobile.locator('#three-container canvas').waitFor();
  assert.equal(await mobile.locator('[data-tool="pan"]').getAttribute('aria-pressed'), 'true');
  const mobilePixels = await check3D(mobile);
  await mobile.screenshot({ path: 'test-results/editor-mobile-3d.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', protectedCells: locked.length, desktopPixels, mobilePixels, tested: ['mouse painting', 'touch painting', 'single-stroke undo/redo', 'Escape cancellation', 'protected regeneration with random palette', 'line', 'fill', 'replace', 'erase', 'custom mirror axes', 'eight-way symmetry', 'weirdness toggle', 'shape/detail/space sliders', 'edited export', 'edited JSON import and autosave', 'unlock and clear with undo', 'edited 3D rendering and framing', 'mobile overflow'], errors }, null, 2));
} finally { await browser.close(); }
