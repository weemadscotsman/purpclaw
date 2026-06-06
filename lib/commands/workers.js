'use strict';

/**
 * purpclaw workers — cloud/scale worker pool management
 * ══════════════════════════════════════════════════════
 * Subcommands:
 *   status              — health check all registered workers
 *   list                — show worker registry
 *   add [options]       — register a new worker
 *   remove <id|name>    — deregister a worker
 *   jobs                — show active/recent worker jobs
 *   test <id|name>      — dispatch a smoke task to a specific worker
 *   enable <id|name>    — re-enable a disabled worker
 *   disable <id|name>   — disable a worker without removing it
 *
 * Options for 'add':
 *   --name <n>          friendly name (default: worker-N)
 *   --type <http|ssh>   worker type (default: http)
 *   --url <url>         HTTP worker URL (e.g. http://192.168.1.50:7897)
 *   --host <h>          SSH host
 *   --user <u>          SSH user (default: ubuntu)
 *   --port <p>          SSH port (default: 22)
 *   --key <path>        SSH key path
 *   --dir <path>        remote purpclawDir (default: /home/ubuntu/purpclaw)
 *   --tower-port <p>    remote tower port (default: 7790)
 *   --max <n>           max concurrent jobs (default: 4)
 *   --tags <csv>        comma-separated capability tags
 */

const path = require('path');

async function run(args, ctx) {
  const { C, col, spinner, PURP_DIR, isTTY } = ctx;
  const workerPool = require(path.join(PURP_DIR, 'lib', 'worker-pool.js'));

  const sub = args[0] || 'status';
  const flags = parseFlags(args.slice(1));

  const g = (s) => col(C.green,  s);
  const r = (s) => col(C.red,    s);
  const y = (s) => col(C.yellow, s);
  const c = (s) => col(C.cyan,   s);
  const d = (s) => col(C.gray,   s);
  const b = (s) => col(C.bold || C.white, s);

  // ── status ────────────────────────────────────────────────────────────────
  if (sub === 'status') {
    const sp = spinner && isTTY ? spinner('Checking workers...').start() : null;
    const workers = workerPool.listWorkers();

    if (workers.length === 0) {
      if (sp) sp.stop();
      console.log(y('No workers registered.'));
      console.log(`Add one: ${c('purpclaw workers add --type http --url http://<host>:7897')}`);
      console.log(`Local overflow: ${c('purpclaw workers add --type http --url http://127.0.0.1:7897 --name local-overflow')}`);
      return;
    }

    const statuses = await workerPool.getStatus();
    if (sp) sp.stop();

    console.log(`\n${b('☁  WORKER POOL STATUS')}\n`);
    for (const w of statuses) {
      const icon = w.health.online ? g('●') : r('●');
      const badge = w.health.online
        ? g(`ONLINE  active=${w.health.active ?? '?'}/${w.health.capacity ?? w.maxConcurrent}`)
        : r(`OFFLINE  ${w.health.reason || ''}`);
      const tags = w.tags && w.tags.length ? d(`  [${w.tags.join(',')}]`) : '';
      console.log(`  ${icon} ${b(w.name)}  ${d('(' + w.type + ')')}  ${badge}${tags}`);
      if (w.type === 'http') console.log(`     ${d(w.url || 'no url')}`);
      if (w.type === 'ssh')  console.log(`     ${d((w.user || 'ubuntu') + '@' + w.host + ':' + (w.port || 22))}`);
    }
    console.log('');
    return;
  }

  // ── list ──────────────────────────────────────────────────────────────────
  if (sub === 'list') {
    const workers = workerPool.listWorkers();
    if (flags.json) { console.log(JSON.stringify(workers, null, 2)); return; }
    if (!workers.length) { console.log(y('No workers registered.')); return; }
    console.log(`\n${b('Worker Registry')}  (${workers.length} total)\n`);
    for (const w of workers) {
      const status = w.enabled ? g('enabled') : r('disabled');
      console.log(`  ${b(w.id)}  ${c(w.name)}  type=${w.type}  ${status}`);
      const target = w.type === 'http' ? w.url : `${w.user}@${w.host}`;
      if (target) console.log(`    → ${d(target)}  max=${w.maxConcurrent}`);
    }
    console.log('');
    return;
  }

  // ── secret gen ────────────────────────────────────────────────────────────
  if (sub === 'secret') {
    const workerAuth = require(path.join(PURP_DIR, 'lib', 'worker-auth.js'));
    const secret = workerAuth.generateSecret();
    console.log(`\n${b('Generated worker secret (64 hex chars):')}
  ${c(secret)}

Add to ${b('.env')} on BOTH the orchestrator and every worker machine:
  ${d('WORKER_SECRET=' + secret)}

Or pass per-worker on registration:
  ${c('purpclaw workers add --secret ' + secret.slice(0, 8) + '...')}\n`);
    return;
  }

  // ── add ───────────────────────────────────────────────────────────────────
  if (sub === 'add') {
    const type = flags.type || 'http';
    const config = {
      name: flags.name || null,
      type,
      maxConcurrent: parseInt(flags.max || '4', 10),
      tags: flags.tags ? flags.tags.split(',').map(t => t.trim()) : [],
      secret: flags.secret || process.env.WORKER_SECRET || null,
    };

    if (type === 'http') {
      if (!flags.url) {
        console.error(r('--url is required for HTTP workers'));
        console.error(`Example: ${c('purpclaw workers add --type http --url http://192.168.1.50:7897')}`);
        process.exitCode = 1; return;
      }
      config.url = flags.url;
    } else if (type === 'ssh') {
      if (!flags.host) {
        console.error(r('--host is required for SSH workers'));
        process.exitCode = 1; return;
      }
      config.host = flags.host;
      config.port = parseInt(flags.port || '22', 10);
      config.user = flags.user || 'ubuntu';
      config.keyPath = flags.key || null;
      config.purpclawDir = flags.dir || '/home/ubuntu/purpclaw';
      config.towerPort = parseInt(flags['tower-port'] || '7790', 10);
    } else {
      console.error(r(`Unknown type: ${type}. Use 'http' or 'ssh'.`));
      process.exitCode = 1; return;
    }

    const worker = workerPool.addWorker(config);
    console.log(g(`✓ Worker registered: ${worker.name}  (${worker.id})`));
    if (type === 'http') console.log(`  → ${c(config.url)}`);
    else console.log(`  → ${c(config.user + '@' + config.host + ':' + config.port)}`);
    console.log(`\nRun ${c('purpclaw workers status')} to check health.`);
    return;
  }

  // ── remove ────────────────────────────────────────────────────────────────
  if (sub === 'remove' || sub === 'rm' || sub === 'delete') {
    const id = args[1];
    if (!id) { console.error(r('Usage: purpclaw workers remove <id|name>')); process.exitCode = 1; return; }
    workerPool.removeWorker(id);
    console.log(g(`✓ Worker removed: ${id}`));
    return;
  }

  // ── enable / disable ──────────────────────────────────────────────────────
  if (sub === 'enable' || sub === 'disable') {
    const id = args[1];
    if (!id) { console.error(r(`Usage: purpclaw workers ${sub} <id|name>`)); process.exitCode = 1; return; }
    const w = workerPool.updateWorker(id, { enabled: sub === 'enable' });
    if (w && w.id) console.log(g(`✓ Worker ${sub}d: ${w.name || id}`));
    else console.log(y(`Worker not found: ${id}`));
    return;
  }

  // ── jobs ──────────────────────────────────────────────────────────────────
  if (sub === 'jobs') {
    const jobs = workerPool.listJobs().slice(-20).reverse();
    if (flags.json) { console.log(JSON.stringify(jobs, null, 2)); return; }
    if (!jobs.length) { console.log(y('No worker jobs on record.')); return; }
    console.log(`\n${b('Recent Worker Jobs')}\n`);
    for (const j of jobs) {
      const icon = j.status === 'completed' ? g('✓')
        : j.status === 'failed'    ? r('✗')
        : j.status === 'running'   ? c('⟳')
        : y('⏸');
      const since = j.startedAt ? ` ${timeSince(j.startedAt)}` : '';
      console.log(`  ${icon} ${b((j.id || '').slice(0, 18))}  ${c(j.agentName || '?')}  ${j.status}${since}`);
      if (j.workerName) console.log(`     worker: ${j.workerName}  wf: ${j.workflowId || '-'}`);
    }
    console.log('');
    return;
  }

  // ── test ──────────────────────────────────────────────────────────────────
  if (sub === 'test') {
    const id = args[1];
    if (!id) { console.error(r('Usage: purpclaw workers test <id|name>')); process.exitCode = 1; return; }
    const workers = workerPool.listWorkers();
    const w = workers.find(wk => wk.id === id || wk.name === id);
    if (!w) { console.error(r(`Worker not found: ${id}`)); process.exitCode = 1; return; }

    const sp = spinner && isTTY ? spinner(`Testing ${w.name}...`).start() : null;
    const result = await workerPool.dispatch('dragon', 'smoke-test: echo hello', {
      workflowId: `test-${Date.now()}`,
      intent: 'test',
    });
    if (sp) sp.stop();

    if (result.success) {
      console.log(g(`✓ ${w.name}: dispatch OK  jobId=${result.jobId}`));
      if (result.response) console.log(d(result.response));
    } else {
      console.error(r(`✗ ${w.name}: ${result.error}`));
    }
    return;
  }

  // ── fallback / help ───────────────────────────────────────────────────────
  console.log(`
${b('purpclaw workers')} — cloud/scale worker pool

  ${c('status')}                  health check all workers
  ${c('list')}                    show worker registry
  ${c('add')} [options]           register a new worker
  ${c('remove')} <id|name>        remove a worker
  ${c('jobs')}                    recent dispatch jobs
  ${c('test')} <id|name>          smoke-test a specific worker

Add HTTP worker:
  ${c('purpclaw workers add --type http --url http://192.168.1.50:7897')}

Add SSH worker:
  ${c('purpclaw workers add --type ssh --host 10.0.0.5 --user ubuntu --key ~/.ssh/id_rsa')}

Local overflow (worker_service.js on :7897):
  ${c('purpclaw workers add --type http --url http://127.0.0.1:7897 --name local-overflow')}

Signed worker (recommended for remote nodes):
  ${c('purpclaw workers secret gen')}    ${d('← generate a secret')}
  ${c('purpclaw workers add --type http --url http://10.0.0.5:7897 --secret <key>')}
  ${d('# Also set WORKER_SECRET=<key> in .env on the remote machine')}
`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseFlags(args) {
  const flags = { json: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json' || a === '-j') { flags.json = true; continue; }
    const m = a.match(/^--([a-z][\w-]*)(?:=(.+))?$/);
    if (m) {
      flags[m[1]] = m[2] !== undefined ? m[2] : (args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true);
    }
  }
  return flags;
}

function timeSince(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
  return `${Math.round(ms / 3600000)}h ago`;
}

module.exports = { run };
