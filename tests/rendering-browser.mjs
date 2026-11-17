import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { normalizeSettings } from '../src/catalog.js';
import atlas from '../src/top-textures.json' with { type: 'json' };

export async function checkRendering(browser, url, name, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: name === 'mobile' });
  const page = await context.newPage(), problems = [], requested = [];
  page.on('pageerror', error => problems.push(error.message));
  page.on('request', request => requested.push(request.url()));
  await page.addInitScript(() => {
    window.bufferUploads = 0;
    const original = WebGL2RenderingContext.prototype.bufferData;
    WebGL2RenderingContext.prototype.bufferData = function (...args) { window.bufferUploads++; return original.apply(this, args); };
  });
  let releaseModule;
  const gate = new Promise(resolve => { releaseModule = resolve; });
  await page.route('**/assets/scene-*.js', async route => { await gate; await route.continue(); });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator('#loading').waitFor({ state: 'hidden' });
    assert.ok(requested.filter(path => path.includes('/textures/')).length < 70, 'Startup must not request the whole texture catalog');
    const settings = normalizeSettings({ width: 32, depth: 32, tile: 32, border: 0, materials: ['stone', 'oak_fence'], pattern: 'reference', reference: { size: 32, cells: Array(1024).fill(0) } });
    await page.locator('#import-file').setInputFiles({ name: 'texture-test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'flooroo', version: 4, settings })) });
    await page.locator('#view-3d').click();
    assert.equal(await page.locator('#view-3d').getAttribute('aria-pressed'), 'true', '3D selection responds while its module is still pending');
    assert.equal(await page.locator('#viewport').getAttribute('aria-busy'), 'true');
    for (const id of ['zoom-in', 'zoom-out', 'fit']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
    await page.locator('#view-3d').click();
    await page.locator('#view-top').click();
    releaseModule();
    await page.locator('#three-container canvas').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#three-container').isVisible(), false, 'Late 3D initialization cannot override Top view');
    assert.equal(await page.locator('#zoom-in').isDisabled(), false, 'Top-view controls remain available after cancelling');
    assert.equal(await page.locator('#three-container canvas').count(), 1, 'Concurrent requests share one WebGL scene');
    await page.locator('#view-3d').click();
    await page.locator('#loading').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#zoom-in').isDisabled(), false, '3D controls become available after initialization');
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#three-container canvas'), gl = canvas.getContext('webgl2');
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let visible = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) visible++;
      return visible > 10000;
    });
    const bounds = await page.locator('#three-container').boundingBox();
    const original = await page.locator('#three-container canvas').screenshot();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .6, bounds.y + bounds.height * .45, { steps: 8 }); await page.mouse.up();
    const orbited = await page.locator('#three-container canvas').screenshot();
    assert.notDeepEqual(orbited, original, '3D must be interactive');
    const uploads = await page.evaluate(() => window.bufferUploads);
    await page.locator('#view-top').click();
    const started = Date.now();
    await page.locator('#view-3d').click();
    assert.equal(await page.locator('#loading').isVisible(), false, 'Cached 3D view returns without a loading cycle');
    assert.equal(await page.evaluate(() => window.bufferUploads), uploads, 'Switching views cannot rebuild GPU geometry');
    assert.deepEqual(await page.locator('#three-container canvas').screenshot(), orbited, 'Switching views preserves the camera');
    console.log(`${name}: cached 3D switch ${Date.now() - started}ms (including browser assertions/screenshot)`);
    await page.screenshot({ path: fileURLToPath(new URL(`../test-results/rendering-${name}-3d.png`, import.meta.url)), fullPage: true });
    await page.locator('#view-top').click();
    for (let i = 0; i < 6; i++) await page.locator('#zoom-in').click();
    const textureCheck = await page.locator('#floor-canvas').evaluate(async canvas => {
      const image = new Image(); image.src = new URL('textures/stone.png', location.href).href; await image.decode();
      const source = document.createElement('canvas'); source.width = source.height = 16;
      source.getContext('2d').drawImage(image, 0, 0);
      const expected = source.getContext('2d').getImageData(0, 0, 16, 16).data;
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const w = canvas.clientWidth, h = canvas.clientHeight, zoom = Number(document.querySelector('#zoom-value').textContent.replace('%', '')) / 100;
      // Zoom UI rounds; six 1.25x steps start from the default top-view zoom.
      const bw = Math.min((w - 100) / 32, (h - 100) / 32) * 1.25 ** 6;
      let matches = 0;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const px = Math.floor(w / 2 + (x + .5) * bw / 16), py = Math.floor(h / 2 + (y + .5) * bw / 16);
        const actual = (py * canvas.width + px) * 4, target = (y * 16 + x) * 4;
        if ([0, 1, 2].every(c => Math.abs(pixels[actual + c] - expected[target + c]) <= 1)) matches++;
      }
      return { matches, zoom };
    });
    assert.equal(textureCheck.matches, 256, `All native stone texture pixels must survive zoom: ${JSON.stringify(textureCheck)}`);
    const atlasUrl = requested.find(path => /\/assets\/block-tops-.*\.png/.test(path));
    assert.ok(atlasUrl, 'Top atlas is served as a hashed production asset');
    const shapes = await page.evaluate(async ({ atlasUrl, atlas }) => {
      const image = new Image(); image.src = atlasUrl; await image.decode();
      const result = {};
      for (const id of ['stone', 'oak_fence', 'oak_trapdoor', 'grass_block']) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = atlas.size;
        const i = atlas.ids.indexOf(id), ctx = canvas.getContext('2d');
        ctx.drawImage(image, i % atlas.columns * atlas.size, Math.floor(i / atlas.columns) * atlas.size, atlas.size, atlas.size, 0, 0, atlas.size, atlas.size);
        const pixels = ctx.getImageData(0, 0, atlas.size, atlas.size).data;
        let solid = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) solid++;
        result[id] = solid;
      }
      return result;
    }, { atlasUrl, atlas });
    assert.equal(shapes.stone, 1024); assert.equal(shapes.grass_block, 1024);
    assert.equal(shapes.oak_fence, 64, 'Fence uses its real 4x4 post footprint, not a full planks tile');
    assert.ok(shapes.oak_trapdoor > 0 && shapes.oak_trapdoor < 1024, 'Trapdoor texture retains its cutout holes');
    await page.screenshot({ path: fileURLToPath(new URL(`../test-results/rendering-${name}-texture.png`, import.meta.url)), fullPage: true });
    assert.deepEqual(problems, []);
    console.log(`${name}: immediate/cancellable 3D, shared scene, cached geometry/camera, native texture pixels and actual partial-block tops passed`);
  } finally { releaseModule(); await context.close(); }
}
