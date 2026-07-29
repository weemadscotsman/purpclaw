'use strict';
/**
 * lib/project-requirements.js — Project-level requirements.toml
 * 
 * Codex's requirements.toml feature: per-project dependency manifest that
 * declares skills, hooks, config overrides, and execution policy for a
 * workspace. PurpClaw reads .purpclaw/requirements.toml in any project dir.
 * 
 * Format (TOML):
 *   [project]
 *   name = "my-project"
 *   version = "0.1.0"
 *   description = "..."
 * 
 *   [requirements]
 *   skills = ["code-review", "web-scraper", "testing"]
 *   providers = ["openrouter", "anthropic"]
 *   default-model = "anthropic/claude-sonnet-4"
 * 
 *   [hooks]
 *   pre-run = ["echo 'starting'"]
 *   post-run = ["echo 'done'"]
 *   allow-managed-hooks-only = true   ← Codex equivalent
 * 
 *   [execution]
 *   sandbox = true
 *   allowed-commands = ["git", "node", "npm", "python"]
 *   disallowed-commands = ["rm -rf /", "mkfs"]
 *   max-file-size-kb = 10240
 *   max-total-size-mb = 512
 *   max-runtime-sec = 3600
 *   require-confirmation = ["git push", "npm publish"]
 * 
 *   [workspace]
 *   root = "."          # project root (default: .)
 *   skills-dir = ".purpclaw/skills"
 *   memory-dir = ".purpclaw/memory"
 * 
 * Usage:
 *   const { loadProjectRequirements, mergeWithEnv, enforcePolicy } = require('./project-requirements');
 *   const reqs = loadProjectRequirements('/path/to/project');
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── TOML parser (minimal — no dep) ────────────────────────────────────────────

function parseTOML(text) {
  const result = {};
  let section = result;
  let currentSection = '';
  const lines = text.split(/\r?\n/);
  
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    
    // Section header
    const secMatch = line.match(/^\[([^\]]+)\]$/);
    if (secMatch) {
      currentSection = secMatch[1];
      const parts = currentSection.split('.');
      section = result;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (!section[p]) section[p] = {};
        section = section[p];
      }
      continue;
    }
    
    // Key = value
    const kvMatch = line.match(/^([^=]+?)\s*=\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      let val = kvMatch[2].trim();
      // String
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // Array
      else if (val.startsWith('[') && val.endsWith(']')) {
        const inner = val.slice(1, -1).trim();
        if (inner) {
          val = inner.split(',').map(v => {
            v = v.trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
            return v;
          });
        } else {
          val = [];
        }
      }
      // Boolean
      else if (val === 'true') val = true;
      else if (val === 'false') val = false;
      // Number
      else if (/^\d+$/.test(val)) val = parseInt(val, 10);
      else if (/^\d+\.\d+$/.test(val)) val = parseFloat(val);
      section[key] = val;
    }
  }
  return result;
}

// ── Load ──────────────────────────────────────────────────────────────────────

const DEFAULT_REQUIREMENTS = path.join('.purpclaw', 'requirements.toml');

/**
 * Load requirements.toml for a project directory.
 * @param {string} projectDir - project root
 * @returns {{ requirements: object|null, path: string|null, errors: string[] }}
 */
function loadProjectRequirements(projectDir) {
  const reqPath = path.isAbsolute(projectDir)
    ? path.join(projectDir, DEFAULT_REQUIREMENTS)
    : path.resolve(projectDir, DEFAULT_REQUIREMENTS);

  if (!fs.existsSync(reqPath)) {
    return { requirements: null, path: null, errors: [] };
  }

  const errors = [];
  try {
    const text = fs.readFileSync(reqPath, 'utf8');
    const reqs = parseTOML(text);
    return { requirements: reqs, path: reqPath, errors: [] };
  } catch (e) {
    errors.push(`Failed to parse ${reqPath}: ${e.message}`);
    return { requirements: null, path: reqPath, errors };
  }
}

// ── Merge with env / global config ─────────────────────────────────────────────

/**
 * Merge project requirements with global environment settings.
 * Project requirements override global defaults.
 */
function mergeWithEnv(reqs, globalConfig = {}) {
  if (!reqs) return globalConfig;
  return {
    ...globalConfig,
    ...reqs,
    requirements: {
      ...(globalConfig.requirements || {}),
      ...(reqs.requirements || {}),
    },
    hooks: {
      ...(globalConfig.hooks || {}),
      ...(reqs.hooks || {}),
    },
    execution: {
      ...(globalConfig.execution || {}),
      ...(reqs.execution || {}),
    },
    workspace: {
      ...(globalConfig.workspace || {}),
      ...(reqs.workspace || {}),
    },
  };
}

// ── Execution policy enforcement ────────────────────────────────────────────────

const DISALLOWED_GLOBAL = [
  'rm -rf /', 'rm -rf /*', 'mkfs', 'dd if=/dev/zero of=/dev/sda',
  ':(){:|:&};:', 'fork bomb', '> /etc/passwd',
];

/**
 * Check if a command is allowed under the project execution policy.
 * @param {string} cmd - full command string
 * @param {object} reqs - requirements object
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkCommandAllowed(cmd, reqs) {
  if (!reqs || !reqs.execution) return { allowed: true };
  
  const exec = reqs.execution;
  
  // Disallowed patterns (always blocked)
  for (const pat of DISALLOWED_GLOBAL) {
    if (cmd.includes(pat)) return { allowed: false, reason: `blocked: dangerous pattern '${pat}'` };
  }
  
  // Project-specific disallowed
  if (exec['disallowed-commands']) {
    for (const dc of exec['disallowed-commands']) {
      if (cmd.includes(dc)) return { allowed: false, reason: `blocked by project policy: '${dc}'` };
    }
  }
  
  // Allowlist
  if (exec['allowed-commands'] && exec['allowed-commands'].length > 0) {
    const first = cmd.split(/\s/)[0];
    if (!exec['allowed-commands'].some(ac => first === ac || cmd.startsWith(ac))) {
      return { allowed: false, reason: `command not in allowlist: '${first}'` };
    }
  }
  
  return { allowed: true };
}

/**
 * Check if a command requires confirmation.
 * @param {string} cmd
 * @param {object} reqs
 * @returns {boolean}
 */
function requiresConfirmation(cmd, reqs) {
  if (!reqs || !reqs.execution || !reqs.execution['require-confirmation']) return false;
  return reqs.execution['require-confirmation'].some(pattern =>
    cmd.includes(pattern)
  );
}

/**
 * Enforce managed-hooks-only policy.
 * If hooks.allow-managed-hooks-only = true, only hooks from requirements.toml are run.
 */
function enforceManagedHooksOnly(reqs, hookName) {
  if (!reqs || !reqs.hooks) return { allowed: true };
  if (!reqs.hooks['allow-managed-hooks-only']) return { allowed: true };
  // Only allow hooks that are explicitly declared in the project requirements
  return { allowed: false, reason: `hook '${hookName}' is not declared in requirements.toml — managed-hooks-only is active` };
}

// ── Hook runner ────────────────────────────────────────────────────────────────

/**
 * Run a hook (pre-run or post-run) from requirements.toml
 * @param {string[]} commands - array of shell command strings
 * @param {string} hookType - 'pre-run' or 'post-run'
 * @param {object} reqs - requirements object
 * @returns {Promise<{ ok: boolean, outputs: string[] }>}
 */
async function runHooks(commands, hookType, reqs) {
  if (!commands || commands.length === 0) return { ok: true, outputs: [] };
  const outputs = [];
  const { spawn } = require('child_process');
  
  for (const cmd of commands) {
    const check = enforceManagedHooksOnly(reqs, hookType);
    if (!check.allowed) {
      outputs.push(`[BLOCKED] ${check.reason}`);
      continue;
    }
    
    const allowed = checkCommandAllowed(cmd, reqs);
    if (!allowed.allowed) {
      outputs.push(`[BLOCKED] ${allowed.reason}`);
      continue;
    }
    
    const result = await new Promise(resolve => {
      const child = spawn(cmd, [], { shell: true, windowsHide: true });
      let out = '';
      child.stdout.on('data', c => out += c.toString());
      child.stderr.on('data', c => out += c.toString());
      child.on('close', code => resolve({ code, out }));
    });
    
    outputs.push(`[${hookType}] ${cmd} → exit ${result.code}`);
    if (result.out.trim()) outputs.push(result.out.trim());
  }
  
  return { ok: true, outputs };
}

// ── Workspace resolver ─────────────────────────────────────────────────────────

/**
 * Resolve workspace paths from requirements.toml + project root.
 */
function resolveWorkspace(projectDir, reqs) {
  const ws = reqs && reqs.workspace ? reqs.workspace : {};
  const root = ws.root ? path.resolve(projectDir, ws.root) : projectDir;
  return {
    root,
    skillsDir: ws['skills-dir']
      ? path.resolve(root, ws['skills-dir'])
      : path.join(root, '.purpclaw', 'skills'),
    memoryDir: ws['memory-dir']
      ? path.resolve(root, ws['memory-dir'])
      : path.join(root, '.purpclaw', 'memory'),
  };
}

module.exports = {
  loadProjectRequirements,
  mergeWithEnv,
  checkCommandAllowed,
  requiresConfirmation,
  enforceManagedHooksOnly,
  runHooks,
  resolveWorkspace,
  parseTOML,
};
