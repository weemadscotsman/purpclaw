'use strict';
/**
 * lib/training/personal-dataset.js — Personal Training Dataset Builder
 * ════════════════════════════════════════════════════════════════════
 *
 * Reads E:/training/user-feedback/*.ndjson — every correction, preference,
 * and edit the user has ever made — and converts them into training pairs
 * suitable for the LoRA pipeline.
 *
 * Two output formats:
 *   - ChatML: { messages: [{ role, content }, ...] }
 *   - ShareGPT: { conversations: [{ from, value }, ...] }
 *
 * Training pair types:
 *   CORRECTION:  user: (what agent did wrong)  → assistant: (what user wanted)
 *   PREFERENCE:  system: (user prefers X)       → user: (acknowledge)
 *   EDIT:        system: (user changed file)    → assistant: (acknowledge pattern)
 *
 * Usage:
 *   const pd = require('./lib/training/personal-dataset');
 *   const dataset = pd.build('chatml');          // all corrections + prefs
 *   const count = pd.count();                     // quick count without building
 *   const stats = pd.stats();                     // breakdown by type
 */

const fs = require('fs');
const path = require('path');

const FEEDBACK_DIR = process.env.PURPCLAW_FEEDBACK_DIR
  || path.join('E:', 'training', 'user-feedback');

// ── Load all feedback records ──────────────────────────────────────────────
function loadRecords() {
  const all = [];
  try {
    for (const f of fs.readdirSync(FEEDBACK_DIR)) {
      if (!f.endsWith('.ndjson')) continue;
      const lines = fs.readFileSync(path.join(FEEDBACK_DIR, f), 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try { all.push(JSON.parse(line)); } catch {}
      }
    }
  } catch {}
  return all;
}

// ── Count without building ─────────────────────────────────────────────────
function count() {
  const records = loadRecords();
  return {
    total: records.length,
    corrections: records.filter(r => r.type === 'correction').length,
    preferences: records.filter(r => r.type === 'preference').length,
    edits: records.filter(r => r.type === 'edit').length,
    prompts: records.filter(r => r.type === 'prompt').length,
    toolCalls: records.filter(r => r.type === 'tool_call').length,
  };
}

// ── Stats with readiness ───────────────────────────────────────────────────
function stats() {
  const c = count();
  return {
    ...c,
    readyForTraining: c.corrections + c.preferences + c.edits >= 3,
    trainingHint: (c.corrections + c.preferences + c.edits) >= 10
      ? `${c.corrections + c.preferences + c.edits} personal examples — ready for 'purpclaw lora train --personal'`
      : `Need ${10 - (c.corrections + c.preferences + c.edits)} more corrections/preferences to start personal training`,
    feedbackDir: FEEDBACK_DIR,
  };
}

// ── Build dataset ──────────────────────────────────────────────────────────
function build(format = 'chatml', minExamples = 3) {
  const records = loadRecords();

  if (format === 'chatml') {
    const examples = [];

    for (const r of records) {
      if (r.type === 'correction' && r.data.original && r.data.corrected) {
        examples.push({
          messages: [
            { role: 'user', content: r.data.original },
            { role: 'assistant', content: r.data.corrected },
          ],
          metadata: { type: 'correction', ts: r.ts },
        });
      }

      if (r.type === 'preference' && r.data.pattern) {
        examples.push({
          messages: [
            { role: 'system', content: `The user prefers: ${r.data.pattern}. Always follow this preference.` },
            { role: 'user', content: 'Understood. I will remember this preference.' },
          ],
          metadata: { type: 'preference', ts: r.ts },
        });
      }

      if (r.type === 'edit' && r.data.before && r.data.after && r.data.file) {
        examples.push({
          messages: [
            { role: 'system', content: `The user edited ${r.data.file}. Before: ${r.data.before.substring(0, 500)}` },
            { role: 'assistant', content: `After: ${r.data.after.substring(0, 500)}` },
          ],
          metadata: { type: 'edit', ts: r.ts },
        });
      }
    }

    if (examples.length < minExamples) return { examples, ready: false, reason: `Need ${minExamples - examples.length} more corrections/preferences` };
    return { examples, ready: true, count: examples.length };
  }

  if (format === 'sharegpt') {
    const conversations = [];

    for (const r of records) {
      if (r.type === 'correction' && r.data.original && r.data.corrected) {
        conversations.push({
          conversations: [
            { from: 'human', value: r.data.original },
            { from: 'gpt', value: r.data.corrected },
          ],
        });
      }
      if (r.type === 'preference' && r.data.pattern) {
        conversations.push({
          conversations: [
            { from: 'system', value: `User preference: ${r.data.pattern}` },
            { from: 'gpt', value: 'Preference acknowledged.' },
          ],
        });
      }
    }

    if (conversations.length < minExamples) return { examples: conversations, ready: false, reason: `Need ${minExamples - conversations.length} more` };
    return { examples: conversations, ready: true, count: conversations.length };
  }

  return { examples: [], ready: false, reason: `Unknown format: ${format}` };
}

// ── Export to file ─────────────────────────────────────────────────────────
function exportToFile(format = 'chatml') {
  const result = build(format);
  if (!result.ready) return result;

  const outPath = path.join(FEEDBACK_DIR, `personal-training-${format}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result.examples, null, 2), 'utf8');

  return { ...result, path: outPath };
}

module.exports = { loadRecords, count, stats, build, exportToFile, FEEDBACK_DIR };
