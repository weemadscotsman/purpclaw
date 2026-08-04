'use strict';

/**
 * PURPCLAW_RESULT — Unified Result Schema
 * ======================================
 * One schema every harness output stage must produce.
 * Stage 3 deliverable (Eddie Cannon 2026-08-04).
 *
 * Replaces: ad-hoc job object shapes scattered across engine.js, benchmark.js,
 *           commands/harness.js, and any other place that hand-rolls a result.
 *
 * Canonical parity contract:
 *   INTAKE → ROUTER → TASK NORMALISER → CONTEXT SPINE → EXECUTION MODE
 *   → WORK LOOP → VERIFICATION → PACKAGING → MEMORY/AUDIT → PRESENTATION
 *
 * Every harness returns PURPCLAW_RESULT. Every presentation layer (CLI/TUI/Web)
 * renders the same result object.
 */

'use strict';

// ── Status values ────────────────────────────────────────────────────────────

/** @type {Record<string, string>} */
const RESULT_STATUS = Object.freeze({
  PASSED:       'passed',
  PARTIAL:      'partial',
  BLOCKED:      'blocked',
  FAILED:       'failed',
  STOPPED:      'stopped',
});

const VERDICTS = Object.freeze(['accepted', 'challenged', 'rejected', 'failed']);

// ── Result schema ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} HarnessVerdict
 * @property {string}  verdict      accepted | challenged | rejected | failed
 * @property {string}  reason       short human-readable reason
 * @property {string}  [refinement] guidance if challenged (optional)
 */

/**
 * @typedef {Object} SubtaskResult
 * @property {string}           id
 * @property {number}          index
 * @property {string}          description
 * @property {string}          rationale
 * @property {string}          state         pending | in_progress | accepted | challenged | rejected | failed
 * @property {string}          [verdict]     accepted | challenged | rejected
 * @property {string}          [verdictReason]
 * @property {number}          attempts
 * @property {string}          [dispatchedTo]
 * @property {string}          [output]       raw output from agent
 * @property {HarnessVerdict} [fishAudit]    accuracy-fish result if run
 * @property {Array<Object>}   [karenEscalations]
 * @property {number}          [startedAt]
 * @property {number}          [finishedAt]
 */

/**
 * @typedef {Object} HarnessMetrics
 * @property {number}  totalSubtasks
 * @property {number}  accepted
 * @property {number}  failed
 * @property {number}  challenged
 * @property {number}  acceptRate      0-1
 * @property {number}  iterations
 * @property {number}  toolsUsed
 * @property {number}  durationMs
 * @property {number}  karenEscalations
 * @property {boolean} usedFallbackPlanner
 */

/**
 * @typedef {Object} PurpClawResult
 * @property {string}           resultId          unique id for this result
 * @property {string}           harnessMode       codex | claude | hermes | minimax | auto
 * @property {string}           status            passed | partial | blocked | failed | stopped
 * @property {string}           summary           one-line summary for CLI/TUI
 * @property {string}           [finalReport]    full markdown report
 * @property {string}           goal              original goal
 * @property {string}           [taskId]          original task id if provided
 * @property {HarnessMetrics}   metrics
 * @property {SubtaskResult[]}   subtasks
 * @property {string[]}         filesRead
 * @property {string[]}         filesChanged
 * @property {string[]}         artifactsProduced
 * @property {string[]}         commandsRun
 * @property {Object[]}         errors
 * @property {string}           [nextAction]      recommended next step
 * @property {Object}           [persisted]       { persisted: 'state-store' | 'file' | 'none', error?: string }
 * @property {Object[]}         [trace]           harness execution trace
 * @property {Object[]}         [log]             harness log entries
 * @property {Object[]}         [scratchpad]      internal notes
 * @property {Object[]}         [learnedLessons]  memory atoms from this run
 */

// ── Builders ─────────────────────────────────────────────────────────────────

/**
 * Build a PurpClawResult from a completed harness job object.
 * @param {Object} job  — HarnessEngine job
 * @returns {PurpClawResult}
 */
function buildResult(job) {
  const subtasks = (job.plan || []).map(s => ({
    id:            s.id,
    index:         s.index,
    description:   s.description,
    rationale:     s.rationale || '',
    state:         s.state,
    verdict:       s.verdict || null,
    verdictReason: s.verdictReason || null,
    attempts:      s.attempts || 0,
    dispatchedTo:  s.dispatchedTo || null,
    output:        s.output || null,
    fishAudit:     s.fishAudit || null,
    karenEscalations: s.karenEscalations || [],
    startedAt:     s.startedAt || null,
    finishedAt:    s.finishedAt || null,
  }));

  const total     = subtasks.length;
  const accepted  = subtasks.filter(s => s.state === 'accepted').length;
  const failed    = subtasks.filter(s => ['failed', 'rejected'].includes(s.state)).length;
  const challenged = subtasks.filter(s => s.state === 'challenged').length;
  const acceptRate = total > 0 ? accepted / total : 0;

  const stateToStatus = {
    done:     RESULT_STATUS.PASSED,
    failed:   RESULT_STATUS.FAILED,
    stopped:  RESULT_STATUS.STOPPED,
  };

  let status;
  if (job.state === 'done') {
    status = RESULT_STATUS.PASSED;
  } else if (job.state === 'failed') {
    status = RESULT_STATUS.FAILED;
  } else if (job.state === 'stopped') {
    status = RESULT_STATUS.STOPPED;
  } else if (accepted > 0 && accepted < total) {
    status = RESULT_STATUS.PARTIAL;
  } else {
    status = RESULT_STATUS.BLOCKED;
  }

  // Collect files read / changed from trace entries
  const filesRead    = [];
  const filesChanged = [];
  const commandsRun  = [];
  const errors       = [];

  (job.log || []).forEach(entry => {
    if (entry.level === 'error') {
      errors.push({ ts: entry.timestamp, msg: entry.message, detail: entry.detail });
    }
  });

  const traceMap = new Map((job.trace || []).map(e => [`${e.stage}:${e.event}`, e]));
  const trace = (job.trace || []).map(e => ({
    ts:      e.timestamp,
    stage:   e.stage,
    event:   e.event,
    summary: e.summary,
    id:      e.subtaskId || null,
  }));

  const filesReadSet    = new Set();
  const filesChangedSet = new Set();
  const commandsRunSet  = new Set();

  (job.scratchpad || []).forEach(note => {
    if (typeof note === 'string') {
      // Detect file paths in scratchpad notes
      const pathMatches = note.match(/[A-Za-z]:[\\\/][^\s'"]+\.(js|ts|jsx|tsx|md|json)/g);
      if (pathMatches) {
        pathMatches.forEach(p => {
          if (/^(read|open|load)/i.test(note)) filesReadSet.add(p);
          else if (/^(write|patch|create|add)/i.test(note)) filesChangedSet.add(p);
        });
      }
      // Detect commands
      if (note.startsWith('$') || note.includes('`')) {
        const cmdMatch = note.match(/\$\s*(.+)/);
        if (cmdMatch) commandsRunSet.add(cmdMatch[1].trim().slice(0, 120));
      }
    }
  });

  // Subtask outputs may contain file references
  subtasks.forEach(s => {
    if (s.output) {
      const pathMatches = s.output.match(/[A-Za-z]:[\\\/][^\s'"]+\.(js|ts|jsx|tsx|md|json)/g);
      if (pathMatches) {
        pathMatches.forEach(p => {
          // First subtask result that mentions a path = likely a read
          if (s.index === 0) filesReadSet.add(p);
          else filesChangedSet.add(p);
        });
      }
    }
  });

  // Determine next action
  const failedSubtasks = subtasks.filter(s => ['failed', 'rejected', 'challenged'].includes(s.state));
  let nextAction = null;
  if (failedSubtasks.length > 0) {
    const blocker = failedSubtasks[0];
    nextAction = `Review subtask #${blocker.index + 1}: ${blocker.description.slice(0, 80)}. ${blocker.verdictReason || blocker.state}`;
  } else if (job.state === 'done') {
    nextAction = 'Result accepted. Run the next goal or review the final report.';
  }

  return {
    resultId:          job.id,
    harnessMode:       job.harnessMode || 'auto',
    status,
    summary:           buildSummary(status, job),
    finalReport:       job.finalReport || null,
    goal:              job.goal,
    taskId:            job.taskId || null,
    metrics: {
      totalSubtasks:       total,
      accepted,
      failed,
      challenged,
      acceptRate,
      iterations:          job.iteration || 0,
      toolsUsed:           job.toolsUsed || 0,
      durationMs:          (job.finishedAt || Date.now()) - (job.startedAt || Date.now()),
      karenEscalations:    subtasks.reduce((sum, s) => sum + (s.karenEscalations || []).length, 0),
      usedFallbackPlanner:  Boolean(job.usedFallbackPlanner),
    },
    subtasks,
    filesRead:    [...filesReadSet].slice(0, 50),
    filesChanged: [...filesChangedSet].slice(0, 50),
    artifactsProduced: [],   // filled by individual harness modes
    commandsRun:  [...commandsRunSet].slice(0, 20),
    errors:       errors.slice(0, 10),
    nextAction,
    persisted:    job.persisted || null,
    trace,
    log:          (job.log || []).slice(-100).map(e => ({
      ts:      e.timestamp,
      level:   e.level,
      msg:     e.message,
      detail:  e.detail || null,
    })),
    scratchpad:   (job.scratchpad || []).slice(-20).map(n => String(n)),
    learnedLessons: (job.learnedLessons || []).slice(-6).map(l => ({
      agent:   l.agent,
      intent:  l.intent,
      desc:    l.description,
      success: l.success,
    })),
  };
}

function buildSummary(status, job) {
  const accepted = (job.plan || []).filter(s => s.state === 'accepted').length;
  const total    = (job.plan || []).length;
  const label    = {
    passed:  'PASSED',
    partial: 'PARTIAL',
    blocked: 'BLOCKED',
    failed:  'FAILED',
    stopped: 'STOPPED',
  }[status] || status.toUpperCase();
  return `${label}: ${accepted}/${total} subtasks accepted in ${job.iteration || 0} iterations`;
}

// ── CLI renderer ─────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  gray:   '\x1b[90m',
};
const isTTY = !!process.stdout.isTTY;
const col = (c, s) => isTTY ? `${c}${s}${C.reset}` : s;

const STATUS_COLOR = {
  passed:  C.green,
  partial: C.yellow,
  blocked: C.red,
  failed:  C.red,
  stopped: C.gray,
};

const SUBTASK_COLOR = {
  accepted:  C.green,
  challenged: C.yellow,
  rejected:  C.red,
  failed:    C.red,
  in_progress: C.cyan,
  pending:   C.gray,
};

/**
 * Render a PurpClawResult to the CLI.
 * @param {PurpClawResult} result
 * @param {Object} opts  { json: boolean, verbose: boolean }
 */
function renderResult(result, opts = {}) {
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const m = result.metrics;
  console.log();
  console.log(col(C.bold, `┏━ Harness Result  ${result.resultId}`));
  console.log(`┃ Goal:    ${col(C.cyan, result.goal.slice(0, 140))}`);
  console.log(`┃ Mode:    ${col(C.gray, result.harnessMode)}`);
  console.log(`┃ Status:  ${col(STATUS_COLOR[result.status] || C.gray, result.status.toUpperCase())}  ${col(C.gray, `${m.accepted}/${m.totalSubtasks} accepted  ${m.iterations} iter  ${Math.round(m.durationMs / 1000)}s`)}`);

  if (result.nextAction) {
    console.log(`┃ Next:    ${col(C.yellow, result.nextAction.slice(0, 120))}`);
  }

  console.log(col(C.bold, '┃ Subtasks:'));
  for (const s of (result.subtasks || [])) {
    const sc = SUBTASK_COLOR[s.state] || C.gray;
    const vc = s.verdict ? col(sc, s.verdict.toUpperCase()) : '';
    const agent = s.dispatchedTo ? col(C.gray, ` → ${s.dispatchedTo}`) : '';
    const reason = s.verdictReason ? col(C.gray, ` — ${s.verdictReason.slice(0, 80)}`) : '';
    console.log(`┃   ${col(C.dim, '#' + String(s.index + 1).padStart(2, '0'))} ${col(sc, '◆')} ${s.description.slice(0, 90)}`);
    if (vc || agent) {
      console.log(`┃          ${vc}${agent}${reason}`);
    }
    if (opts.verbose && s.fishAudit) {
      console.log(`┃          ${col(C.gray, `🐟 fish=${s.fishAudit.verdict}  certainty=${s.fishAudit.certainty}`)}`);
    }
    if (s.karenEscalations?.length) {
      for (const k of s.karenEscalations) {
        console.log(`┃          ${col(C.cyan, '↳ KAREN')} ${col(C.bold, k.decision?.action)} — ${col(C.gray, (k.decision?.reason || '').slice(0, 80))}`);
      }
    }
  }

  if (result.finalReport) {
    console.log(col(C.bold, '┃ Report:'));
    const lines = result.finalReport.split('\n').slice(0, 40);
    for (const line of lines) {
      console.log(`┃   ${line}`);
    }
    if (result.finalReport.split('\n').length > 40) {
      console.log(`┃   ${col(C.gray, '... (truncated, use --verbose to see full report)')}`);
    }
  }
  console.log(col(C.bold, '┗━'));
}

// ── JSON Schema (for output-contract.js / enforcement) ────────────────────────

const RESULT_JSON_SCHEMA = {
  type: 'object',
  required: ['resultId', 'harnessMode', 'status', 'summary', 'goal', 'metrics', 'subtasks'],
  properties: {
    resultId:          { type: 'string' },
    harnessMode:       { type: 'string', enum: ['codex', 'claude', 'hermes', 'minimax', 'auto'] },
    status:            { type: 'string', enum: ['passed', 'partial', 'blocked', 'failed', 'stopped'] },
    summary:           { type: 'string' },
    finalReport:       { type: ['string', 'null'] },
    goal:              { type: 'string' },
    taskId:            { type: ['string', 'null'] },
    metrics: {
      type: 'object',
      required: ['totalSubtasks', 'accepted', 'failed', 'challenged', 'acceptRate', 'iterations', 'toolsUsed', 'durationMs', 'karenEscalations', 'usedFallbackPlanner'],
      properties: {
        totalSubtasks:       { type: 'integer' },
        accepted:            { type: 'integer' },
        failed:              { type: 'integer' },
        challenged:          { type: 'integer' },
        acceptRate:          { type: 'number',  minimum: 0, maximum: 1 },
        iterations:          { type: 'integer' },
        toolsUsed:           { type: 'integer' },
        durationMs:          { type: 'integer' },
        karenEscalations:    { type: 'integer' },
        usedFallbackPlanner: { type: 'boolean' },
      },
    },
    subtasks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'index', 'description', 'state'],
        properties: {
          id:            { type: 'string' },
          index:         { type: 'integer' },
          description:   { type: 'string' },
          rationale:     { type: 'string' },
          state:         { type: 'string' },
          verdict:       { type: ['string', 'null'] },
          verdictReason: { type: ['string', 'null'] },
          attempts:      { type: 'integer' },
          dispatchedTo:  { type: ['string', 'null'] },
          output:        { type: ['string', 'null'] },
          fishAudit:     { type: ['object', 'null'] },
          karenEscalations: { type: 'array' },
          startedAt:     { type: ['number', 'null'] },
          finishedAt:    { type: ['number', 'null'] },
        },
      },
    },
    filesRead:    { type: 'array', items: { type: 'string' } },
    filesChanged: { type: 'array', items: { type: 'string' } },
    artifactsProduced: { type: 'array', items: { type: 'string' } },
    commandsRun:  { type: 'array', items: { type: 'string' } },
    errors:       { type: 'array' },
    nextAction:   { type: ['string', 'null'] },
    persisted:    { type: ['object', 'null'] },
    trace:        { type: 'array' },
    log:          { type: 'array' },
    scratchpad:   { type: 'array' },
    learnedLessons: { type: 'array' },
  },
};

module.exports = {
  RESULT_STATUS,
  VERDICTS,
  buildResult,
  renderResult,
  RESULT_JSON_SCHEMA,
};
