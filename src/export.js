import { Int8, Int16, Int32, write } from 'nbtify';
import { BY_ID, PATTERNS, supportsBlock } from './catalog.js';
import { getVersion } from './versions.js';

export const incompatibleBlocks = floor => [...floor.counts.keys()].filter(id => !supportsBlock(id, floor.settings.version));
function validateVersion(floor) {
  if (incompatibleBlocks(floor).length) throw new Error('Replace blocks unavailable in the selected Minecraft version before exporting.');
}

// Litematica packs continuously across long boundaries (unlike modern chunk data).
export function packStates(indices, paletteSize) {
  const bits = Math.max(2, Math.ceil(Math.log2(paletteSize)));
  const words = new BigUint64Array(Math.ceil(indices.length * bits / 64));
  for (let i = 0; i < indices.length; i++) {
    const bit = i * bits, word = Math.floor(bit / 64), offset = bit % 64;
    const value = BigInt(indices[i]);
    words[word] |= value << BigInt(offset);
    if (offset + bits > 64) words[word + 1] |= value >> BigInt(64 - offset);
  }
  return new BigInt64Array(words.buffer);
}

export function schematicData(floor, time = Date.now()) {
  validateVersion(floor);
  const version = getVersion(floor.settings.version);
  if (version.legacy) throw new Error('Java 1.12.2 requires legacy .schematic export.');
  const { width, depth, maxHeight, cells, heights, settings, total, materials } = floor;
  const ids = ['air', ...new Set(materials.filter(id => floor.counts.has(id)))];
  const indexOf = new Map(ids.map((id, i) => [id, i]));
  const states = new Uint16Array(width * depth * maxHeight);
  for (let y = 0; y < maxHeight; y++) for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
    const i = z * width + x;
    if (y < heights[i]) states[(y * depth + z) * width + x] = indexOf.get(materials[cells[i]]);
  }
  const vec = (x, y, z) => ({ x: new Int32(x), y: new Int32(y), z: new Int32(z) });
  const size = vec(width, maxHeight, depth);
  const name = `${floor.tile.plan?.name || PATTERNS.find(p => p.id === settings.pattern).name} - ${width}x${depth}`;
  return {
    Version: new Int32(6), SubVersion: new Int32(1), MinecraftDataVersion: new Int32(version.dataVersion),
    Metadata: { Name: name, Author: 'flooroo', Description: `Seed ${settings.seed}; ${settings.tile}-block tiles`, RegionCount: new Int32(1), TimeCreated: BigInt(time), TimeModified: BigInt(time), TotalBlocks: new Int32(total), TotalVolume: new Int32(states.length), EnclosingSize: size },
    Regions: { Floor: { Position: vec(0, 0, 0), Size: size, BlockStatePalette: ids.map(id => {
      const state = BY_ID[id]?.exports?.[version.id] || BY_ID[id];
      return { Name: `minecraft:${state?.id || id}`, ...(state?.properties && Object.keys(state.properties).length ? { Properties: state.properties } : {}) };
    }), BlockStates: packStates(states, ids.length), Entities: [], TileEntities: [], PendingBlockTicks: [], PendingFluidTicks: [] } },
  };
}

export async function exportLitematic(floor) {
  return write(schematicData(floor), { endian: 'big', compression: 'gzip', rootName: '' });
}
export function legacySchematicData(floor) {
  validateVersion(floor);
  const { width, depth, maxHeight, cells, materials, heights } = floor;
  const blocks = new Int8Array(width * depth * maxHeight), data = new Int8Array(blocks.length);
  const tileEntities = [];
  for (const id of floor.counts.keys()) if (!BY_ID[id].legacy) throw new Error(`No legacy mapping for ${id}.`);
  for (let y = 0; y < maxHeight; y++) for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
    const i = z * width + x, out = (y * depth + z) * width + x;
    if (y < heights[i]) {
      const block = BY_ID[materials[cells[i]]];
      [blocks[out], data[out]] = block.legacy;
      if (block.legacyEntity) {
        const fields = Object.fromEntries(Object.entries(block.legacyEntity).map(([key,value]) => [key, typeof value === 'number' ? (['SkullType','Rot'].includes(key) ? new Int8(value) : new Int32(value)) : value]));
        tileEntities.push({ ...fields, x: new Int32(x), y: new Int32(y), z: new Int32(z) });
      }
    }
  }
  return { Materials: 'Alpha', Width: new Int16(width), Height: new Int16(maxHeight), Length: new Int16(depth), Blocks: blocks, Data: data, Entities: [], TileEntities: tileEntities, WEOriginX: new Int32(0), WEOriginY: new Int32(0), WEOriginZ: new Int32(0), WEOffsetX: new Int32(0), WEOffsetY: new Int32(0), WEOffsetZ: new Int32(0) };
}
export async function exportLegacySchematic(floor) {
  return write(legacySchematicData(floor), { endian: 'big', compression: 'gzip', rootName: 'Schematic' });
}
export function materialCsv(floor) {
  return ['Block,Quantity,Stacks,Shulker boxes', ...[...floor.counts].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${BY_ID[id].name},${n},${Math.ceil(n / 64)},${Math.ceil(n / 1728)}`)].join('\r\n');
}
export function download(data, filename, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
