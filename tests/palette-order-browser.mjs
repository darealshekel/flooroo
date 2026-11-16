import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeSettings } from '../src/catalog.js';

export async function checkPaletteOrder(page, name) {
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('mmm-floor-v3')));
  const swatch = index => page.locator(`#swatches [data-role="${index}"]`);
  const imported = normalizeSettings({ tile: 32, width: 64, depth: 64, paletteMode: 'keep',
    materials: ['stone', 'black_concrete', 'quartz_block', 'gold_block', 'purpur_block', 'sea_lantern', 'red_concrete'],
    allowedBlocks: ['stone', 'black_concrete', 'quartz_block', 'gold_block', 'purpur_block', 'sea_lantern', 'red_concrete'],
  });
  await page.locator('#import-file').setInputFiles({ name: 'palette.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'flooroo', version: 4, settings: imported })) });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('mmm-floor-v3')).materials[0] === 'stone');
  await page.locator('#tab-blocks').click();
  const original = await stored(), palette = original.materials;
  const pixels = () => page.locator('#floor-canvas').evaluate(canvas => canvas.toDataURL());
  const initialPixels = await pixels();
  async function startDrag(from, to) {
    await swatch(from).scrollIntoViewIfNeeded();
    const a = await swatch(from).boundingBox(), b = await swatch(to).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  }
  await startDrag(0, 4);
  assert.equal(await page.locator('.palette-drag-ghost').count(), 1);
  assert.equal(await swatch(4).evaluate(el => el.classList.contains('palette-drop-after')), true);
  await page.mouse.up();
  const moved = [palette[1], palette[2], palette[3], palette[4], palette[0], palette[5], palette[6]];
  assert.deepEqual((await stored()).materials, moved);
  assert.deepEqual({ ...await stored(), materials: palette }, original, 'Only active palette order changes');
  assert.equal(await page.locator('#material-dialog').isVisible(), false, 'Drag must not open the picker');
  assert.notEqual(await pixels(), initialPixels, 'The actual textured floor changes');
  await page.keyboard.press('Control+z'); assert.deepEqual(await stored(), original);
  await page.keyboard.press('Control+x'); assert.deepEqual((await stored()).materials, moved);
  await page.keyboard.press('Control+z');
  await startDrag(4, 0); await page.keyboard.press('Escape'); await page.mouse.up();
  assert.deepEqual(await stored(), original, 'Escape cancels the entire drag');
  assert.equal(await page.locator('.palette-drag-ghost').count(), 0);
  await startDrag(0, 6);
  const bounds = await page.locator('#swatches').boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height + 60);
  await page.mouse.up();
  assert.deepEqual(await stored(), original, 'Drop outside the row does not reorder');
  assert.equal(await page.locator('#material-dialog').isVisible(), false);
  const first = await swatch(0).boundingBox();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 500, first.y - 80);
  await page.mouse.up();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  assert.deepEqual(await stored(), original, 'A fast drag outside the row cannot leave a pending gesture');
  assert.equal(await page.locator('.palette-drag-ghost').count(), 0);
  await swatch(0).focus(); await page.keyboard.press('Alt+ArrowLeft');
  assert.deepEqual(await stored(), original, 'First position cannot move past the edge');
  await page.keyboard.press('Alt+ArrowRight');
  assert.deepEqual((await stored()).materials, [palette[1], palette[0], ...palette.slice(2)]);
  assert.equal(await swatch(1).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Alt+ArrowLeft'); assert.deepEqual(await stored(), original);

  await swatch(1).click();
  assert.equal(await page.locator('#palette-position').inputValue(), '1');
  await page.locator('#palette-position').selectOption('6');
  assert.deepEqual((await stored()).materials, [palette[0], ...palette.slice(2), palette[1]]);
  assert.equal(await page.locator('#material-role').innerText(), 'Trim');
  await page.locator('#block-search').fill('calcite');
  await page.locator('[data-block="calcite"]').click();
  assert.equal((await stored()).materials[6], 'calcite', 'Editing follows the moved block');
  await page.locator('#undo').click(); await page.locator('#undo').click();
  assert.deepEqual(await stored(), original, 'Move and block replacement are separate undo steps');

  if (name === 'mobile') {
    await swatch(6).scrollIntoViewIfNeeded();
    const a = await swatch(6).boundingBox(), b = await swatch(0).boundingBox();
    const client = await page.context().newCDPSession(page);
    const touch = (type, x, y) => client.send('Input.dispatchTouchEvent', { type,
      touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1 }],
    });
    try {
      await touch('touchStart', a.x + a.width / 2, a.y + a.height / 2);
      for (let step = 1; step <= 12; step++) await touch('touchMove', a.x + a.width / 2 + (b.x - a.x) * step / 12, a.y + a.height / 2 + (b.y - a.y) * step / 12);
      await touch('touchEnd');
      assert.deepEqual((await stored()).materials, [palette[6], ...palette.slice(0, 6)], 'Real touch drag reorders');
      await page.locator('#undo').click();
      await swatch(6).scrollIntoViewIfNeeded();
      const c = await swatch(6).boundingBox();
      await touch('touchStart', c.x + c.width / 2, c.y + c.height / 2);
      await touch('touchMove', c.x - 80, c.y + c.height / 2);
      await touch('touchCancel');
      assert.deepEqual(await stored(), original, 'Cancelled touch gesture does not change the palette');
      assert.equal(await page.locator('.palette-drag-ghost').count(), 0);
    } finally { await client.detach(); }
  }

  await swatch(2).click(); await page.locator('#palette-position').selectOption('0');
  const savedOrder = (await stored()).materials;
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL(`../test-results/palette-position-${name}.png`, import.meta.url)), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('[data-close="material-dialog"]').click();
  await page.locator('#palette-name').fill('Reordered palette');
  await page.locator('#save-palette').click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('mmm-floor-palettes')).at(-1).materials), savedOrder);
  const savedOption = await page.locator('#palette').inputValue();
  await page.locator('#palette').selectOption('crimson');
  await page.locator('#palette').selectOption(savedOption);
  assert.deepEqual((await stored()).materials, savedOrder);
  await page.locator('#generate').click();
  assert.deepEqual((await stored()).materials, savedOrder, 'Keep palette keeps the exact order');
  await page.reload(); await page.locator('#loading').waitFor({ state: 'hidden' });
  assert.deepEqual((await stored()).materials, savedOrder);
  await page.locator('[data-tool="brush"]').click();
  await page.locator('#paint-block').click();
  assert.equal(await page.locator('#palette-position-row').isVisible(), false, 'Paint picker cannot reorder the palette');
  await page.locator('[data-close="material-dialog"]').click();
  console.log(`${name}: palette mouse/keyboard/touch moves, cancellation, undo, picker, saved order, reload passed`);
}

export async function checkPaletteSize(page, name) {
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('mmm-floor-v3')));
  const swatches = page.locator('#swatches [data-role]');
  const imported = normalizeSettings({ tile: 32, width: 64, depth: 64, materials: ['stone', 'quartz_block', 'gold_block', 'black_concrete', 'purpur_block', 'sea_lantern', 'red_concrete'] });
  await page.locator('#import-file').setInputFiles({ name: 'small-palette.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'flooroo', version: 4, settings: imported })) });
  await page.locator('#tab-blocks').click();
  assert.equal(await page.locator('#add-palette-block').isDisabled(), true);
  for (let length = 7; length > 2; length--) {
    const remove = page.locator('#swatches [data-remove-role="2"]');
    if (name === 'mobile') await remove.tap(); else await remove.click();
    assert.equal((await stored()).materials.length, length - 1);
    assert.equal(await swatches.count(), length - 1);
    assert.equal(await page.locator('#material-dialog').isVisible(), false, 'Delete cannot open the picker');
  }
  assert.deepEqual((await stored()).materials, ['stone', 'quartz_block']);
  assert.equal(await page.locator('#palette-type').innerText(), '2 blocks');
  assert.equal(await page.locator('#swatches [data-remove-role]:disabled').count(), 2);
  await page.locator('#undo').click(); assert.equal(await swatches.count(), 3);
  await page.locator('#redo').click(); assert.equal(await swatches.count(), 2);
  const small = await stored();
  await page.locator('#add-palette-block').click();
  assert.equal(await page.locator('#palette-position-row').isVisible(), false);
  await page.locator('[data-close="material-dialog"]').click();
  assert.deepEqual(await stored(), small, 'Cancelling add does not change the palette');
  await page.locator('#palette-name').fill('Two blocks'); await page.locator('#save-palette').click();
  const savedOption = await page.locator('#palette').inputValue();
  for (const id of ['gold_block', 'black_concrete', 'purpur_block', 'sea_lantern', 'red_concrete']) {
    await page.locator('#add-palette-block').click();
    await page.locator('#block-search').fill(id);
    await page.locator(`[data-block="${id}"]`).click();
    assert.equal((await stored()).materials.at(-1), id);
    assert.equal(await page.locator('#delete-palette').isDisabled(), true, 'A longer palette is not a saved-prefix match');
  }
  assert.equal(await page.locator('#add-palette-block').isDisabled(), true);
  await page.locator('#undo').click(); assert.equal(await swatches.count(), 6);
  await page.locator('#redo').click(); assert.equal(await swatches.count(), 7);
  await page.locator('#palette').selectOption(savedOption);
  assert.deepEqual((await stored()).materials, small.materials);
  await page.locator('#swatches [data-role="0"]').click();
  assert.equal(await page.locator('#palette-position option').count(), 2);
  await page.locator('#palette-position').selectOption('1');
  await page.locator('[data-close="material-dialog"]').click();
  assert.deepEqual((await stored()).materials, ['quartz_block', 'stone']);
  await page.locator('#generate').click();
  assert.deepEqual((await stored()).materials, ['quartz_block', 'stone']);
  await page.locator('#random-palette').click(); assert.equal((await stored()).materials.length, 2);
  await page.locator('[data-palette-mode="random"]').click(); await page.locator('#generate').click();
  assert.equal((await stored()).materials.length, 2);
  await page.locator('#palette').selectOption(savedOption);
  await page.reload(); await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.locator('#tab-blocks').click();
  assert.deepEqual((await stored()).materials, small.materials);
  assert.equal(await page.locator('#delete-palette').isDisabled(), false, 'Two-block named palette survives reload');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: fileURLToPath(new URL(`../test-results/palette-two-blocks-${name}.png`, import.meta.url)), fullPage: true });
  await page.locator('#view-3d').click();
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#three-container canvas');
    const gl = canvas?.getContext('webgl2');
    if (!gl) return false;
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let visible = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) visible++;
    return visible > 10000;
  });
  await page.screenshot({ path: fileURLToPath(new URL(`../test-results/palette-two-blocks-${name}-3d.png`, import.meta.url)), fullPage: true });
  await page.locator('#view-top').click();
  console.log(`${name}: remove to two, minimum guard, add/cancel, undo, saved palette, random size, reload and 3D passed`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height }, hasTouch: name === 'mobile' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4406');
      await page.locator('#loading').waitFor({ state: 'hidden' });
      await checkPaletteOrder(page, name);
      await checkPaletteSize(page, name);
      assert.deepEqual(errors, []); await page.close();
    }
  } finally { await browser.close(); }
}
