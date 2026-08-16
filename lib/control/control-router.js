'use strict';

/**
 * Deterministic native-first control routing.
 *
 * This module deliberately sits UNDER the agent loop. The LLM chooses an
 * intent/tool request; this router chooses the transport. MCP is fallback.
 */

const http = require('http');

const SURFACE_WEIGHT = Object.freeze({
  NATIVE_CLI: 700,
  NATIVE_SDK: 600,
  NATIVE_API: 500,
  DIRECT_PROCESS: 400,
  DIRECT_FILESYSTEM: 350,
  PURPCLAW_DRIVER: 300,
  MCP: 10,
});

// Explicit equivalence map. Add entries only when argument/postcondition
// compatibility is tested. No fuzzy LLM guessing belongs here.
const MCP_NATIVE_ALIASES = Object.freeze({
  'mcp__filesystem__read_file': 'read',
  'mcp__filesystem__write_file': 'write',
  'mcp__filesystem__read_text_file': 'read',
  'mcp__filesystem__write_text_file': 'write',
  'mcp__omnicode__search_symbols': 'code-search',
});

const FALLBACK_ELIGIBLE = new Set([
  'CAPABILITY_UNAVAILABLE',
  'TRANSPORT_FAILURE',
  'TIMEOUT',
  'VERSION_MISMATCH',
  'APPLICATION_NOT_RUNNING',
  'PROCESS_CRASH',
]);

function isMcpTool(name) {
  return typeof name === 'string' && name.startsWith('mcp__');
}

function classifyFailure(result) {
  if (!result || result.ok !== false) return null;
  const text = String(result.error || '').toLowerCase();
  if (/unknown tool|not found|unsupported|capabil/.test(text)) return 'CAPABILITY_UNAVAILABLE';
  if (/timeout|timed out/.test(text)) return 'TIMEOUT';
  if (/econn|socket|pipe|transport|connection|closed/.test(text)) return 'TRANSPORT_FAILURE';
  if (/not running|process.*dead|crash/.test(text)) return 'PROCESS_CRASH';
  if (/permission|access denied|eperm/.test(text)) return 'PERMISSION_DENIED';
  if (/auth|credential|token|unauthor/.test(text)) return 'AUTHENTICATION_REQUIRED';
  if (/invalid|argument|required/.test(text)) return 'INVALID_ARGUMENT';
  return 'UNKNOWN';
}

function emitState(event) {
  // Best-effort projection into the EXISTING unified state service. This is
  // observability/checkpoint metadata, never a dependency for execution.
  try {
    const payload = JSON.stringify(event);
    const key = encodeURIComponent(event.operationId || `op-${Date.now()}`);
    const req = http.request({
      hostname: '127.0.0.1',
      port: Number(process.env.PURPCLAW_STATE_PORT || 7783),
      path: `/state/control/${key}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 1000,
    });
    req.on('error', () => {});
    req.on('timeout', () => req.destroy());
    req.write(payload);
    req.end();
  } catch {}
}

function emitEvent(type, data = {}) {
  const event = {
    type,
    timestamp: new Date().toISOString(),
    ...data,
  };
  emitState(event);
  try {
    const announce = require('../events');
    if (announce && typeof announce.thinking === 'function') {
      announce.thinking(type, data);
    }
  } catch {}
  return event;
}

function operationId(ctx = {}) {
  return ctx.operationId || `control-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeArgs(nativeTool, args) {
  const out = { ...(args || {}) };
  // MCP filesystem servers commonly use `path`; PurpClaw write accepts both.
  if (nativeTool === 'code-search') {
    if (!out.query && out.symbol) out.query = out.symbol;
    if (!out.query && out.name) out.query = out.name;
    // Omnicode's `path` is intentionally ignored here: the native code-search
    // command currently searches the project root. Do not silently pretend
    // scoped semantics are equivalent if a caller supplies a non-root path.
    if (out.path && out.path !== '.' && out.path !== process.cwd()) return null;
    delete out.path;
  }
  return out;
}

/**
 * Invoke a tool with deterministic native preference.
 *
 * Returns { result, requestedTool, executedTool, surface, operationId,
 *           fallbackUsed }.
 */
async function invokeTool(requestedTool, args, toolRegistry, ctx = {}) {
  if (!toolRegistry || typeof toolRegistry.invoke !== 'function') {
    throw new TypeError('toolRegistry.invoke is required');
  }

  const opId = operationId(ctx);
  const base = {
    operationId: opId,
    requestedTool,
    goalId: ctx.goalId,
    workflowId: ctx.workflowId,
    nodeId: ctx.nodeId,
    soulId: ctx.soulId,
    providerId: ctx.providerId,
  };

  // Built-ins/native tools are already the preferred surface.
  if (!isMcpTool(requestedTool)) {
    emitEvent('control_driver_selected', { ...base, executedTool: requestedTool, surface: 'PURPCLAW_DRIVER' });
    const result = await toolRegistry.invoke(requestedTool, args || {});
    emitEvent(result && result.ok !== false ? 'control_operation_completed' : 'control_operation_failed', {
      ...base,
      executedTool: requestedTool,
      surface: 'PURPCLAW_DRIVER',
      ok: result && result.ok !== false,
      failureKind: classifyFailure(result),
    });
    return { result, requestedTool, executedTool: requestedTool, surface: 'PURPCLAW_DRIVER', operationId: opId, fallbackUsed: false };
  }

  const nativeTool = MCP_NATIVE_ALIASES[requestedTool];
  if (nativeTool && typeof toolRegistry.has === 'function' && toolRegistry.has(nativeTool)) {
    const nativeArgs = normalizeArgs(nativeTool, args);
    if (nativeArgs) {
      emitEvent('control_driver_selected', { ...base, executedTool: nativeTool, surface: 'PURPCLAW_DRIVER', reason: 'native-equivalent' });
      const nativeResult = await toolRegistry.invoke(nativeTool, nativeArgs);
      const failureKind = classifyFailure(nativeResult);

      if (nativeResult && nativeResult.ok !== false) {
        emitEvent('control_operation_completed', { ...base, executedTool: nativeTool, surface: 'PURPCLAW_DRIVER', ok: true });
        return { result: nativeResult, requestedTool, executedTool: nativeTool, surface: 'PURPCLAW_DRIVER', operationId: opId, fallbackUsed: false };
      }

      // Invalid input/auth/permissions/verification failures are causal. Do not
      // spray the same bad request through MCP and call it resilience.
      if (!FALLBACK_ELIGIBLE.has(failureKind)) {
        emitEvent('control_operation_failed', { ...base, executedTool: nativeTool, surface: 'PURPCLAW_DRIVER', failureKind });
        return { result: nativeResult, requestedTool, executedTool: nativeTool, surface: 'PURPCLAW_DRIVER', operationId: opId, fallbackUsed: false };
      }

      emitEvent('control_driver_fallback', { ...base, fromTool: nativeTool, fromSurface: 'PURPCLAW_DRIVER', toTool: requestedTool, toSurface: 'MCP', failureKind });
    }
  }

  // No verified native equivalent, or native transport failed in a way for
  // which fallback is explicitly allowed. MCP now gets its turn.
  emitEvent('control_driver_selected', { ...base, executedTool: requestedTool, surface: 'MCP' });
  const mcpResult = await toolRegistry.invoke(requestedTool, args || {});
  emitEvent(mcpResult && mcpResult.ok !== false ? 'control_operation_completed' : 'control_operation_failed', {
    ...base,
    executedTool: requestedTool,
    surface: 'MCP',
    ok: mcpResult && mcpResult.ok !== false,
    failureKind: classifyFailure(mcpResult),
  });
  return { result: mcpResult, requestedTool, executedTool: requestedTool, surface: 'MCP', operationId: opId, fallbackUsed: Boolean(nativeTool) };
}

module.exports = {
  SURFACE_WEIGHT,
  MCP_NATIVE_ALIASES,
  FALLBACK_ELIGIBLE,
  isMcpTool,
  classifyFailure,
  normalizeArgs,
  invokeTool,
};
