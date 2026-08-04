'use strict';

/**
 * packages/harness-claude — Claude parity harness
 * Blueprint: PURPCLAW_AGENT_HARNESS_PARITY_BLUEPRINT.md §4
 *
 * Strengths: deep reasoning, architecture analysis, contradiction detection,
 * large-context synthesis, spec repair, cross-file reasoning.
 *
 * 8-stage lifecycle:
 *   IntakeNormaliser → LongContextAssembler → SynthesisEngine
 *   → Planner → OptionalEditor → VerificationStage
 *   → ResultPackager → MemoryAudit
 */

const path         = require('path');
const fs           = require('fs');
const { execSync } = require('child_process');

const HARNESS = 'claude';

// ── Schema imports ────────────────────────────────────────────────────────────
let resultSchema;
try { resultSchema = require('./result-schema'); } catch (_) { resultSchema = require('../result-schema'); }
let memoryAudit;
try { memoryAudit = require('./memory-audit'); } catch (_) { memoryAudit = require('../memory-audit'); }

// ── Time ─────────────────────────────────────────────────────────────────────
function now() { return Date.now(); }

// ── Repo root ────────────────────────────────────────────────────────────────
function resolveRepoRoot(task) {
  const raw = task.repoPath || (task.knownFiles && task.knownFiles[0]) || process.cwd();
  // Walk up for nearest package.json
  let dir = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return path.dirname(dir);
}

// ── Context assembly ─────────────────────────────────────────────────────────
function assembleClaudeContext(task, opts) {
  const repoRoot = resolveRepoRoot(task);
  const contextItems = [];
  const readFile = function(filePath) {
    try {
      const full = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
      if (!fs.existsSync(full)) return null;
      const data = fs.readFileSync(full, 'utf8');
      const stat = fs.statSync(full);
      return { source: 'file', label: filePath, data: data,
               path: full, timestamp: stat.mtime.toISOString(),
               confidence: 1.0, size: stat.size };
    } catch (_) { return null; }
  };

  // Priority 1: architecture docs
  const docPaths = [
    'docs/architecture.md', 'docs/ARCHITECTURE.md', 'ARCHITECTURE.md',
    'docs/design.md', 'docs/DESIGN.md', 'DESIGN.md',
    'README.md', 'docs/TECHNICAL.md',
  ];
  for (const p of docPaths) {
    const item = readFile(p);
    if (item) { item.priority = 1; contextItems.push(item); }
  }

  // Priority 2: implementation files from knownFiles
  if (task.knownFiles && task.knownFiles.length) {
    for (const f of task.knownFiles.slice(0, 20)) {
      const item = readFile(f);
      if (item) { item.priority = 2; contextItems.push(item); }
    }
  }

  // Priority 3: recent git-tracked source files
  try {
    const out = execSync('git ls-files -- "*.js" "*.ts" "*.jsx" "*.tsx" | head -30',
                        { cwd: repoRoot, timeout: 5000 });
    const files = out.toString().trim().split('\n').filter(Boolean);
    for (const f of files.slice(0, 15)) {
      const item = readFile(f);
      if (item) { item.priority = 3; contextItems.push(item); }
    }
  } catch (_) { /* defensive */ }

  return { items: contextItems, repoRoot };
}

// ── Contradiction scanner ─────────────────────────────────────────────────────
/**
 * Scan loaded context for contradictions between documentation and code.
 * Returns { findings: [], routePatterns: [] }.
 *
 * Findings: { sourceA, sourceB, contradiction, severity: 'high'|'medium'|'low' }
 * Route patterns: { pattern, files: [] }
 */
function scanContradictions(ctx) {
  const findings = [];
  const routePatterns = [];
  const textBySource = {};

  const items = Array.isArray(ctx) ? ctx : (ctx.items || []);
  for (const item of items) {
    if (item.data) textBySource[item.label] = item.data;
  }

  // Route/API pattern detection: find inconsistent HTTP method or path usage
  const methodMap = {}; // "GET /api/users" -> [files]
  const httpRegex = /(?:fetch|axios|request|get|post|put|patch|del)\s*\([^)'"]*['"]([^'"]+)['"]/gi;
  for (const [src, text] of Object.entries(textBySource)) {
    let m;
    while ((m = httpRegex.exec(text)) !== null) {
      const key = m[1] || '';
      if (!methodMap[key]) methodMap[key] = [];
      methodMap[key].push(src);
    }
  }
  for (const [pattern, files] of Object.entries(methodMap)) {
    if (files.length > 1) {
      routePatterns.push({ pattern, files });
    }
  }

  // Doc-vs-code contradiction: doc says X, code does Y
  const docFiles = Object.keys(textBySource).filter(function(l) {
    return /\.(md|txt)$/i.test(l);
  });
  const codeFiles = Object.keys(textBySource).filter(function(l) {
    return /\.(js|ts|jsx|tsx)$/i.test(l);
  });

  // Check each doc for claims about deps/APIs that don't exist in code
  for (const doc of docFiles) {
    const docText = textBySource[doc] || '';
    // Look for import statements mentioned in docs
    const importMentions = docText.match(/import .+? from ['"][^'"]+['"]/gi) || [];
    for (const mention of importMentions) {
      const match = mention.match(/from ['"]([^'"]+)['"]/);
      if (!match) continue;
      const dep = match[1];
      // Check if this dep is used in any code file
      let found = false;
      for (const code of codeFiles) {
        if ((textBySource[code] || '').indexOf(dep) >= 0) { found = true; break; }
      }
      if (!found) {
        findings.push({
          sourceA: doc,
          sourceB: codeFiles.join(', ') || 'no code files',
          contradiction: 'Documentation references import "' + dep + '" but it was not found in any code file',
          severity: 'medium',
        });
      }
    }
  }

  return { findings, routePatterns };
}

// ── Architecture synthesiser ──────────────────────────────────────────────────
/**
 * Synthesise an architecture map from loaded context items.
 * Returns { layers: { ui, logic, data, infra, unknown }, dependencies: [] }.
 *
 * Classification rules:
 *   ui      — React/Vue/HTML/CSS components, pages, layouts, assets
 *   logic   — business logic, services, controllers (JS/TS, not node_modules)
 *   data    — ORM models, DB queries, API clients, stores
 *   infra   — Docker, CI/CD, env, config scripts
 *   unknown — everything else
 */
function synthesiseArchitecture(ctx) {
  const layers = { ui: [], logic: [], data: [], infra: [], unknown: [] };
  const dependencies = [];
  const filePaths = Array.isArray(ctx) ? ctx.map(function(i) { return i.path || i.file || i.label || ''; }) : [];

  const uiExts   = ['.jsx','.tsx','.vue','.svelte','.angular','.html','.css','.scss','.less'];
  const logicExts = ['.js','.ts','.mjs','.cjs'];
  const dataExts  = ['.sql','.prisma','.py','.go','.java'];

  for (const raw of filePaths) {
    if (!raw) continue;
    const p = raw.replace(/\\/g, '/').toLowerCase();

    // UI: UI extensions or UI directories
    var isUi = uiExts.some(function(e) { return p.endsWith(e); }) ||
               p.indexOf('/components/') >= 0 || p.indexOf('/pages/') >= 0 ||
               p.indexOf('/layouts/') >= 0 || p.indexOf('/views/') >= 0 ||
               p.indexOf('/assets/') >= 0 || p.indexOf('/public/') >= 0 ||
               p.indexOf('/styles/') >= 0;

    if (isUi) { layers.ui.push(raw); continue; }

    // Data: DB/data extensions or data directories
    var isData = dataExts.some(function(e) { return p.endsWith(e); }) ||
                 p.indexOf('/db/') >= 0 || p.indexOf('/models/') >= 0 ||
                 p.indexOf('/stores/') >= 0 || p.indexOf('/queries/') >= 0 ||
                 p.indexOf('/fetchers/') >= 0 || p.indexOf('/api/') >= 0;

    if (isData) { layers.data.push(raw); continue; }

    // Infra: Docker, CI, env
    var isInfra = p.indexOf('dockerfile') >= 0 || p.indexOf('docker-compose') >= 0 ||
                  p.indexOf('/.github/') >= 0 || p.indexOf('/ci/') >= 0 ||
                  p.indexOf('jenkins') >= 0 || p.indexOf('makefile') >= 0 ||
                  p.indexOf('.env') >= 0;

    if (isInfra) { layers.infra.push(raw); continue; }

    // Logic: JS/TS files not in node_modules
    var isLogic = logicExts.some(function(e) { return p.endsWith(e); }) &&
                  p.indexOf('node_modules') < 0;

    if (isLogic) { layers.logic.push(raw); continue; }

    layers.unknown.push(raw);
  }

  return { layers: layers, dependencies: dependencies };
}

// ── Main run ─────────────────────────────────────────────────────────────────
/**
 * Execute a task through the Claude harness.
 *
 * @param {Object} task   - PurpClawTask (normalised by task-schema)
 * @param {Object} ctx    - { items: ProvenanceItem[] }
 * @param {Array}  steps  - prior steps for resume
 * @param {Object} meta   - { dryRun, force, verbose }
 * @returns {Promise<Object>} PURPCLAW_RESULT
 */
async function run(task, ctx, steps, meta) {
  const startMs = now();

  // Resolve + validate task
  if (!task || !task.goal) {
    throw new Error('PURPCLAW_TASK_SCHEMA_v1 | run: task.goal is required');
  }

  // Normalise: use task-schema if available
  let normalised = task;
  try {
    let taskSchema;
    try { taskSchema = require('./task-schema'); } catch (_) { taskSchema = require('../task-schema'); }
    if (taskSchema && taskSchema.normaliseTask) {
      normalised = taskSchema.normaliseTask(task);
    }
  } catch (_) { /* defensive */ }

  const repoRoot = resolveRepoRoot(normalised);

  const result = resultSchema.createResult(normalised, HARNESS);
  result.startedAt = new Date(startMs).toISOString();

  let record = null;
  try {
    // Start memory audit
    try {
      record = memoryAudit.startTask(normalised, HARNESS);
    } catch (_) { /* defensive */ }

    // Assemble Claude-specific deep context
    const claudeCtx = ctx && ctx.items ? ctx : assembleClaudeContext(normalised, {});
    const items = claudeCtx.items || [];

    // Tag items with priority and type
    for (const item of items) {
      memoryAudit.logFileRead && memoryAudit.logFileRead(record && record.id, item.path || item.label);
    }

    // Run analysis
    const contradictions = scanContradictions(claudeCtx);
    const archMap = synthesiseArchitecture(claudeCtx);

    // Facts vs assumptions ledger
    const assumptions = [];

    // What we know from docs
    for (const item of items) {
      if (/\.(md|txt)$/i.test(item.label || '')) {
        // Extract "assumes" statements from docs
        const lines = (item.data || '').split('\n');
        for (const line of lines) {
          if (line.match(/^>\s*assumption:|^>\s*note:|^>\s*todo:/i)) {
            assumptions.push({ source: item.label, claim: line.replace(/^>\s*/i, '').trim() });
          }
        }
      }
    }

    // Build summary
    const summaryParts = [];
    summaryParts.push('[' + HARNESS + '] ' + normalised.goal);
    summaryParts.push(items.length + ' context items loaded');

    if (contradictions.findings.length > 0) {
      summaryParts.push(contradictions.findings.length + ' contradictions found');
      for (const f of contradictions.findings.slice(0, 3)) {
        result.errors.push({ type: 'contradiction', sourceA: f.sourceA, sourceB: f.sourceB,
                            message: f.contradiction, severity: f.severity });
      }
    } else {
      summaryParts.push('no contradictions found');
    }

    summaryParts.push('architecture: ' +
      Object.keys(archMap.layers).filter(function(k) { return archMap.layers[k].length > 0; }).join(', ') || 'no layers detected');

    result.summary = summaryParts.join(' | ');
    result.contradictions = contradictions.findings;
    result.architecture = archMap.layers;
    result.assumptions = assumptions;
    resultSchema.pass(result, 'Claude harness analysis complete');
  } catch (err) {
    resultSchema.fail(result, err.message);
    result.errors.push({ type: 'harness-error', message: err.message, stack: err.stack });
  }

  result.durationMs = now() - startMs;
  result.finishedAt = new Date().toISOString();

  if (record) {
    try {
      memoryAudit.finishTask(record.id, result.status, result.summary);
      memoryAudit.logStep(record.id, { name: 'claude-run', status: result.status, durationMs: result.durationMs });
    } catch (_) { /* defensive */ }
  }

  return resultSchema.validateResult(result);
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  run,
  scanContradictions,
  synthesiseArchitecture,
  HARNESS,
};
