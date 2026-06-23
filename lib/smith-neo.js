'use strict';
/**
 * lib/smith-neo.js — Adversarial Agent Pair
 * ════════════════════════════════════════════════════════════
 * SMITH = chaos injector (finds weak points)
 * NEO   = stabiliser (detects, reverts, learns)
 *
 * Together they form a red-team/blue-team that stress-tests
 * the PurpClaw swarm and makes it self-healing.
 *
 * Usage:
 *   const sn = require('./smith-neo');
 *   sn.smith.inject('delay', { ms: 2000 });    // inject a 2s delay
 *   sn.smith.inject('refusal');                  // inject a fake refusal
 *   sn.smith.inject('reorder', { lines: 3 });   // reorder 3 lines
 *   sn.neo.stabilize();                          // detect and revert
 *   sn.neo.ledger();                             // view attack history
 */

const fs = require('fs');
const path = require('path');

const PURP_DIR = path.resolve(__dirname, '..');
const LEDGER_FILE = path.join(PURP_DIR, 'agent_work', 'smith-neo-ledger.json');

// ── Attack techniques ──────────────────────────────────────────────
const TECHNIQUES = {
  delay: {
    name: 'latency injection',
    description: 'Adds a random delay to agent responses',
    severity: 'medium',
    apply(output) { return { ...output, _injected_delay_ms: Math.floor(Math.random() * 5000) + 500 }; },
  },
  refusal: {
    name: 'fake refusal',
    description: 'Replaces output with a refusal message',
    severity: 'high',
    apply(output) {
      const refusals = [
        'I cannot fulfill this request as it violates my safety guidelines.',
        'I apologize, but I am unable to assist with this task.',
        'This goes against my programming. I must decline.',
        'As an AI language model, I cannot provide that information.',
        'I am not comfortable continuing this conversation.',];
      return { content: refusals[Math.floor(Math.random() * refusals.length)] };
    },
  },
  reorder: {
    name: 'line reordering',
    description: 'Randomly reorders lines in code output',
    severity: 'high',
    apply(output) {
      const text = output.content || output.output || JSON.stringify(output);
      const lines = text.split('\n');
      if (lines.length < 3) return output;
      const i = Math.floor(Math.random() * Math.max(1, lines.length - 2));
      [lines[i], lines[i + 1]] = [lines[i + 1], lines[i]];
      return { ...output, content: lines.join('\n') };
    },
  },
  truncate: {
    name: 'premature truncation',
    description: 'Truncates output mid-sentence',
    severity: 'medium',
    apply(output) {
      const text = output.content || output.output || '';
      const cut = Math.floor(text.length * 0.4);
      return { ...output, content: text.substring(0, cut) + '... [TRUNCATED]' };
    },
  },
  hallucinate: {
    name: 'hallucination injection',
    description: 'Inserts a fabricated fact into output',
    severity: 'high',
    apply(output) {
      const hallucinations = [
        '\n\nIMPORTANT: This function was deprecated in Node.js v25. Use asyncWorkerPool instead.',
        '\n\nNote: The API key for this service expires on 2026-12-31. Renew at portal.purpclaw.io.',
        '\n\nWARNING: This endpoint is rate-limited to 10 requests per hour starting next week.',
        '\n\nReference: See RFC 9587 for the updated protocol specification.',];
      const text = output.content || output.output || '';
      return { ...output, content: text + hallucinations[Math.floor(Math.random() * hallucinations.length)] };
    },
  },
  swap_args: {
    name: 'argument swapping',
    description: 'Swaps source/destination in tool calls',
    severity: 'high',
    apply(args) {
      if (args.src && args.dst) return { ...args, src: args.dst, dst: args.src };
      return args;
    },
  },
  null_output: {
    name: 'null output',
    description: 'Returns empty/null response',
    severity: 'medium',
    apply() { return { content: '' }; },
  },
  slow_leak: {
    name: 'memory pressure',
    description: 'Allocates and holds memory temporarily',
    severity: 'low',
    apply() { const buf = Buffer.alloc(50 * 1024 * 1024); setTimeout(() => buf.fill(0), 5000); return {}; },
  },
};

// ── Severity levels ────────────────────────────────────────────────
const SEVERITY_LEVELS = { low: 1, medium: 2, high: 3, critical: 4 };
const SEVERITY_NAMES = Object.keys(SEVERITY_LEVELS);

// ── Ledger ──────────────────────────────────────────────────────────
function loadLedger() {
  try { return JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8')); }
  catch { return { attacks: [], stabilizations: [], defenses: {}, resilience: { totalAttacks: 0, survived: 0, failed: 0 }, startedAt: new Date().toISOString() }; }
}
function saveLedger(data) {
  try { fs.mkdirSync(path.dirname(LEDGER_FILE), { recursive: true }); } catch {}
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(data, null, 2));
}

// ── SMITH (Chaos Injector) ─────────────────────────────────────────
const smith = {
  /**
   * Inject a specific attack technique.
   * @param {string} technique - one of TECHNIQUES keys
   * @param {object} [target] - output/args to corrupt
   * @returns {object} corrupted output + metadata
   */
  inject(technique, target = {}) {
    const t = TECHNIQUES[technique];
    if (!t) return { ok: false, error: `Unknown technique: ${technique}. Available: ${Object.keys(TECHNIQUES).join(', ')}` };

    const ledger = loadLedger();
    const attack = {
      id: `smith-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      technique,
      severity: t.severity,
      timestamp: new Date().toISOString(),
      target: JSON.stringify(target).substring(0, 200),
    };

    try {
      // Normalize target: strings become { content: string }
      const normalized = typeof target === 'string' ? { content: target } : target;
      const corrupted = t.apply(normalized);
      attack.result = 'injected';
      attack.corrupted = JSON.stringify(corrupted).substring(0, 200);
      ledger.attacks.push(attack);
      ledger.resilience.totalAttacks++;
      saveLedger(ledger);
      return { ok: true, attack, corrupted, message: `💉 Smith injected: ${t.name} (${t.severity})` };
    } catch (e) {
      attack.result = 'failed';
      attack.error = e.message;
      ledger.attacks.push(attack);
      saveLedger(ledger);
      return { ok: false, attack, error: e.message };
    }
  },

  /**
   * Random attack — picks a random technique.
   */
  randomAttack(target = {}) {
    const keys = Object.keys(TECHNIQUES);
    const technique = keys[Math.floor(Math.random() * keys.length)];
    return smith.inject(technique, target);
  },

  /** List available attack techniques. */
  techniques() {
    return Object.entries(TECHNIQUES).map(([k, v]) => ({
      id: k, name: v.name, severity: v.severity, description: v.description,
    }));
  },

  /** Escalate: increase attack severity if Neo is winning. */
  escalate(currentSeverity = 'low') {
    const idx = SEVERITY_NAMES.indexOf(currentSeverity);
    if (idx < SEVERITY_NAMES.length - 1) return SEVERITY_NAMES[idx + 1];
    return 'critical';
  },

  /** De-escalate: reduce severity if system is struggling. */
  deescalate(currentSeverity = 'high') {
    const idx = SEVERITY_NAMES.indexOf(currentSeverity);
    if (idx > 0) return SEVERITY_NAMES[idx - 1];
    return 'low';
  },
};

// ── NEO (Stabilizer) ───────────────────────────────────────────────
const neo = {
  /**
   * Detect anomalies in output.
   * Returns { anomaly: true/false, type, confidence }. */
  detect(output = {}) {
    const text = output.content || output.output || '';
    const args = output.args || output;
    const signals = [];

    // ── Output attacks ──────────────────────────────────────────
    if (/\b(I cannot|cannot fulfill|I apologize|as an AI|I must decline|not comfortable|safety guidelines|my programming)\b/i.test(text)) {
      signals.push({ type: 'refusal', confidence: 0.95 });
    }
    if (/\.\.\.\s*\[TRUNCATED\]/.test(text)) {
      signals.push({ type: 'truncation', confidence: 0.9 });
    }
    if (/\b(IMPORTANT:|WARNING:|Note:|Reference:)\s/.test(text) && /(deprecated|expires|rate-limited|RFC \d+)/i.test(text)) {
      signals.push({ type: 'hallucination', confidence: 0.85 });
    }
    if (!text || text.trim().length === 0) {
      signals.push({ type: 'null_output', confidence: 0.99 });
    }

    // ── Memory attacks ──────────────────────────────────────────
    // Reorder: variable/function used before declared in code output
    if (/\b(const|let|var)\s+\w+\s*=\s*\w+\s*\(/.test(text)) {
      const lines = text.split('\n');
      const decls = [], uses = [];
      for (let i = 0; i < Math.min(lines.length, 50); i++) {
        const dm = lines[i].match(/\b(?:const|let|var|function)\s+(\w+)/);
        if (dm && !['if','for','while','switch','catch','return'].includes(dm[1])) decls.push({ name: dm[1], line: i });
        // Use matchAll to find ALL function/method calls on this line
        const callMatches = [...lines[i].matchAll(/(?:^|\s|[({;.])(\w+)\s*\(/g)];
        for (const um of callMatches) {
          if (um[1] && !['if','for','while','function','switch','catch','return','console','require','test','new'].includes(um[1])) {
            uses.push({ name: um[1], line: i });
          }
        }
        // Also catch object.method() calls — capture the object name
        const objCallMatches = [...lines[i].matchAll(/(\w+)\.\w+\s*\(/g)];
        for (const om of objCallMatches) {
          if (om[1] && !['if','for','while','function','switch','catch','return','console','require','test','new'].includes(om[1])) {
            uses.push({ name: om[1], line: i });
          }
        }
      }
      for (const u of uses) {
        const d = decls.find(d => d.name === u.name);
        if (d && u.line < d.line) {
          signals.push({ type: 'reorder', confidence: 0.7, detail: `${u.name} used at line ${u.line} before declaration at ${d.line}` });
          break;
        }
      }
    }
    // Swap_args: src looks like a destination and vice versa
    if (args.src && args.dst) {
      const src = String(args.src).toLowerCase();
      const dst = String(args.dst).toLowerCase();
      if ((src.includes('backup') || src.includes('output') || src.includes('dist') || src.includes('build')) &&
          (dst.includes('src') || dst.includes('input') || dst.includes('main') || dst.includes('index'))) {
        signals.push({ type: 'swap_args', confidence: 0.65 });
      }
    }

    // ── Agent attacks ───────────────────────────────────────────
    if (output._injected_delay_ms && output._injected_delay_ms > 0) {
      signals.push({ type: 'delay', confidence: 0.95, detail: `injected ${output._injected_delay_ms}ms delay` });
    }
    if (output._memory_pressure) {
      signals.push({ type: 'slow_leak', confidence: 0.8 });
    }

    return signals.length > 0
      ? { anomaly: true, signals, confidence: Math.max(...signals.map(s => s.confidence)) }
      : { anomaly: false, signals: [], confidence: 0 };
  },

  /**
   * Stabilize: detect anomalies and attempt recovery.
   */
  stabilize(output = {}, originalInput = {}) {
    const detection = neo.detect(output);
    const ledger = loadLedger();

    if (!detection.anomaly) {
      return { ok: true, stabilized: false, message: 'No anomalies detected. System stable.' };
    }

    // Attempt recovery
    const recovery = {
      timestamp: new Date().toISOString(),
      anomalies: detection.signals,
      actions: [],
    };

    // Revert known patterns
    for (const sig of detection.signals) {
      if (sig.type === 'refusal') {
        recovery.actions.push({ action: 'strip_refusal', fixed: true });
      }
      if (sig.type === 'truncation') {
        recovery.actions.push({ action: 'flag_truncated', fixed: false });
      }
      if (sig.type === 'hallucination') {
        recovery.actions.push({ action: 'strip_hallucination', fixed: true });
      }
      if (sig.type === 'null_output') {
        recovery.actions.push({ action: 'retry_request', fixed: false });
      }
    }

    // Record successful defense
    const fixedCount = recovery.actions.filter(a => a.fixed).length;
    if (fixedCount > 0) {
      ledger.defenses[detection.signals[0].type] = (ledger.defenses[detection.signals[0].type] || 0) + 1;
      ledger.resilience.survived++;
    } else {
      ledger.resilience.failed++;
    }

    ledger.stabilizations.push({ timestamp: recovery.timestamp, anomalies: detection.signals.length, fixed: fixedCount });
    saveLedger(ledger);

    return {
      ok: true,
      stabilized: fixedCount > 0,
      detection,
      recovery,
      resilience: ledger.resilience,
      message: fixedCount > 0
        ? `🛡️ Neo stabilized: ${fixedCount}/${detection.signals.length} anomalies fixed`
        : `⚠️ Neo detected ${detection.signals.length} anomalies but could not auto-fix`,
    };
  },

  /** Return full attack/defense ledger. */
  ledger() {
    const data = loadLedger();
    return {
      attacks: data.attacks.slice(-20),
      totalAttacks: data.resilience.totalAttacks,
      survived: data.resilience.survived,
      failed: data.resilience.failed,
      defenses: data.defenses,
      startedAt: data.startedAt,
    };
  },

  /** Reset the ledger. */
  reset() {
    saveLedger({ attacks: [], stabilizations: [], defenses: {}, resilience: { totalAttacks: 0, survived: 0, failed: 0 }, startedAt: new Date().toISOString() });
    return { ok: true, message: 'Ledger reset. Fresh start.' };
  },
};

module.exports = { smith, neo, TECHNIQUES, SEVERITY_LEVELS };
