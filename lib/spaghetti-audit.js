'use strict';

const fs = require('fs');
const path = require('path');

const SOURCE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.py']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'build', 'dist', '.git', 'harvested', '__pycache__']);

function walk(rootDir, rel = '') {
  const dir = path.join(rootDir, rel);
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...walk(rootDir, path.join(rel, entry.name)));
    } else if (SOURCE_EXTS.has(path.extname(entry.name))) {
      files.push(path.join(rel, entry.name));
    }
  }
  return files;
}

function countMatches(text, regex) {
  return (text.match(regex) || []).length;
}

function verdict(score) {
  if (score >= 85) return 'ANNONA';
  if (score >= 70) return 'BIN/REWRITE';
  if (score >= 45) return 'QUARANTINE';
  if (score >= 25) return 'REFACTOR';
  return 'TRACEABLE';
}

function honks(score) {
  return Math.min(5, Math.max(0, Math.ceil(score / 20)));
}

function analyzeFile(rootDir, relPath) {
  const abs = path.isAbsolute(relPath) ? relPath : path.join(rootDir, relPath);
  const text = fs.readFileSync(abs, 'utf8');
  const lines = text.split(/\r?\n/);
  const ext = path.extname(abs);

  const metrics = {
    lines: lines.length,
    largeFile: Math.max(0, lines.length - 500),
    branches: countMatches(text, /\b(if|else if|switch|case|catch|for|while|&&|\|\|)\b/g),
    functions: countMatches(text, /\b(function|async function|=>|def )\b/g),
    hiddenGlobals: countMatches(text, /\b(global\.|globalThis\.|window\.|process\.env\.[A-Z0-9_]+\s*=)/g),
    sideEffects: countMatches(text, /\b(fs\.write|fs\.append|exec\(|execSync\(|spawn\(|spawnSync\(|process\.kill|setInterval\()/g),
    fallbackChains: countMatches(text, /\bcatch\s*\([^)]*\)\s*{\s*\/\*|catch\s*{\s*\/\*|fallback|try\s*{/gi),
    imports: ext === '.py'
      ? countMatches(text, /^\s*(import|from)\s+/gm)
      : countMatches(text, /\brequire\(|\bfrom\s+['"][^'"]+['"]|\bimport\s+/g),
    suppressions: countMatches(text, /eslint-disable|ts-ignore|type:\s*ignore|noqa/g),
    mutations: countMatches(text, /\b[A-Za-z0-9_$.]+\s*=\s*[^=]/g),
  };

  const score =
    Math.min(18, metrics.largeFile / 80) +
    Math.min(18, metrics.branches / 8) +
    Math.min(12, Math.max(0, metrics.functions - 20) / 3) +
    Math.min(16, metrics.hiddenGlobals * 4) +
    Math.min(16, metrics.sideEffects * 2) +
    Math.min(10, metrics.fallbackChains) +
    Math.min(6, metrics.suppressions * 2) +
    Math.min(4, Math.max(0, metrics.imports - 25) / 4);

  const finalScore = Math.round(Math.min(100, score));
  return {
    file: path.relative(rootDir, abs).replace(/\\/g, '/'),
    score: finalScore,
    honks: honks(finalScore),
    verdict: verdict(finalScore),
    metrics,
  };
}

function audit(rootDir, options = {}) {
  const limit = options.limit || 25;
  return walk(rootDir)
    .map(file => {
      try { return analyzeFile(rootDir, file); } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function rewritePlan(analysis) {
  const actions = [];
  if (analysis.metrics.lines > 500) actions.push('Split file by ownership boundary and keep public API stable.');
  if (analysis.metrics.hiddenGlobals) actions.push('Replace hidden global mutation with explicit state/service dependency.');
  if (analysis.metrics.sideEffects) actions.push('Move filesystem/process/network side effects behind narrow adapters.');
  if (analysis.metrics.fallbackChains > 10) actions.push('Collapse silent fallback chains into explicit error states.');
  if (analysis.metrics.branches > 80) actions.push('Extract decision tables or typed handlers for high branch sections.');
  if (!actions.length) actions.push('Keep in runtime; only local refactor needed.');
  return actions;
}

function diffAnalyses(before, after) {
  const metricDelta = {};
  const keys = new Set([
    ...Object.keys(before.metrics || {}),
    ...Object.keys(after.metrics || {}),
  ]);
  for (const key of keys) {
    metricDelta[key] = (after.metrics?.[key] || 0) - (before.metrics?.[key] || 0);
  }
  return {
    before: {
      file: before.file,
      score: before.score,
      verdict: before.verdict,
    },
    after: {
      file: after.file,
      score: after.score,
      verdict: after.verdict,
    },
    scoreDelta: after.score - before.score,
    improved: after.score < before.score,
    metricDelta,
  };
}

module.exports = {
  audit,
  analyzeFile,
  rewritePlan,
  diffAnalyses,
};
