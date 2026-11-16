import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, colorScheme: 'light' });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4406');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  const theme = () => page.locator('html').getAttribute('data-theme');
  const savedDesign = () => page.evaluate(() => localStorage.getItem('mmm-floor-v3'));
  const background = selector => page.locator(selector).evaluate(el => getComputedStyle(el).backgroundColor);
  assert.equal(await theme(), 'dark', 'First visit defaults to dark even with a light OS preference');
  assert.equal(await background('.app-header'), 'rgb(32, 36, 39)');
  assert.equal(await page.locator('#theme-toggle').getAttribute('aria-label'), 'Switch to light mode');
  assert.ok(await page.locator('.theme-light-icon svg').isVisible());
  assert.ok(await page.locator('.theme-dark-icon').isHidden());
  const toggle = await page.locator('#theme-toggle').boundingBox();
  const brand = await page.locator('.brand').boundingBox();
  assert.ok(toggle.x < brand.x && toggle.y < 64, 'Theme button is top left before the brand');
  const design = await savedDesign();
  const canvas = await page.locator('#floor-canvas').evaluate(el => el.toDataURL());
  await page.screenshot({ path: 'test-results/theme-dark-desktop.png', fullPage: true });

  await page.locator('#theme-toggle').click();
  assert.equal(await theme(), 'light');
  assert.equal(await background('.app-header'), 'rgb(255, 255, 255)');
  assert.equal(await page.locator('#theme-toggle').getAttribute('title'), 'Switch to dark mode');
  assert.ok(await page.locator('.theme-dark-icon svg').isVisible());
  assert.equal(await savedDesign(), design, 'Theme is separate from design state');
  assert.equal(await page.locator('#floor-canvas').evaluate(el => el.toDataURL()), canvas, 'Theme never changes block colors');
  assert.ok(await page.locator('#undo').isDisabled(), 'Theme toggle does not create an undo step');
  await page.screenshot({ path: 'test-results/theme-light-desktop.png', fullPage: true });
  await page.reload(); await page.locator('#loading').waitFor({ state: 'hidden' });
  assert.equal(await theme(), 'light', 'Explicit light choice survives reload');

  await page.locator('#theme-toggle').focus(); await page.keyboard.press('Enter');
  assert.equal(await theme(), 'dark');
  await page.reload(); await page.locator('#loading').waitFor({ state: 'hidden' });
  assert.equal(await theme(), 'dark', 'Explicit dark choice survives reload');
  assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#181b1e');
  await page.locator('#export').click();
  assert.equal(await background('#export-dialog'), 'rgb(32, 36, 39)');
  await page.locator('[data-close="export-dialog"]').click();
  await page.locator('#tab-blocks').click();
  await page.locator('#block-library').click();
  assert.equal(await background('#library-dialog'), 'rgb(32, 36, 39)');
  await page.screenshot({ path: 'test-results/theme-dark-library.png' });
  await page.locator('[data-close="library-dialog"]').first().click();
  await page.locator('#tab-pattern').click();

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const next of ['dark', 'light']) {
      if (await theme() !== next) await page.locator('#theme-toggle').click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${next} fits ${width}px`);
      const buttons = await page.locator('.app-header button').evaluateAll(elements => elements.map(el => {
        const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width };
      }));
      for (let i = 0; i < buttons.length; i++) {
        assert.ok(buttons[i].width >= 32 && buttons[i].left >= 0 && buttons[i].right <= width);
        if (i) assert.ok(buttons[i].left >= buttons[i - 1].right, 'Header buttons must not overlap');
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#theme-toggle').click();
  await page.screenshot({ path: 'test-results/theme-dark-mobile.png', fullPage: true });
  await page.evaluate(() => localStorage.setItem('flooroo-theme', 'invalid'));
  await page.reload(); await page.locator('#loading').waitFor({ state: 'hidden' });
  assert.equal(await theme(), 'dark', 'Unknown stored values safely fall back to dark');

  // Verify the theme is restored by the head script even before the app module is available.
  const early = await browser.newPage();
  await early.addInitScript(() => localStorage.setItem('flooroo-theme', 'light'));
  await early.route('**/src/main.js', route => route.abort());
  await early.goto('http://127.0.0.1:4406');
  assert.equal(await early.locator('html').getAttribute('data-theme'), 'light');
  assert.equal(await early.locator('html').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(247, 248, 249)');
  await early.close();

  const restricted = await browser.newPage();
  restricted.on('pageerror', error => errors.push(error.message));
  await restricted.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage unavailable'); };
    Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
  });
  await restricted.goto('http://127.0.0.1:4406');
  await restricted.locator('#loading').waitFor({ state: 'hidden' });
  assert.equal(await restricted.locator('html').getAttribute('data-theme'), 'dark');
  await restricted.locator('#theme-toggle').click();
  assert.equal(await restricted.locator('html').getAttribute('data-theme'), 'light', 'Toggle still works without storage');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', tested: ['dark default', 'top-left button', 'light/dark persistence', 'keyboard activation', 'unchanged design and canvas', 'dark dialogs', '320-1440px header fit', 'early theme restoration', 'invalid or blocked storage'], errors }, null, 2));
} finally { await browser.close(); }
