import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4406');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('mmm-floor-v3')));
  assert.match(await page.title(), /^flooroo/);
  assert.equal(await page.locator('h1').innerText(), 'flooroo');
  assert.ok(await page.locator('#panel-pattern').isVisible());
  assert.ok(await page.locator('#panel-blocks').isHidden());
  assert.equal(await page.locator('#advanced-settings').getAttribute('open'), null);
  await page.locator('#tab-pattern').focus();
  await page.keyboard.press('ArrowRight');
  assert.ok(await page.locator('#panel-blocks').isVisible());
  assert.equal(await page.locator('#tab-blocks').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('End');
  assert.ok(await page.locator('#panel-materials').isVisible());
  assert.equal(await page.locator('#total-blocks').innerText(), '65,536');
  await page.keyboard.press('Home');
  assert.ok(await page.locator('#panel-pattern').isVisible());

  await page.locator('[data-tool="brush"]').click();
  await page.locator('#edit-mirror').selectOption('none');
  await page.locator('#fit').click();
  const clickCell = async (x, z, hold = false) => {
    const r = await page.locator('#floor-canvas').boundingBox(), n = (await state()).tile;
    const size = Math.min((r.width - 100) / n, (r.height - 100) / n);
    const px = r.x + (r.width - n * size) / 2 + (x + .5) * size;
    const py = r.y + (r.height - n * size) / 2 + (z + .5) * size;
    if (hold) { await page.mouse.move(px, py); await page.mouse.down(); }
    else await page.mouse.click(px, py);
  };
  const initial = await state();
  await clickCell(10, 12);
  const painted = await state();
  assert.notDeepEqual(painted.editLayer, initial.editLayer);
  await page.keyboard.press('Control+z'); assert.deepEqual(await state(), initial);
  await page.keyboard.press('Control+x'); assert.deepEqual(await state(), painted);
  await clickCell(20, 22);
  const second = await state();
  await page.keyboard.press('Control+z'); assert.deepEqual(await state(), painted);
  await page.keyboard.press('Control+z'); assert.deepEqual(await state(), initial);
  await page.keyboard.press('Control+x'); assert.deepEqual(await state(), painted);
  await page.keyboard.press('Control+x'); assert.deepEqual(await state(), second);
  await page.locator('#fit').focus();
  await page.keyboard.press('Control+z'); assert.deepEqual(await state(), painted, 'History works while a toolbar button is focused');
  await page.keyboard.press('Control+Shift+z'); assert.deepEqual(await state(), second);
  await page.keyboard.press('Meta+z'); assert.deepEqual(await state(), painted);
  await page.keyboard.press('Meta+x'); assert.deepEqual(await state(), second);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y'); assert.deepEqual(await state(), second);
  const duration = await page.locator('#undo').evaluate(el => getComputedStyle(el).transitionDuration);
  assert.equal(duration, '0s', 'Keyboard actions are instant');

  await page.keyboard.press('Control+z');
  await page.locator('#tab-blocks').click();
  await page.locator('#palette-name').fill('Cut this text');
  await page.locator('#palette-name').press('Control+a');
  await page.locator('#palette-name').press('Control+x');
  assert.equal(await page.locator('#palette-name').inputValue(), '', 'Ctrl+X still cuts text in inputs');
  assert.deepEqual(await state(), painted, 'Cut does not redo the floor');
  await page.locator('#palette-name').press('Control+z');
  assert.equal(await page.locator('#palette-name').inputValue(), 'Cut this text', 'Native text undo remains available');
  assert.deepEqual(await state(), painted);
  await page.locator('#export').click();
  await page.locator('#export-png').focus();
  await page.keyboard.press('Control+x'); assert.deepEqual(await state(), painted, 'Dialogs do not trigger floor history');
  await page.locator('[data-close="export-dialog"]').click();

  await clickCell(28, 28);
  const branched = await state();
  assert.ok(await page.locator('#redo').isDisabled());
  await page.keyboard.press('Control+x'); assert.deepEqual(await state(), branched, 'New edit discards the redo branch');
  await clickCell(30, 30, true);
  await page.keyboard.press('Control+z');
  await page.mouse.up();
  const held = await state();
  assert.notDeepEqual(held.editLayer, branched.editLayer);
  await page.keyboard.press('Control+z'); assert.deepEqual(await state(), branched, 'An active stroke is not interrupted by history shortcuts');
  await page.keyboard.press('Control+x'); assert.deepEqual(await state(), held);

  await page.locator('[data-tool="pan"]').click();
  await page.locator('#scope').selectOption('floor');
  await page.locator('#tab-pattern').click();
  await page.locator('#reset').click();
  await page.screenshot({ path: 'test-results/flooroo-desktop.png', fullPage: true });
  for (const width of [1920, 1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow at ${width}px`);
    const r = await page.locator('#floor-canvas').boundingBox();
    assert.ok(r.width > 300 && r.height >= 340, `Canvas has useful dimensions at ${width}px`);
    await page.locator('#tab-blocks').click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Blocks panel fits ${width}px`);
    await page.locator('#tab-pattern').click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/flooroo-mobile.png', fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#export').click();
  assert.equal(await page.locator('#export-dialog').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', tested: ['Ctrl+Z undo', 'Ctrl+X redo', 'Cmd shortcuts', 'standard redo aliases', 'multiple history steps', 'redo branching', 'text cut and undo', 'dialog isolation', 'active stroke safety', 'keyboard tab navigation', 'keyboard and reduced motion', '320-1920px responsive workspace'], errors }, null, 2));
} finally { await browser.close(); }
