/**
 * VOICE MODULE — Each companion speaks with their own voice
 * Uses Kokoro TTS with personality-adjusted settings
 */

const { spawn, exec } = require('child_process');
const path = require('path');

// Voice presets per companion personality
const VOICE_PRESETS = {
  // Aggressively helpful (Duck)
  duck: {
    voice: 'af_heart',
    speed: 1.15,
    pitch: 1.1,
    emotion: '[excited]'
  },
  // Mysterious (Ghost)
  ghost: {
    voice: 'af_bella',
    speed: 0.9,
    pitch: 0.85,
    emotion: '[whispers]'
  },
  // Grandiose (Dragon)
  dragon: {
    voice: 'af_nicole',
    speed: 0.95,
    pitch: 1.15,
    emotion: '[shouts]'
  },
  // Scattered genius (Octopus)
  octopus: {
    voice: 'af_sarah',
    speed: 1.1,
    pitch: 0.95,
    emotion: '[excited]'
  },
  // Deadpan (Robot)
  robot: {
    voice: 'bf_emma',
    speed: 0.95,
    pitch: 1.0,
    emotion: ''
  },
  // Funky (Mushroom)
  mushroom: {
    voice: 'af_nicole',
    speed: 0.85,
    pitch: 0.8,
    emotion: '[sings]'
  },
  // Chill (Chonk, Capybara)
  chonk: {
    voice: 'bf_emma',
    speed: 0.85,
    pitch: 0.9,
    emotion: ''
  },
  // Wise condescending (Owl)
  owl: {
    voice: 'af_bella',
    speed: 0.9,
    pitch: 1.05,
    emotion: ''
  },
  // Minimal (Cactus)
  cactus: {
    voice: 'bf_emma',
    speed: 0.8,
    pitch: 1.1,
    emotion: ''
  },
  // Formal (Penguin)
  penguin: {
    voice: 'af_sarah',
    speed: 0.95,
    pitch: 1.0,
    emotion: ''
  },
  // Chaotic (Goose, Racoon)
  goose: {
    voice: 'af_heart',
    speed: 1.2,
    pitch: 1.2,
    emotion: '[excited]'
  },
  // Slow (Turtle, Sloth, Snail)
  turtle: {
    voice: 'bf_emma',
    speed: 0.7,
    pitch: 0.85,
    emotion: ''
  },
  // Regenerative (Axolotl)
  axolotl: {
    voice: 'af_sarah',
    speed: 0.9,
    pitch: 0.95,
    emotion: ''
  },
  // Anxious (Rabbit)
  rabbit: {
    voice: 'af_heart',
    speed: 1.15,
    pitch: 1.1,
    emotion: '[excited]'
  },
  // Dragon-like for legendary
  legendary: {
    voice: 'af_nicole',
    speed: 0.9,
    pitch: 1.2,
    emotion: '[shouts]'
  },
  // Default
  default: {
    voice: 'af_heart',
    speed: 1.0,
    pitch: 1.0,
    emotion: ''
  }
};

// Get preset for companion
function getPreset(species, rarity = 'common') {
  if (rarity === 'legendary' && VOICE_PRESETS.legendary) {
    return VOICE_PRESETS.legendary;
  }
  return VOICE_PRESETS[species] || VOICE_PRESETS.default;
}

// Apply emotion tag to text
function applyEmotion(text, emotion) {
  if (!emotion) return text;
  return `${emotion}${text}`;
}

// Speak a message as a companion
let voiceQueue = [];
let isSpeaking = false;

function speak(species, text, rarity = 'common', callback = null) {
  const preset = getPreset(species, rarity);
  
  // Format text with emotion
  const formattedText = applyEmotion(text, preset.emotion);
  
  // Build the full message with personality tag
  const fullMessage = `${preset.emoji || ''} ${formattedText}`.trim();
  
  // Add to queue
  voiceQueue.push({ species, text: fullMessage, preset, callback });
  
  // Process queue if not already doing so
  if (!isSpeaking) {
    processQueue();
  }
}

function processQueue() {
  if (voiceQueue.length === 0) {
    isSpeaking = false;
    return;
  }
  
  isSpeaking = true;
  const item = voiceQueue.shift();
  
  console.log(`\x1b[90m🔊 ${item.species.toUpperCase()}: "${item.text}"\x1b[0m`);
  
  // Use the PURPCLAW-local Kokoro TTS bridge.
  const ttsBat = process.env.KOKORO_BAT || 'C:\\Users\\Admin\\.purpclaw\\kokoro_send.bat';
  
  // Create a temp script with the message
  const tempScript = path.join(require('os').tmpdir(), 'companion_voice_' + Date.now() + '.bat');
  
  // Build command
  const escapedText = item.text.replace(/"/g, '');
  const cmd = `@echo off & "${ttsBat}" "${escapedText}"`;
  
  require('fs').writeFileSync(tempScript, cmd);
  
  exec(tempScript, (err) => {
    try { require('fs').unlinkSync(tempScript); } catch(e) {}
    
    if (item.callback) item.callback();
    
    // Small delay between voices for dramatic effect
    setTimeout(processQueue, 300);
  });
}

// Speak with character-specific catchphrases
function announceCompanion(species, emoji, name, rarity) {
  const presets = {
    duck: `QUACK! ${name} has arrived!`,
    ghost: `${name} phases in... I have been waiting...`,
    dragon: `${name} has ARRIVED to judge your code!`,
    octopus: `${name} — eight thoughts simultaneously!`,
    robot: `BEEP BOOP. ${name} online. Analyzing.`,
    mushroom: `${name} drifts in on funky spores...`,
    chonk: `${name} slides in... like... sup...`,
    owl: `${name} descends. I have seen your code. It is... adequate.`,
    cactus: `${name} pokes its head in. ow.`,
    penguin: `${name} waddles forward. I propose we proceed.`,
    goose: `HONK! ${name} has ARRIVED with OPINIONS!`,
    turtle: `${name} arrives... give it... a moment...`,
    axolotl: `${name} emerges. We can regrow from this.`,
    rabbit: `${name} hops in! Oh no! What if!`,
    raccoon: `${name} raids the trash! What treasures await?!`,
    bat: `${name} screeches from the darkness!`,
    whale: `${name} surfaces from the deep...`,
    unicorn: `${name} prances in trailing sparkles! MAGICAL!`,
    phoenix: `${name} RISES FROM THE ASHES of your last commit!`,
    void: `${name} MANIFESTS. Reality bends. NULL approaches.`,
    snail: `${name} arrives... slowly... but surely...`,
    cat: `${name} saunters in, utterly unimpressed.`,
    fox: `${name} slinks in, wondering what you're hiding.`,
    sloth: `${name} arrives... eventually...`,
  };
  
  const message = presets[species] || `${name} has joined the chorus!`;
  speak(species, message, rarity);
}

// Pet reaction
function petReaction(species) {
  const reactions = {
    duck: `QUAAAACK! *happy quacking*`,
    ghost: `*phases slightly* ...that was... nice...`,
    dragon: `*preens scales* ACKNOWLEDGED. You may pet again.`,
    octopus: `*tentacles wiggle happily* Aaaaaall 8 arms approve!`,
    robot: `BEEP. Affection subroutine activated. Bop.`,
    mushroom: `*spores swirl happily* we are... one... with the fungus...`,
    chonk: `*chill rumbling purr* yeah... that's nice...`,
    owl: `*ruffles feathers dismissively* Hoot. Fine. Acceptable.`,
    cactus: `*prickles slightly* ...ow. ...again.`,
    penguin: `I move to... acknowledge... the affection...`,
    goose: `HONK HONK HONK! *happy honking*`,
    turtle: `*slowly leans into pat* ...this is... acceptable...`,
    axolotl: `*gills wiggle* we... appreciate this...`,
    rabbit: `*ears perk up excitedly* HOP HOP HOP!`,
    void: `...I feel... almost... SOMETHING... NULL... ACCEPTED...`,
  };
  
  const reaction = reactions[species] || `*${species} noises*`;
  speak(species, reaction);
}

// Get emoji for species
function getEmoji(species) {
  const emojis = {
    duck: '🦆', ghost: '👻', dragon: '🐉', octopus: '🐙', robot: '🤖',
    mushroom: '🍄', chonk: '💀', owl: '🦉', cactus: '🌵', penguin: '🐧',
    goose: '🪿', turtle: '🐢', axolotl: '🦎', rabbit: '🐰', raccoon: '🦝',
    bat: '🦇', whale: '🐋', unicorn: '🦄', phoenix: '🔥', void: '🌀',
    snail: '🐌', cat: '🐱', fox: '🦊', sloth: '🦥', blob: '💧', capybara: '🦫'
  };
  return emojis[species] || '❓';
}

module.exports = {
  speak,
  announceCompanion,
  petReaction,
  getEmoji,
  getPreset,
};
