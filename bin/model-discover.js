#!/usr/bin/env node
/**
 * bin/model-discover.js — PURPCLAW model discovery + auto-update for NIM/OpenRouter/HF.
 *
 * Checks 3 sources daily for newly released models:
 *   1. NVIDIA NIM catalog (integrate.api.nvidia.com/v1/models)
 *   2. OpenRouter models list (openrouter.ai/api/v1/models)
 *   3. HuggingFace trending (api/models?sort=downloads,desc)
 *
 * Compares discovered models against the canonical lists in:
 *   - lib/llm-provider.js (PROVIDERS + defaultModel/freeModel)
 *   - lib/runtime/provider-router.js (LANES + defaultModel)
 *
 * Modes:
 *   --check       (default)  report only, no writes
 *   --apply                 apply updates to the registry + router
 *   --json                  emit JSON report on stdout (CI-friendly)
 *
 * Caching:
 *   agent_work/model-discovery/last-seen.json — model_id → first-seen date
 *
 * Cron:
 *   0 6 * * *  node bin/model-discover.js --check    # daily 6am
 *
 * v1.0 — first ship.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const PURP = path.resolve(__dirname, '..');
const STATE_DIR = path.join(PURP, 'agent_work', 'model-discovery');
const STATE_FILE = path.join(STATE_DIR, 'last-seen.json');
const REPORT_FILE = path.join(STATE_DIR, 'latest-report.json');

const PROVIDER_FILE = path.join(PURP, 'lib', 'llm-provider.js');
const ROUTER_FILE = path.join(PURP, 'lib', 'runtime', 'provider-router.js');

function log(...args) {
  console.log(`[model-discover ${new Date().toISOString()}]`, ...args);
}
function ensureDir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch (_) {} }

function httpsJson(url, { timeoutMs = 15000, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'purpclaw/1.0', ...headers }, timeout: timeoutMs,
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`${url} → ${res.statusCode}: ${d.slice(0, 200)}`));
        try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`timeout: ${url}`)); });
    req.end();
  });
}

// ── 1. NVIDIA NIM ──────────────────────────────────────────────────────
async function discoverNim(apiKey) {
  try {
    const r = await httpsJson('https://integrate.api.nvidia.com/v1/models', {
      headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {},
    });
    const models = (r.data || []).map(m => ({ id: m.id, source: 'nvidia-nim' }));
    return models;
  } catch (e) {
    log('  NIM discover failed: ' + e.message);
    return [];
  }
}

// ── 2. OpenRouter ──────────────────────────────────────────────────────
async function discoverOpenRouter(_apiKey) {
  // OpenRouter removed from PURPCLAW — discovery disabled (NVIDIA NIM + MiniMax only).
  return [];
}

// ── 3. HuggingFace trending ────────────────────────────────────────────
async function discoverHuggingFace(queries) {
  // queries is an array like ['llama', 'qwen', 'mistral', 'kimi', 'deepseek']
  const seen = new Map();
  for (const q of queries) {
    try {
      const r = await httpsJson(`https://huggingface.co/api/models?search=${encodeURIComponent(q)}&sort=downloads&direction=-1&limit=20`);
      for (const m of (r || [])) {
        if (!m.id) continue;
        seen.set(m.id, { id: m.id, source: 'huggingface', downloads: m.downloads || 0, likes: m.likes || 0, tags: (m.tags || []).slice(0, 5) });
      }
    } catch (e) {
      log('  HF ' + q + ' failed: ' + e.message);
    }
  }
  return [...seen.values()];
}

// ── Find which models are NEW (not in last-seen) ──────────────────────
function diffAgainstState(discovered) {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (_) {}
  const newOnes = [];
  for (const m of discovered) {
    if (!state[m.id]) {
      newOnes.push(m);
      state[m.id] = { firstSeen: new Date().toISOString(), source: m.source };
    }
  }
  return { newOnes, state };
}

// ── Heuristic: which new models should become a default? ──────────────
function rankCandidates(newOnes) {
  // Prefer: NVIDIA NIM (free), OpenRouter :free suffix, then HF with high downloads
  for (const m of newOnes) {
    if (m.source === 'nvidia-nim') m.score = 100;
    else if (m.source === 'openrouter' && (/:free$|:nitro$/i.test(m.id))) m.score = 90;
    else if (m.source === 'openrouter') m.score = 50;
    else if (m.source === 'huggingface') m.score = Math.min(80, Math.floor((m.downloads || 0) / 1000));
    else m.score = 10;
  }
  return newOnes.sort((a, b) => (b.score || 0) - (a.score || 0));
}

// ── Apply a candidate default to llm-provider.js + provider-router.js ──
function applyDefault(lane, provider, model) {
  log(`  APPLY: ${lane} → ${provider} / ${model}`);
  // llm-provider.js
  let prov = fs.readFileSync(PROVIDER_FILE, 'utf8');
  const re = new RegExp(`(${provider}:\\s*\\{[\\s\\S]*?defaultModel\\s*:\\s*)(['"])([^'"]+)\\2`, 'm');
  if (re.test(prov)) {
    prov = prov.replace(re, `$1$2${model}$2`);
    fs.writeFileSync(PROVIDER_FILE, prov);
    log(`    ${PROVIDER_FILE}: defaultModel updated`);
  } else {
    log(`    ${PROVIDER_FILE}: provider "${provider}" not found or no defaultModel — skipped`);
  }
  // provider-router.js
  let rout = fs.readFileSync(ROUTER_FILE, 'utf8');
  const re2 = new RegExp(`(\\b${lane}\\s*:\\s*\\{[\\s\\S]*?defaultModel\\s*:\\s*)(['"])([^'"]+)\\2`, 'm');
  if (re2.test(rout)) {
    rout = rout.replace(re2, `$1$2${model}$2`);
    fs.writeFileSync(ROUTER_FILE, rout);
    log(`    ${ROUTER_FILE}: ${lane} defaultModel updated`);
  } else {
    log(`    ${ROUTER_FILE}: lane "${lane}" not found — skipped`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const mode = (process.argv.find(a => a.startsWith('--')) || '--check').slice(2);
  const jsonOut = process.argv.includes('--json');

  // Read env (best-effort, do not require .env)
  require('dotenv').config({ path: path.join(PURP, '.env') });
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (!jsonOut) log(`mode=${mode}`);

  ensureDir(STATE_DIR);
  const discovered = [];

  // 1. NVIDIA NIM
  if (!jsonOut) log('probing NVIDIA NIM catalog...');
  discovered.push(...(await discoverNim(nvidiaKey)));

  // 2. OpenRouter
  if (!jsonOut) log('probing OpenRouter models...');
  discovered.push(...(await discoverOpenRouter(openrouterKey)));

  // 3. HuggingFace (curated queries)
  if (!jsonOut) log('probing HuggingFace trending...');
  discovered.push(...(await discoverHuggingFace(['llama', 'qwen', 'mistral', 'kimi', 'deepseek', 'nemotron', 'nex', 'phi'])));

  if (!jsonOut) log(`discovered ${discovered.length} models across 3 sources`);

  // Diff against last-seen
  const { newOnes, state } = diffAgainstState(discovered);
  const ranked = rankCandidates(newOnes);

  const report = {
    when: new Date().toISOString(),
    discovered: discovered.length,
    newCount: newOnes.length,
    rankedCandidates: ranked.slice(0, 10),
    mode,
  };
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    log(`new models since last check: ${newOnes.length}`);
    for (const m of ranked.slice(0, 10)) {
      log(`  [${m.source}] ${m.id}  (score=${m.score || 0})`);
    }
  }

  // Apply: only the top-ranked model, only for the matching lane
  if (mode === 'apply' && ranked.length) {
    const top = ranked[0];
    // Lane inference from source + name
    let lane = 'DIVISION';
    if (top.source === 'nvidia-nim') lane = 'DIVISION';
    else if (top.source === 'openrouter') lane = 'FALLBACK';
    else if (top.source === 'huggingface') lane = 'LOCAL';
    applyDefault(lane, top.source === 'nvidia-nim' ? 'nvidia' : top.source === 'openrouter' ? 'openrouter' : 'ollama', top.id);
  }

  // Save state
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  if (!jsonOut) log(`state updated, ${Object.keys(state).length} models tracked`);
}

main().catch(e => {
  log('fatal: ' + e.message);
  console.error(e.stack);
  process.exit(1);
});
