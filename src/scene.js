import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BY_ID } from './catalog.js';
import { blockGeometry } from './block-geometry.js';

export class FloorScene {
  constructor(container, onZoom) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label', '3D floor preview');
    container.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-100, 100, 100, -100, .1, 4000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false; this.controls.maxPolarAngle = Math.PI / 2.05;
    this.controls.addEventListener('change', () => { this.render(); onZoom(this.camera.zoom); });
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(-80, 200, 100); this.scene.add(key);
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.geometries = Object.fromEntries(['cube', 'slab', 'stairs'].map(shape => [shape, blockGeometry(shape)]));
    this.materials = new Map();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container);
  }
  update(data, textures) {
    this.data = data;
    for (const mesh of [...this.group.children]) { mesh.dispose(); this.group.remove(mesh); }
    const groups = new Map();
    data.cells.forEach((role, i) => { const id = data.materials[role]; if (!groups.has(id)) groups.set(id, []); groups.get(id).push(i); });
    const matrix = new THREE.Matrix4();
    for (const [id, indices] of groups) {
      const block = BY_ID[id];
      const materials = (block.faces || Array(6).fill(block.texture)).map(path => {
        if (this.materials.has(path)) return this.materials.get(path);
        const source = textures[path];
        const image = document.createElement('canvas'); image.width = source.width; image.height = source.width;
        image.getContext('2d').drawImage(source, 0, 0, source.width, source.width, 0, 0, source.width, source.width);
        const texture = new THREE.CanvasTexture(image); texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.MeshLambertMaterial({ map: texture, alphaTest: .1, transparent: block.transparent });
        this.materials.set(path, material);
        return material;
      });
      // Solid columns have no visible internal faces; partial shapes keep their gaps.
      const solid = block.shape === 'cube' || !block.shape;
      const count = solid ? indices.length : indices.reduce((sum, i) => sum + (data.heights?.[i] || 1), 0);
      const material = materials.every(m => m === materials[0]) ? materials[0] : materials;
      const mesh = new THREE.InstancedMesh(this.geometries[block.shape || 'cube'], material, count);
      let j = 0;
      indices.forEach(i => {
        const h = data.heights?.[i] || 1;
        for (let y = 0; y < (solid ? 1 : h); y++) {
          matrix.makeScale(1, solid ? h : 1, 1);
          matrix.setPosition(i % data.width - data.width / 2 + .5, y, Math.floor(i / data.width) - data.depth / 2 + .5);
          mesh.setMatrixAt(j++, matrix);
        }
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); this.group.add(mesh);
    }
    this.fit();
  }
  fit() {
    const size = Math.max(this.data?.width || 64, this.data?.depth || 64);
    this.span = size * 1.65; this.camera.position.set(size * .8, size * 1.3, size * .8);
    this.camera.zoom = 1; this.controls.target.set(0, 0, 0); this.controls.update(); this.resize();
  }
  zoom(factor) { this.camera.zoom = Math.min(12, Math.max(.5, this.camera.zoom * factor)); this.camera.updateProjectionMatrix(); this.render(); }
  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    const aspect = w / h, span = this.span || 100;
    this.camera.left = -span * Math.max(1, aspect) / 2; this.camera.right = -this.camera.left;
    this.camera.top = span * Math.max(1, 1 / aspect) / 2; this.camera.bottom = -this.camera.top;
    this.camera.updateProjectionMatrix(); this.render();
  }
  render() { if (this.container.clientWidth) this.renderer.render(this.scene, this.camera); }
}
