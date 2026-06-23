'use strict';
/**
 * lib/memory-consistency.js — Memory Consistency Checker
 * ════════════════════════════════════════════════════════════
 * One tool, one job: scan memory for inconsistencies.
 * Does NOT auto-delete or auto-fix — only detects and reports.
 *
 * Checks:
 *   duplicate facts     — same subject+predicate+object repeated
 *   contradictions      — same subject+predicate, opposite object/state
 *   self-reference loops— memory pointing to itself or circular chain
 *   temporal flips      — state changes too fast, impossible order
 *   confidence clashes  — low-confidence overriding high-confidence
 */

const fs = require('fs');
const path = require('path');

const PURP_DIR = path.resolve(__dirname, '..');
const LEDGER_FILE = path.join(PURP_DIR, 'agent_work', 'reliability-ledger.json');
const MEMORY_FILE = path.join(PURP_DIR, 'agent_work', 'memory.jsonl');

// ── Severity ──────────────────────────────────────────────────────
const SEVERITY = { CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };

// ── Normalize text for fuzzy comparison ───────────────────────────
function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function fuzzyMatch(a, b) {
  return normalize(a) === normalize(b);
}

// ── Read memory ───────────────────────────────────────────────────
function readMemory() {
  const facts = [];
  // Read from memory.jsonl if it exists
  if (fs.existsSync(MEMORY_FILE)) {
    try {
      const lines = fs.readFileSync(MEMORY_FILE, 'utf-8').split('\n').filter(Boolean);
      for (const line of lines) {
        try { facts.push(JSON.parse(line)); } catch {}
      }
    } catch {}
  }
  // Also check agent_work/mochi.json for emotional state
  try {
    const mochi = JSON.parse(fs.readFileSync(path.join(PURP_DIR, 'agent_work', 'mochi.json'), 'utf-8'));
    if (mochi) facts.push({ type: 'mochi_state', ...mochi });
  } catch {}
  return facts;
}

// ── Check 1: Duplicate facts ─────────────────────────────────────
function checkDuplicates(facts) {
  const findings = [];
  const seen = new Map();
  for (const fact of facts) {
    const key = `${fact.type || fact.subject || ''}|${fact.predicate || fact.action || ''}|${fact.object || fact.content || ''}`;
    const norm = normalize(key);
    if (norm.length < 3) continue;
    if (seen.has(norm)) {
      findings.push({
        severity: SEVERITY.HIGH,
        type: 'duplicate',
        affected: [seen.get(norm), fact.id || fact.timestamp || '?'],
        reason: `duplicate fact: "${(fact.content || fact.object || key).substring(0, 80)}"`,
        suggested_action: 'merge',
      });
    } else {
      seen.set(norm, fact.id || fact.timestamp || String(facts.indexOf(fact)));
    }
  }
  return findings;
}

// ── Check 2: Contradictions ───────────────────────────────────────
const CONTRADICTIONS = [
  { a: /online|up|healthy|running|alive|connected/i, b: /offline|down|dead|stopped|disconnected|unhealthy/i, label: 'online ↔ offline' },
  { a: /enable|enabled|on/i, b: /disable|disabled|off/i, label: 'enabled ↔ disabled' },
  { a: /success|succeed|passed|ok|complete/i, b: /fail|failed|error|crash|broken/i, label: 'success ↔ failure' },
  { a: /true|yes/i, b: /false|no/i, label: 'boolean flip' },
  { a: /^[0-9]+$/, b: /^[0-9]+$/, label: 'numeric conflict', numeric: true },
];

function checkContradictions(facts) {
  const findings = [];
  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < Math.min(facts.length, i + 50); j++) {
      const a = facts[i]; const b = facts[j];
      const aText = (a.content || a.object || a.predicate || '').toLowerCase();
      const bText = (b.content || b.object || b.predicate || '').toLowerCase();
      // Must share a subject
      const aSubj = normalize(a.subject || a.name || a.predicate || '');
      const bSubj = normalize(b.subject || b.name || b.predicate || '');
      if (aSubj.length < 3 || aSubj !== bSubj) continue;

      for (const rule of CONTRADICTIONS) {
        const aMatch = rule.a.test(aText);
        const bMatch = rule.b.test(bText);
        if (aMatch && bMatch) {
          findings.push({
            severity: SEVERITY.CRITICAL,
            type: 'contradiction',
            affected: [a.id || i, b.id || j],
            reason: `${rule.label}: fact #${i} "${aText.substring(0, 50)}" vs fact #${j} "${bText.substring(0, 50)}"`,
            suggested_action: 'verify',
          });
          break;
        }
        // Reverse
        const aMatchR = rule.b.test(aText);
        const bMatchR = rule.a.test(bText);
        if (aMatchR && bMatchR) {
          findings.push({
            severity: SEVERITY.CRITICAL,
            type: 'contradiction',
            affected: [a.id || i, b.id || j],
            reason: `${rule.label}: fact #${i} "${aText.substring(0, 50)}" vs fact #${j} "${bText.substring(0, 50)}"`,
            suggested_action: 'verify',
          });
          break;
        }
      }
    }
  }
  return findings;
}

// ── Check 3: Self-reference loops ─────────────────────────────────
function checkSelfReference(facts) {
  const findings = [];
  for (const fact of facts) {
    const text = (fact.content || fact.object || '').toLowerCase();
    const id = fact.id || fact.timestamp || '';
    // Direct self-reference: memory references its own ID
    if (id && text.includes(String(id).toLowerCase())) {
      findings.push({
        severity: SEVERITY.MEDIUM,
        type: 'self_reference',
        affected: [id],
        reason: `memory references itself: "${text.substring(0, 80)}"`,
        suggested_action: 'quarantine',
      });
    }
    // Circular: "this memory contains a reference to this memory"
    if (/(this|itself|self).*(memory|fact|entry|record).*(reference|point|link)/i.test(text)) {
      findings.push({
        severity: SEVERITY.MEDIUM,
        type: 'self_reference',
        affected: [id],
        reason: `potential circular reference: "${text.substring(0, 80)}"`,
        suggested_action: 'quarantine',
      });
    }
  }
  return findings;
}

// ── Check 4: Temporal flips ──────────────────────────────────────
function checkTemporalFlips(facts) {
  const findings = [];
  const stateChanges = [];
  for (const fact of facts) {
    const text = (fact.content || fact.object || fact.predicate || '').toLowerCase();
    const ts = fact.timestamp ? new Date(fact.timestamp).getTime() : 0;
    const subj = normalize(fact.subject || fact.name || '');
    if (!ts || subj.length < 3) continue;

    if (/online|up|healthy|running|alive/i.test(text)) stateChanges.push({ subj, state: 'online', ts });
    if (/offline|down|dead|stopped|disconnected/i.test(text)) stateChanges.push({ subj, state: 'offline', ts });
  }

  // Find rapid flips (< 500ms between online→offline→online)
  for (let i = 0; i < stateChanges.length - 2; i++) {
    const a = stateChanges[i], b = stateChanges[i + 1], c = stateChanges[i + 2];
    if (a.subj === b.subj && b.subj === c.subj) {
      if (a.state !== b.state && b.state !== c.state && a.state === c.state) {
        const gap1 = b.ts - a.ts;
        const gap2 = c.ts - b.ts;
        if (gap1 < 5000 && gap2 < 5000) {
          findings.push({
            severity: SEVERITY.MEDIUM,
            type: 'temporal_flip',
            affected: [a.subj],
            reason: `rapid state flips for "${a.subj}": ${a.state} → ${b.state} → ${c.state} within ${(gap1+gap2)/1000}s`,
            suggested_action: 'verify',
          });
        }
      }
    }
  }
  return findings;
}

// ── Check 5: Confidence clashes ───────────────────────────────────
function checkConfidenceClashes(facts) {
  const findings = [];
  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < Math.min(facts.length, i + 30); j++) {
      const a = facts[i], b = facts[j];
      const aSubj = normalize(a.subject || a.name || a.predicate || '');
      const bSubj = normalize(b.subject || b.name || b.predicate || '');
      if (aSubj.length < 3 || aSubj !== bSubj) continue;
      const aConf = a.confidence || 0;
      const bConf = b.confidence || 0;
      if (aConf > 0 && bConf > 0 && Math.abs(aConf - bConf) > 0.5) {
        const low = aConf < bConf ? a : b;
        const high = aConf < bConf ? b : a;
        findings.push({
          severity: SEVERITY.LOW,
          type: 'confidence_clash',
          affected: [low.id || i, high.id || j],
          reason: `low-confidence (${low.confidence}) fact overrides high-confidence (${high.confidence}) fact for "${aSubj}"`,
          suggested_action: 'demote',
        });
      }
    }
  }
  return findings;
}

// ── Main checker ──────────────────────────────────────────────────
function check() {
  const facts = readMemory();
  if (!facts.length) return { ok: true, findings: [], message: 'no memory facts to check' };

  const allFindings = [
    ...checkDuplicates(facts),
    ...checkContradictions(facts),
    ...checkSelfReference(facts),
    ...checkTemporalFlips(facts),
    ...checkConfidenceClashes(facts),
  ];

  const critical = allFindings.filter(f => f.severity === SEVERITY.CRITICAL).length;
  const high = allFindings.filter(f => f.severity === SEVERITY.HIGH).length;
  const ok = critical === 0 && high === 0;

  // Log to reliability ledger
  try {
    const ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
    ledger.memoryChecks = ledger.memoryChecks || [];
    ledger.memoryChecks.push({
      timestamp: new Date().toISOString(),
      totalFacts: facts.length,
      findings: allFindings.length,
      critical,
      high,
    });
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2));
  } catch {}

  return {
    ok,
    facts_scanned: facts.length,
    findings: allFindings,
    summary: `${allFindings.length} findings · ${critical} critical · ${high} high`,
    message: ok ? 'memory is consistent' : `${critical + high} issues require attention`,
  };
}

/** Quarantine a finding: mark it as quarantined, don't delete. */
function quarantine(findingIndex) {
  const facts = readMemory();
  if (findingIndex < 0 || findingIndex >= facts.length) return { ok: false, error: 'invalid index' };
  const fact = facts[findingIndex];
  fact.quarantined = true;
  fact.quarantinedAt = new Date().toISOString();
  // Write back
  try {
    const lines = facts.map(f => JSON.stringify(f)).join('\n');
    fs.writeFileSync(MEMORY_FILE, lines);
    return { ok: true, quarantined: fact.id || findingIndex };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { check, quarantine, readMemory, checkDuplicates, checkContradictions, checkSelfReference, checkTemporalFlips, checkConfidenceClashes };
