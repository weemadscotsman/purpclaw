'use strict';
const PURP_PATHS = require('../paths');
/**
 * lib/commands/provider.js
 * ─────────────────────────────────────────────────────────────────────────────
 * purpclaw provider [list|save <name>|load <name>|delete <name>|test <provider>|wizard]
 *
 * Interactive provider profile manager.
 *
 * Profiles are stored in:
 *   ~/.purpclaw/profiles/<name>.json        (default)
 *   ${OPENCLAUDE_CONFIG_DIR}/profiles/<name>.json  (OPENCLAUDE_CONFIG_DIR env override)
 *
 * Each profile contains { lanes: { LANE: { provider, model } } } which mirrors
 * the structure of ~/.purpclaw/provider-config.json but as named, switchable sets.
 *
 * Usage:
 *   purpclaw provider            — show current config + available profiles
 *   purpclaw provider list       — list all saved profiles
 *   purpclaw provider save <n>  — snapshot current env/lane config as <name>
 *   purpclaw provider load <n>   — activate a saved profile (writes provider-config.json)
 *   purpclaw provider delete <n> — remove a saved profile
 *   purpclaw provider test <p>  — probe a provider with a lightweight call
 *   purpclaw provider wizard     — guided interactive setup (detects keys, probes, saves)
 */

const path      = require('path');
const fs        = require('fs');
const os        = require('os');
const http      = require('http');
const readline  = require('readline');

const providerConfig = require('../runtime/provider-config');

// ── Config dir resolution (supports OPENCLAUDE_CONFIG_DIR override) ──────────────
function configDir() {
  // OPENCLAUDE_CONFIG_DIR mirrors the upstream env-var convention from Gitlawb/openclaude.
  // If set, use it as the base for all PurpClaw config (not just profiles).
  return process.env.OPENCLAUDE_CONFIG_DIR
    || path.join(PURP_PATHS.DATA_ROOT);
}

function profilesDir() {
  const d = path.join(configDir(), 'profiles');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

// ── Profile I/O ────────────────────────────────────────────────────────────────
function listProfiles() {
  const dir = profilesDir();
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, ''))
      .sort();
  } catch { return []; }
}

function loadProfile(name) {
  const p = path.join(profilesDir(), name + '.json');
  if (!fs.existsSync(p)) throw new Error(`Profile '${name}' not found`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveProfile(name, data) {
  const p = path.join(profilesDir(), name + '.json');
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function deleteProfile(name) {
  const p = path.join(profilesDir(), name + '.json');
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// ── Probe a provider with a lightweight chat call ─────────────────────────────
function probeProvider(providerName) {
  return new Promise(resolve => {
    const { MINIMAX_API_KEY, NVIDIA_API_KEY, DEEPSEEK_API_KEY,
            OPENAI_API_KEY, OPENROUTER_API_KEY, OLLAMA_HOST } = process.env;

    const endpoints = {
      minimax:    () => ({ url: 'https://api.minimax.chat/v1/chat/completions',     key: MINIMAX_API_KEY,    model: 'MiniMax-M2.7' }),
      nvidia:     () => ({ url: 'https://integrate.api.nvidia.com/v1/chat/completions', key: NVIDIA_API_KEY, model: 'nvidia/llama-3.3-nemotron-super-49b' }),
      deepseek:   () => ({ url: 'https://api.deepseek.com/v1/chat/completions',     key: DEEPSEEK_API_KEY,   model: 'deepseek-chat' }),
      openai:     () => ({ url: 'https://api.openai.com/v1/chat/completions',       key: OPENAI_API_KEY,     model: 'gpt-4o-mini' }),
      openrouter: () => ({ url: 'https://openrouter.ai/api/v1/chat/completions',    key: OPENROUTER_API_KEY, model: 'openrouter/auto' }),
      ollama:     () => ({ url: `${OLLAMA_HOST || 'http://localhost:11434'}/api/chat`, key: 'nokey', model: 'qwen2.5' }),
    };

    const ep = endpoints[providerName] ? endpoints[providerName]() : null;
    if (!ep) { resolve({ ok: false, error: `Unknown provider '${providerName}'` }); return; }
    if (!ep.key && providerName !== 'ollama') {
      resolve({ ok: false, error: `No API key set (set ${providerName.toUpperCase()}_API_KEY)` }); return;
    }

    const body = JSON.stringify({
      model: ep.model,
      messages: [{ role: 'user', content: 'reply with just the word "ok"' }],
      max_tokens: 5,
    });

    const urlObj = new URL(ep.url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port:     urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path:     urlObj.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(providerName !== 'ollama' ? { 'Authorization': `Bearer ${ep.key}` } : {}),
      },
    };

    const req = (urlObj.protocol === 'https:' ? require('https') : http)
      .request(reqOptions, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(d);
            if (res.statusCode < 300 && parsed.choices?.[0]?.message?.content) {
              resolve({ ok: true, status: res.statusCode, response: parsed.choices[0].message.content.trim() });
            } else {
              resolve({ ok: false, status: res.statusCode, error: parsed.error?.message || `HTTP ${res.statusCode}` });
            }
          } catch { resolve({ ok: false, status: res.statusCode, error: d.slice(0, 120) }); }
        });
      });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ ok: false, error: 'timeout after 8s' }); });
    req.write(body);
    req.end();
  });
}

// ── Inline readline helper ─────────────────────────────────────────────────────
function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

// ── ANSI helpers (no deps — mirror bin/purpclaw.js C map) ──────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', gray: '\x1b[90m',
};

// ponytail: one painter for every sub-command. ctx.col/ctx.C come from
// bin/purpclaw.js sharedCtx(); when this module is required directly (tests,
// slash commands) both are absent, so fall back to local C + plain text.
function painter(ctx) {
  const palette = ctx.C || ctx.col || C;
  const paint = typeof ctx.col === 'function' ? ctx.col : ((_c, s) => s);
  return {
    cyan:  (s) => console.log(paint(palette.cyan  || C.cyan,  s)),
    green: (s) => console.log(paint(palette.green || C.green, s)),
    red:   (s) => console.log(paint(palette.red   || C.red,   s)),
    gray:  (s) => console.log(paint(palette.gray  || C.gray,  s)),
  };
}

// ── Main run dispatcher ─────────────────────────────────────────────────────────
async function run(args, rawCtx) {
  // Support being called with just (args) from slash-command context
  const ctx = rawCtx || {};
  const sub = (args[0] || '').toLowerCase();

  if (sub === 'list')   return cmdList(ctx);
  if (sub === 'save')   return cmdSave(args[1], ctx);
  if (sub === 'load')   return cmdLoad(args[1], ctx);
  if (sub === 'delete') return cmdDelete(args[1], ctx);
  if (sub === 'test')   return cmdTest(args[1], ctx);
  if (sub === 'wizard') return cmdWizard(ctx);

  return cmdSummary(ctx);
}

// ── Sub-commands ───────────────────────────────────────────────────────────────
async function cmdSummary(ctx) {
  const current  = providerConfig.load();
  const profileNames = listProfiles();

  if (ctx.banner) ctx.banner();
  if (ctx.sectionHead) ctx.sectionHead('  PROVIDER CONFIG');
  const { cyan: log } = painter(ctx);
  console.log('');
  log(`Config dir : ${configDir()}`);
  log(`Profiles   : ${profileNames.length > 0 ? profileNames.join(', ') : '(none)'}`);
  console.log('');
  log('Current lane overrides: ' + providerConfig.configPath());
  const lanes = current.lanes || {};
  if (Object.keys(lanes).length === 0) {
    log('(no overrides — using defaults)');
  } else {
    for (const [lane, cfg] of Object.entries(lanes)) {
      log(`  ${lane}: ${cfg.provider || '(default)'} / ${cfg.model || '(default)'}`);
    }
  }
  console.log('');
  console.log('Subcommands:');
  console.log('  purpclaw provider list      — list saved profiles');
  console.log('  purpclaw provider save <n>  — snapshot current config as <name>');
  console.log('  purpclaw provider load <n>  — activate a saved profile');
  console.log('  purpclaw provider delete <n> — remove a saved profile');
  console.log('  purpclaw provider test <p>  — probe a provider with a lightweight call');
  console.log('  purpclaw provider wizard    — guided interactive setup');
  console.log('');
  return 0;
}

async function cmdList(ctx) {
  if (ctx.banner) ctx.banner();
  if (ctx.sectionHead) ctx.sectionHead('  PROVIDER PROFILES');
  const { cyan: log } = painter(ctx);
  console.log('');
  const names = listProfiles();
  if (names.length === 0) {
    console.log('No profiles saved. Run: purpclaw provider save <name>');
  } else {
    for (const name of names) {
      try {
        const p = loadProfile(name);
        const lanes = Object.keys(p.lanes || {});
        log(`${name}  (${lanes.length} lane(s))`);
      } catch {
        log(`${name}  (error loading)`);
      }
    }
  }
  console.log('');
  return 0;
}

async function cmdSave(name, ctx) {
  if (!name) { console.log('Usage: purpclaw provider save <name>'); return 1; }
  if (ctx.banner) ctx.banner();
  if (ctx.sectionHead) ctx.sectionHead('  PROFILE SAVED');
  const { cyan: log } = painter(ctx);
  const current = providerConfig.load();
  saveProfile(name, current);
  log(`Profile '${name}' saved to:`);
  console.log(`  ${path.join(profilesDir(), name + '.json')}`);
  console.log('');
  return 0;
}

async function cmdLoad(name, ctx) {
  if (!name) { console.log('Usage: purpclaw provider load <name>'); return 1; }
  if (ctx.banner) ctx.banner();
  const { cyan: log } = painter(ctx);
  let profile;
  try {
    profile = loadProfile(name);
  } catch {
    // Header comes after the lookup, so a miss never prints "PROFILE ACTIVATED".
    if (ctx.sectionHead) ctx.sectionHead('  PROFILE NOT FOUND');
    log(`Profile '${name}' not found. Available: ${listProfiles().join(', ') || '(none)'}`);
    return 1;
  }
  if (ctx.sectionHead) ctx.sectionHead('  PROFILE ACTIVATED');
  providerConfig.save(profile);
  log(`Profile '${name}' is now active.`);
  console.log('Restart services for changes to take effect: purpclaw restart');
  console.log('');
  return 0;
}

async function cmdDelete(name, ctx) {
  if (!name) { console.log('Usage: purpclaw provider delete <name>'); return 1; }
  const p = path.join(profilesDir(), name + '.json');
  if (!fs.existsSync(p)) { console.log(`Profile '${name}' does not exist.`); return 1; }
  deleteProfile(name);
  if (ctx.banner) ctx.banner();
  if (ctx.sectionHead) ctx.sectionHead('  PROFILE DELETED');
  const { cyan: log } = painter(ctx);
  log(`'${name}' removed.`);
  console.log('');
  return 0;
}

async function cmdTest(provider, ctx) {
  if (!provider) { console.log('Usage: purpclaw provider test <provider>'); return 1; }
  if (ctx.banner) ctx.banner();
  if (ctx.sectionHead) ctx.sectionHead(`  PROBING ${provider.toUpperCase()}`);
  process.stdout.write('  ');
  const result = await probeProvider(provider.toLowerCase());
  const { green: logOk, red: logFail } = painter(ctx);
  if (result.ok) {
    logOk(`\n  Provider reachable (HTTP ${result.status})`);
    console.log(`  Response: "${result.response}"`);
  } else {
    logFail(`\n  Failed: ${result.error}`);
  }
  console.log('');
  return result.ok ? 0 : 1;
}

async function cmdWizard(ctx) {
  if (ctx.banner) ctx.banner();
  if (ctx.sectionHead) ctx.sectionHead('  PROVIDER SETUP WIZARD');
  const { cyan: log, green: logOk, red: logFail, gray: logDim } = painter(ctx);

  console.log('');
  console.log('  This wizard detects which API keys you have, probes each provider,');
  console.log('  and saves a named profile.\n');

  const checks = [
    { name: 'minimax',    key: 'MINIMAX_API_KEY',    model: 'MiniMax-M2.7' },
    { name: 'nvidia',     key: 'NVIDIA_API_KEY',      model: 'nvidia/llama-3.3-nemotron-super-49b' },
    { name: 'deepseek',   key: 'DEEPSEEK_API_KEY',    model: 'deepseek-chat' },
    { name: 'openai',     key: 'OPENAI_API_KEY',      model: 'gpt-4o-mini' },
    { name: 'openrouter', key: 'OPENROUTER_API_KEY',  model: 'openrouter/auto' },
  ];

  const detected = [];
  for (const check of checks) {
    if (process.env[check.key]) {
      process.stdout.write(`  Checking ${check.name}... `);
      const result = await probeProvider(check.name);
      if (result.ok) {
        logOk(`"${result.response}"`);
        detected.push({ ...check, status: 'ok' });
      } else {
        logFail(`${result.error}`);
        detected.push({ ...check, status: 'fail', reason: result.error });
      }
    }
  }

  // Ollama always checked (may not be running)
  process.stdout.write('  Checking ollama... ');
  const ollamaResult = await probeProvider('ollama');
  if (ollamaResult.ok) {
    logOk(`"${ollamaResult.response}"`);
    detected.push({ name: 'ollama', key: null, model: 'qwen2.5', status: 'ok' });
  } else {
    logDim('not reachable (not an error — may not be running)');
  }

  const working = detected.filter(d => d.status === 'ok');
  console.log(`\n  ${working.length} provider(s) are working.\n`);

  if (working.length === 0) {
    console.log('  No providers reachable. Check your API keys and try again.\n');
    return;
  }

  console.log('  Step 2 — Choose your primary provider:');
  working.forEach((p, i) => console.log(`    ${i + 1}. ${p.name} (${p.model})`));
  const choice = await prompt('  Enter number (or press Enter for option 1): ');
  const idx = parseInt(choice) - 1;
  const primary = working[idx === -1 || isNaN(idx) ? 0 : idx];

  const profileName = await prompt(`  Profile name [${primary.name}-default]: `);
  const finalName = profileName || `${primary.name}-default`;

  const cfg = providerConfig.load();
  cfg.lanes = cfg.lanes || {};
  cfg.lanes.PRIMARY = { provider: primary.name, model: primary.model };
  providerConfig.save(cfg);
  saveProfile(finalName, cfg);

  if (ctx.sectionHead) ctx.sectionHead('  WIZARD COMPLETE');
  console.log('');
  log(`  Profile '${finalName}' saved and activated.`);
  console.log(`  Primary: ${primary.name} / ${primary.model}`);
  console.log(`\n  Restart services: purpclaw restart`);
  console.log('');
  return 0;
}

module.exports = { run };
