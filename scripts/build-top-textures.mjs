import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.route('**/__atlas', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Block top textures</title>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__atlas`);
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { BLOCKS } = await import('/src/catalog.js');
    const { blockGeometry, modelGeometry } = await import('/src/block-geometry.js');
    const size = 32, columns = Math.ceil(Math.sqrt(BLOCKS.length));
    const atlas = document.createElement('canvas');
    atlas.width = columns * size; atlas.height = Math.ceil(BLOCKS.length / columns) * size;
    const ctx = atlas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const paths = new Set(BLOCKS.flatMap(b => [b.texture, ...(b.faces || []), ...(b.models || []).flatMap(m => m.elements.flatMap(e => Object.values(e.faces).map(f => f.texture)))]));
    const materials = new Map();
    await Promise.all([...paths].map(async path => {
      const source = new Image(); source.src = path; await source.decode();
      const frame = document.createElement('canvas'); frame.width = frame.height = source.width;
      frame.getContext('2d').drawImage(source, 0, 0, source.width, source.width, 0, 0, source.width, source.width);
      const texture = new THREE.CanvasTexture(frame);
      texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = texture.magFilter = THREE.NearestFilter;
      materials.set(path, new THREE.MeshBasicMaterial({ map: texture, alphaTest: .1, side: THREE.DoubleSide, toneMapped: false }));
    }));
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(size, size); renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-.5, .5, .5, -.5, .1, 20);
    camera.position.set(0, 10, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0);
    for (const [index, block] of BLOCKS.entries()) {
      const geometry = block.models ? modelGeometry(block.models) : blockGeometry(block.shape || 'cube');
      const faces = geometry.userData.textures || block.faces || Array(6).fill(block.texture);
      const mesh = new THREE.Mesh(geometry, faces.map(path => materials.get(path)));
      scene.add(mesh); renderer.render(scene, camera);
      ctx.drawImage(renderer.domElement, index % columns * size, Math.floor(index / columns) * size);
      scene.remove(mesh); geometry.dispose();
    }
    for (const material of materials.values()) { material.map.dispose(); material.dispose(); }
    renderer.dispose();
    return { png: atlas.toDataURL('image/png').split(',')[1], metadata: { size, columns, ids: BLOCKS.map(b => b.id) } };
  });
  const output = new URL('../src/assets/', import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(new URL('block-tops.png', output), Buffer.from(result.png, 'base64'));
  await writeFile(new URL('../src/top-textures.json', import.meta.url), JSON.stringify(result.metadata, null, 2) + '\n');
  console.log(`Rendered ${result.metadata.ids.length} real block-model tops into one texture atlas.`);
} finally {
  await browser?.close();
  await server.close();
}
