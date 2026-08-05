'use strict';

/**
 * packages/harness-codex — Codex Parity Harness
 * ===========================================
 * Best at: repo surgery, patches, diffs, test-driven changes, build repair.
 *
 * Codex parity requirements:
 *   - read file / search repo / patch files / create files
 *   - run tests / return diffs / explain failure cleanly
 *   - resume interrupted work
 *
 * Codex output contract:
 *   { objective, files touched, actions taken, verification result, final status }
 *
 * From PURPCLAW_AGENT_HARNESS_PARITY_BLUEPRINT.md §3
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  createResult, addFileRead, addFileChanged,
  addCommand, addVerification, addError,
  finalize,
} = require('../../packages/result-schema');
const { searchFiles, readFile: ctxReadFile } = require('../../packages/context-spine');

// ── File operations ─────────────────────────────────────────────────────────

function readFile(absPath) {
  try {
    const content = fs.readFileSync(absPath, 'utf8');
    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function patchFile(absPath, oldStr, newStr) {
  try {
    const content = fs.readFileSync(absPath, 'utf8');
    if (!content.includes(oldStr)) {
      return { ok: false, error: `Pattern not found in ${absPath}` };
    }
    fs.writeFileSync(absPath, content.replace(oldStr, newStr), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function createFile(absPath, content) {
  try {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function gitDiff(projectRoot) {
  try {
    return execSync('git diff --stat', { cwd: projectRoot, encoding: 'utf8', timeout: 5000 });
  } catch {
    return '';
  }
}

// ── Run single test file ──────────────────────────────────────────────────────

function runTest(testPath, projectRoot) {
  const cmd = `node ${path.join(projectRoot, testPath)}`;
  try {
    const out = execSync(cmd, { cwd: projectRoot, encoding: 'utf8', timeout: 60_000 });
    return { ok: true, output: out };
  } catch (err) {
    return { ok: false, output: (err.stdout || '') + '\n' + (err.stderr || ''), error: err.message };
  }
}

// ── Main run ─────────────────────────────────────────────────────────────────

/**
 * Execute a Codex task.
 * @param {Object} task    — PurpClawTask
 * @param {Object} ctx     — context bundle from harness-core
 * @param {Object[]} steps — plan steps
 * @param {Object} [meta]  — { auditRecord }
 * @returns {Promise<Object>} result object
 */
async function run(task, ctx, steps, meta) {
  const result = createResult(task, 'codex');
  const projectRoot = task.repoPath || process.cwd();
  const startedAt = Date.now();

  try {
    // 1. Read all known files first
    const knownFiles = task.knownFiles || [];
    for (const f of knownFiles) {
      const absPath = path.join(projectRoot, f);
      const r = readFile(absPath);
      if (r.ok) {
        addFileRead(result, absPath);
      } else {
        addError(result, { phase: 'intake', message: `Could not read ${f}: ${r.error}` });
      }
    }

    // 2. Run build to verify current state (skip if meta.skipVerification)
    const skipV = meta?.skipVerification || ctx?.skipVerification || false;
    if (!skipV) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
        if (pkg.scripts?.build) {
          addCommand(result, 'npm run build');
          const buildOut = execSync('npm run build', {
            cwd: projectRoot, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024,
          });
          addVerification(result, { criterion: 'build', passed: true, evidence: 'Build succeeded' });
        }
        if (pkg.scripts?.lint) {
          addCommand(result, 'npm run lint');
          const lintOut = execSync('npm run lint', {
            cwd: projectRoot, encoding: 'utf8', timeout: 60_000, maxBuffer: 5 * 1024 * 1024,
          });
          addVerification(result, { criterion: 'lint', passed: true, evidence: 'Lint passed' });
        }
      } catch (err) {
        addVerification(result, {
          criterion: 'build',
          passed: false,
          evidence: `Build/lint error: ${(err.stdout || err.message).slice(-500)}`,
        });
      }
    } else {
      addVerification(result, { criterion: 'build', passed: null, evidence: 'Skipped (skipVerification=true)' });
      addVerification(result, { criterion: 'lint', passed: null, evidence: 'Skipped (skipVerification=true)' });
    }

    // 3. Search for relevant files if not specified
    if (!task.knownFiles || task.knownFiles.length === 0) {
      const goalLower = task.goal.toLowerCase();
      const patterns = [];
      if (/(component|react|tsx|jsx)/.test(goalLower)) patterns.push(/\.(tsx?|jsx?)$/);
      if (/(test|spec)/.test(goalLower)) patterns.push(/\.(test|spec)\.(js|ts)$/);
      if (/(route|api|endpoint)/.test(goalLower)) patterns.push(/route|handler|controller/i);

      for (const re of patterns.slice(0, 2)) {
        const found = searchFiles(projectRoot, re, 20);
        for (const f of found.slice(0, 10)) {
          addFileRead(result, path.join(projectRoot, f));
        }
      }
    }

    // 4. Run tests
    const testFiles = searchFiles(projectRoot, /\.(test|spec)\.(js|ts)$/, 10);
    for (const tf of testFiles.slice(0, 5)) {
      addCommand(result, `node ${tf}`);
      const tr = runTest(tf, projectRoot);
      addVerification(result, {
        criterion: `test:${path.basename(tf)}`,
        passed: tr.ok,
        evidence: tr.ok ? 'test passed' : tr.output.slice(-300),
      });
    }

    // 5. Capture diff
    const diff = gitDiff(projectRoot);
    if (diff) {
      result.artifacts.push({
        path: '.git/diff',
        checksum: null,
        verified: true,
        note: 'Uncommitted changes',
      });
    }

    result.summary = [
      `Codex executed: ${result.filesRead.length} files read,`,
      `${result.commandsRun.length} commands run,`,
      `${result.verification.length} verification entries,`,
      `${result.errors.length} errors.`,
      diff ? `\nGit diff:\n${diff}` : '',
    ].filter(Boolean).join(' ');

  } catch (err) {
    addError(result, { phase: 'codex', message: err.message, stack: err.stack });
    result.summary = `Codex failed: ${err.message}`;
  }

  result.durationMs = Date.now() - startedAt;
  // Status is derived from the evidence actually collected, not set by
  // hand. Without this the harness kept createResult's 'blocked'
  // default forever and could never report success, however much work
  // it did. See result-schema.finalize().
  finalize(result);

  return result;
}

module.exports = { run };
