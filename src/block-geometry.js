import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
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

// Resource-pack model faces keep partial blocks, cutouts and multipart posts distinct.
export function modelGeometry(models) {
  const geometry = new BufferGeometry(), positions = [], uvs = [], textures = [];
  const axes = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };
  const center = new Vector3(.5, .5, .5);
  for (const model of models) for (const element of model.elements) {
    const [x, y, z] = element.from, [a, b, c] = element.to;
    const corners = {
      east: [[a,y,c],[a,y,z],[a,b,z],[a,b,c]], west: [[x,y,z],[x,y,c],[x,b,c],[x,b,z]],
      up: [[x,b,c],[a,b,c],[a,b,z],[x,b,z]], down: [[x,y,z],[a,y,z],[a,y,c],[x,y,c]],
      south: [[x,y,c],[a,y,c],[a,b,c],[x,b,c]], north: [[a,y,z],[x,y,z],[x,b,z],[a,b,z]],
    };
    const defaultUv = { east: [16-c,16-b,16-z,16-y], west: [z,16-b,c,16-y], up: [x,z,a,c], down: [x,16-c,a,16-z], south: [x,16-b,a,16-y], north: [16-a,16-b,16-x,16-y] };
    for (const [side, face] of Object.entries(element.faces)) {
      if (!textures.includes(face.texture)) textures.push(face.texture);
      geometry.addGroup(positions.length / 3, 6, textures.indexOf(face.texture));
      const [u0, v0, u1, v1] = (face.uv || defaultUv[side]).map(n => n / 16);
      const uv = [[u0,1-v1],[u1,1-v1],[u1,1-v0],[u0,1-v0]];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const point = new Vector3(...corners[side][i]).divideScalar(16);
        if (element.rotation) {
          const { origin, axis, angle, rescale } = element.rotation, pivot = new Vector3(...origin).divideScalar(16);
          point.sub(pivot);
          if (rescale) for (const key of ['x','y','z']) if (key !== axis) point[key] /= Math.cos(angle * Math.PI / 180);
          point.applyAxisAngle(axes[axis], angle * Math.PI / 180).add(pivot);
        }
        point.sub(center).applyAxisAngle(axes.x, -(model.x || 0) * Math.PI / 180).applyAxisAngle(axes.y, -(model.y || 0) * Math.PI / 180).add(center);
        positions.push(point.x - .5, point.y, point.z - .5);
        uvs.push(...uv[(i + (face.rotation || 0) / 90) % 4]);
      }
    }
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.userData.textures = textures;
  return geometry;
}
