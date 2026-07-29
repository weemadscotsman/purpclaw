'use strict';
/**
 * lib/commands/buddy.js
 * ─────────────────────────────────────────────────────────────────────────────
 * purpclaw buddy [hatch|set <hero>|name <n>|mute|unmute|list]
 *
 * OpenClaude-compatible companion hero interface backed by PurpClaw's Mochi
 * sprite system. Bridges the /buddy slash command from upstream Gitlawb/openclaude
 * into PurpClaw's existing pet/companion infrastructure (lib/commands/pet.js,
 * lib/mochi.js, lib/mochi-sprites.js).
 *
 * Hero → species mapping (mirrors OpenClaude's pixel-art Buddy heroes):
 *   robinhood → duck        (agile, clever)
 *   kaio      → dragon      (imperious, occasionally tender)
 *   strawhat  → axolotl     (sweet, regenerate)
 *   merlin    → owl         (pedantic, precise, kind)
 *   kage      → cat         (aloof but secretly invested)
 *   ember     → dragon      (imperious — shared)
 *   corsair   → octopus     (curious and squirmy, sea-raider)
 *   random    → picks one of the above randomly
 *
 * Terminal capability detection:
 *   - Guard: COLS < 100 → fall back to line-art names only
 *   - prefersReducedMotion → emit motion once, then freeze
 *   - COLORTERM=null → emit plain ASCII (no truecolor)
 *
 * Usage:
 *   purpclaw buddy hatch        — pick a hero and hatch your companion
 *   purpclaw buddy set <hero>   — switch active hero species
 *   purpclaw buddy name <n>     — name your companion
 *   purpclaw buddy mute          — silence animations
 *   purpclaw buddy unmute        — re-enable animations
 *   purpclaw buddy list         — show available heroes with sprites
 *   purpclaw buddy status        — show current hero + mood
 */

const path    = require('path');
const fs      = require('fs');
const readline = require('readline');

const mochi   = require('../mochi');
const sprites = require('../mochi-sprites');

// ── Hero → Mochi species map ───────────────────────────────────────────────────
const HERO_SPECIES = {
  robinhood: 'duck',
  kaio:      'dragon',
  strawhat:  'axolotl',
  merlin:    'owl',
  kage:      'cat',
  ember:     'dragon',
  corsair:   'octopus',
};

const VALID_HEROES = Object.keys(HERO_SPECIES);

function randomHero() {
  const heroes = Object.keys(HERO_SPECIES);
  return heroes[Math.floor(Math.random() * heroes.length)];
}

// ── Terminal capability detection ───────────────────────────────────────────────
function canAnimate() {
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  if (cols < 100) return { ok: false, reason: `width ${cols} < 100 cols` };
  if (process.env.npm_config_legacy_browser || process.env.BROWSER) return { ok: false, reason: 'browser environment' };
  const motion = process.env.PREFER_REDUCED_MOTION || process.env.npm_config_prefer_reduced_motion;
  if (motion === 'true' || motion === '1') return { ok: false, reason: 'prefersReducedMotion' };
  return { ok: true };
}

function canTruecolor() {
  return process.env.COLORTERM !== 'null' && process.stdout.isTTY;
}

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', gray: '\x1b[90m',
};
const col = (c, s) => process.stdout.isTTY ? `${c}${s}${C.reset}` : s;

// ── Render hero sprite (single frame, for hatch/status) ───────────────────────
function renderHeroFrame(species, eye = '·', hat = 'none', frame = 0) {
  return sprites.renderSprite({ species, eye, hat }, frame);
}

function printSprite(lines) {
  for (const l of lines) console.log(col(C.cyan, l));
}

// ── Prompt helper ─────────────────────────────────────────────────────────────
function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

// ── Hatch flow ────────────────────────────────────────────────────────────────
async function cmdHatch(ctx) {
  console.log('');
  console.log(col(C.bold, '  ⚔  CHOOSE YOUR HERO  ⚔'));
  console.log('');
  const cap = canAnimate();
  if (!cap.ok) console.log(col(C.gray, `  (animation unavailable: ${cap.reason} — list view only)\n`));

  VALID_HEROES.forEach((hero, i) => {
    const species = HERO_SPECIES[hero];
    const art = cap.ok
      ? renderHeroFrame(species).map(l => col(C.cyan, l)).join('\n  ')
      : `  [${species}]`;
    console.log(`  ${i + 1}. ${col(C.bold, hero.padEnd(10))} — ${col(C.gray, species)}`);
    if (cap.ok) console.log(`  ${art}`);
    console.log('');
  });
  console.log(`  ${VALID_HEROES.length + 1}. ${col(C.gray, 'random — surprise me')}`);
  console.log('');

  const choice = await prompt('  Enter number or hero name: ');
  let hero;
  const num = parseInt(choice);
  if (!isNaN(num) && num >= 1 && num <= VALID_HEROES.length + 1) {
    hero = num === VALID_HEROES.length + 1 ? randomHero() : VALID_HEROES[num - 1];
  } else {
    hero = VALID_HEROES.includes(choice.toLowerCase()) ? choice.toLowerCase() : randomHero();
  }

  const species = HERO_SPECIES[hero];
  const namePrompt = await prompt('  Name your companion (press Enter for random): ');
  const name = namePrompt || hero;

  const seeded = mochi.hatchMochi(process.env.USER || 'purpclaw', name);
  seeded.species = species;
  seeded.hero = hero;
  mochi.saveMochi(seeded);

  console.log('');
  console.log(col(C.green, `  ✔  ${name} the ${species} has hatched!`));
  if (cap.ok) {
    console.log('');
    printSprite(renderHeroFrame(species, '✦', 'none', 0));
  }
  console.log('');
  console.log(`  Hero:   ${col(C.cyan, hero)}`);
  console.log(`  Species: ${col(C.cyan, species)}`);
  console.log('');
  return 0;
}

// ── Set hero ──────────────────────────────────────────────────────────────────
async function cmdSet(heroArg, ctx) {
  const hero = (heroArg || '').toLowerCase();
  if (!hero || !VALID_HEROES.includes(hero)) {
    console.log(`Usage: purpclaw buddy set <hero>`);
    console.log(`Available heroes: ${VALID_HEROES.join(', ')}`);
    return 1;
  }
  const m = mochi.loadMochi();
  m.species = HERO_SPECIES[hero];
  m.hero = hero;
  mochi.saveMochi(m);

  console.log(col(C.green, `  ✔  Companion is now ${hero} (${m.species})`));

  const cap = canAnimate();
  if (cap.ok) {
    console.log('');
    printSprite(renderHeroFrame(m.species, '✦', 'none', 0));
  }
  console.log('');
  return 0;
}

// ── Name companion ─────────────────────────────────────────────────────────────
async function cmdName(nameArg, ctx) {
  const name = nameArg || '';
  if (!name) {
    console.log('Usage: purpclaw buddy name <newname>');
    return 1;
  }
  const m = mochi.loadMochi();
  m.name = name;
  mochi.saveMochi(m);
  console.log(col(C.green, `  ✔  Companion renamed to "${name}"`));
  console.log('');
  return 0;
}

// ── Mute / unmute ───────────────────────────────────────────────────────────────
async function cmdMute(mute, ctx) {
  const m = mochi.loadMochi();
  m.muted = mute;
  mochi.saveMochi(m);
  console.log(col(mute ? C.yellow : C.green, `  Companion ${mute ? 'muted' : 'unmuted'}.`));
  console.log('');
  return 0;
}

// ── List heroes ───────────────────────────────────────────────────────────────
async function cmdList(ctx) {
  const cap = canAnimate();
  console.log('');
  console.log(col(C.bold, '  ⚔  AVAILABLE HEROES'));
  console.log('');

  if (cap.ok) {
    for (const hero of VALID_HEROES) {
      const species = HERO_SPECIES[hero];
      const lines = renderHeroFrame(species, '·', 'none', 0);
      console.log(`  ${col(C.bold, hero)} — ${col(C.gray, species)}`);
      for (const l of lines) console.log(`  ${col(C.cyan, l)}`);
      console.log('');
    }
  } else {
    for (const hero of VALID_HEROES) {
      const species = HERO_SPECIES[hero];
      console.log(`  ${col(C.bold, hero.padEnd(10))} ${col(C.gray, `→ ${species}`)}`);
    }
    console.log('');
    console.log(col(C.gray, `  (animation unavailable: ${cap.reason})`));
    console.log('');
  }
  return 0;
}

// ── Status ────────────────────────────────────────────────────────────────────
async function cmdStatus(ctx) {
  const m = mochi.loadMochi();
  const cap = canAnimate();

  console.log('');
  console.log(col(C.bold, '  ⚔  COMPANION STATUS'));
  console.log('');
  console.log(`  Name:    ${col(C.cyan, m.name || '(unnamed)')}`);
  console.log(`  Species: ${col(C.cyan, m.species || 'unknown')}`);
  console.log(`  Hero:    ${col(C.cyan, m.hero || 'none')}`);
  console.log(`  Mood:    ${col(C.cyan, m.mood || 'unknown')}`);
  console.log(`  Muted:   ${m.muted ? col(C.yellow, 'yes') : col(C.green, 'no')}`);
  console.log(`  Seed:    ${col(C.gray, m.seed || '(none)')}`);

  if (cap.ok && m.species) {
    console.log('');
    printSprite(renderHeroFrame(m.species, m.eye || '·', m.hat || 'none', 0));
  }
  console.log('');
  return 0;
}

// ── Main dispatcher ─────────────────────────────────────────────────────────────
async function run(args, rawCtx) {
  const ctx = rawCtx || {};
  const sub = (args[0] || '').toLowerCase();

  switch (sub) {
    case 'hatch':    return cmdHatch(ctx);
    case 'set':      return cmdSet(args[1], ctx);
    case 'name':     return cmdName(args.slice(1).join(' '), ctx);
    case 'mute':     return cmdMute(true, ctx);
    case 'unmute':   return cmdMute(false, ctx);
    case 'list':     return cmdList(ctx);
    case 'status':   return cmdStatus(ctx);
    default:
      // Show quick status + hint
      await cmdStatus(ctx);
      console.log(col(C.gray, '  Usage: purpclaw buddy hatch|set <hero>|name <n>|mute|unmute|list'));
      console.log('');
      return 0;
  }
}

module.exports = { run };
