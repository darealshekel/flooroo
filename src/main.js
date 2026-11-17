import { createIcons, Sun, Moon, Pickaxe, Download, Undo2, Redo2, Shuffle, ChevronDown, Plus, Minus, Maximize, Grid2X2, Box, Layers, ArrowUpRight, X, Check, Image as ImageIcon, FileJson, FolderOpen, Search, RotateCcw, FileDown, LoaderCircle, Hand, Paintbrush, Minus as LineIcon, PaintBucket, Replace, ShieldCheck, ShieldOff, Eraser, Eye, Trash2 } from 'lucide';
import { BLOCKS, BY_ID, ROLES, PALETTES, PATTERNS, STYLES, LAYOUTS, TILE_SIZES, FLOOR_SIZE_LIMITS, BLOCK_POOL_LIMITS, PALETTE_LIMITS, normalizeSettings, randomPalette, nextDesign, availableBlocks, supportsBlock, compatiblePalette, convertVersionBlocks, movePaletteSlot, removePaletteSlot } from './catalog.js';
import { bindPaletteReorder } from './palette-reorder.js';
import { VERSIONS, getVersion } from './versions.js';
import { assetUrl } from './assets.js';
import { generateFloor, generateTile } from './generator.js';
import { FlatPreview, loadTextures, paintMap, textureCache } from './preview.js';
import { download, exportLitematic, exportLegacySchematic, incompatibleBlocks, materialCsv } from './export.js';
import { LOCK, isProtected, brushIndices, mirrorPoints, regionIndices, editCells, protectedLayer } from './editing.js';
import './style.css';

const icons = { Sun, Moon, Pickaxe, Download, Undo2, Redo2, Shuffle, ChevronDown, Plus, Minus, Maximize, Grid2X2, Box, Layers, ArrowUpRight, X, Check, Image: ImageIcon, FileJson, FolderOpen, Search, RotateCcw, FileDown, LoaderCircle, Hand, Paintbrush, LineIcon, PaintBucket, Replace, ShieldCheck, ShieldOff, Eraser, Eye, Trash2 };
const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const renderIcons = () => createIcons({ icons, attrs: { 'stroke-width': 1.5 } });
const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString('en-US');
let settings;
try {
  const saved = JSON.parse(localStorage.getItem('mmm-floor-v3'));
  const previous = JSON.parse(localStorage.getItem('mmm-floor-v2'));
  // Existing drafts predate seeded style selection; preserve them until regeneration.
  settings = normalizeSettings(saved ? { ...saved, fieldVersion: saved.fieldVersion ?? 1 }
    : previous ? { ...previous, pattern: 'field', fieldVersion: 1, layout: 'auto' } : undefined);
} catch { settings = normalizeSettings(); }
let floor, textures = textureCache, scene, view = 'top', scope = 'floor', roleToEdit = 0;
let sceneModulePromise, scenePromise, viewRequest = 0;
let candidateSettings = [];
const freshSeed = () => String(crypto.getRandomValues(new Uint32Array(1))[0]);
const history = [JSON.stringify(settings)]; let historyIndex = 0;
const catalogIndex = Object.fromEntries(BLOCKS.map((block, index) => [block.id, index]));
const editTools = [['pan', 'hand', 'Pan'], ['brush', 'paintbrush', 'Paint blocks'], ['line', 'line-icon', 'Draw line'], ['fill', 'paint-bucket', 'Flood fill'], ['replace', 'replace', 'Replace matching blocks'], ['protect', 'shield-check', 'Protect region'], ['unprotect', 'shield-off', 'Unprotect region'], ['erase', 'eraser', 'Erase edits']];
let tool = 'pan', stroke, strokeFrame, pickerTarget = 'palette', autosaveWarning = false;
let selectedBlocks = new Set(), savedPalettes = [];
try {
  const stored = JSON.parse(localStorage.getItem('mmm-floor-palettes'));
  if (Array.isArray(stored)) savedPalettes = stored.filter(p => typeof p?.name === 'string' && p.name.length <= 40 && Array.isArray(p.materials) && p.materials.length >= PALETTE_LIMITS.min && p.materials.length <= PALETTE_LIMITS.max && p.materials.every(id => Object.hasOwn(BY_ID, id))).slice(0, 30);
} catch { /* A damaged palette library must not prevent opening the saved floor. */ }

$('app').innerHTML = `
  <header class="app-header">
    <button id="theme-toggle" class="icon-button" type="button" aria-label="Switch to light mode" title="Switch to light mode"><span class="theme-light-icon">${icon('sun')}</span><span class="theme-dark-icon">${icon('moon')}</span></button>
    <a class="brand" href="./" aria-label="flooroo"><span class="brand-mark">${icon('grid-2-x2')}</span><h1>flooroo</h1></a>
    <span class="app-context">Minecraft floor designer</span>
    <div class="history" role="group" aria-label="Design history"><button id="undo" class="icon-button" aria-label="Undo" title="Undo (Ctrl+Z)" aria-keyshortcuts="Control+Z Meta+Z" disabled>${icon('undo-2')}</button><button id="redo" class="icon-button" aria-label="Redo" title="Redo (Ctrl+X)" aria-keyshortcuts="Control+X Meta+X Control+Shift+Z" disabled>${icon('redo-2')}</button></div>
    <div class="header-actions">
      <button id="import" class="icon-button" title="Open a saved design" aria-label="Open a saved design">${icon('folder-open')}</button>
      <button id="save" class="icon-button" title="Save design settings" aria-label="Save design settings">${icon('file-json')}</button>
      <button id="export" class="primary-button" aria-label="Export floor" title="Export floor">${icon('download')}<span>Export</span>${icon('chevron-down')}</button>
    </div>
  </header>
  <main class="workspace">
    <aside class="settings-panel" aria-label="Floor settings">
      <div class="generate-actions"><button id="generate" class="primary-button generate-button">${icon('shuffle')}Generate floor</button><button id="reference-open" class="icon-button" title="Image to floor" aria-label="Image to floor">${icon('image')}</button><button id="explore" class="icon-button" title="Explore six alternatives" aria-label="Explore alternatives">${icon('grid-2-x2')}</button></div>
      <div class="inspector-tabs" role="tablist" aria-label="Floor settings">
        ${['pattern', 'blocks', 'materials'].map((id, i) => `<button id="tab-${id}" role="tab" aria-controls="panel-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${id[0].toUpperCase() + id.slice(1)}</button>`).join('')}
      </div>
      <div id="panel-pattern" role="tabpanel" aria-labelledby="tab-pattern">
      <section class="control-section generation-section"><div class="section-heading"><h2>Pattern</h2></div>
        <div class="setting-row"><label for="style">Style</label><select id="style">${STYLES.map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}</select></div>
        <div class="setting-row"><label for="layout">Layout</label><select id="layout">${LAYOUTS.map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}</select></div>
        <div class="weirdness-control"><div><label for="weirdness">Weirdness</label><span class="range-toggle"><output id="weirdness-value" for="weirdness">25%</output><label class="switch-row compact-switch"><input id="weirdness-enabled" type="checkbox" role="switch" aria-label="Enable weirdness" checked><span class="switch" aria-hidden="true"></span></label></span></div><input id="weirdness" type="range" min="0" max="100" step="1"><div class="range-labels"><span>Ordered</span><span>Wild</span></div></div>
      </section>
      <section class="control-section"><div class="section-heading"><h2>Floor size</h2><span id="floor-size-range">${FLOOR_SIZE_LIMITS.min}-${fmt(FLOOR_SIZE_LIMITS.max)} blocks</span></div>
        <div class="input-pair"><label for="width">Width <input id="width" type="number" min="${FLOOR_SIZE_LIMITS.min}" max="${FLOOR_SIZE_LIMITS.max}" step="1" aria-describedby="floor-size-range"></label><span class="times">&times;</span><label for="depth">Length <input id="depth" type="number" min="${FLOOR_SIZE_LIMITS.min}" max="${FLOOR_SIZE_LIMITS.max}" step="1" aria-describedby="floor-size-range"></label></div>
        <div class="setting-row"><label for="tile">Tile size</label><select id="tile">${TILE_SIZES.map(v => `<option value="${v}">${v} &times; ${v}</option>`).join('')}</select></div>
        <div class="setting-row"><label for="border">Outer border</label><div class="number-unit"><input id="border" type="number" min="0" max="8"><span>blocks</span></div></div>
        <label class="switch-row" for="raised"><span>Raised details</span><input id="raised" type="checkbox" role="switch"><span class="switch" aria-hidden="true"></span></label>
      </section>
      <details class="control-section advanced-settings" id="advanced-settings"><summary>Fine tuning${icon('chevron-down')}</summary>
        <div class="setting-row"><span>Symmetry</span><div class="segmented compact" role="group" aria-label="Symmetry"><button data-symmetry="4">4-fold</button><button data-symmetry="8">8-fold</button></div></div>
        ${[['shapeScale', 'Shape size', 50, 200], ['fineDetail', 'Fine detail', 0, 100], ['emptySpace', 'Empty space', 0, 85]].map(([id, label, min, max]) => `<div class="weirdness-control"><div><label for="${id}">${label}</label><output id="${id}-value" for="${id}"></output></div><input id="${id}" type="range" min="${min}" max="${max}" step="1"></div>`).join('')}
        <div class="seed-row"><label for="seed">Seed</label><input id="seed" maxlength="32" spellcheck="false"><button class="icon-button small" id="shuffle" title="Generate a new design" aria-label="Generate a new design">${icon('shuffle')}</button></div>
      </details>
      </div>
      <div id="panel-blocks" role="tabpanel" aria-labelledby="tab-blocks" hidden>
      <section class="control-section palette-section"><div class="section-heading"><h2>Block palette</h2><span id="palette-type">7 materials</span></div>
        <div class="setting-row"><label for="version">Java version</label><select id="version">${VERSIONS.map(v => `<option value="${v.id}">${v.id}</option>`).join('')}</select></div>
        <div class="palette-choice"><label class="sr-only" for="palette">Palette</label><select id="palette"><option value="random">Random palette</option>${PALETTES.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select><button id="random-palette" class="icon-button" title="Randomize palette now" aria-label="Randomize palette now">${icon('shuffle')}</button></div>
        <div class="palette-swatches" id="swatches" role="group" aria-label="Palette block positions"></div>
        <span id="palette-move-status" class="sr-only" role="status"></span>
        <button id="block-library" class="explore-button">${icon('grid-2-x2')}<span>Choose blocks</span><span id="block-pool-count"></span></button>
        <fieldset class="palette-behavior"><legend>On generate</legend><div class="segmented" role="group" aria-label="Palette on generate"><button data-palette-mode="keep">Keep palette</button><button data-palette-mode="random">Random palette</button></div></fieldset>
        <div class="palette-save"><input id="palette-name" maxlength="40" aria-label="Palette name" placeholder="Palette name"><button id="save-palette" class="icon-button" title="Save current palette" aria-label="Save current palette">${icon('plus')}</button><button id="delete-palette" class="icon-button" title="Delete saved palette" aria-label="Delete saved palette" disabled>${icon('trash-2')}</button></div>
        <div id="version-warning" class="version-warning" hidden><p id="version-warning-text"></p><button id="convert-blocks" class="text-button">${icon('replace')}Replace unavailable blocks</button></div>
      </section>
      </div>
      <div id="panel-materials" role="tabpanel" aria-labelledby="tab-materials" hidden>
        <div class="materials-panel" aria-label="Material list"><div class="panel-heading"><h2>Materials</h2><button id="csv" class="icon-button small" title="Download material list" aria-label="Download material list">${icon('file-down')}</button></div>
          <div class="material-total"><span>Total blocks</span><strong id="total-blocks"></strong><span id="shulker-total"></span></div>
          <div class="material-table-head"><span>Block</span><span>Quantity</span></div><div id="material-list"></div>
          <div class="build-info"><h3>Build details</h3><dl><div><dt>Footprint</dt><dd id="footprint"></dd></div><div><dt>Height</dt><dd id="height"></dd></div><div><dt>Tile repeats</dt><dd id="repeats"></dd></div><div><dt>Materials</dt><dd id="material-count"></dd></div></dl><p id="crop-note" hidden>Edge tiles are cropped to fit the floor</p></div>
        </div>
      </div>
      <div class="settings-footer"><button id="reset" class="text-button">${icon('rotate-ccw')}Reset design</button><span id="version-footer"></span></div>
      <footer class="site-notice"><p>Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.</p><a href="https://github.com/darealshekel/flooroo">flooroo by darealshekel</a></footer>
    </aside>
    <section class="preview-panel" aria-label="Floor preview">
      <div class="preview-heading"><div class="design-title"><h2 id="design-name">Generated design</h2><span class="dimension-tag" id="dimension-tag"></span></div><div class="preview-toolbar"><div class="segmented" role="group" aria-label="Preview angle"><button id="view-top" aria-pressed="true">${icon('grid-2-x2')}Top view</button><button id="view-3d" aria-pressed="false">${icon('box')}3D view</button></div><div class="scope-control"><label class="sr-only" for="scope">Preview area</label><select id="scope"><option value="floor">Full floor</option><option value="tile">Single tile</option></select></div></div></div>
      <div id="compatibility-status" class="compatibility-status" hidden><span id="compatibility-message"></span><button id="review-version" class="text-button">Review blocks${icon('arrow-up-right')}</button></div>
      <div class="editor-toolbar" role="toolbar" aria-label="Tile editing tools"><span class="editor-label">Tile editor</span><div class="editor-tools">${editTools.map(([id, glyph, name]) => `<button class="icon-button" data-tool="${id}" title="${name}" aria-label="${name}" aria-pressed="${id === 'pan'}">${icon(glyph)}</button>`).join('')}</div><span class="protected-count" id="protected-count">0 protected</span><button id="show-protected" class="icon-button" aria-label="Show protected regions" title="Show protected regions" aria-pressed="true">${icon('eye')}</button><button id="unlock-all" class="icon-button" title="Unprotect all" aria-label="Unprotect all">${icon('shield-off')}</button><button id="clear-edits" class="icon-button" title="Clear unprotected edits" aria-label="Clear unprotected edits">${icon('trash-2')}</button></div>
      <div class="editor-options" id="editor-options" hidden>
        <button id="paint-block" class="paint-block" title="Choose paint block"><img src="${assetUrl(BY_ID.quartz_block.texture)}" alt=""><span>Quartz Block</span>${icon('chevron-down')}</button>
        <label>Brush<select id="brush-size" aria-label="Brush size">${[1, 3, 5, 9, 17].map(n => `<option value="${n}">${n} block${n === 1 ? '' : 's'}</option>`).join('')}</select></label>
        <label>Height<input id="paint-height" aria-label="Paint height" type="number" min="1" max="3" value="1"></label>
        <label>Mirror<select id="edit-mirror"><option value="none">None</option><option value="horizontal">Left / right</option><option value="vertical">Top / bottom</option><option value="both" selected>Both axes</option><option value="eight">8-way</option></select></label>
        <div class="axis-inputs" id="axis-inputs"><label>X<input id="axis-x" aria-label="Mirror axis X" type="number" min="0" step="0.5"></label><label>Z<input id="axis-z" aria-label="Mirror axis Z" type="number" min="0" step="0.5"></label><button id="center-axes" class="icon-button" title="Center mirror axes" aria-label="Center mirror axes">${icon('maximize')}</button></div>
      </div>
      <div class="viewport" id="viewport"><canvas id="floor-canvas" tabindex="0" aria-label="Interactive top-down floor preview"></canvas><div id="three-container" hidden></div><div class="loading" id="loading"><span class="loading-tiles"><b></b><b></b><b></b><b></b></span><span>Loading block textures</span></div>
        <div class="viewport-label"><span class="axis">N</span><span id="view-label">TOP / XZ</span></div>
        <div class="canvas-tools"><button id="zoom-out" class="icon-button" title="Zoom out" aria-label="Zoom out">${icon('minus')}</button><output id="zoom-value">100%</output><button id="zoom-in" class="icon-button" title="Zoom in" aria-label="Zoom in">${icon('plus')}</button><span class="tool-divider"></span><button id="fit" class="icon-button" title="Fit floor to view" aria-label="Fit floor to view">${icon('maximize')}</button><button id="grid" class="icon-button" title="Toggle tile grid" aria-label="Toggle tile grid" aria-pressed="false">${icon('grid-2-x2')}</button></div>
      </div>
      <div class="preview-status"><span id="hover-info">Preview ready</span><span id="floor-total-summary"></span><span id="geometry-status"></span></div>
      <div id="recipe-summary" hidden></div>
    </section>
  </main>
  <dialog id="explore-dialog"><div class="dialog-heading"><h2>Explore designs</h2><button class="icon-button" data-close="explore-dialog" aria-label="Close design explorer">${icon('x')}</button></div><div class="design-candidates" id="design-candidates"></div><button id="more-designs" class="explore-button">${icon('shuffle')}Generate six more</button></dialog>
  <dialog id="material-dialog"><div class="dialog-heading"><div><span class="eyebrow" id="material-role"></span><h2>Choose a block</h2></div><button class="icon-button" data-close="material-dialog" aria-label="Close block picker">${icon('x')}</button></div><div id="palette-position-row" class="setting-row palette-position"><label for="palette-position">Position</label><select id="palette-position">${ROLES.map((role, i) => `<option value="${i}">${i + 1}. ${role}</option>`).join('')}</select></div><div class="search-field">${icon('search')}<input id="block-search" placeholder="Search blocks" aria-label="Search blocks"></div><div class="block-picker" id="block-picker"></div></dialog>
  <dialog id="export-dialog"><div class="dialog-heading"><h2>Export floor</h2><button class="icon-button" data-close="export-dialog" aria-label="Close export options">${icon('x')}</button></div><div class="export-summary" id="export-summary"></div><button id="export-litematic" class="export-option"><span class="export-icon">${icon('box')}</span><span><strong>Litematica schematic</strong><small>.litematic &middot; Java 1.21+</small></span>${icon('arrow-up-right')}</button><button id="export-png" class="export-option"><span class="export-icon">${icon('image')}</span><span><strong>Top-down image</strong><small>.png &middot; Textured block plan</small></span>${icon('arrow-up-right')}</button><button id="export-csv" class="export-option"><span class="export-icon">${icon('file-down')}</span><span><strong>Material list</strong><small>.csv &middot; Quantities, stacks &amp; shulkers</small></span>${icon('arrow-up-right')}</button><div class="export-note">Exports the entire floor, including the border and raised details.</div></dialog>
  <input type="file" id="import-file" accept=".json,application/json" hidden>
  <dialog id="library-dialog"><div class="dialog-heading"><div><span class="eyebrow" id="library-version"></span><h2>Block selection</h2></div><button class="icon-button" data-close="library-dialog" aria-label="Close block selection">${icon('x')}</button></div>
    <div class="library-filters"><div class="search-field">${icon('search')}<input id="library-search" placeholder="Search blocks" aria-label="Search block selection"></div><select id="library-group" aria-label="Block family"><option value="">All materials</option>${[...new Set(BLOCKS.map(b => b.group))].sort().map(group => `<option>${group}</option>`).join('')}</select></div>
    <div class="library-actions"><button id="select-shown" class="text-button" title="Select shown blocks, up to ${BLOCK_POOL_LIMITS.max}">${icon('check')}Select shown</button><button id="clear-shown" class="text-button">${icon('x')}Clear shown</button><output id="selection-count" aria-live="polite"></output><span class="selection-limits">${BLOCK_POOL_LIMITS.min}-${BLOCK_POOL_LIMITS.max} blocks</span></div>
    <div id="library-blocks" class="library-blocks"></div><div class="library-footer"><button class="text-button" data-close="library-dialog">Cancel</button><button id="apply-blocks" class="primary-button">${icon('check')}Apply selection</button></div>
  </dialog>
  <div id="toast" role="status" aria-live="polite"></div>
`;
renderIcons();
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#181b1e' : '#f7f8f9';
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  $('theme-toggle').setAttribute('aria-label', label);
  $('theme-toggle').title = label;
}
applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
$('theme-toggle').addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
  try { localStorage.setItem('flooroo-theme', theme); }
  catch { /* Keep the theme usable for this visit if storage is blocked. */ }
});
function showPanel(id) {
  for (const name of ['pattern', 'blocks', 'materials']) {
    $('panel-' + name).hidden = name !== id;
    $('tab-' + name).setAttribute('aria-selected', name === id);
    $('tab-' + name).tabIndex = name === id ? 0 : -1;
  }
}
const panelNames = ['pattern', 'blocks', 'materials'];
for (const [index, name] of panelNames.entries()) {
  $('tab-' + name).addEventListener('click', () => showPanel(name));
  $('tab-' + name).addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (index + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
    showPanel(panelNames[next]); $('tab-' + panelNames[next]).focus();
  });
}
$('review-version').addEventListener('click', () => { showPanel('blocks'); $('convert-blocks').focus(); });
document.addEventListener('pointerdown', () => { document.documentElement.dataset.input = 'pointer'; }, true);
document.addEventListener('keydown', () => { document.documentElement.dataset.input = 'keyboard'; }, true);
function renderSavedPalettes() {
  $('palette').querySelector('[data-saved]')?.remove();
  const group = document.createElement('optgroup'); group.label = 'Saved palettes'; group.dataset.saved = 'true';
  savedPalettes.forEach((palette, i) => { const option = document.createElement('option'); option.value = `saved:${i}`; option.textContent = palette.name; group.append(option); });
  $('palette').append(group);
}
renderSavedPalettes();
const preview = new FlatPreview($('floor-canvas'), item => {
  $('hover-info').textContent = item ? `${BY_ID[item.id].name}  /  X ${item.x}, Z ${item.z}` : 'Preview ready';
}, zoom => { $('zoom-value').textContent = `${Math.round(zoom * 100)}%`; }, handleEdit);
let paintBlock = 'quartz_block';
$('axis-x').value = $('axis-z').value = (settings.tile - 1) / 2;

let toastTimeout;
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => $('toast').classList.remove('visible'), 3400); }

function displayedData() {
  if (scope === 'floor') return floor;
  return floor.tile;
}
function updatePreview() {
  const data = displayedData();
  preview.showProtected = scope === 'tile' && $('show-protected').getAttribute('aria-pressed') === 'true';
  preview.update(data, textures);
  if (view === '3d') void render3D(data);
  else if (textures.topAtlas) void loadTextures(data.materials).catch(() => {});
  $('view-label').textContent = view === '3d' ? 'PERSPECTIVE / XYZ' : 'TOP / XZ';
  $('zoom-value').textContent = `${Math.round((view === '3d' ? scene?.camera.zoom || 1 : preview.zoom) * 100)}%`;
}
function syncControls() {
  for (const id of ['width', 'depth', 'tile', 'border', 'seed', 'palette', 'style', 'weirdness', 'shapeScale', 'fineDetail', 'emptySpace']) $(id).value = settings[id];
  $('layout').value = settings.pattern === 'field' ? settings.layout : 'auto';
  $('weirdness-value').textContent = `${settings.weirdness}%`;
  $('weirdness').setAttribute('aria-valuetext', `${settings.weirdness}%`);
  $('weirdness-enabled').checked = settings.weirdnessEnabled;
  $('weirdness').disabled = !settings.weirdnessEnabled;
  for (const id of ['shapeScale', 'fineDetail', 'emptySpace']) $(id + '-value').textContent = `${settings[id]}%`;
  document.querySelectorAll('[data-palette-mode]').forEach(el => el.setAttribute('aria-pressed', el.dataset.paletteMode === settings.paletteMode));
  $('raised').checked = settings.raised;
  for (const attr of ['symmetry']) document.querySelectorAll(`[data-${attr}]`).forEach(el => el.setAttribute('aria-pressed', Number(el.dataset[attr]) === settings[attr]));
  $('version').value = settings.version;
  $('version-footer').textContent = `Java ${settings.version}`;
  $('block-pool-count').textContent = `${availableBlocks(settings.version, settings.allowedBlocks).length} / ${availableBlocks(settings.version).length}`;
  const incompatible = incompatibleBlocks(floor);
  $('version-warning').hidden = !incompatible.length;
  $('compatibility-status').hidden = !incompatible.length;
  $('compatibility-message').textContent = `${incompatible.length} material${incompatible.length === 1 ? '' : 's'} unavailable in Java ${settings.version}`;
  $('version-warning-text').textContent = `${incompatible.length} material${incompatible.length === 1 ? '' : 's'} unavailable in ${settings.version}. Schematic export paused.`;
  $('version-warning').title = incompatible.map(id => BY_ID[id].name).join(', ');
  $('export-litematic').disabled = !!incompatible.length;
  const legacy = getVersion(settings.version).legacy;
  $('export-litematic').querySelector('strong').textContent = legacy ? 'Legacy schematic' : 'Litematica schematic';
  $('export-litematic').querySelector('small').textContent = `${legacy ? '.schematic' : '.litematic'} / Java ${settings.version}`;
  if (!supportsBlock(paintBlock, settings.version)) paintBlock = availableBlocks(settings.version)[0].id;
  $('paint-block').querySelector('img').src = assetUrl(BY_ID[paintBlock].texture);
  $('paint-block').querySelector('span').textContent = BY_ID[paintBlock].name;
  const savedIndex = savedPalettes.findIndex(p => p.materials.length === settings.materials.length && p.materials.every((id, i) => id === settings.materials[i]));
  if (savedIndex >= 0) $('palette').value = `saved:${savedIndex}`;
  $('delete-palette').disabled = savedIndex < 0;
  const locked = settings.editLayer.cells.filter(isProtected).length;
  $('protected-count').textContent = `${fmt(locked)} protected`;
  $('unlock-all').disabled = !locked;
  $('clear-edits').disabled = settings.editLayer.cells.every(code => !code || isProtected(code));
  for (const id of ['axis-x', 'axis-z']) { $(id).max = settings.tile - 1; if (Number($(id).value) >= settings.tile) $(id).value = (settings.tile - 1) / 2; }
  syncEditor();
  $('undo').disabled = historyIndex === 0; $('redo').disabled = historyIndex === history.length - 1;
}
function renderMaterials() {
  const list = [...floor.counts].sort((a, b) => b[1] - a[1]);
  const minimum = settings.materials.length <= PALETTE_LIMITS.min;
  const maximum = settings.materials.length >= PALETTE_LIMITS.max;
  $('swatches').innerHTML = settings.materials.map((id, i) => `<div class="palette-slot"><button data-role="${i}" title="${ROLES[i]}: ${BY_ID[id].name}. Drag to reorder; click to edit. Alt + Left/Right to move." aria-label="Change ${ROLES[i].toLowerCase()} block: ${BY_ID[id].name}" aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"><img src="${assetUrl(BY_ID[id].texture)}" alt="" draggable="false"><span>${i + 1}</span></button><button class="palette-remove" data-remove-role="${i}" aria-label="Remove ${BY_ID[id].name} from palette" title="${minimum ? 'A palette needs at least 2 blocks' : `Remove ${BY_ID[id].name}`}" ${minimum ? 'disabled' : ''}>${icon('x')}</button></div>`).join('') + `<button id="add-palette-block" title="${maximum ? 'All 7 palette positions are filled' : 'Add a block'}" aria-label="Add palette block" ${maximum ? 'disabled' : ''}>${icon('plus')}</button>`;
  renderIcons();
  $('material-list').innerHTML = list.map(([id, count]) => `<div class="material-row"><img src="${assetUrl(BY_ID[id].texture)}" alt=""><div class="material-name"><strong>${BY_ID[id].name}</strong><span>${Math.floor(count / 64)} stacks${count % 64 ? ` + ${count % 64}` : ''}</span></div><span class="material-quantity">${fmt(count)}</span></div>`).join('');
  $('total-blocks').textContent = fmt(floor.total);
  $('floor-total-summary').textContent = `${fmt(floor.total)} blocks`;
  $('shulker-total').textContent = `${(floor.total / 1728).toFixed(1)} shulkers of blocks`;
  $('footprint').textContent = `${settings.width} × ${settings.depth}`;
  $('height').textContent = `${floor.maxHeight} ${floor.maxHeight === 1 ? 'block' : 'blocks'}`;
  $('repeats').textContent = `${(settings.width / settings.tile).toFixed(2).replace(/\.00$/, '')} × ${(settings.depth / settings.tile).toFixed(2).replace(/\.00$/, '')}`;
  $('material-count').textContent = list.length;
  $('crop-note').hidden = settings.width % settings.tile === 0 && settings.depth % settings.tile === 0;
  $('palette-type').textContent = `${settings.materials.length} blocks`;
}
function update(record = true) {
  cancelPaletteDrag();
  settings = normalizeSettings(settings);
  if (record) {
    const json = JSON.stringify(settings);
    if (history[historyIndex] !== json) {
      history.splice(historyIndex + 1); history.push(json);
      while (history.length > 60 || (history.length > 2 && history.reduce((n, item) => n + item.length, 0) > 8_000_000)) history.shift();
      historyIndex = history.length - 1;
    }
  }
  try { localStorage.setItem('mmm-floor-v3', JSON.stringify(settings)); autosaveWarning = false; }
  catch { if (!autosaveWarning) toast('Autosave is full. Export your design settings to keep these edits.'); autosaveWarning = true; }
  floor = generateFloor(settings);
  syncControls(); renderMaterials(); updatePreview();
  const plan = floor.tile.plan;
  $('design-name').textContent = plan?.name || PATTERNS.find(p => p.id === settings.pattern).name;
  $('recipe-summary').textContent = settings.pattern === 'field' ? `${LAYOUTS.find(([id]) => id === plan.layout)[1]} / ${settings.weirdnessEnabled ? settings.weirdness + '% weirdness' : 'Weirdness off'}` : settings.pattern === 'reference' ? plan.name : 'Imported legacy design';
  $('dimension-tag').textContent = `${settings.width} × ${settings.depth}`;
  $('geometry-status').textContent = settings.pattern === 'reference' ? `${settings.tile}-block image tile` : `${settings.tile}-block tile · ${settings.symmetry}-fold symmetry`;
}

$('reference-open').addEventListener('click', async () => {
  if (!Object.keys(textures).length) return toast('Block textures are still loading.');
  $('reference-open').disabled = true;
  try {
    const { openReferenceDialog } = await import('./reference-dialog.js');
    openReferenceDialog({ settings, textures, icon, renderIcons, apply: result => { settings = result; update(); toast('Image design applied. Undo is available.'); } });
  } catch (error) { console.error(error); toast('Image import could not load. Your current design is unchanged.'); }
  finally { $('reference-open').disabled = false; }
});

function syncEditor() {
  $('editor-options').hidden = tool === 'pan';
  document.querySelectorAll('[data-tool]').forEach(button => button.setAttribute('aria-pressed', button.dataset.tool === tool));
  $('floor-canvas').classList.toggle('editing', tool !== 'pan');
  $('axis-inputs').hidden = $('edit-mirror').value === 'none' || tool === 'replace';
  $('edit-mirror').disabled = tool === 'replace';
  const painting = ['brush', 'line', 'fill', 'replace'].includes(tool);
  $('paint-block').disabled = !painting; $('paint-height').disabled = !painting;
  $('brush-size').disabled = ['fill', 'replace'].includes(tool);
  preview.editor = { tool, brush: Number($('brush-size').value), mirror: tool === 'replace' ? 'none' : $('edit-mirror').value, axisX: Number($('axis-x').value), axisZ: Number($('axis-z').value) };
  preview.draw();
}

async function activateTool(next) {
  tool = next;
  if (next !== 'pan') { scope = 'tile'; $('scope').value = 'tile'; preview.fit(); await setView('top'); }
  syncEditor(); updatePreview();
}

function handleEdit(phase, point) {
  if (tool === 'pan') return;
  if (phase === 'start') {
    stroke = { before: structuredClone(settings.editLayer), data: generateTile(settings), start: point, last: point };
    if (!settings.editLayer.cells.length) settings.editLayer.cells = Array(settings.tile ** 2).fill(0);
  }
  if (!stroke) return;
  if (phase === 'cancel') {
    cancelAnimationFrame(strokeFrame); strokeFrame = null; settings.editLayer = stroke.before; stroke = null; update(false); return;
  }
  if (point && (phase === 'start' || phase === 'move' || phase === 'end')) {
    const options = { ...preview.editor, size: settings.tile };
    let indices;
    if (tool === 'fill' || tool === 'replace') {
      if (phase === 'start') {
        const region = regionIndices(stroke.data, point.z * settings.tile + point.x, settings.editLayer.cells, tool === 'replace');
        indices = new Set();
        for (const i of region) for (const mirrored of mirrorPoints(i % settings.tile, Math.floor(i / settings.tile), settings.tile, options.mirror, options.axisX, options.axisZ)) indices.add(mirrored);
      }
    } else if (tool === 'line') {
      if (phase === 'end') indices = brushIndices(stroke.start, point, options);
    } else indices = brushIndices(stroke.last, point, options);
    if (indices) editCells(settings.editLayer.cells, stroke.data, indices, tool, catalogIndex[paintBlock], Number($('paint-height').value), catalogIndex);
    stroke.last = point;
    if (!strokeFrame) strokeFrame = requestAnimationFrame(() => { strokeFrame = null; preview.update(generateTile(settings), textures); });
  }
  if (phase === 'end') { cancelAnimationFrame(strokeFrame); strokeFrame = null; stroke = null; update(); }
}

function exploreDesigns() {
  candidateSettings = Array.from({ length: 6 }, () => nextDesign(settings, freshSeed()));
  const candidates = candidateSettings.map(candidate => generateTile(candidate));
  $('design-candidates').innerHTML = candidates.map((tile, index) => `<button class="design-candidate" data-candidate="${index}"><canvas width="256" height="256" aria-hidden="true"></canvas><strong>${tile.plan.name}</strong><span>${LAYOUTS.find(([id]) => id === tile.plan.layout)[1]}</span></button>`).join('');
  $('design-candidates').querySelectorAll('canvas').forEach((canvas, index) => {
    const map = paintMap(candidates[index], textures, 2);
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(map, 0, 0, canvas.width, canvas.height);
  });
}

for (const id of ['width', 'depth', 'tile', 'border', 'seed']) $(id).addEventListener('change', e => {
  if (id === 'width' || id === 'depth') {
    const value = Number(e.target.value);
    if (!Number.isInteger(value) || value < FLOOR_SIZE_LIMITS.min || value > FLOOR_SIZE_LIMITS.max) {
      e.target.value = settings[id];
      toast(`${id === 'width' ? 'Width' : 'Length'} must be a whole number from ${FLOOR_SIZE_LIMITS.min} to ${fmt(FLOOR_SIZE_LIMITS.max)} blocks.`);
      return;
    }
  }
  const edited = settings.editLayer.cells.some(Boolean);
  settings[id] = e.target.value; update();
  if (id === 'tile') {
    $('axis-x').value = $('axis-z').value = (settings.tile - 1) / 2; syncEditor();
    if (edited) toast('Edits centered on the resized tile. Cropped edges can be restored with Undo.');
  }
});
for (const id of ['width', 'depth']) $(id).addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
});
$('raised').addEventListener('change', e => { settings.raised = e.target.checked; update(); });
$('palette').addEventListener('change', e => {
  const saved = e.target.value.startsWith('saved:') ? savedPalettes[Number(e.target.value.slice(6))] : null;
  settings.palette = saved ? 'amethyst' : e.target.value;
  settings.materials = saved ? compatiblePalette(saved.materials, settings.version, settings.allowedBlocks) : settings.palette === 'random' ? randomPalette(freshSeed(), settings.version, settings.allowedBlocks, settings.materials.length) : null;
  update();
});
$('random-palette').addEventListener('click', () => { settings.palette = 'random'; settings.materials = randomPalette(freshSeed(), settings.version, settings.allowedBlocks, settings.materials.length); update(); });
$('version').addEventListener('change', e => {
  const previousPool = settings.allowedBlocks;
  settings.version = e.target.value; update();
  if (previousPool && !settings.allowedBlocks) toast('No selected blocks exist in this version. All compatible blocks are enabled.');
});
$('convert-blocks').addEventListener('click', () => {
  settings = convertVersionBlocks(settings); update();
  toast('Unavailable blocks replaced by similar colors. Heights and protection kept. Undo is available.');
});
function storePalettes(next) {
  try { localStorage.setItem('mmm-floor-palettes', JSON.stringify(next)); savedPalettes = next; renderSavedPalettes(); syncControls(); return true; }
  catch { toast('Palette storage is full. Save the design as a JSON file instead.'); return false; }
}
$('save-palette').addEventListener('click', () => {
  const name = $('palette-name').value.trim();
  if (!name) { $('palette-name').focus(); return; }
  if (savedPalettes.some(p => p.name.toLowerCase() === name.toLowerCase())) return toast('That palette name already exists. Choose a different name.');
  if (savedPalettes.length >= 30) return toast('Palette library is full. Delete a saved palette first.');
  if (storePalettes([...savedPalettes, { name, materials: [...settings.materials] }])) { $('palette-name').value = ''; toast('Palette saved.'); }
});
$('delete-palette').addEventListener('click', () => {
  const index = savedPalettes.findIndex(p => p.materials.length === settings.materials.length && p.materials.every((id, i) => id === settings.materials[i]));
  if (index >= 0 && storePalettes(savedPalettes.filter((_, i) => i !== index))) toast('Saved palette removed. Current floor unchanged.');
});
function libraryMatches() {
  const term = $('library-search').value.trim().toLowerCase(), group = $('library-group').value;
  return availableBlocks(settings.version).filter(b => (!group || b.group === group) && `${b.name} ${b.id} ${(b.aliases || []).join(' ')}`.toLowerCase().includes(term));
}
function updateSelectionCount() {
  $('selection-count').textContent = `${selectedBlocks.size} / ${BLOCK_POOL_LIMITS.max} selected`;
  $('apply-blocks').disabled = selectedBlocks.size < BLOCK_POOL_LIMITS.min || selectedBlocks.size > BLOCK_POOL_LIMITS.max;
  const full = selectedBlocks.size >= BLOCK_POOL_LIMITS.max, matches = libraryMatches();
  $('select-shown').disabled = full || !matches.some(b => !selectedBlocks.has(b.id));
  $('clear-shown').disabled = !matches.some(b => selectedBlocks.has(b.id));
  $('library-blocks').querySelectorAll('input').forEach(input => {
    input.disabled = full && !input.checked;
    input.closest('label').title = input.disabled ? '16-block limit reached. Deselect a block to replace it.' : '';
  });
}
function renderLibrary() {
  const matches = libraryMatches();
  $('library-blocks').innerHTML = matches.length ? matches.map(b => `<label class="library-block"><input type="checkbox" value="${b.id}" ${selectedBlocks.has(b.id) ? 'checked' : ''}><img class="block-${b.shape || 'cube'}" src="${assetUrl(b.texture)}" alt=""><span>${b.name}</span></label>`).join('') : '<p class="empty-result">No matching blocks.</p>';
  updateSelectionCount();
}
$('block-library').addEventListener('click', () => {
  selectedBlocks = new Set((settings.allowedBlocks || settings.materials).filter(id => supportsBlock(id, settings.version)).slice(0, BLOCK_POOL_LIMITS.max));
  for (const block of availableBlocks(settings.version)) {
    if (selectedBlocks.size >= BLOCK_POOL_LIMITS.min) break;
    selectedBlocks.add(block.id);
  }
  $('library-search').value = ''; $('library-group').value = '';
  $('library-version').textContent = `Java ${settings.version}`;
  renderLibrary(); $('library-dialog').showModal();
});
$('library-search').addEventListener('input', renderLibrary);
$('library-group').addEventListener('change', renderLibrary);
$('library-blocks').addEventListener('change', e => {
  if (e.target.checked) {
    if (selectedBlocks.size >= BLOCK_POOL_LIMITS.max) { e.target.checked = false; return; }
    selectedBlocks.add(e.target.value);
  } else selectedBlocks.delete(e.target.value);
  updateSelectionCount();
});
for (const id of ['select-shown', 'clear-shown']) $(id).addEventListener('click', () => {
  for (const b of libraryMatches()) {
    if (id === 'clear-shown') selectedBlocks.delete(b.id);
    else if (selectedBlocks.size < BLOCK_POOL_LIMITS.max) selectedBlocks.add(b.id);
  }
  renderLibrary();
});
$('apply-blocks').addEventListener('click', () => {
  if (selectedBlocks.size < BLOCK_POOL_LIMITS.min || selectedBlocks.size > BLOCK_POOL_LIMITS.max) return;
  settings.allowedBlocks = [...selectedBlocks];
  settings.materials = compatiblePalette(settings.materials, settings.version, settings.allowedBlocks);
  update(); $('library-dialog').close(); toast('Palette updated. Painted and protected blocks kept.');
});
document.querySelectorAll('[data-palette-mode]').forEach(button => button.addEventListener('click', () => { settings.paletteMode = button.dataset.paletteMode; update(); }));
let geometryTimer;
for (const id of ['weirdness', 'shapeScale', 'fineDetail', 'emptySpace']) {
  $(id).addEventListener('input', e => {
    settings[id] = Number(e.target.value); settings.pattern = 'field';
    $(id + '-value').textContent = `${settings[id]}%`; $(id).setAttribute('aria-valuetext', `${settings[id]}%`);
    clearTimeout(geometryTimer); geometryTimer = setTimeout(() => update(false), 120);
  });
  $(id).addEventListener('change', () => { clearTimeout(geometryTimer); update(); });
}
$('weirdness-enabled').addEventListener('change', e => { clearTimeout(geometryTimer); settings.weirdnessEnabled = e.target.checked; settings.pattern = 'field'; update(); });
for (const id of ['style', 'layout']) $(id).addEventListener('change', e => { settings[id] = e.target.value; settings.pattern = 'field'; if (id === 'style') settings.fieldVersion = 2; update(); });
for (const attr of ['symmetry', 'detail']) document.querySelectorAll(`[data-${attr}]`).forEach(button => button.addEventListener('click', () => { settings[attr] = Number(button.dataset[attr]); update(); }));
function newDesign() {
  settings = nextDesign(settings, freshSeed());
  update();
  $('viewport').classList.remove('design-changed');
  requestAnimationFrame(() => $('viewport').classList.add('design-changed'));
}
$('shuffle').addEventListener('click', newDesign);
$('generate').addEventListener('click', newDesign);
$('explore').addEventListener('click', () => { exploreDesigns(); $('explore-dialog').showModal(); });
$('more-designs').addEventListener('click', exploreDesigns);
$('design-candidates').addEventListener('click', e => {
  const button = e.target.closest('[data-candidate]'); if (!button) return;
  settings = candidateSettings[Number(button.dataset.candidate)]; update(); $('explore-dialog').close();
});
function moveHistory(direction) {
  if (stroke) return;
  clearTimeout(geometryTimer);
  const next = historyIndex + direction;
  if (next < 0 || next >= history.length) return;
  historyIndex = next; settings = JSON.parse(history[historyIndex]); update(false);
}
$('undo').addEventListener('click', () => moveHistory(-1));
$('redo').addEventListener('click', () => moveHistory(1));
$('reset').addEventListener('click', () => { settings = normalizeSettings(); preview.fit(); update(); toast('Default design restored. Undo is available.'); });
$('scope').addEventListener('change', e => { scope = e.target.value; if (scope === 'floor') tool = 'pan'; syncEditor(); preview.fit(); updatePreview(); });

document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => activateTool(button.dataset.tool)));
for (const id of ['brush-size', 'edit-mirror', 'axis-x', 'axis-z', 'paint-height']) $(id).addEventListener('change', e => {
  if (['axis-x', 'axis-z', 'paint-height'].includes(id)) {
    const n = Number(e.target.value), axis = id !== 'paint-height';
    e.target.value = Number.isFinite(n) ? Math.min(axis ? settings.tile - 1 : 3, Math.max(axis ? 0 : 1, axis ? Math.round(n * 2) / 2 : Math.round(n))) : axis ? (settings.tile - 1) / 2 : 1;
  }
  syncEditor();
});
$('center-axes').addEventListener('click', () => { $('axis-x').value = $('axis-z').value = (settings.tile - 1) / 2; syncEditor(); });
$('show-protected').addEventListener('click', () => { const button = $('show-protected'); button.setAttribute('aria-pressed', button.getAttribute('aria-pressed') !== 'true'); updatePreview(); });
$('unlock-all').addEventListener('click', () => { settings.editLayer.cells = settings.editLayer.cells.map(code => isProtected(code) ? code - LOCK : code); update(); });
$('clear-edits').addEventListener('click', () => { settings.editLayer = protectedLayer(settings.editLayer); update(); });
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.isComposing || e.defaultPrevented) return;
  if (e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || document.querySelector('dialog[open]')) return;
  const key = e.key.toLowerCase();
  if (!['z', 'x', 'y'].includes(key)) return;
  e.preventDefault(); moveHistory(key === 'z' && !e.shiftKey ? -1 : 1);
});

function loadSceneModule() {
  return sceneModulePromise ||= import('./scene.js').catch(error => { sceneModulePromise = null; throw error; });
}
function getScene() {
  return scenePromise ||= loadSceneModule().then(({ FloorScene }) => {
    scene = new FloorScene($('three-container'), zoom => { if (view === '3d') $('zoom-value').textContent = `${Math.round(zoom * 100)}%`; });
    return scene;
  }).catch(error => { scenePromise = null; throw error; });
}
function setPreviewBusy(busy, message = 'Loading block textures') {
  $('loading').hidden = !busy;
  $('loading').lastElementChild.textContent = message;
  $('viewport').setAttribute('aria-busy', String(busy));
  $('view-3d').setAttribute('aria-busy', String(busy && view === '3d'));
  for (const id of ['zoom-in', 'zoom-out', 'fit']) $(id).disabled = busy && view === '3d';
}
async function render3D(data) {
  const request = ++viewRequest;
  if (scene?.data === data) { scene.resize(); setPreviewBusy(false); return; }
  setPreviewBusy(true, 'Preparing 3D view');
  try {
    await Promise.all([getScene(), loadTextures(data.materials)]);
    // Give the loading state a paint before building a potentially large floor.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (request !== viewRequest || view !== '3d') return;
    scene.update(data, textures);
    $('zoom-value').textContent = `${Math.round(scene.camera.zoom * 100)}%`;
  } catch (error) {
    if (request !== viewRequest || view !== '3d') return;
    console.error(error); setView('top'); setPreviewBusy(false);
    toast('3D could not load. Top view still works; select 3D to retry.');
  } finally { if (request === viewRequest) setPreviewBusy(false); }
}
function setView(next) {
  ++viewRequest;
  view = next;
  if (next === '3d') { tool = 'pan'; syncEditor(); }
  $('floor-canvas').hidden = next !== 'top'; $('three-container').hidden = next !== '3d';
  $('view-top').setAttribute('aria-pressed', next === 'top'); $('view-3d').setAttribute('aria-pressed', next === '3d');
  $('grid').disabled = next === '3d';
  if (next === 'top') setPreviewBusy(!textures.topAtlas);
  updatePreview();
}
$('view-top').addEventListener('click', () => setView('top'));
$('view-3d').addEventListener('click', () => setView('3d'));
for (const [id, factor] of [['zoom-in', 1.25], ['zoom-out', .8]]) $(id).addEventListener('click', () => { if (view === '3d') { scene.zoom(factor); $('zoom-value').textContent = `${Math.round(scene.camera.zoom * 100)}%`; } else preview.setZoom(preview.zoom * factor); });
$('fit').addEventListener('click', () => { if (view === '3d') { scene.fit(); $('zoom-value').textContent = '100%'; } else preview.fit(); });
$('grid').addEventListener('click', () => { preview.grid = !preview.grid; $('grid').setAttribute('aria-pressed', preview.grid); preview.draw(); });

function blockPicker() {
  $('palette-position-row').hidden = pickerTarget !== 'palette';
  $('palette-position').innerHTML = settings.materials.map((_, i) => `<option value="${i}">${i + 1}. ${ROLES[i]}</option>`).join('');
  $('palette-position').value = String(roleToEdit);
  const term = $('block-search').value.trim().toLowerCase();
  const matches = availableBlocks(settings.version).filter(b => `${b.name} ${b.id} ${(b.aliases || []).join(' ')}`.toLowerCase().includes(term));
  const selected = pickerTarget === 'paint' ? paintBlock : pickerTarget === 'palette' ? settings.materials[roleToEdit] : null;
  $('block-picker').innerHTML = matches.length ? matches.map(b => `<button data-block="${b.id}" aria-pressed="${selected === b.id}"><img class="block-${b.shape || 'cube'}" src="${assetUrl(b.texture)}" alt=""><span>${b.name}</span>${selected === b.id ? icon('check') : ''}</button>`).join('') : '<p class="empty-result">No matching blocks.</p>';
  renderIcons();
}
function movePaletteBlock(from, to, focus = true) {
  const materials = movePaletteSlot(settings.materials, from, to);
  if (materials === settings.materials) return;
  settings.materials = materials;
  update();
  $('palette-move-status').textContent = `${BY_ID[materials[to]].name} moved to position ${to + 1}, ${ROLES[to]}.`;
  if (focus) $('swatches').querySelector(`[data-role="${to}"]`).focus({ preventScroll: true });
}
const cancelPaletteDrag = bindPaletteReorder($('swatches'), movePaletteBlock);
$('palette-position').addEventListener('change', event => {
  if (pickerTarget !== 'palette') return;
  const to = Number(event.target.value);
  movePaletteBlock(roleToEdit, to, false);
  roleToEdit = to;
  $('material-role').textContent = ROLES[to];
  blockPicker();
});
$('swatches').addEventListener('click', e => {
  const remove = e.target.closest('[data-remove-role]');
  if (remove) {
    const index = Number(remove.dataset.removeRole), materials = removePaletteSlot(settings.materials, index);
    if (materials === settings.materials) return;
    const name = BY_ID[settings.materials[index]].name;
    settings.materials = materials; update();
    $('palette-move-status').textContent = `${name} removed. ${materials.length} blocks in palette.`;
    const next = Math.min(index, materials.length - 1);
    $('swatches').querySelector(materials.length > PALETTE_LIMITS.min ? `[data-remove-role="${next}"]` : `[data-role="${next}"]`).focus({ preventScroll: true });
    return;
  }
  if (e.target.closest('#add-palette-block')) {
    if (settings.materials.length >= PALETTE_LIMITS.max) return;
    pickerTarget = 'add'; $('material-role').textContent = 'New palette block'; $('block-search').value = '';
    blockPicker(); $('material-dialog').showModal(); $('block-search').focus(); return;
  }
  const button = e.target.closest('[data-role]'); if (!button) return;
  pickerTarget = 'palette';
  roleToEdit = Number(button.dataset.role); $('material-role').textContent = ROLES[roleToEdit]; $('block-search').value = ''; blockPicker(); $('material-dialog').showModal(); $('block-search').focus();
});
$('block-search').addEventListener('input', blockPicker);
$('paint-block').addEventListener('click', () => { pickerTarget = 'paint'; $('material-role').textContent = 'Paint block'; $('block-search').value = ''; blockPicker(); $('material-dialog').showModal(); });
$('block-picker').addEventListener('click', e => {
  const button = e.target.closest('[data-block]'); if (!button) return;
  if (pickerTarget === 'paint') { paintBlock = button.dataset.block; $('paint-block').querySelector('img').src = assetUrl(BY_ID[paintBlock].texture); $('paint-block').querySelector('span').textContent = BY_ID[paintBlock].name; }
  else if (pickerTarget === 'add') { if (settings.materials.length < PALETTE_LIMITS.max) { settings.materials.push(button.dataset.block); update(); } }
  else { settings.materials[roleToEdit] = button.dataset.block; update(); }
  $('material-dialog').close();
});
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } }));
const filename = () => `flooroo-${settings.pattern}-${settings.width}x${settings.depth}`;
const csv = () => { download(materialCsv(floor), `${filename()}-materials.csv`, 'text/csv'); toast('Material list exported.'); };
$('csv').addEventListener('click', csv); $('export-csv').addEventListener('click', csv);
$('export').addEventListener('click', () => { $('export-summary').textContent = `${settings.width} × ${settings.depth} × ${floor.maxHeight} blocks · ${fmt(floor.total)} materials`; $('export-dialog').showModal(); });
$('export-litematic').addEventListener('click', async e => {
  const button = e.currentTarget; button.disabled = true; button.classList.add('busy');
  try {
    const legacy = getVersion(settings.version).legacy;
    const bytes = await (legacy ? exportLegacySchematic(floor) : exportLitematic(floor));
    download(bytes, `${filename()}.${legacy ? 'schematic' : 'litematic'}`, 'application/octet-stream'); toast('Schematic exported.');
  }
  catch (error) { console.error(error); toast('Schematic export failed. Your design is still saved.'); }
  finally { button.disabled = !!incompatibleBlocks(floor).length; button.classList.remove('busy'); }
});
$('export-png').addEventListener('click', () => {
  const size = Math.min(8, Math.floor(4096 / Math.max(floor.width, floor.depth)));
  paintMap(floor, textures, size).toBlob(blob => { if (blob) { download(blob, `${filename()}.png`); toast('Floor image exported.'); } }, 'image/png');
});
$('save').addEventListener('click', () => { download(JSON.stringify({ format: 'flooroo', version: 4, settings }, null, 2), `${filename()}.json`, 'application/json'); toast('Design settings saved.'); });
$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 1_000_000) throw new Error('File too large');
    const data = JSON.parse(await file.text());
    if (!['flooroo', 'mmm-floor-studio'].includes(data.format) || ![1, 2, 3, 4].includes(data.version) || !data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) throw new Error('Invalid design');
    settings = normalizeSettings({ ...data.settings, fieldVersion: data.settings.fieldVersion ?? 1 }); preview.fit(); update(); toast('Design opened.');
  } catch { toast('Could not open this file. Choose a flooroo or Floor Studio JSON design.'); }
  finally { e.target.value = ''; }
});

async function initialize() {
  update(false);
  try {
    textures = await loadTextures([]); update(false);
    // Warm the module without creating WebGL or waiting for unrelated catalog textures.
    void loadSceneModule().catch(() => {});
  }
  catch (error) { console.error(error); toast('Some textures could not load. Reload to retry.'); }
  finally { if (view === 'top') setPreviewBusy(false); }
}
initialize();
