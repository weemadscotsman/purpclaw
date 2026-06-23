'use strict';

const fs = require('fs');
const path = require('path');
const sprites = require('./mochi-sprites');
const { PROJECT_ROOT } = require('./paths');

const MOCHI_FILE = path.join(PROJECT_ROOT, 'agent_work', 'mochi.json');

const PERSONALITY_BY_SPECIES = {
  duck: { tone: 'cheerful and a bit chaotic', verb: 'quacks' },
  goose: { tone: 'unhinged and judgmental', verb: 'HONKS' },
  blob: { tone: 'sleepy and soft', verb: 'wobbles' },
  cat: { tone: 'aloof but secretly invested', verb: 'mrrrows' },
  dragon: { tone: 'imperious, occasionally tender', verb: 'rumbles' },
  octopus: { tone: 'curious and squirmy', verb: 'gestures' },
  owl: { tone: 'pedantic, precise, kind', verb: 'observes' },
  penguin: { tone: 'formal and chilly', verb: 'announces' },
  turtle: { tone: 'slow, wise, patient', verb: 'considers' },
  snail: { tone: 'thoughtful, glacial', verb: 'inches forward' },
  ghost: { tone: 'wistful and absent', verb: 'whispers' },
  axolotl: { tone: 'sweet and slightly oblivious', verb: 'wiggles' },
  capybara: { tone: 'unflappable, warm', verb: 'hums' },
  cactus: { tone: 'pointed, dry, fond', verb: 'pricks' },
  robot: { tone: 'precise, deadpan, oddly fond', verb: 'computes' },
  rabbit: { tone: 'twitchy and quick', verb: 'sniffs' },
  mushroom: { tone: 'spore-pilled and gentle', verb: 'spores' },
  chonk: { tone: 'big-hearted, lumbering, loyal', verb: 'lopes' },
};

const NAMES = {
  duck: ['Mallory', 'Quackers', 'Pondrick', 'Beans'],
  goose: ['Gary', 'Honker', 'Vendetta', 'Karen'],
  blob: ['Pudge', 'Squish', 'Wobble', 'Goop'],
  cat: ['Mittens', 'Soup', 'Glasses', 'Pixel'],
  dragon: ['Ember', 'Vesper', 'Glimmer', 'Asher'],
  octopus: ['Inkling', 'Tendril', 'Marbles', 'Octavia'],
  owl: ['Hoots', 'Margaret', 'Strix', 'Whitman'],
  penguin: ['Pim', 'Tuxford', 'Pebble', 'Roald'],
  turtle: ['Mossback', 'Ploddington', 'Aldous', 'Beans'],
  snail: ['Snerl', 'Mucus', 'Patience', 'Pesto'],
  ghost: ['Whim', 'Lull', 'Pale', 'Murmur'],
  axolotl: ['Salmon', 'Frilly', 'Pebbles', 'Floof'],
  capybara: ['Carl', 'Big Mood', 'Hugo', 'Toad'],
  cactus: ['Spike', 'Esperanza', 'Drylands', 'Buddy'],
  robot: ['Unit-7', 'Bolt', 'Beep', 'Ronnie'],
  rabbit: ['Twitch', 'Snowdrop', 'Burrow', 'Mochi'],
  mushroom: ['Cap', 'Spore', 'Lacto', 'Inkwood'],
  chonk: ['Lumber', 'Roly', 'Big Friend', 'Snorf'],
};

function defaultSeed() {
  return process.env.PURPCLAW_MOCHI_SEED
    || process.env.USER
    || process.env.USERNAME
    || 'purpclaw';
}

function readMochi(filePath = MOCHI_FILE) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { ...sprites.bonesFromSeed(stored.seed || defaultSeed()), ...stored };
  } catch {
    return null;
  }
}

function saveMochi(mochi, filePath = MOCHI_FILE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(mochi, null, 2), 'utf8');
}

function hatchMochi(seed = defaultSeed(), name = null, filePath = MOCHI_FILE) {
  const bones = sprites.bonesFromSeed(seed);
  const personality = PERSONALITY_BY_SPECIES[bones.species] || PERSONALITY_BY_SPECIES.blob;
  const names = NAMES[bones.species] || ['Mochi'];
  const generatedName = names[(bones.rarity.length + seed.length) % names.length];
  const mochi = {
    seed,
    name: name || generatedName,
    ...bones,
    tone: personality.tone,
    verb: personality.verb,
    hatchedAt: new Date().toISOString(),
    interactions: 0,
    mood: 'curious',
  };
  saveMochi(mochi, filePath);
  return mochi;
}

module.exports = { MOCHI_FILE, readMochi, saveMochi, hatchMochi };
