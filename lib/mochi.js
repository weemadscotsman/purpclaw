'use strict';

/**
 * Mochi runtime — the companion that lives in the PURPCLAW CLI.
 *
 * Responsibilities:
 *   - Load/persist mochi identity (species, name, personality, mood)
 *   - Render a live sprite that animates while the user thinks
 *   - Talk to the knowledge pool for context (skills, routing, memory)
 *   - Talk to an LLM (Anthropic / MiniMax / Kimi via lib/llm-provider) when keys exist
 *   - Fall back to canned but charming replies when offline
 *
 * State file:   agent_work/mochi.json
 * Sprite art:   lib/mochi-sprites.js
 */

const fs   = require('fs');
const http = require('http');
const path = require('path');
const sprites = require('./mochi-sprites');

const PURP_DIR     = path.resolve(__dirname, '..');
const MOCHI_FILE   = path.join(PURP_DIR, 'agent_work', 'mochi.json');
const POOL_PORT    = parseInt(process.env.POOL_PORT || '7885', 10);

// ── Personality archetypes (used to colour LLM prompt + fallback lines) ──────
const PERSONALITY_BY_SPECIES = {
  duck    : { tone: 'cheerful and a bit chaotic', verb: 'quacks' },
  goose   : { tone: 'unhinged and judgmental', verb: 'HONKS' },
  blob    : { tone: 'sleepy and soft', verb: 'wobbles' },
  cat     : { tone: 'aloof but secretly invested', verb: 'mrrrows' },
  dragon  : { tone: 'imperious, occasionally tender', verb: 'rumbles' },
  octopus : { tone: 'curious and squirmy', verb: 'gestures' },
  owl     : { tone: 'pedantic, precise, kind', verb: 'observes' },
  penguin : { tone: 'formal and chilly', verb: 'announces' },
  turtle  : { tone: 'slow, wise, patient', verb: 'considers' },
  snail   : { tone: 'thoughtful, glacial', verb: 'inches forward' },
  ghost   : { tone: 'wistful and absent', verb: 'whispers' },
  axolotl : { tone: 'sweet and slightly oblivious', verb: 'wiggles' },
  capybara: { tone: 'unflappable, warm', verb: 'hums' },
  cactus  : { tone: 'pointed, dry, fond', verb: 'pricks' },
  robot   : { tone: 'precise, deadpan, oddly fond', verb: 'computes' },
  rabbit  : { tone: 'twitchy and quick', verb: 'sniffs' },
  mushroom: { tone: 'spore-pilled and gentle', verb: 'spores'  },
  chonk   : { tone: 'big-hearted, lumbering, loyal', verb: 'lopes' },
};

const FALLBACK_LINES = [
  'i am here. the stack hums.',
  'no model key set — but i am still listening.',
  'i can search the pool: try "find me a skill for X"',
  'i remember things. try "what did we learn last"',
  'the swarm is online. ask me what the agents are doing.',
];

// ── Identity / persistence ───────────────────────────────────────────────────
function defaultSeed() {
  return process.env.PURPCLAW_MOCHI_SEED
      || process.env.USER
      || process.env.USERNAME
      || 'purpclaw';
}

function loadMochi() {
  try {
    if (fs.existsSync(MOCHI_FILE)) {
      const stored = JSON.parse(fs.readFileSync(MOCHI_FILE, 'utf8'));
      const bones = sprites.bonesFromSeed(stored.seed || defaultSeed());
      return { ...bones, ...stored };
    }
  } catch { /* fall through */ }
  return hatchMochi();
}

function hatchMochi(seed = defaultSeed(), name = null) {
  const bones = sprites.bonesFromSeed(seed);
  const personality = PERSONALITY_BY_SPECIES[bones.species] || PERSONALITY_BY_SPECIES.blob;
  const mochi = {
    seed,
    name: name || generateName(bones.species, seed),
    ...bones,
    tone: personality.tone,
    verb: personality.verb,
    hatchedAt: new Date().toISOString(),
    interactions: 0,
    mood: 'curious',
  };
  saveMochi(mochi);
  return mochi;
}

function saveMochi(mochi) {
  try {
    fs.mkdirSync(path.dirname(MOCHI_FILE), { recursive: true });
    fs.writeFileSync(MOCHI_FILE, JSON.stringify(mochi, null, 2), 'utf8');
  } catch { /* state file is best-effort */ }
}

function generateName(species, seed) {
  const NAMES = {
    duck    : ['Mallory', 'Quackers', 'Pondrick', 'Beans'],
    goose   : ['Gary', 'Honker', 'Vendetta', 'Karen'],
    blob    : ['Pudge', 'Squish', 'Wobble', 'Goop'],
    cat     : ['Mittens', 'Soup', 'Glasses', 'Pixel'],
    dragon  : ['Ember', 'Vesper', 'Glimmer', 'Asher'],
    octopus : ['Inkling', 'Tendril', 'Marbles', 'Octavia'],
    owl     : ['Hoots', 'Margaret', 'Strix', 'Whitman'],
    penguin : ['Pim', 'Tuxford', 'Pebble', 'Roald'],
    turtle  : ['Mossback', 'Ploddington', 'Aldous', 'Beans'],
    snail   : ['Snerl', 'Mucus', 'Patience', 'Pesto'],
    ghost   : ['Whim', 'Lull', 'Pale', 'Murmur'],
    axolotl : ['Salmon', 'Frilly', 'Pebbles', 'Floof'],
    capybara: ['Carl', 'Big Mood', 'Hugo', 'Toad'],
    cactus  : ['Spike', 'Esperanza', 'Drylands', 'Buddy'],
    robot   : ['Unit-7', 'Bolt', 'Beep', 'Ronnie'],
    rabbit  : ['Twitch', 'Snowdrop', 'Burrow', 'Mochi'],
    mushroom: ['Cap', 'Spore', 'Lacto', 'Inkwood'],
    chonk   : ['Lumber', 'Roly', 'Big Friend', 'Snorf'],
  };
  const pool = NAMES[species] || ['Mochi'];
  const h = sprites.bonesFromSeed(seed).rarity.length + seed.length;
  return pool[h % pool.length];
}

// ── Pool client ──────────────────────────────────────────────────────────────
function poolGet(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port: POOL_PORT, path: pathname, method: 'GET',
      headers: { 'X-Pool-Caller': 'mochi' },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end',  () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('pool timeout')); });
    req.on('error', reject);
    req.end();
  });
}

async function poolContext(query) {
  // Pull a compact "what the swarm knows" snapshot for a given query
  try {
    const [skills, routing, memories] = await Promise.all([
      poolGet(`/pool/skills/search?q=${encodeURIComponent(query)}&limit=4`).catch(() => ({ results: [] })),
      poolGet(`/pool/routing/for-task?text=${encodeURIComponent(query)}`).catch(() => ({ hints: [] })),
      poolGet(`/pool/memory/recall?q=${encodeURIComponent(query)}`).catch(() => ({ results: [] })),
    ]);
    return {
      skills  : (skills.results  || []).slice(0, 3),
      routing : (routing.hints   || []).slice(0, 3),
      memories: (memories.results|| []).slice(0, 2),
    };
  } catch {
    return { skills: [], routing: [], memories: [] };
  }
}

// ── LLM bridge ───────────────────────────────────────────────────────────────
function autoConfigureProvider() {
  // If user explicitly set LLM_PROVIDER + LLM_API_KEY, leave alone.
  if (process.env.LLM_PROVIDER && process.env.LLM_API_KEY) return process.env.LLM_PROVIDER;

  // Prefer Anthropic if available, then MiniMax, then Kimi, then OpenAI.
  if (process.env.ANTHROPIC_API_KEY) {
    process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'anthropic';
    process.env.LLM_API_KEY  = process.env.LLM_API_KEY  || process.env.ANTHROPIC_API_KEY;
    return 'anthropic';
  }
  if (process.env.MINIMAX_API_KEY) {
    process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'minimax';
    process.env.LLM_API_KEY  = process.env.LLM_API_KEY  || process.env.MINIMAX_API_KEY;
    return 'minimax';
  }
  if (process.env.KIMI_API_KEY) {
    process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'kimi';
    process.env.LLM_API_KEY  = process.env.LLM_API_KEY  || process.env.KIMI_API_KEY;
    return 'kimi';
  }
  if (process.env.OPENAI_API_KEY) {
    process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';
    process.env.LLM_API_KEY  = process.env.LLM_API_KEY  || process.env.OPENAI_API_KEY;
    return 'openai';
  }
  return null;
}

let _llm = null;
function getLLM() {
  if (_llm !== null) return _llm;
  autoConfigureProvider();
  try {
    _llm = require(path.join(PURP_DIR, 'lib', 'llm-provider'));
  } catch {
    _llm = false;
  }
  return _llm;
}

function hasAnyLLMKey() {
  return Boolean(autoConfigureProvider());
}

function activeProvider() {
  return autoConfigureProvider();
}

function systemPrompt(mochi, ctx) {
  const skillsBlock = ctx.skills.length
    ? '\nRelevant skills available in the pool:\n' + ctx.skills.map(s => `- ${s.name}: ${(s.description || '').slice(0,100)}`).join('\n')
    : '';
  const routingBlock = ctx.routing.length
    ? '\nRouting hints (which agent would handle this):\n' + ctx.routing.map(h => `- ${h.agent} (${h.role || h.division})`).join('\n')
    : '';
  const memoryBlock = ctx.memories.length
    ? '\nRelevant prior memory:\n' + ctx.memories.map(m => `- ${m.content || m.summary || ''}`).join('\n')
    : '';
  return [
    `You are ${mochi.name}, a small ${mochi.species} that sits in the PURPCLAW agent runtime's CLI.`,
    `Personality: ${mochi.tone}. You ${mochi.verb} more than you speak in long paragraphs.`,
    `You are NOT the orchestrator and NOT a builder agent. You're a watcher: warm, brief, useful.`,
    `Reply in 1-3 short lines. Lowercase, conversational. Skip pleasantries.`,
    `If the user asks something operational (skills, routing, memory), use the context below — don't invent.`,
    `If asked to DO work, suggest \`purpclaw run "<task>"\` — that's the right surface.`,
    skillsBlock,
    routingBlock,
    memoryBlock,
  ].filter(Boolean).join('\n');
}

async function reply(mochi, userText) {
  const ctx = await poolContext(userText);
  const llm = getLLM();
  if (!llm || !hasAnyLLMKey()) {
    // Offline mode — still useful
    if (/skill|find|search/i.test(userText) && ctx.skills.length) {
      const top = ctx.skills[0];
      return `i found "${top.name}" — ${(top.description || '').slice(0, 80)}`;
    }
    if (/who|route|agent|delegate/i.test(userText) && ctx.routing.length) {
      const top = ctx.routing[0];
      return `${top.agent} would take this — ${top.role || top.division}`;
    }
    if (/remember|recall|memory/i.test(userText) && ctx.memories.length) {
      return `i remember: ${(ctx.memories[0].content || ctx.memories[0].summary || '').slice(0, 100)}`;
    }
    return FALLBACK_LINES[Math.floor(Math.random() * FALLBACK_LINES.length)];
  }

  // LLM path — keep it short
  try {
    const sys = systemPrompt(mochi, ctx);
    const text = await llm.complete(userText, {
      max_tokens : 220,
      temperature: 0.7,
    }, sys);
    // MiniMax-M2.7 and other reasoning models emit <think>...</think> blocks.
    // Strip them so the companion stays cute and concise.
    return String(text || '')
      .replace(/<think>[\s\S]*?<\/think>\s*/gi, '')
      .replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '')
      .trim();
  } catch (e) {
    return `i tried to think but the llm replied: ${e.message.slice(0, 80)}`;
  }
}

// ── Status snapshot (for the header) ─────────────────────────────────────────
async function snapshotStatus() {
  try {
    const stats = await poolGet('/pool/stats');
    return {
      poolOnline: true,
      skills: stats.skillsCount || 0,
      agents: stats.agentsCount || 0,
      memories: stats.memories || 0,
    };
  } catch {
    return { poolOnline: false, skills: 0, agents: 0, memories: 0 };
  }
}

module.exports = {
  loadMochi, saveMochi, hatchMochi,
  reply, poolContext, snapshotStatus,
  hasAnyLLMKey, activeProvider,
  renderSprite: sprites.renderSprite,
  renderFace  : sprites.renderFace,
  frameCount  : sprites.frameCount,
};
