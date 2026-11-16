import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { availableBlocks, normalizeSettings } from '../src/catalog.js';

export async function checkExpandedCatalog(page, name) {
  await page.locator('#tab-blocks').click();
  await page.locator('#version').selectOption('1.12.2');
  await page.locator('#block-library').click();
  await page.locator('#library-group').selectOption('');
  await page.locator('#library-search').fill('');
  assert.equal(await page.locator('#library-blocks input').count(), availableBlocks('1.12.2').length);
  for (const term of ['grass', 'carpet', 'leaves', 'bedrock', 'trapdoor', 'fence', 'wall', 'button']) {
    await page.locator('#library-search').fill(term);
    assert.ok(await page.locator('#library-blocks input').count() > 0, `${name}: ${term} in 1.12.2`);
    await page.locator('#library-blocks img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  }
  await page.locator('#library-search').fill('cherry');
  assert.equal(await page.locator('#library-blocks input').count(), 0);
  await page.locator('[data-close="library-dialog"]').first().click();
  await page.locator('#version').selectOption('26.3');
  await page.locator('#block-library').click();
  assert.ok(await page.locator('#library-blocks input').count() > 0);
  await page.locator('[data-close="library-dialog"]').first().click();
  const materials = ['grass_block','oak_leaves','white_carpet','oak_trapdoor','oak_fence','cobblestone_wall','bedrock'];
  const settings = normalizeSettings({ version:'1.12.2', width:32, depth:32, tile:32, border:0, materials,
    pattern:'reference', reference:{ size:32, mode:'recreate', cells:Array.from({length:1024}, (_,i)=>i%7) } });
  await page.locator('#import-file').setInputFiles({ name:'expanded.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify({format:'flooroo',version:4,settings})) });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('mmm-floor-v3')).materials[0] === 'grass_block');
  await page.locator('#view-3d').click();
  await page.locator('#three-container canvas').waitFor();
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#three-container canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    if (!gl) return false;
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let drawn=0; const colors=new Set();
    for(let i=0;i<pixels.length;i+=4) if(pixels[i+3]) { drawn++; colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`); }
    return drawn>10000 && colors.size>64;
  });
  await page.screenshot({path:fileURLToPath(new URL(`../test-results/expanded-catalog-${name}.png`,import.meta.url)),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#export').click();
  const download = page.waitForEvent('download'); await page.locator('#export-litematic').click();
  assert.match((await download).suggestedFilename(), /\.schematic$/);
  await page.locator('[data-close="export-dialog"]').click();
  console.log(`${name}: expanded 1.12.2 picker, modern filtering, textures, partial 3D models and legacy export passed`);
}
