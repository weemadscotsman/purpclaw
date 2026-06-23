'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000;
const DEFAULT_RESPONSE_RESERVE_TOKENS = 8_000;
const DEFAULT_CHUNK_TOKENS = 900;
const DEFAULT_CHUNK_OVERLAP_TOKENS = 120;
const DEFAULT_GRAPH_LIMIT = 24;

function envInt(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function config() {
  return {
    contextWindowTokens: envInt('PURPCLAW_CONTEXT_WINDOW_TOKENS', DEFAULT_CONTEXT_WINDOW_TOKENS),
    responseReserveTokens: envInt('PURPCLAW_RESPONSE_RESERVE_TOKENS', DEFAULT_RESPONSE_RESERVE_TOKENS),
    chunkTokens: envInt('PURPCLAW_CHUNK_TOKENS', DEFAULT_CHUNK_TOKENS),
    chunkOverlapTokens: envInt('PURPCLAW_CHUNK_OVERLAP_TOKENS', DEFAULT_CHUNK_OVERLAP_TOKENS),
    graphLimit: envInt('PURPCLAW_GRAPH_RAG_LIMIT', DEFAULT_GRAPH_LIMIT),
    quantizationMode: process.env.PURPCLAW_QUANTIZATION_MODE || inferQuantizationMode(),
    kvCacheMode: process.env.PURPCLAW_KV_CACHE_MODE || 'provider-managed',
    contextCacheTtlMs: envInt('PURPCLAW_CONTEXT_CACHE_TTL_MS', 30_000),
  };
}

function inferQuantizationMode() {
  const model = [
    process.env.LLM_MODEL,
    process.env.SWARM_MODEL,
    process.env.LLM_FALLBACK_MODEL,
    process.env.OLLAMA_MODEL,
  ].filter(Boolean).join(' ').toLowerCase();

  const match = model.match(/\b(q[2-8](?:_[a-z0-9]+)?|int4|int8|fp8)\b/);
  return match ? match[1] : 'unspecified';
}

function estimateTokens(text) {
  const input = String(text || '').trim();
  if (!input) return 0;
  const words = input.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words * 1.33));
}

function tokenize(text) {
  return new Set(String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3));
}

function hashText(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex').slice(0, 16);
}

function splitUnits(text) {
  const paragraphs = String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function tailTokens(text, maxTokens) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const approxWords = Math.max(1, Math.ceil(maxTokens / 1.33));
  return words.slice(-approxWords).join(' ');
}

function chunkText(text, options = {}) {
  const targetTokens = options.chunkTokens || config().chunkTokens;
  const overlapTokens = Math.min(options.chunkOverlapTokens ?? config().chunkOverlapTokens, Math.floor(targetTokens / 2));
  const source = options.source || 'inline';
  const units = splitUnits(text);
  const chunks = [];
  let current = '';
  let currentTokens = 0;

  function pushCurrent() {
    const content = current.trim();
    if (!content) return;
    chunks.push({
      id: `${source}:${chunks.length + 1}:${hashText(content)}`,
      source,
      index: chunks.length,
      content,
      tokens: estimateTokens(content),
      hash: hashText(content),
    });
  }

  for (const unit of units) {
    const unitTokens = estimateTokens(unit);
    if (current && currentTokens + unitTokens > targetTokens) {
      pushCurrent();
      const overlap = overlapTokens ? tailTokens(current, overlapTokens) : '';
      current = overlap ? `${overlap}\n\n${unit}` : unit;
      currentTokens = estimateTokens(current);
    } else {
      current = current ? `${current}\n\n${unit}` : unit;
      currentTokens += unitTokens;
    }
  }

  pushCurrent();
  return {
    source,
    tokenEstimate: estimateTokens(text),
    targetTokens,
    overlapTokens,
    count: chunks.length,
    chunks,
  };
}

function buildContextBudget(items = [], options = {}) {
  const cfg = { ...config(), ...options };
  const availableTokens = Math.max(0, cfg.contextWindowTokens - cfg.responseReserveTokens);
  const ranked = items.map((item, index) => ({
    ...item,
    index,
    tokens: item.tokens || estimateTokens(item.content || item.text || ''),
    score: Number(item.score ?? 0),
  })).sort((a, b) => b.score - a.score || a.index - b.index);

  const selected = [];
  let usedTokens = 0;
  for (const item of ranked) {
    if (usedTokens + item.tokens > availableTokens) continue;
    selected.push(item);
    usedTokens += item.tokens;
  }

  return {
    contextWindowTokens: cfg.contextWindowTokens,
    responseReserveTokens: cfg.responseReserveTokens,
    availableTokens,
    usedTokens,
    remainingTokens: availableTokens - usedTokens,
    selected,
    dropped: ranked.length - selected.length,
  };
}

function requestJson(port, pathname, timeoutMs = 3000) {
  return new Promise(resolve => {
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method: 'GET' }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, body: JSON.parse(data) }); }
        catch { resolve({ ok: false, body: data }); }
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', err => resolve({ ok: false, error: err.message }));
    req.end();
  });
}

function postJson(port, pathname, body, timeoutMs = 4000) {
  return new Promise(resolve => {
    const payload = JSON.stringify(body || {});
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, body: JSON.parse(data) }); }
        catch { resolve({ ok: false, body: data }); }
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', err => resolve({ ok: false, error: err.message }));
    req.write(payload);
    req.end();
  });
}

function edgeScore(a, b) {
  const aTokens = tokenize(a.text);
  const bTokens = tokenize(b.text);
  let shared = 0;
  for (const token of aTokens) if (bTokens.has(token)) shared += 1;
  return shared;
}

async function buildRetrievalGraph(query, options = {}) {
  const limit = options.limit || config().graphLimit;
  const encoded = encodeURIComponent(query || '');
  const [memoryMatrix, poolMemory, skills, routing] = await Promise.all([
    postJson(envInt('MEMORY_PORT', 7880), '/memory/recall', { query, limit: 8 }),
    requestJson(envInt('POOL_PORT', 7885), `/pool/memory/recall?q=${encoded}`),
    requestJson(envInt('POOL_PORT', 7885), `/pool/skills/search?q=${encoded}&limit=8`),
    requestJson(envInt('POOL_PORT', 7885), `/pool/routing/for-task?q=${encoded}`),
  ]);

  const nodes = [];
  function addNode(kind, label, text, score = 0, meta = {}) {
    const content = String(text || '').trim();
    if (!content) return;
    nodes.push({
      id: `${kind}:${nodes.length + 1}:${hashText(content)}`,
      kind,
      label,
      text: content,
      score,
      tokens: estimateTokens(content),
      meta,
    });
  }

  for (const item of memoryMatrix.body?.results || []) {
    addNode('memory-matrix', item.source || 'memory', item.content || item.text || JSON.stringify(item), Number(item.score || 0.65), item);
  }
  for (const item of poolMemory.body?.results || []) {
    addNode('pool-memory', item.topic || item.agent || 'pool memory', item.content || JSON.stringify(item), 0.55, item);
  }
  for (const item of skills.body?.results || []) {
    addNode('skill', item.name || 'skill', [item.name, item.description, item.summary, (item.keywords || []).join(' ')].filter(Boolean).join(' '), 0.5, item);
  }
  for (const item of routing.body?.hints || []) {
    addNode('routing', item.agent || 'route', [item.agent, item.role, (item.give || []).join(' ')].filter(Boolean).join(' '), Number(item.score || 0.4), item);
  }

  const edges = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const weight = edgeScore(nodes[i], nodes[j]);
      if (weight > 0) edges.push({ from: nodes[i].id, to: nodes[j].id, weight });
    }
  }

  const degree = new Map(nodes.map(node => [node.id, 0]));
  for (const edge of edges) {
    degree.set(edge.from, degree.get(edge.from) + edge.weight);
    degree.set(edge.to, degree.get(edge.to) + edge.weight);
  }

  const rankedNodes = nodes.map(node => ({
    ...node,
    graphScore: Number((node.score + (degree.get(node.id) || 0) / 10).toFixed(3)),
  })).sort((a, b) => b.graphScore - a.graphScore).slice(0, limit);

  return {
    query,
    generatedAt: new Date().toISOString(),
    sources: {
      memoryMatrix: Boolean(memoryMatrix.ok),
      poolMemory: Boolean(poolMemory.ok),
      skills: Boolean(skills.ok),
      routing: Boolean(routing.ok),
    },
    nodes: rankedNodes,
    edges: edges.filter(edge => rankedNodes.find(node => node.id === edge.from) && rankedNodes.find(node => node.id === edge.to)),
    budget: buildContextBudget(rankedNodes.map(node => ({ ...node, score: node.graphScore }))),
  };
}

function exists(rootDir, rel) {
  return fs.existsSync(path.join(rootDir, rel));
}

function stateFrom(ok, partial = false) {
  if (ok && !partial) return 'live';
  if (ok || partial) return 'partial';
  return 'gap';
}

async function status(rootDir, options = {}) {
  const cfg = config();
  const probe = options.probeHealth !== false;
  const [poolHealth, memoryHealth] = probe
    ? await Promise.all([
      requestJson(envInt('POOL_PORT', 7885), '/health'),
      requestJson(envInt('MEMORY_PORT', 7880), '/health'),
    ])
    : [{ ok: null }, { ok: null }];

  const llmStatus = (() => {
    try {
      const llm = require(path.join(rootDir, 'lib', 'llm-provider.js'));
      return llm.getProviderInfo ? llm.getProviderInfo() : null;
    } catch {
      return null;
    }
  })();

  const sections = [
    {
      id: 'graph-rag',
      name: 'Graph RAG',
      state: stateFrom(exists(rootDir, 'lib/memory-client.js') && exists(rootDir, 'pool_service.js') && Boolean(poolHealth.ok || !probe), Boolean(!memoryHealth.ok && probe)),
      detail: 'Retrieval graph uses Memory Matrix, Knowledge Pool memory, skill search, and routing hints.',
    },
    {
      id: 'chunking',
      name: 'Chunking Policy',
      state: 'live',
      detail: `${cfg.chunkTokens} token target, ${cfg.chunkOverlapTokens} token overlap, deterministic content hashes.`,
    },
    {
      id: 'quantization',
      name: 'Quantization',
      state: cfg.quantizationMode === 'unspecified' ? 'gap' : 'live',
      detail: cfg.quantizationMode === 'unspecified'
        ? 'No quantization mode detected. Set PURPCLAW_QUANTIZATION_MODE or use a model name such as q4/q5/q8/int8.'
        : cfg.quantizationMode,
    },
    {
      id: 'guardrails',
      name: 'Guardrails',
      state: stateFrom(exists(rootDir, 'lib/governance.js') && exists(rootDir, 'lib/job-contract.js') && exists(rootDir, 'lib/rate-limit.js')),
      detail: 'Governance, job contract classification, approval holds, and HTTP rate limiting.',
    },
    {
      id: 'inference',
      name: 'Inference Runtime',
      state: stateFrom(Boolean(llmStatus), llmStatus ? !llmStatus.main.hasKey : false),
      detail: llmStatus ? `${llmStatus.main.provider}/${llmStatus.main.model}` : 'LLM provider module unavailable.',
    },
    {
      id: 'kv-cache',
      name: 'KV Cache',
      state: cfg.kvCacheMode === 'provider-managed' ? 'partial' : 'live',
      detail: cfg.kvCacheMode === 'provider-managed'
        ? 'Provider-managed unless the selected backend exposes local KV controls.'
        : cfg.kvCacheMode,
    },
    {
      id: 'context-window',
      name: 'Context Window',
      state: 'live',
      detail: `${cfg.contextWindowTokens} total, ${cfg.responseReserveTokens} reserved for response.`,
    },
    {
      id: 'context-cache',
      name: 'Context Cache',
      state: stateFrom(exists(rootDir, 'lib/memory-client.js') && exists(rootDir, 'lib/context-packet.js')),
      detail: `Memory recall cache plus workflow context packets. TTL ${cfg.contextCacheTtlMs}ms.`,
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    config: cfg,
    services: {
      pool: poolHealth.ok === null ? 'not-probed' : (poolHealth.ok ? 'online' : 'offline'),
      memory: memoryHealth.ok === null ? 'not-probed' : (memoryHealth.ok ? 'online' : 'offline'),
    },
    sections,
    totals: {
      live: sections.filter(section => section.state === 'live').length,
      partial: sections.filter(section => section.state === 'partial').length,
      gap: sections.filter(section => section.state === 'gap').length,
      total: sections.length,
    },
  };
}

module.exports = {
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  DEFAULT_RESPONSE_RESERVE_TOKENS,
  DEFAULT_CHUNK_TOKENS,
  DEFAULT_CHUNK_OVERLAP_TOKENS,
  buildContextBudget,
  buildRetrievalGraph,
  chunkText,
  config,
  estimateTokens,
  status,
};
