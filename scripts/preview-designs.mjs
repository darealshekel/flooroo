import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1284 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4406');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  console.log(await page.evaluate(async () => {
    const { generateTile } = await import('/src/generator.js');
    const { paintMap, loadTextures } = await import('/src/preview.js');
    const textures = await loadTextures();
    const seeds = ['85726', '1472', '42', '108', '101', '102', '103', '104', '105', '106', '107', '109'];
    const canvas = document.createElement('canvas'); canvas.width = 1440; canvas.height = 1284;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#141716'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.imageSmoothingEnabled = false;
    const plans = [];
    seeds.forEach((seed, i) => {
      const tile = generateTile({ seed, tile: 128, weirdness: [0, 35, 70, 100][i % 4], palette: 'random' });
      const map = paintMap(tile, textures, 3);
      const x = (i % 4) * 360 + 12, y = Math.floor(i / 4) * 428 + 12;
      ctx.drawImage(map, x, y, 336, 336);
      ctx.font = '16px Segoe UI'; ctx.fillStyle = '#eef1e9'; ctx.fillText(`${tile.plan.name} / ${seed}`, x, y + 362);
      ctx.font = '12px Segoe UI'; ctx.fillStyle = '#9ca99e'; ctx.fillText(`${tile.plan.layout} / Weirdness ${tile.settings.weirdness}% / Random palette`, x, y + 383);
      plans.push({ seed, name: tile.plan.name, layout: tile.plan.layout });
    });
    document.body.replaceChildren(canvas); document.body.style.margin = '0'; return plans;
  }));
  await page.screenshot({ path: 'test-results/generated-designs.png', fullPage: true });
} finally { await browser.close(); }
