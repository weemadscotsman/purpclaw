/**
 * GACHA SYSTEM — Companion roll logic extracted from Claude Code leaked source
 * Extracted from: src/buddy/companion.ts
 * Modified for Companion Chorus
 */

const { RARITIES, RARITIES_WEIGHT, SPECIES, EYES, HATS } = require('./constants');

// Mulberry32 — tiny seeded PRNG
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash a string to number
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Pick random from array
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Roll rarity based on weights
function rollRarity(rng) {
  const total = Object.values(RARITIES_WEIGHT).reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (const rarity of RARITIES) {
    roll -= RARITIES_WEIGHT[rarity];
    if (roll < 0) return rarity;
  }
  return 'common';
}

// Rarity floor for stats
const RARITY_FLOOR = {
  common: 5,
  uncommon: 15,
  rare: 25,
  epic: 35,
  legendary: 50,
};

// Roll companion stats
function rollStats(rng, rarity) {
  const floor = RARITY_FLOOR[rarity];
  const names = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK'];
  
  // One peak stat, one dump stat
  const peak = pick(rng, names);
  let dump = pick(rng, names);
  while (dump === peak) dump = pick(rng, names);
  
  const stats = {};
  for (const name of names) {
    if (name === peak) {
      stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
    } else if (name === dump) {
      stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
    } else {
      stats[name] = floor + Math.floor(rng() * 40);
    }
  }
  return stats;
}

// Main roll function
function rollCompanion(seed) {
  const rng = mulberry32(hashString(seed + 'companion-salt-2026'));
  const rarity = rollRarity(rng);
  
  const bones = {
    rarity,
    species: pick(rng, SPECIES),
    eye: pick(rng, EYES),
    hat: rarity === 'common' ? 'none' : pick(rng, HATS),
    shiny: rng() < 0.01,
    stats: rollStats(rng, rarity),
  };
  
  return bones;
}

// Get companion name from species
function getSpeciesName(species) {
  const names = {
    duck: 'Duck',
    goose: 'Goose',
    blob: 'Blob',
    cat: 'Cat',
    dragon: 'Dragon',
    octopus: 'Octopus',
    owl: 'Owl',
    penguin: 'Penguin',
    turtle: 'Turtle',
    snail: 'Snail',
    ghost: 'Ghost',
    axolotl: 'Axolotl',
    capybara: 'Capybara',
    cactus: 'Cactus',
    robot: 'Robot',
    rabbit: 'Rabbit',
    mushroom: 'Mushroom',
    chonk: 'Chonk',
  };
  return names[species] || species;
}

// Get emoji for species
function getSpeciesEmoji(species) {
  const emojis = {
    duck: '🦆',
    goose: '🪿',
    blob: '💧',
    cat: '🐱',
    dragon: '🐉',
    octopus: '🐙',
    owl: '🦉',
    penguin: '🐧',
    turtle: '🐢',
    snail: '🐌',
    ghost: '👻',
    axolotl: '🦎',
    capybara: '🦫',
    cactus: '🌵',
    robot: '🤖',
    rabbit: '🐰',
    mushroom: '🍄',
    chonk: '💀',
  };
  return emojis[species] || '❓';
}

// Format stats for display
function formatStats(stats) {
  const maxLen = Math.max(...Object.keys(stats).map(k => k.length));
  return Object.entries(stats)
    .map(([k, v]) => `  ${k.padEnd(maxLen)}: ${'█'.repeat(Math.floor(v / 10))}${String(v).padStart(3)}`)
    .join('\n');
}

// Display companion info
function displayCompanion(bones) {
  const name = getSpeciesName(bones.species);
  const emoji = getSpeciesEmoji(bones.species);
  const stars = '★'.repeat(RARITIES.indexOf(bones.rarity) + 1) + '☆'.repeat(4 - RARITIES.indexOf(bones.rarity));
  const shinyLabel = bones.shiny ? ' ✨ SHINY ✨' : '';
  
  return {
    name: `${emoji} ${name}`,
    rarity: bones.rarity,
    species: bones.species,
    emoji,
    stars,
    shiny: bones.shiny,
    eye: bones.eye,
    hat: bones.hat,
    stats: bones.stats,
    formatted: `
${emoji} ${name} ${stars}${shinyLabel}
   Species: ${bones.species}
   Rarity: ${bones.rarity}
   Eye: ${bones.eye}  Hat: ${bones.hat}
   Shiny: ${bones.shiny ? 'YES ✨' : 'no'}
   
Stats:
${formatStats(bones.stats)}
`.trim(),
  };
}

// Roll and display
function rollAndDisplay(seed) {
  const bones = rollCompanion(seed);
  return displayCompanion(bones);
}

module.exports = {
  rollCompanion,
  rollAndDisplay,
  displayCompanion,
  getSpeciesName,
  getSpeciesEmoji,
  formatStats,
  RARITIES,
  RARITIES_WEIGHT,
  SPECIES,
  EYES,
  HATS,
};
