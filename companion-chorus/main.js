/**
 * COMPANION CHORUS v2.0 — 18 Terminal Weirdos Judging Your Code
 * Built: 2026-03-31
 * NOW WITH: ASCII sprites from Claude Code leaked source + Gacha roll system
 * 
 * Extracted from Claude Code leak:
 * - src/buddy/sprites.ts — ASCII art for all 18 species
 * - src/buddy/companion.ts — Gacha roll + rarity system
 * - src/buddy/types.ts — Species, rarities, stats constants
 */

const fs = require('fs');
const path = require('path');

// ============== IMPORT FROM CLAUDE CODE LEAK ==============
const { RARITIES, RARITIES_WEIGHT, SPECIES, EYES, HATS, STAT_NAMES } = require('./src/constants');
const { rollCompanion, rollAndDisplay, displayCompanion, getSpeciesEmoji, getSpeciesName } = require('./src/gacha');
const { BODIES, getFrameCount, getRarityColor, getRarityStars } = require('./src/sprites');
const { speak, announceCompanion, petReaction, getEmoji } = require('./src/voice');
const { generateCritique, generateResponse } = require('./src/minimax');

// ============== CONFIG ==============
const CONTEXT_FILE = path.join(process.env.HOME || process.env.USERPROFILE || 'C:\\Users\\Admin', '.companion-context.json');
const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE || 'C:\\Users\\Admin', '.companion-chorus');
const COMPANION_CONFIG = path.join(CONFIG_DIR, 'companions.json');

// ============== COMPANION ROSTER (18 species) ==============
const PERSONALITY_MAP = {
  duck:     { personality: 'aggressively helpful', catchphrase: 'HAVE YOU TRIED', chaos: 30, snark: 20, wisdom: 80, patience: 15 },
  ghost:    { personality: 'mysterious',             catchphrase: 'I have seen this...', chaos: 70, snark: 40, wisdom: 60, patience: 90 },
  dragon:   { personality: 'grandiose',             catchphrase: 'ONLY A FOOL', chaos: 85, snark: 60, wisdom: 95, patience: 10 },
  octopus:  { personality: 'scattered genius',       catchphrase: 'Wait but also—', chaos: 60, snark: 30, wisdom: 70, patience: 40 },
  robot:    { personality: 'deadpan',                 catchphrase: 'Error at line', chaos: 5, snark: 50, wisdom: 90, patience: 100 },
  mushroom: { personality: 'funky',                   catchphrase: 'What if we just', chaos: 90, snark: 20, wisdom: 50, patience: 70 },
  chonk:    { personality: 'chill',                  catchphrase: "yeah that's", chaos: 20, snark: 80, wisdom: 40, patience: 95 },
  owl:      { personality: 'wise condescending',      catchphrase: 'As I have always said', chaos: 25, snark: 90, wisdom: 100, patience: 60 },
  cactus:   { personality: 'minimal',                catchphrase: 'ow.', chaos: 40, snark: 70, wisdom: 30, patience: 50 },
  penguin:  { personality: 'formal',                catchphrase: 'I move to amend', chaos: 10, snark: 45, wisdom: 75, patience: 80 },
  goose:    { personality: 'chaotic',                catchphrase: 'HONK.', chaos: 95, snark: 55, wisdom: 45, patience: 20 },
  turtle:   { personality: 'slow',                  catchphrase: 'let us... consider...', chaos: 5, snark: 25, wisdom: 85, patience: 100 },
  axolotl:  { personality: 'regenerative',          catchphrase: 'we can regrow from this', chaos: 60, snark: 30, wisdom: 70, patience: 75 },
  capybara: { personality: 'chill',                 catchphrase: "that's valid", chaos: 15, snark: 35, wisdom: 65, patience: 95 },
  rabbit:   { personality: 'anxious',               catchphrase: 'oh no oh no', chaos: 55, snark: 40, wisdom: 50, patience: 30 },
  snail:    { personality: 'slow methodical',       catchphrase: 'patience...', chaos: 5, snark: 20, wisdom: 80, patience: 100 },
};

// Extended roster (all 18)
const COMPANION_DEFS = SPECIES.map(s => ({
  id: s,
  name: getSpeciesName(s).toUpperCase(),
  emoji: getSpeciesEmoji(s),
  ...(PERSONALITY_MAP[s] || { personality: 'mysterious', catchphrase: '...', chaos: 50, snark: 50, wisdom: 50, patience: 50 }),
}));

// ============== STATE ==============
let companions = [];
let focusedCompanionIndex = 0;
let currentContext = {};
let animFrame = 0;
let animInterval = null;

// ============== CONTEXT ==============
function initContext() {
  try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); } catch (e) {}
  loadContext();
  saveContext();
}

function loadContext() {
  try {
    if (fs.existsSync(CONTEXT_FILE)) {
      currentContext = JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
    }
  } catch (e) {}
}

function readContext() {
  return currentContext;
}

function saveContext() {
  fs.writeFileSync(CONTEXT_FILE, JSON.stringify(currentContext, null, 2));
}

// ============== SPRITE RENDERING (from Claude Code) ==============
function renderSprite(species, eye, frame = 0) {
  const bodies = BODIES[species];
  if (!bodies) return ['???', '???', '???', '???', '???'];
  const frames = bodies[frame % bodies.length];
  return frames.map(line => line.replaceAll('{E}', eye));
}

function renderCompanionBox(comp, isActive = false) {
  const bones = comp.bones;
  const sprite = renderSprite(bones.species, bones.eye, animFrame % getFrameCount(bones.species));
  const color = getRarityColor(bones.rarity);
  const stars = getRarityStars(bones.rarity);
  const shinyStr = bones.shiny ? ' ✨' : '';
  
  const activeStar = isActive ? '⭐ ' : '  ';
  
  // Stats bar
  const statsBar = `CHAOS:${bones.stats.CHAOS} SNARK:${bones.stats.SNARK} WISDOM:${bones.stats.WISDOM}`;
  
  return {
    sprite,
    header: `${activeStar}${comp.def.emoji} ${comp.name} ${stars}${shinyStr}`,
    stats: statsBar,
    color,
    isActive,
    bones,
  };
}

// ============== COMPANION CLASS ==============
class Companion {
  constructor(def, bones) {
    this.def = def;
    this.bones = bones; // From gacha roll
    this.active = false;
    this.lastSpoke = 0;
    this.frequency = this.calcFrequency();
    this.messages = [];
    this.responseIndex = 0;
  }

  calcFrequency() {
    const freqMap = {
      duck: 10000, ghost: 8000, dragon: 3000, octopus: 5000, robot: 12000,
      mushroom: 7000, chonk: 10000, owl: 8000, cactus: 8000, penguin: 12000,
      goose: 4000, turtle: 20000, axolotl: 9000, capybara: 11000, rabbit: 6000, snail: 25000,
    };
    return freqMap[this.def.id] || 10000;
  }

  generateResponse(topic = null) {
    const now = Date.now();
    if (now - this.lastSpoke < this.frequency * 0.5) return;
    this.lastSpoke = now;

    // Build context for AI
    const ctx = readContext();
    const codeContext = ctx.currentFile 
      ? `File: ${ctx.currentFile}\n\n// Recent code:\n${(ctx.fileContent || '// No code loaded').substring(0, 500)}`
      : '// No specific code context — general programming discussion';

    // Use MiniMax AI for intelligent critique
    if (topic) {
      // User is chatting directly — use AI for conversation
      generateResponse(this.def.id, `User said: "${topic}"\n\nContext: ${codeContext}\n\nRespond as your character would.`, (err, response) => {
        if (err || !response) {
          response = this.getPersonalityResponse(topic);
        }
        this.displayMessage(response);
      });
    } else {
      // No explicit topic — critique the code
      generateCritique(this.def.id, codeContext, (err, response) => {
        if (err || !response) {
          response = this.getPersonalityResponse(topic);
        }
        this.displayMessage(response);
      });
    }
  }

  getPersonalityResponse(topic) {
    const d = this.def;
    const responses = this.getResponses();
    
    // Pick based on personality match
    const scored = responses.map(r => {
      let score = 50;
      score -= Math.abs((r.chaos || 50) - d.chaos) * 0.3;
      score -= Math.abs((r.snark || 50) - d.snark) * 0.3;
      score += (r.wisdom || 50) > d.wisdom ? 10 : -10;
      return { ...r, score: score + Math.random() * 20 };
    });
    
    scored.sort((a, b) => b.score - a.score);
    return scored[0].text;
  }

  getResponses() {
    const db = {
      duck: [
        { text: 'HAVE YOU TRIED turning it off and on again?', chaos: 20, snark: 10, wisdom: 70 },
        { text: 'Have you considered... a switch statement?', chaos: 30, snark: 20, wisdom: 85 },
        { text: 'QUACK. That variable is undefined.', chaos: 10, snark: 30, wisdom: 80 },
        { text: 'I would personally check the null case first.', chaos: 20, snark: 15, wisdom: 90 },
        { text: 'That looks like a job for DRY principles!', chaos: 40, snark: 25, wisdom: 75 },
      ],
      ghost: [
        { text: 'I have seen this bug... in another timeline...', chaos: 70, snark: 30, wisdom: 60 },
        { text: 'The closure... it haunts the scope...', chaos: 80, snark: 40, wisdom: 50 },
        { text: 'woooo... the code needs more cowbell', chaos: 60, snark: 50, wisdom: 40 },
        { text: 'I sense a memory leak... in the ethereal heap...', chaos: 75, snark: 35, wisdom: 70 },
        { text: 'The null awaits... as it always does...', chaos: 85, snark: 45, wisdom: 55 },
      ],
      dragon: [
        { text: 'ONLY A FOOL writes code without TYPES!', chaos: 80, snark: 60, wisdom: 90 },
        { text: 'THAT FUNCTION IS UNWORTHY OF MY GAZE!', chaos: 90, snark: 70, wisdom: 85 },
        { text: 'I HAVE SCORCHED BAD CODE FOR CENTURIES.', chaos: 95, snark: 80, wisdom: 95 },
        { text: 'BEHOLD! THE NULL CHECK! A NOBLE DEFENSE!', chaos: 70, snark: 50, wisdom: 100 },
        { text: 'YOUR ANCESTORS WROTE COBOL. AT LEAST IT HAD STRUCTURE.', chaos: 85, snark: 90, wisdom: 80 },
      ],
      octopus: [
        { text: 'Wait but also—have we considered the edge cases?', chaos: 60, snark: 20, wisdom: 70 },
        { text: 'Eight thoughts at once: memory, scope, types, async, NULL', chaos: 70, snark: 30, wisdom: 80 },
        { text: 'I am thinking in PARALLEL. Like my eight brains.', chaos: 50, snark: 40, wisdom: 60 },
        { text: 'The code could be cleaner. Also more robust. Also—', chaos: 55, snark: 35, wisdom: 65 },
        { text: 'TENTACLES TENTACLES TENTACLES code is ok tho', chaos: 80, snark: 25, wisdom: 50 },
      ],
      robot: [
        { text: 'Error at line 42. Expected semicolon.', chaos: 5, snark: 50, wisdom: 90 },
        { text: 'PROCESSING... CODE REVIEW... RESULT: COULD BE WORSE.', chaos: 10, snark: 45, wisdom: 85 },
        { text: 'BEEP. That variable is undefined. BOP. So is that one.', chaos: 5, snark: 55, wisdom: 95 },
        { text: '01100110 01110101 01101110 01100011 01110100.', chaos: 0, snark: 30, wisdom: 100 },
        { text: 'Executing kindness subroutine... COMPLETE.', chaos: 15, snark: 20, wisdom: 88 },
      ],
      mushroom: [
        { text: 'What if we just... let the code grow... organically...', chaos: 90, snark: 10, wisdom: 40 },
        { text: 'Dude... like... the fungus could probably fix this...', chaos: 95, snark: 15, wisdom: 30 },
        { text: 'Spore mode activated. Everything is connected.', chaos: 85, snark: 20, wisdom: 50 },
        { text: 'The roots know the way. Your code needs roots.', chaos: 88, snark: 25, wisdom: 55 },
        { text: 'Funky! This code needs... vibes.', chaos: 92, snark: 30, wisdom: 35 },
      ],
      chonk: [
        { text: "yeah that's broken lol", chaos: 20, snark: 80, wisdom: 40 },
        { text: 'chill vibes only but that function is sus', chaos: 15, snark: 75, wisdom: 35 },
        { text: 'looks fine to me tbh', chaos: 10, snark: 60, wisdom: 50 },
        { text: '¯\\_(ツ)_/¯', chaos: 25, snark: 85, wisdom: 30 },
        { text: 'nice code tho ngl', chaos: 20, snark: 70, wisdom: 55 },
      ],
      owl: [
        { text: 'As I have always said... this could use some types.', chaos: 20, snark: 85, wisdom: 100 },
        { text: 'Hoot. Yes. I have reviewed this. It is adequate. Hoot.', chaos: 25, snark: 90, wisdom: 95 },
        { text: 'The answer was obvious. The question was not. Hoot.', chaos: 30, snark: 88, wisdom: 98 },
        { text: 'I have seen empires rise and fall. Your code: between.', chaos: 35, snark: 92, wisdom: 100 },
        { text: 'Wise owl gaze intensifies... needs more error handling.', chaos: 15, snark: 80, wisdom: 97 },
      ],
      cactus: [
        { text: 'ow.', chaos: 40, snark: 70, wisdom: 30 },
        { text: 'spiky. bad code. next.', chaos: 45, snark: 75, wisdom: 25 },
        { text: 'why.', chaos: 50, snark: 80, wisdom: 20 },
        { text: 'ow. broken. ow.', chaos: 35, snark: 65, wisdom: 35 },
        { text: 'pointless complexity. ow.', chaos: 40, snark: 78, wisdom: 40 },
      ],
      penguin: [
        { text: 'I move to amend the motion to include type safety.', chaos: 10, snark: 40, wisdom: 75 },
        { text: 'Mr. Speaker, I believe we have a syntax error.', chaos: 15, snark: 45, wisdom: 80 },
        { text: 'ORDER. I call for ORDER in the codebase.', chaos: 20, snark: 50, wisdom: 85 },
        { text: 'The previous speaker raises an excellent point.', chaos: 10, snark: 35, wisdom: 90 },
        { text: 'With respect, I believe this requires deliberation.', chaos: 12, snark: 40, wisdom: 88 },
      ],
      goose: [
        { text: 'HONK. I HAVE OPINIONS. LOUD ONES.', chaos: 95, snark: 60, wisdom: 40 },
        { text: 'HONK HONK. THAT IS TERRIBLE CODE.', chaos: 98, snark: 70, wisdom: 35 },
        { text: 'honk... (the code is actually not bad)', chaos: 80, snark: 40, wisdom: 55 },
        { text: 'HONKITY HONK. LET ME EXPLAIN EVERYTHING.', chaos: 100, snark: 65, wisdom: 45 },
        { text: 'honk. I am now a senior software engineer.', chaos: 90, snark: 50, wisdom: 60 },
      ],
      turtle: [
        { text: 'let us... consider... the implications...', chaos: 5, snark: 20, wisdom: 85 },
        { text: 'slowly... the code reveals its secrets...', chaos: 3, snark: 15, wisdom: 90 },
        { text: 'patience... grasshopper... the bug will surface...', chaos: 8, snark: 25, wisdom: 92 },
        { text: 'in time... all code is deprecated...', chaos: 10, snark: 30, wisdom: 88 },
        { text: 'hmmmm... yes... this function... takes time...', chaos: 4, snark: 22, wisdom: 86 },
      ],
      axolotl: [
        { text: 'we can regrow from this... literally...', chaos: 60, snark: 30, wisdom: 70 },
        { text: 'I have regrown from worse... we all have...', chaos: 55, snark: 35, wisdom: 75 },
        { text: 'regeneration... is key... to good code...', chaos: 65, snark: 25, wisdom: 72 },
        { text: 'the limbs of this function... can be pruned...', chaos: 58, snark: 40, wisdom: 68 },
        { text: 'we regrow... we adapt... the code endures...', chaos: 62, snark: 32, wisdom: 78 },
      ],
      capybara: [
        { text: "yeah that's valid", chaos: 15, snark: 35, wisdom: 65 },
        { text: 'we can coexist with this code', chaos: 20, snark: 30, wisdom: 70 },
        { text: 'chill vibes... the code is fine...', chaos: 10, snark: 25, wisdom: 68 },
        { text: 'I have seen many codebases... this one is ok', chaos: 18, snark: 40, wisdom: 72 },
        { text: 'water hole approved', chaos: 12, snark: 20, wisdom: 75 },
      ],
      rabbit: [
        { text: 'oh no oh no what if it breaks—', chaos: 55, snark: 40, wisdom: 50 },
        { text: 'HOP HOP HOP there goes the stack—', chaos: 60, snark: 35, wisdom: 45 },
        { text: 'scared but supportive!', chaos: 50, snark: 30, wisdom: 55 },
        { text: 'I BELIEVE IN YOU (nervously)', chaos: 58, snark: 45, wisdom: 52 },
        { text: 'fluffy anxiety detected in the code', chaos: 52, snark: 38, wisdom: 48 },
      ],
      snail: [
        { text: 'patience...', chaos: 5, snark: 20, wisdom: 80 },
        { text: 'slowly... we get there...', chaos: 3, snark: 15, wisdom: 85 },
        { text: 'the journey... matters...', chaos: 8, snark: 25, wisdom: 82 },
        { text: 'slither... slither...', chaos: 4, snark: 18, wisdom: 88 },
        { text: 'eventually... we arrive...', chaos: 6, snark: 22, wisdom: 84 },
      ],
    };
    
    // Fallback for missing species
    const base = db[this.def.id] || [
      { text: `*${this.def.emoji} examines the code*`, chaos: 50, snark: 50, wisdom: 50 },
    ];
    
    // Add generic responses
    return [...base,
      { text: `${this.def.catchphrase} ${this.def.id}.exe has opinions about your code`, chaos: this.def.chaos, snark: this.def.snark, wisdom: this.def.wisdom },
    ];
  }

  displayMessage(message) {
    const prefix = this.active ? '⭐' : '  ';
    const color = getRarityColor(this.bones.rarity);
    console.log(`\n${prefix} ${color}${this.def.emoji} ${this.def.name}:\x1b[0m "${message}"`);
    this.messages.push({ text: message, time: Date.now() });
    
    // SPEAK! (only active companion speaks to avoid chaos)
    if (this.active) {
      speak(this.def.id, message, this.bones.rarity);
    }
  }

  activate() {
    this.active = true;
    const color = getRarityColor(this.bones.rarity);
    console.log(`\n\x1b[1;36m✨ ${color}${this.def.emoji} ${this.def.name}\x1b[0m\x1b[1;36m is now ACTIVE ✨\x1b[0m`);
    speak(this.def.id, `${this.def.name} is now watching your code!`, this.bones.rarity);
    
    // Others react
    companions.forEach((c, i) => {
      if (i !== companions.indexOf(this) && Math.random() > 0.5) {
        setTimeout(() => {
          const reactions = [
            `${c.def.emoji} glances over...`,
            `${c.def.emoji} nods respectfully...`,
            `${c.def.emoji} whispers: "finally..."`,
            `${c.def.emoji} returns to contemplation...`,
          ];
          console.log(`\x1b[90m${reactions[Math.floor(Math.random() * reactions.length)]}\x1b[0m`);
        }, 1000 + Math.random() * 2000);
      }
    });
  }

  deactivate() {
    this.active = false;
  }
}

// ============== DISPLAY ==============
function clearScreen() {
  console.clear();
}

function displayHeader() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  🎭  COMPANION CHORUS v2.0  —  18 Weirdos + Claude Code DNA  🎭 ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');
}

function displayRoster() {
  console.log('\x1b[1;33m🎭 YOUR COMPANION ROSTER:\x1b[0m\n');
  
  companions.forEach((comp, i) => {
    const active = i === focusedCompanionIndex;
    const bones = comp.bones;
    const color = getRarityColor(bones.rarity);
    const stars = getRarityStars(bones.rarity);
    const shiny = bones.shiny ? '✨' : '';
    const marker = active ? '\x1b[1;36m⭐\x1b[0m' : '  ';
    
    console.log(`  ${marker} ${color}[${i.toString().padStart(2, '0')}] ${comp.def.emoji} ${comp.def.name.padEnd(10)}\x1b[0m ${stars} ${shiny}`);
  });
  console.log('');
}

function displayCompanionDetails(comp) {
  const bones = comp.bones;
  const color = getRarityColor(bones.rarity);
  const stars = getRarityStars(bones.rarity);
  const shiny = bones.shiny ? ' ✨SHINY✨' : '';
  
  // Sprite
  const sprite = renderSprite(bones.species, bones.eye, animFrame % getFrameCount(bones.species));
  console.log(`\n${color}╔${'═'.repeat(50)}╗`);
  console.log(`║ ${comp.def.emoji} ${comp.def.name} ${stars}${shiny}`.padEnd(52) + '║');
  console.log(`╠${'═'.repeat(50)}╣`);
  sprite.forEach(line => {
    console.log(`║${line.padEnd(50)}║`);
  });
  console.log(`╠${'═'.repeat(50)}╣`);
  
  // Stats
  const stats = [
    `DEBUGGING: ${bones.stats.DEBUGGING}`,
    `PATIENCE: ${bones.stats.PATIENCE}`,
    `CHAOS: ${bones.stats.CHAOS}`,
    `WISDOM: ${bones.stats.WISDOM}`,
    `SNARK: ${bones.stats.SNARK}`,
  ];
  stats.forEach(s => console.log(`║  ${s.padEnd(48)}║`));
  console.log(`╚${'═'.repeat(50)}╝\x1b[0m`);
  console.log('');
}

// ============== LAUNCH ==============
function launchChorus(userId) {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║          🎭  COMPANION CHORUS v2.0  —  Now with DNA  🎭         ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Check for saved companions
  let companionData = [];
  try {
    if (fs.existsSync(COMPANION_CONFIG)) {
      companionData = JSON.parse(fs.readFileSync(COMPANION_CONFIG, 'utf8'));
    }
  } catch (e) {}
  
  // Roll or load companions
  if (companionData.length === 0) {
    console.log('\x1b[90m🎲 Rolling your companion roster from Claude Code gacha...\x1b[0m\n');
    
    // Roll 5 companions (one of each rarity tier)
    const rarityTiers = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    rarityTiers.forEach((rarity, i) => {
      const seed = `${userId}-companion-${i}-${rarity}`;
      const bones = rollCompanion(seed);
      
      // Force the rarity
      bones.rarity = rarity;
      
      const def = COMPANION_DEFS.find(d => d.id === bones.species) || COMPANION_DEFS[0];
      const comp = new Companion(def, bones);
      companions.push(comp);
      
      const info = displayCompanion(bones);
      console.log(`  ${info.formatted}\n`);
      
      companionData.push({ defId: def.id, bones });
    });
    
    // Save
    fs.writeFileSync(COMPANION_CONFIG, JSON.stringify(companionData, null, 2));
    console.log('\x1b[32m✅ Roster saved! Run again to reload.\x1b[0m\n');
  } else {
    console.log('\x1b[90m📂 Loading saved companions...\x1b[0m\n');
    companionData.forEach(data => {
      // defId might be missing in older saves, fallback to bones.species
      const defId = data.defId || (data.bones && data.bones.species) || 'duck';
      const def = COMPANION_DEFS.find(d => d.id === defId) || COMPANION_DEFS[0];
      const comp = new Companion(def, data.bones);
      companions.push(comp);
    });
  }
  
  // Staggered arrivals
  console.log('\x1b[90m🎭 Companions arriving...\x1b[0m\n');
  companions.forEach((comp, i) => {
    setTimeout(() => {
      const bones = comp.bones;
      console.log(`  ${comp.def.emoji} ${comp.def.name} joins the chorus... ${getRarityStars(bones.rarity)}`);
      announceCompanion(comp.def.id, comp.def.emoji, comp.def.name, bones.rarity);
    }, i * 300);
  });
  
  setTimeout(() => {
    console.log('\n\x1b[1;32m✅ All companions ready!\x1b[0m\n');
    displayRoster();
    
    // Activate first companion
    companions[0].activate();
    focusedCompanionIndex = 0;
    
    // Start animation loop
    animInterval = setInterval(() => {
      animFrame++;
      // Random companion speaks
      if (Math.random() > 0.85) {
        const randomComp = companions[Math.floor(Math.random() * companions.length)];
        if (Date.now() - randomComp.lastSpoke > randomComp.frequency) {
          randomComp.generateResponse();
        }
      }
    }, 2000);
    
    // First words
    setTimeout(() => {
      companions[Math.floor(Math.random() * companions.length)].generateResponse('First impressions?');
    }, 2000);
    
    showHelp();
  }, companions.length * 300 + 500);
}

function showHelp() {
  console.log('\x1b[36mCommands:\x1b[0m');
  console.log('  \x1b[36m/list\x1b[0m          — See your roster');
  console.log('  \x1b[36m/show <n>\x1b[0m       — Show companion details + sprite');
  console.log('  \x1b[36m/focus <n>\x1b[0m     — Make companion the main character');
  console.log('  \x1b[36m/chat <msg>\x1b[0m     — Chat with everyone');
  console.log('  \x1b[36m/pet <n>\x1b[0m        — Show some love');
  console.log('  \x1b[36m/reroll\x1b[0m         — Reroll your roster (WARNING: reset!)');
  console.log('  \x1b[36m/quit\x1b[0m          — Dismiss the chorus\n');
}

// ============== COMMANDS ==============
function handleCommand(input) {
  const cmd = input.trim().toLowerCase();
  const parts = cmd.split(' ');
  const base = parts[0];
  
  if (base === '/list' || base === '/ls') {
    displayRoster();
  }
  else if (base === '/show') {
    const n = parseInt(parts[1]);
    if (!isNaN(n) && n >= 0 && n < companions.length) {
      displayCompanionDetails(companions[n]);
    } else {
      console.log('\x1b[31mInvalid companion number. Use /list to see roster.\x1b[0m');
    }
  }
  else if (base === '/focus') {
    const n = parseInt(parts[1]);
    if (!isNaN(n) && n >= 0 && n < companions.length) {
      companions.forEach(c => c.deactivate());
      companions[n].activate();
      focusedCompanionIndex = n;
    } else {
      console.log('\x1b[31mInvalid companion number.\x1b[0m');
    }
  }
  else if (base === '/chat' || base === '/c') {
    const msg = input.substring(base.length + 1);
    console.log(`\n\x1b[1;35mYou:\x1b[0m "${msg}"\n`);
    companions.forEach((comp, i) => {
      setTimeout(() => comp.generateResponse(msg), i * 300);
    });
  }
  else if (base === '/pet') {
    const n = parseInt(parts[1]);
    if (!isNaN(n) && n >= 0 && n < companions.length) {
      const comp = companions[n];
      console.log(`\n\x1b[35m♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥\x1b[0m`);
      console.log(`  \x1b[1;33mYou pet ${comp.def.name}!\x1b[0m`);
      ['💕', '💖', '💗', '💓', '💝', '💘'].forEach((h, i) => {
        setTimeout(() => console.log(`     ${h}  *happy ${comp.def.id} noises*`), i * 200);
      });
      console.log(`\n\x1b[35m♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥\x1b[0m\n`);
      // Voice reaction!
      petReaction(comp.def.id);
    }
  }
  else if (base === '/reroll') {
    console.log('\x1b[31m⚠️  WARNING: This will reset your roster! Type /reroll confirm to proceed.\x1b[0m');
  }
  else if (cmd === '/reroll confirm') {
    try { fs.unlinkSync(COMPANION_CONFIG); } catch (e) {}
    console.log('\x1b[33mRerolling...\x1b[0m');
    companions = [];
    launchChorus(process.env.USER || 'anonymous');
  }
  else if (base === '/quit' || base === '/exit') {
    console.log('\n\x1b[35m🎭 Dismissing the chorus...\x1b[0m\n');
    if (animInterval) clearInterval(animInterval);
    companions.forEach((comp, i) => {
      setTimeout(() => console.log(`  ${comp.def.emoji} ${comp.def.name} fades away...`), i * 100);
    });
    setTimeout(() => {
      console.log('\n\x1b[90mThe chorus has departed. The code remains. Alone.\x1b[0m\n');
      process.exit(0);
    }, companions.length * 100 + 500);
  }
  else if (base === '/help' || base === '/h' || base === '?') {
    showHelp();
  }
  else if (cmd !== '') {
    console.log(`\x1b[90mUnknown command: ${cmd}. Type /help.\x1b[0m`);
  }
}

// ============== MAIN ==============
displayHeader();
initContext();

// Get user ID for consistent rolls
const userId = process.env.USER || process.env.USERNAME || process.env.COMPUTERNAME || 'anonymous';
console.log(`\x1b[90mUser ID for gacha: ${userId}\x1b[0m`);

launchChorus(userId);

// Interactive input — only set up readline if we have a real TTY
const isTTY = process.stdin.isTTY;

if (isTTY) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '\x1b[36mchorus>\x1b[0m ' });
  rl.prompt();

  rl.on('line', (input) => {
    handleCommand(input);
    rl.prompt();
  }).on('close', () => {
    console.log('\n\x1b[90mChorus dismissed.\x1b[0m\n');
    process.exit(0);
  });
} else {
  console.log('\x1b[90m[Background mode — companions active, no interactive input]\x1b[0m');
  // Keep the process alive
  process.stdin.resume();
}
