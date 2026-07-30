'use strict';

/**
 * purpclaw harness — autonomous productivity harness
 * ════════════════════════════════════════════════════
 * Takes one complex goal, decomposes it into subtask contracts, dispatches each
 * through the tower or orchestrator, runs
 * verification gates, reviews each result, escalates to KAREN on repeated
 * failures, and synthesises a final operator report.
 *
 * Usage:
 *   purpclaw harness run "<goal>"        run a new goal (live streaming)
 *   purpclaw harness list                list past + active jobs
 *   purpclaw harness show <id>           show a past job in detail
 *   purpclaw harness stop <id>           interrupt a running job
 *   purpclaw harness status              show service health + recent jobs
 *
 * Flags:
 *   --local            force in-process execution (skip harness service)
 *   --service          force service mode (fail if service offline)
 *   --json             machine-readable output
 *   --max-iter <N>     override iteration ceiling (default 30)
 *   --retries <N>      max retries per subtask (default 2)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const PURP_ROOT = path.resolve(__dirname, '..', '..');
const HARNESS_PORT = parseInt(process.env.HARNESS_PORT || '7798', 10);

// ── colours ────────────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', blue: '\x1b[34m', magenta: '\x1b[35m',
  gray: '\x1b[90m', pink: '\x1b[95m'
};
const isTTY = !!process.stdout.isTTY;
const col = (c, s) => isTTY ? `${c}${s}${C.reset}` : s;

const STAGE_COLOR = {
  operator: C.gray, tower: C.pink, orchestrator: C.yellow,
  mirrorvale: C.magenta, llm: C.green, karen: C.cyan, gates: C.blue
};

const VERDICT_COLOR = {
  ACCEPTED: C.green, CHALLENGED: C.yellow, REJECTED: C.red
};

// ── helpers ────────────────────────────────────────────────────────────────────

function postJSON(port, urlPath, body, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const req = http.request({
      hostname: '127.0.0.1', port, path: urlPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: timeoutMs,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data || '{}')); }
        catch { resolve({ raw: data, status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

function getJSON(port, urlPath, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: urlPath, method: 'GET', timeout: timeoutMs,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data || '{}')); }
        catch { resolve({ raw: data, status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function isServiceOnline() {
  try { await getJSON(HARNESS_PORT, '/health', 1200); return true; }
  catch { return false; }
}

function parseArgs(args) {
  const flags = { local: false, service: false, json: false };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--local') flags.local = true;
    else if (a === '--service') flags.service = true;
    else if (a === '--json') flags.json = true;
    else if (a === '--max-iter') flags.maxIter = parseInt(args[++i] || '30', 10);
    else if (a === '--retries') flags.retries = parseInt(args[++i] || '2', 10);
    else positional.push(a);
  }
  return { flags, positional };
}

function formatTraceLine(entry) {
  const ts = new Date(entry.timestamp).toLocaleTimeString();
  const color = STAGE_COLOR[entry.stage] || C.gray;
  return `${col(C.gray, ts)}  ${col(color, entry.stage.toUpperCase().padEnd(11))} ${col(C.bold, entry.event.padEnd(22))} ${entry.summary || ''}`;
}

function formatLogLine(entry) {
  const ts = new Date(entry.timestamp).toLocaleTimeString();
  const lvlColors = { info: C.cyan, warn: C.yellow, error: C.red, verdict: C.magenta };
  return `${col(C.gray, ts)}  ${col(lvlColors[entry.level] || C.gray, entry.level.toUpperCase().padEnd(7))} ${entry.message}`;
}

function printJobSummary(job) {
  console.log();
  console.log(col(C.bold, `┏━ Harness Job ${job.id}`));
  console.log(`┃ Goal: ${col(C.cyan, job.goal.slice(0, 160))}`);
  console.log(`┃ State: ${col(C.bold, job.state)}  ·  Iterations: ${job.iteration}/${job.maxIterations}  ·  Tools used: ${job.toolsUsed || 0}`);
  if (job.classification) {
    console.log(`┃ Classification: ${col(C.yellow, job.classification.type)} (${job.classification.confidence})`);
  }
  console.log(col(C.bold, '┃ Plan:'));
  for (const s of (job.plan || [])) {
    const stateColor = s.state === 'accepted' ? C.green : s.state === 'rejected' || s.state === 'failed' ? C.red : C.yellow;
    const verdict = s.verdict ? col(VERDICT_COLOR[s.verdict] || C.gray, s.verdict) : col(C.gray, s.state);
    const agent = s.dispatchedTo ? col(C.gray, `→ ${s.dispatchedTo}`) : '';
    console.log(`┃   ${col(C.dim, '#' + (s.index + 1).toString().padStart(2, '0'))} ${col(stateColor, '◆')} ${s.description.slice(0, 110)}`);
    console.log(`┃        ${verdict} ${agent} ${s.verdictReason ? col(C.gray, '— ' + s.verdictReason.slice(0, 90)) : ''}`);
    if (s.karenEscalations?.length) {
      for (const k of s.karenEscalations) {
        console.log(`┃        ${col(C.cyan, '↳ KAREN')} ${col(C.bold, k.decision.action)} ${col(C.gray, '— ' + (k.decision.reason || '').slice(0, 90))}`);
      }
    }
  }
  console.log(col(C.bold, '┗━'));
}

function printFinalReport(job) {
  if (!job.finalReport) return;
  console.log();
  console.log(col(C.bold, '═══ Final Report ═══'));
  console.log(job.finalReport);
  console.log(col(C.bold, '════════════════════'));
}

// ── command handlers ──────────────────────────────────────────────────────────

async function cmdRun(positional, flags) {
  const goal = positional.join(' ').trim();
  if (!goal) {
    console.log(col(C.red, 'No goal supplied.'));
    console.log('Usage: purpclaw harness run "<goal>"');
    return 1;
  }

  const useService = flags.service || (!flags.local && await isServiceOnline());

  if (flags.service && !(await isServiceOnline())) {
    console.log(col(C.red, `Harness service not reachable on :${HARNESS_PORT} (–-service requested).`));
    console.log(col(C.gray, '  Start it with: purpclaw safe-start harness  (or drop --service to run in-process)'));
    return 2;
  }

  if (useService) {
    return runViaService(goal, flags);
  }
  return runInProcess(goal, flags);
}

async function runViaService(goal, flags) {
  console.log(col(C.dim, `[harness] using service on :${HARNESS_PORT}`));
  const started = await postJSON(HARNESS_PORT, '/harness/run', { goal, options: flags }, 10_000);
  if (!started?.jobId) {
    console.log(col(C.red, `Service refused: ${JSON.stringify(started).slice(0, 200)}`));
    return 3;
  }
  console.log(col(C.dim, `[harness] job ${started.jobId} accepted — streaming...`));
  await streamFromService(started.jobId, flags);
  return 0;
}

function streamFromService(jobId, flags) {
  return new Promise(resolve => {
    const req = http.request({
      hostname: '127.0.0.1', port: HARNESS_PORT,
      path: `/harness/jobs/${jobId}/stream`,
      method: 'GET',
      headers: { 'Accept': 'text/event-stream' },
    }, res => {
      let buf = '';
      res.on('data', chunk => {
        buf += chunk.toString('utf8');
        const events = buf.split('\n\n');
        buf = events.pop() || '';
        for (const raw of events) {
          const dataLine = raw.split('\n').find(l => l.startsWith('data:'));
          if (!dataLine) continue;
          try {
            const ev = JSON.parse(dataLine.slice(5).trim());
            handleStreamEvent(ev, flags);
            if (ev.type === 'done') {
              res.destroy();
              if (ev.job) printJobSummary(ev.job);
              if (ev.job) printFinalReport(ev.job);
              resolve(0);
            }
          } catch { /* ignore parse errors */ }
        }
      });
      res.on('end', () => resolve(0));
      res.on('error', () => resolve(0));
    });
    req.on('error', e => {
      console.log(col(C.red, `Stream error: ${e.message}`));
      resolve(4);
    });
    req.end();
  });
}

function handleStreamEvent(ev, flags) {
  if (flags.json) { console.log(JSON.stringify(ev)); return; }
  if (ev.type === 'trace' && ev.entry) {
    console.log(formatTraceLine(ev.entry));
  } else if (ev.type === 'log' && ev.entry) {
    console.log(formatLogLine(ev.entry));
  } else if (ev.type === 'subtask' && ev.subtask) {
    const s = ev.subtask;
    const v = s.verdict ? col(VERDICT_COLOR[s.verdict] || C.gray, s.verdict) : col(C.yellow, s.state);
    console.log(`${col(C.bold, '▸ #' + (s.index + 1))} ${v} ${col(C.gray, s.dispatchedTo || '')}`);
  }
}

async function runInProcess(goal, flags) {
  const { createHarness } = require('../harness/engine');
  const opts = {
    maxIterations: flags.maxIter || 30,
    maxRetriesPerSubtask: flags.retries ?? 2,
    rootDir: PURP_ROOT,
  };
  console.log(col(C.dim, `[harness] running in-process (max-iter=${opts.maxIterations}, retries=${opts.maxRetriesPerSubtask})`));
  const h = createHarness(opts);

  h.on('trace', entry => { if (!flags.json) console.log(formatTraceLine(entry)); });
  h.on('log', entry => { if (!flags.json) console.log(formatLogLine(entry)); });
  h.on('subtask', s => {
    if (flags.json) return;
    const v = s.verdict ? col(VERDICT_COLOR[s.verdict] || C.gray, s.verdict) : col(C.yellow, s.state);
    console.log(`${col(C.bold, '▸ #' + (s.index + 1))} ${v} ${col(C.gray, s.dispatchedTo || '')}`);
  });

  let lastSig = null;
  const sigHandler = () => { if (lastSig) return; lastSig = true; console.log(col(C.yellow, '\n[harness] interrupt → stop()')); h.stop(); };
  process.on('SIGINT', sigHandler);

  try {
    const job = await h.run(goal);
    process.removeListener('SIGINT', sigHandler);
    if (flags.json) {
      console.log(JSON.stringify(job, null, 2));
    } else {
      printJobSummary(job);
      printFinalReport(job);
    }
    return job.state === 'done' ? 0 : 1;
  } catch (e) {
    process.removeListener('SIGINT', sigHandler);
    console.log(col(C.red, `Harness error: ${e.message}`));
    return 5;
  }
}

async function cmdList(flags) {
  // Try service first, then local archive
  if (await isServiceOnline()) {
    const list = await getJSON(HARNESS_PORT, '/harness/jobs', 5000);
    return renderJobList(list?.jobs || [], flags);
  }
  // Read local archive under agent_work/harness/
  const dir = path.join(PURP_ROOT, 'agent_work', 'harness');
  if (!fs.existsSync(dir)) {
    console.log(col(C.gray, 'No harness jobs found (service offline, no local archive).'));
    return 0;
  }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 20);
  const jobs = files.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch { return null; }
  }).filter(Boolean);
  return renderJobList(jobs, flags);
}

function renderJobList(jobs, flags) {
  if (flags.json) { console.log(JSON.stringify(jobs, null, 2)); return 0; }
  if (jobs.length === 0) { console.log(col(C.gray, 'No jobs.')); return 0; }
  console.log();
  console.log(col(C.bold, 'HARNESS JOBS'));
  for (const j of jobs) {
    const stateColor = j.state === 'done' ? C.green : j.state === 'failed' ? C.red : C.yellow;
    const accepted = (j.plan || []).filter(s => s.state === 'accepted').length;
    const total = (j.plan || []).length;
    const when = new Date(j.startedAt).toLocaleString();
    console.log(`  ${col(C.dim, j.id)}  ${col(stateColor, j.state.padEnd(10))} ${accepted}/${total} accepted  ${col(C.gray, when)}`);
    console.log(`    ${col(C.cyan, j.goal.slice(0, 120))}`);
  }
  return 0;
}

async function cmdShow(positional, flags) {
  const id = positional[0];
  if (!id) { console.log(col(C.red, 'Usage: purpclaw harness show <jobId>')); return 1; }

  let job = null;
  if (await isServiceOnline()) {
    const r = await getJSON(HARNESS_PORT, `/harness/jobs/${encodeURIComponent(id)}`, 5000);
    if (r && r.id) job = r;
  }
  if (!job) {
    const filePath = path.join(PURP_ROOT, 'agent_work', 'harness', `${id}.json`);
    if (fs.existsSync(filePath)) {
      try { job = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {}
    }
  }
  if (!job) { console.log(col(C.red, `Job ${id} not found.`)); return 2; }

  if (flags.json) { console.log(JSON.stringify(job, null, 2)); return 0; }
  printJobSummary(job);
  printFinalReport(job);
  return 0;
}

async function cmdStop(positional) {
  const id = positional[0];
  if (!id) { console.log(col(C.red, 'Usage: purpclaw harness stop <jobId>')); return 1; }
  if (!(await isServiceOnline())) {
    console.log(col(C.red, `Harness service offline; cannot stop a remote job. In-process jobs respond to Ctrl+C.`));
    return 3;
  }
  const r = await postJSON(HARNESS_PORT, `/harness/jobs/${encodeURIComponent(id)}/stop`, {}, 5000);
  console.log(JSON.stringify(r, null, 2));
  return 0;
}

async function cmdStatus(flags) {
  const online = await isServiceOnline();
  const out = {
    service: online ? 'online' : 'offline',
    port: HARNESS_PORT,
  };
  if (online) {
    try {
      const stats = await getJSON(HARNESS_PORT, '/harness/stats', 3000);
      Object.assign(out, stats);
    } catch {}
  }
  if (flags.json) { console.log(JSON.stringify(out, null, 2)); return 0; }
  console.log();
  console.log(col(C.bold, 'HARNESS STATUS'));
  console.log(`  Service: ${col(online ? C.green : C.red, out.service)}  (port :${HARNESS_PORT})`);
  if (out.active !== undefined) console.log(`  Active jobs: ${out.active}`);
  if (out.archived !== undefined) console.log(`  Archived jobs: ${out.archived}`);
  return 0;
}

// ── entrypoint ────────────────────────────────────────────────────────────────

async function run(args, _ctx) {
  const { flags, positional } = parseArgs(args || []);
  const sub = (positional.shift() || 'help').toLowerCase();

  switch (sub) {
    case 'run':       return cmdRun(positional, flags);
    case 'list':      return cmdList(flags);
    case 'show':      return cmdShow(positional, flags);
    case 'stop':      return cmdStop(positional);
    case 'status':    return cmdStatus(flags);
    case 'benchmark': return cmdBenchmark(positional, flags);
    case 'trend':     return cmdTrend(flags);
    case 'help':
    default:
      console.log(`
${col(C.bold, 'purpclaw harness')} — autonomous productivity harness

${col(C.bold, 'Subcommands:')}
  run "<goal>"        Run a new goal end-to-end (plan → execute → judge → synthesize)
  list                List recent harness jobs
  show <id>           View one past job in detail
  stop <id>           Interrupt a running job (service mode only)
  status              Show service health + recent activity
  benchmark [label]   Run the canonical suite, append a trend row, print delta vs prior
  trend               Print the last 6 benchmark rows + agent leaderboard movement

${col(C.bold, 'Flags:')}
  --local             Force in-process execution (skip the harness service)
  --service           Force service mode (fail if service offline)
  --json              Machine-readable output
  --max-iter <N>      Override iteration ceiling (default 30)
  --retries <N>       Max retries per subtask (default 2)
  --quick             Benchmark: run only the first 2 canonical goals

${col(C.bold, 'Examples:')}
  purpclaw harness run "draft a launch checklist for shipping purpclaw to a new user"
  purpclaw harness run "audit which dark-cluster services are reachable and why" --local
  purpclaw harness benchmark "after-bias-fix"
  purpclaw harness trend
`);
      return 0;
  }
}

// ── benchmark + trend (recursive-loop proof) ─────────────────────────────────

async function cmdBenchmark(positional, flags) {
  const { runBenchmark, readHistory, printTrend, CANONICAL_GOALS } = require('../harness/benchmark');
  const label = positional[0] || `run-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
  const goals = flags.quick ? CANONICAL_GOALS.slice(0, 2) : CANONICAL_GOALS;

  console.log(col(C.bold, `[benchmark] starting — ${goals.length} goal${goals.length === 1 ? '' : 's'} — label="${label}"`));
  const row = await runBenchmark({
    goals,
    maxIter: flags.maxIter || 12,
    retries: flags.retries ?? 1,
    label,
    log: msg => console.log(col(C.dim, msg)),
  });

  if (flags.json) {
    console.log(JSON.stringify(row, null, 2));
    return 0;
  }

  const history = readHistory(10);
  console.log(printTrend(row, history));
  return 0;
}

async function cmdTrend(flags) {
  const { readHistory, printTrend } = require('../harness/benchmark');
  const history = readHistory(10);
  if (history.length === 0) {
    console.log(col(C.gray, 'No benchmark history yet — run: purpclaw harness benchmark'));
    return 0;
  }
  if (flags.json) { console.log(JSON.stringify(history, null, 2)); return 0; }
  console.log(printTrend(history[history.length - 1], history));
  return 0;
}

module.exports = { run };
