/**
 * PURPCLAW LOCKED INTERFACES v1.0
 * ================================
 * Protects critical tools, APIs, and files from unauthorized agent access.
 *
 * "You built a society. You need a machine." - Compound Monster
 *
 * A machine has:
 * - Protected core functions that can't be bypassed
 * - Controlled access to dangerous operations
 * - Audit trails for privileged actions
 *
 * This system implements:
 * 1. Tool permissions by agent tier/division
 * 2. Protected file patterns that agents can't modify
 * 3. Rate limiting on dangerous operations
 * 4. Privilege escalation for critical actions
 */

const fs = require('fs');
const path = require('path');

const PURP_DIR = path.join(__dirname);

// ========== LOCK CONFIGURATION ==========

const LOCK_CONFIG = {
  // Agents by tier who can access protected tools
  // Higher tier = more access
  TIER_ACCESS: {
    1: ['robot', 'bee', 'turtle', 'chonk', 'cactus', 'rabbit', 'duck', 'goose', 'bunny', 'crow', 'panda'],
    2: ['owl', 'ghost', 'spider', 'octopus', 'axolotl', 'penguin', 'mantis', 'shark', 'gorilla', 'parrot', 'hawk', 'fox', 'karen', 'lemur'],
    3: ['dragon', 'wolf', 'snake', 'guardian', 'scientist']
  },

  // Tools that require minimum tier to execute
  TIERED_TOOLS: {
    3: [
      'process_kill',      // Can kill any process
      'git_push',          // Can push to remote
      'git_force_push',    // Force push (dangerous)
      'execute_command',   // Can run arbitrary commands
      'file_delete',       // Can delete any file
      'file_move',         // Can move any file
      'install_package',   // Can install packages
      'uninstall_package', // Can remove packages
      'system_reboot',     // Can reboot system
      'gateway_write',     // Can modify gateway config
    ],
    2: [
      'file_write',        // Can write files
      'clipboard_write',   // Can write to clipboard
      'git_commit',       // Can commit
      'window_close',     // Can close windows
      'process_list',     // Can list all processes
    ],
    1: []  // Tier 1 agents have no additional restrictions
  },

  // File patterns that are protected (no agent can modify these)
  PROTECTED_PATTERNS: [
    /^C:\\Windows\\/i,
    /^C:\\Program Files/i,
    /node_modules/,
    /\.env$/,                     // Don't modify .env files
    /ecosystem\.config\.js$/,      // Don't modify PM2 config
    /purpclaw_settings\.json$/,    // Don't modify settings
    /unified_api\.js$/,           // Core API
    /agent_tower\.js$/,           // Agent registry
    /orchestrator\.js$/,          // Core orchestrator
    /gatekeeper\.js$/,            // Gatekeeper itself
    /agent_score\.js$/,            // Score system
    /\.git\/config$/,
    /\.git\/hooks$/,
  ],

  // Tool rate limits (operations per minute per agent)
  RATE_LIMITS: {
    execute_command: { max: 10, window: 60000 },
    process_kill: { max: 5, window: 60000 },
    file_delete: { max: 10, window: 60000 },
    git_push: { max: 3, window: 60000 },
  }
};

// ========== ACCESS TRACKING ==========

const accessLog = [];
const rateLimiters = new Map();

function getAgentTier(agentName) {
  const name = agentName.toLowerCase();
  for (const [tier, agents] of Object.entries(LOCK_CONFIG.TIER_ACCESS)) {
    if (agents.includes(name)) return parseInt(tier);
  }
  return 0; // Unknown agents have no tier
}

function getToolTier(toolName) {
  for (const [tier, tools] of Object.entries(LOCK_CONFIG.TIERED_TOOLS)) {
    if (tools.includes(toolName)) return parseInt(tier);
  }
  return 0; // Tools not listed are unrestricted
}

// ========== RATE LIMITING ==========

function checkRateLimit(agentName, toolName) {
  const limit = LOCK_CONFIG.RATE_LIMITS[toolName];
  if (!limit) return { allowed: true };

  const key = `${agentName}:${toolName}`;
  const now = Date.now();

  if (!rateLimiters.has(key)) {
    rateLimiters.set(key, { count: 0, windowStart: now });
  }

  const limiter = rateLimiters.get(key);

  // Reset if window has passed
  if (now - limiter.windowStart > limit.window) {
    limiter.count = 0;
    limiter.windowStart = now;
  }

  if (limiter.count >= limit.max) {
    return {
      allowed: false,
      reason: `Rate limit exceeded: ${toolName} (${limit.max}/${limit.window / 1000}s)`,
      retryAfter: Math.ceil((limiter.windowStart + limit.window - now) / 1000)
    };
  }

  limiter.count++;
  return { allowed: true };
}

// ========== FILE PROTECTION ==========

function isFileProtected(filePath) {
  const normalized = filePath.replace(/\\/g, '\\\\');
  return LOCK_CONFIG.PROTECTED_PATTERNS.some(pattern => pattern.test(normalized));
}

// ========== ACCESS CHECK ==========

/**
 * Main access check function
 * @param {string} agentName - Name of agent requesting access
 * @param {string} toolName - Tool being requested
 * @param {object} args - Tool arguments (for file paths etc)
 * @returns {object} { allowed: bool, reason?: string, escalate?: bool }
 */
function checkAccess(agentName, toolName, args = {}) {
  const agentTier = getAgentTier(agentName);
  const toolTier = getToolTier(toolName);

  const logEntry = {
    timestamp: new Date().toISOString(),
    agent: agentName,
    agentTier,
    tool: toolName,
    toolTier,
    args: Object.keys(args),
    allowed: false,
    reason: null
  };

  // Check rate limit
  const rateCheck = checkRateLimit(agentName, toolName);
  if (!rateCheck.allowed) {
    logEntry.reason = rateCheck.reason;
    accessLog.push(logEntry);
    trimAccessLog();
    return { allowed: false, reason: rateCheck.reason };
  }

  // Check tier requirement
  if (toolTier > 0 && agentTier < toolTier) {
    logEntry.reason = `Tier ${toolTier} tool "${toolName}" requires tier ${toolTier} agent (${agentName} is tier ${agentTier})`;
    accessLog.push(logEntry);
    trimAccessLog();
    return {
      allowed: false,
      reason: logEntry.reason,
      escalate: true,  // Indicates this could be approved by higher authority
      requiredTier: toolTier
    };
  }

  // Check file protection for file-modifying tools
  const fileModifyingTools = ['file_write', 'file_delete', 'file_move', 'file_copy'];
  if (fileModifyingTools.includes(toolName) && args.path) {
    if (isFileProtected(args.path)) {
      logEntry.reason = `Protected file: ${args.path}`;
      accessLog.push(logEntry);
      trimAccessLog();
      return {
        allowed: false,
        reason: `Cannot modify protected file: ${args.path}`,
        escalate: true,
        protectedFile: true
      };
    }
  }

  logEntry.allowed = true;
  accessLog.push(logEntry);
  trimAccessLog();

  return { allowed: true };
}

/**
 * Check if an agent can escalate privileges (request approval for higher-tier tool)
 */
function canEscalate(agentName, requiredTier) {
  const agentTier = getAgentTier(agentName);
  // Agent can escalate if they're within 1 tier of requirement
  return agentTier > 0 && agentTier < requiredTier && (requiredTier - agentTier) <= 1;
}

/**
 * Get human-readable tier name
 */
function getTierName(tier) {
  const names = { 0: 'Unknown', 1: 'Foundation', 2: 'Operations', 3: 'Strategic' };
  return names[tier] || 'Unknown';
}

// ========== AUDIT LOG ==========

function trimAccessLog() {
  // Keep last 1000 entries
  if (accessLog.length > 1000) {
    accessLog.splice(0, accessLog.length - 1000);
  }
}

function getAccessLog(filter = {}) {
  let logs = [...accessLog];

  if (filter.agent) {
    logs = logs.filter(l => l.agent === filter.agent);
  }
  if (filter.tool) {
    logs = logs.filter(l => l.tool === filter.tool);
  }
  if (filter.allowed !== undefined) {
    logs = logs.filter(l => l.allowed === filter.allowed);
  }
  if (filter.since) {
    const since = new Date(filter.since).getTime();
    logs = logs.filter(l => new Date(l.timestamp).getTime() >= since);
  }

  return logs;
}

function getStats() {
  const stats = {
    totalChecks: accessLog.length,
    allowed: accessLog.filter(l => l.allowed).length,
    denied: accessLog.filter(l => !l.allowed).length,
    byAgent: {},
    byTool: {},
    recentDenials: accessLog.filter(l => !l.allowed).slice(-10)
  };

  for (const entry of accessLog) {
    stats.byAgent[entry.agent] = stats.byAgent[entry.agent] || { allowed: 0, denied: 0 };
    stats.byAgent[entry.agent][entry.allowed ? 'allowed' : 'denied']++;

    stats.byTool[entry.tool] = stats.byTool[entry.tool] || { allowed: 0, denied: 0 };
    stats.byTool[entry.tool][entry.allowed ? 'allowed' : 'denied']++;
  }

  return stats;
}

// ========== ORCHESTRATOR INTEGRATION ==========

/**
 * Wrap a tool execution with access control
 * Returns a function that checks access before executing
 */
function withAccessControl(toolFn, toolName) {
  return async function(agentName, args) {
    const access = checkAccess(agentName, toolName, args);
    if (!access.allowed) {
      return {
        success: false,
        error: `Access denied: ${access.reason}`,
        accessDenied: true,
        escalate: access.escalate
      };
    }
    return await toolFn(args);
  };
}

// ========== EXPRESSION ==========

module.exports = {
  checkAccess,
  canEscalate,
  getAgentTier,
  getTierName,
  isFileProtected,
  getAccessLog,
  getStats,
  withAccessControl,
  LOCK_CONFIG
};
