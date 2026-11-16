import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { read } from 'nbtify';

export async function checkReferenceImport(page, name = 'desktop') {
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('mmm-floor-v3')));
  const fixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#202229'; ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#c4e6df' : '#ad7356'; ctx.fillRect(x * 64 + 6, y * 64 + 6, 52, 52);
      ctx.fillStyle = '#202229'; ctx.fillRect(x * 64 + 12, y * 64 + 12, 40, 40);
      ctx.fillStyle = '#967bb3'; ctx.fillRect(x * 64 + 25, y * 64 + 14, 14, 36); ctx.fillRect(x * 64 + 14, y * 64 + 25, 36, 14);
    }
    return canvas.toDataURL().split(',')[1];
  });
  const file = { name: 'floor-reference.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') };
  const upload = async () => {
    await page.locator('#reference-open').click();
    await page.locator('#reference-file').setInputFiles(file);
    await page.waitForFunction(() => !document.getElementById('reference-apply').disabled);
  };
  const ready = () => page.waitForFunction(() => !document.getElementById('reference-apply').disabled);
  await page.locator('#reset').click();
  const original = await stored();
  await upload();
  assert.deepEqual(await stored(), original, 'preview does not mutate the design');
  assert.equal(await page.locator('#reference-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
  assert.equal(await page.locator('#reference-swatches img').count(), 7);
  const first = await page.locator('#reference-preview').evaluate(c => c.toDataURL());
  await page.locator('#reference-variation').click(); await ready();
  assert.notEqual(await page.locator('#reference-preview').evaluate(c => c.toDataURL()), first);
  await page.locator('[name="reference-mode"][value="recreate"]').check(); await ready();
  assert.equal(await page.locator('#reference-variation').isHidden(), true);
  const cropCanvas = await page.locator('#reference-source').boundingBox();
  await page.mouse.move(cropCanvas.x + cropCanvas.width * 104 / 640, cropCanvas.y + cropCanvas.height * 24 / 480);
  await page.mouse.down(); await page.mouse.move(cropCanvas.x + cropCanvas.width * .24, cropCanvas.y + cropCanvas.height * .12, { steps: 4 }); await page.mouse.up(); await ready();
  assert.ok(Number(await page.locator('#reference-x').inputValue()) > 0, 'Crop handles respond to pointer dragging');
  await page.locator('#reference-source').press('ArrowRight'); await ready();
  await page.locator('#reference-reset').click(); await ready();
  await page.locator('#reference-x').fill('15'); await page.locator('#reference-x').press('Tab'); await ready();
  await page.locator('#reference-y').fill('8'); await page.locator('#reference-y').press('Tab'); await ready();
  const crop = await page.locator('#reference-preview').evaluate(c => c.toDataURL());
  await page.locator('#reference-reset').click(); await ready();
  assert.notEqual(await page.locator('#reference-preview').evaluate(c => c.toDataURL()), crop);
  const out = new URL('../test-results/', import.meta.url); await mkdir(out, { recursive: true });
  await page.locator('#reference-dialog').screenshot({ path: fileURLToPath(new URL(`reference-${name}.png`, out)) });
  await page.locator('#reference-apply').click();
  const recreated = await stored();
  assert.equal(recreated.pattern, 'reference'); assert.equal(recreated.reference.mode, 'recreate');
  assert.equal(recreated.reference.cells.length, original.tile ** 2);
  assert.equal(recreated.width, original.width); assert.equal(recreated.depth, original.depth);
  assert.ok(!JSON.stringify(recreated).includes('data:image'), 'source pixels never enter autosave');
  await page.locator('#undo').click(); assert.deepEqual(await stored(), original);
  await page.locator('#redo').click(); assert.deepEqual(await stored(), recreated);
  await page.reload(); await page.locator('#loading').waitFor({ state: 'hidden' });
  assert.deepEqual(await stored(), recreated);
  await page.locator('[data-tool="brush"]').click();
  const canvas = await page.locator('#floor-canvas').boundingBox();
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  assert.ok((await stored()).editLayer.cells.some(Boolean), 'Recreated tiles remain paintable');
  await page.locator('#undo').click(); assert.deepEqual(await stored(), recreated);
  await page.locator('#export').click();
  const pending = page.waitForEvent('download'); await page.locator('#export-litematic').click();
  const schematic = await read(await readFile(await (await pending).path()));
  assert.equal(+schematic.data.Regions.Floor.Size.x, original.width);
  await page.locator('[data-close="export-dialog"]').click();
  await upload(); await page.locator('[name="reference-mode"][value="palette"]').check(); await ready();
  await page.locator('#reference-apply').click();
  const paletteOnly = await stored();
  assert.deepEqual(paletteOnly.reference, recreated.reference);
  assert.deepEqual(paletteOnly.editLayer, recreated.editLayer);
  assert.equal(paletteOnly.raised, recreated.raised);
  await upload(); await page.locator('#reference-cancel').click(); assert.deepEqual(await stored(), paletteOnly);
  await page.locator('#reference-open').click();
  await page.locator('#reference-file').setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG') });
  await page.waitForFunction(() => document.getElementById('reference-error').textContent.length > 0);
  assert.ok(await page.locator('#reference-apply').isDisabled());
  await page.locator('#reference-file').setInputFiles(file); await ready();
  await page.locator('#reference-x').fill('100'); await page.locator('#reference-x').press('Tab');
  await page.waitForFunction(() => document.getElementById('reference-error').textContent.includes('corners'));
  assert.ok(await page.locator('#reference-apply').isDisabled());
  await page.locator('#reference-reset').click(); await ready();
  await page.locator('#reference-apply').click();
  assert.equal((await stored()).reference.mode, 'inspired');
  await page.locator('#scope').selectOption('tile');
  await page.locator('#view-3d').click(); await page.locator('#three-container canvas').waitFor();
  await page.waitForTimeout(300);
  const count = await page.locator('#three-container canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let count = 0; for (let i = 3; i < data.length; i += 4) if (data[i]) count++;
    return count;
  });
  assert.ok(count > 10000, 'Image-derived design renders as actual 3D blocks');
  await page.locator('#view-top').click();
  await page.locator('#generate').click(); assert.equal((await stored()).pattern, 'field');
  await page.locator('#undo').click(); assert.equal((await stored()).pattern, 'reference');
  console.log(`${name}: image modes, crop, invalid uploads, cancel, undo, persistence, export and 3D passed`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4406');
      await page.locator('#loading').waitFor({ state: 'hidden' });
      await checkReferenceImport(page, name);
      assert.deepEqual(errors, []); await page.close();
    }
  } finally { await browser.close(); }
}
