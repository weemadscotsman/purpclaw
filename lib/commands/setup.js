'use strict';
/**
 * lib/commands/setup.js — Interactive Onboarding Wizard
 * ======================================================
 * Hand-holds new users through provider setup, API key
 * detection, and first-run configuration.
 *
 * purpclaw setup         → full interactive wizard
 * purpclaw setup --quick → auto-detect only, no prompts
 * purpclaw setup --list  → show all providers and their status
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const PURP_DIR = path.resolve(__dirname, '..', '..');
const CONFIG_DIR = path.join(os.homedir(), '.purpclaw');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const ENV_FILE = path.join(PURP_DIR, '.env');

// ── Provider registry (must match lib/llm-provider.js) ──────────────
const PROVIDERS = [
  { id: 'openai',      name: 'OpenAI',            keyEnv: 'OPENAI_API_KEY',       baseUrl: 'https://api.openai.com/v1' },
  { id: 'anthropic',   name: 'Anthropic (Claude)', keyEnv: 'ANTHROPIC_API_KEY',    baseUrl: 'https://api.anthropic.com' },
  { id: 'gemini',      name: 'Google Gemini',      keyEnv: 'GEMINI_API_KEY',       baseUrl: 'https://generativelanguage.googleapis.com' },
  { id: 'deepseek',    name: 'DeepSeek',           keyEnv: 'DEEPSEEK_API_KEY',     baseUrl: 'https://api.deepseek.com' },
  { id: 'openrouter',  name: 'OpenRouter',         keyEnv: 'OPENROUTER_API_KEY',   baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'groq',        name: 'Groq',               keyEnv: 'GROQ_API_KEY',         baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'kimi',        name: 'Kimi (Moonshot)',    keyEnv: 'KIMI_API_KEY',         baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'together',    name: 'Together AI',        keyEnv: 'TOGETHER_API_KEY',     baseUrl: 'https://api.together.xyz/v1' },
  { id: 'mistral',     name: 'Mistral',            keyEnv: 'MISTRAL_API_KEY',      baseUrl: 'https://api.mistral.ai/v1' },
  { id: 'minimax',     name: 'MiniMax',            keyEnv: 'MINIMAX_API_KEY',      baseUrl: 'https://api.minimax.io/v1' },
  { id: 'github',      name: 'GitHub Models (free)',keyEnv: 'GITHUB_TOKEN',        baseUrl: 'https://models.inference.ai.azure.com', free: true },
  { id: 'codex',       name: 'OpenAI Codex',       keyEnv: 'CODEX_API_KEY',        baseUrl: 'https://api.openai.com/v1' },
  { id: 'ollama',      name: 'Ollama (local)',     keyEnv: null,                   baseUrl: 'http://localhost:11434/v1', free: true, local: true },
  { id: 'lmstudio',    name: 'LM Studio (local)',  keyEnv: null,                   baseUrl: 'http://localhost:1234/v1', free: true, local: true },
  { id: 'atomic',      name: 'Atomic Chat',        keyEnv: 'ATOMIC_CHAT_API_KEY',  baseUrl: null },
  { id: 'custom',      name: 'Custom (OpenAI-compatible)', keyEnv: 'LLM_API_KEY',  baseUrl: null },
];

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini', anthropic: 'claude-3-5-haiku', gemini: 'gemini-2.5-flash',
  deepseek: 'deepseek-chat', openrouter: 'openai/gpt-4o-mini', groq: 'llama-3.3-70b',
  kimi: 'kimi-k2-5', together: 'meta-llama/llama-3-70b', mistral: 'mistral-small',
  minimax: 'MiniMax-M3', github: 'gpt-4o-mini', codex: 'gpt-5-codex',
  ollama: 'qwen2.5:3b', lmstudio: 'local-model', atomic: 'atomic-chat-default',
  custom: 'default',
};

// ── Scan system for API keys ──────────────────────────────────────
function scanForKeys() {
  const found = {};
  const searchPaths = [
    path.join(os.homedir(), '.env'),
    path.join(PURP_DIR, '.env'),
    path.join(process.cwd(), '.env'),
    '/etc/environment',
  ];
  const envLines = [];

  for (const sp of searchPaths) {
    try { if (fs.existsSync(sp)) envLines.push(...fs.readFileSync(sp, 'utf-8').split('\n')); } catch {}
  }

  // Also check process.env
  for (const [k, v] of Object.entries(process.env)) {
    envLines.push(`${k}=${v}`);
  }

  for (const p of PROVIDERS) {
    if (!p.keyEnv) continue;
    const key = p.keyEnv;
    // Search env lines
    for (const line of envLines) {
      const m = line.match(new RegExp(`^${key}\\s*=\\s*(.+)`, 'i'));
      if (m) {
        const val = m[1].trim().replace(/^["']|["']$/g, '');
        if (val && val.length > 10 && !val.includes('your-') && !val.includes('***')) {
          found[p.id] = { key: val.substring(0,8) + '...' + val.substring(val.length - 4), source: 'env' };
          break;
        }
      }
    }
    // Check process.env directly
    if (!found[p.id] && process.env[key]) {
      const val = process.env[key];
      if (val && val.length > 10) {
        found[p.id] = { key: val.substring(0,8) + '...' + val.substring(val.length - 4), source: 'env' };
      }
    }
  }

  // Check for local providers
  try {
    const http = require('http');
    // Ollama
    try { require('child_process').execSync('curl -s --max-time 1 http://localhost:11434/api/tags', { stdio: 'ignore' }); found.ollama = { key: 'local', source: 'local' }; } catch {}
  } catch {}

  return found;
}

// ── Display provider status table ──────────────────────────────────
function showStatus(foundKeys = null) {
  const keys = foundKeys || scanForKeys();
  console.log('\n  🟣 PurpClaw Provider Status\n');
  console.log('  ' + 'provider'.padEnd(18) + 'status'.padEnd(12) + 'notes');
  console.log('  ' + '─'.repeat(60));

  for (const p of PROVIDERS) {
    const hasKey = keys[p.id];
    const icon = hasKey ? '✅' : (p.free ? '🆓' : '❌');
    const status = hasKey ? 'ready' : (p.free ? 'free' : 'needs key');
    let notes = '';
    if (hasKey) notes = hasKey.source === 'local' ? 'local' : `key: ${hasKey.key}`;
    else if (p.free) notes = p.local ? 'install locally' : 'free tier';
    else notes = `set ${p.keyEnv}`;
    console.log(`  ${icon} ${p.id.padEnd(16)} ${status.padEnd(12)} ${notes}`);
  }
  console.log('');
  console.log(`  ${Object.keys(keys).length} of ${PROVIDERS.length} providers ready`);
  console.log('');
}

// ── Interactive setup wizard ───────────────────────────────────────
async function wizard() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(res => rl.question(q, res));

  console.log('\n  🟣 PurpClaw Setup Wizard\n');
  console.log('  I\'ll scan your system for API keys and help you configure providers.\n');

  const found = scanForKeys();
  showStatus(found);

  const ready = PROVIDERS.filter(p => found[p.id] || p.free);
  if (ready.length === 0) {
    console.log('  No providers detected. Let\'s set one up.\n');
  } else {
    console.log(`  ${ready.length} providers ready. Pick one as default:\n`);
    ready.forEach((p, i) => console.log(`    ${i + 1}. ${p.name} (${p.id})`));
    console.log(`    ${ready.length + 1}. Enter a new API key manually`);
  }

  const choice = await ask('\n  Choice [1]: ');
  let provider;

  if (choice && parseInt(choice) <= ready.length) {
    provider = ready[parseInt(choice) - 1];
  } else {
    console.log('\n  Available providers:\n');
    PROVIDERS.forEach((p, i) => console.log(`    ${i + 1}. ${p.name} (${p.id})`));
    const pChoice = await ask('\n  Provider number: ');
    provider = PROVIDERS[parseInt(pChoice) - 1] || PROVIDERS[0];
  }

  if (provider.keyEnv && !found[provider.id]) {
    console.log(`\n  ${provider.name} needs an API key.\n`);
    console.log(`  Get one at: ${provider.baseUrl || 'the provider\'s website'}`);
    const key = await ask(`  Paste your ${provider.keyEnv}: `);
    if (key) {
      // Write to .env
      try {
        let envContent = '';
        if (fs.existsSync(ENV_FILE)) envContent = fs.readFileSync(ENV_FILE, 'utf-8');
        if (!envContent.includes(`${provider.keyEnv}=`)) {
          envContent += `\n${provider.keyEnv}=${key}\n`;
          fs.writeFileSync(ENV_FILE, envContent);
          console.log(`  ✅ Saved ${provider.keyEnv} to .env`);
        }
        process.env[provider.keyEnv] = key;
      } catch (e) { console.log(`  ⚠ Could not save to .env: ${e.message}`); }
    }
  }

  // Set default model
  const defaultModel = DEFAULT_MODELS[provider.id] || 'auto';
  const modelChoice = await ask(`\n  Model [${defaultModel}]: `);
  const model = modelChoice || defaultModel;

  // Write config
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const config = {
      provider: provider.id,
      model: model,
      setupAt: new Date().toISOString(),
      version: '0.1.0',
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log(`  ✅ Config saved to ${CONFIG_FILE}`);
  } catch (e) { console.log(`  ⚠ Could not save config: ${e.message}`); }

  // Test connection
  console.log('\n  Testing connection...');
  try {
    const llm = require('../llm-provider');
    const r = await llm.chat([{ role: 'user', content: 'say hi in 3 words' }], { provider: provider.id, model });
    console.log(`  ✅ Connected! Response: "${r.content}"`);
    console.log(`  Model: ${r.model || model} | Provider: ${r.providerName || provider.id}`);
  } catch (e) {
    console.log(`  ⚠ Connection test failed: ${e.message}`);
    console.log('  (This is OK — some providers need additional setup)');
  }

  console.log('\n  🟣 Setup complete! Try:');
  console.log(`    purpclaw ask "hello"`);
  console.log(`    purpclaw ask --provider ${provider.id} "explain the codebase"`);
  console.log(`    purpclaw tui ng\n`);

  rl.close();
}

// ── Entry point ────────────────────────────────────────────────────
async function run(args, ctx) {
  if (args.includes('--list') || args.includes('-l')) {
    showStatus();
    return 0;
  }
  if (args.includes('--quick') || args.includes('-q')) {
    const found = scanForKeys();
    showStatus(found);
    const ready = PROVIDERS.filter(p => found[p.id]);
    if (ready.length > 0) {
      try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({ provider: ready[0].id, model: DEFAULT_MODELS[ready[0].id], setupAt: new Date().toISOString() }, null, 2));
        console.log(`  ✅ Quick setup: ${ready[0].id}/${DEFAULT_MODELS[ready[0].id]}\n`);
      } catch {}
    }
    return 0;
  }
  return wizard();
}

module.exports = { run, scanForKeys, showStatus };
