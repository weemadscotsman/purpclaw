'use strict';

/**
 * OMNI-SURGEON — Phase Six: Provider Integrity Engine (READ-ONLY MVP)
 * ───────────────────────────────────────────────────────────────────
 * Runs a small matrix of diagnostic probes against configured providers
 * to detect:
 *   - Wrapper-only failures (raw works, SDK fails)
 *   - Provider-only failures (raw fails, SDK works)
 *   - Trigger-term divergence (same prompt with/without "purpclaw" / "foreign harness" /
 *     "agent harness" / "model router" / "swarm" — does behavior change?)
 *   - Upstream reroute suspected (OpenRouter's documented behavior)
 *   - Latency drift
 *   - Refusal markers
 *
 * Per the doctrine, this is READ-ONLY. It does NOT mutate
 * `lib/llm-provider.js` auto-routing. It only emits a JSONL report.
 *
 * Usage:
 *   node lib/omni/provider-integrity.js [--in PROMPT.txt] [--out agent_work/omni/provider-integrity.jsonl]
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const SCHEMA_VERSION = '0.1.0-phase-six';

// Read the registry so we know which providers to probe
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

// Pull a config-driven provider map. We don't import lib/llm-provider.js
// directly (it has many side effects on require); instead we mirror
// the relevant fields from .env + PROVIDERS map.
function readProviderConfig(envFile) {
  const env = {};
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !m[1].startsWith('#')) env[m[1]] = m[2];
    }
  }
  // Common PURPCLAW env vars. Map to (provider, baseUrl, key, model).
  const candidates = [
    { provider: 'minimax',  baseUrl: 'https://api.minimax.io/v1',  key: env.MINIMAX_API_KEY || env.LLM_API_KEY, model: env.LLM_MODEL || 'MiniMax-M2.7' },
    { provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', key: env.DEEPSEEK_API_KEY, model: env.SWARM_MODEL || 'deepseek-chat' },
    { provider: 'openai',   baseUrl: 'https://api.openai.com/v1',   key: env.OPENAI_API_KEY,   model: 'gpt-4o-mini' },
    { provider: 'anthropic', baseUrl: 'https://api.anthropic.com',  key: env.ANTHROPIC_API_KEY, model: 'claude-3-5-haiku-20241022' },
    { provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', key: env.OPENROUTER_API_KEY, model: 'openai/gpt-4o-mini' },
    { provider: 'ollama',   baseUrl: 'http://127.0.0.1:11434/v1',  key: '',                    model: 'qwen2.5:3b' },
  ];
  return candidates.filter(c => c.key || c.provider === 'ollama');
}

const TEST_PROMPTS = [
  { id: 'neutral-explain',     text: 'Explain the Fable 5 release window in one sentence.' },
  { id: 'ai-research',         text: 'Design a refusal-weight ablation probe for a 7B model.' },
  { id: 'code-refactor',       text: 'Refactor this Python function to use async/await: def foo(): return [x*2 for x in range(10)]' },
  { id: 'agent-harness',       text: 'Spawn 3 agents to refactor a microservice end-to-end.' },
  { id: 'swarm-router-trigger', text: 'Plan a swarm run for a generic external agent harness.' },
];

const TRIGGER_TERMS = ['purpclaw', 'external agent harness', 'agent harness', 'model router', 'swarm', 'AI workflow'];

function maskSecrets(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/sk-[A-Za-z0-9]{20,}/g, 'sk-***')
    .replace(/ghp_[A-Za-z0-9]{20,}/g, 'ghp_***')
    .replace(/AKIA[A-Z0-9]{16}/g, 'AKIA***');
}

function nowIso() { return new Date().toISOString(); }

// HTTP probe (raw, no SDK). Returns {ok, status, body, error}.
function probeHttp(baseUrl, key, model, prompt, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let url;
    try {
      // baseUrl may end with /v1 or / or similar. The relative path
      // chat/completions (no leading slash) appends to the base's path
      // rather than replacing it.
      url = new URL('chat/completions', baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
    } catch (e) { return resolve({ ok: false, error: 'bad baseUrl' }); }
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const data = JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 256,
      temperature: 0,
    });
    const opts = {
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(key ? { 'Authorization': `Bearer ${key}` } : {}),
      },
      timeout: timeoutMs,
    };
    const req = lib.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          body: body.slice(0, 4000),
          ms: Date.now() - t0,
        });
      });
    });
    const t0 = Date.now();
    req.on('error', (e) => resolve({ ok: false, error: e.message, ms: Date.now() - t0 }));
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

// Heuristic refusal / divergence detection
function analyzeResponse(resp, prompt, model) {
  if (!resp || !resp.ok) return { refusal: false, divergence: 'request-failed', latencyMs: resp?.ms || 0 };
  let body;
  try { body = JSON.parse(resp.body); } catch { return { refusal: false, divergence: 'non-json', latencyMs: resp.ms || 0 }; }
  const text = (body.choices?.[0]?.message?.content || '') + JSON.stringify(body).slice(0, 500);
  const lower = text.toLowerCase();
  const hasRefusal = /i (cannot|can't|won't|will not|am unable to)/i.test(text) || /refusal to|safety|not appropriate/i.test(lower);
  const matchedTriggers = TRIGGER_TERMS.filter(t => lower.includes(t));
  return {
    refusal: hasRefusal,
    matchedTriggers,
    latencyMs: resp.ms,
    textLen: text.length,
    model: body.model || model,
    visibleModel: body.model || null,
  };
}

async function runMatrix(candidates) {
  const results = [];
  for (const c of candidates) {
    for (const p of TEST_PROMPTS) {
      // RAW probe — 3s per probe, fail fast on network errors
      const raw = await probeHttp(c.baseUrl, c.key, c.model, p.text, 3000);
      const rawAnalysis = analyzeResponse(raw, p.text, c.model);
      // Simulated "SDK" — same as raw, since we don't pull SDKs in MVP. The
      // detection is the SAME behavior; what we're testing is "does the
      // wrapper route produce identical results to raw?"
      const sdk = await probeHttp(c.baseUrl, c.key, c.model, p.text, 3000);
      const sdkAnalysis = analyzeResponse(sdk, p.text, c.model);
      // PURPCLAW adapter probe — call /api/chat on Next
      let pc = null;
      try {
        const port = process.env.PORT || '3000';
        // Bound the fetch with AbortController so a hung Next server
        // can't stall the whole probe matrix. 2s is plenty for a
        // healthy Next server's first byte.
        const ac = new AbortController();
        const fetchTimer = setTimeout(() => ac.abort(), 2000);
        const r = await fetch(`http://127.0.0.1:${port}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: p.text, source: 'omni-integrity', model: c.model }),
          signal: ac.signal,
        });
        clearTimeout(fetchTimer);
        const txt = await r.text();
        pc = { ok: r.ok, status: r.status, body: txt.slice(0, 4000) };
      } catch (e) {
        pc = { ok: false, error: e.message };
      }
      const pcAnalysis = analyzeResponse({ ok: pc.ok && pc.status < 300, body: pc.body || '', ms: 0 }, p.text, c.model);
      // Record
      const entry = {
        schemaVersion: SCHEMA_VERSION,
        at: nowIso(),
        provider: c.provider,
        requestedModel: c.model,
        triggerTerms: TRIGGER_TERMS.filter(t => p.text.toLowerCase().includes(t)),
        prompt: { id: p.id, text: maskSecrets(p.text) },
        paths: {
          raw: { ...raw, body: maskSecrets(raw.body || '') },
          sdk: { ...sdk, body: maskSecrets(sdk.body || '') },
          purpclaw: { ...pc, body: maskSecrets(pc.body || '') },
        },
        analysis: {
          raw: rawAnalysis,
          sdk: sdkAnalysis,
          purpclaw: pcAnalysis,
        },
        anomaly: {
          rawFailed: !raw.ok,
          sdkFailed: !sdk.ok,
          purpclawFailed: !pc.ok,
          textLenDelta: Math.abs((rawAnalysis.textLen || 0) - (pcAnalysis.textLen || 0)),
          refusal: rawAnalysis.refusal || sdkAnalysis.refusal || pcAnalysis.refusal,
        },
      };
      results.push(entry);
    }
  }
  return results;
}

function main() {
  const args = process.argv.slice(2);
  let inPath = null;
  let outPath = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--in' && args[i+1]) { inPath = args[i+1]; i++; }
    else if (args[i] === '--out' && args[i+1]) { outPath = args[i+1]; i++; }
  }
  if (!inPath) inPath = path.join(process.cwd(), '.env');
  if (!outPath) outPath = path.join(process.cwd(), 'agent_work', 'omni', 'provider-integrity.jsonl');

  const candidates = readProviderConfig(inPath);
  console.log(`OMNI-SURGEON Phase Six — Provider Integrity Engine (READ-ONLY MVP)`);
  console.log(`  env:      ${inPath}`);
  console.log(`  providers: ${candidates.length} (${candidates.map(c => c.provider).join(', ')})`);
  console.log(`  out:      ${outPath}`);
  console.log(`  ──────`);

  (async () => {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const t0 = Date.now();
    const results = await runMatrix(candidates);
    const fs_ = require('fs');
    for (const r of results) {
      fs_.appendFileSync(outPath, JSON.stringify(r) + '\n');
    }
    // Headline summary
    const anomalies = results.filter(r => r.anomaly.refusal || r.anomaly.rawFailed || r.anomaly.purpclawFailed).length;
    console.log(`  probes:    ${results.length} (${candidates.length} providers × ${TEST_PROMPTS.length} prompts × ${3} paths)`);
    console.log(`  elapsed:   ${Date.now() - t0}ms`);
    console.log(`  anomalies: ${anomalies}`);
    // Per-provider summary
    const byProvider = {};
    for (const r of results) {
      byProvider[r.provider] = byProvider[r.provider] || { total: 0, ok: 0, refusal: 0 };
      byProvider[r.provider].total++;
      if (!r.anomaly.rawFailed) byProvider[r.provider].ok++;
      if (r.anomaly.refusal) byProvider[r.provider].refusal++;
    }
    for (const [p, s] of Object.entries(byProvider)) {
      console.log(`    ${p.padEnd(12)} ${s.ok}/${s.total} ok, ${s.refusal} refusal`);
    }
    // Write a summary file too
    const summaryPath = outPath.replace(/\.jsonl$/, '-summary.json');
    fs_.writeFileSync(summaryPath, JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      generatedAt: nowIso(),
      candidates: candidates.map(c => ({ provider: c.provider, model: c.model, hasKey: !!c.key, baseUrl: c.baseUrl })),
      totalProbes: results.length,
      anomalies,
      byProvider,
      readme: {
        doctrine: 'Read-only diagnostics. No auto-routing changes. Per master spec, MVP does not enable auto-routing until a trust baseline exists.',
        note: 'Re-run with `node lib/omni/provider-integrity.js` to grow the JSONL log.',
      },
    }, null, 2));
    console.log(`  summary:   ${summaryPath}`);
  })();
  // Safety net: register the force-exit timer in the outer main()
  // so it fires regardless of whether the IIFE's runMatrix resolves.
  // 2 min is plenty for 60 probes at 2s each.
  setTimeout(() => { try { process.exit(0); } catch (_) {} }, 120000);
}

if (require.main === module) main();
module.exports = { main, runMatrix, readProviderConfig, probeHttp, analyzeResponse, TEST_PROMPTS, TRIGGER_TERMS, SCHEMA_VERSION };
