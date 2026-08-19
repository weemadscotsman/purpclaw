#!/usr/bin/env node
'use strict';

/**
 * PURPCLAW coding-eval runner
 * ──────────────────────────
 * Dispatches the nex-agi/coding-eval tasks through PURPCLAW's agent
 * tower and captures the traces.
 *
 * Usage:
 *   node bin/coding-eval.js                        # run all 42 tasks
 *   node bin/coding-eval.js --limit 5             # run 5 tasks (smoke test)
 *   node bin/coding-eval.js --tasks frontend-001,data_analysis-001
 *   node bin/coding-eval.js --model minimax        # explicit model
 *   node bin/coding-eval.js --timeout 120000       # per-task timeout
 *   node bin/coding-eval.js --output agent_work/coding-eval/
 *   node bin/coding-eval.js --resume               # skip completed tasks
 *
 * Pipeline (per task):
 *   1. Read query from the coding-eval dataset
 *   2. Resolve input file map (read source files if referenced)
 *   3. Build the system prompt with file context
 *   4. POST to /api/chat (the unified API, port 3030)
 *   5. Capture the streaming response + token counts
 *   6. Write the trace as one jsonl line in the output dir
 *
 * No auto-routing, no auto-mutation. The runner is read-only against
 * the codebase; it only writes to its own output directory.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const DEFAULT_REPO = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW';
const DEFAULT_DATA = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/agent_work/eval-data/nex-coding-eval';
const DEFAULT_OUT = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/agent_work/coding-eval';
const DEFAULT_API = 'http://127.0.0.1:3000/api/chat'; // Next serves /api/chat on WEB_UI (3000); 3030 never listened

function parseArgs(args) {
  const opts = { limit: null, tasks: null, model: null, timeout: 120000, output: DEFAULT_OUT, data: DEFAULT_DATA, api: DEFAULT_API, dryRun: false, verbose: false, resume: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i+1]) { opts.limit = Number(args[i+1]); i++; }
    else if (args[i] === '--tasks' && args[i+1]) { opts.tasks = args[i+1].split(','); i++; }
    else if (args[i] === '--model' && args[i+1]) { opts.model = args[i+1]; i++; }
    else if (args[i] === '--timeout' && args[i+1]) { opts.timeout = Number(args[i+1]); i++; }
    else if (args[i] === '--output' && args[i+1]) { opts.output = args[i+1]; i++; }
    else if (args[i] === '--data' && args[i+1]) { opts.data = args[i+1]; i++; }
    else if (args[i] === '--api' && args[i+1]) { opts.api = args[i+1]; i++; }
    else if (args[i] === '--dry-run') { opts.dryRun = true; }
    else if (args[i] === '--resume') { opts.resume = true; }
    else if (args[i] === '--verbose' || args[i] === '-v') { opts.verbose = true; }
  }
  return opts;
}

function logHeader(opts) {
  console.log('PURPCLAW coding-eval runner');
  console.log('  data:    ' + opts.data);
  console.log('  output:  ' + opts.output);
  console.log('  api:     ' + opts.api);
  console.log('  limit:   ' + (opts.limit || 'all'));
  console.log('  model:   ' + (opts.model || 'default'));
  console.log('  timeout: ' + opts.timeout + 'ms per task');
  console.log('  dry-run: ' + opts.dryRun);
  console.log('  resume:  ' + opts.resume);
  console.log('  ──────');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return path.resolve(p);
}

function listTasks(dataDir) {
  // Prefer the traces jsonl (it has the queries inline).
  const tracesPath = path.join(dataDir, 'vibecoding_evaluation', 'evaluation_traces.jsonl');
  const mapPath = path.join(dataDir, 'vibecoding_evaluation', 'query_file_map.json');
  if (!fs.existsSync(tracesPath)) {
    console.error('Cannot find ' + tracesPath);
    console.error('Download the dataset first: hf.co/datasets/nex-agi/coding-eval');
    process.exit(1);
  }
  const traces = fs.readFileSync(tracesPath, 'utf8').split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  // Each trace record has fields: id, query, model, messages.
  // Group by id so we get one entry per task with all model outputs.
  const byId = new Map();
  for (const t of traces) {
    const tid = t.id;
    if (!byId.has(tid)) byId.set(tid, { id: tid, query: t.query, models: new Map() });
    if (t.model) byId.get(tid).models.set(t.model, t);
  }
  const fileMap = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, 'utf8')) : {};
  return Array.from(byId.values()).map(t => ({ id: t.id, query: t.query, inputFiles: fileMap[t.id] || null, modelOutputs: Array.from(t.models.keys()) }));
}

function resolveInputFiles(task, dataDir) {
  if (!task.inputFiles) return '';
  const dir = path.join(dataDir, 'vibecoding_evaluation', 'vibecoding-test-files', task.inputFiles);
  if (!fs.existsSync(dir)) return '';
  // Read the first few files (cap at 20 files / 200KB to avoid blowing context).
  const files = fs.readdirSync(dir).filter(f => !f.startsWith('.') && !f.endsWith('.zip')).slice(0, 20);
  let total = 0;
  const MAX = 200_000;
  const out = [];
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isFile()) {
      const sz = fs.statSync(full).size;
      if (total + sz > MAX) break;
      const text = fs.readFileSync(full, 'utf8');
      out.push(`--- ${f} ---\n${text}`);
      total += sz;
    }
  }
  return out.join('\n\n');
}

function buildSystemPrompt(task, fileContext) {
  let sys = 'You are PURPCLAW, a coding assistant. Solve the following task and produce working code. Be concise.';
  if (fileContext) {
    sys += '\n\n# Reference files\n\nThe following files are provided as context. Read them carefully before answering.\n\n' + fileContext;
  }
  return sys;
}

// POST a non-streaming call to /api/chat. Returns the parsed JSON response.
function callChat(opts, systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const u = new URL(opts.api);
    const body = JSON.stringify({
      message: userPrompt,
      source: 'coding-eval',
      system: systemPrompt,
      model: opts.model || undefined,
      stream: false,
    });
    const req = http.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: opts.timeout,
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, json });
        } catch (e) {
          resolve({ status: res.statusCode, error: 'parse: ' + e.message, body: data.slice(0, 500) });
        }
      });
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

function elapsed(start) { return Date.now() - start; }

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'been', 'before', 'build',
  'can', 'create', 'for', 'from', 'generate', 'has', 'have', 'into', 'make',
  'more', 'that', 'the', 'then', 'this', 'using', 'with', 'write', 'your',
]);

function taskTerms(query) {
  const words = String(query || '').toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [];
  return Array.from(new Set(words.filter(w => !STOP_WORDS.has(w)))).slice(0, 20);
}

function normalizeToolCalls(value) {
  if (Array.isArray(value)) return value;
  if (Number.isFinite(Number(value))) return Array.from({ length: Number(value) }, () => ({ source: 'count-only' }));
  return [];
}

function scoreTrace(trace, task) {
  if (trace.dryRun) return { score: null, grade: 'DRY-RUN', checks: {}, notes: ['No model call made.'] };
  const reply = String(trace.reply || '');
  const lower = reply.toLowerCase();
  const terms = taskTerms(task.query);
  const matchedTerms = terms.filter(term => lower.includes(term));
  const toolCalls = normalizeToolCalls(trace.toolCalls);
  const realToolCalls = toolCalls.filter(call => {
    const source = String(call?.source || '').toLowerCase();
    return source !== 'policy-adapter' && source !== 'adapter' && call?.ok !== false;
  });
  const hasCode = /```[\s\S]{20,}?```/.test(reply) ||
    /\b(function|class|const|let|var|def|import|select|create table|<html|npm|pip)\b/i.test(reply);
  const checks = {
    transport: { points: trace.status >= 200 && trace.status < 300 ? 15 : 0, max: 15 },
    completed: { points: trace.ok && !trace.error ? 15 : 0, max: 15 },
    substantive: { points: reply.trim().length >= 120 ? 15 : reply.trim().length >= 40 ? 8 : 0, max: 15 },
    taskCoverage: { points: terms.length ? Math.round(20 * matchedTerms.length / terms.length) : 0, max: 20 },
    codeEvidence: { points: hasCode ? 15 : 0, max: 15 },
    toolEvidence: { points: realToolCalls.length ? 10 : 0, max: 10 },
    telemetry: { points: trace.tokens ? 5 : 0, max: 5 },
    attribution: { points: trace.model && trace.model !== 'default' ? 5 : 0, max: 5 },
  };
  const score = Object.values(checks).reduce((sum, check) => sum + check.points, 0);
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
  const notes = [];
  if (!realToolCalls.length) notes.push('No non-adapter tool receipt was returned by the API.');
  if (!trace.tokens) notes.push('Token/cost telemetry missing from the API response.');
  if (!hasCode) notes.push('No code or implementation artifact detected in the response.');
  return {
    score, grade, checks, notes, matchedTerms, expectedTerms: terms,
    realToolCalls: realToolCalls.length,
  };
}

async function runOne(task, opts) {
  const t0 = Date.now();
  const fileContext = resolveInputFiles(task, opts.data);
  const systemPrompt = buildSystemPrompt(task, fileContext);
  const userPrompt = task.query;
  if (opts.dryRun) {
    return {
      at: new Date().toISOString(),
      task_id: task.id,
      queryLen: userPrompt.length,
      fileContextBytes: fileContext.length,
      fileContextName: task.inputFiles,
      model: opts.model || 'default',
      dryRun: true,
      elapsedMs: 0,
    };
  }
  try {
    const r = await callChat(opts, systemPrompt, userPrompt);
    return {
      at: new Date().toISOString(),
      task_id: task.id,
      queryLen: userPrompt.length,
      fileContextBytes: fileContext.length,
      fileContextName: task.inputFiles,
      model: opts.model || r.json?.model || 'default',
      status: r.status,
      ok: r.json && r.json.ok,
      reply: r.json ? (r.json.reply || r.json.content || '') : '',
      replyLen: r.json ? (r.json.reply || r.json.content || '').length : 0,
      replyPreview: r.json && (r.json.reply || r.json.content) ? (r.json.reply || r.json.content).slice(0, 300) : null,
      toolCalls: r.json ? (r.json.tool_calls || r.json.toolCalls || []) : [],
      tokens: r.json && r.json.usage ? r.json.usage : null,
      provider: r.json ? (r.json.provider || r.json.providerStatus || null) : null,
      apiErrors: r.json && Array.isArray(r.json.errors) ? r.json.errors : [],
      error: r.error || null,
      elapsedMs: elapsed(t0),
    };
  } catch (e) {
    return {
      at: new Date().toISOString(),
      task_id: task.id,
      queryLen: userPrompt.length,
      fileContextBytes: fileContext.length,
      fileContextName: task.inputFiles,
      model: opts.model || 'default',
      status: 0,
      ok: false,
      error: e.message,
      elapsedMs: elapsed(t0),
    };
  }
}

function readCompleted(jsonl) {
  const completed = new Set();
  if (!fs.existsSync(jsonl)) return completed;
  for (const line of fs.readFileSync(jsonl, 'utf8').split('\n')) {
    try {
      const trace = JSON.parse(line);
      if (trace.task_id && !trace.dryRun) completed.add(trace.task_id);
    } catch {}
  }
  return completed;
}

function writeReports(output, summary) {
  const rows = Object.entries(summary.byTask);
  const md = [
    '# PURPCLAW 42-Task Coding Evaluation',
    '',
    `Generated: ${summary.finishedAt}`,
    `Model: ${summary.model}`,
    `Tasks: ${summary.total}`,
    `Average harness score: ${summary.scores.average}/100`,
    `Pass threshold: ${summary.scores.passThreshold}/100`,
    '',
    '> Scores are transparent harness heuristics, not official Nex benchmark grades.',
    '',
    '| Task | Status | Score | Grade | Tools | Time |',
    '|---|---:|---:|---:|---:|---:|',
    ...rows.map(([id, r]) => `| ${id} | ${r.ok ? 'OK' : 'FAIL'} | ${r.score ?? '-'} | ${r.grade || '-'} | ${r.realToolCalls || 0} | ${r.elapsedMs || 0}ms |`),
    '',
    '## Totals',
    '',
    `- Passed score threshold: ${summary.scores.passed}`,
    `- Below threshold: ${summary.scores.failed}`,
    `- API errors: ${summary.totals.errored}`,
    `- Real tool receipts: ${summary.totals.realToolCalls}`,
    `- Tasks with token telemetry: ${summary.totals.withTelemetry}`,
  ].join('\n');
  fs.writeFileSync(path.join(output, 'report.md'), md, 'utf8');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  logHeader(opts);
  const tasks = listTasks(opts.data);
  let toRun = tasks;
  if (opts.tasks) toRun = toRun.filter(t => opts.tasks.includes(t.id));
  if (opts.limit) toRun = toRun.slice(0, opts.limit);
  console.log('  tasks:   ' + toRun.length + ' of ' + tasks.length + ' available');
  console.log('  ──────');
  opts.output = ensureDir(opts.output);
  const jsonl = path.join(opts.output, 'traces.jsonl');
  if (!opts.resume && fs.existsSync(jsonl)) fs.unlinkSync(jsonl);
  const completed = opts.resume ? readCompleted(jsonl) : new Set();
  if (completed.size) toRun = toRun.filter(task => !completed.has(task.id));
  const summary = {
    startedAt: new Date().toISOString(), dryRun: opts.dryRun, model: opts.model || 'default',
    total: toRun.length, byTask: {},
    totals: { ok: 0, fail: 0, errored: 0, dryRun: 0, ms: 0, realToolCalls: 0, withTelemetry: 0 },
    scores: { passThreshold: 70, passed: 0, failed: 0, average: 0 },
  };
  const tStart = Date.now();
  for (let i = 0; i < toRun.length; i++) {
    const task = toRun[i];
    process.stdout.write('  [' + (i+1) + '/' + toRun.length + '] ' + task.id + ' ... ');
    const trace = await runOne(task, opts);
    trace.evaluation = scoreTrace(trace, task);
    if (trace.dryRun) { summary.totals.dryRun++; process.stdout.write('DRY-RUN'); }
    else if (trace.ok) { summary.totals.ok++; process.stdout.write('OK ' + trace.elapsedMs + 'ms'); }
    else if (trace.error) { summary.totals.errored++; process.stdout.write('ERR ' + trace.error.slice(0, 60)); }
    else { summary.totals.fail++; process.stdout.write('FAIL ' + (trace.replyLen || 0) + 'b'); }
    if (trace.toolCalls) {
      const n = Array.isArray(trace.toolCalls) ? trace.toolCalls.length : trace.toolCalls;
      process.stdout.write('  tool_calls=' + n);
    }
    process.stdout.write('\n');
    const evaluation = trace.evaluation;
    if (evaluation.score !== null) {
      if (evaluation.score >= summary.scores.passThreshold) summary.scores.passed++;
      else summary.scores.failed++;
      summary.totals.realToolCalls += evaluation.realToolCalls || 0;
    }
    if (trace.tokens) summary.totals.withTelemetry++;
    summary.byTask[task.id] = {
      ok: trace.ok, error: trace.error, elapsedMs: trace.elapsedMs, replyLen: trace.replyLen,
      toolCalls: normalizeToolCalls(trace.toolCalls).length, realToolCalls: evaluation.realToolCalls,
      score: evaluation.score, grade: evaluation.grade, notes: evaluation.notes,
    };
    summary.totals.ms += trace.elapsedMs || 0;
    fs.appendFileSync(jsonl, JSON.stringify(trace) + '\n');
  }
  summary.finishedAt = new Date().toISOString();
  summary.totalMs = Date.now() - tStart;
  const scored = Object.values(summary.byTask).map(t => t.score).filter(Number.isFinite);
  summary.scores.average = scored.length ? Number((scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(2)) : 0;
  fs.writeFileSync(path.join(opts.output, 'summary.json'), JSON.stringify(summary, null, 2));
  writeReports(opts.output, summary);
  console.log('  ──────');
  console.log('  total:  ' + summary.totals.ok + ' ok / ' + summary.totals.fail + ' fail / ' + summary.totals.errored + ' errored / ' + summary.totals.dryRun + ' dry-run');
  console.log('  ms:     ' + summary.totals.ms + ' across ' + toRun.length + ' tasks (' + (toRun.length ? Math.round(summary.totals.ms / toRun.length) : 0) + ' avg)');
  console.log('  out:    ' + jsonl);
  console.log('  score:  ' + summary.scores.average + '/100 avg · ' + summary.scores.passed + ' pass / ' + summary.scores.failed + ' below threshold');
}

if (require.main === module) main().catch(error => {
  console.error('coding-eval failed: ' + (error.stack || error.message));
  process.exitCode = 1;
});

module.exports = { parseArgs, listTasks, taskTerms, scoreTrace, normalizeToolCalls, runOne };
