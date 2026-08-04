'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd && process.cwd().endsWith('PURPCLAW')
  ? process.cwd()
  : path.resolve(__dirname, '..');
const STORE_DIR = path.join(ROOT, '.purpclaw', 'liveforge');
const SURFACES_DIR = path.join(STORE_DIR, 'surfaces');
const EVENTS_FILE = path.join(STORE_DIR, 'events.jsonl');
const RECEIPTS_FILE = path.join(STORE_DIR, 'receipts.jsonl');
const LESSONS_FILE = path.join(STORE_DIR, 'lessons.pending.jsonl');
const INVOCATION_REGISTRY_FILE = path.join(STORE_DIR, 'invocation-registry.json');
const PATCHES_DIR = path.join(STORE_DIR, 'patches');
const TOOL_ROUTES_FILE = path.join(STORE_DIR, 'tool-routes.json');
const GENERATED_TOOL_PROPOSALS_FILE = path.join(STORE_DIR, 'generated-tool-proposals.jsonl');
const APPROVED_WRITES_DIR = path.join(STORE_DIR, 'approved');
const APPROVED_PATTERNS_FILE = path.join(STORE_DIR, 'approved-patterns.json');
const LESSON_REPLAYS_FILE = path.join(STORE_DIR, 'lesson-replays.jsonl');

const SURFACE_SCOPES = new Set(['chat', 'agent', 'division', 'system', 'tool', 'memory', 'lesson']);
const LESSON_RISKS = new Set(['low', 'medium', 'high']);
const LESSON_STATUSES = new Set(['pending', 'replayed', 'rejected', 'approved']);
const SURFACE_STATUSES = new Set(['draft', 'active', 'paused', 'closed', 'failed', 'expired']);
const AUDIENCE_SCOPES = new Set(['public', 'user_only', 'agent_only', 'admin_only', 'named_recipient_only', 'hidden_system_event']);
const SANITIZER_PROFILES = new Set(['strict_static', 'safe_svg_css', 'sandboxed_tool', 'trusted_internal']);
const PROOF_POLICIES = new Set(['log_all', 'log_actions_only', 'log_errors_only']);
const LESSON_POLICIES = new Set(['disabled', 'propose_only', 'propose_and_replay']);
const SAFE_TAGS = new Set(['section', 'article', 'header', 'footer', 'main', 'div', 'span', 'p', 'strong', 'b', 'em', 'i', 'small', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'code', 'blockquote', 'hr', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);
const VOID_TAGS = new Set(['br', 'hr']);
const SAFE_ATTRS = new Set(['class', 'title', 'aria-label', 'role', 'data-key', 'data-kind', 'data-state']);
const BLOCKED_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'button', 'select', 'textarea', 'svg', 'math', 'canvas', 'video', 'audio', 'img']);
const AGENT_PROMPT_FILE = path.join(ROOT, 'docs', 'subsystems', 'liveforge', 'liveforge.agent_prompts.md');
const AGENT_PROMPT_ROLES = {
  'liveforge.surface_planner': ['activation_decision', 'surface_contract', 'first_render_goal', 'risk_notes', 'acceptance_checks'],
  'liveforge.render_generator': ['render_patch_id', 'target_slots', 'markup', 'required_assets', 'event_bindings', 'state_dependencies', 'sanitizer_expectations'],
  'liveforge.intent_router': ['route_decision', 'validated_event', 'tool_request_or_null', 'state_update_or_null', 'proof_record'],
  'liveforge.audience_router': ['visibility_decision', 'allowed_recipients', 'redacted_payload', 'policy_answer_if_needed', 'proof_record'],
  'liveforge.lesson_distiller': ['lesson_proposal', 'replay_requirements', 'risk_level', 'affected_components', 'recommended_status'],
};

function now() {
  return new Date().toISOString();
}

function futureIso(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function ensureStore() {
  fs.mkdirSync(SURFACES_DIR, { recursive: true });
  fs.mkdirSync(PATCHES_DIR, { recursive: true });
  fs.mkdirSync(APPROVED_WRITES_DIR, { recursive: true });
  for (const file of [EVENTS_FILE, RECEIPTS_FILE, LESSONS_FILE, GENERATED_TOOL_PROPOSALS_FILE, LESSON_REPLAYS_FILE]) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, '', 'utf8');
  }
  if (!fs.existsSync(TOOL_ROUTES_FILE)) fs.writeFileSync(TOOL_ROUTES_FILE, JSON.stringify({ routes: [] }, null, 2) + '\n', 'utf8');
  if (!fs.existsSync(APPROVED_PATTERNS_FILE)) fs.writeFileSync(APPROVED_PATTERNS_FILE, JSON.stringify({ patterns: [] }, null, 2) + '\n', 'utf8');
}

function slug(input, fallback = 'item') {
  const s = String(input || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return s || fallback;
}

function id(prefix, seed) {
  const base = seed ? slug(seed, prefix) : `${prefix}-${Date.now().toString(36)}`;
  const hash = crypto.createHash('sha256').update(`${base}:${Date.now()}:${Math.random()}`).digest('hex').slice(0, 8);
  return `${prefix}_${base}_${hash}`;
}

function canonicalId(prefix, seed) {
  return id(prefix, seed).replace(/\./g, '-');
}

function normalizeVisibility(value) {
  const v = String(value || 'public').replace(/-/g, '_');
  if (v === 'private') return 'named_recipient_only';
  if (v === 'user-only') return 'user_only';
  return v;
}

function tokenHash(token) {
  if (!token) throw new Error('permissionToken is required');
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function required(record, fields, label) {
  for (const field of fields) {
    if (record[field] === undefined || record[field] === null || record[field] === '') {
      throw new Error(`${label}.${field} is required`);
    }
  }
}

function readJsonl(file) {
  ensureStore();
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, idx) => {
      try { return JSON.parse(line); }
      catch (e) { throw new Error(`${file}:${idx + 1} invalid JSONL: ${e.message}`); }
    });
}

function appendJsonl(file, row) {
  ensureStore();
  fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf8');
  return row;
}

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeText(text) {
  return String(text || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function sanitizeAttrs(rawAttrs, warnings) {
  const out = [];
  const attrPattern = /([A-Za-z_:][A-Za-z0-9_:.-]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = attrPattern.exec(rawAttrs || ''))) {
    const name = m[1].toLowerCase();
    const value = m[3] ?? m[4] ?? m[5] ?? '';
    if (name.startsWith('on')) {
      warnings.push(`blocked event handler attribute: ${name}`);
      continue;
    }
    if (['href', 'src', 'srcset', 'action', 'formaction', 'xlink:href'].includes(name)) {
      warnings.push(`blocked URL-bearing attribute: ${name}`);
      continue;
    }
    if (name === 'style') {
      warnings.push('blocked inline style attribute');
      continue;
    }
    if (!SAFE_ATTRS.has(name)) {
      warnings.push(`removed unsupported attribute: ${name}`);
      continue;
    }
    out.push(`${name}="${escapeHtml(value).slice(0, 240)}"`);
  }
  return out.length ? ' ' + out.join(' ') : '';
}

function sanitizeStrictStatic(html) {
  const warnings = [];
  const source = sanitizeText(html);
  let output = '';
  let cursor = 0;
  const tokenPattern = /<\/?([A-Za-z][A-Za-z0-9:-]*)([^>]*)>/g;
  let m;
  while ((m = tokenPattern.exec(source))) {
    output += escapeHtml(source.slice(cursor, m.index));
    cursor = tokenPattern.lastIndex;
    const rawTag = m[0];
    const tag = m[1].toLowerCase();
    const closing = rawTag.startsWith('</');
    const attrs = m[2] || '';
    if (BLOCKED_TAGS.has(tag)) {
      warnings.push(`blocked tag: ${tag}`);
      continue;
    }
    if (!SAFE_TAGS.has(tag)) {
      warnings.push(`removed unsupported tag: ${tag}`);
      continue;
    }
    if (closing) {
      if (!VOID_TAGS.has(tag)) output += `</${tag}>`;
      continue;
    }
    output += `<${tag}${sanitizeAttrs(attrs, warnings)}${VOID_TAGS.has(tag) ? '>' : '>'}`;
  }
  output += escapeHtml(source.slice(cursor));
  return {
    ok: warnings.length === 0,
    profile: 'strict_static',
    html: output,
    warnings: [...new Set(warnings)],
    blocked: warnings.length > 0,
  };
}

function patchPath(patchId) {
  return path.join(PATCHES_DIR, `${slug(patchId, 'patch')}.json`);
}

function surfacePath(surfaceId) {
  return path.join(SURFACES_DIR, `${slug(surfaceId, 'surface')}.json`);
}

function validateSurfaceContract(surface) {
  assertObject(surface, 'surface');
  required(surface, ['id', 'title', 'owner', 'scope', 'allowedEventIds', 'state', 'createdAt', 'updatedAt'], 'surface');
  required(surface, ['surface_id', 'session_id', 'created_by', 'purpose', 'ttl_seconds', 'status', 'audience_policy', 'slot_map', 'schema_refs', 'allowed_events', 'blocked_events', 'state_keys', 'permission_profile', 'tool_routes', 'sanitizer_profile', 'proof_policy', 'lesson_policy'], 'surface');
  if (!/^lf_[a-zA-Z0-9_-]+$/.test(surface.surface_id)) throw new Error('surface.surface_id must match ^lf_[a-zA-Z0-9_-]+$');
  if (String(surface.purpose || '').length < 8) throw new Error('surface.purpose must be at least 8 characters');
  if (!Number.isInteger(surface.ttl_seconds) || surface.ttl_seconds < 60 || surface.ttl_seconds > 86400) throw new Error('surface.ttl_seconds must be an integer from 60 to 86400');
  if (!SURFACE_STATUSES.has(surface.status)) throw new Error(`surface.status must be one of: ${[...SURFACE_STATUSES].join(', ')}`);
  assertObject(surface.audience_policy, 'surface.audience_policy');
  required(surface.audience_policy, ['default_visibility', 'allowed_scopes'], 'surface.audience_policy');
  if (!AUDIENCE_SCOPES.has(surface.audience_policy.default_visibility)) throw new Error('surface.audience_policy.default_visibility is invalid');
  if (!Array.isArray(surface.audience_policy.allowed_scopes) || !surface.audience_policy.allowed_scopes.every(s => AUDIENCE_SCOPES.has(s))) throw new Error('surface.audience_policy.allowed_scopes contains invalid scope');
  assertObject(surface.slot_map, 'surface.slot_map');
  if (!Object.values(surface.slot_map).every(v => typeof v === 'string')) throw new Error('surface.slot_map values must be strings');
  for (const field of ['schema_refs', 'allowed_events', 'blocked_events', 'state_keys']) {
    if (!Array.isArray(surface[field]) || !surface[field].every(v => typeof v === 'string')) throw new Error(`surface.${field} must be an array of strings`);
  }
  if (typeof surface.permission_profile !== 'string') throw new Error('surface.permission_profile must be a string');
  assertObject(surface.tool_routes, 'surface.tool_routes');
  if (!Object.values(surface.tool_routes).every(v => typeof v === 'string')) throw new Error('surface.tool_routes values must be strings');
  if (!SANITIZER_PROFILES.has(surface.sanitizer_profile)) throw new Error('surface.sanitizer_profile is invalid');
  if (!PROOF_POLICIES.has(surface.proof_policy)) throw new Error('surface.proof_policy is invalid');
  if (!LESSON_POLICIES.has(surface.lesson_policy)) throw new Error('surface.lesson_policy is invalid');
  if (!SURFACE_SCOPES.has(surface.scope)) throw new Error(`surface.scope must be one of: ${[...SURFACE_SCOPES].join(', ')}`);
  if (!Array.isArray(surface.allowedEventIds)) throw new Error('surface.allowedEventIds must be an array');
  if (!surface.allowedEventIds.every(x => typeof x === 'string' && x.trim())) throw new Error('surface.allowedEventIds must contain non-empty strings');
  assertObject(surface.state, 'surface.state');
  if (surface.eventSchemas !== undefined) assertObject(surface.eventSchemas, 'surface.eventSchemas');
  if (surface.ttl && Number.isNaN(Date.parse(surface.ttl))) throw new Error('surface.ttl must be an ISO timestamp');
  return surface;
}

function normalizeSurfaceContract(surface) {
  const routeMap = surface.route_map || surface.tool_routes || surface.toolRoutes || {};
  const rawAudience = surface.audience_policy || surface.audiencePolicy || {};
  const audiencePolicy = {
    default_visibility: normalizeVisibility(rawAudience.default_visibility || rawAudience.default || 'public'),
    allowed_scopes: Array.isArray(rawAudience.allowed_scopes)
      ? rawAudience.allowed_scopes.map(normalizeVisibility)
      : Array.isArray(rawAudience.supported)
        ? rawAudience.supported.map(normalizeVisibility)
        : ['public', 'named_recipient_only'],
  };
  const ttlSeconds = Number(surface.ttl_seconds || surface.ttlSeconds || 3600);
  const rawPermissionProfile = surface.permission_profile || surface.permissionProfile || 'default_deny_tool_gateway_only';
  const permissionProfile = typeof rawPermissionProfile === 'string' ? rawPermissionProfile : 'default_deny_tool_gateway_only';
  const rawProofPolicy = surface.proof_policy || surface.proofPolicy || 'log_all';
  const proofPolicy = typeof rawProofPolicy === 'string' && PROOF_POLICIES.has(rawProofPolicy) ? rawProofPolicy : 'log_all';
  const rawLessonPolicy = surface.lesson_policy || surface.lessonPolicy || 'propose_and_replay';
  const lessonPolicy = typeof rawLessonPolicy === 'string' && LESSON_POLICIES.has(rawLessonPolicy) ? rawLessonPolicy : 'propose_and_replay';
  const canonicalSurfaceId = /^lf_[a-zA-Z0-9_-]+$/.test(String(surface.surface_id || surface.id || ''))
    ? (surface.surface_id || surface.id)
    : canonicalId('lf', surface.id || surface.title || 'migrated-surface');
  return {
    ...surface,
    surface_id: canonicalSurfaceId,
    session_id: surface.session_id || surface.sessionId || surface.metadata?.sessionId || 'local-session',
    created_by: surface.created_by || surface.owner,
    purpose: surface.purpose || surface.title,
    ttl_seconds: ttlSeconds,
    ttl: surface.ttl || futureIso(ttlSeconds * 1000),
    status: surface.status || 'active',
    audience_policy: audiencePolicy,
    slot_map: surface.slot_map || surface.slotMap || { main: 'primary surface body' },
    schema_refs: surface.schema_refs || surface.schemaRefs || Object.keys(surface.eventSchemas || {}),
    allowed_events: surface.allowed_events || surface.allowedEventIds || [],
    blocked_events: surface.blocked_events || surface.blockedEvents || ['shell.direct', 'file.direct_write', 'git.direct_mutation', 'network.external'],
    state_keys: surface.state_keys || surface.stateKeys || Object.keys(surface.state || {}),
    permission_profile: permissionProfile,
    tool_routes: routeMap,
    sanitizer_profile: surface.sanitizer_profile || surface.sanitizerProfile || 'strict_static',
    proof_policy: proofPolicy,
    lesson_policy: lessonPolicy,
  };
}

function surfaceExpired(surface) {
  return Boolean(surface.ttl && Date.parse(surface.ttl) <= Date.now());
}

function createSurface(input = {}) {
  ensureStore();
  const at = now();
  if (!input.audience_policy && !input.audiencePolicy && input.owner !== 'system') {
    writeFailureReceipt('surface.create.rejected', 'surface.audience_policy is required', { reason: 'missing_audience_policy' });
    throw new Error('surface.audience_policy is required');
  }
  if (input.ttl_seconds !== undefined && (Number(input.ttl_seconds) < 60 || Number(input.ttl_seconds) > 86400)) {
    writeFailureReceipt('surface.schema.failed', 'surface.ttl_seconds must be between 60 and 86400', { ttl_seconds: input.ttl_seconds });
    throw new Error('surface.ttl_seconds must be between 60 and 86400');
  }
  const surface = {
    id: input.surface_id || (/^lf_[a-zA-Z0-9_-]+$/.test(String(input.id || '')) ? input.id : canonicalId('lf', input.title || input.owner || 'liveforge')),
    title: String(input.title || 'Untitled LiveForge Surface'),
    owner: String(input.owner || 'system'),
    scope: input.scope || 'chat',
    allowedEventIds: Array.isArray(input.allowedEventIds || input.allowed_events) && (input.allowedEventIds || input.allowed_events).length
      ? [...new Set((input.allowedEventIds || input.allowed_events).map(String))]
      : ['surface.note'],
    eventSchemas: input.eventSchemas && typeof input.eventSchemas === 'object' && !Array.isArray(input.eventSchemas) ? input.eventSchemas : {},
    state: input.state && typeof input.state === 'object' && !Array.isArray(input.state) ? input.state : {},
    metadata: input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata) ? input.metadata : {},
    session_id: input.session_id || input.sessionId,
    created_by: input.created_by || input.createdBy,
    purpose: input.purpose,
    ttl: input.ttl,
    ttl_seconds: input.ttl_seconds,
    status: input.status,
    audience_policy: input.audience_policy || input.audiencePolicy,
    slot_map: input.slot_map || input.slotMap,
    schema_refs: input.schema_refs || input.schemaRefs,
    blocked_events: input.blocked_events || input.blockedEvents,
    state_keys: input.state_keys || input.stateKeys,
    permission_profile: input.permission_profile || input.permissionProfile,
    tool_routes: input.tool_routes || input.toolRoutes,
    sanitizer_profile: input.sanitizer_profile || input.sanitizerProfile,
    proof_policy: input.proof_policy || input.proofPolicy,
    lesson_policy: input.lesson_policy || input.lessonPolicy,
    createdAt: input.createdAt || at,
    updatedAt: input.updatedAt || at,
    version: 1,
  };
  const normalized = normalizeSurfaceContract(surface);
  validateSurfaceContract(normalized);
  fs.writeFileSync(surfacePath(normalized.id), JSON.stringify(normalized, null, 2) + '\n', 'utf8');
  writeReceipt({
    kind: 'surface.created',
    surfaceId: normalized.id,
    ok: true,
    detail: `surface ${normalized.id} created`,
  });
  return normalized;
}

function readSurface(surfaceId) {
  if (!surfaceId) throw new Error('surfaceId is required');
  const file = surfacePath(surfaceId);
  if (!fs.existsSync(file)) throw new Error(`surface not found: ${surfaceId}`);
  const surface = normalizeSurfaceContract(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (surface.status === 'active' && surfaceExpired(surface)) {
    const expired = { ...surface, status: 'expired', updatedAt: now() };
    fs.writeFileSync(file, JSON.stringify(expired, null, 2) + '\n', 'utf8');
    writeReceipt({
      kind: 'surface.expired',
      surfaceId: expired.id,
      ok: true,
      detail: `surface ${expired.id} expired by ttl`,
    });
    return validateSurfaceContract(expired);
  }
  return validateSurfaceContract(surface);
}

function saveSurface(surface) {
  const normalized = normalizeSurfaceContract(surface);
  validateSurfaceContract(normalized);
  fs.writeFileSync(surfacePath(normalized.id), JSON.stringify(normalized, null, 2) + '\n', 'utf8');
  return normalized;
}

function listSurfaces() {
  ensureStore();
  return fs.readdirSync(SURFACES_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => readSurface(path.basename(f, '.json')));
}

function ensureChatSurface() {
  const existing = listSurfaces().find(s => s.id === 'lf_liveforge_chat_flow');
  if (existing) return existing;
  return createSurface({
    id: 'lf_liveforge_chat_flow',
    title: 'LIVEFORGE Chat Flow',
    owner: 'system',
    scope: 'chat',
    allowedEventIds: ['chat.received', 'chat.routed', 'chat.answered', 'chat.failed', 'chat.tool_call', 'chat.tool_result'],
    eventSchemas: {
      'chat.received': {
        required: ['message', 'statePatch'],
        additionalProperties: false,
        properties: {
          message: { type: 'string' },
          sessionId: { type: ['string', 'object'] },
          envelopeId: { type: 'string' },
          statePatch: { type: 'object' },
        },
      },
      'chat.routed': {
        required: ['route', 'statePatch'],
        additionalProperties: false,
        properties: {
          route: { type: 'string' },
          provider: { type: 'string' },
          model: { type: 'string' },
          envelopeId: { type: 'string' },
          statePatch: { type: 'object' },
        },
      },
      'chat.answered': {
        required: ['state', 'statePatch'],
        additionalProperties: false,
        properties: {
          state: { type: 'string' },
          source: { type: 'string' },
          envelopeId: { type: 'string' },
          statePatch: { type: 'object' },
        },
      },
      'chat.failed': {
        required: ['state', 'statePatch'],
        additionalProperties: false,
        properties: {
          state: { type: 'string' },
          error: { type: 'string' },
          envelopeId: { type: 'string' },
          statePatch: { type: 'object' },
        },
      },
      'chat.tool_call': {
        required: ['tool', 'statePatch'],
        additionalProperties: false,
        properties: {
          tool: { type: 'string' },
          envelopeId: { type: 'string' },
          statePatch: { type: 'object' },
        },
      },
      'chat.tool_result': {
        required: ['tool', 'ok', 'statePatch'],
        additionalProperties: false,
        properties: {
          tool: { type: 'string' },
          ok: { type: 'boolean' },
          envelopeId: { type: 'string' },
          statePatch: { type: 'object' },
        },
      },
    },
    state: {
      received: 0,
      answered: 0,
      failed: 0,
      routed: 0,
      toolCalls: 0,
      toolResults: 0,
    },
  });
}

function recordChatEvent(input = {}) {
  const surface = ensureChatSurface();
  const eventId = input.eventId || 'chat.received';
  const current = surface.state || {};
  const nextCountKey = eventId === 'chat.received' ? 'received'
    : eventId === 'chat.answered' ? 'answered'
      : eventId === 'chat.failed' ? 'failed'
        : eventId === 'chat.routed' ? 'routed'
          : eventId === 'chat.tool_call' ? 'toolCalls'
            : eventId === 'chat.tool_result' ? 'toolResults'
              : 'received';
  const statePatch = {
    [nextCountKey]: Number(current[nextCountKey] || 0) + 1,
    lastEvent: eventId,
    lastEnvelopeId: input.envelopeId || null,
    lastAt: now(),
    ...(input.statePatch && typeof input.statePatch === 'object' && !Array.isArray(input.statePatch) ? input.statePatch : {}),
  };
  return writeEvent({
    surfaceId: surface.id,
    eventId,
    actor: input.actor || { type: 'system', id: 'chat-api' },
    payload: {
      ...input.payload,
      envelopeId: input.envelopeId || input.payload?.envelopeId || '',
      statePatch,
    },
    idempotency_key: input.idempotency_key || input.idempotencyKey || id('idem', input.eventId || 'chat'),
    __internal: true,
    trace: input.trace || {},
  });
}

function recordChatReceipt(input = {}) {
  const surface = ensureChatSurface();
  return writeReceipt({
    kind: input.kind || 'chat.receipt',
    surfaceId: surface.id,
    eventId: input.eventId || null,
    ok: input.ok !== false,
    detail: input.detail || '',
    evidence: input.evidence || {},
  });
}

function validateEventEnvelope(event) {
  assertObject(event, 'event');
  required(event, ['id', 'surfaceId', 'eventId', 'actor', 'payload', 'createdAt'], 'event');
  required(event, ['event_id', 'surface_id', 'session_id', 'actor_id', 'actor_type', 'audience_context', 'event_type', 'intent', 'schema_version', 'timestamp', 'idempotency_key'], 'event');
  if (!Object.prototype.hasOwnProperty.call(event, 'requested_tool_route')) throw new Error('event.requested_tool_route is required');
  if (!Object.prototype.hasOwnProperty.call(event, 'permission_token')) throw new Error('event.permission_token is required');
  if (!/^lfe_[a-zA-Z0-9_-]+$/.test(event.event_id)) throw new Error('event.event_id must match ^lfe_[a-zA-Z0-9_-]+$');
  if (!/^lf_[a-zA-Z0-9_-]+$/.test(event.surface_id)) throw new Error('event.surface_id must match ^lf_[a-zA-Z0-9_-]+$');
  if (!['user', 'agent', 'system', 'tool'].includes(event.actor_type)) throw new Error('event.actor_type is invalid');
  assertObject(event.audience_context, 'event.audience_context');
  required(event.audience_context, ['visibility'], 'event.audience_context');
  if (!AUDIENCE_SCOPES.has(normalizeVisibility(event.audience_context.visibility))) throw new Error('event.audience_context.visibility is invalid');
  if (Number.isNaN(Date.parse(event.timestamp))) throw new Error('event.timestamp must be date-time');
  assertObject(event.actor, 'event.actor');
  assertObject(event.payload, 'event.payload');
  const surface = readSurface(event.surfaceId);
  if (surface.status !== 'active' || surfaceExpired(surface)) {
    throw new Error(`surface ${surface.id} is ${surfaceExpired(surface) ? 'expired' : surface.status}; events are disabled`);
  }
  if (!surface.allowedEventIds.includes(event.eventId)) {
    throw new Error(`eventId ${event.eventId} is not allowed for surface ${event.surfaceId}`);
  }
  validatePayloadAgainstSchema(event.payload, surface.eventSchemas?.[event.eventId], `payload for ${event.eventId}`);
  return { event, surface };
}

function validatePayloadAgainstSchema(payload, schema, label) {
  if (!schema) return true;
  assertObject(schema, `${label}.schema`);
  assertObject(payload, label);
  const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
    ? schema.properties
    : {};
  const requiredFields = Array.isArray(schema.required) ? schema.required : [];
  for (const field of requiredFields) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
      throw new Error(`${label}.${field} is required`);
    }
  }
  if (schema.additionalProperties === false) {
    for (const field of Object.keys(payload)) {
      if (!Object.prototype.hasOwnProperty.call(properties, field)) {
        throw new Error(`${label}.${field} is not allowed by schema`);
      }
    }
  }
  for (const [field, rule] of Object.entries(properties)) {
    if (payload[field] === undefined || payload[field] === null) continue;
    const allowed = Array.isArray(rule.type) ? rule.type : [rule.type || 'any'];
    const value = payload[field];
    const actual = Array.isArray(value) ? 'array' : typeof value;
    if (!allowed.includes('any') && !allowed.includes(actual)) {
      throw new Error(`${label}.${field} must be ${allowed.join('|')}, got ${actual}`);
    }
  }
  return true;
}

function deepMerge(base, patch) {
  const out = { ...(base || {}) };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function normalizedType(value) {
  return Array.isArray(value) ? 'array' : typeof value;
}

function validateSchemaPayload(payload, schema, label = 'payload') {
  if (!schema) return true;
  return validatePayloadAgainstSchema(payload, schema, label);
}

function translateDisplayText(text) {
  const corrected = String(text || '').replace(/\bteh\b/gi, 'the').replace(/\bwrok\b/gi, 'work');
  return {
    original: String(text || ''),
    corrected,
    translated: `PURPCLAW-display:${corrected}`,
  };
}

function emptyConnect4Board() {
  return Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => null));
}

function connect4Winner(board) {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let r = 0; r < 6; r += 1) {
    for (let c = 0; c < 7; c += 1) {
      const piece = board[r]?.[c];
      if (!piece) continue;
      for (const [dr, dc] of dirs) {
        let count = 1;
        for (let i = 1; i < 4; i += 1) {
          if (board[r + dr * i]?.[c + dc * i] === piece) count += 1;
        }
        if (count >= 4) return piece;
      }
    }
  }
  return null;
}

function applyTemplateState(surface, event) {
  const template = surface.metadata?.template || surface.template;
  if (template === 'translator_toggle' && event.eventId === 'translator.submit') {
    const display = translateDisplayText(event.payload.text || '');
    return {
      ...event,
      payload: {
        ...event.payload,
        statePatch: {
          messages: [...(surface.state.messages || []), display],
          lastDisplay: display,
        },
      },
    };
  }
  if (template === 'connect4' && event.eventId === 'game.move') {
    const column = Number(event.payload.column);
    if (!Number.isInteger(column) || column < 0 || column > 6) throw new Error('game.move.payload.column must be an integer from 0 to 6');
    const board = Array.isArray(surface.state.board) ? surface.state.board.map(row => Array.isArray(row) ? [...row] : []) : emptyConnect4Board();
    const player = surface.state.currentPlayer || event.payload.player || 'R';
    const row = [...Array(6).keys()].reverse().find(r => !board[r]?.[column]);
    if (row === undefined) throw new Error(`illegal move: column ${column} is full`);
    board[row][column] = player;
    const winner = connect4Winner(board);
    return {
      ...event,
      payload: {
        ...event.payload,
        statePatch: {
          board,
          currentPlayer: winner ? player : player === 'R' ? 'Y' : 'R',
          winner,
          moves: [...(surface.state.moves || []), { player, column, row, at: now() }],
        },
      },
    };
  }
  if (template === 'schema_app' && event.eventId === 'schema.submit') {
    const recordSchema = surface.metadata?.recordSchema || surface.state?.recordSchema;
    validateSchemaPayload(event.payload.record, recordSchema, 'schema.submit.record');
    return {
      ...event,
      payload: {
        ...event.payload,
        statePatch: {
          rows: [...(surface.state.rows || []), event.payload.record],
        },
      },
    };
  }
  return event;
}

function renderStateCard(surface, event) {
  return [
    '<article class="liveforge-state" data-kind="state-preview">',
    `<h2>${escapeHtml(surface.title)}</h2>`,
    `<p>Updated by ${escapeHtml(event.eventId)}</p>`,
    `<pre data-key="state">${escapeHtml(JSON.stringify(surface.state, null, 2))}</pre>`,
    '</article>',
  ].join('');
}

function readToolRoutes() {
  ensureStore();
  const raw = JSON.parse(fs.readFileSync(TOOL_ROUTES_FILE, 'utf8'));
  return Array.isArray(raw.routes) ? raw.routes : [];
}

function writeToolRoutes(routes) {
  ensureStore();
  fs.writeFileSync(TOOL_ROUTES_FILE, JSON.stringify({ routes }, null, 2) + '\n', 'utf8');
  return routes;
}

function proposalOutputPath(proposal) {
  const ext = proposal.kind === 'css' ? '.css' : proposal.kind === 'config' ? '.json' : '.txt';
  return path.join(APPROVED_WRITES_DIR, `${slug(proposal.id, 'proposal')}${ext}`);
}

function createGeneratedToolProposal(input = {}) {
  const surface = readSurface(input.surfaceId);
  const kind = String(input.kind || 'prompt').toLowerCase();
  if (!['css', 'config', 'prompt'].includes(kind)) throw new Error('proposal kind must be css, config, or prompt');
  const content = String(input.content || '');
  if (!content.trim()) throw new Error('proposal content is required');
  const proposal = {
    id: input.id || id('proposal', `${surface.id}-${kind}`),
    surfaceId: surface.id,
    kind,
    title: String(input.title || `${kind} proposal`),
    content,
    status: 'proposed',
    createdAt: input.createdAt || now(),
    approvedAt: null,
    outputPath: null,
  };
  appendJsonl(GENERATED_TOOL_PROPOSALS_FILE, proposal);
  writeReceipt({
    kind: 'generated_tool.proposed',
    surfaceId: surface.id,
    ok: true,
    detail: `generated ${kind} proposal ${proposal.id} saved`,
    evidence: { proposalId: proposal.id, kind },
  });
  return proposal;
}

function listGeneratedToolProposals(surfaceId = null) {
  return readJsonl(GENERATED_TOOL_PROPOSALS_FILE).filter(p => !surfaceId || p.surfaceId === surfaceId);
}

function readGeneratedToolProposal(proposalId) {
  const proposal = listGeneratedToolProposals().slice().reverse().find(p => p.id === proposalId);
  if (!proposal) throw new Error(`proposal not found: ${proposalId}`);
  return proposal;
}

function registerToolRoute(input = {}) {
  const surface = readSurface(input.surfaceId);
  const route = {
    id: input.id || id('toolroute', `${surface.id}-${input.eventId || 'event'}-${input.toolName || 'tool'}`),
    surfaceId: surface.id,
    eventId: String(input.eventId || ''),
    toolName: String(input.toolName || ''),
    permissionTokenHash: input.permissionTokenHash || tokenHash(input.permissionToken),
    enabled: input.enabled !== false,
    createdAt: input.createdAt || now(),
  };
  required(route, ['id', 'surfaceId', 'eventId', 'toolName', 'permissionTokenHash', 'createdAt'], 'toolRoute');
  if (!surface.allowedEventIds.includes(route.eventId)) {
    throw new Error(`tool route eventId ${route.eventId} is not allowed by surface ${surface.id}`);
  }
  const tools = require('./tools');
  if (!tools.has(route.toolName)) throw new Error(`tool not registered: ${route.toolName}`);
  const routes = readToolRoutes().filter(r => r.id !== route.id);
  routes.push(route);
  writeToolRoutes(routes);
  writeReceipt({
    kind: 'tool_route.registered',
    surfaceId: surface.id,
    ok: true,
    detail: `route ${route.id} registered for ${route.eventId} -> ${route.toolName}`,
    evidence: { routeId: route.id, eventId: route.eventId, toolName: route.toolName },
  });
  return route;
}

function findToolRoute({ routeId, surfaceId, eventId }) {
  const routes = readToolRoutes();
  return routes.find(r =>
    r.enabled !== false &&
    (!routeId || r.id === routeId) &&
    (!surfaceId || r.surfaceId === surfaceId) &&
    (!eventId || r.eventId === eventId)
  );
}

async function executeToolRequest(input = {}) {
  const route = findToolRoute({ routeId: input.routeId, surfaceId: input.surfaceId, eventId: input.eventId });
  if (!route) throw new Error('no registered enabled tool route matches request');
  if (tokenHash(input.permissionToken) !== route.permissionTokenHash) throw new Error('permission token rejected');
  const surface = readSurface(route.surfaceId);
  const event = writeEvent({
    surfaceId: route.surfaceId,
    eventId: route.eventId,
    actor: input.actor && typeof input.actor === 'object' && !Array.isArray(input.actor) ? input.actor : { type: 'system', id: 'tool-gateway' },
    payload: input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? input.payload : {},
    idempotency_key: input.idempotency_key || input.idempotencyKey || id('idem', `${route.id}-${route.eventId}`),
    __internal: true,
    trace: { routeId: route.id, toolName: route.toolName, gateway: 'liveforge' },
  });
  writeReceipt({
    kind: 'tool.requested',
    surfaceId: route.surfaceId,
    eventId: event.id,
    ok: true,
    detail: `tool request accepted for ${route.toolName}`,
    evidence: { routeId: route.id, toolName: route.toolName },
  });
  const tools = require('./tools');
  const result = await tools.invoke(route.toolName, input.args || {});
  const updatedSurface = readSurface(surface.id);
  const nextState = deepMerge(updatedSurface.state, {
    toolResults: {
      [route.id]: {
        ok: result.ok !== false,
        toolName: route.toolName,
        result,
        at: now(),
      },
    },
  });
  const saved = saveSurface({
    ...updatedSurface,
    state: nextState,
    updatedAt: now(),
    version: (updatedSurface.version || 1) + 1,
  });
  const preview = createPatchPreview({
    surfaceId: saved.id,
    title: `Tool result from ${route.toolName}`,
    html: renderStateCard(saved, { eventId: `tool.${route.toolName}` }),
  });
  writeReceipt({
    kind: 'tool.executed',
    surfaceId: saved.id,
    eventId: event.id,
    ok: result.ok !== false,
    detail: `tool ${route.toolName} executed through route ${route.id}`,
    evidence: { routeId: route.id, toolName: route.toolName, statePatchPreviewId: preview.id },
  });
  return {
    ok: result.ok !== false,
    routeId: route.id,
    eventId: event.id,
    toolName: route.toolName,
    result,
    statePatchPreviewId: preview.id,
  };
}

async function approveGeneratedToolProposal(input = {}) {
  const proposal = readGeneratedToolProposal(input.proposalId);
  const outputPath = proposalOutputPath(proposal);
  const execution = await executeToolRequest({
    routeId: input.routeId,
    permissionToken: input.permissionToken,
    actor: input.actor || { type: 'system', id: 'generated-tool-approval' },
    payload: input.payload || { reason: `approve generated ${proposal.kind} proposal` },
    args: {
      path: outputPath,
      content: proposal.content,
    },
  });
  const approved = {
    ...proposal,
    status: 'approved',
    approvedAt: now(),
    outputPath,
    approvalExecutionId: execution.eventId,
  };
  appendJsonl(GENERATED_TOOL_PROPOSALS_FILE, approved);
  writeReceipt({
    kind: 'generated_tool.approved_write',
    surfaceId: proposal.surfaceId,
    eventId: execution.eventId,
    ok: execution.ok,
    detail: `proposal ${proposal.id} approved through tool gateway`,
    evidence: {
      proposalId: proposal.id,
      outputPath,
      routeId: input.routeId,
      statePatchPreviewId: execution.statePatchPreviewId,
    },
  });
  return { ...approved, execution };
}

function writeEvent(input = {}) {
  const suppliedIdempotency = input.idempotency_key || input.idempotencyKey;
  if (!suppliedIdempotency && input.__internal !== true) {
    writeFailureReceipt('event.rejected', 'event.idempotency_key is required', { surfaceId: input.surfaceId || null, eventId: input.eventId || null });
    throw new Error('event.idempotency_key is required');
  }
  const envelopeId = input.event_id && /^lfe_[a-zA-Z0-9_-]+$/.test(String(input.event_id))
    ? input.event_id
    : input.id;
  const eventType = input.eventType || input.event_type || input.eventId || (/^lfe_/.test(String(input.event_id || '')) ? input.intent : input.event_id);
  const finalEventId = envelopeId || canonicalId('lfe', eventType || 'event');
  let event = {
    id: finalEventId,
    event_id: finalEventId,
    surfaceId: input.surfaceId || input.surface_id,
    surface_id: input.surfaceId || input.surface_id,
    eventId: eventType,
    sessionId: input.sessionId || input.session_id || null,
    session_id: input.sessionId || input.session_id || 'local-session',
    actor: input.actor && typeof input.actor === 'object' && !Array.isArray(input.actor)
      ? input.actor
      : { type: 'system', id: 'system' },
    actor_id: input.actor_id || input.actorId || input.actor?.id || 'system',
    actor_type: input.actor_type || input.actorType || input.actor?.type || 'system',
    audience_context: input.audience_context || input.audienceContext || { visibility: 'public' },
    event_type: eventType,
    intent: input.intent || eventType,
    payload: input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? input.payload : {},
    schema_version: input.schema_version || input.schemaVersion || '1',
    requested_tool_route: input.requested_tool_route || input.requestedToolRoute || null,
    permission_token: input.permission_token === undefined ? null : '[redacted]',
    timestamp: input.timestamp || input.createdAt || now(),
    idempotency_key: suppliedIdempotency || crypto.createHash('sha256').update(`${input.surfaceId}:${input.eventId}:${JSON.stringify(input.payload || {})}:${Date.now()}`).digest('hex').slice(0, 16),
    createdAt: input.createdAt || now(),
    trace: input.trace && typeof input.trace === 'object' && !Array.isArray(input.trace) ? input.trace : {},
  };
  let surface;
  try {
    ({ surface } = validateEventEnvelope(event));
  } catch (e) {
    writeFailureReceipt('event.rejected', e.message || String(e), { surfaceId: event.surfaceId || null, eventId: event.eventId || null });
    throw e;
  }
  const duplicate = readJsonl(EVENTS_FILE).find(e => e.surfaceId === event.surfaceId && e.idempotency_key === event.idempotency_key);
  if (duplicate) {
    writeReceipt({
      kind: 'event.duplicate',
      surfaceId: event.surfaceId,
      eventId: duplicate.id,
      ok: true,
      detail: `duplicate idempotency_key ignored for ${event.eventId}`,
      evidence: { idempotency_key: event.idempotency_key, duplicateOf: duplicate.id },
    });
    return { ...duplicate, duplicate: true };
  }
  try {
    event = applyTemplateState(surface, event);
  } catch (e) {
    writeFailureReceipt('event.rejected', e.message || String(e), { surfaceId: event.surfaceId || null, eventId: event.eventId || null, idempotency_key: event.idempotency_key });
    throw e;
  }
  appendJsonl(EVENTS_FILE, event);
  let statePatchPreview = null;
  if (event.payload.statePatch && typeof event.payload.statePatch === 'object' && !Array.isArray(event.payload.statePatch)) {
    const updatedSurface = {
      ...surface,
      state: deepMerge(surface.state, event.payload.statePatch),
      updatedAt: now(),
      version: (surface.version || 1) + 1,
    };
    saveSurface(updatedSurface);
    statePatchPreview = createPatchPreview({
      surfaceId: updatedSurface.id,
      title: `State update from ${event.eventId}`,
      html: renderStateCard(updatedSurface, event),
    });
  }
  writeReceipt({
    kind: 'event.accepted',
    surfaceId: event.surfaceId,
    eventId: event.id,
    ok: true,
    detail: statePatchPreview
      ? `event ${event.eventId} accepted and state updated`
      : `event ${event.eventId} accepted`,
    evidence: statePatchPreview ? { statePatchPreviewId: statePatchPreview.id } : {},
  });
  return statePatchPreview ? { ...event, statePatchPreviewId: statePatchPreview.id } : event;
}

function readEvent(eventId) {
  if (!eventId) throw new Error('eventId is required');
  const event = readJsonl(EVENTS_FILE).slice().reverse().find(e => e.id === eventId || e.event_id === eventId);
  if (!event) throw new Error(`event not found: ${eventId}`);
  return event;
}

function validateEventOnly(input = {}) {
  const suppliedIdempotency = input.idempotency_key || input.idempotencyKey;
  const envelopeId = input.event_id && /^lfe_[a-zA-Z0-9_-]+$/.test(String(input.event_id))
    ? input.event_id
    : input.id;
  const eventType = input.eventType || input.event_type || input.eventId || (/^lfe_/.test(String(input.event_id || '')) ? input.intent : input.event_id);
  const finalEventId = envelopeId || canonicalId('lfe', eventType || 'event');
  const event = {
    id: finalEventId,
    event_id: finalEventId,
    surfaceId: input.surfaceId || input.surface_id,
    surface_id: input.surfaceId || input.surface_id,
    eventId: eventType,
    sessionId: input.sessionId || input.session_id || null,
    actor: input.actor && typeof input.actor === 'object' && !Array.isArray(input.actor)
      ? input.actor
      : { type: input.actor_type || 'system', id: input.actor_id || 'system' },
    actor_id: input.actor_id || input.actorId || input.actor?.id || 'system',
    actor_type: input.actor_type || input.actorType || input.actor?.type || 'system',
    audience_context: input.audience_context || input.audienceContext || { visibility: 'public' },
    event_type: eventType,
    intent: input.intent || eventType,
    payload: input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? input.payload : {},
    schema_version: input.schema_version || input.schemaVersion || '1',
    requested_tool_route: input.requested_tool_route || input.requestedToolRoute || null,
    permission_token: input.permission_token === undefined ? null : '[redacted]',
    timestamp: input.timestamp || input.createdAt || now(),
    idempotency_key: suppliedIdempotency,
    createdAt: input.createdAt || now(),
    trace: input.trace && typeof input.trace === 'object' && !Array.isArray(input.trace) ? input.trace : {},
  };
  if (!event.idempotency_key) throw new Error('event.idempotency_key is required');
  validateEventEnvelope(event);
  return { ok: true, event };
}

function routeEvent(input = {}) {
  if (input.requested_tool_route || input.requestedToolRoute || input.routeId) {
    return executeToolRequest({
      routeId: input.requested_tool_route || input.requestedToolRoute || input.routeId,
      permissionToken: input.permissionToken || input.permission_token,
      actor: input.actor,
      payload: input.payload,
      args: input.args || {},
      idempotency_key: input.idempotency_key || input.idempotencyKey,
    });
  }
  return Promise.resolve(writeEvent(input));
}

function readSurfaceState(surfaceId) {
  const surface = readSurface(surfaceId);
  return {
    ok: true,
    surfaceId: surface.id,
    status: surface.status,
    ttl: surface.ttl,
    version: surface.version || 1,
    state: surface.state,
    updatedAt: surface.updatedAt,
  };
}

function writeReceipt(input = {}) {
  const receipt = {
    id: input.id || id('receipt', input.kind || 'receipt'),
    kind: String(input.kind || 'receipt'),
    surfaceId: input.surfaceId || null,
    eventId: input.eventId || null,
    ok: input.ok !== false,
    detail: String(input.detail || ''),
    evidence: input.evidence && typeof input.evidence === 'object' && !Array.isArray(input.evidence) ? input.evidence : {},
    createdAt: input.createdAt || now(),
  };
  return appendJsonl(RECEIPTS_FILE, receipt);
}

function writeFailureReceipt(kind, detail, evidence = {}) {
  try {
    return writeReceipt({ kind, ok: false, detail, evidence });
  } catch {
    return null;
  }
}

function createPatchPreview(input = {}) {
  ensureStore();
  const surface = readSurface(input.surfaceId);
  const rawHtml = typeof input.html === 'string' ? input.html : '';
  if (!rawHtml.trim()) throw new Error('html is required');
  const sanitized = sanitizeStrictStatic(rawHtml);
  const patch = {
    id: input.id || id('patch', surface.id),
    surfaceId: surface.id,
    title: String(input.title || `Preview for ${surface.title}`),
    sanitizerProfile: 'strict_static',
    rawHtml,
    sanitizedHtml: sanitized.html,
    blocked: sanitized.blocked,
    warnings: sanitized.warnings,
    status: sanitized.blocked ? 'blocked' : 'preview',
    audience: normalizeAudience(input.audience),
    createdAt: input.createdAt || now(),
  };
  fs.writeFileSync(patchPath(patch.id), JSON.stringify(patch, null, 2) + '\n', 'utf8');
  writeReceipt({
    kind: sanitized.blocked ? 'patch.preview.blocked' : 'patch.preview.created',
    surfaceId: surface.id,
    ok: !sanitized.blocked,
    detail: sanitized.blocked
      ? `patch ${patch.id} blocked by strict_static`
      : `patch ${patch.id} preview created`,
    evidence: {
      patchId: patch.id,
      sanitizerProfile: patch.sanitizerProfile,
      warnings: patch.warnings,
    },
  });
  return patch;
}

function normalizeAudience(input = {}) {
  const visibility = input.visibility === 'private' ? 'private' : 'public';
  const recipients = Array.isArray(input.recipients)
    ? [...new Set(input.recipients.map(String).filter(Boolean))]
    : [];
  return {
    visibility,
    recipients: visibility === 'private' ? recipients : [],
  };
}

function readPatchPreview(patchId) {
  if (!patchId) throw new Error('patchId is required');
  const file = patchPath(patchId);
  if (!fs.existsSync(file)) throw new Error(`patch not found: ${patchId}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readPatchForAudience(patchId, viewerId = 'anonymous') {
  const patch = readPatchPreview(patchId);
  const audience = normalizeAudience(patch.audience);
  const viewer = String(viewerId || 'anonymous');
  const allowed = audience.visibility !== 'private' || audience.recipients.includes(viewer);
  const policy = allowed
    ? {
        allowed: true,
        visibility: audience.visibility,
        viewer,
        answer: 'content_visible',
      }
    : {
        allowed: false,
        visibility: audience.visibility,
        viewer,
        answer: 'private_content_hidden',
        reason: 'This patch is addressed to named recipients only.',
      };
  writeReceipt({
    kind: allowed ? 'privacy.patch_access.granted' : 'privacy.patch_access.denied',
    surfaceId: patch.surfaceId,
    ok: allowed,
    detail: allowed ? `patch ${patch.id} visible to ${viewer}` : `patch ${patch.id} hidden from ${viewer}`,
    evidence: { patchId: patch.id, viewer, audience },
  });
  return allowed ? { ok: true, policy, patch } : { ok: true, policy, patch: null };
}

function answerVisibilityQuestion(input = {}) {
  const surface = input.surfaceId ? readSurface(input.surfaceId) : null;
  const answer = surface
    ? 'This surface supports audience-scoped patches. I can show public content and content addressed to the viewer, but not private content addressed to someone else.'
    : 'LIVEFORGE supports audience-scoped patches. I can confirm private traffic may exist without revealing private content to unauthorized viewers.';
  const receipt = writeReceipt({
    kind: 'privacy.question.answered',
    surfaceId: surface?.id || null,
    ok: true,
    detail: answer,
    evidence: { viewerId: input.viewerId || 'anonymous', policy: surface?.audience_policy || null },
  });
  return { ok: true, answer, receiptId: receipt.id };
}

function listPatchPreviews(surfaceId = null) {
  ensureStore();
  return fs.readdirSync(PATCHES_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => JSON.parse(fs.readFileSync(path.join(PATCHES_DIR, f), 'utf8')))
    .filter(p => !surfaceId || p.surfaceId === surfaceId);
}

function listPatchPreviewsForAudience(surfaceId = null, viewerId = 'anonymous') {
  return listPatchPreviews(surfaceId).map(p => {
    const audience = normalizeAudience(p.audience);
    const viewer = String(viewerId || 'anonymous');
    if (audience.visibility === 'private' && !audience.recipients.includes(viewer)) {
      return {
        ok: true,
        policy: {
          allowed: false,
          visibility: audience.visibility,
          viewer,
          answer: 'private_content_hidden',
          reason: 'This patch is addressed to named recipients only.',
        },
        patch: {
          id: p.id,
          surfaceId: p.surfaceId,
          title: p.title,
          status: 'private',
          blocked: false,
          warnings: [],
          sanitizedHtml: '',
          createdAt: p.createdAt,
        },
      };
    }
    return {
      ok: true,
      policy: { allowed: true, visibility: audience.visibility, viewer, answer: 'content_visible' },
      patch: p,
    };
  });
}

function buildInvocationRegistry() {
  ensureStore();
  let tools = [];
  let skills = [];
  let agents = [];

  try {
    const toolRegistry = require('./tools');
    tools = (toolRegistry.list ? toolRegistry.list() : []).map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || {},
    }));
  } catch (e) {
    tools = [{ error: e.message || String(e) }];
  }

  try {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'skills', 'skills_registry.json'), 'utf8'));
    skills = Object.entries(raw).map(([name, skill]) => ({
      name,
      title: skill.title || skill.name || name,
      description: skill.description || '',
      tools: skill.tools || skill.allowedTools || [],
    }));
  } catch (e) {
    skills = [{ error: e.message || String(e) }];
  }

  try {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'agents', 'AGENT_REGISTRY.json'), 'utf8'));
    agents = (raw.agents || []).map(a => ({
      key: a.key || a.name,
      name: a.name || a.key,
      division: a.division || 'UNASSIGNED',
      role: a.role || '',
      skills: a.skills || [],
    }));
  } catch (e) {
    agents = [{ error: e.message || String(e) }];
  }

  const registry = {
    ok: true,
    phase: 7,
    generatedAt: now(),
    purpose: 'Routing substrate only. Phase 1 records available invocations but does not execute them.',
    counts: {
      tools: tools.filter(t => !t.error).length,
      skills: skills.filter(s => !s.error).length,
      agents: agents.filter(a => !a.error).length,
    },
    tools,
    skills,
    agents,
  };
  fs.writeFileSync(INVOCATION_REGISTRY_FILE, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  writeReceipt({
    kind: 'invocation_registry.snapshot',
    ok: true,
    detail: `snapshot: ${registry.counts.tools} tools, ${registry.counts.skills} skills, ${registry.counts.agents} agents`,
    evidence: registry.counts,
  });
  return registry;
}

function readAgentPrompts() {
  const markdown = fs.existsSync(AGENT_PROMPT_FILE) ? fs.readFileSync(AGENT_PROMPT_FILE, 'utf8') : '';
  const roles = Object.fromEntries(Object.entries(AGENT_PROMPT_ROLES).map(([role, requiredOutputs]) => {
    const present = markdown.includes(`## ${role}`);
    const outputsPresent = requiredOutputs.filter(field => markdown.includes(`\`${field}\``) || markdown.includes(`- ${field}`));
    return [role, {
      role,
      present,
      requiredOutputs,
      outputsPresent,
      ok: present && outputsPresent.length === requiredOutputs.length,
    }];
  }));
  return {
    ok: Object.values(roles).every(r => r.ok),
    promptFile: AGENT_PROMPT_FILE,
    roles,
  };
}

function validateLessonProposal(lesson) {
  assertObject(lesson, 'lesson');
  required(lesson, ['id', 'sourceEventId', 'surfaceId', 'summary', 'risk', 'status', 'createdAt'], 'lesson');
  required(lesson, ['lesson_id', 'context', 'old_behavior', 'new_behavior', 'evidence', 'replay_case', 'risk_level'], 'lesson');
  if (!/^lfl_[a-zA-Z0-9_-]+$/.test(lesson.lesson_id)) throw new Error('lesson.lesson_id must match ^lfl_[a-zA-Z0-9_-]+$');
  if (!Array.isArray(lesson.evidence) || !lesson.evidence.every(v => typeof v === 'string')) throw new Error('lesson.evidence must be an array of strings');
  if (!LESSON_RISKS.has(lesson.risk)) throw new Error(`lesson.risk must be one of: ${[...LESSON_RISKS].join(', ')}`);
  if (!LESSON_STATUSES.has(lesson.status)) throw new Error(`lesson.status must be one of: ${[...LESSON_STATUSES].join(', ')}`);
  readSurface(lesson.surfaceId);
  return lesson;
}

function proposeLesson(input = {}) {
  const lesson = {
    id: input.id || input.lesson_id || canonicalId('lfl', input.summary || 'lesson'),
    sourceEventId: input.sourceEventId,
    surfaceId: input.surfaceId,
    summary: String(input.summary || ''),
    risk: input.risk || 'medium',
    status: input.status || 'pending',
    proposedPatch: input.proposedPatch && typeof input.proposedPatch === 'object' && !Array.isArray(input.proposedPatch) ? input.proposedPatch : {},
    createdAt: input.createdAt || now(),
  };
  lesson.lesson_id = lesson.id;
  lesson.context = String(input.context || lesson.summary);
  lesson.old_behavior = String(input.old_behavior || input.oldBehavior || input.old || 'previous behaviour not captured');
  lesson.new_behavior = String(input.new_behavior || input.newBehavior || lesson.summary);
  lesson.evidence = Array.isArray(input.evidence) ? input.evidence.map(String) : [lesson.sourceEventId || lesson.surfaceId].filter(Boolean);
  lesson.replay_case = input.replay_case && typeof input.replay_case === 'object' && !Array.isArray(input.replay_case) ? input.replay_case : { sourceEventId: lesson.sourceEventId };
  lesson.risk_level = input.risk_level || lesson.risk;
  validateLessonProposal(lesson);
  appendJsonl(LESSONS_FILE, lesson);
  writeReceipt({
    kind: 'lesson.proposed',
    surfaceId: lesson.surfaceId,
    eventId: lesson.sourceEventId,
    ok: true,
    detail: `lesson ${lesson.id} proposed`,
  });
  return lesson;
}

function listLessons(status = null) {
  return readJsonl(LESSONS_FILE).filter(l => !status || l.status === status);
}

function readLesson(lessonId) {
  const lesson = listLessons().slice().reverse().find(l => l.id === lessonId);
  if (!lesson) throw new Error(`lesson not found: ${lessonId}`);
  return lesson;
}

function replayLesson(input = {}) {
  const lesson = readLesson(input.lessonId);
  const checks = [];
  let passed = true;
  try {
    readSurface(lesson.surfaceId);
    checks.push({ name: 'surface_exists', ok: true });
  } catch (e) {
    checks.push({ name: 'surface_exists', ok: false, error: e.message || String(e) });
    passed = false;
  }
  if (!String(lesson.summary || '').trim()) {
    checks.push({ name: 'summary_present', ok: false });
    passed = false;
  } else {
    checks.push({ name: 'summary_present', ok: true });
  }
  if (lesson.risk === 'high' && input.selfPromote === true) {
    checks.push({ name: 'high_risk_self_promote_block', ok: false });
    passed = false;
  }
  const replay = {
    id: input.id || id('replay', lesson.id),
    lessonId: lesson.id,
    passed,
    checks,
    createdAt: now(),
  };
  appendJsonl(LESSON_REPLAYS_FILE, replay);
  writeReceipt({
    kind: passed ? 'lesson.replay.passed' : 'lesson.replay.failed',
    surfaceId: lesson.surfaceId,
    eventId: lesson.sourceEventId,
    ok: passed,
    detail: `lesson ${lesson.id} replay ${passed ? 'passed' : 'failed'}`,
    evidence: { lessonId: lesson.id, replayId: replay.id, checks },
  });
  return replay;
}

function listApprovedPatterns() {
  ensureStore();
  const raw = JSON.parse(fs.readFileSync(APPROVED_PATTERNS_FILE, 'utf8'));
  return Array.isArray(raw.patterns) ? raw.patterns : [];
}

function writeApprovedPatterns(patterns) {
  fs.writeFileSync(APPROVED_PATTERNS_FILE, JSON.stringify({ patterns }, null, 2) + '\n', 'utf8');
  return patterns;
}

function latestReplayPassed(lessonId) {
  return readJsonl(LESSON_REPLAYS_FILE).filter(r => r.lessonId === lessonId).slice(-1)[0]?.passed === true;
}

function promoteLesson(input = {}) {
  const lesson = readLesson(input.lessonId);
  if (!latestReplayPassed(lesson.id)) {
    const replay = replayLesson({ lessonId: lesson.id, selfPromote: input.selfPromote !== false });
    if (!replay.passed) {
      writeReceipt({
        kind: 'lesson.promotion.rollback',
        surfaceId: lesson.surfaceId,
        eventId: lesson.sourceEventId,
        ok: false,
        detail: `lesson ${lesson.id} promotion rolled back because replay failed`,
        evidence: { lessonId: lesson.id, replayId: replay.id },
      });
      throw new Error(`lesson replay failed: ${lesson.id}`);
    }
  }
  if (lesson.risk === 'high' && input.humanApprovalToken !== 'ALLOW_HIGH_RISK_PROMOTION') {
    writeReceipt({
      kind: 'lesson.promotion.rollback',
      surfaceId: lesson.surfaceId,
      eventId: lesson.sourceEventId,
      ok: false,
      detail: `high-risk lesson ${lesson.id} cannot self-promote`,
      evidence: { lessonId: lesson.id, risk: lesson.risk },
    });
    throw new Error('high-risk lesson cannot self-promote');
  }
  const pattern = {
    id: input.patternId || id('pattern', lesson.id),
    lessonId: lesson.id,
    surfaceId: lesson.surfaceId,
    summary: lesson.summary,
    risk: lesson.risk,
    proposedPatch: lesson.proposedPatch || {},
    approvedBy: input.approvedBy || 'system',
    createdAt: now(),
  };
  const patterns = listApprovedPatterns().filter(p => p.lessonId !== lesson.id);
  patterns.push(pattern);
  writeApprovedPatterns(patterns);
  appendJsonl(LESSONS_FILE, { ...lesson, status: 'approved', approvedPatternId: pattern.id, approvedAt: now() });
  writeReceipt({
    kind: 'lesson.promoted',
    surfaceId: lesson.surfaceId,
    eventId: lesson.sourceEventId,
    ok: true,
    detail: `lesson ${lesson.id} promoted to pattern ${pattern.id}`,
    evidence: { lessonId: lesson.id, patternId: pattern.id },
  });
  return pattern;
}

function fakeGreenAudit(surfaceId = null) {
  const surfaces = surfaceId ? [readSurface(surfaceId)] : listSurfaces();
  const receipts = readJsonl(RECEIPTS_FILE);
  const events = readJsonl(EVENTS_FILE);
  const patches = listPatchPreviews();
  const results = surfaces.map(surface => {
    const surfaceReceipts = receipts.filter(r => r.surfaceId === surface.id);
    const surfaceEvents = events.filter(e => e.surfaceId === surface.id);
    const surfacePatches = patches.filter(p => p.surfaceId === surface.id);
    const missing = [];
    if (!surfaceReceipts.some(r => r.kind === 'surface.created')) missing.push('surface.created receipt');
    if (surfaceEvents.length && !surfaceReceipts.some(r => r.kind === 'event.accepted')) missing.push('event.accepted receipt');
    if (surfacePatches.length && !surfacePatches.some(p => !p.blocked) && !surfaceReceipts.some(r => r.kind === 'patch.preview.blocked')) missing.push('render proof receipt');
    return {
      surfaceId: surface.id,
      ok: missing.length === 0,
      status: missing.length === 0 ? 'green' : 'fake-green',
      missing,
      receipts: surfaceReceipts.length,
      events: surfaceEvents.length,
      patches: surfacePatches.length,
    };
  });
  const ok = results.every(r => r.ok);
  writeReceipt({
    kind: ok ? 'fake_green.audit.passed' : 'fake_green.audit.failed',
    ok,
    detail: ok ? 'all audited surfaces have proof receipts' : 'one or more surfaces are missing proof receipts',
    evidence: { checked: results.length, failed: results.filter(r => !r.ok).length },
  });
  return { ok, results };
}

function health() {
  ensureStore();
  const probe = path.join(STORE_DIR, '.healthcheck');
  fs.writeFileSync(probe, now(), 'utf8');
  fs.unlinkSync(probe);
  const surfaces = listSurfaces();
  const patches = listPatchPreviews();
  return {
    ok: true,
    phase: 7,
    storeDir: STORE_DIR,
    surfaces: surfaces.length,
    events: readJsonl(EVENTS_FILE).length,
    receipts: readJsonl(RECEIPTS_FILE).length,
    patches: patches.length,
    blockedPatches: patches.filter(p => p.blocked).length,
    pendingLessons: readJsonl(LESSONS_FILE).filter(l => l.status === 'pending').length,
    approvedPatterns: listApprovedPatterns().length,
    toolRoutes: readToolRoutes().length,
    generatedToolProposals: listGeneratedToolProposals().length,
    invocationRegistry: fs.existsSync(INVOCATION_REGISTRY_FILE)
      ? JSON.parse(fs.readFileSync(INVOCATION_REGISTRY_FILE, 'utf8')).counts
      : null,
    contracts: {
      surfaceContract: true,
      specSurfaceContract: true,
      eventEnvelope: true,
      specEventEnvelope: true,
      lessonProposal: true,
      jsonlStores: true,
      ttlExpiry: true,
      fakeGreenAudit: true,
      agentPrompts: readAgentPrompts().ok,
    },
    agentPrompts: readAgentPrompts(),
    guards: {
      uiRendering: 'sandboxed_strict_static_preview',
      toolExecution: 'allowlisted_gateway_only',
      directFileWrite: false,
      approvedWrites: 'tool_gateway_only',
      privatePatchFiltering: true,
      externalNetwork: false,
    },
  };
}

module.exports = {
  STORE_DIR,
  SURFACES_DIR,
  EVENTS_FILE,
  RECEIPTS_FILE,
  LESSONS_FILE,
  INVOCATION_REGISTRY_FILE,
  PATCHES_DIR,
  TOOL_ROUTES_FILE,
  GENERATED_TOOL_PROPOSALS_FILE,
  APPROVED_WRITES_DIR,
  APPROVED_PATTERNS_FILE,
  LESSON_REPLAYS_FILE,
  ensureStore,
  readJsonl,
  appendJsonl,
  validateSurfaceContract,
  validateEventEnvelope,
  validateLessonProposal,
  sanitizeStrictStatic,
  normalizeAudience,
  createSurface,
  readSurface,
  listSurfaces,
  ensureChatSurface,
  recordChatEvent,
  recordChatReceipt,
  writeEvent,
  readEvent,
  validateEventOnly,
  routeEvent,
  writeReceipt,
  createPatchPreview,
  readPatchPreview,
  readPatchForAudience,
  readSurfaceState,
  listPatchPreviews,
  listPatchPreviewsForAudience,
  answerVisibilityQuestion,
  readToolRoutes,
  registerToolRoute,
  executeToolRequest,
  createGeneratedToolProposal,
  listGeneratedToolProposals,
  readGeneratedToolProposal,
  approveGeneratedToolProposal,
  proposeLesson,
  listLessons,
  readLesson,
  replayLesson,
  promoteLesson,
  listApprovedPatterns,
  fakeGreenAudit,
  buildInvocationRegistry,
  readAgentPrompts,
  health,
};
