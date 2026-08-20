'use strict';
/**
 * lib/views.js — read-only projections over canonical state.
 *
 * The architectural rule this file exists to obey: ONE canonical truth, many
 * views. Nothing here keeps its own store. Tools come from the tool registry,
 * permissions from the permission manager, memory from the durable layers on
 * disk, recognition from the déjà vu index. If a number here disagrees with the
 * runtime, the runtime is right and this file has a bug.
 *
 * That is the whole point: these pages must not become a second inventory that
 * drifts until the UI says 482 tools, the API says 501 and the README says 738.
 */
const fs = require('fs');
const path = require('path');

const ENVELOPE = require('./mission-envelope');
const PERMS = require('./permission-manager');

const ROOT = path.resolve(__dirname, '..');
const DATA = process.env.PURPCLAW_DATA || path.join(ROOT, '.purpclaw');
const MEM_DIR = path.join(DATA, 'memory');

/** Bucket a tool by name so the registry is browsable. */
function categorise(name) {
  const n = name.toLowerCase();
  if (/^mcp__|_mcp$/.test(n))                                   return 'mcp';
  if (/^skill_/.test(n))                                        return 'skills';
  if (/browser|web|curl|wget|http|url|crawl|scrape/.test(n))    return 'browser & web';
  if (/read|write|edit|ls|find|grep|glob|tree|du|mkdir|copy|move|delete|file|dir/.test(n)) return 'filesystem';
  if (/shell|bash|terminal|exec|process|task|svc|service|kill/.test(n)) return 'shell & process';
  if (/cpu|memory|disk|drive|sensor|uptime|osinfo|systeminfo|window|clipboard|power|volume|notify/.test(n)) return 'hardware & os';
  if (/net|ping|dns|port|ifconfig|host|socket/.test(n))         return 'network';
  if (/git|repo|commit|branch|diff/.test(n))                    return 'git';
  if (/agent|spawn|swarm|delegate|division/.test(n))            return 'agents';
  if (/memory|recall|remember|dejavu|atom/.test(n))             return 'memory';
  return 'other';
}

/**
 * The Tools truth surface. For every registered tool, what it is and what each
 * rung of the access dial would actually do with it — computed live from the
 * same evaluator the dispatcher uses, never a hand-maintained table.
 */
function tools(registry) {
  const list = registry.list();
  const rungs = Object.keys(ENVELOPE.ACCESS);
  const profiles = Object.fromEntries(rungs.map(r => [r, ENVELOPE.permissionProfile({ access: r })]));

  const items = list.map(t => {
    const access = {};
    for (const r of rungs) access[r] = PERMS.evaluate(profiles[r], t.name).action;
    return {
      name: t.name,
      description: t.description || '',
      category: categorise(t.name),
      // A tool with no schema is callable but undiscoverable to the model.
      hasSchema: !!(t.inputSchema && t.inputSchema.properties && Object.keys(t.inputSchema.properties).length),
      access,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const byCategory = {};
  for (const i of items) byCategory[i.category] = (byCategory[i.category] || 0) + 1;

  const summary = { registered: items.length, categories: byCategory, missingSchema: items.filter(i => !i.hasSchema).length };
  for (const r of rungs) {
    // ask and defer are NOT the same thing and must not be added together:
    // 'ask' parks the turn for a human, 'defer' hands off to governance and
    // proceeds. Merging them made Agent Actions look like it prompts for 167
    // tools when it actually prompts for the irreversible ones only.
    summary[r] = {
      allowed:  items.filter(i => i.access[r] === 'allow').length,
      prompts:  items.filter(i => i.access[r] === 'ask').length,
      governed: items.filter(i => i.access[r] === 'defer').length,
      denied:   items.filter(i => i.access[r] === 'deny').length,
    };
  }
  return { ok: true, summary, tools: items };
}

function readJsonl(file, limit = 0) {
  try {
    const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return limit ? rows.slice(-limit) : rows;
  } catch { return []; }
}

/** Every durable layer present on disk, with its real size. */
function layers() {
  let files = [];
  try { files = fs.readdirSync(MEM_DIR).filter(f => f.endsWith('.jsonl')); } catch {}
  return files.map(f => {
    const full = path.join(MEM_DIR, f);
    const rows = readJsonl(full);
    let newest = null;
    for (const r of rows) { const t = r.at || r.ts || r.timestamp; if (t && (!newest || t > newest)) newest = t; }
    return { layer: path.basename(f, '.jsonl'), atoms: rows.length,
             bytes: (() => { try { return fs.statSync(full).size; } catch { return 0; } })(), newest };
  }).sort((a, b) => b.atoms - a.atoms);
}

/**
 * The Memory Vault: searchable history across every layer at once, so a
 * question can be answered from lived history rather than from five chunks
 * that happened to embed similarly.
 */
function memoryVault({ query = '', layer = null, limit = 50 } = {}) {
  const ls = layers();
  const terms = String(query).toLowerCase().split(/\s+/).filter(w => w.length > 2);
  let hits = [];

  for (const l of ls) {
    if (layer && l.layer !== layer) continue;
    if (l.layer === 'dejavu-index') continue;            // surfaced separately
    for (const row of readJsonl(path.join(MEM_DIR, l.layer + '.jsonl'))) {
      const text = typeof row.content === 'string' ? row.content
                 : (row.content && row.content.text) || row.text || JSON.stringify(row.content || row);
      if (terms.length) {
        const hay = String(text).toLowerCase();
        const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
        if (!score) continue;
        hits.push({ layer: l.layer, at: row.at || row.ts || null, score, text: String(text).slice(0, 600), source: row.source || null });
      } else {
        hits.push({ layer: l.layer, at: row.at || row.ts || null, score: 0, text: String(text).slice(0, 600), source: row.source || null });
      }
    }
  }
  // Best match first when searching; newest first when browsing.
  hits.sort((a, b) => (b.score - a.score) || String(b.at || '').localeCompare(String(a.at || '')));

  let dejavu = { traces: 0 };
  try { dejavu = require('./dejavu').stats(); } catch {}

  return {
    ok: true,
    totals: { atoms: ls.reduce((s, l) => s + l.atoms, 0), layers: ls.length, traces: dejavu.traces || 0,
              verifiedTraces: dejavu.verified || 0 },
    layers: ls, query, matched: hits.length, results: hits.slice(0, limit),
  };
}

/**
 * Missions derived from the episodic layer. Deliberately NOT a new mission
 * database — if it had one, it would immediately disagree with memory.
 */
function missions({ limit = 40 } = {}) {
  // Prefer the durable ledger. Deriving missions from episodic memory was a
  // stopgap while nothing survived a restart; it can only ever reconstruct a
  // title and a turn count, never the envelope, tool calls or approvals.
  try {
    const L = require('./missions').list({ limit });
    if (L.missions.length) return { ...L, source: 'mission-ledger' };
  } catch {}

  const rows = readJsonl(path.join(MEM_DIR, 'episodic.jsonl'));
  const bySession = new Map();
  for (const r of rows) {
    const id = (r.scope && r.scope.session) || r.session || 'unscoped';
    const e = bySession.get(id) || { session: id, turns: 0, first: null, last: null, title: null };
    e.turns++;
    const at = r.at || r.ts || null;
    if (at) { if (!e.first || at < e.first) e.first = at; if (!e.last || at > e.last) e.last = at; }
    if (!e.title) {
      const text = typeof r.content === 'string' ? r.content : (r.content && r.content.text) || '';
      if (text) e.title = String(text).replace(/\s+/g, ' ').slice(0, 80);
    }
    bySession.set(id, e);
  }
  const list = [...bySession.values()].sort((a, b) => String(b.last || '').localeCompare(String(a.last || '')));
  return { ok: true, count: list.length, missions: list.slice(0, limit), source: 'episodic-fallback',
           note: 'no durable missions recorded yet — reconstructed from the episodic memory layer' };
}

/**
 * Skills: what PurpClaw knows how to accomplish, as opposed to what it can
 * physically execute (that is Tools).
 *
 * The registry's own scan drops any skill without a runnable script, which hid
 * most of them. A SKILL.md with no script is still a skill — it is procedure
 * the agent can follow — it just is not a callable tool. Both are shown, and
 * which is which is stated rather than blurred.
 */
function skills(registry) {
  const dir = path.join(ROOT, 'skills');
  let entries = [];
  // Skip dotfile directories — .hub and .curator_reports are bookkeeping, not
  // skills, and counting them inflates the registry.
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'));
  } catch {}

  const registered = new Set(registry.list().map(t => t.name).filter(n => n.startsWith('skill_')));
  const toolName = n => 'skill_' + n.replace(/[^a-zA-Z0-9_]/g, '_');

  const hasScript = (p, depth = 0) => {
    if (depth > 3) return null;
    let items = [];
    try { items = fs.readdirSync(p, { withFileTypes: true }); } catch { return null; }
    for (const it of items) {
      const full = path.join(p, it.name);
      if (it.isFile() && /\.(sh|py|js)$/.test(it.name)) return full;
      if (it.isDirectory() && it.name !== 'node_modules' && !it.name.startsWith('.')) {
        const found = hasScript(full, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };

  const items = entries.map(e => {
    const p = path.join(dir, e.name);
    const md = path.join(p, 'SKILL.md');
    let description = '', requires = [];
    try {
      const c = fs.readFileSync(md, 'utf8');
      // Frontmatter description, quoted or bare — the registry only matched the
      // quoted form, so most descriptions came back empty.
      const m = c.match(/^description:\s*["']?(.+?)["']?\s*$/m)
             || c.match(/^#\s+(.+)$/m);
      if (m) description = m[1].trim();
      const r = c.match(/^requires:\s*\[([^\]]+)\]/m);
      if (r) requires = r[1].split(',').map(s => s.trim()).filter(Boolean);
    } catch {}
    const script = hasScript(p);
    return {
      name: e.name,
      description: description.slice(0, 200),
      kind: script ? 'executable' : 'knowledge',
      script: script ? path.relative(ROOT, script) : null,
      hasDoc: fs.existsSync(md),
      requires,
      callableAs: registered.has(toolName(e.name)) ? toolName(e.name) : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const exec = items.filter(i => i.kind === 'executable');
  return {
    ok: true,
    summary: {
      onDisk: items.length,
      executable: exec.length,
      knowledge: items.filter(i => i.kind === 'knowledge').length,
      callable: items.filter(i => i.callableAs).length,
      // An executable skill that never registered is capability the agent
      // cannot reach — worth naming rather than quietly losing.
      unregistered: exec.filter(i => !i.callableAs).length,
      undocumented: items.filter(i => !i.hasDoc).length,
    },
    skills: items,
  };
}

module.exports = { tools, memoryVault, missions, layers, categorise, skills };
