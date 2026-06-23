'use strict';
/**
 * lib/runtime/policy-engine.js — PURPCLAW approval and capability policy engine.
 *
 * Implements the three-mode safe-mode gating per deep-research-report §"Safe-mode gating checklist":
 *   - read-only:      reads, searches, status, verified GOOP GETs
 *   - workspace-write: in-workspace writes, vetted shell, no network
 *   - danger-full-access: everything requires explicit approval per call
 *
 * Each tool has a capability class (read | write | exec | network) and a
 * side-effect flag. The policy engine checks every tool invocation against
 * the active mode and the per-tool approval level.
 *
 * Bind into the agent loop by wrapping TOOLS.invoke(). One place, all tools
 * get policy-aware execution. This is the typed permission engine the
 * report flagged as "must match or exceed Codex/Claude".
 *
 * Usage:
 *   const { policyEngine } = require('./runtime/policy-engine');
 *   const verdict = policyEngine.check({ tool: 'write', args: { path: '/etc/passwd' }, mode: 'workspace-write' });
 *   if (verdict.allow) { ... } else { console.log(verdict.reason); }
 */

const path = require('path');

const TOOL_CAPABILITIES = {
  // reads — always allowed in every mode
  read:              { capability: 'read',    sideEffect: false },
  search_symbols:    { capability: 'read',    sideEffect: false },
  'code-search':     { capability: 'read',    sideEffect: false },
  search:            { capability: 'read',    sideEffect: false },
  glob:              { capability: 'read',    sideEffect: false },
  grep:              { capability: 'read',    sideEffect: false },
  status:            { capability: 'read',    sideEffect: false },
  // writes — workspace-write only, with path checks
  write:             { capability: 'write',   sideEffect: true },
  edit:              { capability: 'write',   sideEffect: true },
  apply_patch:       { capability: 'write',   sideEffect: true },
  // exec — requires explicit approval
  exec:              { capability: 'exec',    sideEffect: true },
  shell:             { capability: 'exec',    sideEffect: true },
  bash:              { capability: 'exec',    sideEffect: true },
  // network — gated
  fetch:             { capability: 'network', sideEffect: true },
  'web-fetch':       { capability: 'network', sideEffect: true },
  http_request:      { capability: 'network', sideEffect: true },
  curl:              { capability: 'network', sideEffect: true },
  // orchestrator and agent spawns are exec-like
  spawn:             { capability: 'exec',    sideEffect: true },
  delegate_task:     { capability: 'exec',    sideEffect: true },
  agent_spawn:       { capability: 'exec',    sideEffect: true },
  spawn_agent:       { capability: 'exec',    sideEffect: true },
};

const MODE_RULES = {
  'read-only': {
    allowedCapabilities: new Set(['read']),
    requireApprovalCapabilities: new Set(),
    requireApprovalTools: new Set(),
  },
  'workspace-write': {
    allowedCapabilities: new Set(['read', 'write', 'exec', 'network']),
    requireApprovalCapabilities: new Set(['network']),
    requireApprovalTools: new Set(['spawn', 'delegate_task', 'agent_spawn', 'spawn_agent']),
  },
  'danger-full-access': {
    allowedCapabilities: null,
    requireApprovalCapabilities: new Set(['write', 'exec', 'network']),
    requireApprovalTools: new Set(),
  },
};

const DANGEROUS_SHELL_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bdel\s+\/[sq]\b/i,
  /\brmdir\s+\/s\b/i,
  /\bformat(?:\.com)?\b/i,
  /\bdiskpart\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[a-z]*f/i,
  /\bRemove-Item\b[^\r\n]*-Recurse\b/i,
  /\b(send|launch)\b[^\r\n]*\b(sms|email|whatsapp|outreach|campaign)\b/i,
  /\b(apply|submit)\b[^\r\n]*\b(credit|loan|financing)\b/i,
  /\b(purchase|buy|place order|procure)\b/i,
  /\b(file|submit|register)\b[^\r\n]*\b(llc|corporation|company|business|articles of)\b/i,
];

function getCapability(toolName) {
  if (TOOL_CAPABILITIES[toolName]) return TOOL_CAPABILITIES[toolName];
  if (/^(read|search|grep|glob|status|list|memory_check|mcp__.+__(search|list|read|get|find|health))/i.test(toolName || '')) {
    return { capability: 'read', sideEffect: false };
  }
  return { capability: 'exec', sideEffect: true };
}

function normalizeForComparison(p) {
  const normalized = path.resolve(p);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isWorkspacePath(p, workspaceRoot = process.cwd()) {
  if (!p || typeof p !== 'string') return true;
  const root = normalizeForComparison(workspaceRoot);
  const candidate = normalizeForComparison(path.isAbsolute(p) ? p : path.resolve(workspaceRoot, p));
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function getPathArgs(args = {}) {
  return [args.path, args.file, args.target, args.cwd, args.outputPath]
    .filter(value => typeof value === 'string' && value.trim());
}

function isVettedShell(args = {}, workspaceRoot = process.cwd()) {
  const command = String(args.command || '');
  const cwd = args.cwd || workspaceRoot;
  if (!isWorkspacePath(cwd, workspaceRoot)) {
    return { ok: false, reason: `shell cwd is outside workspace: ${cwd}` };
  }
  const dangerous = DANGEROUS_SHELL_PATTERNS.find(pattern => pattern.test(command));
  if (dangerous) {
    return { ok: false, reason: 'shell command requires danger-full-access approval' };
  }
  return { ok: true };
}

function policyEngine() {
  return {
    /**
     * Check whether a tool call is allowed under the active mode.
     * Returns { allow: boolean, reason: string, mode: string, tool: string, capability: string }.
     */
    check({ tool, args = {}, mode = 'workspace-write', userApproved = false, workspaceRoot = process.cwd() } = {}) {
      const rule = MODE_RULES[mode] || MODE_RULES['workspace-write'];
      const cap = getCapability(tool);

      if (rule.allowedCapabilities && !rule.allowedCapabilities.has(cap.capability)) {
        return { allow: false, mode, tool, capability: cap.capability, reason: `mode ${mode} denies ${cap.capability} capability for tool ${tool}` };
      }

      if (mode === 'workspace-write' && cap.capability === 'write') {
        const outside = getPathArgs(args).find(p => !isWorkspacePath(p, workspaceRoot));
        if (outside) {
          return { allow: false, mode, tool, capability: cap.capability, reason: `workspace-write blocks path outside workspace: ${outside}` };
        }
      }

      if (mode === 'workspace-write' && ['shell', 'exec', 'bash'].includes(tool)) {
        const vetted = isVettedShell(args, workspaceRoot);
        if (!vetted.ok) {
          return { allow: false, mode, tool, capability: cap.capability, reason: vetted.reason };
        }
      }

      if ((rule.requireApprovalCapabilities.has(cap.capability) || rule.requireApprovalTools.has(tool)) && !userApproved) {
        return { allow: false, mode, tool, capability: cap.capability, reason: `${cap.capability} tool ${tool} requires explicit user approval in mode ${mode}` };
      }

      return { allow: true, mode, tool, capability: cap.capability, reason: 'ok' };
    },

    /** Wrap TOOLS.invoke() with policy enforcement. */
    guardedInvoke(tools, { tool, args, mode = 'workspace-write', userApproved = false, workspaceRoot = process.cwd(), runId } = {}) {
      const verdict = this.check({ tool, args, mode, userApproved, workspaceRoot });
      if (!verdict.allow) return { ok: false, error: verdict.reason, policy: verdict };
      return tools.invoke(tool, args);
    },

    /** Register a tool's capability. Useful for plugin-loaded tools. */
    registerCapability(name, capability, sideEffect = true) {
      TOOL_CAPABILITIES[name] = { capability, sideEffect };
    },

    /** List the active mode's rules for display. */
    describeMode(mode) {
      const r = MODE_RULES[mode] || MODE_RULES['workspace-write'];
      return {
        mode,
        allowedCapabilities: r.allowedCapabilities ? [...r.allowedCapabilities] : 'all',
        requireApprovalCapabilities: [...r.requireApprovalCapabilities],
        requireApprovalTools: [...r.requireApprovalTools],
      };
    },

    /** All known modes. */
    listModes() { return Object.keys(MODE_RULES); },

    /** All known tool capabilities. */
    listCapabilities() { return { ...TOOL_CAPABILITIES }; },
  };
}

module.exports = {
  policyEngine,
  getCapability,
  isWorkspacePath,
  isVettedShell,
  TOOL_CAPABILITIES,
  MODE_RULES,
};
