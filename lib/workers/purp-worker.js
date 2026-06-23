#!/usr/bin/env node
'use strict';
/**
 * lib/workers/purp-worker.js — pipeline worker for the legacy
 * purpclaw pipeline (plan → code → review → fix → done).
 *
 * This is the SAFE replacement for the 200-line template-literal
 * `spawn('node', ['-e', ...])` that was in unified_api.js. The
 * old pattern spawned a `cmd.exe /c node -e "..."` on Windows,
 * leaked when the template broke, and was impossible to debug.
 *
 * This file is real, debuggable, can be linted, and is spawned
 * cleanly via the child-registry. No `shell: true`. No eval.
 *
 * Args (env or argv):
 *   --state <path>  : JSON state file (read + updated as we go)
 *   --log   <path>  : append-only log file
 *   --out   <path>  : output directory for stage output files
 *   --task  <str>   : the goal/prompt
 *   --gw    <url>   : WebSocket gateway URL to call for each stage
 *
 * Writes one state file (read by unified_api for /purpclaw_status)
 * and per-stage output files in --out (plan_output.md, code_output.md, etc.)
 */

const fs   = require('fs');
const ws   = require('ws');
const path = require('path');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env[`PURP_${name.toUpperCase()}`] || fallback;
}

const STATE = arg('state', process.env.PURP_STATE);
const LOG   = arg('log',   process.env.PURP_LOG);
const OUT   = arg('out',   process.env.PURP_OUT);
const TASK  = arg('task',  process.env.PURP_TASK || '');
const GW    = arg('gw',    process.env.PURPCLAW_GATEWAY_URL);

function log(m) {
  const line = new Date().toISOString().substring(11, 19) + ' ' + m + '\n';
  if (LOG) try { fs.appendFileSync(LOG, line); } catch {}
  process.stdout.write(line);
}

function upd(u) {
  if (!STATE) return;
  try {
    const s = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
    Object.assign(s, u);
    fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
  } catch (e) {
    log('upd failed: ' + e.message);
  }
}

function callGateway(prompt) {
  return new Promise((resolve, reject) => {
    if (!GW) return reject(new Error('no gateway URL'));
    const gw = new ws(GW);
    const t  = setTimeout(() => { try { gw.close(); } catch {} reject(new Error('gateway timeout')); }, 60_000);
    gw.on('open',  () => { try { gw.send(JSON.stringify({ type: 'message', content: prompt })); } catch (e) { clearTimeout(t); reject(e); } });
    gw.on('message', d => { clearTimeout(t); try { gw.close(); } catch {} resolve(d.toString()); });
    gw.on('error',   e => { clearTimeout(t); reject(e); });
    gw.on('close',   () => { /* no-op */ });
  });
}

const STAGES = [
  { name: 'plan',   prompt: t => `Plan: ${t}` },
  { name: 'code',   prompt: t => `Code: ${t}` },
  { name: 'review', prompt: t => 'Review the code' },
  { name: 'fix',    prompt: t => 'Fix any bugs you found in the review' },
  { name: 'done',   prompt: null },
];

(async () => {
  // Hard 4-minute budget for the whole pipeline (we run inside a 5min
  // child-registry budget; 4min of work + cleanup = 5min total).
  const HARD_DEADLINE_MS = 4 * 60_000;
  const t0 = Date.now();
  if (!TASK) {
    log('ERROR: no --task provided');
    upd({ status: 'error', error: 'no task' });
    process.exit(2);
  }
  upd({ stage: 'starting', status: 'running' });
  for (const stage of STAGES) {
    if (Date.now() - t0 > HARD_DEADLINE_MS) {
      log('HARD DEADLINE HIT — exiting cleanly');
      upd({ status: 'timeout' });
      process.exit(3);
    }
    if (stage.name === 'done') {
      upd({ stage: 'complete', status: 'done', completed: new Date().toISOString() });
      log('COMPLETE');
      return;
    }
    upd({ stage: stage.name });
    log('Stage: ' + stage.name);
    try {
      const resp = await callGateway(stage.prompt(TASK));
      if (OUT) {
        try { fs.writeFileSync(path.join(OUT, `${stage.name}_output.md`), resp); } catch {}
      }
      log(stage.name + ' done (' + resp.length + ' chars)');
    } catch (e) {
      log('ERROR ' + stage.name + ': ' + e.message);
      upd({ status: 'error', error: e.message });
      return;
    }
  }
})().catch(e => {
  log('FATAL: ' + (e?.stack || e?.message || e));
  upd({ status: 'error', error: e.message });
  process.exit(1);
});
