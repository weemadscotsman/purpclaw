/**
 * CONSTANTS — Extracted from Claude Code leaked source (src/buddy/types.ts)
 * Adapted for Companion Chorus
 */

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// Rarity weights (must sum to 100 for percentage display)
const RARITIES_WEIGHT = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
};

// All 18 species
const SPECIES = [
  'duck',
  'goose',
  'blob',
  'cat',
  'dragon',
  'octopus',
  'owl',
  'penguin',
  'turtle',
  'snail',
  'ghost',
  'axolotl',
  'capybara',
  'cactus',
  'robot',
  'rabbit',
  'mushroom',
  'chonk',
];

// Eye types
const EYES = ['·', '✦', '×', '◉', '@', '°'];

// Hat types (common species get 'none')
const HATS = ['none', 'crown', 'tophat', 'propeller', 'halo', 'wizard', 'beanie', 'tinyduck'];

// Stat names
const STAT_NAMES = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK'];

module.exports = {
  RARITIES,
  RARITIES_WEIGHT,
  SPECIES,
  EYES,
  HATS,
  STAT_NAMES,
};
