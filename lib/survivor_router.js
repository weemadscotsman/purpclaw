/**
 * Survivor Mode Router
 * Reroutes agent tasks around dead providers or resource failures.
 * Fits between orchestrator dispatch and provider selection.
 */

const { getFallback, markProviderDown, markProviderUp, isProviderAvailable } = require('./provider_health');

/**
 * Attempt a provider call, detect failure type, reroute on death.
 *
 * @param {object} options
 * @param {string} options.primaryProvider  — preferred provider id
 * @param {Function} options.makeCall        — async (providerId) => call result
 * @param {object} [options.context]        — optional metadata passed through
 * @returns {Promise<{success: boolean, result?, error?, reroutedTo?, deadProvider?}>}
 */
async function survivorRoute({ primaryProvider, makeCall, context = {} }) {
  const tried = [];
  let currentProvider = primaryProvider;

  // Always try primary first, even if QUOTA_DEAD — short-circuit if reset time has passed
  while (true) {
    if (!isProviderAvailable(currentProvider)) {
      const fallback = getFallback(currentProvider);
      if (!fallback) break;
      currentProvider = fallback;
    }

    // Guard against loops
    if (tried.includes(currentProvider)) break;
    tried.push(currentProvider);

    try {
      const result = await makeCall(currentProvider);
      markProviderUp(currentProvider, context);
      return {
        success: true,
        result,
        reroutedTo: tried.length > 1 ? currentProvider : null,
        providersTried: tried,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      let reason = 'unknown';
      const lower = msg.toLowerCase();

      if (msg.includes('429') || msg.includes('quota') || msg.includes('usage') || msg.includes('rate limit') || lower.includes('usage_limit')) {
        reason = 'quota';
      } else if (msg.includes('401') || msg.includes('403') || msg.includes('auth') || msg.includes('unauthorized') || msg.includes('invalid token')) {
        reason = 'auth';
      } else if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET') || msg.includes('socket hang up')) {
        reason = 'timeout';
      } else if (msg.includes('rate limit')) {
        reason = 'rate_limit';
      }

      markProviderDown(currentProvider, reason, err);

      const fallback = getFallback(currentProvider);
      if (!fallback) {
        return {
          success: false,
          error: err,
          deadProvider: currentProvider,
          reroutedTo: null,
          providersTried: tried,
          reason,
        };
      }
      currentProvider = fallback;
    }
  }

  // Exhausted all options
  return {
    success: false,
    error: new Error('All providers dead'),
    deadProvider: tried[tried.length - 1],
    reroutedTo: null,
    providersTried: tried,
    reason: 'all_exhausted',
  };
}

/**
 * Shortcut: route any orchestrator agent call.
 * @param {string} providerId — primary provider
 * @param {Function} callFn   — async (providerId) => result
 */
async function routeAgentCall(providerId, callFn) {
  return survivorRoute({
    primaryProvider: providerId,
    makeCall: callFn,
    context: { type: 'agent_call', ts: Date.now() },
  });
}

module.exports = { survivorRoute, routeAgentCall };
