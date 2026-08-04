'use strict';

/**
 * packages/context-spine — Unified Context Loading
 * ===============================================
 * Single interface every harness adapter uses to load context.
 * Every context item includes: source, path, timestamp, confidence.
 *
 * From PURPCLAW_AGENT_HARNESS_PARITY_BLUEPRINT.md §2.3
 *
 * Responsibilities:
 *   - Repo file search
 *   - Exact file read with provenance
 *   - Truth-document loading (AGENT.md, docs/, *.spec.md)
 *   - Prior task memory loading
 *   - Project metadata loading
 *   - Recent git history
 *   - Tool availability snapshot
 *   - Context budget controls
 *   - Context provenance on every item
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Provenance helpers ────────────────────────────────────────────────────────

/**
 * Wrap any context item with standard provenance fields.
 * @param {string} source  — 'file'|'memory'|'git'|'env'|'tool'
 * @param {string} label   — human-readable description
 * @param {*} data        — the actual context payload
 * @param {Object} [meta]  — additional metadata
 * @returns {ContextItem}
 */
function provenance(source, label, data, meta = {}) {
  return {
    source,
    label,
    data,
    confidence: meta.confidence || 'high',
    path:       meta.path       || null,
    timestamp:  new Date().toISOString(),
    ...meta,
  };
}

// ── File utilities ────────────────────────────────────────────────────────────

/**
 * Read a file with provenance. Returns null if absent.
 * @param {string} filePath
 * @returns {ContextItem|null}
 */
function readFile(filePath) {
  try {
    const abs = path.resolve(filePath);
    const stat = fs.statSync(abs);
    const content = fs.readFileSync(abs, 'utf8');
    return provenance('file', `file://${abs}`, content, {
      path:      abs,
      size:      stat.size,
      mtime:     stat.mtime.toISOString(),
      confidence: 'high',
      lines:     content.split('\n').length,
    });
  } catch (err) {
    return null;
  }
}

/**
 * Search files in a directory matching a pattern (basic glob).
 * Returns array of matching paths relative to searchRoot.
 * @param {string} searchRoot
 * @param {RegExp|string} pattern
 * @param {number} [maxResults=50]
 * @returns {string[]}
 */
function searchFiles(searchRoot, pattern, maxResults = 50) {
  const results = [];
  const re = typeof pattern === 'string'
    ? new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i')
    : pattern;

  function walk(dir) {
    if (results.length >= maxResults) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(full);
        } else if (entry.isFile() && re.test(entry.name)) {
          results.push(path.relative(searchRoot, full));
        }
      }
    } catch { /* skip unreadable */ }
  }
  walk(path.resolve(searchRoot));
  return results;
}

// ── Truth document loading ────────────────────────────────────────────────────

const TRUTH_FILENAMES = [
  'AGENT.md', 'SPEC.md', 'README.md', 'ARCHITECTURE.md',
  'DESIGN.md', 'CONTEXT.md', '.cursorrules', 'CLAUDE.md',
];

const TRUTH_DIRS = ['docs', 'doc', 'spec', '.'];

/**
 * Load all truth documents for a project.
 * @param {string} projectRoot
 * @returns {ContextItem[]}
 */
function loadTruthDocs(projectRoot) {
  const items = [];
  const root  = path.resolve(projectRoot);

  for (const dir of TRUTH_DIRS) {
    const dirPath = path.join(root, dir);
    if (!fs.existsSync(dirPath)) continue;
    for (const fname of TRUTH_FILENAMES) {
      const fp = path.join(dirPath, fname);
      const item = readFile(fp);
      if (item) items.push(item);
    }
  }

  // Also check root-level truth files
  for (const fname of TRUTH_FILENAMES) {
    const fp = path.join(root, fname);
    const item = readFile(fp);
    if (item && !items.find(i => i.path === fp)) items.push(item);
  }

  return items;
}

// ── Git history ──────────────────────────────────────────────────────────────

/**
 * Get recent git commits for a project.
 * @param {string} projectRoot
 * @param {number} [count=10]
 * @returns {ContextItem}
 */
function loadGitHistory(projectRoot, count = 10) {
  try {
    const root = path.resolve(projectRoot);
    const out = execSync(
      `git log --oneline -${count} --format="%h %s (%cr)"`,
      { cwd: root, encoding: 'utf8', timeout: 5000 }
    );
    const commits = out.trim().split('\n').filter(Boolean);
    return provenance('git', 'git-log', commits, {
      path:       root,
      confidence: 'medium',
      count:      commits.length,
    });
  } catch {
    return provenance('git', 'git-log', [], {
      path:       path.resolve(projectRoot),
      confidence: 'low',
      error:      'git not available or not a repo',
    });
  }
}

/**
 * Get git diff of uncommitted changes.
 * @param {string} projectRoot
 * @returns {ContextItem}
 */
function loadGitDiff(projectRoot) {
  try {
    const root = path.resolve(projectRoot);
    const out = execSync('git diff --stat', { cwd: root, encoding: 'utf8', timeout: 5000 });
    return provenance('git', 'git-diff', out.trim(), {
      path:       root,
      confidence: 'high',
    });
  } catch {
    return provenance('git', 'git-diff', '', {
      path:       path.resolve(projectRoot),
      confidence: 'low',
      error:      'git diff failed',
    });
  }
}

// ── Memory / prior task loading ────────────────────────────────────────────────

const memoryClient = (() => {
  try { return require('../../lib/memory-client'); } catch { return null; }
})();

/**
 * Load prior task memory for a project.
 * @param {string} projectId
 * @param {number} [maxItems=5]
 * @returns {ContextItem}
 */
function loadTaskMemory(projectId, maxItems = 5) {
  if (!memoryClient) {
    return provenance('memory', 'task-memory', [], {
      confidence: 'low',
      error:      'memory-client unavailable',
    });
  }
  try {
    // memoryClient.query is the primary lookup
    const rows = memoryClient.query
      ? memoryClient.query({ projectId, limit: maxItems })
      : [];
    return provenance('memory', 'task-memory', rows, {
      projectId,
      confidence: 'high',
      count:      Array.isArray(rows) ? rows.length : 0,
    });
  } catch (err) {
    return provenance('memory', 'task-memory', [], {
      projectId,
      confidence: 'low',
      error:      err.message,
    });
  }
}

// ── Project metadata ──────────────────────────────────────────────────────────

/**
 * Load project metadata from package.json.
 * @param {string} projectRoot
 * @returns {ContextItem|null}
 */
function loadProjectMeta(projectRoot) {
  const pkgPath = path.join(path.resolve(projectRoot), 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return provenance('file', 'package.json', {
      name:    pkg.name,
      version: pkg.version,
      scripts: Object.keys(pkg.scripts || {}),
      deps:    Object.keys(pkg.dependencies    || {}),
      devDeps: Object.keys(pkg.devDependencies || {}),
    }, {
      path:       pkgPath,
      confidence: 'high',
    });
  } catch {
    return null;
  }
}

// ── Tool availability ─────────────────────────────────────────────────────────

/**
 * Snapshot which CLI tools are available.
 * @returns {ContextItem}
 */
function loadToolAvailability() {
  const tools = ['node', 'npm', 'pnpm', 'git', 'python', 'python3'];
  const available = {};
  for (const tool of tools) {
    try {
      const out = execSync(`${tool} --version`, { encoding: 'utf8', timeout: 3000 });
      available[tool] = { available: true, version: (out || '').trim().split('\n')[0] };
    } catch {
      available[tool] = { available: false, version: null };
    }
  }
  return provenance('env', 'tool-availability', available, { confidence: 'high' });
}

// ── Context budget ───────────────────────────────────────────────────────────

/**
 * Truncate a context item's data to a max byte size.
 * @param {ContextItem} item
 * @param {number} maxBytes
 * @returns {ContextItem}
 */
function budgetTruncate(item, maxBytes = 80_000) {
  const raw = typeof item.data === 'string' ? item.data : JSON.stringify(item.data);
  if (raw.length <= maxBytes) return item;
  return {
    ...item,
    data:      raw.slice(0, maxBytes) + `\n... [TRUNCATED ${raw.length - maxBytes} chars]`,
    truncated: true,
    originalSize: raw.length,
  };
}

// ── Main assembler ────────────────────────────────────────────────────────────

/**
 * Assemble full context bundle for a task.
 * Respects budget, loads all sources, tags every item with provenance.
 *
 * @param {Object} task  — PurpClawTask
 * @param {Object} [opts]
 * @param {number} [opts.maxBytes=80_000]  — max per item
 * @param {number} [opts.maxFiles=20]     — max files to read
 * @returns {{ items: ContextItem[], totalChars: number }}
 */
function assembleContext(task, opts = {}) {
  const {
    maxBytes  = 80_000,
    maxFiles  = 20,
  } = opts;

  const projectRoot = task.repoPath || process.cwd();
  const items = [];

  // 1. Project metadata (first — tells us what's available)
  const meta = loadProjectMeta(projectRoot);
  if (meta) items.push(budgetTruncate(meta, maxBytes));

  // 2. Truth documents
  const truthItems = loadTruthDocs(projectRoot);
  for (const item of truthItems.slice(0, 10)) {
    items.push(budgetTruncate(item, maxBytes));
  }

  // 3. Git history
  const gitLog = loadGitHistory(projectRoot, 10);
  items.push(gitLog);

  // 4. Git diff (uncommitted changes)
  const gitDiff = loadGitDiff(projectRoot);
  items.push(gitDiff);

  // 5. Task memory
  if (task.projectId) {
    const mem = loadTaskMemory(task.projectId, 5);
    items.push(mem);
  }

  // 6. Tool availability
  items.push(loadToolAvailability());

  // 7. Known files (explicit — harness tells us what's relevant)
  if (task.knownFiles && task.knownFiles.length > 0) {
    const knownFileItems = task.knownFiles
      .slice(0, maxFiles)
      .map(f => readFile(path.join(projectRoot, f)))
      .filter(Boolean)
      .map(item => budgetTruncate(item, maxBytes));
    items.push(...knownFileItems);
  }

  // 8. Constraints (if any)
  if (task.constraints && task.constraints.length > 0) {
    items.push(provenance('task', 'constraints', task.constraints, { confidence: 'high' }));
  }

  const totalChars = items.reduce((n, i) => n + String(i.data).length, 0);
  return { items, totalChars };
}

/**
 * Render all context items as a string for LLM consumption.
 * @param {ContextItem[]} items
 * @returns {string}
 */
function renderForLLM(items) {
  const lines = ['## Context Bundle\n'];
  for (const item of items) {
    lines.push(`\n### [${item.source}] ${item.label}${item.path ? ` (${item.path})` : ''}`);
    lines.push(`_confidence: ${item.confidence} | ${item.timestamp}_`);
    const raw = typeof item.data === 'string' ? item.data : JSON.stringify(item.data, null, 2);
    lines.push('```');
    lines.push(raw.slice(0, 4000));
    if (raw.length > 4000) lines.push(`\n... [${raw.length - 4000} more chars]`);
    lines.push('```');
  }
  return lines.join('\n');
}

// ── Schema type for IDE support ──────────────────────────────────────────────

/**
 * @typedef {Object} ContextItem
 * @property {string} source      — file|memory|git|env|tool|task
 * @property {string} label       — human-readable description
 * @property {*}      data        — payload (string, array, object)
 * @property {string} confidence  — high|medium|low
 * @property {string|null} path   — absolute path if applicable
 * @property {string} timestamp   — ISO timestamp
 * @property {boolean} [truncated]
 * @property {number}  [originalSize]
 */

module.exports = {
  provenance,
  readFile,
  searchFiles,
  loadTruthDocs,
  loadGitHistory,
  loadGitDiff,
  loadTaskMemory,
  loadProjectMeta,
  loadToolAvailability,
  budgetTruncate,
  assembleContext,
  renderForLLM,
};
