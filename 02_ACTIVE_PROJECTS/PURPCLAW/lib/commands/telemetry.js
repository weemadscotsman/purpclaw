'use strict';

const telemetry = require('../runtime/pipeline-telemetry');

function value(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

async function run(args) {
  const limit = Math.min(Number(value(args, '--limit') || 50), 500);
  const workflowId = value(args, '--workflow');
  const service = value(args, '--service');
  const status = value(args, '--status');
  const events = telemetry.read(limit, { workflowId, service, status });

  if (args.includes('--json')) {
    console.log(JSON.stringify({ file: telemetry.TELEMETRY_FILE, events }, null, 2));
    return;
  }

  console.log(`\nPURPCLAW PIPELINE TELEMETRY (${events.length} events)`);
  console.log(`Log: ${telemetry.TELEMETRY_FILE}\n`);
  for (const event of events) {
    const time = String(event.at || '').slice(11, 19);
    const owner = event.service || event.component || 'system';
    const stage = event.stage || event.event || 'event';
    console.log(`${time}  ${String(event.status || 'info').padEnd(18)} ${String(owner).padEnd(24)} ${stage}`);
    if (event.reason || event.error) console.log(`          reason: ${event.reason || event.error}`);
    if (event.nextAction) console.log(`          next:   ${event.nextAction}`);
    if (event.workflowId) console.log(`          flow:   ${event.workflowId}`);
  }
  console.log('');
}

module.exports = { run };
