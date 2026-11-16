import { Matrix3 } from 'three/src/math/Matrix3.js';
import { Vector3 } from 'three/src/math/Vector3.js';
import quantize from 'quantize';
import { randomSource } from './random.js';

export const FULL_CROP = [[0, 0], [1, 0], [1, 1], [0, 1]];
const rgb = hex => hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16));
const distance = (a, b) => a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0);
const nearest = (color, colors) => colors.reduce((best, value, i) => distance(color, value) < distance(color, colors[best]) ? i : best, 0);
const light = color => color[0] * .2126 + color[1] * .7152 + color[2] * .0722;

export function validCrop(points) {
  if (!Array.isArray(points) || points.length !== 4 || points.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => !Number.isFinite(v) || v < 0 || v > 1))) return false;
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const [a, b, c] = [points[i], points[(i + 1) % 4], points[(i + 2) % 4]];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) <= .0001) return false;
    area += a[0] * b[1] - a[1] * b[0];
  }
  return area > .01;
}

export function rectifyImage(image, points, size) {
  if (!validCrop(points)) throw new Error('The four corners must form a non-crossing area.');
  if (!Number.isInteger(size) || size < 2 || size > 192) throw new Error('Invalid tile resolution.');
  if (!image || image.width < 1 || image.height < 1 || image.width > 1024 || image.height > 1024 || image.data?.length !== image.width * image.height * 4) throw new Error('Invalid image pixels.');
  // Map the unit square to the selected quadrilateral in homogeneous coordinates.
  const [a, b, c, d] = points;
  const dx1 = b[0] - c[0], dx2 = d[0] - c[0], dx3 = a[0] - b[0] + c[0] - d[0];
  const dy1 = b[1] - c[1], dy2 = d[1] - c[1], dy3 = a[1] - b[1] + c[1] - d[1];
  const determinant = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / determinant, h = (dx1 * dy3 - dx3 * dy1) / determinant;
  const transform = new Matrix3().set(b[0] - a[0] + g * b[0], d[0] - a[0] + h * d[0], a[0], b[1] - a[1] + g * b[1], d[1] - a[1] + h * d[1], a[1], g, h, 1);
  const point = new Vector3();
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    point.set((x + .5) / size, (y + .5) / size, 1).applyMatrix3(transform);
    const u = point.x / point.z, v = point.y / point.z;
    const sx = Math.max(0, Math.min(image.width - 1, Math.floor(u * image.width)));
    const sy = Math.max(0, Math.min(image.height - 1, Math.floor(v * image.height)));
    data.set(image.data.subarray((sy * image.width + sx) * 4, (sy * image.width + sx) * 4 + 4), (y * size + x) * 4);
  }
  return { width: size, height: size, data };
}

export function referencePattern(image, points, { mode, size, candidates, seed = '0' }) {
  if (!['inspired', 'recreate', 'palette'].includes(mode) || !candidates?.length) throw new Error('Choose an image mode and compatible blocks.');
  const rectified = rectifyImage(image, points, size), pixels = [];
  for (let i = 0; i < rectified.data.length; i += 4) if (rectified.data[i + 3] >= 128) pixels.push(Array.from(rectified.data.subarray(i, i + 3)));
  if (!pixels.length) throw new Error('The selected area is transparent. Choose a visible area.');
  const colors = quantize(pixels, 7)?.palette() || [pixels[0]];
  const counts = Array(colors.length).fill(0);
  for (const pixel of pixels) counts[nearest(pixel, colors)]++;
  const order = colors.map((_, i) => i).filter(i => counts[i] > 0).sort((a, b) => counts[b] - counts[a]);
  const dark = order.reduce((a, b) => light(colors[a]) < light(colors[b]) ? a : b);
  const bright = order.reduce((a, b) => light(colors[a]) > light(colors[b]) ? a : b);
  const indices = [order[0]], remaining = () => order.filter(i => !indices.includes(i));
  indices[1] = remaining().includes(dark) ? dark : remaining().at(-1) ?? dark;
  indices[5] = remaining().includes(bright) ? bright : remaining()[0] ?? bright;
  for (const role of [2, 3, 4, 6]) indices[role] = remaining()[0] ?? order[role % order.length];
  const roleColors = indices.map(i => colors[i]);
  const blockColors = candidates.map(block => rgb(block.color));
  const materials = roleColors.map(color => candidates[nearest(color, blockColors)].id);
  const mappedColors = materials.map(id => blockColors[candidates.findIndex(block => block.id === id)]);
  const cells = Array(size * size).fill(0), random = randomSource(`reference:${seed}`);
  const offsetX = random() * .3, offsetY = random() * .3, scale = .65 + random() * .35;
  const swap = random() > .5, bend = .08 + random() * .16;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let sx = x, sy = y;
    if (mode === 'inspired') {
      // Fold and warp the reference's own fields; shared edges remain identical.
      let u = Math.abs(2 * x / (size - 1) - 1), v = Math.abs(2 * y / (size - 1) - 1);
      if (u < v) [u, v] = [v, u];
      const warp = Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI) * bend;
      const a = Math.min(1, Math.max(0, u * scale + offsetX + warp));
      const b = Math.min(1, Math.max(0, v * scale + offsetY - warp));
      sx = Math.floor((swap ? b : a) * (size - 1)); sy = Math.floor((swap ? a : b) * (size - 1));
    }
    const i = (sy * size + sx) * 4;
    if (rectified.data[i + 3] >= 128) cells[y * size + x] = nearest(Array.from(rectified.data.subarray(i, i + 3)), mappedColors);
  }
  return { materials, reference: { size, cells, mode: mode === 'inspired' ? 'inspired' : 'recreate' } };
}

export async function readReferenceImage(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP image.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Choose an image smaller than 12 MB.');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 32_000_000 || Math.max(bitmap.width, bitmap.height) > 8192) throw new Error('Image is too large. Maximum 32 megapixels and 8,192 pixels per side.');
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { canvas, pixels: context.getImageData(0, 0, canvas.width, canvas.height) };
  } catch (error) {
    if (error.name === 'InvalidStateError') throw new Error('This image could not be decoded. Choose another PNG, JPEG or WebP.');
    throw error;
  } finally { bitmap?.close(); }
}
