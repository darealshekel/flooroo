import { BoxGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Bottom slabs and straight north-facing stairs match the exported block states.
export const SHAPE_BOXES = {
  cube: [[0, 0, 0, 1, 1, 1]],
  slab: [[0, 0, 0, 1, .5, 1]],
  stairs: [[0, 0, 0, 1, .5, 1], [0, .5, 0, 1, 1, .5]],
};

export function blockGeometry(shape = 'cube') {
  const parts = SHAPE_BOXES[shape].map(([x, y, z, right, top, back]) => {
    const part = new BoxGeometry(right - x, top - y, back - z);
    part.translate((x + right) / 2 - .5, (y + top) / 2, (z + back) / 2 - .5);
    const positions = part.attributes.position, uv = part.attributes.uv;
    for (let i = 0; i < positions.count; i++) {
      const px = positions.getX(i) + .5, py = positions.getY(i), pz = positions.getZ(i) + .5;
      const face = Math.floor(i / 4);
      const coords = [[1 - pz, py], [pz, py], [px, 1 - pz], [px, pz], [px, py], [1 - px, py]][face];
      uv.setXY(i, ...coords);
    }
    return part;
  });
  const geometry = mergeGeometries(parts);
  let offset = 0;
  for (const part of parts) {
    for (const group of part.groups) geometry.addGroup(offset + group.start, group.count, group.materialIndex);
    offset += part.index.count;
    part.dispose();
  }
  return geometry;
}
