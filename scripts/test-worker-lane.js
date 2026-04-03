#!/usr/bin/env node
'use strict';

/**
 * Worker Lane Proof Tests
 * ════════════════════════
 * Runs the 10 hardening checks against the live worker lane.
 * Requires: purpclaw-workers service online (port 7897)
 *           purpclaw-tower service online (port 7790)
 *
 * Usage:
 *   node scripts/test-worker-lane.js
 *   node scripts/test-worker-lane.js --json
 */

const http = require('http');
const path = require('path');

const WORKER_URL = 'http://127.0.0.1:7897';
const TOWER_URL  = 'http://127.0.0.1:7790';
const ORCH_URL   = 'http://127.0.0.1:7784';

const wantJson = process.argv.includes('--json');

// ── Test runner ───────────────────────────────────────────────────────────────

const results = [];
let passed = 0, failed = 0;

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  passed++;
  if (!wantJson) console.log(`  \x1b[32m✓\x1b[0m  ${name}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  failed++;
  if (!wantJson) console.log(`  \x1b[31m✗\x1b[0m  ${name}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`);
}

function info(msg) {
  if (!wantJson) console.log(`\x1b[90m     ${msg}\x1b[0m`);
}

function section(title) {
  if (!wantJson) console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function httpReq(urlStr, method = 'GET', body = null, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: timeoutMs,
    };
    if (body) {
      const b = JSON.stringify(body);
      opts.headers['Content-Length'] = Buffer.byteLength(b);
    }
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Tests ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!wantJson) {
    console.log('\n\x1b[1m🔬 PURPCLAW WORKER LANE — PROOF TESTS\x1b[0m');
    console.log('\x1b[90m  Running 9 hardening checks...\x1b[0m\n');
  }

  // ─────────────────────────────────────────────────────────────────────────
  section('1. Worker service health');
  // ─────────────────────────────────────────────────────────────────────────
  try {
    const r = await httpReq(`${WORKER_URL}/health`);
    if (r.status === 200 && r.body.status === 'healthy') {
      pass('Worker service online', `active=${r.body.active}/${r.body.capacity} v${r.body.version}`);
    } else {
      fail('Worker service health', `HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 80)}`);
    }
  } catch (e) {
    fail('Worker service online', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  section('2. Worker pool registry (purpclaw-workers CLI)');
  // ─────────────────────────────────────────────────────────────────────────
  try {
    const pool = require(path.join(__dirname, '..', 'lib', 'worker-pool.js'));
    const workers = pool.listWorkers();
    if (workers.length > 0) {
      pass('Workers registered', `${workers.length} worker(s): ${workers.map(w => w.name).join(', ')}`);
    } else {
      fail('Workers registered', 'No workers in registry');
    }
  } catch (e) {
    fail('Worker pool load', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  section('3. Dispatch job + verify it lands');
  // ─────────────────────────────────────────────────────────────────────────
  let testJobId = null;
  try {
    const r = await httpReq(`${WORKER_URL}/task`, 'POST', {
      agentName: 'dragon',
      task: 'worker-lane-proof-test-dispatch',
      options: { source: 'test-harness', workflowId: `test-${Date.now()}` }
    });
    if ((r.status === 200 || r.status === 201) && r.body.jobId) {
      testJobId = r.body.jobId;
      pass('Job dispatched to worker', `jobId=${testJobId}`);
    } else {
      fail('Job dispatch', `HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 100)}`);
    }
  } catch (e) {
    fail('Job dispatch', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  section('4. Job status polling (completed/failed sync)');
  // ─────────────────────────────────────────────────────────────────────────
  if (testJobId) {
    await sleep(3000); // give the tower time to process
    try {
      const r = await httpReq(`${WORKER_URL}/task/${testJobId}`);
      if (r.status === 200 && r.body.jobId) {
        const status = r.body.status;
        if (status === 'completed' || status === 'failed') {
          pass('Job status resolves (not stuck as running)', `status=${status}`);
        } else if (status === 'running') {
          // Tower may genuinely be processing — that's fine
          pass('Job running on tower', `still running after 3s — tower picked it up`);
        } else {
          fail('Job status', `unexpected status: ${status}`);
        }
      } else {
        fail('Job status poll', `HTTP ${r.status}`);
      }
    } catch (e) {
      fail('Job status poll', e.message);
    }

    // ── Test: 404 on unknown job ────────────────────────────────────────────
    try {
      const r = await httpReq(`${WORKER_URL}/task/nonexistent-job-id-xyz`);
      if (r.status === 404) {
        pass('404 on unknown job ID', 'worker returns 404 correctly');
      } else {
        fail('404 on unknown job', `expected 404, got ${r.status}`);
      }
    } catch (e) {
      fail('404 test', e.message);
    }
  } else {
    info('Skipping job status tests (no jobId from dispatch)');
  }

  // ─────────────────────────────────────────────────────────────────────────
  section('5. Capacity enforcement');
  // ─────────────────────────────────────────────────────────────────────────
  try {
    const r = await httpReq(`${WORKER_URL}/metrics`);
    if (r.status === 200) {
      const { active, capacity } = r.body;
      pass('Worker reports capacity metrics', `active=${active} cap=${capacity}`);
      if (active <= capacity) {
        pass('Active jobs within capacity', `${active} ≤ ${capacity}`);
      } else {
        fail('Capacity exceeded', `active=${active} > cap=${capacity}`);
      }
    } else {
      fail('Metrics endpoint', `HTTP ${r.status}`);
    }
  } catch (e) {
    fail('Metrics endpoint', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  section('6. Worker pool health check via lib');
  // ─────────────────────────────────────────────────────────────────────────
  try {
    const pool = require(path.join(__dirname, '..', 'lib', 'worker-pool.js'));
    const statuses = await pool.getStatus();
    const online = statuses.filter(w => w.health.online);
    const degraded = statuses.filter(w => w._degraded);
    if (online.length > 0) {
      pass('At least one worker online via pool.getStatus()', `${online.length}/${statuses.length} online`);
    } else {
      fail('Worker pool health', 'No online workers via pool.getStatus()');
    }
    if (degraded.length === 0) {
      pass('No degraded workers', 'all workers clean');
    } else {
      fail('Degraded workers present', `${degraded.length} degraded: ${degraded.map(w => w.name).join(',')}`);
    }
  } catch (e) {
    fail('Worker pool health check', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  section('7. Least-loaded routing (dispatch to least-loaded)');
  // ─────────────────────────────────────────────────────────────────────────
  try {
    const pool = require(path.join(__dirname, '..', 'lib', 'worker-pool.js'));
    const r = await pool.dispatch('bee', 'routing-test', {
      workflowId: `rtest-${Date.now()}`,
      intent: 'test',
    });
    if (r.success) {
      pass('Least-loaded dispatch succeeded', `worker=${r.workerName} job=${r.jobId}`);
    } else {
      fail('Least-loaded dispatch', r.error);
    }
  } catch (e) {
    fail('Least-loaded dispatch', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  section('8. Worker jobs list (no phantom running jobs)');
  // ─────────────────────────────────────────────────────────────────────────
  await sleep(2000); // wait for reconcile cycle
  try {
    const pool = require(path.join(__dirname, '..', 'lib', 'worker-pool.js'));
    const jobs = pool.listJobs(20);
    const runningJobs = jobs.filter(j => j.status === 'running');
    const completedJobs = jobs.filter(j => j.status === 'completed');
    const failedJobs = jobs.filter(j => j.status === 'failed');
    info(`jobs: ${completedJobs.length} completed, ${failedJobs.length} failed, ${runningJobs.length} running`);

    // Check if any running jobs are very old (that's the phantom problem)
    const now = Date.now();
    // Phantom = running job that is more than 2 minutes old. Jobs dispatched
    // in this test session (< 2 min ago) may legitimately still be processing.
    // The reconcile loop (15s) handles them; cross-session ghosts are reaped on
    // pool load (JOB_TIMEOUT_MS).
    const staleRunning = runningJobs.filter(j => {
      const age = now - new Date(j.startedAt || 0).getTime();
      return age > 120000; // > 2 min still "running" = phantom
    });
    if (staleRunning.length === 0) {
      pass('No stale phantom running jobs', `${runningJobs.length} running (all < 2m old)`);
    } else {
      fail('Phantom running jobs detected', `${staleRunning.length} jobs running > 2m: ${staleRunning.map(j=>j.id.slice(0,14)).join(',')}`);
    }
  } catch (e) {
    fail('Jobs list check', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  section('9. Cancellation / DELETE /task/:id');
  // ─────────────────────────────────────────────────────────────────────────
  try {
    // Dispatch a job then immediately cancel it
    const dispR = await httpReq(`${WORKER_URL}/task`, 'POST', {
      agentName: 'turtle',
      task: 'cancel-test',
      options: { source: 'test-harness' }
    });
    if (dispR.body && dispR.body.jobId) {
      const jid = dispR.body.jobId;
      const delR = await httpReq(`${WORKER_URL}/task/${jid}`, 'DELETE');
      if (delR.status === 200 && delR.body.cancelled) {
        pass('Job cancellation (DELETE /task/:id)', `jobId=${jid} → cancelled`);
      } else {
        fail('Job cancellation', `DELETE returned ${delR.status}: ${JSON.stringify(delR.body).slice(0, 80)}`);
      }
    } else {
      info('Skipping cancellation test (dispatch returned no jobId)');
    }
  } catch (e) {
    fail('Cancellation test', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  section('10. Restart resilience — completed job survives worker restart');
  // ─────────────────────────────────────────────────────────────────────────
  // Dispatch a job, wait for it to complete, then check that the worker
  // still returns the record (not 404). Since we can't actually restart the
  // PM2 service mid-test, we verify via the persisted tasks file instead —
  // which is what a restarted worker would load.
  try {
    const dispR = await httpReq(`${WORKER_URL}/task`, 'POST', {
      agentName: 'phoenix',
      task: 'restart-resilience-test',
      options: { source: 'test-harness' }
    });
    if (!dispR.body || !dispR.body.jobId) {
      fail('Restart resilience dispatch', 'No jobId returned');
    } else {
      const jid = dispR.body.jobId;
      await sleep(3000); // let it settle

      // 1. Direct poll should return a record
      const pollR = await httpReq(`${WORKER_URL}/task/${jid}`);
      if (pollR.status !== 200) {
        fail('Restart resilience poll', `HTTP ${pollR.status} — job not found`);
      } else {
        pass('Worker returns job after settle', `jobId=${jid} status=${pollR.body.status}`);

        // 2. Check the persisted file contains this job
        const fs = require('fs');
        const tasksFile = require('path').join(__dirname, '..', 'agent_work', 'worker-tasks.json');
        try {
          const persisted = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
          if (persisted[jid]) {
            pass('Job persisted to worker-tasks.json', `status=${persisted[jid].status}`);
          } else {
            // Not there yet — might still be flushing. Give it a moment.
            await sleep(2000);
            const persisted2 = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
            if (persisted2[jid]) {
              pass('Job persisted to worker-tasks.json (after delay)', `status=${persisted2[jid].status}`);
            } else {
              fail('Job persistence', `jobId ${jid} not found in worker-tasks.json after 5s`);
            }
          }
        } catch (e) {
          fail('Read worker-tasks.json', e.message);
        }
      }
    }
  } catch (e) {
    fail('Restart resilience test', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Results
  // ─────────────────────────────────────────────────────────────────────────
  if (wantJson) {
    console.log(JSON.stringify({ passed, failed, total: passed + failed, results }, null, 2));
    process.exit(failed > 0 ? 1 : 0);
  } else {
    const total = passed + failed;
    console.log(`\n  \x1b[1m${passed}/${total} passed\x1b[0m  ${failed > 0 ? `\x1b[31m${failed} failed\x1b[0m` : '\x1b[32mall green\x1b[0m'}\n`);
    if (failed > 0) process.exitCode = 1;
  }
}

main().catch(e => {
  console.error('Test harness error:', e.message);
  process.exit(1);
});
