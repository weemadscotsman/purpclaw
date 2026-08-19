'use strict';
/**
 * lib/steering-sources.js — real steering source discovery (Phase 3).
 *
 * Replaces the hardcoded-source illusion in the resolver: at resolve time we
 * actually read the canonical source files from disk, compute checksums, load
 * `.steering/` record files, and honour validity windows + supersession.
 *
 * Discovery is read-only and failure-tolerant: a missing or unreadable source
 * is reported in the manifest as absent, never silently treated as loadable.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Canonical prose sources referenced by the built-in index. They are
// checksummed so a capsule can prove WHICH version of the law it saw.
const CANONICAL_FILES = [
  { ref: 'AGENTS.md', file: 'AGENTS.md' },
  { ref: 'USER.md', file: 'USER.md' },
  { ref: 'PURPCLAW_STEERING_RESOLVER_CONTRACT.md', file: 'PURPCLAW_STEERING_RESOLVER_CONTRACT.md' },
  { ref: 'PURPCLAW_AUTONOMOUS_EXECUTION_CONTRACT.md', file: 'PURPCLAW_AUTONOMOUS_EXECUTION_CONTRACT.md' },
  { ref: 'PURPCLAW_EPHEMERAL_RUNTIME_SPEC.md', file: 'PURPCLAW_EPHEMERAL_RUNTIME_SPEC.md' },
];

const STEERING_DIR = '.steering';

function sha256(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function checksumFile(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return null;
    const content = fs.readFileSync(file, 'utf8');
    return {
      checksum: sha256(content),
      bytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Load one `.steering/` record file. A record file is JSON with either a
 * single record object or a { records: [...] } array. Each record:
 *   id, rule (required); effect, authority, field, appliesTo, condition,
 *   validFrom, validUntil, supersedes (optional).
 * Returns { items, sources } — items are resolver-shaped, sources carry
 * per-file checksums.
 */
function loadSteeringRecords(steeringDir, now = new Date()) {
  const items = [];
  const sources = [];
  if (!fs.existsSync(steeringDir)) return { items, sources };

  const files = fs.readdirSync(steeringDir).filter(f => f.endsWith('.json')).sort();
  const byId = new Map();

  for (const f of files) {
    const full = path.join(steeringDir, f);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      sources.push({ sourceRef: `.steering/${f}`, present: true, parseError: e.message });
      continue;
    }
    const records = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.records) ? parsed.records : [parsed]);
    const sourceRef = `.steering/${f}`;
    const ck = checksumFile(full);
    sources.push({
      sourceRef,
      present: true,
      checksum: ck && ck.checksum,
      bytes: ck && ck.bytes,
      modifiedAt: ck && ck.modifiedAt,
      recordCount: records.length,
    });
    for (const r of records) {
      if (!r || !r.id || !r.rule) continue;
      byId.set(r.id, { ...r, _sourceRef: sourceRef });
    }
  }

  const nowMs = now.getTime();
  // Validity windows — an expired / not-yet-valid record is never active.
  const live = [];
  for (const rec of byId.values()) {
    if (rec.validFrom && new Date(rec.validFrom).getTime() > nowMs) continue;
    if (rec.validUntil && new Date(rec.validUntil).getTime() < nowMs) continue;
    live.push(rec);
  }
  // Supersession: a live record replaces the record it names.
  const superseded = new Set();
  for (const rec of live) {
    if (rec.supersedes && live.some(r => r.id === rec.supersedes)) {
      superseded.add(rec.supersedes);
    }
  }
  for (const rec of live) {
    if (superseded.has(rec.id)) continue;
    items.push({
      id: rec.id,
      scope: rec.scope || 'workspace',
      authority: rec.authority, // resolver applies its own default when falsy
      sourceType: 'workspace-steering-record',
      effect: rec.effect,
      appliesTo: rec.appliesTo || ['planning', 'tool-routing'],
      field: rec.field || 'general',
      condition: rec.condition || null,
      rule: rec.rule,
      // Preserve the operator's explicit block list. This was being dropped, so
      // a record declaring forbidTools got NO deterministic enforcement — it
      // only blocked when the tool name happened to appear in the rule prose.
      // forbidTools is the enforcement path (steering-resolver applyToAction).
      forbidTools: Array.isArray(rec.forbidTools) ? rec.forbidTools : undefined,
      source: rec._sourceRef,
      mandatory: rec.mandatory !== false,
      conflictsWith: rec.conflictsWith || [],
    });
  }
  return { items, sources };
}

/**
 * Discover all steering sources under a project root.
 * @param {string} rootDir project root (defaults to the PurpClaw install dir)
 * @returns {{ items: object[], sources: object[], scope: object }}
 */
function discover(rootDir) {
  const root = rootDir || path.resolve(__dirname, '..');
  const sources = [];
  const items = [];

  for (const { ref, file } of CANONICAL_FILES) {
    const full = path.join(root, file);
    const ck = checksumFile(full);
    sources.push({
      sourceRef: ref,
      present: !!ck,
      checksum: ck && ck.checksum,
      bytes: ck && ck.bytes,
      modifiedAt: ck && ck.modifiedAt,
    });
  }

  const rec = loadSteeringRecords(path.join(root, STEERING_DIR));
  items.push(...rec.items);
  sources.push(...rec.sources);

  const scope = {
    root,
    steeringDir: path.join(root, STEERING_DIR),
    discoveredAt: new Date().toISOString(),
    canonicalFilesChecked: CANONICAL_FILES.length,
    canonicalFilesPresent: sources.filter(s => s.present && !s.sourceRef.startsWith('.steering/')).length,
    recordFiles: rec.sources.length,
    activeRecords: items.length,
  };
  return { items, sources, scope };
}

module.exports = { discover, loadSteeringRecords, CANONICAL_FILES, STEERING_DIR };
