'use strict';
/**
 * lib/audit/contracts/index.js
 * Contract auditor entry point. Pure-text analysis, no live require()s —
 * the auditor must not recurse into a broken module graph.
 *
 * Each category module exports an `async function scan(rootDir, ctx) -> Finding[]`.
 * The orchestrator collects findings, classifies severity, and the reporter
 * writes JSON + Markdown.
 */

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  'node_modules', '.next', '.omnicode', '.archive', '.purpclaw',
  '.claude', '.github', '.kiro', '__pycache__', '.git',
  'dist', 'build', 'coverage', 'reports', '_scratch', '.next-cache',
  'Samantha\'s Daily Log', 'TASKS', 'trip_logs',
]);

function walk(rootDir, opts = {}) {
  const exts = new Set(opts.exts || ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py']);
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.' && e.name !== '..' && SKIP_DIRS.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push(p);
      } else if (e.isFile()) {
        if (exts.has(path.extname(e.name))) out.push(p);
      }
    }
  }
  return out;
}

const categories = [
  { id: 'js',         mod: require('./js-contracts.js') },
  { id: 'python',     mod: require('./python-contracts.js') },
  { id: 'tool',       mod: require('./tool-contracts.js') },
  { id: 'route',      mod: require('./route-contracts.js') },
  { id: 'orphan',     mod: require('./orphan-contracts.js') },
  { id: 'docs',       mod: require('./docs-contracts.js') },
  { id: 'dependency', mod: require('./dependency-contracts.js') },
  { id: 'false-success',    mod: require('./false-success-contracts.js') },
  { id: 'silent-degrade',   mod: require('./silent-degrade-contracts.js') },
  { id: 'surface-parity',   mod: require('./surface-parity-contracts.js') },
];

async function audit(rootDir, opts = {}) {
  const startedAt = new Date().toISOString();
  const files = walk(rootDir);
  const ctx = {
    rootDir,
    files,
    packageJson: safeRead(path.join(rootDir, 'package.json'), 'json'),
    requirements: readAllRequirements(rootDir),
    filesByRelPath: indexByRel(rootDir, files),
    options: opts,
  };

  const findings = [];
  for (const cat of categories) {
    try {
      const list = await cat.mod.scan(ctx);
      for (const f of (list || [])) {
        if (!f.category) f.category = cat.id;
        if (!f.severity) f.severity = 'medium';
        if (!f.id) f.id = `${cat.id}:${findings.length + 1}`;
        findings.push(f);
      }
    } catch (e) {
      findings.push({
        id: `${cat.id}:scanner-error`,
        category: cat.id,
        severity: 'info',
        title: `Scanner ${cat.id} crashed`,
        detail: String(e && e.stack || e),
        file: cat.mod && cat.mod.__filename,
      });
    }
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    rootDir,
    scannedFiles: files.length,
    findings,
    summary: summarize(findings),
  };
}

function safeRead(p, kind) {
  try {
    const raw = fs.readFileSync(p, 'utf8');
    if (kind === 'json') return JSON.parse(raw);
    return raw;
  } catch { return null; }
}

function readAllRequirements(rootDir) {
  const out = { declared: new Map(), files: [] }; // name -> source-file
  const candidates = [
    'requirements.txt', 'requirements.spine.txt', 'requirements.skills.txt',
    'requirements.skills.ml.txt', 'requirements.skills.media.txt',
    'requirements.skills.crypto.txt', 'requirements.skills.web.txt',
  ];
  for (const rel of candidates) {
    const p = path.join(rootDir, rel);
    if (!fs.existsSync(p)) continue;
    const lines = safeRead(p, 'text') || '';
    out.files.push(rel);
    for (let ln of lines.split('\n')) {
      ln = ln.replace(/^\s*#.*$/, '').trim();
      if (!ln) continue;
      // strip extras, take the package name before any version specifier / extras / @ url
      const m = ln.match(/^([A-Za-z0-9_.\-]+)/);
      if (m) {
        const name = canonicalName(m[1].toLowerCase());
        if (!out.declared.has(name)) out.declared.set(name, rel);
      }
    }
  }
  // also gather npm packages
  if (out.pkg === undefined) {
    out.pkg = safeRead(path.join(rootDir, 'package.json'), 'json');
    if (out.pkg) {
      const add = (section) => {
        const obj = out.pkg[section] || {};
        for (const k of Object.keys(obj)) {
          const name = canonicalName(k.toLowerCase());
          if (!out.declared.has(name)) out.declared.set(name, `package.json#${section}`);
        }
      };
      add('dependencies'); add('devDependencies'); add('optionalDependencies'); add('peerDependencies');
    }
  }
  return out;
}

function canonicalName(n) {
  // Python pkg "PyYAML" -> "pyyaml"; npm already lower.
  return n.toLowerCase().replace(/[-_]+/g, '-');
}

function indexByRel(rootDir, files) {
  const out = new Map();
  for (const f of files) out.set(path.relative(rootDir, f).replace(/\\/g, '/'), f);
  return out;
}

function summarize(findings) {
  const s = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: findings.length };
  for (const f of findings) s[f.severity] = (s[f.severity] || 0) + 1;
  return s;
}

module.exports = { audit, walk, SKIP_DIRS };
