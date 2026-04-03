'use strict';

/**
 * purpclaw evolve — operator front door to the auto-mutation engine
 * ═════════════════════════════════════════════════════════════════
 *
 *   purpclaw evolve pass [--auto]    Run a mutation pass over recent evidence.
 *                                    Without --auto: dry-run, list proposals.
 *                                    With --auto:    apply LOW-risk mutations.
 *   purpclaw evolve forge            Run skill-forge pass — detect taxonomy gaps,
 *                                    propose new JOB_TYPES / Thringlet archetypes.
 *   purpclaw evolve status           List pending + applied mutations.
 *   purpclaw evolve approve <id>     Apply a queued mutation.
 *   purpclaw evolve reject <id>      Reject a queued mutation with reason.
 *   purpclaw evolve history          Show last 20 applied mutations.
 *   purpclaw evolve regressions      Show recent regression alerts.
 */

const fs = require('fs');
const path = require('path');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', magenta: '\x1b[35m', gray: '\x1b[90m', pink: '\x1b[95m',
};
const isTTY = !!process.stdout.isTTY;
const col = (c, s) => isTTY ? `${c}${s}${C.reset}` : s;

const RISK_COLOR = { low: C.green, medium: C.yellow, high: C.red };

function parseArgs(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--auto') flags.auto = true;
    else if (a === '--json') flags.json = true;
    else positional.push(a);
  }
  return { flags, positional };
}

function loadEngines() {
  const mutator = require('../evolution/mutator');
  const forge = require('../evolution/skill-forge');
  return { mutator, forge };
}

// ─── pass ────────────────────────────────────────────────────────────────────

function cmdPass(flags) {
  const { mutator } = loadEngines();
  const r = mutator.runPass({ auto: !!flags.auto });
  if (flags.json) { console.log(JSON.stringify(r, null, 2)); return 0; }

  if (!r.ok) {
    console.log(col(C.yellow, `No mutation pass run — ${r.reason}`));
    return 0;
  }

  console.log();
  console.log(col(C.bold, `MUTATION PASS  ${flags.auto ? '(auto-apply LOW risk)' : '(dry-run)'}`));
  console.log(col(C.gray, `  evidence: ${r.evidenceSummary.benchmarks} benchmarks · ${r.evidenceSummary.jobs} jobs · ${r.evidenceSummary.deltas} deltas`));
  console.log();
  if (r.proposals.length === 0) {
    console.log(col(C.green, '  No mutations needed. System is stable.'));
    return 0;
  }

  console.log(col(C.bold, `Proposals: ${r.proposals.length}`));
  for (const p of r.proposals) {
    const rc = RISK_COLOR[p.risk] || C.gray;
    console.log(`  ${col(rc, p.risk.toUpperCase().padEnd(7))} ${col(C.bold, p.kind.padEnd(28))} ${col(C.gray, p.id)}`);
    console.log(col(C.dim, `         target: ${p.target}`));
    console.log(col(C.dim, `         reason: ${p.reason}`));
  }
  console.log();
  console.log(col(C.green, `  Applied (auto):   ${r.applied.length}`));
  console.log(col(C.yellow, `  Queued (operator): ${r.queued.length}`));
  if (r.queued.length > 0) {
    console.log(col(C.gray, `  Approve queued ones with: purpclaw evolve approve <id>`));
  }
  return 0;
}

function cmdForge(flags) {
  const { forge } = loadEngines();
  const r = forge.runForgePass();
  if (flags.json) { console.log(JSON.stringify(r, null, 2)); return 0; }

  console.log();
  console.log(col(C.bold, 'SKILL FORGE PASS'));
  console.log(col(C.gray, `  evidence: ${r.evidenceSummary.jobs} jobs · ${r.evidenceSummary.benchmarks} benchmarks`));
  console.log();
  if (r.proposals.length === 0) {
    console.log(col(C.green, '  No taxonomy gaps detected. Existing job types + archetypes cover observed work.'));
    return 0;
  }

  for (const p of r.proposals) {
    const rc = RISK_COLOR[p.risk] || C.gray;
    console.log(`  ${col(rc, p.risk.toUpperCase().padEnd(7))} ${col(C.bold, p.kind.padEnd(12))} ${p.name}  ${col(C.gray, p.id)}`);
    console.log(col(C.dim, `         reason: ${p.reason}`));
    if (p.evidence?.candidateKeywords) {
      console.log(col(C.dim, `         keywords: ${p.evidence.candidateKeywords.join(', ')}`));
    }
  }
  console.log();
  console.log(col(C.yellow, `  All forged proposals queued — approve with: purpclaw evolve approve <id>`));
  return 0;
}

// ─── status / history / approve / reject ─────────────────────────────────────

function cmdStatus(flags) {
  const { mutator, forge } = loadEngines();
  const pending = mutator.readProposed(50);
  const applied = mutator.readApplied(50);
  const forged = forge.listForged({ status: 'pending' });

  if (flags.json) {
    console.log(JSON.stringify({ pending, applied, forged }, null, 2));
    return 0;
  }

  console.log();
  console.log(col(C.bold, 'EVOLUTION STATUS'));
  console.log(col(C.gray, `  Pending mutator proposals: ${pending.length}`));
  console.log(col(C.gray, `  Applied/rejected so far:   ${applied.length}`));
  console.log(col(C.gray, `  Pending forged skills:      ${forged.length}`));
  console.log();
  if (pending.length > 0) {
    console.log(col(C.bold, 'Recent mutator proposals:'));
    for (const p of pending.slice(0, 10)) {
      const rc = RISK_COLOR[p.risk] || C.gray;
      console.log(`  ${col(rc, p.risk.toUpperCase().padEnd(7))} ${p.kind.padEnd(28)} ${col(C.gray, p.id)}  ${(p.reason || '').slice(0, 70)}`);
    }
  }
  if (forged.length > 0) {
    console.log();
    console.log(col(C.bold, 'Pending forged skills:'));
    for (const f of forged.slice(0, 8)) {
      const rc = RISK_COLOR[f.risk] || C.gray;
      console.log(`  ${col(rc, f.risk.toUpperCase().padEnd(7))} ${f.kind.padEnd(12)} ${f.name.padEnd(28)} ${col(C.gray, f.id)}`);
    }
  }
  return 0;
}

function cmdApprove(positional, flags) {
  const id = positional[0];
  if (!id) { console.log(col(C.red, 'Usage: purpclaw evolve approve <id>')); return 1; }
  const { mutator, forge } = loadEngines();

  // Try mutator first
  const m = mutator.approveProposal(id, { applyNow: true });
  if (m.ok && m.applied) {
    if (flags.json) { console.log(JSON.stringify(m, null, 2)); return 0; }
    console.log(col(C.green, `✓ Mutation ${id} applied: ${JSON.stringify(m.result)}`));
    return 0;
  }
  // Then forge
  const f = forge.getForged(id);
  if (f) {
    forge.setForgedStatus(id, 'approved', 'operator-approval');
    if (flags.json) { console.log(JSON.stringify({ ok: true, forged: f }, null, 2)); return 0; }
    console.log(col(C.green, `✓ Forged skill ${id} marked approved.`));
    console.log(col(C.gray, '  (Apply by editing the listed file or running the patch step manually for now.)'));
    console.log(col(C.gray, `  Target file: ${f.proposal ? (f.kind === 'job_type' ? 'lib/job-contract.js' : 'lib/thringlets/archetypes.js') : '?'}`));
    return 0;
  }
  console.log(col(C.red, `✗ No proposal found with id ${id}`));
  return 2;
}

function cmdReject(positional, flags) {
  const id = positional[0];
  const reason = positional.slice(1).join(' ') || 'operator-rejected';
  if (!id) { console.log(col(C.red, 'Usage: purpclaw evolve reject <id> [reason...]')); return 1; }
  const { mutator, forge } = loadEngines();
  const m = mutator.rejectProposal(id, reason);
  const f = forge.getForged(id);
  if (f) forge.setForgedStatus(id, 'rejected', reason);
  if (flags.json) { console.log(JSON.stringify({ mutator: m, forge: f ? { id, status: 'rejected' } : null }, null, 2)); return 0; }
  console.log(col(C.yellow, `· Rejected ${id}: ${reason}`));
  return 0;
}

function cmdHistory(flags) {
  const { mutator } = loadEngines();
  const rows = mutator.readApplied(30);
  if (flags.json) { console.log(JSON.stringify(rows, null, 2)); return 0; }
  if (!rows.length) { console.log(col(C.gray, 'No applied mutations yet.')); return 0; }
  console.log();
  console.log(col(C.bold, `APPLIED MUTATIONS  (last ${rows.length})`));
  for (const r of rows) {
    const when = new Date(r.appliedAt || r.rejectedAt || 0).toLocaleString();
    const mark = r.applied ? col(C.green, '✓') : r.queued ? col(C.yellow, '·') : col(C.red, '✗');
    console.log(`  ${mark} ${col(C.gray, when)}  ${(r.kind || 'rejected').padEnd(24)} ${col(C.gray, r.id)}`);
    if (r.reason) console.log(col(C.dim, `     ${r.reason.slice(0, 110)}`));
  }
  return 0;
}

function cmdRegressions(flags) {
  const ROOT = path.resolve(__dirname, '..', '..');
  const f = path.join(ROOT, 'agent_work', 'evolution', 'regression-alerts.jsonl');
  if (!fs.existsSync(f)) { console.log(col(C.green, 'No regression alerts logged.')); return 0; }
  const rows = fs.readFileSync(f, 'utf8').trim().split('\n')
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).slice(-20);
  if (flags.json) { console.log(JSON.stringify(rows, null, 2)); return 0; }
  console.log();
  console.log(col(C.bold, `REGRESSION ALERTS  (last ${rows.length})`));
  for (const r of rows) {
    console.log(`  ${col(C.gray, new Date(r.at).toLocaleString())}  ${JSON.stringify(r.evidence)}`);
  }
  return 0;
}

// ─── Entrypoint ──────────────────────────────────────────────────────────────

async function run(args) {
  const { flags, positional } = parseArgs(args || []);
  const sub = (positional.shift() || 'help').toLowerCase();
  switch (sub) {
    case 'pass':         return cmdPass(flags);
    case 'forge':        return cmdForge(flags);
    case 'status':       return cmdStatus(flags);
    case 'approve':      return cmdApprove(positional, flags);
    case 'reject':       return cmdReject(positional, flags);
    case 'history':      return cmdHistory(flags);
    case 'regressions':  return cmdRegressions(flags);
    case 'help':
    default:
      console.log(`
${col(C.bold, 'purpclaw evolve')} — auto-mutation engine for the recursive loop

${col(C.bold, 'Subcommands:')}
  pass [--auto]              Run a mutation pass over recent evidence
                             Without --auto: dry-run, list proposals
                             With --auto:    apply LOW-risk mutations
  forge                      Detect taxonomy gaps; propose new JOB_TYPES + archetypes
  status                     List pending + applied mutations
  approve <id>               Apply a queued mutation
  reject <id> [reason]       Reject a queued mutation
  history                    Show last 20 applied
  regressions                Show recent regression alerts

${col(C.bold, 'Flags:')}
  --auto                     pass: auto-apply LOW-risk mutations
  --json                     machine-readable output

${col(C.bold, 'Examples:')}
  purpclaw evolve pass                    # dry-run, just propose
  purpclaw evolve pass --auto             # apply low-risk now
  purpclaw evolve forge                   # propose new skills
  purpclaw evolve status                  # what's pending
  purpclaw evolve approve mut_xyz
`);
      return 0;
  }
}

module.exports = { run };
