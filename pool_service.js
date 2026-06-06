'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.POOL_PORT || '7885', 10);  // Pool service — open knowledge layer
const PURP_DIR = path.dirname(__filename).replace(/\\/g, '/');
const SKILLS_DIR = path.join(PURP_DIR, 'skills');
const AGENTS_DIR = path.join(PURP_DIR, 'agents');
const POOL_DATA       = path.join(PURP_DIR, 'agent_work', 'pool');
const POOL_INDEX_FILE = path.join(POOL_DATA, 'index.json');
const QUERY_LOG_FILE  = path.join(POOL_DATA, 'queries.jsonl');
const MEMORY_FILE     = path.join(POOL_DATA, 'memory.jsonl');
const FAILURES_FILE   = path.join(POOL_DATA, 'failures.jsonl');

function countLines(file) {
  try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).length; }
  catch { return 0; }
}

function readJsonl(file) {
  try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); }
  catch { return []; }
}

// ── In-memory indexes ─────────────────────────────────────────────────────────
let skillsIndex = [];
let agentsIndex = [];
let poolMeta = { indexedAt: null, skillsCount: 0, agentsCount: 0 };

// ── Index loading (from pre-built .pool_index.json) ───────────────────────────

function tokenize(text) {
  const s = String(text || '').toLowerCase();
  const words = s.match(/[a-z][a-z0-9_-]{3,20}/g) || [];
  const noise = new Set(['when','this','that','with','from','have','their','there','will','would',
    'should','could','been','being','has','not','and','the','for','are','but','not',
    'using','used','through','each','every','also','more','most','some','what','where',
    'while','without','your','they','them','than','then','only','just','even','still',
    'already','very','much','such','first','last','next','after','before','other','into',
    'over','under','above','below','between','within','across','throughout','system']);
  return new Set(words.filter(w => !noise.has(w)));
}

function search(text, limit = 10) {
  const query = tokenize(text);
  if (!query.size) return [];
  const scored = [];
  for (const item of [...skillsIndex, ...agentsIndex]) {
    let overlap = 0;
    for (const token of query) {
      if (item.keywords.has(token)) overlap++;
    }
    if (overlap > 0) {
      const nameTokens = tokenize(item.name);
      const exactBoost = [...query].some(t => nameTokens.has(t)) ? 1.5 : 1.0;
      scored.push({ score: overlap * exactBoost, item });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ item, score }) => {
    const { keywords, ...rest } = item;
    return { ...rest, score: Math.round(score * 100) / 100 };
  });
}

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) out[line.substring(0, i).trim()] = line.substring(i + 1).trim();
  }
  return out;
}

function scanSkills() {
  const out = [];
  if (!fs.existsSync(SKILLS_DIR)) return out;
  for (const item of fs.readdirSync(SKILLS_DIR)) {
    const full = path.join(SKILLS_DIR, item);
    let file = null;
    try {
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        file = path.join(full, 'SKILL.md');
        if (!fs.existsSync(file)) continue;
      } else if (item.endsWith('.md')) {
        file = full;
      } else continue;
      const content = fs.readFileSync(file, 'utf8');
      const fm = parseFrontmatter(content);
      const name = fm.name || item.replace(/\.md$/, '');
      out.push({
        name,
        description: fm.description || '',
        origin: fm.origin || '',
        type: 'skill',
        file,
        keywords: tokenize(`${name} ${fm.description || ''}`),
      });
    } catch { /* skip bad entries */ }
  }
  return out;
}

function scanAgents() {
  const out = [];
  if (!fs.existsSync(AGENTS_DIR)) return out;
  for (const item of fs.readdirSync(AGENTS_DIR)) {
    if (!item.endsWith('.md')) continue;
    const file = path.join(AGENTS_DIR, item);
    try {
      const content = fs.readFileSync(file, 'utf8');
      const fm = parseFrontmatter(content);
      const name = fm.name || item.replace(/\.md$/, '');
      out.push({
        name,
        description: fm.description || '',
        tools: fm.tools || '',
        model: fm.model || '',
        type: 'agent_profile',
        file,
        keywords: tokenize(`${name} ${fm.description || ''}`),
      });
    } catch { /* skip bad entries */ }
  }
  return out;
}

let routingIndex = {};  // { animal: { give, needs, avoid, division, role } }
let intentMap    = {};  // intent → [agents]
let teamTemplates = {};

function loadRoutingMatrix() {
  try {
    const p = path.join(PURP_DIR, 'agent_routing_matrix.js');
    delete require.cache[require.resolve(p)];
    const mod = require(p);
    routingIndex  = mod.AGENT_ROUTING   || {};
    intentMap     = mod.INTENT_AGENT_MAP || {};
    teamTemplates = mod.TEAM_TEMPLATES   || {};
  } catch (e) {
    routingIndex = {}; intentMap = {}; teamTemplates = {};
    console.log('[POOL] routing matrix load failed:', e.message);
  }
}

function rebuildIndex() {
  skillsIndex = scanSkills();
  agentsIndex = scanAgents();
  loadRoutingMatrix();
  poolMeta = {
    indexedAt: new Date().toISOString(),
    skillsCount: skillsIndex.length,
    agentsCount: agentsIndex.length,
    routingProfiles: Object.keys(routingIndex).length,
  };
  // Persist snapshot
  try {
    fs.mkdirSync(path.dirname(POOL_INDEX_FILE), { recursive: true });
    fs.writeFileSync(POOL_INDEX_FILE, JSON.stringify({
      poolMeta,
      skillsIndex: skillsIndex.map(s => ({ ...s, keywords: [...s.keywords] })),
      agentsIndex: agentsIndex.map(a => ({ ...a, keywords: [...a.keywords] })),
    }, null, 2), 'utf8');
  } catch (e) {
    console.log('[POOL] snapshot write failed:', e.message);
  }
}

function loadIndex() {
  if (fs.existsSync(POOL_INDEX_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(POOL_INDEX_FILE, 'utf8'));
      skillsIndex = (data.skillsIndex || []).map(s => ({ ...s, keywords: new Set(s.keywords || []) }));
      agentsIndex = (data.agentsIndex || []).map(a => ({ ...a, keywords: new Set(a.keywords || []) }));
      poolMeta = data.poolMeta || poolMeta;
      // Schedule a background rebuild to catch new/changed skills
      setImmediate(() => rebuildIndex());
      return;
    } catch (e) {
      console.log('[POOL] snapshot load failed, rebuilding from disk:', e.message);
    }
  }
  // No usable snapshot — scan disk
  rebuildIndex();
}

function appendEntry(type, entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), type, ...entry });
  fs.appendFileSync(QUERY_LOG_FILE, line + '\n', 'utf8');
}

// ── HTTP server ───────────────────────────────────────────────────────────────

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data, null, 2));
}

function parseQuery(url) {
  const idx = url.indexOf('?');
  if (idx < 0) return { path: url, query: {} };
  const q = {};
  for (const pair of url.slice(idx + 1).split('&')) {
    const eq = pair.indexOf('=');
    if (eq > 0) {
      const k = decodeURIComponent(pair.slice(0, eq));
      const v = decodeURIComponent(pair.slice(eq + 1) || '');
      q[k] = v;
    }
  }
  return { path: url.slice(0, idx), query: q };
}

const ROUTES = {
  'GET /pool/skills/search': (query) => {
    const q = query.q || '';
    const limit = Math.min(parseInt(query.limit || '10', 10), 50);
    const results = search(q, limit);
    return { query: q, limit, count: results.length, results };
  },
  'GET /pool/skills/<name>': (query, params) => {
    const name = params[0];
    const item = [...skillsIndex, ...agentsIndex].find(
      s => s.name === name || s.name === name.replace(/-/g, '_')
    );
    if (!item) return { error: 'Skill not found', name };
    const { keywords, ...rest } = item;
    // Load full file content
    let content = '';
    if (item.file) {
      // item.file is already an absolute path — use it directly
      try { content = fs.readFileSync(item.file, 'utf8').slice(0, 4000); } catch {
        // fallback: try relative to PURP_DIR
        try { content = fs.readFileSync(path.join(PURP_DIR, item.file), 'utf8').slice(0, 4000); } catch {
          content = '';
        }
      }
    }
    return { ...rest, content, found: true };
  },
  'GET /pool/agents/search': (query) => {
    const q = query.q || '';
    const limit = Math.min(parseInt(query.limit || '10', 10), 50);
    const results = search(q, limit).filter(r => r.type === 'agent_profile');
    return { query: q, limit, count: results.length, results };
  },
  'GET /pool/routing/for-task': (query) => {
    const task = query.text || query.task || query.q || '';
    const qTokens = tokenize(task);
    const hints = [];
    for (const [agent, profile] of Object.entries(routingIndex)) {
      const giveText = (profile.give || []).join(' ').toLowerCase();
      let score = 0;
      for (const t of qTokens) if (giveText.includes(t)) score++;
      // Also check the role text as a softer match
      const roleText = (profile.role || '').toLowerCase();
      for (const t of qTokens) if (roleText.includes(t)) score += 0.5;
      if (score > 0) {
        hints.push({
          agent, division: profile.division, role: profile.role,
          give: profile.give || [], needs: profile.needs || [], avoid: profile.avoid || [],
          score
        });
      }
    }
    hints.sort((a, b) => b.score - a.score);
    return { task, count: Object.keys(routingIndex).length, hints: hints.slice(0, 5) };
  },
  'GET /pool/routing/agent/<name>': (query, params) => {
    const name = params[0];
    const profile = routingIndex[name];
    if (!profile) return { error: 'agent profile not found', name };
    return { agent: name, ...profile };
  },
  'GET /pool/stats': () => ({
    ...poolMeta,
    memories: countLines(MEMORY_FILE),
    failures: countLines(FAILURES_FILE),
    queries:  countLines(QUERY_LOG_FILE),
    uptimeSec: Math.round(process.uptime()),
  }),
  'GET /pool/health': () => ({ status: 'healthy', uptime: Math.floor(process.uptime()) }),
  'GET /health':      () => ({ status: 'healthy', service: 'pool', port: PORT, indexedAt: poolMeta.indexedAt }),
  'POST /pool/reindex': () => {
    rebuildIndex();
    return {
      ok: true,
      skillsCount: skillsIndex.length,
      agentsCount: agentsIndex.length,
      indexedAt: poolMeta.indexedAt,
      uptime: Math.floor(process.uptime())
    };
  },
  'GET /pool/recent': (query) => {
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    if (!fs.existsSync(QUERY_LOG_FILE)) return { entries: [], count: 0 };
    const lines = fs.readFileSync(QUERY_LOG_FILE, 'utf8').split('\n').filter(Boolean);
    const recent = lines.slice(-limit).reverse().map(l => { try { return JSON.parse(l); } catch { return {}; } });
    return { count: recent.length, entries: recent };
  },
  'POST /pool/memory/append': (query, params, body) => {
    if (!body || !body.content) return { error: 'content required' };
    const entry = { ts: new Date().toISOString(), content: body.content, topic: body.topic || 'general', agent: body.agent || 'unknown', keywords: body.keywords || [] };
    fs.mkdirSync(POOL_DATA, { recursive: true });
    fs.appendFileSync(MEMORY_FILE, JSON.stringify(entry) + '\n', 'utf8');
    return { ok: true, entry };
  },
  'GET /pool/memory/recall': (query) => {
    const q = query.q || '';
    const qTokens = tokenize(q);
    if (!qTokens.size) return { query: q, results: [] };
    const entries = readJsonl(MEMORY_FILE);
    const scored = entries.map(e => {
      const text = `${e.content || ''} ${e.topic || ''} ${(e.keywords || []).join(' ')}`.toLowerCase();
      let s = 0;
      for (const t of qTokens) if (text.includes(t)) s++;
      return { e, s };
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 10);
    return { query: q, count: entries.length, results: scored.map(x => x.e) };
  },
  'POST /pool/failures/record': (query, params, body) => {
    if (!body || !body.failure) return { error: 'failure description required' };
    const entry = { ts: new Date().toISOString(), failure: body.failure, context: body.context || '', resolution: body.resolution || '', agent: body.agent || 'unknown' };
    fs.mkdirSync(POOL_DATA, { recursive: true });
    fs.appendFileSync(FAILURES_FILE, JSON.stringify(entry) + '\n', 'utf8');
    return { ok: true, entry };
  },
  'GET /pool/failures/similar': (query) => {
    const q = query.q || '';
    const qTokens = tokenize(q);
    if (!qTokens.size) return { query: q, results: [] };
    const entries = readJsonl(FAILURES_FILE);
    const scored = entries.map(e => {
      const text = `${e.failure || ''} ${e.context || ''} ${e.resolution || ''}`.toLowerCase();
      let s = 0;
      for (const t of qTokens) if (text.includes(t)) s++;
      return { e, s };
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 5);
    return { query: q, count: entries.length, results: scored.map(x => x.e) };
  },
};

function route(method, path, query, body) {
  const routes = Object.keys(ROUTES).filter(k => k.startsWith(method + ' '));
  if (ROUTES[method + ' ' + path]) return ROUTES[method + ' ' + path](query, [], body);
  for (const r of routes) {
    const pattern = r.replace(/<\w+>/g, '([^/]+)').replace(/^.*?\s/, '');
    const regex = new RegExp('^' + pattern + '$');
    const match = path.match(regex);
    if (match) return ROUTES[r](query, match.slice(1), body);
  }
  return { error: 'Not found', path, method };
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }
  const { path: p, query } = parseQuery(req.url);
  const cleanPath = p.replace(/\/+$/, '') || '/';
  if (cleanPath.startsWith('/pool')) appendEntry('query', { path: cleanPath, method: req.method });
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    let parsedBody = {};
    try { if (body) parsedBody = JSON.parse(body); } catch {}
    const result = route(req.method, cleanPath, query, parsedBody);
    sendJson(res, result.error ? 404 : 200, result);
  });
  req.on('error', e => { sendJson(res, 500, { error: e.message }); });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
loadIndex();
server.listen(PORT, '0.0.0.0', () => {
  console.log('[POOL] Knowledge pool online on :' + PORT);
  console.log('[POOL] ' + poolMeta.skillsCount + ' skills, ' + poolMeta.agentsCount + ' agents indexed');
});
server.on('error', e => { console.error('[POOL] Server error:', e.message); process.exit(1); });