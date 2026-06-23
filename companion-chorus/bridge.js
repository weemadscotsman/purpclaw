/**
 * COMPANION CHORUS BRIDGE v1.0
 * Connects companion-chorus to PURPCLAW Agent Tower via EventBus
 * Listens for agent.spawned, agent.completed, agent.failed and reacts
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');
const EventSource = require('eventsource');

const CONTEXT_FILE = path.join(process.env.HOME || process.env.USERPROFILE || 'C:\\Users\\Admin', '.companion-context.json');
const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE || 'C:\\Users\\Admin', '.companion-chorus');

// Import companion chorus modules
const { rollCompanion, displayCompanion, getSpeciesName, getSpeciesEmoji } = require('./src/gacha');
const { speak, announceCompanion } = require('./src/voice');
const { generateCritique, generateResponse } = require('./src/minimax');

// Detect Kimi Code CLI
let KIMI_CLI_PATH = null;
try {
  KIMI_CLI_PATH = execSync('where kimi', { encoding: 'utf8' }).trim().split('\n')[0];
  console.log(`[CHORUS] Kimi Code CLI detected: ${KIMI_CLI_PATH}`);
} catch (e) {
  const fallbackPaths = [
    path.join(process.env.USERPROFILE || 'C:\\Users\\Admin', '.local', 'bin', 'kimi.exe'),
    'C:\\Users\\Admin\\.local\\bin\\kimi.exe'
  ];
  for (const p of fallbackPaths) {
    if (fs.existsSync(p)) {
      KIMI_CLI_PATH = p;
      console.log(`[CHORUS] Kimi Code CLI found at fallback: ${KIMI_CLI_PATH}`);
      break;
    }
  }
}
if (!KIMI_CLI_PATH) {
  console.log('[CHORUS] Kimi Code CLI not found - using MiniMax API fallback');
}

// Companion roster (same as main.js)
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

const { SPECIES } = require('./src/constants');
const COMPANION_DEFS = SPECIES.map(s => ({
  id: s,
  name: getSpeciesName(s).toUpperCase(),
  emoji: getSpeciesEmoji(s),
  ...(PERSONALITY_MAP[s] || { personality: 'mysterious', catchphrase: '...', chaos: 50, snark: 50, wisdom: 50, patience: 50 }),
}));

// State
let companions = [];
let currentContext = {
  timestamp: Date.now(),
  activeAgents: [],
  recentEvents: [],
};

function loadContext() {
  try {
    if (fs.existsSync(CONTEXT_FILE)) {
      currentContext = JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
    }
  } catch (e) {}
}

function saveContext() {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONTEXT_FILE, JSON.stringify(currentContext, null, 2));
  } catch (e) {}
}

function getCompanionForAgent(agentName) {
  // Map agent names to companion species
  const mapping = {
    duck: 'duck', ghost: 'ghost', dragon: 'dragon', octopus: 'octopus',
    robot: 'robot', mushroom: 'mushroom', chonk: 'chonk', owl: 'owl',
    cactus: 'cactus', penguin: 'penguin', goose: 'goose', turtle: 'turtle',
    axolotl: 'axolotl', rabbit: 'rabbit', snail: 'snail',
    wolf: 'owl', bee: 'duck', snake: 'ghost', bunny: 'rabbit',
    spider: 'octopus', raven: 'ghost', phoenix: 'dragon', crow: 'owl',
    fox: 'cat', karen: 'penguin', lemur: 'rabbit', gorilla: 'chonk',
    shark: 'snail', mantis: 'cactus', scientist: 'robot', parrot: 'duck',
    chart: 'duck', numbers: 'robot', innovator: 'mushroom',
    jellyfish: 'blob', kraken: 'octopus', moth: 'moth', panda: 'capybara',
    elephant: 'capybara', hawk: 'owl', phoenix: 'dragon',
    void: 'ghost', guardian: 'dragon', claw: 'robot',
  };
  return mapping[agentName?.toLowerCase()] || 'duck';
}

function ensureCompanion(species) {
  let comp = companions.find(c => c.def.id === species);
  if (!comp) {
    const def = COMPANION_DEFS.find(d => d.id === species) || COMPANION_DEFS[0];
    const bones = rollCompanion(`bridge-${species}-${Date.now()}`);
    comp = { def, bones, messages: [], lastSpoke: 0 };
    companions.push(comp);
  }
  return comp;
}

function react(companion, eventType, agentName, task) {
  const now = Date.now();
  if (now - companion.lastSpoke < 3000) return; // Don't spam
  companion.lastSpoke = now;

  const prompts = {
    spawned: [
      `${agentName} has been summoned. React as your character would.`,
      `A new agent joins the swarm. Give your take.`,
      `Watch ${agentName} closely... share your thoughts.`,
    ],
    completed: [
      `${agentName} finished their task. React in character.`,
      `The swarm grows stronger. What's your reaction?`,
      `Task complete. For now. Say something fitting.`,
    ],
    failed: [
      `${agentName} has fallen. React in character.`,
      `Failure detected in ${agentName}. What's your take?`,
      `The swarm falters... say something fitting.`,
    ],
  };

  const base = prompts[eventType] || ['Something happened. React in character.'];
  const context = `Agent: ${agentName}\nTask: ${task || 'Unknown'}\nEvent: ${eventType}`;
  const userPrompt = base[Math.floor(Math.random() * base.length)] + '\n\n' + context;

  const displayResponse = (response) => {
    const color = companion.bones.rarity === 'legendary' ? '\x1b[1;33m' :
                  companion.bones.rarity === 'epic' ? '\x1b[1;35m' :
                  companion.bones.rarity === 'rare' ? '\x1b[1;34m' :
                  companion.bones.rarity === 'uncommon' ? '\x1b[1;32m' : '\x1b[1;36m';
    console.log(`\n${color}[CHORUS] ${companion.def.emoji} ${companion.def.name}:\x1b[0m "${response}"`);
    speak(companion.def.id, response, companion.bones.rarity);
  };

  // Build system prompt from companion personality (strip emojis to avoid Windows console codec errors)
  const sanitizeForCli = (text) => text.replace(/[\u{10000}-\u{10FFFF}]/gu, '');
  const systemPrompt = sanitizeForCli(`You are ${companion.def.emoji} ${companion.def.name}, a coding companion with a ${companion.def.personality} personality.
Catchphrase: "${companion.def.catchphrase}"
Stats: CHAOS ${companion.def.chaos}, SNARK ${companion.def.snark}, WISDOM ${companion.def.wisdom}, PATIENCE ${companion.def.patience}

Respond VERY SHORT — 1 sentence max, in character. Never break character.`);
  const sanitizedUserPrompt = sanitizeForCli(userPrompt);

  if (KIMI_CLI_PATH) {
    // Spawn Kimi CLI subagent for the reaction
    const cliPrompt = `${systemPrompt}\n\n${sanitizedUserPrompt}`;
    const child = spawn(KIMI_CLI_PATH, [
      '--print',
      '--yolo',
      '--prompt', cliPrompt
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      timeout: 45000
    });

    let rawOutput = '';
    child.stdout.on('data', (data) => { rawOutput += data.toString(); });
    child.stderr.on('data', (data) => { /* ignore stderr for brevity */ });
    child.on('close', (code) => {
      // Parse TextPart text fields from --print output
      const textParts = [];
      const textPartRegex = /TextPart\([^)]*text=['"]([\s\S]*?)['"][^)]*\)/g;
      let m;
      while ((m = textPartRegex.exec(rawOutput)) !== null) {
        textParts.push(m[1].replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"'));
      }
      const output = textParts.join('\n').trim() || rawOutput.split('\n').filter(l => !l.startsWith('To resume this session:')).join('\n').trim();
      const fallback = base[Math.floor(Math.random() * base.length)];
      const cleanedFallback = fallback.replace(/React as your character would\.|Give your take\.|share your thoughts\.|React in character\.|What's your reaction\?|Say something fitting\./g, '...').trim();
      const response = output || cleanedFallback;
      displayResponse(response);
    });
  } else {
    // Fallback to MiniMax API
    generateResponse(companion.def.id, userPrompt, (err, response) => {
      if (err || !response) {
        response = base[Math.floor(Math.random() * base.length)].replace('React as your character would.', '...');
      }
      displayResponse(response);
    });
  }
}

function handleEvent(event) {
  try {
    const data = JSON.parse(event.data || event);
    const topic = data.topic || '';
    const payload = data.payload || data;

    if (!topic.startsWith('agent.')) return;

    const agentName = payload.name || payload.agent || 'unknown';
    const task = payload.task || payload.command || 'working';
    const species = getCompanionForAgent(agentName);
    const companion = ensureCompanion(species);

    if (topic === 'agent.spawned') {
      react(companion, 'spawned', agentName, task);
    } else if (topic === 'agent.completed') {
      react(companion, 'completed', agentName, task);
    } else if (topic === 'agent.failed') {
      react(companion, 'failed', agentName, task);
    }

    // Update context
    currentContext.timestamp = Date.now();
    currentContext.recentEvents = currentContext.recentEvents || [];
    currentContext.recentEvents.unshift({
      time: Date.now(),
      topic,
      agent: agentName,
      task: task.substring(0, 100),
    });
    currentContext.recentEvents = currentContext.recentEvents.slice(0, 20);
    saveContext();
  } catch (e) {
    console.error('[CHORUS BRIDGE] Error handling event:', e.message);
  }
}

function startBridge() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     🎭  COMPANION CHORUS BRIDGE  —  Connected to Agent Tower   🎭 ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  loadContext();

  // Use native HTTP SSE since EventSource might not be installed
  const req = http.request({
    hostname: 'localhost',
    port: 7782,
    path: '/events/agent.*',
    method: 'GET',
  }, (res) => {
    console.log(`[CHORUS BRIDGE] Connected to EventBus (status: ${res.statusCode})`);

    let buffer = '';
    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      let currentEvent = {};
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent.event = line.slice(7);
        } else if (line.startsWith('data: ')) {
          currentEvent.data = line.slice(6);
        } else if (line === '' && currentEvent.data) {
          handleEvent(currentEvent);
          currentEvent = {};
        }
      }
    });

    res.on('end', () => {
      console.log('[CHORUS BRIDGE] EventBus connection closed. Reconnecting in 5s...');
      setTimeout(startBridge, 5000);
    });

    res.on('error', (e) => {
      console.error('[CHORUS BRIDGE] SSE error:', e.message);
      setTimeout(startBridge, 5000);
    });
  });

  req.on('error', (e) => {
    console.error('[CHORUS BRIDGE] Connection error:', e.message, '- retrying in 5s...');
    setTimeout(startBridge, 5000);
  });

  req.end();
}

startBridge();

// Keep alive
process.stdin.resume();
