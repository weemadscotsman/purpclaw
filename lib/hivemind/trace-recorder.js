'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const { hash, nowIso, uniq, safeString } = require('./util');
const scorer = require('./skill-scorer');
const spring = require('./spring-validator');

function makeRunId(prefix = 'hm') {
  const d = new Date();
  const stamp = d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `${prefix}_${stamp}_${hash(`${process.pid}:${Date.now()}:${Math.random()}`, 8)}`;
}

function tracePath(runId) {
  return path.join(paths.TRACES_DIR, `${runId}.json`);
}

function normalizeTrace(input = {}) {
  const started = input.started_at || input.startTime || nowIso();
  const ended = input.ended_at || input.endTime || null;
  const rawToolCalls = Array.isArray(input.toolCalls) ? input.toolCalls : Array.isArray(input.tool_calls) ? input.tool_calls : [];
  const out = {
    schema: 'purpclaw.hivemind.trace.v1',
    run_id: input.run_id || makeRunId(),
    workflow_id: input.workflow_id || input.workflowId || input.id || null,
    mission_id: input.mission_id || input.missionId || null,
    task: safeString(input.task || input.command || input.target || '', 5000),
    source: input.source || 'unknown',
    agent: input.agent || input.agentName || input.agentId || 'unknown',
    model: input.model || 'unknown',
    provider: input.provider || null,
    intent: input.intent || input.parsed?.intent || 'general',
    job_type: input.job_type || input.type || input.parsed?.intent || 'general',
    route_intent: input.route_intent || input.routeIntent || input.intent || 'general',
    started_at: started,
    ended_at: ended,
    duration_ms: Number(input.duration_ms ?? input.duration ?? 0) || 0,
    tools_used: uniq(input.tools_used || input.tools || rawToolCalls.map(t => t.name || t.tool)),
    tool_calls: sanitizeToolCalls(rawToolCalls),
    files_touched: uniq(input.files_touched || input.files || extractFilesFromToolCalls(rawToolCalls)),
    commands: uniq(input.commands || extractCommandsFromToolCalls(rawToolCalls).map(c => redactSecrets(c, 300))),
    verification_gates: input.verification_gates || [],
    gate_results: input.gate_results || [],
    outcome: input.outcome || (input.status === 'completed' ? 'success' : input.status === 'failed' ? 'failed' : 'partial'),
    tests_passed: input.tests_passed ?? input.testsPassed ?? null,
    rollback: Boolean(input.rollback || input.rolledBack),
    destructive: Boolean(input.destructive),
    tokens: Number(input.tokens || input.tokensEstimate || 0) || 0,
    diff_summary: safeString(input.diff_summary || input.summary || input.result || input.output || '', 1200),
    evidence: uniq(input.evidence || extractEvidence(input)),
    error: input.error || null,
    events: Array.isArray(input.events) ? input.events : [],
    created_at: input.created_at || nowIso(),
    updated_at: nowIso()
  };
  out.score = scorer.traceScore(out);
  out.spring = spring.enrichRecord(out);
  out.spring_rank = out.spring.spring_rank;
  out.trust_score = out.spring.trust_score;
  try { spring.indexRecord(out.run_id, { ...out, kind: 'trace' }); } catch (_) {}
  return out;
}

function extractFilesFromToolCalls(calls = []) {
  const files = [];
  for (const tc of calls || []) {
    const args = tc.args || {};
    for (const key of ['file', 'path', 'filepath', 'filename', 'target', 'source']) {
      if (typeof args[key] === 'string' && /[\\/]|\.[a-z0-9]{1,8}$/i.test(args[key])) files.push(args[key]);
    }
  }
  return files;
}

function extractCommandsFromToolCalls(calls = []) {
  const commands = [];
  for (const tc of calls || []) {
    const name = tc.name || tc.tool;
    const args = tc.args || {};
    if (/shell|exec|terminal|command/i.test(String(name || ''))) commands.push(args.command || args.cmd || safeString(args, 300));
  }
  return commands;
}

function redactSecrets(value, limit = 1000) {
  const text = safeString(value, limit);
  return text
    .replace(/([A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASS|AUTH)[A-Z0-9_]*\s*[:=]\s*)["']?[^"',\s}]+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]')
    .replace(/(sk-[A-Za-z0-9_-]{12,})/g, '[REDACTED_KEY]');
}

function redactValue(value, depth = 0) {
  if (depth > 4) return '[DEPTH_LIMIT]';
  if (value == null) return value;
  if (typeof value === 'string') return redactSecrets(value, 500);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(v => redactValue(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value).slice(0, 40)) {
      if (/api[_-]?key|token|secret|password|pass|authorization|cookie|credential/i.test(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactValue(val, depth + 1);
      }
    }
    return out;
  }
  return safeString(value, 200);
}

function summarizeResult(value) {
  if (value == null) return null;
  if (typeof value === 'string') return redactSecrets(value, 700);
  if (typeof value === 'object') {
    const summary = {
      ok: value.ok,
      status: value.status || value.statusCode,
      error: value.error ? redactSecrets(value.error, 300) : undefined,
      message: value.message ? redactSecrets(value.message, 300) : undefined,
      count: Array.isArray(value) ? value.length : undefined,
      keys: !Array.isArray(value) ? Object.keys(value).slice(0, 20) : undefined,
    };
    return JSON.stringify(Object.fromEntries(Object.entries(summary).filter(([, v]) => v !== undefined))).slice(0, 700);
  }
  return safeString(value, 300);
}

function sanitizeToolCall(call = {}) {
  const args = call.args || call.arguments || call.input || {};
  const startedAt = call.started_at || call.startedAt || call.startTime || null;
  const finishedAt = call.finished_at || call.finishedAt || call.endTime || null;
  const record = {
    event: call.event || 'tool_call',
    tool: call.tool || call.name || call.function || 'unknown',
    status: call.status || (call.error ? 'failed' : call.result ? 'success' : 'unknown'),
    args_hash: hash(safeString(args, 5000), 16),
    args_summary: safeString(redactValue(args), 700),
    result_summary: summarizeResult(call.result || call.output || call.response),
    error_summary: call.error ? redactSecrets(call.error, 500) : null,
    duration_ms: Number(call.duration_ms ?? call.durationMs ?? 0) || 0,
    started_at: startedAt,
    finished_at: finishedAt,
  };
  const enriched = spring.enrichRecord({
    outcome: record.status === 'success' ? 'success' : record.status === 'failed' ? 'failed' : 'partial',
    evidence: record.result_summary ? ['tool_result_summary'] : [],
    source: 'hivemind_tool_span',
    error: record.error_summary || null,
  });
  record.spring_rank = enriched.spring_rank;
  record.spring_label = enriched.spring_label;
  record.trust_score = enriched.trust_score;
  return record;
}

function sanitizeToolCalls(calls = []) {
  return (calls || []).slice(0, 100).map(sanitizeToolCall);
}

function extractEvidence(input = {}) {
  const ev = [];
  if (Array.isArray(input.toolCalls) && input.toolCalls.length) ev.push(`tool_calls:${input.toolCalls.length}`);
  if (input.tests_passed || input.testsPassed) ev.push('tests_passed');
  if (input.status === 'completed' || input.outcome === 'success') ev.push('completed');
  if (input.result || input.output) ev.push('output_present');
  return ev;
}

function startTrace(input = {}) {
  paths.ensureHivemindDirs();
  const trace = normalizeTrace({ ...input, outcome: 'partial', events: [{ type: 'trace.started', at: nowIso() }] });
  paths.writeJsonAtomic(tracePath(trace.run_id), trace);
  paths.appendJsonl(paths.EVENTS_FILE, { at: nowIso(), type: 'hivemind.trace.started', run_id: trace.run_id, workflow_id: trace.workflow_id, task: trace.task.slice(0, 200) });
  return trace;
}

function loadTrace(runId) {
  paths.ensureHivemindDirs();
  return paths.readJson(tracePath(runId), null);
}

function saveTrace(trace) {
  trace.updated_at = nowIso();
  trace.score = scorer.traceScore(trace);
  paths.writeJsonAtomic(tracePath(trace.run_id), trace);
  return trace;
}

function recordEvent(runId, type, payload = {}) {
  const trace = loadTrace(runId);
  if (!trace) return null;
  trace.events = Array.isArray(trace.events) ? trace.events : [];
  trace.events.push({ at: nowIso(), type, ...payload });
  paths.appendJsonl(paths.EVENTS_FILE, { at: nowIso(), type, run_id: runId, ...payload });
  return saveTrace(trace);
}

function recordToolSpan(runId, phase, call = {}) {
  const span = sanitizeToolCall(call);
  const eventType = phase === 'started'
    ? 'tool_call_started'
    : phase === 'failed'
      ? 'tool_call_failed'
      : 'tool_call_finished';
  return recordEvent(runId, eventType, {
    ...span,
    result_summary: phase === 'started' ? null : span.result_summary,
    error_summary: phase === 'started' ? null : span.error_summary,
  });
}

function finishTrace(runId, patch = {}) {
  const current = loadTrace(runId);
  const trace = normalizeTrace({ ...(current || {}), ...patch, run_id: runId, ended_at: patch.ended_at || nowIso() });
  trace.events = [...(current?.events || []), { type: `trace.${trace.outcome}`, at: nowIso() }];
  const saved = saveTrace(trace);
  paths.appendJsonl(paths.EVENTS_FILE, { at: nowIso(), type: 'hivemind.trace.finished', run_id: runId, outcome: saved.outcome, score: saved.score });
  return saved;
}

function listTraces(limit = 50) {
  paths.ensureHivemindDirs();
  let files = [];
  try { files = fs.readdirSync(paths.TRACES_DIR).filter(f => f.endsWith('.json')); } catch { return []; }
  return files.map(f => paths.readJson(path.join(paths.TRACES_DIR, f), null)).filter(Boolean)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, limit);
}

module.exports = {
  makeRunId,
  normalizeTrace,
  startTrace,
  loadTrace,
  saveTrace,
  recordEvent,
  recordToolSpan,
  finishTrace,
  listTraces,
  tracePath,
  sanitizeToolCall,
  sanitizeToolCalls,
};
