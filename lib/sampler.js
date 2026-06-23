'use strict';

/**
 * sampler.js — Sampler-style live metrics engine for PURPCLAW.
 *
 * One shared core for all three surfaces (CLI `purpclaw sample`, the TUI tab, and
 * the Mission Control web lens via /api/sampler). You define shell commands in a
 * YAML config; the engine runs them on a rate, keeps a rolling history, evaluates
 * triggers, and returns normalized series everyone renders the same way.
 *
 * Inspired by github.com/sqshq/sampler — reimplemented natively, wired to the stack.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const YAML = require('yaml');

const HISTORY_CAP = 120;
const _history = new Map(); // key `${title}::${label}` -> number[]

const DEFAULT_CONFIG_PATHS = [
  path.join(__dirname, '..', 'config', 'samplers.yml'),
  path.join(__dirname, '..', 'config', 'samplers.yaml'),
  path.join(__dirname, '..', 'samplers.yml'),
];

function resolveConfigPath(explicit) {
  if (explicit) return explicit;
  return DEFAULT_CONFIG_PATHS.find(p => fs.existsSync(p)) || DEFAULT_CONFIG_PATHS[0];
}

// Normalize the Sampler-style YAML (sparklines/gauges/barcharts/textboxes/runcharts)
// into one flat component list the engine + renderers iterate.
function parseConfig(input) {
  let raw = input;
  if (typeof input === 'string' && !input.includes('\n') && fs.existsSync(input)) {
    raw = fs.readFileSync(input, 'utf8');
  }
  const doc = typeof raw === 'string' ? (YAML.parse(raw) || {}) : (raw || {});
  const vars = doc.variables || {};
  const components = [];
  const push = (type, arr) => (arr || []).forEach((c, i) => components.push({ type, index: i, ...c }));
  push('runchart', doc.runcharts);
  push('sparkline', doc.sparklines);
  push('barchart', doc.barcharts);
  push('gauge', doc.gauges);
  push('textbox', doc.textboxes);
  push('asciibox', doc.asciiboxes);
  return { title: doc.title || 'PURPCLAW Sampler', theme: doc.theme || 'dark', variables: vars, components };
}

function substituteVars(cmd, vars) {
  if (!cmd) return cmd;
  let out = String(cmd);
  for (const [k, v] of Object.entries(vars || {})) out = out.split('$' + k).join(String(v));
  return out;
}

function runSample(cmd, opts = {}) {
  if (!cmd) return { ok: false, raw: '', error: 'no command' };
  try {
    const raw = execSync(cmd, {
      encoding: 'utf8',
      timeout: opts.timeoutMs || 8000,
      windowsHide: true,
      shell: opts.shell || true,
      cwd: opts.cwd || path.join(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return { ok: true, raw };
  } catch (e) {
    return { ok: false, raw: (e.stdout || '').toString().trim(), error: (e.message || 'sample failed').slice(0, 120) };
  }
}

function pushHistory(key, value) {
  if (!Number.isFinite(value)) return _history.get(key) || [];
  const arr = _history.get(key) || [];
  arr.push(value);
  if (arr.length > HISTORY_CAP) arr.shift();
  _history.set(key, arr);
  return arr;
}

function evalTriggers(comp, item) {
  const fired = [];
  for (const trig of comp.triggers || []) {
    try {
      // condition is a shell command that echoes "1" for TRUE; expose $cur/$prev/$label
      const prev = item.history.length > 1 ? item.history[item.history.length - 2] : item.value;
      const env = `cur=${item.value} prev=${prev} label=${JSON.stringify(item.label)}`;
      const r = runSample(`${env} ${trig.condition}`, { timeoutMs: 4000 });
      if (r.ok && r.raw.trim() === '1') fired.push({ title: trig.title, actions: trig.actions || {} });
    } catch {}
  }
  return fired;
}

// Run every component's samples once; update history; return normalized results.
async function sampleAll(config) {
  const cfg = config && config.components ? config : parseConfig(resolveConfigPath());
  const vars = cfg.variables || {};
  const results = [];

  for (const comp of cfg.components) {
    const title = comp.title || `${comp.type}-${comp.index}`;
    // Single-sample components (sparkline/textbox/asciibox) vs multi-item (runchart/barchart) vs gauge (cur/min/max)
    let items = [];
    if (comp.type === 'gauge') {
      const cur = parseFloat(runSample(substituteVars(comp.cur && comp.cur.sample, vars), comp).raw);
      const min = comp.min ? parseFloat(runSample(substituteVars(comp.min.sample, vars), comp).raw) : 0;
      const max = comp.max ? parseFloat(runSample(substituteVars(comp.max.sample, vars), comp).raw) : 100;
      const hist = pushHistory(`${title}::cur`, cur);
      items = [{ label: 'cur', value: cur, min, max, raw: String(cur), history: hist }];
    } else if (Array.isArray(comp.items)) {
      for (const it of comp.items) {
        const r = runSample(substituteVars(it.sample, vars), comp);
        const value = parseFloat(r.raw);
        const hist = pushHistory(`${title}::${it.label}`, value);
        items.push({ label: it.label, value, raw: r.raw, ok: r.ok, error: r.error, history: hist, color: it.color });
      }
    } else {
      const r = runSample(substituteVars(comp.sample, vars), comp);
      const value = parseFloat(r.raw);
      const hist = pushHistory(`${title}::${title}`, value);
      items = [{ label: title, value, raw: r.raw, ok: r.ok, error: r.error, history: hist }];
    }
    const triggers = items.flatMap(it => evalTriggers(comp, it));
    results.push({ type: comp.type, title, scale: comp.scale, color: comp.color, items, triggers });
  }
  return { title: cfg.title, theme: cfg.theme, generatedAt: Date.now(), components: results };
}

// ── Terminal rendering (CLI + TUI reuse) ─────────────────────────────────────
const SPARK = '▁▂▃▄▅▆▇█';
function sparkline(arr) {
  if (!arr || !arr.length) return '';
  const nums = arr.filter(Number.isFinite);
  if (!nums.length) return '';
  const min = Math.min(...nums), max = Math.max(...nums), span = max - min || 1;
  return arr.map(v => Number.isFinite(v) ? SPARK[Math.min(7, Math.floor(((v - min) / span) * 7))] : ' ').join('');
}
function gaugeBar(cur, min, max, width = 24) {
  const pct = Math.max(0, Math.min(1, ((cur - min) / ((max - min) || 1))));
  const fill = Math.round(pct * width);
  return `[${'█'.repeat(fill)}${'░'.repeat(width - fill)}] ${(pct * 100).toFixed(0)}%`;
}

function renderText(snapshot) {
  const lines = [`▟ ${snapshot.title}`, ''];
  for (const c of snapshot.components) {
    if (c.type === 'gauge') {
      const it = c.items[0];
      lines.push(`  ${c.title.padEnd(28)} ${gaugeBar(it.value, it.min, it.max)}  (${Number.isFinite(it.value) ? it.value : '—'})`);
    } else if (c.type === 'textbox' || c.type === 'asciibox') {
      lines.push(`  ${c.title}:`);
      (c.items[0].raw || '').split('\n').slice(0, 6).forEach(l => lines.push(`    ${l}`));
    } else {
      for (const it of c.items) {
        const v = Number.isFinite(it.value) ? it.value : (it.raw || '—');
        lines.push(`  ${(c.title + ' / ' + it.label).slice(0, 30).padEnd(30)} ${sparkline(it.history).slice(-40).padEnd(40)} ${v}`);
      }
    }
    const fired = c.triggers.filter(Boolean);
    fired.forEach(t => lines.push(`  ⚠ TRIGGER: ${t.title}`));
  }
  return lines.join('\n');
}

module.exports = { resolveConfigPath, parseConfig, sampleAll, renderText, sparkline, gaugeBar, runSample };
