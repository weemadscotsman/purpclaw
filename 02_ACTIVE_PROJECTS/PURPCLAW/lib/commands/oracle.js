'use strict';
// CLI wrapper: purpclaw oracle [forecast] [--json]  → lib/oracle.js
async function run(args = []) {
  const { forecast } = require('../oracle.js');
  const r = await forecast();
  if (args.includes('--json')) { console.log(JSON.stringify(r, null, 2)); return r; }
  console.log(`\nPURPCLAW ORACLE — FORECAST  ${r.generated_at}`);
  console.log(`  weather: ${r.weather_condition}  ·  confidence: ${r.confidence}  ·  severity: ${r.severity}`);
  r.forecasts.forEach((f, i) => {
    console.log(`\n  ${i === 0 ? '▶' : ' '} [p=${f.confidence}] ${f.forecast}`);
    console.log(`     → next: ${f.recommended_next_action}`);
    if (f.avoid && f.avoid.length) console.log(`     ✗ avoid: ${f.avoid.join('; ')}`);
  });
  console.log(`\n  ${r.duck}\n`);
  return r;
}
module.exports = { run };
