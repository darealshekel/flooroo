// Preserve original codes in the low byte; higher bytes add 32-block banks.
// Zero means no override. Old version-3 saved edits require no migration.
export const LOCK = 128;
export const isProtected = code => code > 0 && !!((code - 1) & LOCK);
export function encodeCell(block, height = 1, locked = false) { return 1 + block % 32 + Math.floor(block / 32) * 256 + (height - 1) * 32 + (locked ? LOCK : 0); }
export function decodeCell(code) {
  const value = code - 1;
  return { block: (value & 31) + (value >> 8) * 32, height: ((value >> 5) & 3) + 1, locked: isProtected(code) };
}

export function normalizeLayer(layer, size, blockCount = 256) {
  const oldSize = [32, 48, 64, 96, 128, 192].includes(layer?.size) ? layer.size : size;
  if (!Array.isArray(layer?.cells) || !layer.cells.length) return { size, cells: [] };
  const cells = Array(size * size).fill(0), offset = (size - oldSize) / 2;
  for (let i = 0; i < Math.min(layer.cells.length, oldSize * oldSize); i++) {
    const code = layer.cells[i], x = i % oldSize + offset, z = Math.floor(i / oldSize) + offset;
    if (Number.isInteger(code) && code > 0 && code <= encodeCell(blockCount - 1, 3, true) && decodeCell(code).block < blockCount && decodeCell(code).height <= 3 && x >= 0 && z >= 0 && x < size && z < size) cells[z * size + x] = code;
  }
  return { size, cells: cells.some(Boolean) ? cells : [] };
}

export function protectedLayer(layer) {
  return { size: layer.size, cells: layer.cells.map(code => isProtected(code) ? code : 0) };
}

export function mirrorPoints(x, z, size, mode = 'none', axisX = (size - 1) / 2, axisZ = (size - 1) / 2) {
  const points = [[x, z]];
  if (['horizontal', 'both', 'eight'].includes(mode)) points.push([2 * axisX - x, z]);
  if (['vertical', 'both', 'eight'].includes(mode)) points.push([x, 2 * axisZ - z]);
  if (['both', 'eight'].includes(mode)) points.push([2 * axisX - x, 2 * axisZ - z]);
  if (mode === 'eight') for (const [a, b] of [...points]) points.push([axisX + b - axisZ, axisZ + a - axisX]);
  return [...new Set(points.map(([a, b]) => [Math.round(a), Math.round(b)]).filter(([a, b]) => a >= 0 && b >= 0 && a < size && b < size).map(([a, b]) => b * size + a))];
}

export function linePoints(from, to) {
  const points = [], dx = to.x - from.x, dz = to.z - from.z, steps = Math.max(Math.abs(dx), Math.abs(dz));
  for (let i = 0; i <= steps; i++) points.push({ x: Math.round(from.x + dx * (steps ? i / steps : 0)), z: Math.round(from.z + dz * (steps ? i / steps : 0)) });
  return points;
}

export function brushIndices(from, to, options) {
  const { size, brush = 1, mirror, axisX, axisZ } = options, result = new Set(), radius = Math.floor(brush / 2);
  for (const { x, z } of linePoints(from, to)) for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
    for (const index of mirrorPoints(x + dx, z + dz, size, mirror, axisX, axisZ)) result.add(index);
  }
  return result;
}

export function regionIndices(data, start, layer, replace = false) {
  const { width: n, cells, materials } = data, target = materials[cells[start]], result = new Set();
  const eligible = i => !isProtected(layer[i]) && materials[cells[i]] === target;
  if (!eligible(start)) return result;
  if (replace) { for (let i = 0; i < cells.length; i++) if (eligible(i)) result.add(i); return result; }
  const stack = [start]; result.add(start);
  while (stack.length) {
    const i = stack.pop(), x = i % n, z = Math.floor(i / n);
    for (const j of [x > 0 ? i - 1 : -1, x < n - 1 ? i + 1 : -1, z > 0 ? i - n : -1, z < n - 1 ? i + n : -1]) {
      if (j >= 0 && !result.has(j) && eligible(j)) { result.add(j); stack.push(j); }
    }
  }
  return result;
}

export function editCells(layer, data, indices, tool, blockIndex, height, catalogIndex) {
  for (const i of indices) {
    if (i < 0 || i >= layer.length) continue;
    const locked = isProtected(layer[i]);
    if (tool === 'unprotect') { if (locked) layer[i] -= LOCK; }
    else if (tool === 'protect') layer[i] = encodeCell(catalogIndex[data.materials[data.cells[i]]], data.heights[i], true);
    else if (!locked) layer[i] = tool === 'erase' ? 0 : encodeCell(blockIndex, height);
  }
}
