'use strict';
/**
 * lib/user-feedback.js — Personal Model Growth Engine
 * ════════════════════════════════════════════════════════
 *
 * Collects every interaction a company would collect — every prompt,
 * correction, preference, tool call, rejection — but keeps it ALL local.
 * Fed directly into the user's personal LoRA training loop.
 *
 * THE PROMISE:
 *   - Everything captured. Nothing shared.
 *   - Your data trains YOUR model on YOUR hardware.
 *   - Purge-any-time. Opt-out any time. Zero telemetry to us.
 *
 * What gets captured:
 *   - User prompts (every message)
 *   - Tool calls and results
 *   - Corrections (user rejects output, provides alternative)
 *   - Edits (user changes what the agent wrote)
 *   - Preferences (repeated patterns, style choices)
 *   - Workflows (multi-step sequences)
 *
 * Where it lives:
 *   E:/training/user-feedback/YYYY-MM-DD.ndjson
 *
 * Schema per record:
 *   {
 *     ts: <iso>,
 *     type: 'prompt' | 'tool_call' | 'tool_result' | 'correction' |
 *           'preference' | 'edit' | 'workflow' | 'feedback',
 *     sessionId: <string>,
 *     turn: <number>,
 *     data: {
 *       // type-specific fields
 *       prompt?: string,
 *       tool?: string,
 *       args?: object,
 *       result?: object,
 *       original?: string,    // for corrections
 *       corrected?: string,
 *       file?: string,        // for edits
 *       before?: string,
 *       after?: string,
 *       pattern?: string,     // for preferences/workflows
 *       rating?: number,      // for feedback (1-5)
 *     },
 *     context: {
 *       provider: string,
 *       model: string,
 *       cwd: string,
 *     }
 *   }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PURP_DIR = path.resolve(__dirname, '..');
const FEEDBACK_DIR = process.env.PURPCLAW_FEEDBACK_DIR
  || path.join('E:', 'training', 'user-feedback');
const FEEDBACK_STATS = path.join(FEEDBACK_DIR, 'stats.json');
const ENABLED = process.env.PURPCLAW_FEEDBACK_OFF !== '1';

if (!ENABLED) {
  console.log('[FEEDBACK] PURPCLAW_FEEDBACK_OFF=1 — personal model growth disabled');
}

let sessionId = crypto.randomUUID();
let sessionStart = new Date().toISOString();

// ── Ensure directories ──────────────────────────────────────────────────
function ensure() {
  try { fs.mkdirSync(FEEDBACK_DIR, { recursive: true }); } catch {}
}

// ── Stats ────────────────────────────────────────────────────────────────
function readStats() {
  try { return JSON.parse(fs.readFileSync(FEEDBACK_STATS, 'utf8')); }
  catch { return { total: 0, corrections: 0, preferences: 0, sessions: 0, lastSession: null }; }
}

function writeStats(stats) {
  ensure();
  try { fs.writeFileSync(FEEDBACK_STATS, JSON.stringify(stats, null, 2), 'utf8'); } catch {}
}

// ── Core capture ────────────────────────────────────────────────────────
function todayFile() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return path.join(FEEDBACK_DIR, `${y}-${m}-${day}.ndjson`);
}

function capture(type, data, context = {}) {
  if (!ENABLED) return;
  ensure();

  const record = {
    ts: new Date().toISOString(),
    type,
    sessionId,
    turn: context.turn || 0,
    data,
    context: {
      provider: context.provider || process.env.LLM_PROVIDER || '',
      model: context.model || process.env.LLM_MODEL || '',
      cwd: context.cwd || process.cwd(),
    },
  };

  try {
    fs.appendFileSync(todayFile(), JSON.stringify(record) + '\n', 'utf8');
  } catch (e) {
    // NEVER throw — this is a background fire-and-forget
    console.error('[FEEDBACK] write failed:', e.message);
    return;
  }

  // Update stats
  const stats = readStats();
  stats.total++;
  if (type === 'correction') stats.corrections++;
  if (type === 'preference') stats.preferences++;
  stats.lastSession = sessionId;
  writeStats(stats);
}

// ── Specific capture helpers ────────────────────────────────────────────
function capturePrompt(text, context) {
  capture('prompt', { prompt: text.substring(0, 5000) }, context);
}

function captureToolCall(tool, args, context) {
  capture('tool_call', { tool, args }, context);
}

function captureToolResult(tool, result, context) {
  const summary = {
    ok: result.ok,
    error: result.error ? result.error.substring(0, 500) : undefined,
    contentLength: typeof result.content === 'string' ? result.content.length : 0,
  };
  capture('tool_result', { tool, ...summary }, context);
}

function captureCorrection(original, corrected, context) {
  capture('correction', {
    original: original.substring(0, 3000),
    corrected: corrected.substring(0, 3000),
  }, context);
}

function capturePreference(pattern, context) {
  capture('preference', { pattern }, context);
}

function captureEdit(file, before, after, context) {
  capture('edit', {
    file,
    before: before.substring(0, 3000),
    after: after.substring(0, 3000),
  }, context);
}

function captureFeedback(rating, comment, context) {
  capture('feedback', { rating, comment }, context);
}

function captureWorkflow(steps, context) {
  capture('workflow', { steps, count: steps.length }, context);
}

// ── New session ─────────────────────────────────────────────────────────
function newSession() {
  sessionId = crypto.randomUUID();
  sessionStart = new Date().toISOString();
  const stats = readStats();
  stats.sessions++;
  stats.lastSession = sessionId;
  writeStats(stats);
  return sessionId;
}

// ── Status ──────────────────────────────────────────────────────────────
function status() {
  const stats = readStats();
  const files = [];
  try {
    for (const f of fs.readdirSync(FEEDBACK_DIR)) {
      if (f.endsWith('.ndjson')) {
        const p = path.join(FEEDBACK_DIR, f);
        files.push({ file: f, size: fs.statSync(p).size, lines: fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).length });
      }
    }
  } catch {}
  return {
    enabled: ENABLED,
    sessionId,
    sessionStart,
    stats,
    recentFiles: files.slice(-7),
    feedbackDir: FEEDBACK_DIR,
    readyForTraining: stats.corrections >= 10,
    trainingHint: stats.corrections >= 10
      ? `${stats.corrections} corrections captured — run 'purpclaw training personal' to fine-tune`
      : `Need ${10 - stats.corrections} more corrections to start training`,
  };
}

// ── Export for training ─────────────────────────────────────────────────
function exportTrainingData(format = 'chatml') {
  ensure();
  const allRecords = [];
  try {
    for (const f of fs.readdirSync(FEEDBACK_DIR)) {
      if (!f.endsWith('.ndjson')) continue;
      const lines = fs.readFileSync(path.join(FEEDBACK_DIR, f), 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try { allRecords.push(JSON.parse(line)); } catch {}
      }
    }
  } catch {}

  if (format === 'chatml') {
    const examples = [];
    for (const r of allRecords) {
      if (r.type === 'correction') {
        examples.push({
          messages: [
            { role: 'user', content: r.data.original },
            { role: 'assistant', content: r.data.corrected },
          ],
        });
      } else if (r.type === 'preference') {
        examples.push({
          messages: [
            { role: 'system', content: `The user prefers: ${r.data.pattern}` },
            { role: 'user', content: 'Acknowledge this preference for future interactions.' },
          ],
        });
      }
    }
    return examples;
  }

  if (format === 'sharegpt') {
    return allRecords
      .filter(r => r.type === 'correction')
      .map(r => ({
        conversations: [
          { from: 'human', value: r.data.original },
          { from: 'gpt', value: r.data.corrected },
        ],
      }));
  }

  return allRecords;
}

// ── Reset ───────────────────────────────────────────────────────────────
function reset() {
  try {
    for (const f of fs.readdirSync(FEEDBACK_DIR)) {
      if (f.endsWith('.ndjson')) fs.unlinkSync(path.join(FEEDBACK_DIR, f));
    }
    fs.writeFileSync(FEEDBACK_STATS, JSON.stringify({ total: 0, corrections: 0, preferences: 0, sessions: 0, lastSession: null }, null, 2));
  } catch {}
  sessionId = crypto.randomUUID();
  sessionStart = new Date().toISOString();
  return { reset: true, sessionId };
}

module.exports = {
  capturePrompt,
  captureToolCall,
  captureToolResult,
  captureCorrection,
  capturePreference,
  captureEdit,
  captureFeedback,
  captureWorkflow,
  newSession,
  status,
  exportTrainingData,
  reset,
  FEEDBACK_DIR,
  ENABLED,
};
