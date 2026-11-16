import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { read } from 'nbtify';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4406'); await page.locator('#loading').waitFor({ state: 'hidden' });
  const settings = () => page.evaluate(() => JSON.parse(localStorage.getItem('mmm-floor-v3')));
  const dimension = async (id, value, key = 'Tab') => {
    await page.locator('#' + id).fill(value); await page.locator('#' + id).press(key);
  };
  assert.equal(await page.locator('#width').getAttribute('max'), '1024');
  assert.equal(await page.locator('#depth').getAttribute('max'), '1024');
  await dimension('width', '528', 'Enter');
  await dimension('depth', '528');
  assert.equal((await settings()).width, 528); assert.equal((await settings()).depth, 528);
  assert.equal(await page.locator('#dimension-tag').innerText(), '528 \u00d7 528');
  assert.equal(await page.locator('#floor-total-summary').innerText(), '278,784 blocks');
  const exact = await settings();
  for (const id of ['width', 'depth']) for (const invalid of ['', '15', '1025', '528.5']) {
    await dimension(id, invalid, 'Enter');
    assert.deepEqual(await settings(), exact, 'Invalid dimensions never alter the floor');
    assert.equal(await page.locator('#' + id).inputValue(), '528');
    assert.match(await page.locator('#toast').textContent(), /whole number from 16 to 1,024/);
  }
  await page.locator('#undo').click(); assert.equal((await settings()).depth, 256);
  await page.locator('#redo').click(); assert.equal((await settings()).depth, 528);
  await page.reload(); await page.locator('#loading').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#width').inputValue(), '528');
  assert.equal(await page.locator('#depth').inputValue(), '528');
  await page.locator('#tile').selectOption('32');
  await page.locator('label[for="raised"]').click();
  await page.locator('#view-3d').click();
  await page.locator('#three-container canvas').waitFor();
  await page.waitForTimeout(400);
  const check3D = async () => {
    const bounds = await page.locator('#three-container canvas').evaluate(canvas => {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, data = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
      let count = 0, minX = w, minY = h, maxX = 0, maxY = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3]) {
        count++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      return { count, minX, minY, maxX, maxY, w, h };
    });
    assert.ok(bounds.count > 10000, 'Larger floor has visible textured 3D geometry');
    assert.ok(bounds.minX > 5 && bounds.minY > 5 && bounds.maxX < bounds.w - 5 && bounds.maxY < bounds.h - 5, 'Larger floor is not clipped');
  };
  await check3D();
  const beforeOrbit = await page.locator('#three-container canvas').screenshot();
  const r = await page.locator('#three-container').boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down();
  await page.mouse.move(r.x + r.width * .6, r.y + r.height * .45, { steps: 5 }); await page.mouse.up();
  assert.notDeepEqual(await page.locator('#three-container canvas').screenshot(), beforeOrbit);
  await page.locator('#fit').click();
  await page.screenshot({ path: 'test-results/dimensions-528-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300); await check3D();
  await page.screenshot({ path: 'test-results/dimensions-528-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.locator('#view-top').click();

  await page.locator('#tab-blocks').click();
  await page.locator('#version').selectOption('1.12.2'); await page.locator('#convert-blocks').click();
  await page.locator('#export').click();
  const waitDownload = page.waitForEvent('download'); await page.locator('#export-litematic').click();
  const download = await waitDownload;
  const nbt = await read(await readFile(await download.path()));
  assert.equal(+nbt.data.Width, 528); assert.equal(+nbt.data.Length, 528);
  assert.ok(download.suggestedFilename().includes('528x528'));
  await page.locator('[data-close="export-dialog"]').click();
  await page.locator('#tab-pattern').click();
  await dimension('width', '1024'); await dimension('depth', '1024');
  assert.equal((await settings()).width, 1024); assert.equal((await settings()).depth, 1024);
  await page.locator('#view-3d').click(); await page.waitForTimeout(400); await check3D();
  await page.locator('#view-top').click();
  const pixels = await page.locator('#floor-canvas').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set(); for (let i = 0; i < data.length; i += 64) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return colors.size;
  });
  assert.ok(pixels > 20, 'Maximum size 2D preview remains nonblank and textured');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', tested: ['528x528 inputs and counts', 'Enter and blur', 'invalid input recovery', 'undo/redo', 'reload persistence', '528x528 raised desktop/mobile 3D and orbit', '1.12.2 schematic dimensions', '1024x1024 2D and 3D'], errors }, null, 2));
} finally { await browser.close(); }
