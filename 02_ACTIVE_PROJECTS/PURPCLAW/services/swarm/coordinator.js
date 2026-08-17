'use strict';

/**
 * PURPCLAW SWARM COORDINATOR v1.0
 * ================================
 * The primary orchestration engine for multi-agent, capability-aware workflows.
 * Runs as a PM2 microservice on port 7898.
 *
 * Implements the approved Complex Agent Harness:
 * 1. Semantic task decomposition via task_decomposer.js
 * 2. Parallel/sequential dependency graph runner
 * 3. Handoff-aware context forwarding using context-packet.js
 * 4. Resilient subtask execution with alternate agent retry fallback
 * 5. High-context synthesis merge using llm-provider.js
 *
 * Exposes a standard HTTP API for workflow coordination and mission status.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const PURP_DIR = __dirname;

// Write out the blast_radius_helper.js utility (base64 encoded to avoid template literal escaping issues)
const HELPER_PATH = path.join(PURP_DIR, 'agent_work', 'blast_radius_helper.js');
try {
  fs.mkdirSync(path.dirname(HELPER_PATH), { recursive: true });
  const helperBase64 = "Y29uc3QgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTsKY29uc3QgY3J5cHRvID0gcmVxdWlyZSgnY3J5cHRvJyk7CmNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKTsKY29uc3Qgb3MgPSByZXF1aXJlKCdvcycpOwoKY29uc3QgcmVwb1BhdGggPSBwcm9jZXNzLmFyZ3ZbMl07CmNvbnN0IHRhcmdldFBhdHRlcm5zID0gSlNPTi5wYXJzZShwcm9jZXNzLmFyZ3ZbM10gfHwgJ1tdJyk7CgpmdW5jdGlvbiBnZXRCbGFzdFJhZGl1cygpIHsKICBpZiAoIXJlcG9QYXRoIHx8IHRhcmdldFBhdHRlcm5zLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFtdOwogIGxldCByZXNvbHZlZCA9IHBhdGgucmVzb2x2ZShyZXBvUGF0aCk7CiAgaWYgKC9eW2Etel06L2kudGVzdChyZXNvbHZlZCkpIHsKICAgIHJlc29sdmVkID0gcmVzb2x2ZWRbMF0udG9VcHBlckNhc2UoKSArIHJlc29sdmVkLnNsaWNlKDEpOwogIH0KICBjb25zdCBoYXNoID0gY3J5cHRvLmNyZWF0ZUhhc2goJ3NoYTI1NicpLnVwZGF0ZShyZXNvbHZlZCkuZGlnZXN0KCdoZXgnKS5zdWJzdHJpbmcoMCwgMTIpOwogIGNvbnN0IGRiUGF0aCA9IHBhdGguam9pbihvcy5ob21lZGlyKCksICcub21uaWNvZGUnLCBoYXNoICsgJy5kYicpOwogIGlmICghZnMuZXhpc3RzU3luYyhkYlBhdGgpKSByZXR1cm4gW107CiAgCiAgbGV0IERhdGFiYXNlOwogIHRyeSB7CiAgICBEYXRhYmFzZSA9IHJlcXVpcmUoJ0U6XFxcXGdvZCBmb2xkZXJcXFxcMDJfQUNUSVZFX1BST0pFQ1RTXFxcXG9tbmljb2RlLXBsYXRmb3JtXFxcXG5vZGVfbW9kdWxlc1xcXFxiZXR0ZXItc3FsaXRlMycpOwogIH0gY2F0Y2ggKGUpIHsKICAgIHJldHVybiBbXTsKICB9CiAgCiAgY29uc3QgZGIgPSBuZXcgRGF0YWJhc2UoZGJQYXRoKTsKICBjb25zdCBmaWxlcyA9IGRiLnByZXBhcmUoJ1NFTEVDVCBpZCwgcGF0aCBGUk9NIGZpbGVzJykuYWxsKCk7CiAgCiAgY29uc3QgcmVnZXhlcyA9IHRhcmdldFBhdHRlcm5zLm1hcChwID0+IHsKICAgIGNvbnN0IG1hdGNoID0gcC5tYXRjaCgvXlwvKC4qKVwvKFthLXpdKikkL2kpOwogICAgaWYgKG1hdGNoKSB7CiAgICAgIHRyeSB7CiAgICAgICAgcmV0dXJuIG5ldyBSZWdFeHAobWF0Y2hbMV0sIG1hdGNoWzJdKTsKICAgICAgfSBjYXRjaCAoZSkge30KICAgIH0KICAgIGNvbnN0IGVzY2FwZWQgPSBwLnJlcGxhY2UoL1suK15eJHt9KCk7fHxbXF1cXF0vZywgJ1xcJCYnKS5yZXBsYWNlKC9cKi9nLCAnLionKTsKICAgIHJldHVybiBuZXcgUmVnRXhwKGVzY2FwZWQsICdpJyk7CiAgfSk7CiAgCiAgY29uc3QgbWF0Y2hlZEZpbGVzID0gZmlsZXMuZmlsdGVyKGYgPT4gewogICAgY29uc3QgcmVsUGF0aCA9IHBhdGgucmVsYXRpdmUocmVzb2x2ZWQsIGYucGF0aCkucmVwbGFjZSgvXFwvZywgJy8nKTsKICAgIGNvbnN0IG5hbWUgPSBwYXRoLmJhc2VuYW1lKGYucGF0aCk7CiAgICByZXR1cm4gcmVnZXhlcy5zb21lKHJ4ID0+IHJ4LnRlc3QocmVsUGF0aCkgfHwgcngudGVzdChuYW1lKSk7CiAgfSk7CiAgCiAgaWYgKG1hdGNoZWRGaWxlcy5sZW5ndGggPT09IDApIHJldHVybiBbXTsKICAKICBjb25zdCBtYXRjaGVkRmlsZUlkcyA9IG1hdGNoZWRGaWxlcy5tYXAoZiA9PiBmLmlkKTsKICBjb25zdCBtYXRjaGVkUGF0aHMgPSBuZXcgU2V0KG1hdGNoZWRGaWxlcy5tYXAoZiA9PiBmLnBhdGgpKTsKICAKICBjb25zdCBwbGFjZWhvbGRlcnMgPSBtYXRjaGVkRmlsZUlkcy5tYXAoKCkgPT4gJz8nKS5qb2luKCcsJyk7CiAgY29uc3QgaW1wb3J0UXVlcnkgPSAnU0VMRUNUIERJU1RJTkNUIGYucGF0aCBGUk9NIGZpbGVzIGYgSk9JTiBpbXBvcnRzIGkgT04gZi5pZCA9IGkuZnJvbV9maWxlX2lkIFdIRVJFIGkudG9fZmlsZV9pZCBJTiAoJyArIHBsYWNlaG9sZGVycyArICcpJzsKICBjb25zdCBpbXBvcnRlZEJ5ID0gZGIucHJlcGFyZShpbXBvcnRRdWVyeSkuYWxsKC4uLm1hdGNoZWRGaWxlSWRzKS5tYXAociA9PiByLnBhdGgpOwogIAogIGNvbnN0IGNhbGxRdWVyeSA9ICdTRUxFQ1QgRElTVElOQ1QgZl9jYWxsZXIucGF0aCBGUk9NIGZpbGVzIGZfY2FsbGVyIEpPSU4gc3ltYm9scyBzX2NhbGxlciBPTiBmX2NhbGxlci5pZCA9IHNfY2FsbGVyLmZpbGVfaWQgSk9JTiBlZGdlcyBlIE9OIHNfY2FsbGVyLmlkID0gZS5mcm9tX3N5bWJvbCBKT0lOIHN5bWJvbHMgc190YXJnZXQgT04gZS50b19zeW1ib2wgPSBzX3RhcmdldC5pZCBXSEVSRSBzX3RhcmdldC5maWxlX2lkIElOICgnICsgcGxhY2Vob2xkZXJzICsgJyknOwogIGNvbnN0IGNhbGxlZEJ5ID0gZGIucHJlcGFyZShjYWxsUXVlcnkpLmFsbCguLi5tYXRjaGVkRmlsZUlkcykubWFwKHIgPT4gci5wYXRoKTsKICAKICBjb25zdCBkZXBlbmRlbnRzID0gbmV3IFNldCgpOwogIGZvciAoY29uc3QgcCBvZiBbLi4uaW1wb3J0ZWRCeSwgLi4uY2FsbGVkQnldKSB7CiAgICBpZiAoIW1hdGNoZWRQYXRocy5oYXMocCkpIHsKICAgICAgZGVwZW5kZW50cy5hZGQocCk7CiAgICB9CiAgfQogIAogIGNvbnN0IHJlc3VsdCA9IEFycmF5LmZyb20oZGVwZW5kZW50cykubWFwKCBwID0+IHsKICAgIHJldHVybiBwYXRoLnJlbGF0aXZlKHJlc29sdmVkLCBwKS5yZXBsYWNlKC9cXC9nLCAnLycpOwogIH0pOwogIAogIHJldHVybiByZXN1bHQuc2xpY2UoMCwgMjApOwp9Cgpjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShnZXRCbGFzdFJhZGl1cygpKSk7Cg==";
  fs.writeFileSync(HELPER_PATH, Buffer.from(helperBase64, 'base64').toString('utf8'), 'utf8');
  console.log('[COORDINATOR] Blast radius helper written to agent_work/blast_radius_helper.js');
} catch (err) {
  console.error('[COORDINATOR] Failed to write blast_radius_helper.js:', err.message);
}

// ── Transactional mission sandbox (git worktree) ────────────────────────────
// Agents run inside an isolated git worktree, never the live working tree. If the
// mission fails (or a gate rejects), the worktree is discarded — ZERO harm to the
// repo. If it passes, the work is committed inside the sandbox and cherry-picked
// back to the main repository without staging, keeping history clean and transaction-safe.
// Fail-safe: if git/worktrees aren't available, returns null and the mission runs
// in-place. Every git call uses windowsHide (no cmd flash).
const SANDBOX_ENABLED = process.env.PURPCLAW_MISSION_SANDBOX !== '0';
const GIT_OPTS = { cwd: PURP_DIR, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000, encoding: 'utf8' };

function createMissionSandbox(missionId) {
  if (!SANDBOX_ENABLED) return null;
  try {
    execSync('git rev-parse --is-inside-work-tree', { ...GIT_OPTS, stdio: 'ignore' });
    const safeId = String(missionId).replace(/[^a-zA-Z0-9._-]/g, '-');
    const wtPath = path.join(PURP_DIR, 'agent_work', 'worktrees', `sandbox-${safeId}`);
    fs.mkdirSync(path.dirname(wtPath), { recursive: true });
    execSync(`git worktree add --detach "${wtPath}" HEAD`, { ...GIT_OPTS, stdio: 'ignore' });
    return { path: wtPath, branch: 'detached' };
  } catch (e) {
    return { path: null, branch: null, unavailable: true, reason: (e.message || '').split('\n')[0].slice(0, 120) };
  }
}

function finalizeMissionSandbox(sandbox, missionId, success) {
  if (!sandbox || !sandbox.path) return;
  try {
    if (success) {
      log(missionId, `[SANDBOX] passed — checking for changes in sandbox: ${sandbox.path}`);
      let statusOut = '';
      try {
        statusOut = execSync('git status --porcelain', { ...GIT_OPTS, cwd: sandbox.path });
      } catch (stErr) {
        log(missionId, `[SANDBOX] error checking status: ${stErr.message}`);
      }

      if (statusOut && statusOut.trim()) {
        log(missionId, `[SANDBOX] changes detected. Committing in sandbox...`);
        try {
          execSync('git add -A', { ...GIT_OPTS, cwd: sandbox.path });
          execSync(`git commit -m "synthesis: completed mission ${missionId}"`, { ...GIT_OPTS, cwd: sandbox.path });
          const commitHash = execSync('git rev-parse HEAD', { ...GIT_OPTS, cwd: sandbox.path }).trim();
          log(missionId, `[SANDBOX] committed changes (hash: ${commitHash}). Removing sandbox worktree...`);
          
          try {
            execSync(`git worktree remove --force "${sandbox.path}"`, GIT_OPTS);
          } catch (wtRemoveErr) {
            log(missionId, `[SANDBOX] warning removing worktree: ${wtRemoveErr.message}`);
          }
          
          log(missionId, `[SANDBOX] cherry-picking commit ${commitHash} to main repo (no-commit)...`);
          try {
            execSync(`git cherry-pick --no-commit ${commitHash}`, GIT_OPTS);
            log(missionId, `[SANDBOX] cherry-pick successful. Changes are staged/unstaged in main working tree.`);
          } catch (cpErr) {
            log(missionId, `[SANDBOX] cherry-pick conflict or error: ${cpErr.message}`);
            log(missionId, `[SANDBOX] aborting cherry-pick...`);
            try {
              execSync('git cherry-pick --abort', GIT_OPTS);
            } catch (abortErr) {
              log(missionId, `[SANDBOX] error aborting cherry-pick: ${abortErr.message}`);
            }
            throw new Error(`Git transactional sandbox merge conflict during cherry-pick: ${cpErr.message}`);
          }
        } catch (innerErr) {
          try {
            if (fs.existsSync(sandbox.path)) {
              execSync(`git worktree remove --force "${sandbox.path}"`, GIT_OPTS);
            }
          } catch {}
          throw innerErr;
        }
      } else {
        log(missionId, `[SANDBOX] no changes detected in sandbox. Removing sandbox worktree...`);
        execSync(`git worktree remove --force "${sandbox.path}"`, GIT_OPTS);
      }
    } else {
      log(missionId, `[SANDBOX] failed — discarding sandbox; working tree untouched.`);
      try {
        execSync(`git worktree remove --force "${sandbox.path}"`, { ...GIT_OPTS, stdio: 'ignore' });
      } catch (wtErr) {
        log(missionId, `[SANDBOX] error removing worktree: ${wtErr.message}`);
      }
    }
  } catch (e) {
    log(missionId, `[SANDBOX] cleanup error: ${e.message}`);
    if (e.message.includes('conflict') || e.message.includes('cherry-pick')) {
      throw e;
    }
  } finally {
    try {
      execSync('git worktree prune', { ...GIT_OPTS, stdio: 'ignore' });
    } catch {}
  }
}

function getBlastRadiusFiles(repoPath, targetPatterns) {
  if (!targetPatterns || targetPatterns.length === 0) return [];
  try {
    const nodeBin = 'C:\\Users\\Admin\\AppData\\Local\\nvm\\v22.11.0\\node.exe';
    const helperPath = path.join(PURP_DIR, 'agent_work', 'blast_radius_helper.js');
    if (!fs.existsSync(helperPath)) {
      return [];
    }
    const proc = spawnSync(nodeBin, [helperPath, repoPath, JSON.stringify(targetPatterns)], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 15000
    });
    if (proc.status === 0 && proc.stdout) {
      return JSON.parse(proc.stdout.trim());
    } else {
      console.error('[COORDINATOR] getBlastRadiusFiles process exited with status', proc.status, proc.stderr);
      return [];
    }
  } catch (err) {
    console.error('[COORDINATOR] getBlastRadiusFiles error:', err.message);
    return [];
  }
}

// === DEPENDENCIES ===
let taskDecomposer = null;
try {
  taskDecomposer = require('./task_decomposer.js');
  console.log('[COORDINATOR] Task decomposer loaded');
} catch (e) {
  console.error('[COORDINATOR] Error loading task_decomposer.js:', e.message);
}

let agentScore = null;
try {
  agentScore = require('./agent_score.js');
  console.log('[COORDINATOR] Agent score registry loaded');
} catch (e) {
  console.log('[COORDINATOR] agent_score.js unavailable');
}

let contextPacket = null;
try {
  contextPacket = require('../../lib/context-packet.js');
  console.log('[COORDINATOR] Context packet engine loaded');
} catch (e) {
  console.error('[COORDINATOR] Error loading context-packet.js:', e.message);
}

let llmProvider = null;
try {
  llmProvider = require('../../lib/llm-provider.js');
  console.log('[COORDINATOR] LLM provider layer loaded');
} catch (e) {
  console.warn('[COORDINATOR] llm-provider.js unavailable');
}

let selfContext = null;
try {
  selfContext = require('../../lib/self-context.js');
  console.log('[COORDINATOR] Self-context loaded â€” agents will know the stack');
} catch (e) {
  console.warn('[COORDINATOR] self-context.js unavailable:', e.message);
}

let memoryClient = null;
try {
  memoryClient = require('../../lib/memory-client.js');
  console.log('[COORDINATOR] Memory client loaded');
} catch (e) {
  console.log('[COORDINATOR] memory-client.js unavailable');
}

// Cognitive spine on the LIVE mission path — mirrors orchestrator's hooks so the
// symbolic rules engine (facts) and autonomous diagnostics (events) actually get
// traffic when work flows through the swarm coordinator, not just the orchestrator.
let cogClient = null;
try {
  cogClient = require('../../lib/cognitive-client.js');
  console.log('[COORDINATOR] Cognitive client loaded — rules/diagnostics wired to swarm path');
} catch (e) {
  console.log('[COORDINATOR] cognitive-client.js unavailable — cognitive services disabled');
}

// === CONFIG ===
const PORT = parseInt(process.env.COORDINATOR_PORT || '7898', 10);
const TOWER_PORT = parseInt(process.env.TOWER_PORT || '7790', 10);
const EVENTBUS_PORT = 7782;
const MAX_ATTEMPTS_PER_SUBTASK = parseInt(process.env.HARNESS_MAX_ATTEMPTS || '2', 10);
const LESSONS_FILE = path.join(PURP_DIR, 'agent_work', 'harness_lessons.jsonl');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

// === MISSION STORAGE ===
const missions = new Map(); // missionId -> missionState

function log(missionId, ...args) {
  const ts = new Date().toISOString().split('T')[1].slice(0, -1);
  const prefix = missionId ? `[MISSION:${missionId}]` : '[COORDINATOR]';
  console.log(`${ts} ${prefix}`, ...args);
}

// === EVENTBUS PUBLISHER ===
function publishEvent(topic, data) {
  const payload = JSON.stringify({
    topic,
    ...data,
    timestamp: new Date().toISOString()
  });

  const req = http.request({
    hostname: '127.0.0.1',
    port: EVENTBUS_PORT,
    path: '/publish',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, (res) => {
    res.on('data', () => {}); // drain
  });

  req.on('error', (e) => {
    console.error('[COORDINATOR] EventBus publish error:', e.message);
  });

  req.write(payload);
  req.end();
}

function appendJsonl(filePath, row) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`, 'utf8');
  } catch {}
}

function compactText(value, max = 120) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

let _repoBasenameCache = null;
function getRepoBasenameCache() {
  if (_repoBasenameCache) return _repoBasenameCache;
  const seen = new Set();
  const skipDirs = new Set(['.git', '.next', 'node_modules', 'dist', 'build', 'coverage', 'logs', 'runtime', 'cache']);
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(full);
        continue;
      }
      seen.add(entry.name.toLowerCase());
    }
  };
  walk(PURP_DIR);
  _repoBasenameCache = seen;
  return _repoBasenameCache;
}

function cleanFileCitation(value) {
  let candidate = String(value || '').trim();
  candidate = candidate.replace(/^["'`([{<]+|["'`)\]}>.,;:]+$/g, '');
  candidate = candidate.replace(/\\/g, '/');
  candidate = candidate.replace(/:\d{1,6}(?::\d{1,6})?$/, '');
  candidate = candidate.replace(/^file:\/+/, '');
  if (/^[A-Za-z]:\//.test(candidate)) {
    const relative = path.relative(PURP_DIR, candidate);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      candidate = relative.replace(/\\/g, '/');
    }
  }
  candidate = candidate.replace(/^\/+/, '');
  return candidate;
}

function extractFileCitations(text) {
  const citations = new Set();
  const add = (value) => {
    const cleaned = cleanFileCitation(value);
    if (cleaned && /\.(?:cjs|mjs|jsx?|tsx?|json|md|css|scss|py|yml|yaml|toml|ps1|sh|sql)$/i.test(cleaned)) {
      citations.add(cleaned);
    }
  };

  for (const match of String(text || '').matchAll(/`([^`]+\.(?:cjs|mjs|jsx?|tsx?|json|md|css|scss|py|yml|yaml|toml|ps1|sh|sql)(?::\d{1,6})?)`/gi)) {
    add(match[1]);
  }
  for (const match of String(text || '').matchAll(/(?:^|[\s(["'])((?:[A-Za-z]:[\\/])?[\w@.+~ -]*(?:[\\/][\w@.+~ -]+)*[\\/][\w@.+~-]+\.(?:cjs|mjs|jsx?|tsx?|json|md|css|scss|py|yml|yaml|toml|ps1|sh|sql)(?::\d{1,6})?)(?=$|[\s)"',;\]])/gi)) {
    add(match[1]);
  }
  for (const match of String(text || '').matchAll(/(?:^|[\s`])((?:\/[\w@.+~-]+)+\.(?:cjs|mjs|jsx?|tsx?|json|md|css|scss|py|yml|yaml|toml|ps1|sh|sql)(?::\d{1,6})?)(?=$|[\s)"'`,;\]])/gi)) {
    add(match[1]);
  }
  for (const match of String(text || '').matchAll(/\b([\w@.+~-]+\.(?:cjs|mjs|jsx?|tsx?|json|md|css|scss|py|yml|yaml|toml|ps1|sh|sql))\b/gi)) {
    add(match[1]);
  }

  return [...citations];
}

function extractFunctionCitations(text) {
  const names = new Set();
  const add = (value) => {
    const name = String(value || '').trim();
    if (/^[A-Za-z_$][\w$]{2,80}$/.test(name)) names.add(name);
  };
  for (const match of String(text || '').matchAll(/`([A-Za-z_$][\w$]*)\s*\(\s*[^`)]*\)`/g)) {
    add(match[1]);
  }
  for (const match of String(text || '').matchAll(/\bFunction(?:s| Names?)?\s*:?\s*([A-Za-z_$][\w$]*)\s*\(/gi)) {
    add(match[1]);
  }
  return [...names];
}

function fileCitationExists(candidate) {
  const cleaned = cleanFileCitation(candidate);
  if (!cleaned) return false;
  if (cleaned.includes('/')) {
    return fs.existsSync(path.join(PURP_DIR, cleaned));
  }
  return fs.existsSync(path.join(PURP_DIR, cleaned)) || getRepoBasenameCache().has(cleaned.toLowerCase());
}

function resolveExistingCitation(candidate) {
  const cleaned = cleanFileCitation(candidate);
  if (!cleaned) return null;
  if (cleaned.includes('/')) {
    const full = path.join(PURP_DIR, cleaned);
    return fs.existsSync(full) ? full : null;
  }
  const rootFile = path.join(PURP_DIR, cleaned);
  if (fs.existsSync(rootFile)) return rootFile;
  const skipDirs = new Set(['.git', '.next', 'node_modules', 'dist', 'build', 'coverage', 'logs', 'runtime', 'cache']);
  const target = cleaned.toLowerCase();
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        const found = walk(full);
        if (found) return found;
      } else if (entry.name.toLowerCase() === target) {
        return full;
      }
    }
    return null;
  };
  return walk(PURP_DIR);
}

function functionExistsInFiles(name, files) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escaped}\\s*\\(`);
  for (const filePath of files) {
    try {
      if (pattern.test(fs.readFileSync(filePath, 'utf8'))) return true;
    } catch {}
  }
  return false;
}

function validateSubtaskOutput(subtask, output, mission) {
  const text = String(output || '').replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const taskText = `${mission?.task || ''} ${subtask?.text || ''}`.toLowerCase();
  const needsRepoGrounding = /purpclaw|repo context|live repo|this stack|this build|kernel jobs panel|upgrade/.test(taskText);
  const repoSignals = [
    /\.jsx?\b/i,
    /\.tsx?\b/i,
    /\/api\//i,
    /\b:\d{4}\b/,
    /\bunified_api\b/i,
    /\bagent_tower\b/i,
    /\bswarm_coordinator\b/i,
    /\bmission control\b/i,
    /\bkernel job/i,
    /\bvoice_coordinator\b/i,
    /\bself-context\b/i,
  ];

  if (text.length < 80) {
    return { ok: false, reason: 'output-too-short' };
  }

  if (/\b(i do not have|i don't have|no context|need the repo|drop the repo|cannot operate|unable to proceed|please provide|paste the entry files)\b/i.test(text)) {
    return { ok: false, reason: 'worker-declared-missing-context' };
  }

  if (/\bexample modification|example update|hypothetical|placeholder\b/i.test(text) && !/\b(actual|existing|verified|observed|found|file|function|endpoint)\b/i.test(text)) {
    return { ok: false, reason: 'generic-example-output' };
  }

  if (/\[(?:insert|todo|tbd|placeholder)[^\]]*\]/i.test(text)) {
    return { ok: false, reason: 'placeholder-left-in-output' };
  }

  if (needsRepoGrounding) {
    const signalCount = repoSignals.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
    if (signalCount < 2) {
      return { ok: false, reason: 'not-grounded-in-live-stack' };
    }

    const citations = extractFileCitations(text);
    const checkedFiles = citations.map(file => ({ file, exists: fileCitationExists(file) }));
    const missingFiles = checkedFiles.filter(item => !item.exists).map(item => item.file);
    const existingFiles = checkedFiles.filter(item => item.exists).map(item => item.file);
    if (missingFiles.length > 0 && (existingFiles.length === 0 || missingFiles.length >= existingFiles.length || missingFiles.some(file => file.includes('/')))) {
      return {
        ok: false,
        reason: 'fabricated-file-citations',
        checkedFiles: checkedFiles.slice(0, 12),
        missingFiles: missingFiles.slice(0, 12),
      };
    }
    if (/audit|inspect|fix|build|implement|upgrade|kernel|voice|mission|stack/.test(taskText) && existingFiles.length === 0) {
      return { ok: false, reason: 'no-verified-file-citations', checkedFiles: checkedFiles.slice(0, 12) };
    }

    const resolvedFiles = citations.map(resolveExistingCitation).filter(Boolean);
    const functions = extractFunctionCitations(text);
    if (functions.length > 0 && resolvedFiles.length > 0) {
      const checkedFunctions = functions.map(name => ({ name, exists: functionExistsInFiles(name, resolvedFiles) }));
      const missingFunctions = checkedFunctions.filter(item => !item.exists).map(item => item.name);
      const existingFunctions = checkedFunctions.filter(item => item.exists).map(item => item.name);
      if (missingFunctions.length > 0 && (existingFunctions.length === 0 || missingFunctions.length >= existingFunctions.length)) {
        return {
          ok: false,
          reason: 'fabricated-function-citations',
          checkedFunctions: checkedFunctions.slice(0, 16),
          missingFunctions: missingFunctions.slice(0, 16),
        };
      }
    }
  }

  if (/\bno further modifications are needed\b/i.test(text) && /upgrade|panel|fix|build|implement/.test(taskText)) {
    return { ok: false, reason: 'premature-noop-for-action-task' };
  }

  // Real-execution gate: a task that asks the agent to DO something (create a
  // file, write code, run a command) must show evidence it actually called a
  // tool. The tower appends executed calls as "[toolname] {args} → result"
  // lines (agent_tower.js). Prose with no such marker = the agent talked or
  // hallucinated instead of acting (this is exactly what slipped through and
  // reported "completed" without writing the file). Use the RAW output here,
  // not the whitespace-collapsed `text`, so the marker lines survive.
  const rawOutput = String(output || '');
  const actionTask = /\b(create|write|save|build|implement|add|edit|modify|generate|fix|delete|remove|run|execute|rename|append|patch)\b/i.test(taskText);
  const hasToolExecutionEvidence = /\[[a-z][\w.-]*\]\s*\{[\s\S]{0,400}?\}\s*→/i.test(rawOutput);
  if (actionTask && !hasToolExecutionEvidence) {
    return { ok: false, reason: 'no-tool-execution-evidence' };
  }

  return { ok: true, reason: 'accepted' };
}

function recordAgentOutcome(subtask, success, durationMs, extras = {}) {
  if (!agentScore || !subtask?.agent) return;
  try {
    agentScore.recordTask(subtask.agent, subtask.domain || 'swarm', Boolean(success), Math.max(0, durationMs || 0), {
      source: 'swarm_coordinator',
      missionId: extras.missionId,
      subtaskId: subtask.id,
      route: extras.route,
      error: extras.error ? compactText(extras.error, 180) : undefined,
    });
  } catch {}
}

async function rememberLesson(mission, subtask, success) {
  const lesson = {
    timestamp: new Date().toISOString(),
    source: 'swarm_coordinator',
    missionId: mission.missionId,
    task: compactText(mission.task, 240),
    subtaskId: subtask.id,
    domain: subtask.domain,
    agent: subtask.agent,
    success: Boolean(success),
    attempts: subtask.attempts,
    text: compactText(subtask.text, 240),
    outputPreview: compactText(subtask.output || subtask.error || '', 900),
  };

  appendJsonl(LESSONS_FILE, lesson);
  mission.lessons = mission.lessons || [];
  mission.lessons.push(lesson);

  if (memoryClient) {
    try {
      lesson.memoryId = await memoryClient.postTask(
        subtask.text,
        `${success ? 'COMPLETED' : 'FAILED'} ${subtask.domain}/${subtask.agent}: ${subtask.output || subtask.error || ''}`,
        subtask.agent,
        Boolean(success)
      );
    } catch {}
  }
  return lesson;
}

function rankedRetryCandidates(domain, failedAgent) {
  const preferred = taskDecomposer?.DOMAIN_DEFS?.[domain]?.preferred || [];
  const candidates = preferred.filter(a => a !== failedAgent);
  if (!agentScore) return candidates;
  try {
    const ranked = agentScore.getAgentsForIntent(domain, 10)
      .map(row => row.agent)
      .filter(agent => candidates.includes(agent));
    return [...new Set([...ranked, ...candidates])];
  } catch {
    return candidates;
  }
}

// === TOWER REQUEST HELPER ===
let towerDispatcher = null;

function setTowerDispatcher(dispatcher) {
  towerDispatcher = typeof dispatcher === 'function' ? dispatcher : null;
}

function towerRequest(method, path, body) {
  if (towerDispatcher) {
    return towerDispatcher(method, path, body);
  }

  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: TOWER_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { resolve(d); }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// === GRAPH RUNNER ===
async function coordinateMission(missionId, task, options = {}) {
  const mission = {
    missionId,
    task,
    status: 'decomposing',
    startTime: new Date().toISOString(),
    endTime: null,
    subtasks: [],
    synthesis: null,
    error: null,
    lessons: [],
    trace: [],
    metrics: {
      startedAtMs: Date.now(),
      completedSubtasks: 0,
      failedSubtasks: 0,
      retries: 0,
      towerCalls: 0,
      agentScoreRecords: 0,
      memoryLessons: 0,
      passAt1: 0,
      passAt3: 0,
      durationMs: 0
    }
  };

  missions.set(missionId, mission);
  log(missionId, `Starting mission for task: "${task.substring(0, 80)}..."`);
  publishEvent('swarm.coordinator.started', { missionId, task });

  // Transactional isolation: agents run in a throwaway git worktree, not the live
  // tree. Discarded on failure (zero harm), kept on a branch on success.
  mission.sandbox = createMissionSandbox(missionId);
  if (mission.sandbox && mission.sandbox.path) {
    log(missionId, `[SANDBOX] isolated worktree: ${mission.sandbox.path} (branch ${mission.sandbox.branch})`);
  } else if (mission.sandbox && mission.sandbox.unavailable) {
    log(missionId, `[SANDBOX] running in-place (git worktree unavailable: ${mission.sandbox.reason})`);
  }

  try {
    if (!taskDecomposer) {
      throw new Error('task_decomposer.js module is missing');
    }

    let decomposed = taskDecomposer.decomposeTask(task, options.intent || null, agentScore);
    // Simple task â€” wrap as single subtask rather than failing
    if (!decomposed) {
      const domain = options.intent || 'backend';
      const agentName = (agentScore && typeof agentScore.getBestAgent === 'function')
        ? agentScore.getBestAgent(domain) || 'robot'
        : 'robot';
      decomposed = {
        originalTask: task,
        requiresTeam: false,
        summary: `Single-agent task: ${task.slice(0, 80)}`,
        subtasks: [{
          id: 'subtask-1-single',
          text: task,
          domain,
          agent: agentName,
          executionOrder: 1,
          dependsOn: [],
          ownedPatterns: [],
          contextPacket: null,
          contextDepth: 'standard',
        }],
        executionGraph: [],
      };
    }

    mission.subtasks = decomposed.subtasks.map(s => ({
      id: s.id,
      text: s.text,
      domain: s.domain,
      agent: s.agent,
      originalAgent: s.agent,
      executionOrder: s.executionOrder,
      dependsOn: s.dependsOn,
      ownedPatterns: s.ownedPatterns.map(p => p.toString()),
      contextDepth: s.contextDepth || 'standard',
      status: 'pending', // pending, running, completed, failed
      attempts: 0,
      output: null,
      error: null,
      retryHistory: [],
      validation: null,
      startedAt: null,
      endTime: null,
      durationMs: 0,
      scoreRouting: agentScore ? (agentScore.getAgentsForIntent(s.domain, 5) || []) : []
    }));

    mission.status = 'running';
    log(missionId, `Decomposed into ${mission.subtasks.length} execution lanes.`);
    publishEvent('swarm.coordinator.decomposed', { missionId, subtasks: mission.subtasks });

    // Initialize context packet
    if (contextPacket) {
      contextPacket.init(missionId, {
        command: task,
        intent: options.intent || 'swarm',
        team: mission.subtasks.map(s => s.agent)
      });
    }

    // Graph runner loop
    while (mission.status === 'running') {
      const pending = mission.subtasks.filter(s => s.status === 'pending');
      const running = mission.subtasks.filter(s => s.status === 'running');
      const completed = mission.subtasks.filter(s => s.status === 'completed');
      const failed = mission.subtasks.filter(s => s.status === 'failed');

      if (pending.length === 0 && running.length === 0) {
        // Graph is fully walked!
        break;
      }

      // Check if we are permanently stuck (e.g. cycles or unresolvable failures)
      if (running.length === 0 && pending.length > 0) {
        // If there are pending tasks but none can run due to dependencies not matching completed...
        const runnable = pending.filter(s => {
          return s.dependsOn.every(depId => completed.some(c => c.id === depId));
        });

        if (runnable.length === 0) {
          throw new Error('Deadlock detected in graph execution. Dependency requirements cannot be met.');
        }
      }

      // Find runnable tasks (all dependencies must be completed)
      const toLaunch = pending.filter(s => {
        return s.dependsOn.every(depId => completed.some(c => c.id === depId));
      });

      if (toLaunch.length > 0) {
        log(missionId, `Launching parallel batch of ${toLaunch.length} subtask(s)...`);

        // Execute batch concurrently
        await Promise.all(toLaunch.map(async (subtask) => {
          subtask.status = 'running';
          subtask.startedAt = new Date().toISOString();
          subtask.attempts++;
          log(missionId, `Dispatching ${subtask.agent} on domain [${subtask.domain}] (subtask text: "${subtask.text.substring(0, 60)}...")`);
          publishEvent('swarm.coordinator.subtask.running', { missionId, subtask });

          let success = false;
          const executionMode = options.executionMode || 'live';
          let capacityWaits = 0;

          while (!success && subtask.attempts <= MAX_ATTEMPTS_PER_SUBTASK) {
            const attemptStartedAt = Date.now();
            try {
              // 1. Context forwarding block
              let handoffContext = '';
              if (contextPacket) {
                handoffContext = contextPacket.readHandoff(missionId, subtask.agent) || '';
              }

              // Build constraints block based on ownershipLocks
              const myFocus = subtask.ownedPatterns.join(', ');
              const otherLanes = mission.subtasks
                .filter(s => s.id !== subtask.id)
                .map(s => `  - ${s.agent}: ${s.ownedPatterns.join(', ')}`)
                .join('\n');

              let blastRadiusBlock = '';
              if (subtask.ownedPatterns && subtask.ownedPatterns.length > 0) {
                try {
                  const blastFiles = getBlastRadiusFiles(PURP_DIR, subtask.ownedPatterns);
                  if (blastFiles && blastFiles.length > 0) {
                    blastRadiusBlock = [
                      'Read-only reference context (do NOT modify; check for import breaks):',
                      ...blastFiles.map(f => `  - ${f}`)
                    ].join('\n');
                  }
                } catch (blastErr) {
                  log(missionId, `[BLAST_RADIUS] Query error for ${subtask.agent}: ${blastErr.message}`);
                }
              }

              const constraintBlock = [
                '## EXECUTE NOW',
                `Your scope: ${subtask.domain} (${myFocus})`,
                'Do NOT discuss. Do NOT ask for confirmation. Use your file/edit/read tools immediately to implement the task below.',
                otherLanes ? `Other agents are handling:\n${otherLanes}\nDo NOT duplicate or modify files outside your scope.` : null,
                blastRadiusBlock ? `\n${blastRadiusBlock}` : null,
                ''
              ].filter(Boolean).join('\n');

              // Recall memories relevant to the subtask
              let subtaskMemoryContext = '';
              if (memoryClient) {
                try {
                  const query = `${subtask.domain} ${subtask.text}`.substring(0, 200);
                  const recallResult = await memoryClient.recall(query, { limit: 4 });
                  subtaskMemoryContext = recallResult?.formatted || '';
                } catch (memErr) {
                  log(missionId, `[SWARM_MEMORY] Recall error for ${subtask.agent}: ${memErr.message}`);
                }
              }

              const fullTaskDesc = [
                `IMPLEMENT: ${subtask.text}`,
                constraintBlock,
                handoffContext ? handoffContext : null,
                subtaskMemoryContext ? subtaskMemoryContext : (options.memoryContext ? `## Swarm Memory context:\n${options.memoryContext}` : null)
              ].filter(Boolean).join('\n\n');

              // 2. Agent Execution: live tower dispatch only.
              let spawnResult = null;
              if (executionMode === 'live') {
                mission.metrics.towerCalls++;
                spawnResult = await towerRequest('POST', '/api/spawn/await', {
                  agentName: subtask.agent,
                  task: fullTaskDesc,
                  options: { workflowId: missionId, intent: options.intent || 'swarm', teamId: missionId, role: 'member', deferContextWrite: true, sandboxDir: (mission.sandbox && mission.sandbox.path) || undefined },
                  timeoutMs: 120000
                });
              } else {
                throw new Error(`Unsupported executionMode "${executionMode}". PURPCLAW harness requires live dispatch.`);
              }

              if (spawnResult && spawnResult.success) {
                const validation = validateSubtaskOutput(subtask, spawnResult.output, mission);
                subtask.validation = validation;
                if (!validation.ok) {
                  throw new Error(`Worker output rejected by validation gate: ${validation.reason}`);
                }

                subtask.status = 'completed';
                subtask.output = spawnResult.output;
                // Carry tool-call evidence so swarm runs REPORT the real work
                // (the tower now returns it; without this it dropped here).
                subtask.toolCalls = Array.isArray(spawnResult.toolCalls) ? spawnResult.toolCalls : [];
                subtask.provider = spawnResult.provider || null;
                subtask.model = spawnResult.model || null;
                subtask.endTime = new Date().toISOString();
                subtask.durationMs = Date.now() - attemptStartedAt;
                success = true;
                mission.metrics.completedSubtasks++;
                if (subtask.attempts === 1) mission.metrics.passAt1++;
                if (subtask.attempts <= 3) mission.metrics.passAt3++;
                recordAgentOutcome(subtask, true, subtask.durationMs, { missionId, route: executionMode });
                mission.metrics.agentScoreRecords++;
                await rememberLesson(mission, subtask, true);
                mission.metrics.memoryLessons++;
                log(missionId, `Subtask completed successfully by ${subtask.agent}!`);
                publishEvent('swarm.coordinator.subtask.completed', { missionId, subtask });

                // Feed the cognitive spine: assert facts to the rules engine + report to diagnostics.
                if (cogClient) {
                  const cogIntent = options.intent || 'swarm';
                  cogClient.assertFact('completed_task', [subtask.agent, missionId, cogIntent], 'swarm-coordinator').catch(() => {});
                  cogClient.assertFact('successful_agent', [subtask.agent, subtask.domain || cogIntent], 'swarm-coordinator').catch(() => {});
                  cogClient.reportEvent({ type: 'swarm.subtask.completed', missionId, agent: subtask.agent, domain: subtask.domain, durationMs: subtask.durationMs }).catch(() => {});
                  cogClient.updateModalState(subtask.agent, { prop: `capable_of_${subtask.domain || cogIntent}`, value: true }).catch(() => {});
                  cogClient.updateModalState(subtask.agent, { prop: `knows_success_for_${subtask.agent}`, value: true }).catch(() => {});
                }

                // Explicit write to ensure handoff matches
                if (contextPacket) {
                  contextPacket.write(missionId, subtask.agent, spawnResult.output, {
                    intent: options.intent || 'swarm',
                    success: true
                  });
                }
              } else {
                throw new Error(spawnResult?.output || spawnResult?.error || 'Unknown execution error');
              }
            } catch (err) {
              log(missionId, `Subtask execution error for ${subtask.agent}: ${err.message}`);
              subtask.error = err.message;
              subtask.durationMs = Date.now() - attemptStartedAt;
              if (/\b(division cap reached|agent cap reached|tower capacity|spawn capacity|max active)\b/i.test(err.message) && capacityWaits < 12) {
                capacityWaits++;
                log(missionId, `[CAPACITY] ${subtask.agent} is temporarily capped. Waiting before retry ${capacityWaits}/12...`);
                await new Promise(r => setTimeout(r, 5000));
                continue;
              }
              recordAgentOutcome(subtask, false, subtask.durationMs, { missionId, route: executionMode, error: err.message });
              mission.metrics.agentScoreRecords++;

              if (subtask.attempts < MAX_ATTEMPTS_PER_SUBTASK) {
                const retryCandidates = rankedRetryCandidates(subtask.domain, subtask.agent);

                if (retryCandidates.length > 0) {
                  const nextAgent = retryCandidates[0];
                  log(missionId, `[RETRY] Domain [${subtask.domain}] failed with ${subtask.agent}. Switching to alternate agent: ${nextAgent}...`);
                  subtask.retryHistory.push({
                    from: subtask.agent,
                    to: nextAgent,
                    error: compactText(err.message, 180),
                    at: new Date().toISOString()
                  });
                  subtask.agent = nextAgent;
                  subtask.attempts++;
                  mission.metrics.retries++;
                } else {
                  subtask.attempts = 99; // no retry candidates, stop retry loop
                }
              } else {
                subtask.status = 'failed';
                subtask.endTime = new Date().toISOString();
                mission.metrics.failedSubtasks++;
                await rememberLesson(mission, subtask, false);
                mission.metrics.memoryLessons++;
                log(missionId, `Subtask permanently failed after max retries.`);
                publishEvent('swarm.coordinator.subtask.failed', { missionId, subtask });
                if (cogClient) {
                  cogClient.assertFact('failed_task', [subtask.agent, missionId, subtask.domain || 'swarm'], 'swarm-coordinator').catch(() => {});
                  cogClient.reportEvent({ type: 'swarm.subtask.failed', missionId, agent: subtask.agent, domain: subtask.domain, error: subtask.error }).catch(() => {});
                  cogClient.updateModalState(subtask.agent, { prop: `capable_of_${subtask.domain || 'swarm'}`, value: false, mode: 'belief' }).catch(() => {});
                }
                break;
              }
            }
          }

          if (!success) {
            subtask.status = 'failed';
            subtask.endTime = subtask.endTime || new Date().toISOString();
            if (!mission.metrics.failedSubtasks) {
              mission.metrics.failedSubtasks++;
              await rememberLesson(mission, subtask, false);
              mission.metrics.memoryLessons++;
              publishEvent('swarm.coordinator.subtask.failed', { missionId, subtask });
            }
            // Fail the entire mission if a critical subtask fails
            throw new Error(`Critical domain failure in [${subtask.domain}] handled by ${subtask.agent}: ${subtask.error}`);
          }
        }));
      }

      // Small pause to prevent rapid looping
      await new Promise(r => setTimeout(r, 200));
    }

    // === PHASE 3: SYNTHESIS ===
    mission.status = 'synthesizing';
    log(missionId, 'All lanes completed! Entering high-context synthesis phase...');
    publishEvent('swarm.coordinator.synthesizing', { missionId });

    if (contextPacket) {
      const localSynthesis = contextPacket.synthesize(missionId);
      
      let finalSummary = localSynthesis.combinedOutput;
      
      if (llmProvider && options.executionMode === 'live') {
        log(missionId, 'Invoking LLM for swarm synthesis merge...');
        try {
          const systemPrompt = `You are the PURPCLAW Swarm Synthesis Governor.
Your job is to merge, clean, and consolidate the contributions of multiple specialized agent workers into one cohesive, single-deliverable response.

Task Context:
Original overall objective: "${task}"

Agent Contributions:
${localSynthesis.combinedOutput}

Requirements:
- Resolve any discrepancies or overlapping details between workers.
- Compile and present all code modifications, architectures, and scripts cohesively.
- Deliver a premium, direct, and complete final response. Do not include meta comments, conversational filler, or debug logs.`;

          const userPrompt = `ORIGINAL TASK:
${task}

AGENT WORKER CONTRIBUTIONS:
${localSynthesis.combinedOutput}

Synthesize the contributions into the final cohesive answer.`;

          const llmResp = await llmProvider.swarm([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ], { maxTokens: 8192, temperature: 0.3 });

          if (llmResp && llmResp.content) {
            finalSummary = llmResp.content;
            log(missionId, 'LLM synthesis completed successfully.');
          }
        } catch (llmErr) {
          log(missionId, `LLM synthesis failed: ${llmErr.message}. Falling back to combined narrative.`);
        }
      }

      mission.synthesis = {
        summary: finalSummary,
        filesModified: localSynthesis.filesModified || [],
        issuesFound: localSynthesis.issuesFound || [],
        validationStatus: localSynthesis.validationStatus || 'COMPLETED',
        workerCount: mission.subtasks.length,
        metrics: {
          completedSubtasks: mission.metrics.completedSubtasks,
          failedSubtasks: mission.metrics.failedSubtasks,
          retries: mission.metrics.retries,
          passAt1: mission.metrics.passAt1,
          passAt3: mission.metrics.passAt3,
          memoryLessons: mission.metrics.memoryLessons,
          agentScoreRecords: mission.metrics.agentScoreRecords
        }
      };
    } else {
      mission.synthesis = {
        summary: 'Missions executed successfully (context packet unavailable).',
        filesModified: [],
        issuesFound: [],
        validationStatus: 'UNKNOWN',
        workerCount: mission.subtasks.length,
        metrics: {
          completedSubtasks: mission.metrics.completedSubtasks,
          failedSubtasks: mission.metrics.failedSubtasks,
          retries: mission.metrics.retries,
          passAt1: mission.metrics.passAt1,
          passAt3: mission.metrics.passAt3,
          memoryLessons: mission.metrics.memoryLessons,
          agentScoreRecords: mission.metrics.agentScoreRecords
        }
      };
    }

    mission.status = 'completed';
    mission.endTime = new Date().toISOString();
    mission.metrics.durationMs = Date.now() - mission.metrics.startedAtMs;
    log(missionId, 'Mission completed successfully!');

    // Finalize the sandbox on success. If this throws (e.g. cherry-pick merge conflict),
    // it will bubble to the catch block and mark the mission as failed.
    finalizeMissionSandbox(mission.sandbox, missionId, true);

    publishEvent('swarm.coordinator.complete', { missionId, synthesis: mission.synthesis });

    // State cleanup (keeping the result)
    if (contextPacket) {
      contextPacket.cleanup(missionId, { keepResult: true });
    }

  } catch (err) {
    mission.status = 'failed';
    mission.error = err.message;
    mission.endTime = new Date().toISOString();
    mission.metrics.durationMs = Date.now() - mission.metrics.startedAtMs;
    log(missionId, `Mission failed: ${err.message}`);

    // Discard sandbox on failure
    try {
      finalizeMissionSandbox(mission.sandbox, missionId, false);
    } catch (cleanErr) {
      log(missionId, `Error during sandbox cleanup on failure: ${cleanErr.message}`);
    }

    publishEvent('swarm.coordinator.failed', { missionId, error: err.message });
  }

  return mission;
}

function createMissionId(prefix = 'mission') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function startMission(task, options = {}) {
  const missionId = options.workflowId || options.missionId || createMissionId('harness');
  coordinateMission(missionId, task, options).catch((err) => {
    const mission = missions.get(missionId);
    if (mission) {
      mission.status = 'failed';
      mission.error = err.message;
      mission.endTime = new Date().toISOString();
    }
  });
  return missions.get(missionId) || {
    missionId,
    task,
    status: 'queued',
    startTime: new Date().toISOString(),
    endTime: null,
    subtasks: [],
    synthesis: null,
    error: null
  };
}

function listMissions() {
  return Array.from(missions.values()).map(m => ({
    missionId: m.missionId,
    task: m.task,
    status: m.status,
    startTime: m.startTime,
    endTime: m.endTime,
    subtaskCount: m.subtasks.length,
    hasError: !!m.error,
    metrics: m.metrics ? {
      completedSubtasks: m.metrics.completedSubtasks,
      failedSubtasks: m.metrics.failedSubtasks,
      retries: m.metrics.retries,
      passAt1: m.metrics.passAt1,
      durationMs: m.metrics.durationMs
    } : null
  }));
}

function getMission(missionId) {
  return missions.get(missionId) || null;
}

function abortMission(missionId) {
  const mission = missions.get(missionId);
  if (!mission) return { success: false, error: 'Mission not found' };
  log(missionId, 'Aborting mission...');
  mission.status = 'aborted';
  mission.endTime = new Date().toISOString();
  for (const subtask of mission.subtasks) {
    if (subtask.status === 'running') {
      log(missionId, `Killing active agent ${subtask.agent}...`);
      towerRequest('POST', '/api/kill', { agentName: subtask.agent }).catch(() => {});
    }
  }
  return { success: true, message: 'Mission aborted', missionId };
}

// === HTTP ROUTING SERVER ===
function createCoordinatorServer() {
  return http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // GET /health
  if (pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, CORS_HEADERS);
    res.end(JSON.stringify({
      status: 'operational',
      uptime: process.uptime(),
      activeMissions: Array.from(missions.values()).filter(m => m.status === 'running' || m.status === 'synthesizing').length
    }));
    return;
  }

  // GET /api/status
  if ((pathname === '/api/status' || pathname === '/api/status/') && req.method === 'GET') {
    res.writeHead(200, CORS_HEADERS);
    res.end(JSON.stringify({
      status: 'operational',
      uptime: process.uptime(),
      activeMissions: Array.from(missions.values()).filter(m => m.status === 'running' || m.status === 'synthesizing').length,
      totalMissions: missions.size
    }));
    return;
  }

  // POST /api/decompose
  if ((pathname === '/api/decompose' || pathname === '/api/decompose/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { task } = JSON.parse(body || '{}');
        if (!task) {
          res.writeHead(400, CORS_HEADERS);
          res.end(JSON.stringify({ success: false, error: 'task is required' }));
          return;
        }
        const missionId = `decompose-${Date.now()}`;
        const result = await coordinateMission(missionId, task, { intent: 'decompose' });
        res.writeHead(200, CORS_HEADERS);
        res.end(JSON.stringify({ success: result.status === 'completed', missionId, ...result }));
      } catch (e) {
        res.writeHead(500, CORS_HEADERS);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // POST /api/coordinate
  if (pathname === '/api/coordinate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { task, workflowId, intent, options } = JSON.parse(body || '{}');
        if (!task) {
          res.writeHead(400, CORS_HEADERS);
          res.end(JSON.stringify({ success: false, error: 'task is required' }));
          return;
        }

        const missionId = workflowId || `mission-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        
        // Return 202 accepted or await depending on options
        // For ease of Orchestrator await loops, we run synchronously and return the result
        const result = await coordinateMission(missionId, task, { intent, ...options });
        
        res.writeHead(result.status === 'completed' ? 200 : 500, CORS_HEADERS);
        res.end(JSON.stringify({
          success: result.status === 'completed',
          missionId,
          ...result
        }));
      } catch (e) {
        res.writeHead(500, CORS_HEADERS);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // GET /api/missions
  if (pathname === '/api/missions' && req.method === 'GET') {
    res.writeHead(200, CORS_HEADERS);
    res.end(JSON.stringify(Array.from(missions.values()).map(m => ({
      missionId: m.missionId,
      status: m.status,
      startTime: m.startTime,
      endTime: m.endTime,
      subtaskCount: m.subtasks.length,
      hasError: !!m.error
    }))));
    return;
  }

  // GET /api/missions/:id
  if (pathname.startsWith('/api/missions/') && req.method === 'GET') {
    const missionId = pathname.split('/')[3];
    const mission = missions.get(missionId);
    if (!mission) {
      res.writeHead(404, CORS_HEADERS);
      res.end(JSON.stringify({ success: false, error: 'Mission not found' }));
      return;
    }

    res.writeHead(200, CORS_HEADERS);
    res.end(JSON.stringify(mission));
    return;
  }

  // POST /api/missions/:id/abort
  if (pathname.startsWith('/api/missions/') && pathname.endsWith('/abort') && req.method === 'POST') {
    const missionId = pathname.split('/')[3];
    const mission = missions.get(missionId);
    if (!mission) {
      res.writeHead(404, CORS_HEADERS);
      res.end(JSON.stringify({ success: false, error: 'Mission not found' }));
      return;
    }

    log(missionId, 'Aborting mission...');
    mission.status = 'aborted';
    mission.endTime = new Date().toISOString();
    
    // Kill any active agents for this mission
    for (const subtask of mission.subtasks) {
      if (subtask.status === 'running') {
        log(missionId, `Killing active agent ${subtask.agent}...`);
        towerRequest('POST', '/api/kill', { agentName: subtask.agent }).catch(() => {});
      }
    }

    res.writeHead(200, CORS_HEADERS);
    res.end(JSON.stringify({ success: true, message: 'Mission aborted', missionId }));
    return;
  }

  res.writeHead(404, CORS_HEADERS);
  res.end(JSON.stringify({ error: 'Not Found' }));
  });
}

const server = createCoordinatorServer();

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[COORDINATOR] Swarm Coordinator listening on port ${PORT}`);
  });

  process.on('SIGINT', () => {
    console.log('[COORDINATOR] Shutting down Swarm Coordinator...');
    server.close();
    process.exit(0);
  });
}

module.exports = {
  coordinateMission,
  startMission,
  listMissions,
  getMission,
  abortMission,
  setTowerDispatcher,
  createCoordinatorServer,
  missions
};
