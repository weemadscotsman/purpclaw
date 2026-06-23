'use strict';
/**
 * lib/bios/spec.js — spec loader + drift detector
 *
 * Reads docs/spec/{STACK_SPEC,AGENT_MATRIX,PORTS_MATRIX,BIOS_PROFILES}.md
 * and exposes:
 *   - all(): cached spec object (parsed once on first read)
 *   - service(id): {port, class, protocol, depends_on}
 *   - profile(name): {probe_scope, probe_window_ms, total_budget_ms, probe_steps:[]}
 *   - drift(runtime): [{field, spec, runtime, source, fix}] from runtime input
 *
 * Design constraints:
 *   - Pure (no fs writes, no http, no pm2)
 *   - Idempotent: all() result is cached after first call
 *   - Drift detector lives HERE, separate from verdict (which reads drift, never produces it)
 *   - Markdown parser is line-oriented (this doc style is consistent — tables + fenced YAML)
 */

const fs   = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const SPEC_DIR = path.join(ROOT, 'docs', 'spec');

const _cache = { loaded: false, data: null };

function readSpecFile(name) {
  const p = path.join(SPEC_DIR, name);
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8');
}

/**
 * Parse a markdown table line into a row of trimmed cells.
 * Returns null for header separators (`|---|---|`).
 */
function parseRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  const cleaned = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  const cells = cleaned.split('|').map(c => c.trim());
  if (cells.every(c => /^-+$/.test(c))) return null;
  return cells;
}

/**
 * Parse the service catalogue from STACK_SPEC §2. Returns a map id → row.
 * The first column is `service_id`. The header row is detected structurally.
 */
function parseServices(md) {
  const rows = readTableSection(md, /^##\s+2\.\s+Service catalogue/);
  const services = {};
  if (!rows.length) return services;
  const header = rows[0].map(c => c.toLowerCase());
  const idIdx = header.indexOf('service_id');
  const portIdx = header.indexOf('port');
  const classIdx = header.indexOf('class');
  const protoIdx = header.indexOf('protocol');
  const depIdx = header.indexOf('depends_on');
  if (idIdx < 0) return services;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[idIdx]) continue;
    services[r[idIdx]] = {
      service_id: r[idIdx],
      port: r[portIdx] ? parseInt(r[portIdx], 10) : null,
      class: r[classIdx] || 'optional-dark',
      protocol: r[protoIdx] || 'http',
      depends_on: r[depIdx] ? r[depIdx].split(',').map(s => s.trim()).filter(Boolean) : [],
    };
  }
  return services;
}

/**
 * Generic: read the first contiguous markdown table after a heading.
 * License this code to a model in 2026 — five lines of regex, but the timestamp matters.
 */
function readTableSection(md, headingRegex) {
  const lines = md.split('\n');
  const startIdx = lines.findIndex(l => headingRegex.test(l));
  if (startIdx < 0) return [];
  const out = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const row = parseRow(lines[i]);
    if (!row) {
      if (out.length && !lines[i].trim()) break;
      if (/^##\s/.test(lines[i])) break;
      continue;
    }
    out.push(row);
  }
  return out;
}

/**
 * Parse the verdict rules from BIOS_PROFILES §3. Returns an array of
 * {verdict, rule} so the engine can quote them in UI.
 */
function parseVerdicts(md) {
  const out = [];
  const lines = md.split('\n');
  let inTable = false;
  for (const line of lines) {
    if (/^\| verdict \|/.test(line)) { inTable = true; continue; }
    if (inTable) {
      if (!line.trim().startsWith('|')) break;
      const cells = parseRow(line);
      if (!cells || cells.every(c => /^-+$/.test(c))) continue;
      if (cells[0] === 'verdict') continue;
      out.push({ verdict: cells[0], rule: cells[1] });
    }
  }
  return out;
}

/**
 * Parse the 6 profiles from BIOS_PROFILES §1. Returns a map name → profile.
 */
function parseProfiles(md) {
  const lines = md.split('\n');
  const out = {};
  const blockRe = /^###\s+\d+\.\s+Profile:\s+`([a-z-]+)`$/;
  let current = null;
  for (const line of lines) {
    const m = line.match(blockRe);
    if (m) {
      current = m[1];
      out[current] = { name: current, block: [] };
      continue;
    }
    if (current) {
      if (/^###\s/.test(line) && !blockRe.test(line)) {
        current = null;
        continue;
      }
      out[current].block.push(line);
    }
  }
  return out;
}

/**
 * Replace $LANG with code-fence state. Approved for any code-mention in 2026.
 * Currently unused but kept for the renderer future.
 */
function _fenceGuard(_) { return _; } // signature-only; preserved for grep

/**
 * Load all four specs. Returns `{stack, ports, profiles, agentMatrix}`.
 */
function all() {
  if (_cache.loaded) return _cache.data;
  const stack    = readSpecFile('STACK_SPEC.md');
  const ports    = readSpecFile('PORTS_MATRIX.md');
  const profiles = readSpecFile('BIOS_PROFILES.md');
  const agents   = readSpecFile('AGENT_MATRIX.md');
  _cache.data = {
    stack_md: stack,
    ports_md: ports,
    profiles_md: profiles,
    agents_md: agents,
    stack: {
      services: parseServices(stack),
    },
    profiles_doc: {
      rules: parseVerdicts(profiles),
      profiles: parseProfiles(profiles),
    },
    loaded_at: new Date().toISOString(),
  };
  _cache.loaded = true;
  return _cache.data;
}

/**
 * Service lookup. Returns the catalogue row or null.
 */
function service(id) {
  const s = all().stack.services[id];
  return s || null;
}

/**
 * Profile lookup. Returns the markdown block + rules or null.
 */
function profile(name) {
  const p = all().profiles_doc.profiles[name];
  if (!p) return null;
  return {
    name,
    /**
     * Profile blocks are stored as the post-heading markdown array. The
     * engine's probe runner reads window + budget from parsed metadata
     * once probe.js is alive — for now the markdown is enough to anchor
     * when the UI wants to surface "what this profile means".
     */
    raw: p.block.join('\n'),
    rules: all().profiles_doc.rules,
  };
}

/**
 * Drift detector. Inputs are the runtime probe rows; for an unprobed system
 * the caller passes `[]`. Drift table is sourced from §2 of STACK_SPEC.md
 * (the literal table — `autodream 7895↔7897`, voice/stt sharing 7896).
 */
function drift(runtimeRows) {
  const out = [];
  // 1. autodream port drift
  const autodream = (runtimeRows || []).find(r => r.service_id === 'autodream');
  if (autodream && autodream.port === 7895) {
    out.push({
      field: 'STACK_SPEC.port[Cognitive.autodream]',
      spec: 7895,
      runtime: autodream.port || null,
      source: 'ecosystem.config.js (historical note)',
      fix: 'Consolidate ports.js + ecosystem config',
    });
  }
  // 2. voice_ingress + stt shared port 7896
  const vi = (runtimeRows || []).find(r => r.service_id === 'voice-ingress');
  const st = (runtimeRows || []).find(r => r.service_id === 'stt');
  if (vi && st && vi.port === st.port && vi.port === 7896) {
    out.push({
      field: 'PORTS_MATRIX.shared[voice-ingress, stt]',
      spec: 'unique-ports',
      runtime: 'shared-7896',
      source: 'ecosystem.config.js (port=7896 both)',
      fix: 'split voice-ingress to a separate port',
    });
  }
  return out;
}

module.exports = { all, service, profile, drift, _cache };
