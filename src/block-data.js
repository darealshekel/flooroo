// Only full, solid floor blocks. Legacy tuples are pre-flattening block ID / metadata.
export const DYES = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
export const DYE_COLORS = ['#e9ecec', '#ed8d2b', '#b34ac1', '#3aafd9', '#f8c628', '#70b919', '#ed8dac', '#42484c', '#8e8e86', '#168a91', '#7b2eaa', '#35399d', '#724728', '#546d1b', '#a12723', '#1b1e24'];
export const LEGACY = {
  quartz_block: [155, 0], sea_lantern: [169, 0], red_nether_bricks: [215, 0], nether_bricks: [112, 0],
  dark_prismarine: [168, 2], prismarine_bricks: [168, 1], purpur_block: [201, 0], end_stone_bricks: [206, 0],
  polished_andesite: [1, 6], stone_bricks: [98, 0], chiseled_stone_bricks: [98, 3], gold_block: [41, 0],
  stone: [1, 0], cobblestone: [4, 0], granite: [1, 1], polished_granite: [1, 2], diorite: [1, 3], polished_diorite: [1, 4], andesite: [1, 5],
  bricks: [45, 0], mossy_stone_bricks: [98, 1], cracked_stone_bricks: [98, 2], mossy_cobblestone: [48, 0],
  obsidian: [49, 0], end_stone: [121, 0], netherrack: [87, 0], terracotta: [172, 0],
  iron_block: [42, 0], diamond_block: [57, 0], emerald_block: [133, 0], lapis_block: [22, 0], coal_block: [173, 0],
  glowstone: [89, 0], prismarine: [168, 0],
};
for (const [suffix, id] of [['wool', 35], ['concrete', 251], ['terracotta', 159]]) DYES.forEach((dye, i) => { LEGACY[`${dye}_${suffix}`] = [id, i]; });
['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak'].forEach((wood, i) => { LEGACY[`${wood}_planks`] = [5, i]; });
export const INTRODUCED = {
  '1.16': ['polished_blackstone', 'polished_blackstone_bricks', 'shroomlight', 'blackstone', 'crimson_planks', 'warped_planks', 'netherite_block'],
  '1.17': ['polished_deepslate', 'deepslate_tiles', 'deepslate_bricks', 'calcite', 'copper_block', 'cut_copper', 'oxidized_copper', 'oxidized_cut_copper', 'amethyst_block', 'moss_block', 'tuff', 'cobbled_deepslate'],
  '1.19': ['mud_bricks', 'packed_mud', 'mangrove_planks'],
  '1.20': ['cherry_planks', 'bamboo_planks', 'bamboo_mosaic'],
  '1.21': ['polished_tuff', 'tuff_bricks'],
  '1.21.4': ['pale_oak_planks', 'resin_bricks', 'resin_block'],
  '26.2': ['cinnabar', 'polished_cinnabar', 'cinnabar_bricks', 'sulfur', 'polished_sulfur', 'sulfur_bricks'],
  '26.3': ['poplar_planks'],
};
