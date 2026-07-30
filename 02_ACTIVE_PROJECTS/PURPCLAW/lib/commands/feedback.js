'use strict';

/**
 * lib/commands/feedback.js
 * purpclaw feedback — Personal model feedback CLI
 *
 * Codex parity: codex feedback submit/status/list/export
 * Engine: lib/user-feedback.js (FeedbackService with captureSubmit/list/export)
 * Storage: E:/training/user-feedback/YYYY-MM-DD.ndjson
 */

const path = require('path');
const fs   = require('fs');

const FEEDBACK = (() => {
  try { return require(path.join(__dirname, '..', 'user-feedback')); } catch { return null; }
})();

async function run(args, ctx = {}) {
  if (!FEEDBACK) {
    console.log('error: user-feedback not available');
    return 1;
  }

  const sub  = (args[0] || 'status').toLowerCase();
  const json = args.includes('--json');

  // ── feedback status ─────────────────────────────────────────────────────
  if (sub === 'status' || sub === 'stats') {
    const st = FEEDBACK.status();
    if (json) {
      console.log(JSON.stringify(st, null, 2));
    } else {
      const s = st.stats;
      console.log(`\nFEEDBACK — Personal Model Growth`);
      console.log(`  Directory: ${st.feedbackDir}`);
      console.log(`  Session:   ${st.sessionId.slice(0, 8)}…`);
      console.log(`  Status:    ${st.enabled ? 'ACTIVE' : 'DISABLED'}`);
      console.log(`\n  Records:      ${s.total.toLocaleString()}`);
      console.log(`  Sessions:    ${s.sessions.toLocaleString()}`);
      console.log(`  Corrections: ${s.corrections.toLocaleString()}`);
      console.log(`  Preferences: ${s.preferences.toLocaleString()}`);
      console.log(`\n  Ready for training: ${st.readyForTraining ? '✓ YES' : `✗ need ${10 - s.corrections} more corrections`}`);
      if (st.recentFiles.length) {
        console.log(`\n  Recent files:`);
        for (const f of st.recentFiles) {
          console.log(`    ${f.file.padEnd(14)} ${f.lines.toLocaleString().padStart(6)} records  ${(f.size/1024).toFixed(1)}kb`);
        }
      }
      console.log('');
    }
    return;
  }

  // ── feedback submit <type> <message> ─────────────────────────────────────
  if (sub === 'submit' || sub === 'send') {
    const type    = args[1] || 'bug_report';
    const comment = args.slice(2).join(' ');
    if (!comment) {
      console.log('usage: purpclaw feedback submit <bug_report|feature_request|performance_issue|other> <message> [--json]');
      return 1;
    }
    try {
      FEEDBACK.captureFeedback(3, `${type}: ${comment}`);
      console.log(json
        ? JSON.stringify({ ok: true, type, sessionId: FEEDBACK.status().sessionId })
        : '✓ feedback recorded');
    } catch (e) {
      console.log(json ? JSON.stringify({ ok: false, error: e.message }) : `error: ${e.message}`);
    }
    return;
  }

  // ── feedback list [--limit N] [--type TYPE] ────────────────────────────
  if (sub === 'list' || sub === 'ls') {
    const limitArg = args.includes('--limit') ? args[args.indexOf('--limit') + 1] : '20';
    const limit    = Math.min(parseInt(limitArg) || 20, 200);
    const typeArg  = args.includes('--type')   ? args[args.indexOf('--type')   + 1] : null;
    const st       = FEEDBACK.status();
    const allFiles = [...st.recentFiles].reverse(); // newest first
    const records  = [];

    for (const f of allFiles) {
      const filePath = path.join(st.feedbackDir, f.file);
      try {
        const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
        for (const line of lines.reverse()) {
          try {
            const rec = JSON.parse(line);
            if (typeArg && rec.type !== typeArg) continue;
            records.push(rec);
            if (records.length >= limit) break;
          } catch { /* skip malformed lines */ }
        }
        if (records.length >= limit) break;
      } catch { /* skip unreadable files */ }
    }

    if (json) {
      console.log(JSON.stringify({ records, total: records.length }, null, 2));
    } else {
      if (!records.length) {
        console.log('No feedback records found.'); return;
      }
      console.log(`\nFEEDBACK RECORDS  (showing ${records.length})\n`);
      for (const r of records) {
        const ts  = r.ts ? r.ts.slice(0, 16) : '?';
        const ctx = r.context || {};
        console.log(`  [${(r.type || '?').padEnd(12)}] ${ts}  ${ctx.model || '?'}  ${ctx.provider || '?'}`);
        if (r.data) {
          const d = r.data;
          if (d.rating)   console.log(`    rating: ${d.rating}/5`);
          if (d.comment)  console.log(`    ${d.comment.slice(0, 80)}`);
          if (d.prompt)   console.log(`    prompt: ${d.prompt.slice(0, 80)}`);
          if (d.tool)    console.log(`    tool:   ${d.tool}`);
          if (d.error)   console.log(`    error:  ${d.error}`);
          if (d.original && d.corrected) console.log(`    correction: "${d.original.slice(0,40)}…" → "${d.corrected.slice(0,40)}…"`);
        }
      }
      console.log('');
    }
    return;
  }

  // ── feedback export [--format jsonl|json|markdown] [--type TYPE] ──────────
  if (sub === 'export') {
    const fmt    = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'jsonl';
    const typeArg = args.includes('--type')  ? args[args.indexOf('--type')  + 1] : null;
    const st     = FEEDBACK.status();
    const allFiles = [];
    try {
      for (const f of fs.readdirSync(st.feedbackDir)) {
        if (f.endsWith('.ndjson')) allFiles.push(f);
      }
    } catch { /* dir empty/missing */ }
    allFiles.sort();

    const records = [];
    for (const fname of allFiles) {
      const lines = fs.readFileSync(path.join(st.feedbackDir, fname), 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const rec = JSON.parse(line);
          if (typeArg && rec.type !== typeArg) continue;
          records.push(rec);
        } catch { /* skip */ }
      }
    }

    if (fmt === 'jsonl') {
      for (const r of records) process.stdout.write(JSON.stringify(r) + '\n');
    } else if (fmt === 'markdown' || fmt === 'md') {
      console.log(`# Feedback Export\n`);
      console.log(`Generated: ${new Date().toISOString()}`);
      console.log(`Total records: ${records.length}\n`);
      for (const r of records) {
        const ts  = r.ts ? r.ts.slice(0, 16) : '?';
        const d   = r.data || {};
        console.log(`## ${r.type || '?'} — ${ts}`);
        if (d.rating)  console.log(`Rating: ${d.rating}/5`);
        if (d.comment)  console.log(`\n${d.comment}\n`);
        if (d.original) console.log(`\nOriginal:\n\`\`\`\n${d.original.slice(0, 500)}\n\`\`\`\n`);
        if (d.corrected) console.log(`Corrected:\n\`\`\`\n${d.corrected.slice(0, 500)}\n\`\`\`\n`);
        console.log('---');
      }
    } else {
      console.log(JSON.stringify(records, null, 2));
    }
    return;
  }

  // ── feedback enable / disable ───────────────────────────────────────────
  if (sub === 'enable') {
    process.env.PURPCLAW_FEEDBACK_OFF = '';
    console.log(json ? JSON.stringify({ ok: true, enabled: true }) : '✓ feedback enabled');
    return;
  }
  if (sub === 'disable') {
    process.env.PURPCLAW_FEEDBACK_OFF = '1';
    console.log(json ? JSON.stringify({ ok: true, enabled: false }) : '✓ feedback disabled (takes effect next session)');
    return;
  }

  // Help
  console.log(`purpclaw feedback — Personal Model Growth feedback
  purpclaw feedback status                   show feedback stats and session info
  purpclaw feedback submit <type> <msg>    submit feedback (bug_report/feature_request/performance_issue/other)
  purpclaw feedback list [--limit N] [--type TYPE]   list recent records
  purpclaw feedback export [--format jsonl|json|md]    export all records
  purpclaw feedback enable                    re-enable feedback capture
  purpclaw feedback disable                  disable feedback capture
  purpclaw feedback --json                  JSON output (append to any subcommand)
`);
}

module.exports = { run };
