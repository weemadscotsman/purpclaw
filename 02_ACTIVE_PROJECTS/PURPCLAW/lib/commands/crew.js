'use strict';

/**
 * purpclaw crew      — show the crew + model-per-agent bindings
 * purpclaw crew route "<message>"  — show which agent a task routes to
 * purpclaw crew "<message>"        — route + run the right agent
 * purpclaw /analyst|/writer|/marketer|/coder "<message>"  — direct dispatch
 * purpclaw pipeline "<topic>"      — run the full Analyst→Writer→Marketer pipeline
 */

const crew = require('../crew');

function colorize(C, col, s, c) { return col ? col(c, s) : s; }

async function run(args, ctx = {}) {
  const { C = {}, col } = ctx;
  const sub = (args[0] || '').toLowerCase();

  // purpclaw crew  (no args) → roster
  if (!args.length || sub === 'list' || sub === 'roster') {
    console.log('\n  PURPCLAW CREW — one model per agent\n');
    for (const a of crew.listCrew()) {
      console.log(`  ${colorize(C, col, a.role.padEnd(13), C.cyan)} ${a.provider.padEnd(8)} ${colorize(C, col, a.model, C.yellow)}`);
      console.log(`  ${''.padEnd(13)} ${colorize(C, col, a.specialty, C.gray)}`);
    }
    console.log('\n  dispatch:  purpclaw crew "<task>"   ·   purpclaw pipeline "<topic>"');
    console.log('  slash:     /analyst /writer /marketer /coder /orchestrator\n');
    return 0;
  }

  // purpclaw pipeline "<topic>"  (also reachable via `crew pipeline ...`)
  if (sub === 'pipeline') {
    const topic = args.slice(1).join(' ').trim();
    if (!topic) { console.log('\n  usage: purpclaw pipeline "<topic>"\n'); return 1; }
    return runPipeline(topic, ctx);
  }

  // purpclaw crew route "<message>"  → just show the routing decision
  if (sub === 'route') {
    const msg = args.slice(1).join(' ').trim();
    const r = crew.route(msg);
    console.log(`\n  → ${colorize(C, col, crew.CREW[r.role].name, C.cyan)}  (${r.reason})`);
    console.log(`    model: ${crew.CREW[r.role].provider}/${crew.CREW[r.role].model}\n`);
    return 0;
  }

  // purpclaw crew "<message>"  → route + run
  const msg = args.join(' ').trim();
  if (!msg) { console.log('\n  usage: purpclaw crew "<task>"\n'); return 1; }
  const r = crew.route(msg);
  console.log(`\n  ${colorize(C, col, '▸ ' + crew.CREW[r.role].name, C.cyan)} ${colorize(C, col, '(' + crew.CREW[r.role].provider + '/' + crew.CREW[r.role].model + ')', C.gray)} — ${r.reason}\n`);
  try {
    const text = await crew.runRole(r.role, r.prompt, { trigger: 'cli' });
    console.log(text + '\n');
    return 0;
  } catch (e) {
    console.error(colorize(C, col, `  ✗ ${e.message}\n`, C.red));
    return 1;
  }
}

async function runPipeline(topic, ctx = {}) {
  const { C = {}, col } = ctx;
  console.log(`\n  ${colorize(C, col, 'FULL PIPELINE', C.magenta)} — ${topic}\n`);
  const labels = { research: 'Analyst (research)', content: 'Writer (draft)', promotion: 'Marketer (social + strategy)' };
  const res = await crew.runContentPipeline(topic, {
    onStage: (stage, role, text) => {
      console.log(colorize(C, col, `\n  ── ${labels[stage] || stage} ──`, C.cyan));
      console.log('  ' + String(text).replace(/\n/g, '\n  ').slice(0, 1600) + (text.length > 1600 ? '\n  …' : ''));
    },
  });
  if (res.ok) console.log(colorize(C, col, `\n  ✓ pipeline complete (${Object.keys(res.stages).length} stages)\n`, C.green));
  else console.log(colorize(C, col, `\n  ✗ pipeline failed: ${res.error}\n`, C.red));
  return res.ok ? 0 : 1;
}

module.exports = { run };
