'use strict';

const path = require('path');
const fs = require('fs');

// Same resolveProjectRoot logic as bin/purpclaw.js — keeps workflow.js self-contained
const _rootMarker = 'docs' + path.sep + 'COMPANION_EVENT_MAP.md';
const _KNOWN = [
  'E:' + path.sep + 'god folder' + path.sep + '02_ACTIVE_PROJECTS' + path.sep + 'PURPCLAW',
];
function _resolveRoot() {
  for (const p of _KNOWN) {
    if (fs.existsSync(path.join(p, _rootMarker))) return p;
  }
  const orig = path.resolve(__dirname, '..', '..');
  let d = orig, prev = '';
  while (d !== prev) {
    if (fs.existsSync(path.join(d, _rootMarker))) return d;
    prev = d; d = path.dirname(d);
  }
  return orig;
}
const PURP_DIR = _resolveRoot();

function printWorkflow(w, ctx = {}) {
  const C = ctx.C || {};
  const col = ctx.col || ((_, value) => value);
  console.log('');
  console.log(col((C.bold || '') + (C.cyan || ''), `${w.id} - ${w.name}`));
  console.log(`  Phase: ${w.phase}`);
  console.log(`  Command: ${w.command}`);
  console.log(`  Inputs: ${(w.requiredInputs || []).join(', ')}`);
  console.log(`  Outputs: ${(w.outputs || []).join(', ')}`);
  console.log(`  Agents: ${(w.agents || []).join(', ')}`);
  console.log(`  Next: ${(w.next || []).join(', ')}`);
}

function printRun(run, ctx = {}) {
  const C = ctx.C || {};
  const col = ctx.col || ((_, value) => value);
  const statusColour = {
    running    : C.cyan,
    completed  : C.green,
    failed     : C.red,
    interrupted: C.yellow,
    created    : C.gray,
  }[run.status] || C.gray;
  const age = run.created_at
    ? `${Math.round((Date.now() - new Date(run.created_at).getTime()) / 1000)}s ago`
    : '';
  console.log(`  ${col(statusColour, (run.status || '—').padEnd(12))}  ${col(C.bold, (run.run_id || '—').padEnd(28))}  ${col(C.gray, age)}`);
  if (run.error) console.log(`     ${col(C.red, run.error.substring(0, 80))}`);
}

async function run(args = [], ctx = {}) {
  const PURP_DIR = ctx.PURP_DIR || path.resolve(__dirname, '..', '..');
  const sub = (args[0] || '').toLowerCase();

  // ── purpclaw workflow ──────────────────────────────────────────────────────
  // (no sub = show available workflow definitions)
  if (!sub || sub === 'list') {
    const reg = require(path.join(PURP_DIR, 'lib', 'workflow-registry.js'));
    const json = args.includes('--json');
    const id = args.find(a => !a.startsWith('--') && a !== 'list');
    const workflows = id ? [reg.findWorkflow(id)].filter(Boolean) : reg.listWorkflows();
    const report = {
      schema: 'purpclaw.workflow-registry.report.v1',
      count: workflows.length,
      workflows,
    };
    if (json) {
      console.log(JSON.stringify(report, null, 2));
      return report;
    }
    if (!workflows.length) {
      console.log(`Workflow not found: ${id}`);
      return report;
    }
    for (const w of workflows) printWorkflow(w, ctx);
    console.log('');
    return report;
  }

  // ── purpclaw workflow runs ─────────────────────────────────────────────────
  if (sub === 'runs') {
    const limit = Math.min(parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '20'), 200);
    const runs = WF.list(limit);
    console.log('');
    console.log(`  ${(ctx.C?.bold || '') + (ctx.C?.cyan || '')}Recent workflow runs${''}`);
    console.log(`  Status         Run ID                          Age`);
    console.log('  ' + '-'.repeat(60));
    if (!runs.length) {
      console.log(`  ${ctx.C?.gray || ''}No workflow runs found.${''}`);
    } else {
      for (const r of runs) printRun(r, ctx);
    }
    console.log('');
    return { schema: 'purpclaw.workflow.runs.v1', runs };
  }

  // ── purpclaw workflow resume <runId> [--approve|--deny] ─────────────────────
  if (sub === 'resume') {
    const runId = args[1];
    if (!runId) {
      console.log('Usage: purpclaw workflow resume <runId> [--approve|--deny]');
      console.log('       purpclaw workflow runs          # list recent runs');
      return 1;
    }

    const approve = args.includes('--approve');
    const deny   = args.includes('--deny');
    const decision = approve ? 'approve' : deny ? 'deny' : null;

    const AQ = (() => { try { return require(path.join(PURP_DIR, 'lib', 'approval-queue.js')); } catch { return null; } })();

    const run = WF.get(runId);
    if (!run) {
      console.log(`Workflow run not found: ${runId}`);
      return 1;
    }

    // Resolve approval if one is pending and a decision was given
    if (decision && AQ && run.context?.__approval_id) {
      const ok = AQ.resolveApproval(run.context.__approval_id, decision);
      if (!ok) {
        console.log(`  ⚠ Could not resolve approval ${run.context.__approval_id} — may already be resolved.`);
      } else {
        console.log(`  ✓ ${decision === 'approve' ? 'Approved' : 'Denied'}: ${run.context.__approval_id}`);
      }
    } else if (!decision && run.status === 'interrupted') {
      console.log(`  Workflow is interrupted. Use --approve or --deny to resume.`);
      console.log(`  Pending approval: ${run.context?.__approval_id || 'unknown'}`);
      return 1;
    }

    // Minimal adapter for resume (no-op — resume doesn't re-execute nodes)
    const adapter = {
      async prompt(input, node, run) { return { prompt: input }; },
      async tool(tool, args, node, run) { return { tool, args }; },
    };

    console.log(`  Resuming ${runId}…`);
    const result = await WF.resume(runId, adapter, {
      resumeValue: { approved: !!approve },
    });

    const statusColour = {
      completed  : ctx.C?.green,
      failed     : ctx.C?.red,
      interrupted: ctx.C?.yellow,
    }[result.status] || ctx.C?.cyan;
    console.log(`\n  Status: ${statusColour || ''}${result.status}${''}`);
    if (result.error) console.log(`  Error: ${ctx.C?.red || ''}${result.error}${''}`);
    console.log(`  Completed nodes: ${result.completed?.length || 0}`);
    return result.status === 'failed' ? 1 : 0;
  }

  // ── purpclaw workflow run <name> [inputKey=value...] ─────────────────────────
  if (sub === 'run') {
    const name = args[1];
    if (!name) {
      console.log('Usage: purpclaw workflow run <name> [key=value...]');
      console.log('       purpclaw workflow list                # show available workflows');
      return 1;
    }
    // First try WF.load — loads .json/.yaml from workflows/ dir or absolute path
    let spec;
    const WF = require(path.join(PURP_DIR, 'lib', 'workflow-manager.js'));
        try { spec = WF.load(name, PURP_DIR); } catch {}
    // Fall back to registry metadata (no nodes — just for discovery)
    if (!spec) {
      const reg = require(path.join(PURP_DIR, 'lib', 'workflow-registry.js'));
      spec = reg.findWorkflow(name);
    }
    if (!spec) {
      console.log(`Workflow not found: ${name}`);
      console.log('Run `purpclaw workflow list` to see available workflows.');
      return 1;
    }
    if (!spec.nodes || !spec.nodes.length) {
      console.log(`Workflow "${spec.name || spec.id}" has no runnable nodes.`);
      console.log('Author a .json or .yaml spec in the workflows/ directory.');
      return 1;
    }
    // Parse key=value input args into context
    const input = {};
    for (const arg of args.slice(2)) {
      const eq = arg.indexOf('=');
      if (eq > 0) input[arg.slice(0, eq)] = arg.slice(eq + 1);
    }
    const _col = ctx.col || ((_, v) => v);
    const _C = ctx.C || {};
    const adapter = {
      prompt: async (input, node, run) => {
        console.log(_col(_C.cyan, `  [prompt]`) + ` ${node.prompt?.substring(0, 80) || node.id}`);
        return { ok: true, output: `[mock prompt: ${node.id}]` };
      },
      tool: async (tool, args, node, run) => {
        console.log(_col(_C.yellow, `  [tool]`) + ` ${tool} ${JSON.stringify(args).substring(0, 60)}`);
        return { ok: true, output: `[mock tool: ${tool}]` };
      },
    };
    console.log(`\n  Starting workflow: ${_col(_C.cyan, spec.name || spec.id)}`);
    if (Object.keys(input).length) console.log(`  Input: ${JSON.stringify(input)}`);
    console.log('');
    try {
      const result = await WF.run(spec, adapter, { input, maxSteps: 200 });
      const statusColour = { complete: _C.green, failed: _C.red, interrupted: _C.yellow }[result.status] || _C.cyan;
      console.log(`\n  Status: ${_col(statusColour, result.status)}`);
      if (result.error) console.log(`  Error: ${_col(_C.red, result.error)}`);
      console.log(`  Completed nodes: ${result.completed?.length || 0}`);
      return result.status === 'failed' ? 1 : 0;
    } catch (err) {
      console.log(`  ${_col(_C.red, '[X]')} ${err.message}`);
      return 1;
    }
  }

  // ── purpclaw workflow history <runId> ───────────────────────────────────────
  if (sub === 'history') {
    const runId = args[1];
    if (!runId) {
      console.log('Usage: purpclaw workflow history <runId>');
      return 1;
    }
    const checkpoints = WF.history(runId);
    console.log('');
    console.log(`  Checkpoints for ${runId}`);
    console.log('  ' + '-'.repeat(60));
    if (!checkpoints.length) {
      console.log(`  No checkpoints found.`);
    } else {
      for (const cp of checkpoints) {
        const colour = { started: ctx.C?.cyan, completed: ctx.C?.green, failed: ctx.C?.red, interrupted: ctx.C?.yellow }[cp.status] || ctx.C?.gray;
        console.log(`  ${colour || ''}[${cp.status.padEnd(12)}]  node=${cp.node_id}  id=${cp.id}  ${cp.created_at}${''}`);
      }
    }
    console.log('');
    return { schema: 'purpclaw.workflow.history.v1', runId, checkpoints };
  }

  // ── purpclaw workflow --help ─────────────────────────────────────────────────
  if (sub === '--help' || sub === '-h') {
    console.log('purpclaw workflow [list|runs|run|resume|history] [options]');
    console.log('  list [--json] [workflow-id]   list workflow definitions');
    console.log('  runs [--limit=N]             list recent workflow runs');
    console.log('  run <name> [key=value...]    run a workflow by name');
    console.log('  resume <runId> [--approve|--deny]  resume an interrupted run');
    console.log('  history <runId>               show checkpoint history for a run');
    console.log('');
    return 0;
  }

  // Unknown subcommand
  console.log(`Unknown workflow subcommand: ${sub}`);
  console.log('Usage: purpclaw workflow [list|runs|resume|history]');
  return 1;
}

module.exports = { run };
