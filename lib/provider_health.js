/**
 * Provider Health Registry
 * Tracks live status of every model/provider in the PURPCLAW stack.
 * Used by survivor_router to decide where to reroute on failure.
 */

const ProviderState = {
  AVAILABLE:    'available',
  UNAVAILABLE:  'unavailable',
  QUOTA_DEAD:   'quota_dead',
  AUTH_FAILED:  'auth_failed',
  RATE_LIMITED: 'rate_limited',
  TIMEOUT:      'timeout',
  UNKNOWN:      'unknown',
};

const providers = {
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    state: ProviderState.UNKNOWN,
    lastSuccess: null,
    lastError: null,
    lastAttempt: null,
    retryAfter: null,
    fallbackOf: [],
    healthEndpoint: 'http://localhost:7784/health',
    quotaResetAt: null,
  },
  codex: {
    id: 'codex',
    label: 'OpenAI Codex',
    state: ProviderState.QUOTA_DEAD,
    lastSuccess: null,
    lastError: null,
    lastAttempt: null,
    retryAfter: null,
    fallbackOf: [],
    healthEndpoint: null,
    quotaResetAt: new Date('2026-05-31T14:06:00Z'),
  },
  minimax: {
    id: 'minimax',
    label: 'MiniMax',
    state: ProviderState.UNKNOWN,
    lastSuccess: null,
    lastError: null,
    lastAttempt: null,
    retryAfter: null,
    fallbackOf: ['openrouter'],
    healthEndpoint: null,
    quotaResetAt: null,
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    state: ProviderState.UNKNOWN,
    lastSuccess: null,
    lastError: null,
    lastAttempt: null,
    retryAfter: null,
    fallbackOf: [],
    healthEndpoint: null,
    quotaResetAt: null,
  },
  hermes: {
    id: 'hermes',
    label: 'Hermes Broker',
    state: ProviderState.UNKNOWN,
    lastSuccess: null,
    lastError: null,
    lastAttempt: null,
    retryAfter: null,
    fallbackOf: [],
    healthEndpoint: null,
    quotaResetAt: null,
  },
  local: {
    id: 'local',
    label: 'Local Models',
    state: ProviderState.UNKNOWN,
    lastSuccess: null,
    lastError: null,
    lastAttempt: null,
    retryAfter: null,
    fallbackOf: [],
    healthEndpoint: null,
    quotaResetAt: null,
  },
  claude: {
    id: 'claude',
    label: 'Anthropic Claude',
    state: ProviderState.UNKNOWN,
    lastSuccess: null,
    lastError: null,
    lastAttempt: null,
    retryAfter: null,
    fallbackOf: [],
    healthEndpoint: null,
    quotaResetAt: null,
  },
};

/**
 * Mark a provider as having succeeded.
 * @param {string} id
 * @param {any} [data] — optional metadata about the call
 */
function markProviderUp(id, data = {}) {
  const p = providers[id];
  if (!p) return;
  p.state = ProviderState.AVAILABLE;
  p.lastSuccess = Date.now();
  p.lastError = null;
  p.retryAfter = null;
}

/**
 * Mark a provider as having failed.
 * @param {string} id
 * @param {string} reason — error type key
 * @param {string|Error} error
 */
function markProviderDown(id, reason, error) {
  const p = providers[id];
  if (!p) return;
  p.lastAttempt = Date.now();
  p.lastError = error instanceof Error ? error.message : String(error);

  switch (reason) {
    case 'quota':
    case 'usage_limit':
    case '429':
      p.state = ProviderState.QUOTA_DEAD;
      break;
    case 'auth':
    case '401':
    case '403':
      p.state = ProviderState.AUTH_FAILED;
      break;
    case 'rate_limit':
      p.state = ProviderState.RATE_LIMITED;
      break;
    case 'timeout':
    case 'ETIMEDOUT':
    case 'ECONNRESET':
      p.state = ProviderState.TIMEOUT;
      break;
    default:
      p.state = ProviderState.UNAVAILABLE;
  }
}

/**
 * Check if a provider can handle a request right now.
 * @param {string} id
 * @returns {boolean}
 */
function isProviderAvailable(id) {
  const p = providers[id];
  if (!p) return false;
  if (p.state === ProviderState.AVAILABLE) {
    // Check quota reset
    if (p.state === ProviderState.QUOTA_DEAD && p.quotaResetAt) {
      if (Date.now() > p.quotaResetAt.getTime()) {
        p.state = ProviderState.UNKNOWN; // auto-retry after reset
        return true;
      }
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Get the best available fallback for a failed provider.
 * @param {string} failedId
 * @returns {string|null} provider id or null
 */
function getFallback(failedId) {
  const primary = providers[failedId];
  if (!primary) return null;

  // Check chain of fallback Providers
  for (const candidateId of primary.fallbackOf) {
    if (isProviderAvailable(candidateId)) return candidateId;
  }

  // Scan all available
  for (const [id, p] of Object.entries(providers)) {
    if (id === failedId) continue;
    if (isProviderAvailable(id)) return id;
  }

  return null;
}

/**
 * Get a formatted status snapshot.
 * @returns {object}
 */
function getRegistryStatus() {
  return Object.fromEntries(
    Object.entries(providers).map(([id, p]) => [id, { ...p }])
  );
}

/**
 * Render the registry as a terminal-friendly table.
 * @returns {string}
 */
function statusTable() {
  const lines = ['\nProvider Health Registry\n'];
  for (const [, p] of Object.entries(providers)) {
    const up = p.state === 'available' ? '✓' : p.state === 'quota_dead' ? '▣' : '✗';
    const age = p.lastSuccess
      ? `${((Date.now() - p.lastSuccess) / 1000 / 60).toFixed(1)}m ago`
      : 'never';
    lines.push(`  ${up} ${p.label.padEnd(20)} ${p.state.padEnd(12)} lastOK:${age}`);
    if (p.quotaResetAt) lines.push(`     quota reset: ${p.quotaResetAt}`);
  }
  lines.push('');
  return lines.join('\n');
}

module.exports = {
  ProviderState,
  providers,
  markProviderUp,
  markProviderDown,
  isProviderAvailable,
  getFallback,
  getRegistryStatus,
  statusTable,
};
