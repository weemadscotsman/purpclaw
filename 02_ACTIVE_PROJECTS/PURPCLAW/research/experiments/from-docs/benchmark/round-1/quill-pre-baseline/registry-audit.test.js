'use strict';
/**
 * Smoke test for lib/commands/registry-audit.js
 * Verifies the audit runs without crashing on the real repo, produces
 * a valid JSON report, and surfaces at least the critical drift finding.
 *
 * Run: node --check lib/__tests__/registry-audit.test.js
 *      node lib/__tests__/registry-audit.test.js
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const auditModule = require(path.join(ROOT, 'lib', 'commands', 'registry-audit.js'));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}: ${detail || 'FAILED'}`);
  }
}

console.log('Registry Audit Smoke Test');
console.log('==========================');

// Test 1: runAudit completes without throwing
let audit;
try {
  audit = auditModule.runAudit({ root: ROOT });
  check('runAudit() does not throw', true);
} catch (e) {
  check('runAudit() does not throw', false, e.message);
  process.exit(1);
}

// Test 2: audit has required top-level fields
check('audit has services', !!audit.services, 'no services section');
check('audit has skills', !!audit.skills, 'no skills section');
check('audit has models', !!audit.models, 'no models section');
check('audit has recommendations', Array.isArray(audit.recommendations), 'no recommendations array');
check('audit has risk_summary', !!audit.risk_summary, 'no risk_summary');
check('audit started_at is ISO string', /^\d{4}-\d{2}-\d{2}T/.test(audit.started_at || ''), audit.started_at);
check('audit ended_at is ISO string', /^\d{4}-\d{2}-\d{2}T/.test(audit.ended_at || ''), audit.ended_at);

// Test 3: audit caught the critical skills registry drift
check('CRITICAL drift finding present (skills registry vs filesystem)',
  audit.recommendations.some(r => r.severity === 'CRITICAL' && r.area === 'skills'),
  'no CRITICAL skills finding'
);
check('risk_summary.verdict is CRITICAL_DRIFT (or better)',
  ['CRITICAL_DRIFT', 'HIGH_DRIFT', 'REVIEW_RECOMMENDED', 'CLEAN'].includes(audit.risk_summary.verdict),
  audit.risk_summary.verdict
);

// Test 4: report was written to disk
const reportPath = path.join(ROOT, 'lib', 'reports', 'registry-audit.json');
check('report written to disk', fs.existsSync(reportPath), reportPath);
if (fs.existsSync(reportPath)) {
  const stat = fs.statSync(reportPath);
  check('report is non-empty JSON file', stat.size > 100, `size=${stat.size}`);
}

// Test 5: human-readable print does not throw
try {
  // Capture stdout instead of printing
  const orig = console.log;
  let captured = '';
  console.log = (...args) => { captured += args.join(' ') + '\n'; };
  auditModule.printHuman(audit);
  console.log = orig;
  check('printHuman() runs without throw', true);
  check('printHuman() mentions verdict', /verdict/i.test(captured), 'no verdict line');
  check('printHuman() mentions READ-ONLY', /read-only/i.test(captured), 'no READ-ONLY line');
} catch (e) {
  check('printHuman() runs without throw', false, e.message);
}

// Test 6: Hivemind trace was recorded (proves the audit becomes evidence)
if (audit.hivemind_trace && !audit.hivemind_trace.error) {
  check('Hivemind trace recorded (audit becomes evidence)', true);
  check('Hivemind trace has run_id', !!audit.hivemind_trace.run_id);
  check('Hivemind trace has spring rank', Number.isFinite(audit.hivemind_trace.spring_rank));
  check('Hivemind trace has trust score', Number.isFinite(audit.hivemind_trace.trust_score));
} else {
  check('Hivemind trace recorded (audit becomes evidence)', false, audit.hivemind_trace && audit.hivemind_trace.error);
}

console.log('');
console.log(`Result: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);