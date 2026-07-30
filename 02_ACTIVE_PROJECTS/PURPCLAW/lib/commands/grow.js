'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

function parseArgs(args) {
  const flags = { json: false, health: true };
  const positional = [];
  for (const arg of args || []) {
    if (arg === '--json') flags.json = true;
    else if (arg === '--no-health') flags.health = false;
    else positional.push(arg);
  }
  return { flags, positional };
}

function requestJson(port, pathname, { method = 'GET', body = null, timeoutMs = 3000 } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      } : undefined,
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function optionalJson(port, pathname, options) {
  try {
    const res = await requestJson(port, pathname, options);
    return res.status >= 200 && res.status < 400
      ? { ok: true, body: res.body }
      : { ok: false, error: `http ${res.status}`, body: res.body };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function countSkills(rootDir) {
  const skillsDir = path.join(rootDir, 'skills');
  try {
    return fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && fs.existsSync(path.join(skillsDir, entry.name, 'SKILL.md')))
      .length;
  } catch {
    return 0;
  }
}

function loadEvolution(rootDir) {
  try {
    const mutator = require(path.join(rootDir, 'lib', 'evolution', 'mutator.js'));
    const forge = require(path.join(rootDir, 'lib', 'evolution', 'skill-forge.js'));
    return {
      pendingMutations: mutator.readProposed(100).length,
      appliedMutations: mutator.readApplied(100).length,
      pendingSkills: forge.listForged({ status: 'pending' }).length,
    };
  } catch (err) {
    return { error: err.message };
  }
}

function summarizeParity(report) {
  const growth = report.sections.find(section => section.id === 'persistent-growth');
  const resident = report.sections.find(section => section.id === 'resident-agent');
  const automation = report.sections.find(section => section.id === 'scheduled-automation');
  return {
    generatedAt: report.generatedAt,
    groups: report.totals,
    resident: resident ? resident.state : 'missing',
    growth: growth ? growth.state : 'missing',
    automation: automation ? automation.state : 'missing',
  };
}

async function buildStatus(rootDir, flags) {
  const parity = require(path.join(rootDir, 'lib', 'feature-parity.js'));
  const reasoning = require(path.join(rootDir, 'lib', 'reasoning-tick.js'));

  const [parityReport, pool, memoryHealth, memoryStats] = await Promise.all([
    parity.evaluate(rootDir, { probeHealth: flags.health }),
    optionalJson(7885, '/pool/stats'),
    optionalJson(7880, '/memory/health'),
    optionalJson(7880, '/memory/stats'),
  ]);

  const reasoningState = reasoning.readState();
  const evolution = loadEvolution(rootDir);

  return {
    generatedAt: new Date().toISOString(),
    northStar: 'The Agent That Grows With You',
    identity: 'Resident autonomous agent runtime with persistent memory, governed routing, and skill growth.',
    parity: summarizeParity(parityReport),
    services: {
      pool: pool.ok ? 'online' : `offline: ${pool.error}`,
      memory: memoryHealth.ok ? 'online' : `offline: ${memoryHealth.error}`,
    },
    memory: {
      pool: pool.ok ? {
        skills: pool.body.skillsCount,
        agents: pool.body.agentsCount,
        memories: pool.body.memories,
        failures: pool.body.failures,
        queries: pool.body.queries,
      } : null,
      matrix: memoryStats.ok ? memoryStats.body : null,
      skillDirs: countSkills(rootDir),
    },
    heartbeat: {
      lastTickAt: reasoningState.lastTickAt || null,
      lastTickId: reasoningState.lastTickId || null,
      lastSummary: reasoningState.lastSummary || null,
      knownDown: reasoningState.knownDown || {},
    },
    evolution,
  };
}

function printStatus(status, ctx) {
  const { C, col } = ctx;
  const stateColor = (state) => {
    if (state === 'live' || state === 'online') return C.green;
    if (String(state).startsWith('offline') || state === 'missing') return C.red;
    return C.yellow;
  };
  const line = (label, value, color = C.cyan) => {
    console.log(`  ${label.padEnd(20)}: ${col(color, String(value ?? '-'))}`);
  };

  console.log('');
  console.log(col(C.bold + C.cyan, 'PURPCLAW GROWTH STATUS'));
  console.log(col(C.gray, 'The Agent That Grows With You'));
  console.log(col(C.gray, 'Resident runtime, persistent memory, governed routing, skill growth.\n'));

  line('Resident runtime', status.parity.resident, stateColor(status.parity.resident));
  line('Growth layer', status.parity.growth, stateColor(status.parity.growth));
  line('Automation layer', status.parity.automation, stateColor(status.parity.automation));
  line('Feature groups', `${status.parity.groups.live} live / ${status.parity.groups.partial} partial / ${status.parity.groups.missing} missing`, C.gray);
  console.log('');

  line('Knowledge Pool', status.services.pool, stateColor(status.services.pool));
  line('Memory Matrix', status.services.memory, stateColor(status.services.memory));
  if (status.memory.pool) {
    line('Skills indexed', status.memory.pool.skills);
    line('Routing agents', status.memory.pool.agents);
    line('Pool memories', status.memory.pool.memories);
    line('Failure records', status.memory.pool.failures);
  }
  line('Skill dirs', status.memory.skillDirs);
  console.log('');

  line('Last heartbeat', status.heartbeat.lastTickAt || 'none yet', status.heartbeat.lastTickAt ? C.cyan : C.yellow);
  if (status.heartbeat.lastSummary) {
    const s = status.heartbeat.lastSummary;
    line('Heartbeat services', `${s.online}/${s.online + s.offline} online`, s.requiredDown ? C.yellow : C.green);
    line('Proposals', s.proposals);
    line('Heartbeat memory', s.writes && s.writes.heartbeat ? 'written' : 'not written', s.writes && s.writes.heartbeat ? C.green : C.yellow);
  }
  line('Pending changes', status.evolution.pendingMutations ?? 'unknown');
  line('Applied changes', status.evolution.appliedMutations ?? 'unknown');
  line('Pending skills', status.evolution.pendingSkills ?? 'unknown');
  console.log('');
  console.log(col(C.gray, 'Commands: purpclaw grow pulse | purpclaw memory ingest "<lesson>" | purpclaw evolve status | purpclaw parity --health'));
  console.log('');
}

async function pulse(ctx, flags) {
  const { C, col, PURP_DIR, spinner } = ctx;
  const reasoning = require(path.join(PURP_DIR, 'lib', 'reasoning-tick.js'));
  const spin = spinner('recording growth heartbeat').start();
  const result = await reasoning.tick({ verbose: false });
  spin.succeed(`heartbeat ${result.tickId} recorded in ${result.durationMs}ms`);

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('');
  console.log(`  Services       : ${col(result.services.requiredDown ? C.yellow : C.green, `${result.services.online}/${result.services.total}`)} online`);
  console.log(`  Pool           : ${result.poolAlive ? col(C.green, 'reachable') : col(C.red, 'offline')}`);
  if (result.poolStats) {
    console.log(`  Pool snapshot  : ${col(C.cyan, `${result.poolStats.skills} skills, ${result.poolStats.agents} agents, ${result.poolStats.memories} memories`)}`);
  }
  console.log(`  Memory write   : ${result.writes.heartbeat ? col(C.green, 'yes') : col(C.yellow, 'no')}`);
  console.log(`  Failure writes : ${col(result.writes.failures ? C.yellow : C.gray, String(result.writes.failures))}`);
  if (result.proposals.length) {
    console.log('');
    console.log(col(C.cyan, '  Proposed next work:'));
    for (const proposal of result.proposals) {
      console.log(`    - ${proposal.command} ${col(C.gray, '(' + proposal.reason + ')')}`);
    }
  }
  console.log('');
}

async function remember(ctx, text) {
  const { C, col } = ctx;
  if (!text) {
    console.error(col(C.red, '\n  Usage: purpclaw grow remember "<lesson to remember>"\n'));
    return 1;
  }

  const result = await optionalJson(7880, '/memory/ingest', {
    method: 'POST',
    timeoutMs: 10000,
    body: {
      content: text,
      source: 'purpclaw-grow',
      importance: 0.8,
    },
  });

  if (!result.ok) {
    console.error(col(C.red, `\n  Memory Matrix unavailable: ${result.error}\n`));
    return 1;
  }

  console.log('');
  console.log(col(C.green, '  Remembered in Memory Matrix.'));
  if (result.body && result.body.memory_id) console.log(col(C.gray, `  id: ${result.body.memory_id}`));
  console.log('');
  return 0;
}

async function run(args, ctx) {
  const { flags, positional } = parseArgs(args);
  const sub = (positional.shift() || 'status').toLowerCase();

  if (sub === 'pulse' || sub === 'tick') return pulse(ctx, flags);
  if (sub === 'remember' || sub === 'learn') return remember(ctx, positional.join(' ').trim());
  if (sub === 'status') {
    const status = await buildStatus(ctx.PURP_DIR, flags);
    if (flags.json) console.log(JSON.stringify(status, null, 2));
    else printStatus(status, ctx);
    return 0;
  }

  if (sub === 'help') {
    console.log(`
purpclaw grow - resident growth control surface

Subcommands:
  status              Show runtime, memory, heartbeat, and evolution status
  pulse               Record one governed heartbeat through the reasoning tick
  remember "<lesson>" Store a high-importance lesson in Memory Matrix

Flags:
  --json              Print machine-readable output
  --no-health         Skip live service probes for parity status
`);
    return 0;
  }

  return remember(ctx, [sub, ...positional].join(' ').trim());
}

module.exports = { run, buildStatus };
