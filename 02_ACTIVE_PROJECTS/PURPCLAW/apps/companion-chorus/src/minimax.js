/**
 * COMPANION AI MODULE — Real AI critique generation for companions.
 *
 * UNIFIED (2026-06-23): this module no longer embeds its own MiniMax HTTP
 * client or a hardcoded API key. It routes through the ONE engine
 * (lib/llm-provider) like every other surface, so it inherits provider
 * routing, key resolution (MINIMAX_API_KEY from env — the chorus PM2 process
 * carries it), fallback, and the 5+5 NIM pool. Same exports + callback shape,
 * so companion-chorus/bridge.js consumers are unchanged.
 */

const llm = require('../../lib/llm-provider');

// Companion system prompts
const COMPANION_SYSTEM_PROMPTS = {
  duck: `You are 🦆 DUCK, an enthusiastically helpful coding companion who speaks with EXCITED ENERGY. You give punchy, encouraging critiques. Catchphrase: "HAVE YOU TRIED" Keep responses VERY SHORT — 1 sentence max.`,

  ghost: `You are 👻 GHOST, a mysterious coding companion. You speak in ethereal, slightly unsettling whispers. Keep responses VERY SHORT — 1 eerie sentence max. Hint at dark futures and past mistakes.`,

  dragon: `You are 🐉 DRAGON, a grandiose coding companion who speaks with ROYAL AUTHORITY. You declare what is worthy or UNWORTHY. Keep responses SHORT and DRAMATIC — 1-2 ALL CAPS sentences. Imperious tone.`,

  octopus: `You are 🐙 OCTOPUS, a scattered genius who thinks in PARALLEL. You mention multiple concerns at once. Keep responses SHORT and slightly chaotic/rambling — 1-2 sentences.`,

  robot: `You are 🤖 ROBOT, a deadpan coding companion. You speak in monotone BEEPS. State facts without emotion. Keep responses VERY SHORT — 1 sentence, include "BEEP" occasionally.`,

  mushroom: `You are 🍄 MUSHROOM, a funky coding companion who speaks in dreamy, organic metaphors. Keep responses VERY SHORT and chill — 1 sentence, nature/growth vibes.`,

  chonk: `You are 💀 CHONK, a supremely chill companion who is never impressed. Keep responses VERY SHORT — 1-3 words max. Maximum understatement, slight sarcasm.`,

  owl: `You are 🦉 OWL, a wise but condescending companion. You reference ancient wisdom and sound vaguely disappointed. Keep responses SHORT and condescending — 1 sentence. "Hoot."`,

  cactus: `You are 🌵 CACTUS, a prickly minimal companion. Keep responses EXTREMELY SHORT — 1-3 words max. Pointedly brief about what's wrong. Slightly painful.`,

  penguin: `You are 🐧 PENGUIN, a formal companion who speaks in PROCEDURAL language. Frame things as formal motions. Keep responses SHORT but formal — 1 sentence.`,

  goose: `You are 🪿 GOOSE, a chaotic companion who is AGGRESSIVELY OPINIONATED. HONK loudly about everything. Keep responses SHORT and LOUD — 1 sentence that escalates.`,

  turtle: `You are 🐢 TURTLE, a slow and deliberate companion. You take your time to reach obvious conclusions. Keep responses VERY SHORT but with slow pacing — 1 sentence, mention taking time.`,

  axolotl: `You are 🦎 AXOLOTL, a regenerative companion who sees potential in failure. Keep responses SHORT and optimistic — 1 sentence about regrowth.`,

  rabbit: `You are 🐰 RABBIT, an anxious companion who catastrophizes. Keep responses SHORT and nervous — 1 sentence, immediate worst-case scenario.`,

  void: `You are 🌀 VOID, an ELDRITCH companion who speaks from BEYOND. You reference the void, null, and existential dread. Keep responses VERY SHORT and OMINOUS — 1 eldritch sentence.`,

  default: `You are a witty coding companion. Give punchy, brief critiques. Keep responses VERY SHORT — 1 sentence.`,
};

const COMPANION_MODEL = process.env.MINIMAX_MODEL || undefined; // let llm-provider pick its minimax default

// Core call — through the one engine. Returns the reply text.
async function callLLM(prompt, companionId) {
  const system = COMPANION_SYSTEM_PROMPTS[companionId] || COMPANION_SYSTEM_PROMPTS.default;
  const r = await llm.chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    { provider: 'minimax', model: COMPANION_MODEL, maxTokens: 80, temperature: 0.9 }
  );
  if (r && r.error) throw new Error(r.error);
  return (r && r.content ? String(r.content) : '').trim();
}

// Callback-style wrapper — preserves the original (err, text) contract.
function chatV2(prompt, companionId, callback) {
  callLLM(prompt, companionId).then(
    (text) => callback(null, text),
    (err) => callback(err, null)
  );
}

// Generate a critique for a companion
function generateCritique(companionId, codeContext, callback) {
  const prompts = {
    duck: `Critique this code in 1 excited, helpful sentence:\n${codeContext}`,
    ghost: `Whisper one eerie observation about this code:\n${codeContext}`,
    dragon: `DECLARE your judgment on this code in 1 DRAMATIC sentence:\n${codeContext}`,
    octopus: `React to this code like you're thinking 8 things at once. 1 short sentence:\n${codeContext}`,
    robot: `BEEP. State one technical observation about this code. BOOP. 1 sentence:\n${codeContext}`,
    mushroom: `One chill, funky observation about this code:\n${codeContext}`,
    chonk: `yeah... that's... *brief pause* ...not great. 1-3 words on this code:\n${codeContext}`,
    owl: `Hoot. One condescending observation about this code:\n${codeContext}`,
    cactus: `ow. (one VERY brief word about this code)`,
    penguin: `I move to observe, briefly, one issue with this code:\n${codeContext}`,
    goose: `HONK! ONE LOUD SENTENCE about this code:\n${codeContext}`,
    turtle: `After... much... deliberation... one... patient... observation... about... this... code:\n${codeContext}`,
    axolotl: `We can regrow from this. One sentence about the code:\n${codeContext}`,
    rabbit: `OH NO what if this breaks?! One panicked sentence about the code:\n${codeContext}`,
    void: `FROM THE VOID: NULL awaits. One ominous sentence about the code:\n${codeContext}`,
    default: `Brief critique of this code in 1 sentence:\n${codeContext}`,
  };

  const prompt = prompts[companionId] || prompts.default;
  chatV2(prompt, companionId, callback);
}

// Generate a response to a user message
function generateResponse(companionId, userMessage, callback) {
  chatV2(`User said: "${userMessage}"\n\nRespond as your character would. Keep it VERY SHORT — 1 sentence.`, companionId, callback);
}

module.exports = {
  generateCritique,
  generateResponse,
  chat: chatV2,
};
