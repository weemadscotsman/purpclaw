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

module.exports = {
  EYES, HATS, SPECIES,
  bonesFromSeed,
  renderSprite,
  renderFace,
  frameCount,
};
