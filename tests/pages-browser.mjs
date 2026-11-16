import { chromium } from 'playwright';
import { preview } from 'vite';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { read } from 'nbtify';
import { normalizeSettings } from '../src/catalog.js';
import { composeField } from '../src/fields.js';
import { checkReferenceImport } from './reference-browser.mjs';
import { checkPaletteOrder, checkPaletteSize } from './palette-order-browser.mjs';
import { checkExpandedCatalog } from './expanded-catalog-browser.mjs';

const output = new URL('../test-results/', import.meta.url);
await mkdir(output, { recursive: true });
const server = process.env.PREVIEW_URL ? null : await preview({
  base: '/flooroo/', preview: { host: '127.0.0.1', port: 0, open: false },
});
const url = process.env.PREVIEW_URL || `http://127.0.0.1:${server.httpServer.address().port}/flooroo/`;
const problems = [];
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: name === 'mobile' });
    const page = await context.newPage();
    page.on('pageerror', error => problems.push(error.message));
    page.on('response', response => { if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`); });
    page.on('requestfailed', request => problems.push(`${request.url()}: ${request.failure()?.errorText}`));
    const response = await page.goto(url);
    assert.equal(response.status(), 200);
    await page.locator('#loading').waitFor({ state: 'hidden' });
    assert.equal(await page.title(), 'flooroo | Minecraft floor designer');
    assert.equal(await page.locator('#total-blocks').innerText(), '65,536');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const colors = await page.locator('#floor-canvas').evaluate(canvas => {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const values = new Set();
      for (let i = 0; i < pixels.length; i += 64) values.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      return values.size;
    });
    assert.ok(colors > 32, `${name}: textured floor must render`);
    const styles = new Set();
    for (let seed = 0; styles.size < 4 && seed < 128; seed++) {
      const settings = normalizeSettings({ seed: String(seed), style: 'any', tile: 32, width: 32, depth: 32 });
      const { style } = composeField(settings);
      if (styles.has(style)) continue;
      await page.locator('#import-file').setInputFiles({ name: 'style.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'flooroo', version: 4, settings })) });
      await page.waitForFunction(seed => {
        const saved = JSON.parse(localStorage.getItem('mmm-floor-v3'));
        return saved.seed === seed && saved.style === 'any' && saved.fieldVersion === 2;
      }, settings.seed);
      const pixels = await page.locator('#floor-canvas').evaluate(canvas => canvas.toDataURL());
      await page.locator('#style').selectOption(style);
      assert.equal(await page.locator('#floor-canvas').evaluate(canvas => canvas.toDataURL()), pixels, `Everything renders real ${style} geometry`);
      styles.add(style);
    }
    assert.equal(styles.size, 4);
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('mmm-floor-v3'));
      delete saved.fieldVersion;
      saved.style = 'any';
      localStorage.setItem('mmm-floor-v3', JSON.stringify(saved));
    });
    await page.reload();
    await page.locator('#loading').waitFor({ state: 'hidden' });
    const savedVersion = () => page.evaluate(() => JSON.parse(localStorage.getItem('mmm-floor-v3')).fieldVersion);
    assert.equal(await savedVersion(), 1, 'Old autosaves retain legacy geometry');
    const oldPixels = await page.locator('#floor-canvas').evaluate(canvas => canvas.toDataURL());
    const legacySettings = await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('mmm-floor-v3'));
      delete saved.fieldVersion;
      return saved;
    });
    await page.locator('#import-file').setInputFiles({ name: 'old-design.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'flooroo', version: 4, settings: legacySettings })) });
    await page.waitForFunction(() => document.getElementById('toast').textContent === 'Design opened.');
    assert.equal(await savedVersion(), 1, 'Old JSON imports retain legacy geometry');
    assert.equal(await page.locator('#floor-canvas').evaluate(canvas => canvas.toDataURL()), oldPixels);
    await page.locator('#generate').click();
    assert.equal(await savedVersion(), 2);
    assert.equal(await page.locator('#style').inputValue(), 'any');
    await page.locator('#undo').click();
    assert.equal(await savedVersion(), 1);
    assert.equal(await page.locator('#floor-canvas').evaluate(canvas => canvas.toDataURL()), oldPixels);
    await page.locator('#style').selectOption('botanical');
    await page.locator('#style').selectOption('any');
    assert.equal(await savedVersion(), 2);
    await page.locator('#reset').click();
    await page.locator('#tab-blocks').click();
    await page.locator('#palette').selectOption('random');
    await page.locator('#block-library').click();
    await page.locator('#library-group').selectOption('Slabs');
    assert.ok(await page.locator('#library-blocks img').count() > 20);
    await page.locator('#library-blocks img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.locator('[data-close="library-dialog"]').first().click();
    await page.locator('[data-role="0"]').click();
    await page.locator('#block-search').fill('calcite');
    await page.locator('[data-block="calcite"] img').evaluate(image => image.decode());
    await page.locator('[data-block="calcite"]').click();
    const seed = await page.locator('#seed').inputValue();
    await page.locator('#generate').click();
    assert.notEqual(await page.locator('#seed').inputValue(), seed);
    await page.locator('#undo').click();
    assert.equal(await page.locator('#seed').inputValue(), seed);
    await page.locator('#tab-pattern').click();
    await page.locator('#width').fill('528');
    await page.locator('#width').press('Tab');
    assert.equal(await page.locator('#total-blocks').innerText(), '135,168');
    await page.locator('#export').click();
    const downloading = page.waitForEvent('download');
    await page.locator('#export-litematic').click();
    const download = await downloading;
    const schematic = await read(await readFile(await download.path()));
    assert.equal(+schematic.data.Regions.Floor.Size.x, 528);
    await page.locator('[data-close="export-dialog"]').click();
    await page.locator('#reset').click();
    await page.screenshot({ path: fileURLToPath(new URL(`pages-${name}.png`, output)), fullPage: true });
    await page.locator('#scope').selectOption('tile');
    await page.locator('#view-3d').click();
    await page.locator('#three-container canvas').waitFor();
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#three-container canvas');
      const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
      if (!gl) return false;
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let count = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) count++;
      return count > 10000;
    });
    await page.screenshot({ path: fileURLToPath(new URL(`pages-${name}-3d.png`, output)), fullPage: true });
    await page.reload();
    await page.locator('#loading').waitFor({ state: 'hidden' });
    await checkReferenceImport(page, name);
    await checkPaletteOrder(page, name);
    await checkPaletteSize(page, name);
    await checkExpandedCatalog(page, name);
    assert.deepEqual(problems, []);
    await context.close();
    console.log(`${name}: all four Everything styles, saved-design compatibility, built assets, textures, generation, undo, 528-wide export, 3D, reload passed`);
  }
  console.log(`Pages smoke test passed: ${url}`);
} finally {
  await browser?.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
