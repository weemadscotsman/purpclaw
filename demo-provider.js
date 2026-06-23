#!/usr/bin/env node
'use strict';

/**
 * demo-provider — keyless chat so a brand-new user is NEVER blocked.
 *
 * The one-minute rule: nobody waits for an API key before seeing the product.
 * If no real provider keys are configured, PurpClaw drops into Demo Mode:
 *   1. If a local Ollama is reachable → use it (a real local model, free).
 *   2. Otherwise → a canned tutorial brain that answers the starter commands
 *      and explains, plainly, how to switch to a real provider.
 *
 * No crash. No stack-trace vomit. Just a working first chat.
 *
 *   const demo = require('./demo-provider');
 *   if (demo.isDemoMode()) console.log(await demo.respond('health'));
 */

const http = require('http');

// Real provider keys we look for. If ANY is set, we are NOT in demo mode.
const KEY_ENVS = [
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'NVIDIA_API_KEY', 'MINIMAX_API_KEY',
  'DEEPSEEK_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'KIMI_API_KEY',
  'GLM_API_KEY', 'MISTRAL_API_KEY', 'TOGETHER_API_KEY', 'LLM_API_KEY',
];

function hasRealKey() {
  return KEY_ENVS.some(k => {
    const v = process.env[k];
    return v && v.trim() && v.trim().toLowerCase() !== 'demo' && !/^your[_-]/i.test(v.trim());
  });
}

/** True when no real provider is configured → run keyless. */
function isDemoMode() {
  if (String(process.env.PURPCLAW_MODE || '').toLowerCase() === 'demo') return true;
  return !hasRealKey();
}

const OLLAMA = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

function ollamaUp(timeoutMs = 600) {
  return new Promise((resolve) => {
    const req = http.get(OLLAMA + '/api/tags', { timeout: timeoutMs }, (r) => {
      r.resume(); resolve(r.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function ollamaChat(message, model) {
  const body = JSON.stringify({ model: model || process.env.OLLAMA_MODEL || 'qwen2.5:3b', prompt: message, stream: false });
  return new Promise((resolve, reject) => {
    const req = http.request(OLLAMA + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 60000 }, (r) => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d).response || ''); } catch (e) { reject(e); } });
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('ollama timeout')); });
    req.write(body); req.end();
  });
}

// ── Canned tutorial brain (the zero-dependency floor) ────────────────────────
const CANNED = {
  banner: "🐾 PurpClaw — Demo Mode (no API key needed)\n\nI'm running locally with no provider key, so I'm in demo mode — enough to show you around. Add a key in Settings (or run the setup wizard) to unlock the full agent brain.",
  health: "SYSTEM CHECK (demo)\n  Server     ✅ ready\n  Chat Core  ✅ ready (demo brain)\n  Provider   ⚠️ demo (no key — add one to go live)\n  Memory     ⚠️ optional\n  UI         ✅ ready\nRun the real check anytime: `purpclaw doctor`",
  tools: "PurpClaw has 450+ tools + 35 agents once a provider is wired. In demo mode I can describe them; with a key I can USE them: read/write/edit files, run shell, search code, scan repos, route to specialist agents, train LoRA, and more. Try: `purpclaw crew` to see the named agents.",
  'scan repo': "Repo scan needs a live provider/agent. Add a key, then: `purpclaw crew \"scan this project\"` or open Mission Control → Agents. In demo mode I can't read your files yet (by design — keyless = safe).",
  'explain mode': "You're in DEMO MODE: keyless, safe, read-only. The other modes:\n  • API Mode   — OpenAI / NVIDIA / etc. (paste a key)\n  • Local Mode — Ollama / LM Studio (free, runs on your box)\n  • Dev Mode   — full logs + diagnostics\nSwitch in Settings or rerun the install wizard.",
  'first task': "Your first real task (once a key is set): `purpclaw crew \"write a hello-world script and run it\"`. The crew routes it to the Coder agent, runs it, and logs the proof. In demo mode, this is the preview — add a key to make it real.",
};

function cannedReply(message) {
  const m = String(message || '').toLowerCase().trim();
  for (const key of ['health', 'tools', 'scan repo', 'explain mode', 'first task']) {
    if (m === key || m.includes(key)) return CANNED[key];
  }
  if (/who are you|what (are|is) (you|purpclaw)|what can you do|help|^hi$|^hey$|^yo$/.test(m)) {
    return CANNED.banner + "\n\nFirst commands to try: `health`, `tools`, `scan repo`, `explain mode`, `first task`.";
  }
  return `${CANNED.banner}\n\nYou said: "${String(message).slice(0, 140)}"\n\nIn demo mode I keep it simple. Try a starter command — \`health\`, \`tools\`, \`explain mode\` — or add a provider key to unlock the full agent brain.`;
}

/** Keyless respond: Ollama if present, else the canned tutorial brain. */
async function respond(message) {
  if (await ollamaUp()) {
    try {
      const sys = "You are PurpClaw in demo mode — a local AI agent OS. Be concise, friendly, a little cocky. Help the user get started.";
      const out = await ollamaChat(`${sys}\n\nUser: ${message}\nPurpClaw:`);
      if (out && out.trim()) return out.trim();
    } catch (_) { /* fall to canned */ }
  }
  return cannedReply(message);
}

module.exports = { isDemoMode, hasRealKey, respond, cannedReply, ollamaUp, KEY_ENVS };

// CLI: `node demo-provider.js "health"`
if (require.main === module) {
  (async () => {
    const msg = process.argv.slice(2).join(' ') || 'who are you';
    console.log(`[demo-mode: ${isDemoMode()}]\n`);
    console.log(await respond(msg));
  })();
}
