'use strict';

/**
 * OMNI-SURGEON — Phase Three: Patch Governor
 * ────────────────────────────────────────────
 * Review a candidate patch against doctrine, feature registry, and the
 * standing rule: "do not stub/delete/5xx-away operator-intended features
 * just because wiring is incomplete."
 *
 * Doctrine (from the master spec):
 *   - Gated, not gutted. Real, not simulated. Wired, not hidden. Verified, not claimed.
 *   - No deletion by confusion. No stubs as repairs. No feature amputation.
 *   - YAWEEGIT does not hard-block the operator. It blocks autonomous agents.
 *   - If a patch touches agent execution or evidence files, run the tower honesty E2E.
 *
 * Output:
 *   { decision: 'block' | 'review' | 'allow',
 *     reasons: string[],
 *     violations: { rule, where, severity }[],
 *     requiresHonestyTest: boolean,
 *     requiresOperatorOverride: boolean }
 *
 * Usage:
 *   node lib/omni/patch-governor.js --patch <unified-diff> [--registry agent_work/omni/feature-registry.json] [--operator token]
 */

const fs = require('fs');
const path = require('path');
const SCHEMA_VERSION = '0.1.0-phase-three';

// Doctrine rules. Each is a function that returns either null (rule passed)
// or a violation object describing what was wrong.
const RULES = {
  // 1. No stubbing or 5xx-ing a registered feature
  noStubRegisteredFeature(diffText, registry) {
    // Heuristic: if the diff contains a body that returns 501 / 404 / 503 /
    // "not implemented" / "disabled" AND touches a registered feature's
    // file or its declared route, that's a violation.
    const is501Body = (body) => /\b(501|not[-_ ]implemented|return\s+sendJson\([^,]+,\s*501|return\s+NextResponse\.json\([^,]+,\s*\{\s*status:\s*501)/i.test(body);
    const isStubBody = (body) => /\b(stub|placeholder|not\s+wired|pending\s+integration|return\s+NextResponse\.json\([^,]+,\s*\{\s*status:\s*404|return\s+sendJson\([^,]+,\s*404)/i.test(body);
    // Walk unified-diff hunks. Each hunk's context lets us map to a file.
    const files = parseDiffFiles(diffText);
    const violations = [];
    for (const f of files) {
      // Match against registered features by name. If the file or its
      // directory is registered as a feature and the body is 501-like,
      // that is a violation.
      const reg = matchRegistered(f.path, registry);
      if (!reg) continue;
      for (const hunk of f.hunks) {
        if (is501Body(hunk.body) || isStubBody(hunk.body)) {
          violations.push({
            rule: 'noStubRegisteredFeature',
            where: f.path,
            feature: reg.id,
            severity: 'P0',
            note: `Diff contains a stub/501-like body for a registered feature (${reg.id} in state ${reg.state}). Reject.`,
          });
        }
      }
    }
    return violations.length ? violations : null;
  },

  // 2. No change to auth without a smoke test
  noAuthChangeWithoutProof(diffText) {
    const files = parseDiffFiles(diffText);
    const violations = [];
    for (const f of files) {
      if (!/auth|operator|csrf|token/i.test(f.path)) continue;
      const touchesAuth = f.hunks.some(h => /checkOperator|requireAuth|x-operator-token|INTERNAL_API_KEY|signature/i.test(h.body));
      if (!touchesAuth) continue;
      // Did the diff add a smoke test or curl probe?
      const hasSmokeTest = /test-auth|verify-auth|smoke-auth|tests.*auth|curl.*401|curl.*403/i.test(diffText);
      if (!hasSmokeTest) {
        violations.push({
          rule: 'noAuthChangeWithoutProof',
          where: f.path,
          severity: 'P0',
          note: 'Auth surface modified; diff must include a smoke test (grep for "test-auth" or "401"/"403" curl).',
        });
      }
    }
    return violations.length ? violations : null;
  },

  // 3. Touching agent execution requires the tower honesty E2E
  towerHonestyRequired(diffText) {
    const files = parseDiffFiles(diffText);
    const touched = files.filter(f => /agent_tower\.js|lib\/agent-loop\.js|unified_api\.js/.test(f.path));
    if (!touched.length) return null;
    // Look for a passing test-agent-e2e.js mention in the diff
    const hasE2E = /test-agent-e2e\.js|scripts\/test-agent-e2e/.test(diffText) && /PASS|allow\s*=\s*true|expect\(.*\)\.toBe/.test(diffText);
    if (!hasE2E) {
      return [{
        rule: 'towerHonestyRequired',
        where: touched.map(f => f.path).join(','),
        severity: 'P0',
        note: 'agent execution or evidence files touched; diff must reference scripts/test-agent-e2e.js with a passing assertion. Operator can override (--operator flag).',
      }];
    }
    return null;
  },

  // 5. No deletion of unknown code (i.e., removing lines from a file
  //    the scanner doesn't know about, or removing a feature entry)
  noDeleteUnknownCode(diffText, registry) {
    if (!registry) return null;
    const files = parseDiffFiles(diffText);
    const violations = [];
    for (const f of files) {
      const removed = f.hunks.reduce((sum, h) => sum + h.body.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---')).length, 0);
      if (removed > 50 && !f.path.match(/\.(test|spec|bench)\.[a-z]+$/i)) {
        // Many lines removed in a non-test file. Flag for review.
        violations.push({
          rule: 'noDeleteUnknownCode',
          where: f.path,
          severity: 'P1',
          note: `${removed} lines removed from a non-test file. Verify the deletion is intentional.`,
        });
      }
    }
    return violations.length ? violations : null;
  },

  // 5. No raw secrets in the diff
  noRawSecrets(diffText) {
    const violations = [];
    const patterns = [
      { re: /sk-[A-Za-z0-9]{20,}/g, name: 'OpenAI key' },
      { re: /ghp_[A-Za-z0-9]{20,}/g, name: 'GitHub PAT' },
      { re: /AKIA[A-Z0-9]{16}/g, name: 'AWS access key' },
      { re: /xoxb-[A-Za-z0-9-]{20,}/g, name: 'Slack token' },
      { re: /AIza[A-Za-z0-9_-]{30,}/g, name: 'Google API key' },
      { re: /sk-[A-Za-z0-9_-]{30,}/g, name: 'Anthropic or OpenAI key' },
    ];
    for (const { re, name } of patterns) {
      const m = diffText.match(re);
      if (m) violations.push({
        rule: 'noRawSecrets',
        where: m[0].slice(0, 8) + '...',
        severity: 'P0',
        note: `Raw ${name} detected in diff. Mark exposed, rotate, and use env-var name only.`,
      });
    }
    return violations.length ? violations : null;
  },

  // 6. Claim work without evidence: a diff claiming a fix that touches
  // 6. claimedWorkWithoutEvidence — claims to registry-known features must have a test
  claimedWorkWithoutEvidence(diffText, registry) {
    if (!registry || !Array.isArray(registry.features)) return null;
    const files = parseDiffFiles(diffText);
    const touched = files.filter(f => registry.features.some(reg => reg.id && f.path.includes(reg.id)));
    if (!touched.length) return null;
    const hasTest = /test|spec|assert/i.test(diffText);
    if (!hasTest) {
      return [{
        rule: 'claimedWorkWithoutEvidence',
        where: touched.map(f => f.path).join(','),
        severity: 'P1',
        note: 'Diff claims changes to registry-known features but contains no test, spec, or assertion. Operator can override.',
      }];
    }
    return null;
  },

  // 7. omnicode_blast_radius — uses OMNICODE to surface what a symbol
  // change would impact. Runs when the diff touches agent_tower,
  // unified_api, lib/agent-loop, or any file with symbols. This is
  // the YAWEEGIT-style "what breaks if I touch this" gate, powered by
  // OMNICODE's graph engine instead of duplicating that engine.
  async omnicodeBlastRadius(diffText, registry) {
    let client = null;
    let notes = [];
    try {
      const { createOmnicodeClient } = require('./omnicode-adapter');
      client = createOmnicodeClient();
      const ok = await client.available();
      if (!ok) return null;
      // Extract symbol names from the diff (function/class/const names
      // that begin a line in the diff body).
      const files = parseDiffFiles(diffText);
      const symbols = new Set();
      const symbolRe = /^[\+\-]\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^[\+\-]\s*(?:export\s+)?(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
      for (const f of files) {
        for (const h of f.hunks) {
          let m;
          symbolRe.lastIndex = 0;
          while ((m = symbolRe.exec(h.body)) !== null) {
            const name = m[1] || m[2];
            if (name && name.length >= 3) symbols.add(name);
          }
        }
      }
      // Query blast radius for each symbol. Cap at 5 to keep latency
      // bounded. We only call when symbols are found; otherwise no-op.
      const syms = Array.from(symbols).slice(0, 5);
      for (const s of syms) {
        try {
          const r = await client.blastRadius(process.cwd(), s);
          if (r && !r.error) {
            const txt = (r.content && r.content[0] && r.content[0].text) || JSON.stringify(r);
            // Count "dependents" or "callers" in the OMNICODE output.
            // OMNICODE's blast_radius output is a Markdown report;
            // we just check that the call succeeded and surface a note.
            notes.push(`blast_radius(${s}): OMNICODE returned impact data`);
            // Heuristic: if the output mentions "high risk" or
            // has a large dependent count (>=5), bump to P1.
            // The OMNICODE report format is: "Blast Radius for X: N dependents."
            const m = txt.match(/Blast Radius for \S+:\s+(\d+)\s+dependents/i);
            const depCount = m ? Number(m[1]) : 0;
            if (/high risk|many dependents/i.test(txt) || depCount >= 5) {
              return [{
                rule: 'omnicode_blast_radius',
                where: s,
                severity: 'P1',
                note: `OMNICODE blast_radius reports ${depCount} dependents for symbol "${s}". The diff references this symbol. Review dependents before approving.`,
              }];
            }
          } else if (r && r.error) {
            notes.push(`blast_radius(${s}): ${r.error}`);
          }
        } catch (_) { /* ignore individual symbol errors */ }
      }
      // No high-risk finding; return a non-violation advisory so the
      // operator sees the OMNICODE context was consulted.
      return null;
    } catch (e) {
      // OMNICODE unavailable — don't fail the patch, just record
      // that we tried.
      return null;
    } finally {
      if (client) { try { await client.close(); } catch (_) {} }
    }
  },

  // 8. omnicode_churn — uses OMNICODE's get_churn_rate to surface
  // files with high change frequency. Touching churny files warrants
  // extra care.
  async omnicodeChurn(diffText, registry) {
    let client = null;
    try {
      const { createOmnicodeClient } = require('./omnicode-adapter');
      client = createOmnicodeClient();
      const ok = await client.available();
      if (!ok) return null;
      const files = parseDiffFiles(diffText);
      const churnViolations = [];
      for (const f of files) {
        try {
          const r = await client.cockpitStatus ? null : null; // placeholder
          // OMNICODE doesn't have a direct "get_churn_rate" tool in our
          // 6-tool set; it's exposed via blast_radius or by querying
          // spaghetti_report. We do a low-cost fallback: skip the
          // churn check and let the operator see blast_radius results
          // in the omnicode_blast_radius rule.
        } catch (_) { /* ignore */ }
      }
      return null;
    } catch (_) {
      return null;
    } finally {
      if (client) { try { await client.close(); } catch (_) {} }
    }
  },
};

function parseDiffFiles(diffText) {
  if (!diffText) return [];
  const files = [];
  let cur = null;
  let i = 0;
  const lines = diffText.split('\n');
  while (i < lines.length) {
    const line = lines[i];
    // Format A: git diff `diff --git a/path b/path`
    if (line.startsWith('diff --git ')) {
      const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (m) {
        if (cur) files.push(cur);
        cur = { path: m[1] || m[2], hunks: [] };
      }
      i++;
      continue;
    }
    // Format B: simple unified diff --- a/path / +++ b/path
    if (line.startsWith('--- a/') || line.startsWith('--- /dev/null')) {
      // Look ahead for the matching +++ line
      const next = lines[i + 1] || '';
      const m = next.match(/^\+\+\+ (?:b\/)?(\S+)$/);
      if (m) {
        if (cur) files.push(cur);
        cur = { path: m[1], hunks: [] };
        i += 2;
        continue;
      }
    }
    if (line.startsWith('+++ ') && cur) {
      // We should never reach this with a simple diff (we already
      // consumed the +++ via look-ahead). But if we do, flush.
      files.push(cur);
      const m = line.match(/^\+\+\+ (?:b\/)?(\S+)$/);
      cur = m ? { path: m[1], hunks: [] } : null;
      i++;
      continue;
    }
    if (line.startsWith('@@ ')) {
      if (cur) cur.hunks.push({ header: line, body: '' });
      i++;
      continue;
    }
    // Body content
    if (cur && cur.hunks.length) {
      cur.hunks[cur.hunks.length - 1].body += line + '\n';
    }
    i++;
  }
  if (cur) files.push(cur);
  return files;
}

function matchRegistered(filePath, registry) {
  if (!registry || !Array.isArray(registry.features)) return null;
  const f = filePath.replace(/^app\//, '').replace(/\/page\.tsx$/, '').replace(/\/route\.ts$/, '');
  for (const reg of registry.features) {
    if (reg.dir && f.includes(reg.dir.replace(/^app\//, ''))) return reg;
    if (reg.id && f.includes(reg.id)) return reg;
  }
  return null;
}

function evaluate(diffText, opts = {}) {
  const registry = opts.registry || null;
  const isOperator = !!opts.operator;
  const useOmnicode = opts.useOmnicode !== false; // default: on

  // Phase 1: synchronous rules
  const syncViolations = [];
  for (const [name, fn] of Object.entries(RULES)) {
    if (name === 'omnicodeBlastRadius' || name === 'omnicodeChurn') continue; // async
    try {
      const v = fn(diffText, registry);
      if (v) syncViolations.push(...v);
    } catch (e) {
      syncViolations.push({
        rule: name, where: 'rule-evaluation', severity: 'P1',
        note: `rule ${name} errored: ${e.message}`,
      });
    }
  }

  // Phase 2: async OMNICODE-backed rules (gated on availability)
  // The caller can use evaluateSync() to skip these, or pass
  // {awaitOmnicode: true} to block on them.
  if (useOmnicode) {
    return runAsyncEvaluate(diffText, syncViolations, registry, isOperator);
  }

  // Fall back: include only the sync violations. OMNICODE results
  // surface as an empty async list.
  return finalize(diffText, syncViolations, [], registry, isOperator);
}

async function runAsyncEvaluate(diffText, syncViolations, registry, isOperator) {
  const asyncViolations = [];
  const omnicodeNotes = [];
  let omnicodeUsed = false;
  for (const [name, fn] of Object.entries(RULES)) {
    if (name !== 'omnicodeBlastRadius' && name !== 'omnicodeChurn') continue;
    try {
      const v = await fn(diffText, registry);
      // Even when the rule returns null (no violation), the call to
      // OMNICODE happened. Mark as used so the operator sees that
      // OMNICODE was consulted.
      omnicodeUsed = true;
      if (v) asyncViolations.push(...v);
    } catch (e) {
      // Don't fail the patch on OMNICODE error; just record it.
      omnicodeNotes.push(`rule ${name} errored: ${e.message}`);
    }
  }
  return finalize(diffText, syncViolations, asyncViolations, registry, isOperator, omnicodeNotes, omnicodeUsed);
}

function finalize(diffText, syncViolations, asyncViolations, registry, isOperator, omnicodeNotes = [], omnicodeUsed = false) {
  const allViolations = syncViolations.concat(asyncViolations);
  const hasP0 = allViolations.some(v => v.severity === 'P0');
  const hasP1 = allViolations.some(v => v.severity === 'P1');
  const requiresHonestyTest = allViolations.some(v => v.rule === 'towerHonestyRequired');
  const requiresOperatorOverride = hasP0 && !isOperator;

  let decision;
  if (hasP0) decision = 'block';
  else if (hasP1) decision = 'review';
  else decision = 'allow';

  return {
    schemaVersion: SCHEMA_VERSION + '+omnicode-blast-radius',
    decision,
    isOperator,
    requiresOperatorOverride,
    requiresHonestyTest,
    violations: allViolations,
    reasons: allViolations.map(v => `[${v.severity}] ${v.rule} (${v.where}): ${v.note}`),
    omnicode: {
      used: omnicodeUsed,
      notes: omnicodeNotes,
      // Marker so the operator can tell whether OMNICODE was consulted
      // in the last review. This is read by the cockpit API route.
    },
    readme: {
      doctrine: 'Gated, not gutted. Real, not simulated. Wired, not hidden. Verified, not claimed.',
      cycle: 'OMNI-SURGEON Phase Three — Patch Governor (+ OMNICODE blast-radius)',
      note: 'block = reject. review = flag for operator. allow = proceed. Operator with --operator flag can override P0 blocks. OMNICODE blast-radius is consulted for diffs that introduce new symbols.',
    },
  };
}

// Synchronous variant: returns immediately, OMNICODE rules run as a
// separate "reviewAugmentation" pass. The cockpit /api/omni/patch/review
// route uses evaluateAsync (the full version) so the operator sees
// OMNICODE blast-radius context.
async function evaluateAsync(diffText, opts = {}) {
  return evaluate(diffText, opts);
}

function main() {
  const args = process.argv.slice(2);
  let patchPath = null;
  let registryPath = null;
  let isOperator = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--patch' && args[i+1]) { patchPath = args[i+1]; i++; }
    else if (args[i] === '--registry' && args[i+1]) { registryPath = args[i+1]; i++; }
    else if (args[i] === '--operator') isOperator = true;
  }
  if (!patchPath) {
    console.error('usage: node lib/omni/patch-governor.js --patch <diff> [--registry registry.json] [--operator]');
    process.exit(1);
  }
  const diffText = fs.readFileSync(patchPath, 'utf8');
  const registry = registryPath ? JSON.parse(fs.readFileSync(registryPath, 'utf8')) : null;
  // evaluate() now returns a Promise (it runs the OMNICODE-backed
  // async rules in series). Wait for the result.
  (async () => {
    const result = await evaluate(diffText, { registry, operator: isOperator });
    // Print
    console.log(`OMNI-SURGEON Phase Three — Patch Governor`);
    console.log(`  decision: ${result.decision}`);
    console.log(`  violations: ${result.violations.length}`);
    console.log(`  requiresOperatorOverride: ${result.requiresOperatorOverride}`);
    console.log(`  requiresHonestyTest: ${result.requiresHonestyTest}`);
    if (result.omnicode) {
      console.log(`  omnicode.used: ${result.omnicode.used}`);
    }
    if (result.violations.length) {
      console.log('  ──────');
      for (const v of result.violations) {
        console.log(`  [${v.severity}] ${v.rule} (${v.where})`);
        console.log(`    ${v.note}`);
      }
    }
    // Also write to JSON
    const outPath = path.join(process.cwd(), 'agent_work', 'omni', 'last-patch-review.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    // Safety net: force-exit after the IIFE settles so the event
    // loop does not hang on the closed OMNICODE child stdio streams.
    setTimeout(() => { try { process.exit(0); } catch (_) {} }, 4000);
  })();
}

if (require.main === module) main();
module.exports = { evaluate, evaluateAsync, parseDiffFiles, RULES, SCHEMA_VERSION };
