'use strict';
/**
 * lib/commands/teleport.js
 * ─────────────────────────────────────────────────────────────────────────────
 * purpclaw teleport <subcommand> [args]
 *
 * Session handoff — bundle and restore the full agent context so work can
 * continue in a new terminal, on a different machine, or after a restart.
 *
 * Subcommands:
 *   create  [name]   — snapshot current state to agent_work/teleports/<id>/
 *   list             — list existing teleport bundles
 *   show    <id>     — inspect a bundle
 *   resume  <id>     — restore state + print reload instructions
 *   delete  <id>     — remove a bundle
 *
 * Bundle contents (agent_work/teleports/<id>/):
 *   manifest.json    — metadata: id, name, timestamp, services online, mochi
 *   context.json     — context-bus snapshot (active agents, workflows)
 *   pool.json        — pool stats at snapshot time
 *   orchestrator.json — queue + active workflow summaries
 *   mochi.json       — companion state copy
 *   reasoning.json   — last reasoning loop state (if present)
 */

const path = require('path');
const fs   = require('fs');
const http = require('http');

const TELEPORT_DIR_REL = path.join('agent_work', 'teleports');

async function run(args, ctx) {
  const { PURP_DIR, C, col, spinner, httpGet, ping, PORTS, isTTY, sectionHead, banner } = ctx;
  const TELE_DIR = path.join(PURP_DIR, TELEPORT_DIR_REL);

  const sub  = (args[0] || 'list').toLowerCase();
  const rest = args.slice(1);

  switch (sub) {
    case 'create': return cmdCreate(rest);
    case 'list':
    case 'ls':     return cmdList();
    case 'show':   return cmdShow(rest);
    case 'resume': return cmdResume(rest);
    case 'delete':
    case 'rm':     return cmdDelete(rest);
    default:       return cmdHelp();
  }

  // ── create ─────────────────────────────────────────────────────────────────
  async function cmdCreate(args) {
    banner();
    sectionHead('  TELEPORT CREATE');
    const label = args[0] || ('teleport-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
    const id    = label.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    const dir   = path.join(TELE_DIR, id);

    if (fs.existsSync(dir)) {
      console.log(col(C.yellow, `  Bundle '${id}' already exists. Choose a different name or delete it first.\n`));
      return;
    }
    fs.mkdirSync(dir, { recursive: true });

    const spin = spinner('snapshotting live state').start();

    // Fetch live data (best-effort)
    async function safeFetch(port, p) {
      try { return await httpGet(port, p, 1500); } catch { return null; }
    }

    const [ctxData, poolData, orchData] = await Promise.all([
      safeFetch(7881, '/context/stats'),
      safeFetch(7885, '/pool/stats'),
      safeFetch(7784, '/api/status'),
    ]);

    // Service health snapshot
    const registry = require(path.join(PURP_DIR, 'service_registry.js'));
    const healthResults = await Promise.allSettled(
      registry.getServices()
        .filter(s => s.healthPort && s.healthPath)
        .map(s => ping(s.healthPort, s.healthPath).then(alive => [s.key, alive]))
    );
    const serviceHealth = {};
    for (const r of healthResults) {
      if (r.value) serviceHealth[r.value[0]] = r.value[1];
    }

    // Copy companion state
    const MOCHI_SRC = path.join(PURP_DIR, 'agent_work', 'mochi.json');
    let mochiData = null;
    if (fs.existsSync(MOCHI_SRC)) {
      try { mochiData = JSON.parse(fs.readFileSync(MOCHI_SRC, 'utf8')); } catch {}
    }

    // Reasoning state
    const REASONING_SRC = path.join(PURP_DIR, 'agent_work', '.reasoning_state.json');
    let reasoningData = null;
    if (fs.existsSync(REASONING_SRC)) {
      try { reasoningData = JSON.parse(fs.readFileSync(REASONING_SRC, 'utf8')); } catch {}
    }

    // Write bundle
    const manifest = {
      id, label,
      createdAt: new Date().toISOString(),
      node: process.version,
      purpDir: PURP_DIR,
      serviceHealth,
      mochiName:    mochiData?.name    || null,
      mochiSpecies: mochiData?.species || null,
      activeAgents: ctxData?.activeAgents    ?? null,
      queueDepth:   orchData?.queue           ?? orchData?.queueDepth ?? null,
      skillsIndexed: poolData?.skillsCount    ?? null,
    };

    fs.writeFileSync(path.join(dir, 'manifest.json'),    JSON.stringify(manifest,   null, 2));
    fs.writeFileSync(path.join(dir, 'context.json'),     JSON.stringify(ctxData,    null, 2));
    fs.writeFileSync(path.join(dir, 'pool.json'),        JSON.stringify(poolData,   null, 2));
    fs.writeFileSync(path.join(dir, 'orchestrator.json'),JSON.stringify(orchData,   null, 2));
    if (mochiData)    fs.writeFileSync(path.join(dir, 'mochi.json'),     JSON.stringify(mochiData,   null, 2));
    if (reasoningData) fs.writeFileSync(path.join(dir, 'reasoning.json'),JSON.stringify(reasoningData, null, 2));

    spin.succeed(`bundle created: ${id}`);
    console.log('');
    console.log(`  ${col(C.cyan, 'Bundle ID')}  ${col(C.white, id)}`);
    console.log(`  ${col(C.gray, 'Location')}   ${dir}`);
    console.log(`  ${col(C.gray, 'Services')}   ${Object.values(serviceHealth).filter(Boolean).length}/${Object.keys(serviceHealth).length} online at snapshot`);
    if (mochiData) console.log(`  ${col(C.gray, 'Companion')}  ${mochiData.name} the ${mochiData.species}`);
    console.log('');
    console.log(col(C.gray, '  Resume with: purpclaw teleport resume ' + id));
    console.log('');
  }

  // ── list ───────────────────────────────────────────────────────────────────
  async function cmdList() {
    banner();
    sectionHead('  TELEPORT BUNDLES');

    if (!fs.existsSync(TELE_DIR)) {
      console.log(col(C.gray, '  No teleport bundles yet.\n'));
      console.log(col(C.gray, '  purpclaw teleport create [name]  — create a snapshot\n'));
      return;
    }

    const dirs = fs.readdirSync(TELE_DIR)
      .filter(d => fs.existsSync(path.join(TELE_DIR, d, 'manifest.json')))
      .map(d => {
        let m = {};
        try { m = JSON.parse(fs.readFileSync(path.join(TELE_DIR, d, 'manifest.json'), 'utf8')); } catch {}
        return { id: d, ...m };
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    if (dirs.length === 0) {
      console.log(col(C.gray, '  No bundles found (empty directory).\n'));
      return;
    }

    for (const b of dirs) {
      const ts  = (b.createdAt || '?').replace('T', ' ').slice(0, 16);
      const svcs = b.serviceHealth
        ? `${Object.values(b.serviceHealth).filter(Boolean).length}/${Object.keys(b.serviceHealth).length} svcs`
        : '';
      const mochi = b.mochiName ? `🦞 ${b.mochiName}` : '';
      console.log(
        `  ${col(C.cyan, (b.id || b.label || '?').padEnd(30))}  ` +
        `${col(C.gray, ts)}  ` +
        `${col(C.gray, svcs.padEnd(14))}  ` +
        `${col(C.magenta, mochi)}`
      );
    }
    console.log('');
    console.log(col(C.gray, '  purpclaw teleport show   <id>  — inspect bundle'));
    console.log(col(C.gray, '  purpclaw teleport resume <id>  — restore context'));
    console.log('');
  }

  // ── show ───────────────────────────────────────────────────────────────────
  async function cmdShow(args) {
    const id  = args[0];
    if (!id)  { console.log(col(C.red, '  Usage: purpclaw teleport show <id>\n')); return; }
    const dir = path.join(TELE_DIR, id);
    if (!fs.existsSync(dir)) { console.log(col(C.red, `  Bundle '${id}' not found.\n`)); return; }

    let manifest = {};
    try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch {}

    sectionHead('  TELEPORT BUNDLE · ' + id);
    console.log(`  ${col(C.gray, 'Created:')}    ${manifest.createdAt || '?'}`);
    console.log(`  ${col(C.gray, 'Node:')}       ${manifest.node || '?'}`);
    console.log(`  ${col(C.gray, 'PurpDir:')}    ${manifest.purpDir || '?'}`);
    if (manifest.mochiName) {
      console.log(`  ${col(C.gray, 'Companion:')}  ${manifest.mochiName} the ${manifest.mochiSpecies}`);
    }
    if (manifest.activeAgents !== null && manifest.activeAgents !== undefined) {
      console.log(`  ${col(C.gray, 'Active agents:')} ${manifest.activeAgents}`);
    }
    if (manifest.queueDepth !== null && manifest.queueDepth !== undefined) {
      console.log(`  ${col(C.gray, 'Queue depth:')}   ${manifest.queueDepth}`);
    }
    if (manifest.skillsIndexed !== null) {
      console.log(`  ${col(C.gray, 'Skills:')}        ${manifest.skillsIndexed}`);
    }

    if (manifest.serviceHealth) {
      console.log('');
      console.log(col(C.gray, '  Services at snapshot:'));
      for (const [k, v] of Object.entries(manifest.serviceHealth)) {
        const dot = v ? col(C.green, '●') : col(C.red, '○');
        console.log(`    ${dot}  ${k}`);
      }
    }

    const files = fs.readdirSync(dir);
    console.log('');
    console.log(col(C.gray, `  Bundle files: ${files.join(', ')}`));
    console.log('');
  }

  // ── resume ─────────────────────────────────────────────────────────────────
  async function cmdResume(args) {
    const id  = args[0] || 'latest';
    let resolvedId = id;

    if (id === 'latest') {
      if (!fs.existsSync(TELE_DIR)) { console.log(col(C.red, '  No teleport bundles found.\n')); return; }
      const dirs = fs.readdirSync(TELE_DIR).filter(d => fs.existsSync(path.join(TELE_DIR, d, 'manifest.json')));
      if (dirs.length === 0) { console.log(col(C.red, '  No bundles found.\n')); return; }
      // Sort by createdAt in manifest
      const sorted = dirs.map(d => {
        try { const m = JSON.parse(fs.readFileSync(path.join(TELE_DIR, d, 'manifest.json'), 'utf8')); return { d, m }; } catch { return { d, m: {} }; }
      }).sort((a, b) => (b.m.createdAt || '').localeCompare(a.m.createdAt || ''));
      resolvedId = sorted[0].d;
    }

    const dir = path.join(TELE_DIR, resolvedId);
    if (!fs.existsSync(dir)) { console.log(col(C.red, `  Bundle '${resolvedId}' not found.\n`)); return; }

    let manifest = {};
    let ctxData  = null;
    let orchData = null;

    try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch {}
    try { ctxData  = JSON.parse(fs.readFileSync(path.join(dir, 'context.json'), 'utf8')); }  catch {}
    try { orchData = JSON.parse(fs.readFileSync(path.join(dir, 'orchestrator.json'), 'utf8')); } catch {}

    // Restore mochi if no current mochi
    const MOCHI_DEST = path.join(PURP_DIR, 'agent_work', 'mochi.json');
    const MOCHI_SRC  = path.join(dir, 'mochi.json');
    if (fs.existsSync(MOCHI_SRC) && !fs.existsSync(MOCHI_DEST)) {
      fs.copyFileSync(MOCHI_SRC, MOCHI_DEST);
    }

    sectionHead('  TELEPORT RESUME · ' + resolvedId);
    console.log(`\n  ${col(C.magenta, 'Snapshot was taken:')} ${manifest.createdAt || '?'}`);
    if (manifest.mochiName) {
      console.log(`  ${col(C.magenta, 'Companion restored:')} ${manifest.mochiName} the ${manifest.mochiSpecies}`);
    }

    console.log('');
    sectionHead('  CONTEXT AT SNAPSHOT TIME');
    if (ctxData) {
      console.log(`  Active agents    : ${col(C.cyan, String(ctxData.activeAgents ?? '?'))}`);
      console.log(`  Total workflows  : ${col(C.cyan, String(ctxData.totalWorkflows ?? '?'))}`);
      console.log(`  Active locks     : ${col(C.gray, String(ctxData.activeLocks ?? '?'))}`);
    }
    if (orchData) {
      console.log(`  Queue depth      : ${col(C.yellow, String(orchData.queue ?? orchData.queueDepth ?? '?'))}`);
      console.log(`  Active workflows : ${col(C.cyan, String(orchData.active ?? orchData.activeWorkflows ?? '?'))}`);
    }

    console.log('');
    sectionHead('  RELOAD INSTRUCTIONS');
    console.log(`  ${col(C.gray, '1.')} Boot the stack if not running:`);
    console.log(`     ${col(C.cyan, 'purpclaw start')}`);
    console.log(`  ${col(C.gray, '2.')} Check current state:`);
    console.log(`     ${col(C.cyan, 'purpclaw ctx-viz')}`);
    console.log(`  ${col(C.gray, '3.')} Reindex if pool was rebuilt:`);
    console.log(`     ${col(C.cyan, 'purpclaw pool reindex')}`);
    console.log(`  ${col(C.gray, '4.')} Continue working:`);
    console.log(`     ${col(C.cyan, 'purpclaw run "continue where we left off"')}`);
    console.log('');
  }

  // ── delete ─────────────────────────────────────────────────────────────────
  async function cmdDelete(args) {
    const id  = args[0];
    if (!id)  { console.log(col(C.red, '  Usage: purpclaw teleport delete <id>\n')); return; }
    const dir = path.join(TELE_DIR, id);
    if (!fs.existsSync(dir)) { console.log(col(C.yellow, `  Bundle '${id}' not found.\n`)); return; }
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(col(C.green, `  ✔  Deleted bundle: ${id}\n`));
  }

  // ── help ───────────────────────────────────────────────────────────────────
  async function cmdHelp() {
    sectionHead('  TELEPORT HELP');
    console.log(`  ${col(C.cyan, 'purpclaw teleport create [name]')}   snapshot current state`);
    console.log(`  ${col(C.cyan, 'purpclaw teleport list')}            list all bundles`);
    console.log(`  ${col(C.cyan, 'purpclaw teleport show <id>')}       inspect a bundle`);
    console.log(`  ${col(C.cyan, 'purpclaw teleport resume <id>')}     restore + print reload instructions`);
    console.log(`  ${col(C.cyan, 'purpclaw teleport delete <id>')}     remove a bundle`);
    console.log('');
  }
}

module.exports = { run };
