'use strict';

/**
 * Mochi sprite library — pure JS port of buddy_TAMAGOTCHI sprites.
 * 18 species, 3 idle-fidget frames each, eye-expression substitution, hat slot.
 *
 *   const { renderSprite, renderFace, SPECIES, EYES, HATS } = require('./mochi-sprites');
 *   const lines = renderSprite({ species: 'axolotl', eye: '·', hat: 'none' }, frame=0);
 *   // lines = ['            ', '}~(______)~{', ...]
 */

const EYES    = ['·', '✦', '×', '◉', '@', '°'];
const HATS    = ['none', 'crown', 'tophat', 'propeller', 'halo', 'wizard', 'beanie', 'tinyduck'];
const SPECIES = ['duck','goose','blob','cat','dragon','octopus','owl','penguin','turtle','snail','ghost','axolotl','capybara','cactus','robot','rabbit','mushroom','chonk'];

const HAT_LINES = {
  none      : '',
  crown     : '   \\^^^/    ',
  tophat    : '   [___]    ',
  propeller : '    -+-     ',
  halo      : '   (   )    ',
  wizard    : '    /^\\     ',
  beanie    : '   (___)    ',
  tinyduck  : '    ,>      ',
};

const BODIES = {
  duck: [
    ['            ', '    __      ', '  <({E} )___  ', '   (  ._>   ', '    `--´    '],
    ['            ', '    __      ', '  <({E} )___  ', '   (  ._>   ', '    `--´~   '],
    ['            ', '    __      ', '  <({E} )___  ', '   (  .__>  ', '    `--´    '],
  ],
  goose: [
    ['            ', '     ({E}>    ', '     ||     ', '   _(__)_   ', '    ^^^^    '],
    ['            ', '    ({E}>     ', '     ||     ', '   _(__)_   ', '    ^^^^    '],
    ['            ', '     ({E}>>   ', '     ||     ', '   _(__)_   ', '    ^^^^    '],
  ],
  blob: [
    ['            ', '   .----.   ', '  ( {E}  {E} )  ', '  (      )  ', '   `----´   '],
    ['            ', '  .------.  ', ' (  {E}  {E}  ) ', ' (        ) ', '  `------´  '],
    ['            ', '    .--.    ', '   ({E}  {E})   ', '   (    )   ', '    `--´    '],
  ],
  cat: [
    ['            ', '   /\\_/\\    ', '  ( {E}   {E})  ', '  (  ω  )   ', '  (")_(")   '],
    ['            ', '   /\\_/\\    ', '  ( {E}   {E})  ', '  (  ω  )   ', '  (")_(")~  '],
    ['            ', '   /\\-/\\    ', '  ( {E}   {E})  ', '  (  ω  )   ', '  (")_(")   '],
  ],
  dragon: [
    ['            ', '  /^\\  /^\\  ', ' <  {E}  {E}  > ', ' (   ~~   ) ', '  `-vvvv-´  '],
    ['            ', '  /^\\  /^\\  ', ' <  {E}  {E}  > ', ' (        ) ', '  `-vvvv-´  '],
    ['   ~    ~   ', '  /^\\  /^\\  ', ' <  {E}  {E}  > ', ' (   ~~   ) ', '  `-vvvv-´  '],
  ],
  octopus: [
    ['            ', '   .----.   ', '  ( {E}  {E} )  ', '  (______)  ', '  /\\/\\/\\/\\  '],
    ['            ', '   .----.   ', '  ( {E}  {E} )  ', '  (______)  ', '  \\/\\/\\/\\/  '],
    ['     o      ', '   .----.   ', '  ( {E}  {E} )  ', '  (______)  ', '  /\\/\\/\\/\\  '],
  ],
  owl: [
    ['            ', '   /\\  /\\   ', '  (({E})({E}))  ', '  (  ><  )  ', '   `----´   '],
    ['            ', '   /\\  /\\   ', '  (({E})({E}))  ', '  (  ><  )  ', '   .----.   '],
    ['            ', '   /\\  /\\   ', '  (({E})(-))  ', '  (  ><  )  ', '   `----´   '],
  ],
  penguin: [
    ['            ', '  .---.     ', '  ({E}>{E})     ', ' /(   )\\    ', '  `---´     '],
    ['            ', '  .---.     ', '  ({E}>{E})     ', ' |(   )|    ', '  `---´     '],
    ['  .---.     ', '  ({E}>{E})     ', ' /(   )\\    ', '  `---´     ', '   ~ ~      '],
  ],
  turtle: [
    ['            ', '   _,--._   ', '  ( {E}  {E} )  ', ' /[______]\\ ', '  ``    ``  '],
    ['            ', '   _,--._   ', '  ( {E}  {E} )  ', ' /[______]\\ ', '   ``  ``   '],
    ['            ', '   _,--._   ', '  ( {E}  {E} )  ', ' /[======]\\ ', '  ``    ``  '],
  ],
  snail: [
    ['            ', ' {E}    .--.  ', '  \\  ( @ )  ', '   \\_`--´   ', '  ~~~~~~~   '],
    ['            ', '  {E}   .--.  ', '  |  ( @ )  ', '   \\_`--´   ', '  ~~~~~~~   '],
    ['            ', ' {E}    .--.  ', '  \\  ( @  ) ', '   \\_`--´   ', '   ~~~~~~   '],
  ],
  ghost: [
    ['            ', '   .----.   ', '  / {E}  {E} \\  ', '  |      |  ', '  ~`~``~`~  '],
    ['            ', '   .----.   ', '  / {E}  {E} \\  ', '  |      |  ', '  `~`~~`~`  '],
    ['    ~  ~    ', '   .----.   ', '  / {E}  {E} \\  ', '  |      |  ', '  ~~`~~`~~  '],
  ],
  axolotl: [
    ['            ', '}~(______)~{', '}~({E} .. {E})~{', '  ( .--. )  ', '  (_/  \\_)  '],
    ['            ', '~}(______){~', '~}({E} .. {E}){~', '  ( .--. )  ', '  (_/  \\_)  '],
    ['            ', '}~(______)~{', '}~({E} .. {E})~{', '  (  --  )  ', '  ~_/  \\_~  '],
  ],
  capybara: [
    ['            ', '  n______n  ', ' ( {E}    {E} ) ', ' (   oo   ) ', '  `------´  '],
    ['            ', '  n______n  ', ' ( {E}    {E} ) ', ' (   Oo   ) ', '  `------´  '],
    ['    ~  ~    ', '  u______n  ', ' ( {E}    {E} ) ', ' (   oo   ) ', '  `------´  '],
  ],
  cactus: [
    ['            ', ' n  ____  n ', ' | |{E}  {E}| | ', ' |_|    |_| ', '   |    |   '],
    ['            ', '    ____    ', ' n |{E}  {E}| n ', ' |_|    |_| ', '   |    |   '],
    [' n        n ', ' |  ____  | ', ' | |{E}  {E}| | ', ' |_|    |_| ', '   |    |   '],
  ],
  robot: [
    ['            ', '   .[||].   ', '  [ {E}  {E} ]  ', '  [ ==== ]  ', '  `------´  '],
    ['            ', '   .[||].   ', '  [ {E}  {E} ]  ', '  [ -==- ]  ', '  `------´  '],
    ['     *      ', '   .[||].   ', '  [ {E}  {E} ]  ', '  [ ==== ]  ', '  `------´  '],
  ],
  rabbit: [
    ['            ', '   (\\__/)   ', '  ( {E}  {E} )  ', ' =(  ..  )= ', '  (")__(")  '],
    ['            ', '   (|__/)   ', '  ( {E}  {E} )  ', ' =(  ..  )= ', '  (")__(")  '],
    ['            ', '   (\\__/)   ', '  ( {E}  {E} )  ', ' =( .  . )= ', '  (")__(")  '],
  ],
  mushroom: [
    ['            ', ' .-o-OO-o-. ', '(__________)', '   |{E}  {E}|   ', '   |____|   '],
    ['            ', ' .-O-oo-O-. ', '(__________)', '   |{E}  {E}|   ', '   |____|   '],
    ['   . o  .   ', ' .-o-OO-o-. ', '(__________)', '   |{E}  {E}|   ', '   |____|   '],
  ],
  chonk: [
    ['            ', '  /\\    /\\  ', ' ( {E}    {E} ) ', ' (   ..   ) ', '  `------´  '],
    ['            ', '  /\\    /|  ', ' ( {E}    {E} ) ', ' (   ..   ) ', '  `------´  '],
    ['            ', '  /\\    /\\  ', ' ( {E}    {E} ) ', ' (   ..   ) ', '  `------´~ '],
  ],
};

const FACES = {
  duck    : eye => `(${eye}>`,
  goose   : eye => `(${eye}>`,
  blob    : eye => `(${eye}${eye})`,
  cat     : eye => `=${eye}ω${eye}=`,
  dragon  : eye => `<${eye}~${eye}>`,
  octopus : eye => `~(${eye}${eye})~`,
  owl     : eye => `(${eye})(${eye})`,
  penguin : eye => `(${eye}>)`,
  turtle  : eye => `[${eye}_${eye}]`,
  snail   : eye => `${eye}(@)`,
  ghost   : eye => `/${eye}${eye}\\`,
  axolotl : eye => `}${eye}.${eye}{`,
  capybara: eye => `(${eye}oo${eye})`,
  cactus  : eye => `|${eye}  ${eye}|`,
  robot   : eye => `[${eye}${eye}]`,
  rabbit  : eye => `(${eye}..${eye})`,
  mushroom: eye => `|${eye}  ${eye}|`,
  chonk   : eye => `(${eye}.${eye})`,
};

// Stable hash → companion bones (so a given userId always gets the same companion)
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h = (h ^ str.charCodeAt(i)) * 16777619;
    h |= 0;
  }
  return Math.abs(h);
}

function rarityFromHash(h) {
  const r = h % 1000;
  if (r < 5)   return 'legendary';
  if (r < 30)  return 'epic';
  if (r < 130) return 'rare';
  if (r < 380) return 'uncommon';
  return 'common';
}

function bonesFromSeed(seed) {
  const h = hash(seed);
  return {
    species: SPECIES[h % SPECIES.length],
    eye    : EYES[(h >> 4) % EYES.length],
    hat    : HATS[(h >> 8) % HATS.length],
    rarity : rarityFromHash(h),
    shiny  : ((h >> 12) & 0xff) === 0,
  };
}

function renderSprite(bones, frame = 0) {
  const frames = BODIES[bones.species] || BODIES.blob;
  const body = frames[frame % frames.length].map(line => line.replaceAll('{E}', bones.eye));
  const lines = [...body];
  // Replace hat slot if line 0 is blank and we have a hat
  if (bones.hat && bones.hat !== 'none' && !lines[0].trim()) {
    lines[0] = HAT_LINES[bones.hat] || lines[0];
  }
  // Trim leading blank line if no frame uses it
  if (!lines[0].trim() && frames.every(f => !f[0].trim())) lines.shift();
  return lines;
}

function renderFace(bones) {
  const fn = FACES[bones.species];
  return fn ? fn(bones.eye) : `(${bones.eye}${bones.eye})`;
}

function frameCount(species) {
  return (BODIES[species] || BODIES.blob).length;
}

// ══════════════════════════════════════════════════════════════════════════════
// MOCHI FACE MULTIVERSE — The 46,080 Face Generator
// ══════════════════════════════════════════════════════════════════════════════
// Components:       10 eye bases × 8 eye modifiers × 12 mouths × 6 cheeks × 8 tops
// Total combos:     46,080
// Emotional presets: 40+ named states
// Usage:
//   const f = generateFace({ mood: 'enraged' });          // → '💢·ω·#'
//   const f = generateFace({ eyes:'🔥', mouth:'m' });     // → '🔥ωm'
//   const f = moodToFace('overwhelmed');                   // → '@ω@'
// ──────────────────────────────────────────────────────────────────────────────

const FACE_EYES = {
  calm      : '·',
  intense   : '◉',
  excited   : '>',
  surprised : '°',
  dead      : '×',
  overwhelmed: '@',
  inspired  : '★',
  deadInside: '💀',
  pleading  : '🥺',
  firedUp   : '🔥',
};

const FACE_EYE_MODS = {
  normal    : '',    // no modifier
  squint    : '_',
  neutral   : '-',
  sideEye   : '◔',
  spiral    : '⍜',
  wide      : '⚆',
  wider     : '⚈',
  blocked   : '⬛',
  hypno     : '🌀',
};

const FACE_MOUTHS = {
  default   : 'ω',
  smile     : 'v',
  happy     : '^',
  flat      : '_',
  wavy      : '~',
  surprised : 'o',
  shocked   : '0',
  pout      : 'u',
  cheeky    : '3',
  kissy     : 'ε',
  smug      : '∀',
  stressed  : 'm',
};

const FACE_CHEEKS = {
  none      : '',
  blush     : '*',
  sweat     : '+',
  angry     : '#',
  excited   : '!',
  confused  : '?',
  stress    : '~',
};

const FACE_TOPS = {
  none      : '',
  raisedBrow: "'",
  excitedBrow: '^',
  furrowed  : 'v',
  flat      : '-',
  sparkle   : '✧',
  lightning : '⚡',
  tear      : '💧',
  rage      : '💢',
};

// ── Emotional presets — the canonical named faces ─────────────────────────────
// Format: `{top}{leftEye}ω{rightEye}{cheek}` (mouth substituted for ω)
// These are the curated "feels" — used by agents & mochi for expression
const FACE_PRESETS = {
  // Core states
  calm        : '·ω·',
  happy       : '>ω<',
  sad         : '·ωu·',
  excited     : '^>ω<!',
  overwhelmed : '@ω@',
  dead        : '×ω×',
  inspired    : '★ω★',
  deadInside  : '💀ω💀',
  pleading    : '🥺ω🥺',
  firedUp     : '🔥ω🔥',
  // Eye modifiers
  squinting   : '_ω_',
  sideEye     : '◔ω◔',
  spiraling   : '⍜ω⍜',
  wide        : '⚆ω⚆',
  wider       : '⚈ω⚈',
  blocked     : '⬛ω⬛',
  hypnotized  : '🌀ω🌀',
  neutral     : '-ω-',
  // Mouth variations
  cheeky      : '·ω3·',
  kissy       : '·ωε·',
  smug        : '·ω∀·',
  stressed    : '·ωm·',
  shocked     : '°ω0°',
  pouty       : '·ωu·',
  wavy        : '·ω~·',
  // Cheek accents
  blushing    : '·ω·*',
  sweating    : '·ω·+',
  angry       : '·ω·#',
  confused    : '·ω·?',
  // Top accents
  crying      : '💧·ωu·',
  enraged     : '💢·ω·#',
  sparkling   : '✧·ω·',
  electric    : '⚡·ω·!',
  raging      : '💢◉ωm◉#',
  // Compound emotional states
  lovesick    : '💧🥺ω🥺*',
  maniacal    : '⚡◉ω∀◉!',
  existential : '⍜ω⍜',
  caffeinated : '⚆ω^⚆!',
  judgmental  : '◔ω∀◔',
  plotting    : '-ω3-',
  victorious  : '✧★ω^★',
  devastated  : '💧×ωu×',
  // Voice-reactive states (used when voice is active/speaking/listening)
  listening   : '°ωo°',
  speaking    : '◉ω~◉',
  processing  : '⍜ω⍜+',
  wakeword    : '⚡◉ω◉!',
  heard       : '✧>ω<',
  error_voice : '×ω×+',
  // Gary/Goose/system reactions
  garyMode    : '💢@ωm@#',
  gooseMode   : '>ω<!',
  honking     : '^>ω0<',
  packet_loss : '×ω×+',
  circuit_open: '⬛ωm⬛',
  throbbing   : '◉ω~◉*',  // taint mode
};

/**
 * generateFace(opts) → string
 * Build a face string from components or a mood preset.
 *
 * @param {Object} opts
 * @param {string}  [opts.mood]   — named preset key (see FACE_PRESETS)
 * @param {string}  [opts.eyes]   — eye character (overrides mood)
 * @param {string}  [opts.mouth]  — mouth character (overrides ω in preset)
 * @param {string}  [opts.cheek]  — cheek suffix
 * @param {string}  [opts.top]    — forehead prefix
 * @returns {string}
 */
function generateFace(opts = {}) {
  if (opts.mood && FACE_PRESETS[opts.mood]) {
    let face = FACE_PRESETS[opts.mood];
    if (opts.mouth) face = face.replace('ω', opts.mouth);
    if (opts.cheek) face = face + opts.cheek;
    if (opts.top)   face = opts.top + face;
    return face;
  }

  // Build from scratch
  const eye    = opts.eyes   || '·';
  const mouth  = opts.mouth  || 'ω';
  const cheek  = opts.cheek  || '';
  const top    = opts.top    || '';
  return `${top}${eye}${mouth}${eye}${cheek}`;
}

/**
 * moodToFace(mood, fallback?) → string
 * Returns the face string for a mood name, or a fallback.
 */
function moodToFace(mood, fallback = '·ω·') {
  if (!mood) return fallback;
  return FACE_PRESETS[mood.toLowerCase()] || FACE_PRESETS[mood] || fallback;
}

/**
 * randomFace() → string  (fully random — the chaos mode)
 */
function randomFace() {
  const pick = obj => { const keys = Object.values(obj); return keys[Math.floor(Math.random() * keys.length)]; };
  const top   = Math.random() < 0.3 ? pick(FACE_TOPS)   : '';
  const eye   = pick(FACE_EYES);
  const mouth = pick(FACE_MOUTHS);
  const cheek = Math.random() < 0.4 ? pick(FACE_CHEEKS) : '';
  return `${top}${eye}${mouth}${eye}${cheek}`;
}

/**
 * voiceFace(voiceState) → string
 * Returns the appropriate Mochi face based on current voice state.
 * @param {string} voiceState  — 'listening' | 'speaking' | 'processing' | 'idle' | 'error'
 */
function voiceFace(voiceState) {
  const map = {
    idle      : 'calm',
    listening : 'listening',
    speaking  : 'speaking',
    processing: 'processing',
    wakeword  : 'wakeword',
    heard     : 'heard',
    error     : 'error_voice',
  };
  return moodToFace(map[voiceState] || 'calm');
}

module.exports = {
  EYES, HATS, SPECIES,
  // Face multiverse
  FACE_PRESETS,
  FACE_EYES,
  FACE_EYE_MODS,
  FACE_MOUTHS,
  FACE_CHEEKS,
  FACE_TOPS,
  generateFace,
  moodToFace,
  randomFace,
  voiceFace,
  // Sprite
  bonesFromSeed,
  renderSprite,
  renderFace,
  frameCount,
};
