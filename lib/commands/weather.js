'use strict';
// CLI wrapper: purpclaw weather [system] [--json]  → lib/weatherman.js
async function run(args = []) {
  const { report } = require('../weatherman.js');
  const r = await report();
  if (args.includes('--json')) { console.log(JSON.stringify(r, null, 2)); return r; }
  require('../weatherman.js'); // printReport is internal; re-render minimal here
  const cond = { clear: '🟢 CLEAR', cloudy: '🟡 CLOUDY', storm: '🟠 STORM', red_alert: '🔴 RED ALERT' }[r.condition] || r.condition;
  console.log(`\nPURPCLAW SYSTEM WEATHER  ${r.generated_at}`);
  console.log(`  ${cond}  (${r.recommended_mode})  safe_to_build=${r.safe_to_build}`);
  console.log(`  ${r.summary}`);
  for (const w of r.warnings) console.log(`    [${w.severity}] ${w.area}: ${w.reason}`);
  console.log(`\n  ${r.duck}\n`);
  return r;
}
module.exports = { run };
