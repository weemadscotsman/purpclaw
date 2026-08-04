'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd && process.cwd().endsWith('PURPCLAW') ? process.cwd() : path.resolve(__dirname, '..');
const STORE_DIR = path.join(ROOT, '.purpclaw', 'mycelium');
const SPORES_FILE = path.join(STORE_DIR, 'spores.jsonl');
const ROUTES_FILE = path.join(STORE_DIR, 'routes.jsonl');
const NUTRIENTS_FILE = path.join(STORE_DIR, 'bundles.jsonl');
const CONTRADICTIONS_FILE = path.join(STORE_DIR, 'conflicts.jsonl');
const PENDING_PATTERNS_FILE = path.join(STORE_DIR, 'patterns.pending.jsonl');
const PATTERNS_FILE = path.join(STORE_DIR, 'patterns.approved.jsonl');
const RECEIPTS_FILE = path.join(STORE_DIR, 'receipts.jsonl');

const SCOPES = new Set(['public_surface', 'user_only', 'agent_only', 'project_private', 'system_private', 'secret_blocked']);
const LEGACY_SCOPE_MAP = { public: 'public_surface', named_recipient_only: 'user_only', admin_only: 'system_private', hidden_system_event: 'system_private' };
const RISKS = new Set(['low', 'medium', 'high', 'critical']);
const RISK_RANK = { low: 1, medium: 2, high: 3, critical: 4 };
const PACKET_TYPES = new Set(['route_hint', 'tool_success', 'tool_failure', 'warning', 'user_preference', 'workflow_pattern', 'surface_pattern', 'schema_pattern', 'sanitizer_rule', 'privacy_rule', 'agent_handoff', 'conflict', 'deprecated_pattern', 'promotion_candidate', 'approved_colony_pattern']);
const SOURCE_TYPES = new Set(['user', 'agent', 'tool', 'liveforge_surface', 'proof_log', 'system', 'manual_import']);
const DECAY_POLICIES = new Set(['session', 'short', 'project', 'pinned', 'version_bound', 'external_fact']);
const PROMOTION_STATES = new Set(['raw', 'candidate', 'replay_required', 'approved', 'rejected', 'deprecated']);

function now() {
  return new Date().toISOString();
}

function id(prefix, seed = '') {
  const clean = String(seed || prefix).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72) || prefix;
  const hash = crypto.createHash('sha256').update(`${clean}:${Date.now()}:${Math.random()}`).digest('hex').slice(0, 8);
  return `${prefix}_${clean}_${hash}`;
}

function ensureStore() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  for (const file of [SPORES_FILE, ROUTES_FILE, NUTRIENTS_FILE, CONTRADICTIONS_FILE, PENDING_PATTERNS_FILE, PATTERNS_FILE, RECEIPTS_FILE]) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, '', 'utf8');
  }
}

function readJsonl(file) {
  ensureStore();
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line, i) => {
    try { return JSON.parse(line); }
    catch (e) { throw new Error(`${file}:${i + 1} invalid JSONL: ${e.message}`); }
  });
}

function appendJsonl(file, row) {
  ensureStore();
  fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf8');
  return row;
}

function receipt(kind, ok, detail, evidence = {}) {
  return appendJsonl(RECEIPTS_FILE, {
    receipt_id: id('myr', kind),
    kind,
    ok: ok !== false,
    detail: String(detail || ''),
    evidence,
    created_at: now(),
  });
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function requireFields(record, fields, label) {
  for (const field of fields) {
    if (record[field] === undefined || record[field] === null || record[field] === '') throw new Error(`${label}.${field} is required`);
  }
}

function normalizeScope(scope) {
  const raw = String(scope || 'public_surface').replace(/-/g, '_');
  return LEGACY_SCOPE_MAP[raw] || raw;
}

function sourceTypeFromLegacy(sourceKind) {
  const raw = String(sourceKind || 'system').replace(/-/g, '_');
  if (raw.includes('liveforge')) return 'liveforge_surface';
  if (raw === 'event') return 'system';
  return SOURCE_TYPES.has(raw) ? raw : 'system';
}

function packetTypeFromLegacy(input = {}) {
  if (PACKET_TYPES.has(input.packet_type)) return input.packet_type;
  if ((input.tags || []).includes('failure') || input.risk === 'high') return 'warning';
  if ((input.tags || []).includes('success')) return 'tool_success';
  return 'workflow_pattern';
}

function secondsUntil(iso) {
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  return Math.max(60, Math.ceil((Date.parse(iso) - Date.now()) / 1000));
}

function isStale(spore) {
  return Date.parse(spore.expires_at || new Date(Date.parse(spore.created_at) + spore.ttl_seconds * 1000).toISOString()) <= Date.now();
}

function validateSpore(spore) {
  assertObject(spore, 'spore');
  requireFields(spore, ['spore_id', 'created_at', 'created_by', 'source_type', 'source_ref', 'packet_type', 'title', 'summary', 'payload', 'tags', 'visibility_scope', 'allowed_consumers', 'blocked_consumers', 'confidence', 'evidence_refs', 'ttl_seconds', 'decay_policy', 'risk_level', 'promotion_state'], 'spore');
  if (!/^spore_[a-zA-Z0-9_-]+$/.test(spore.spore_id)) throw new Error('spore.spore_id is invalid');
  if (!SOURCE_TYPES.has(spore.source_type)) throw new Error('spore.source_type is invalid');
  if (!PACKET_TYPES.has(spore.packet_type)) throw new Error('spore.packet_type is invalid');
  if (spore.title.length < 3) throw new Error('spore.title must be at least 3 characters');
  if (spore.summary.length < 8) throw new Error('spore.summary must be at least 8 characters');
  if (!SCOPES.has(spore.visibility_scope)) throw new Error('spore.visibility_scope is invalid');
  if (!RISKS.has(spore.risk_level)) throw new Error('spore.risk_level is invalid');
  if (!DECAY_POLICIES.has(spore.decay_policy)) throw new Error('spore.decay_policy is invalid');
  if (!PROMOTION_STATES.has(spore.promotion_state)) throw new Error('spore.promotion_state is invalid');
  if (typeof spore.confidence !== 'number' || spore.confidence < 0 || spore.confidence > 1) throw new Error('spore.confidence must be 0..1');
  if (!Array.isArray(spore.tags) || !spore.tags.every(t => typeof t === 'string')) throw new Error('spore.tags must be strings');
  if (!Array.isArray(spore.evidence_refs) || !spore.evidence_refs.length) throw new Error('spore.evidence_refs is required');
  if (!Number.isInteger(spore.ttl_seconds) || spore.ttl_seconds < 60) throw new Error('spore.ttl_seconds must be >= 60');
  return spore;
}

function writeSpore(input = {}) {
  try {
    const spore = validateSpore({
      spore_id: input.spore_id || id('spore', input.summary || input.source_id || 'event'),
      created_at: input.created_at || now(),
      created_by: String(input.created_by || input.createdBy || input.source_kind || 'system'),
      source_type: input.source_type || sourceTypeFromLegacy(input.source_kind),
      source_ref: String(input.source_ref || input.source_id || ''),
      packet_type: input.packet_type || packetTypeFromLegacy(input),
      title: String(input.title || input.summary || 'Untitled spore').slice(0, 120),
      summary: String(input.summary || ''),
      payload: input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
        ? input.payload
        : input.content && typeof input.content === 'object' && !Array.isArray(input.content)
          ? input.content
          : { text: String(input.content || input.summary || '') },
      tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
      visibility_scope: normalizeScope(input.visibility_scope || input.scope),
      allowed_consumers: Array.isArray(input.allowed_consumers) ? input.allowed_consumers.map(String) : Array.isArray(input.recipients) ? input.recipients.map(String) : [],
      blocked_consumers: Array.isArray(input.blocked_consumers) ? input.blocked_consumers.map(String) : [],
      confidence: Number(input.confidence),
      evidence_refs: Array.isArray(input.evidence_refs) ? input.evidence_refs.map(String) : input.proof?.ref ? [String(input.proof.ref)] : [],
      ttl_seconds: Number(input.ttl_seconds || secondsUntil(input.expires_at) || 7 * 24 * 60 * 60),
      decay_policy: input.decay_policy || 'short',
      risk_level: input.risk_level || input.risk || 'medium',
      promotion_state: input.promotion_state || 'raw',
      polarity: input.polarity || null,
    });
    spore.expires_at = new Date(Date.parse(spore.created_at) + spore.ttl_seconds * 1000).toISOString();
    spore.source_kind = spore.source_type;
    spore.source_id = spore.source_ref;
    spore.content = spore.payload;
    spore.scope = spore.visibility_scope;
    spore.risk = spore.risk_level;
    spore.proof = { kind: 'evidence_refs', ref: spore.evidence_refs[0] };
    spore.recipients = spore.allowed_consumers;
    appendJsonl(SPORES_FILE, spore);
    receipt('spore.written', true, `spore ${spore.spore_id} written`, { spore_id: spore.spore_id });
    detectContradictions(spore);
    return spore;
  } catch (e) {
    receipt('spore.rejected', false, e.message || String(e), { source_id: input.source_id || null });
    throw e;
  }
}

function visibleTo(spore, requester = {}) {
  const scope = normalizeScope(requester.scope);
  const id = String(requester.id || '');
  const sporeScope = normalizeScope(spore.visibility_scope || spore.scope);
  if (sporeScope === 'public_surface') return true;
  if (scope === 'system_private') return true;
  if ((spore.allowed_consumers || spore.recipients || []).includes(id)) return true;
  if ((spore.blocked_consumers || []).includes(id)) return false;
  return sporeScope === scope;
}

function queryMatches(spore, query) {
  const q = String(query || '').toLowerCase();
  if (!q) return true;
  return [spore.title, spore.summary, JSON.stringify(spore.payload || spore.content), ...(spore.tags || [])].join(' ').toLowerCase().includes(q);
}

function readSpores() {
  return readJsonl(SPORES_FILE);
}

function nutrientBundle(input = {}) {
  const requester = { id: input.consumer_id || input.requester_id || input.requesterId || 'anonymous', scope: normalizeScope(input.requester_scope || input.requesterScope || 'public_surface') };
  const minConfidence = Number(input.min_confidence ?? input.minConfidence ?? 0);
  const maxRisk = input.max_risk || input.maxRisk || 'high';
  const suppressed = [];
  const stale = [];
  const spores = readSpores().filter(spore => {
    if (isStale(spore)) {
      if (queryMatches(spore, input.query)) stale.push({ spore_id: spore.spore_id, reason: 'stale' });
      return false;
    }
    if (spore.confidence < minConfidence) return false;
    if (RISK_RANK[spore.risk_level || spore.risk] > RISK_RANK[maxRisk]) return false;
    if (!queryMatches(spore, input.query)) return false;
    if (!visibleTo(spore, requester)) {
      suppressed.push({ spore_id: spore.spore_id, reason: 'scope_filtered' });
      return false;
    }
    return true;
  });
  const bundle = appendJsonl(NUTRIENTS_FILE, {
    bundle_id: id('nutrient', input.query || requester.id),
    task_id: String(input.task_id || input.taskId || 'ad-hoc'),
    consumer_id: requester.id,
    reason: String(input.reason || input.query || 'mycelium query'),
    spores_included: spores.map(s => s.spore_id),
    spores_suppressed: [...suppressed, ...stale],
    max_tokens: Math.min(8000, Math.max(100, Number(input.max_tokens || input.maxTokens || 1200))),
    generated_at: now(),
    expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    requester_id: requester.id,
    requester_scope: requester.scope,
    query: String(input.query || ''),
    spores,
    redactions: suppressed,
    stale,
    created_at: now(),
  });
  receipt('nutrient.bundle.created', true, `nutrient bundle ${bundle.bundle_id} created`, {
    bundle_id: bundle.bundle_id,
    spores: spores.length,
    redactions: suppressed.length,
    stale: stale.length,
  });
  return bundle;
}

function detectContradictions(spore) {
  if (!spore.polarity) return [];
  const contradictions = readSpores().filter(other =>
    other.spore_id !== spore.spore_id &&
    other.polarity &&
    other.polarity !== spore.polarity &&
    (other.tags || []).some(t => (spore.tags || []).includes(t))
  );
  return contradictions.map(other => {
    const row = appendJsonl(CONTRADICTIONS_FILE, {
      contradiction_id: id('contradiction', spore.spore_id),
      spore_ids: [other.spore_id, spore.spore_id],
      tags: (spore.tags || []).filter(t => (other.tags || []).includes(t)),
      created_at: now(),
    });
    receipt('contradiction.detected', false, 'contradicting spores detected', row);
    return row;
  });
}

function registerRoute(input = {}) {
  const route = {
    route_id: input.route_id || id('hypha', `${input.producer_node || 'producer'}-${input.consumer_node || 'consumer'}`),
    producer_node: String(input.producer_node || ''),
    consumer_node: String(input.consumer_node || ''),
    packet_types_allowed: Array.isArray(input.packet_types_allowed) ? input.packet_types_allowed.map(String) : [...PACKET_TYPES],
    visibility_allowed: Array.isArray(input.visibility_allowed) ? input.visibility_allowed.map(normalizeScope) : ['public_surface'],
    transform_policy: input.transform_policy || 'none',
    rate_limit: input.rate_limit && typeof input.rate_limit === 'object' && !Array.isArray(input.rate_limit) ? input.rate_limit : { max_packets: 100, window_seconds: 3600 },
    requires_receipt: input.requires_receipt !== false,
    enabled: input.enabled !== false,
    created_at: input.created_at || now(),
  };
  requireFields(route, ['route_id', 'producer_node', 'consumer_node', 'packet_types_allowed', 'visibility_allowed', 'transform_policy', 'rate_limit', 'requires_receipt', 'enabled'], 'hyphaRoute');
  if (!/^hypha_[a-zA-Z0-9_-]+$/.test(route.route_id)) throw new Error('hyphaRoute.route_id is invalid');
  if (!['none', 'summarize', 'redact_private', 'lesson_only', 'proof_only'].includes(route.transform_policy)) throw new Error('hyphaRoute.transform_policy is invalid');
  appendJsonl(ROUTES_FILE, route);
  receipt('route.created', true, `hypha route ${route.route_id} registered`, { route_id: route.route_id });
  return route;
}

function listRoutes() {
  return readJsonl(ROUTES_FILE);
}

function listConflicts() {
  return readJsonl(CONTRADICTIONS_FILE);
}

function knownFailureWarning(input = {}) {
  const matches = readSpores().filter(spore =>
    (spore.tags || []).includes('failure') &&
    queryMatches(spore, input.query) &&
    visibleTo(spore, { id: input.requester_id || 'anonymous', scope: normalizeScope(input.requester_scope || 'public') })
  );
  const warning = { ok: true, warning: matches.length > 0, matches: matches.map(s => ({ spore_id: s.spore_id, summary: s.summary, risk: s.risk, confidence: s.confidence })) };
  receipt('failure.warning.checked', true, matches.length ? 'known failure warning returned' : 'no known failure matched', { matches: matches.length });
  return warning;
}

function promotePattern(input = {}) {
  const sporeIds = Array.isArray(input.spore_ids) ? input.spore_ids : [];
  if (!sporeIds.length) throw new Error('spore_ids is required');
  const spores = readSpores().filter(s => sporeIds.includes(s.spore_id));
  if (spores.length !== sporeIds.length) throw new Error('all spore_ids must exist');
  const risk = input.risk || spores.reduce((max, spore) => RISK_RANK[spore.risk] > RISK_RANK[max] ? spore.risk : max, 'low');
  if (input.replay_status !== 'passed') {
    receipt('pattern.promotion.blocked', false, 'pattern requires passed replay evidence', { spore_ids: sporeIds });
    throw new Error('pattern requires passed replay evidence');
  }
  if ((risk === 'high' || risk === 'critical') && input.replay_status !== 'passed') {
    receipt('pattern.promotion.blocked', false, 'high-risk pattern requires passed replay', { spore_ids: sporeIds });
    throw new Error('high-risk pattern requires passed replay');
  }
  if (input.replay_status && !['passed', 'failed'].includes(input.replay_status)) throw new Error('replay_status must be passed or failed');
  const pattern = appendJsonl(PATTERNS_FILE, {
    pattern_id: input.pattern_id || id('colony', input.summary || sporeIds.join('-')),
    name: String(input.name || input.summary || spores.map(s => s.title || s.summary).join('; ')),
    trigger_conditions: Array.isArray(input.trigger_conditions) ? input.trigger_conditions.map(String) : input.query ? [String(input.query)] : ['matching task context'],
    instruction: String(input.instruction || input.summary || spores.map(s => s.summary).join('; ')),
    evidence_refs: Array.isArray(input.evidence_refs) ? input.evidence_refs.map(String) : spores.flatMap(s => s.evidence_refs || []),
    replay_tests: Array.isArray(input.replay_tests) ? input.replay_tests.map(String) : [String(input.replay_status || 'passed')],
    approved_by: String(input.approved_by || input.approvedBy || 'system'),
    approved_at: now(),
    risk_level: risk,
    rollback_plan: String(input.rollback_plan || 'Disable colony pattern and fall back to source spores.'),
    spore_ids: sporeIds,
    summary: String(input.summary || spores.map(s => s.summary).join('; ')),
    replay_status: input.replay_status || 'passed',
    risk,
    created_at: now(),
  });
  receipt('pattern.promoted', true, `colony pattern ${pattern.pattern_id} promoted`, { pattern_id: pattern.pattern_id });
  return pattern;
}

function proposePattern(input = {}) {
  const sporeIds = Array.isArray(input.spore_ids) ? input.spore_ids : [];
  const pattern = appendJsonl(PENDING_PATTERNS_FILE, {
    pattern_id: input.pattern_id || id('colony', input.summary || sporeIds.join('-')),
    spore_ids: sporeIds,
    summary: String(input.summary || ''),
    replay_status: 'pending',
    risk: input.risk || input.risk_level || 'medium',
    created_at: now(),
  });
  receipt('pattern.proposed', true, `colony pattern ${pattern.pattern_id} proposed`, { pattern_id: pattern.pattern_id });
  return pattern;
}

function replayPattern(input = {}) {
  const pattern = {
    pattern_id: input.pattern_id || id('colony', input.summary || 'replay'),
    replay_status: input.passed === false ? 'failed' : 'passed',
    replay_tests: Array.isArray(input.replay_tests) ? input.replay_tests : ['manual replay evidence supplied'],
    created_at: now(),
  };
  receipt(pattern.replay_status === 'passed' ? 'pattern.replayed' : 'pattern.replay.failed', pattern.replay_status === 'passed', `pattern replay ${pattern.replay_status}`, pattern);
  return pattern;
}

function health() {
  ensureStore();
  const probe = path.join(STORE_DIR, '.healthcheck');
  fs.writeFileSync(probe, now(), 'utf8');
  fs.unlinkSync(probe);
  return {
    ok: true,
    storeDir: STORE_DIR,
    spores: readJsonl(SPORES_FILE).length,
    nutrientBundles: readJsonl(NUTRIENTS_FILE).length,
    contradictions: readJsonl(CONTRADICTIONS_FILE).length,
    colonyPatterns: readJsonl(PATTERNS_FILE).length,
    pendingPatterns: readJsonl(PENDING_PATTERNS_FILE).length,
    routes: readJsonl(ROUTES_FILE).length,
    receipts: readJsonl(RECEIPTS_FILE).length,
    guards: {
      proofRequired: true,
      scopeFiltering: true,
      expiryRequired: true,
      confidenceRequired: true,
      riskRequired: true,
      highRiskReplayRequired: true,
    },
  };
}

module.exports = {
  STORE_DIR,
  SPORES_FILE,
  ROUTES_FILE,
  NUTRIENTS_FILE,
  CONTRADICTIONS_FILE,
  PATTERNS_FILE,
  RECEIPTS_FILE,
  ensureStore,
  readJsonl,
  writeSpore,
  readSpores,
  nutrientBundle,
  knownFailureWarning,
  promotePattern,
  proposePattern,
  replayPattern,
  registerRoute,
  listRoutes,
  listConflicts,
  health,
};
