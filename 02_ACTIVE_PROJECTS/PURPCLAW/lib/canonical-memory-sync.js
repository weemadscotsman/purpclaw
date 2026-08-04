'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const mem = require('./memory-client');

const SOURCES = [
  {
    key: 'pool-memory',
    file: path.join('agent_work', 'pool', 'memory.jsonl'),
    importance: 0.62,
    type: 'pool_memory',
    content: row => row.content || row.summary || row.text || '',
  },
  {
    key: 'harness-lessons',
    file: path.join('agent_work', 'harness_lessons.jsonl'),
    importance: 0.78,
    type: 'harness_lesson',
    content: row => {
      const bits = [
        row.task || row.description ? `Task: ${row.task || row.description}` : '',
        row.goal ? `Goal: ${row.goal}` : '',
        row.success !== undefined ? `Success: ${row.success}` : '',
        row.agent ? `Agent: ${row.agent}` : '',
        row.text ? `Text: ${row.text}` : '',
        row.verdict ? `Verdict: ${row.verdict}` : '',
        row.verdictReason ? `Reason: ${row.verdictReason}` : '',
        row.outputPreview ? `Output: ${row.outputPreview}` : '',
      ].filter(Boolean);
      return bits.join('\n');
    },
  },
  {
    key: 'evolution-log',
    file: path.join('agent_work', 'evolution-log.jsonl'),
    importance: 0.82,
    type: 'evolution_research',
    content: row => {
      const bits = [
        row.topic ? `Topic: ${row.topic}` : '',
        row.status ? `Status: ${row.status}` : '',
        row.synthesis || '',
        row.error ? `Error: ${row.error}` : '',
      ].filter(Boolean);
      return bits.join('\n');
    },
  },
];

function fingerprint(sourceKey, row) {
  const content = row.content || row.summary || row.text || row.task || row.topic || row.synthesis || '';
  const derivedId = row.id
    || row.tickId
    || row.missionId
    || row.subtaskId
    || String(content).match(/\btick-\d+\b/)?.[0]
    || null;
  const stable = JSON.stringify({
    source: sourceKey,
    ts: derivedId ? null : (row.ts || row.timestamp || row.startedAt || row.completedAt || null),
    id: derivedId,
    content,
  });
  return crypto.createHash('sha256').update(stable).digest('hex').slice(0, 24);
}

function readJsonl(absPath) {
  if (!fs.existsSync(absPath)) return [];
  return fs.readFileSync(absPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, idx) => {
      try { return JSON.parse(line); }
      catch { return { _parse_error: true, _line: idx + 1, raw: line }; }
    });
}

function loadLedger(rootDir) {
  const ledgerPath = path.join(rootDir, 'agent_work', '.canonical-memory-sync.json');
  try {
    const data = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    return { ledgerPath, imported: new Set(data.imported || []) };
  } catch {
    return { ledgerPath, imported: new Set() };
  }
}

function saveLedger(ledgerPath, imported) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, JSON.stringify({
    updatedAt: new Date().toISOString(),
    imported: Array.from(imported).sort(),
  }, null, 2));
}

async function syncRecord(rootDir, sourceKey, row, opts = {}) {
  const source = SOURCES.find(s => s.key === sourceKey);
  if (!source) return { ok: false, skipped: true, reason: `unknown source: ${sourceKey}` };

  const content = source.content(row).trim();
  if (!content) return { ok: true, skipped: true, reason: 'empty content' };

  const { ledgerPath, imported } = loadLedger(rootDir);
  const id = fingerprint(source.key, row);
  if (imported.has(id)) {
    return { ok: true, skipped: true, reason: 'already imported', id, ledgerPath };
  }

  if (!opts.dryRun) {
    const memoryId = await mem.ingest(content.slice(0, 5000), {
      source: `canonical-sync:${source.key}`,
      importance: opts.importance ?? source.importance,
      type: opts.type || source.type,
      metadata: {
        canonical_sync_id: id,
        source_file: source.file,
        source_ts: row.ts || row.timestamp || row.startedAt || row.completedAt || null,
        ...(opts.metadata || {}),
      },
    });
    if (!memoryId) return { ok: false, failed: true, reason: 'memory ingest failed', id, ledgerPath };
    imported.add(id);
    saveLedger(ledgerPath, imported);
    return { ok: true, imported: true, id, memoryId, ledgerPath };
  }

  return { ok: true, dryRun: true, wouldImport: true, id, ledgerPath };
}

function markRecordSynced(rootDir, sourceKey, row) {
  const source = SOURCES.find(s => s.key === sourceKey);
  if (!source) return { ok: false, reason: `unknown source: ${sourceKey}` };
  const { ledgerPath, imported } = loadLedger(rootDir);
  const id = fingerprint(source.key, row);
  imported.add(id);
  saveLedger(ledgerPath, imported);
  return { ok: true, id, ledgerPath };
}

async function sync(rootDir, opts = {}) {
  const limit = Number.isFinite(opts.limit) ? opts.limit : Infinity;
  const dryRun = Boolean(opts.dryRun);
  const { ledgerPath, imported } = loadLedger(rootDir);
  const summary = {
    ok: true,
    dryRun,
    scanned: 0,
    candidates: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    sources: {},
    ledgerPath,
  };

  for (const source of SOURCES) {
    const absPath = path.join(rootDir, source.file);
    const rows = readJsonl(absPath);
    const sourceSummary = { scanned: rows.length, imported: 0, skipped: 0, failed: 0 };
    summary.scanned += rows.length;

    for (const row of rows) {
      const content = source.content(row).trim();
      if (!content) {
        sourceSummary.skipped++;
        summary.skipped++;
        continue;
      }

      const id = fingerprint(source.key, row);
      if (imported.has(id)) {
        sourceSummary.skipped++;
        summary.skipped++;
        continue;
      }

      summary.candidates++;
      if (summary.imported >= limit) break;

      if (!dryRun) {
        const result = await syncRecord(rootDir, source.key, row);
        if (!result.ok || result.failed) {
          sourceSummary.failed++;
          summary.failed++;
          continue;
        }
        if (result.skipped) {
          sourceSummary.skipped++;
          summary.skipped++;
          continue;
        }
        imported.add(id);
      } else {
        imported.add(id);
      }

      sourceSummary.imported++;
      summary.imported++;
    }

    summary.sources[source.key] = sourceSummary;
  }

  if (!dryRun) saveLedger(ledgerPath, imported);
  return summary;
}

module.exports = { sync, syncRecord, markRecordSynced, SOURCES };
