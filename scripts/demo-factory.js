#!/usr/bin/env node
'use strict';
/**
 * scripts/demo-factory.js — run the One Button Product Factory.
 *
 *   node scripts/demo-factory.js ["product idea"]
 *
 * One instruction in → full autonomous mission out (health check, brief,
 * real swarm dispatch, research, build, QA, docs, package, mission report).
 * Artifacts land in agent_work/factory/<runId>/.
 */

const { ProductFactory } = require('../lib/demo/product-factory');

async function main() {
  const idea = process.argv.slice(2).join(' ').trim() || undefined;
  const factory = new ProductFactory({ idea, onLog: (m) => console.log(m) });
  console.log(`=== PURPCLAW PRODUCT FACTORY · ${factory.runId} ===`);
  const { dir, summary } = await factory.run();
  console.log('');
  console.log(`MISSION COMPLETE — ${summary.stages.filter(s => s.status === 'completed').length}/${summary.stages.length} stages`);
  console.log(`Output: ${dir}`);
}

main().catch(e => {
  console.error(`MISSION FAILED: ${e.message}`);
  process.exitCode = 1;
});
