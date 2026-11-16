# flooroo

Design patterned Minecraft floors in your browser, edit individual blocks, and export a schematic or material list. No account or backend is required. Designs stay in your browser unless you export them; flooroo does not place blocks in a world.

**[Open flooroo](https://darealshekel.github.io/flooroo/)** | [Report a problem](https://github.com/darealshekel/flooroo/issues)

Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft. Published by [darealshekel](https://github.com/darealshekel).

## Workspace

Pattern, Blocks, and Materials tabs keep settings separate from the canvas. Pattern contains the primary geometry and floor-size controls; Fine tuning reveals symmetry, detail, spacing and seed. Blocks contains the Minecraft version, palette and generation pool. Materials contains exact quantities and build dimensions. Generate and the design explorer stay available in every tab.

Dark mode is the default. The top-left sun/moon button switches between dark and light controls around the same graphite canvas. Your choice is stored separately from designs and restored before the app loads. Real block swatches, compact toolbars and visible keyboard focus work in both themes. Desktop keeps the inspector beside the canvas; narrow screens stack it below. Arrow keys, Home and End switch the inspector tabs. Keyboard interactions are immediate; pointer feedback and dialogs use brief transitions, disabled with reduced motion.

## Run

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4406. `npm run build` creates the static site in `dist/`.

Node.js 22 or newer is recommended. The live website has separate browser storage from localhost; export/import design JSON to move existing work between them.

## GitHub Pages

Pushes to `main` run unit tests, build the site with the `/flooroo/` base path, and check the production build in desktop and mobile Chromium before deploying. Pull requests run the same checks without deployment. GitHub repository Settings > Pages must use **GitHub Actions** as its source.

```sh
npm run build:pages
npx playwright install chromium
npm run test:pages
```

The Pages test starts and stops its own local preview server. Set `PREVIEW_URL` to test an existing deployment instead. A normal `npm run build` still supports hosting at a domain root. Deployment uses no application secrets or external API. To roll back a change, revert its commit and push to `main`; the same checks run before redeployment.

## Included

- Image-to-floor import with Inspired by, Recreate, and Palette only modes. PNG/JPEG/WebP files stay in the browser; no API key, upload service, or image-generation model is used. Choose a reference area with four movable corners (or numeric X/Y coordinates) to correct perspective. Preview the full floor before applying; Cancel leaves the design untouched and Apply is one undo step.
- Recreate samples the selected image area into the current square tile resolution and approximates its colors with seven palette slots. The tile repeats across the existing floor dimensions and retains the outer border. It does not identify exact block types from screenshots or reconstruct hidden geometry. Inspired by folds and warps the reference's own shapes into new seamless, symmetric tiles, with a variation control. Palette only replaces the current palette while preserving its size, the existing pattern, heights and manual edits. All modes respect the selected Java version and block pool; protected overrides remain unchanged. New image tiles are flat unless retained protected cells have height.
- Image designs remain editable, resizable and exportable. JSON/autosave stores only the bounded tile grid and material IDs, never the uploaded file. PNG/JPEG/WebP files are limited to 12 MB, 32 megapixels and 8,192 pixels per side, then reduced to at most 1,024 pixels per side for analysis. Transparent areas use the foundation slot. Poor lighting, obstructed areas and perspective cropping can reduce fidelity; overhead references work best.
- Seeded field generator: contour fields, braided channels, fractured inlay, cellular terraces, folded circuits and wave interference. Each seed selects its own frequencies, phases, cells and secondary structure.
- Weirdness from 0-100% progressively warps geometry and, above 50%, mixes in a second structure. It does not change the seed or materials.
- A Weirdness on/off switch preserves the stored percentage; off produces the same geometry as 0%.
- Independent shape-size (50-200%), fine-detail (0-100%) and empty-space (0-85%) controls. Empty space is a minimum foundation-block share in the generated tile, before manual edits and the full-floor border.
- Botanical, geometric, architectural and interlaced character settings; optional composition constraint. Everything selects one of these four styles deterministically from the seed; Automatic independently permits all six layouts. Existing drafts and imported designs keep their original geometry until Generate/Explore or a style change opts them into the new selection behavior.
- A six-design explorer with reroll and selection. Selected designs retain exactly the geometry and materials shown in their thumbnails.
- 16-1,024 block floor dimensions, including 528 x 528; 32, 48, 64, 96, 128 or 192 block tiles. Enter or leaving a dimension field applies it. Invalid input preserves the previous value and shows the allowed range. Larger floors use a bounded 2D preview resolution without changing block data or schematic dimensions.
- Four preset palettes, 1,283 block entries, and coordinated random seven-slot palettes. A random roll chooses one of 12 material families (stone, copper patina, moss, amethyst, crimson, tidal, sandstone, rose marble, frost, timber, jade, or endstone), then varies compatible materials within that family. It does not independently sample unrelated blocks from the full catalog. Each family assigns foundation, outline, motif, accent, inlay, light and trim together. A custom 2-16 block pool chooses a color-compatible family and maps its roles strictly to those selected blocks; missing colors or light sources cannot be invented. The dropdown, shuffle button and Random palette on Generate share this logic. Existing saved palettes remain unchanged until explicitly rerolled.
- 19 Minecraft Java release targets from 1.12.2 through 26.3. The picker includes tinted grass/leaves, carpets, walls, fences, doors, trapdoors, redstone, plants, utility blocks and technical blocks, in addition to slabs, stairs and full building blocks. Air and transient piston internals are omitted. Version filters and historical aliases keep the selection release-aware, including experimental feature boundaries. The legacy mapping audit covers every normalized 1.12.2 block name except air and transient piston internals. This is a block catalog, not an item or entity catalog.
- New static block models use Minecraft's model faces, partial geometry, texture UVs and element rotations. Grass/foliage use fixed preview tints rather than biome-dependent colors. Blocks with special entity renderers use simplified previews. The tool exports individual default block states: it does not simulate neighbor connections, plant support, fluids, redstone, automatic door/bed assembly, inventory contents or custom head/banner decoration. Legacy bed/banner colors are included in schematic block-entity data.
- Searchable block selection with material-family filters, individual checkboxes, select/clear shown, and a persistent generation pool of 2-16 blocks. Apply is disabled below two; unchecked blocks and Select shown are disabled at sixteen. Hidden selections count toward the limit. Small pools repeat blocks across the seven palette slots. Applying a selection updates palette slots, not painted or protected cells. Manual painting can still use any compatible catalog block. A default design without a custom pool may draw from the entire compatible catalog; opening Choose blocks starts from its active materials.
- Active palettes support 2-7 block positions. Each swatch has a top-right remove button, disabled at two; the plus button opens the block picker to add a position back. Pattern roles reuse the remaining blocks, including the floor border. Removing or adding is undoable and preserves painted/protected cells and their heights. Keep palette, random rerolls, autosave and JSON retain the chosen size; choosing a preset restores its seven positions. The separate generation pool still supports 2-16 blocks.
- Save up to 30 named palettes locally, including two-block palettes. Saved palettes adapt to the selected version and generation pool when reapplied. Named palettes are browser-local; design JSON includes the active materials and block pool.
- Reorder active palette blocks by dragging a swatch to another position, using Alt+Left/Right on a focused swatch, or clicking a swatch and choosing its Position in the block picker. Moving inserts the block at its new slot and shifts the intervening blocks; it does not change the selection pool or pattern geometry. Each move is undoable. Painted/protected overrides stay intact, and named palettes, autosave and design JSON retain the new order.
- Separate controls to randomize the palette now or choose Keep palette / Random palette on every Generate. Palette changes do not change geometry. Weirdness, dimension and preview changes never reroll materials.
- Mirrored geometry, detail settings, seed variations, border and raised details.
- Textured top-down view with pan/zoom and tile grid; orbitable Three.js preview.
- Exact material counts including blocks beneath raised details.
- Gzip-compressed `.litematic` export with the selected Java data version for 1.13.2 through 26.3; legacy MCEdit `.schematic` with numeric block IDs and metadata for 1.12.2. Textured PNG and materials CSV are also available.
- Local autosave, undo/redo and JSON design import/export.
- Tile painting, straight lines, connected flood fill, matching-block replacement and erase-to-generated-block tools. Choose any catalog block and a height of 1-3 blocks.
- Independent edit mirroring: none, left/right, top/bottom, both axes or 8-way. Mirror axes can be moved in half-block increments.
- Painted protection masks retain exact blocks and heights through Generate, Explore, random palettes and geometry changes. Protected cells cannot be painted over until unlocked.

## Tile editing

Selecting an editing tool opens top-down Single tile view. Edits repeat with that tile across the floor; the full-floor outer border still frames the result. Full floor and 3D view return to Pan, keeping edits intact.

1. Paint with the brush, line or fill tools. Each completed stroke is one undo step. Replace targets all matching blocks on the tile, excluding protected cells.
2. Paint the areas to keep with Protect region. The teal overlay can be hidden with the eye button.
3. Generate or choose an Explore alternative. Protected blocks and heights survive exactly; unprotected manual edits are replaced along with the rest of the tile.

Unprotect removes the lock without immediately changing the block. Erase and Clear unprotected edits restore generated geometry, leaving locked areas intact. Each action can be undone. Resizing a tile centers existing edits and crops anything beyond the new edges; Undo restores the old size and layer.

The canvas supports mouse/touch, Alt-drag or middle-button pan, Escape to cancel a stroke, and arrow keys plus Space for keyboard painting. Ctrl/Cmd+Z undoes a step; Ctrl/Cmd+X redoes it. Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y also redo. These shortcuts work across the workspace, except inside inputs, selectors, editable text and open dialogs. Normal text undo/cut is preserved. An active pointer stroke finishes before history can change.

New generation no longer uses the supplied references' medallions, floral motifs, ornamental frames or finished tile templates. Its continuous fields are sampled into block cells. Geometric resemblance cannot be universally excluded, but no reference-image tracing or matching is performed. Partial edge tiles are centered and cropped. Slabs use their bottom half; stairs face north with a straight shape. These states are explicit in modern exports and matched by legacy metadata. Rotation and top-half editing are not included. Raised mode repeats the selected block at whole-block Y intervals, so raised partial blocks have gaps. The 3D preview uses actual slab/stair geometry and top/side textures; lighting and neighbor-dependent stair connections are not Minecraft's renderer.

Legacy Cathedral, Rosette, Garden mosaic, Foundry and procedural ornament JSON designs still import through their original generator. They are not available through Generate or Explore. The editor keeps the `mmm-floor-v3` autosave key and `mmm-floor-palettes` library key so the rename preserves existing work. Older `mmm-floor-v1` and `mmm-floor-v2` drafts are left untouched. New files use the `flooroo` format identifier and version 4; the old `mmm-floor-studio` identifier and versions 1-4 remain importable. The first 32 catalog indices and original cell encodings are unchanged; new blocks use additional banks above the original byte. Larger 128/192-block tiles preserve more fine detail than smaller tiles. Undo history is bounded to 60 steps or approximately 8 MB of serialized snapshots.

Changing the Minecraft target never silently rewrites existing materials or protected edits. Unavailable materials trigger a warning and disable schematic export. Use **Replace unavailable blocks** to substitute the nearest average texture colors from the compatible selection. That action preserves cell heights and protection, and is undoable. Choosing a preset or generating a new random palette already respects the target version. If a version change leaves the selected pool empty, all compatible blocks are re-enabled with a notice. Old designs without a version retain the original 1.21 target. Preview textures use the current game artwork, not historical texture packs.

## Verification

```sh
npm test
npm run build
npm run test:browser
npm run test:editor
npm run test:versions
npm run test:workspace
npm run test:theme
npm run test:dimensions
npm run test:blocks
npm run test:images
```

Tests cover symmetry, tiling, size limits, material counts and block-by-block NBT export round trips. Diversity checks cover both legacy ornament and new field generation. Every new composition is checked at 0%, 50% and 100% weirdness for determinism, valid blocks, matching edges and meaningful geometry changes. Palette tests cover unique blocks, reproducibility, preservation and reroll behavior. Browser checks require the local server and Playwright Chromium (`npx playwright install chromium`). They cover the controls, pixel-exact explorer selection with random materials, desktop/mobile rendering, 3D canvas pixels and camera movement, exports, import, autosave and editor controls. Export uses NBTify and the Litematica v6 continuous bit-packing format. Version checks cover every target, introduction boundaries, all legacy IDs and dye metadata, all modern blocks, protected-cell conversion, named palette persistence and empty/small selections. An in-game import has not been tested.

Editor checks additionally cover real mouse/touch input, stroke cancellation, single-stroke undo, off-center and 8-way mirroring, fill barriers, exact protected blocks/heights after regeneration, editing-layer import and resize validation, and NBT export of all 32 materials. Desktop/mobile screenshots and 3D pixel checks are saved under `test-results/`.

Workspace checks cover keyboard undo/redo, multiple history steps, branch replacement, native text cut/undo, dialog isolation, active-stroke safety, tab keyboard navigation, reduced motion and layouts from 320 to 1920 pixels wide.

## Asset provenance

Block previews use vanilla textures extracted from Mojang's official 26.3 client archive (SHA-1 `e877b6a07acd633fb3bb475002175cec036e7b87`). Minecraft artwork belongs to Mojang/Microsoft and is not licensed as flooroo code. Its use is subject to the [Minecraft Usage Guidelines](https://www.minecraft.net/en-us/usage-guidelines). No client archive or game executable is included. See [third-party notices](public/THIRD_PARTY_NOTICES.txt). Run `scripts/extract-textures.ps1 -JarPath <26.3-client.jar>` from the app directory to rebuild textures and generated average-color metadata. The script verifies that each catalog ID has a real block-state asset. It does not launch Minecraft or modify an instance.

`scripts/build-block-catalog.ps1 -DownloadMappings` rebuilds `src/vanilla-blocks.json` from the client models and PrismarineJS version/legacy mappings, caching downloaded data under `.cache/`. It preserves the original 125 catalog indices, then appends the expanded catalog. Do not reorder existing entries when adding future blocks. Slab names renamed between 1.13 and 1.14 and legacy neighbor-derived stair shapes are handled explicitly. The metadata is local at runtime; no external API is needed to browse blocks.

MapartCraft inspired the version selector, block-selection filters and reusable-palette workflow. Its GPL-3.0 implementation and palette JSON were not copied. flooroo uses its own catalog and selection logic, with factual game metadata checked against the sources below.

References:
- https://github.com/mike2b2t/mapartcraft
- https://github.com/PrismarineJS/minecraft-data/blob/master/data/pc/common/protocolVersions.json
- https://github.com/PrismarineJS/minecraft-data/blob/master/data/pc/1.12/blocks.json
- https://github.com/PrismarineJS/minecraft-data/blob/master/data/pc/common/legacy.json
- https://piston-meta.mojang.com/mc/game/version_manifest_v2.json
- https://www.minecraft.net/en-us/article/minecraft-java-edition-26-3
- https://github.com/EngineHub/WorldEdit/blob/version/7.3.x/worldedit-core/src/main/java/com/sk89q/worldedit/extent/clipboard/io/MCEditSchematicReader.java
- https://github.com/Offroaders123/NBTify
- https://github.com/SmylerMC/litemapy/blob/master/litemapy/schematic.py
- https://github.com/SmylerMC/litemapy/blob/master/litemapy/storage.py
