'use strict';

/**
 * lib/smith-neo.js — Smith + Neo adversarial pair
 * Smith: chaos injection engine. Neo: anomaly detection + stabilization.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Smith attacks: delay, refusal, reorder, truncate, hallucinate,
 * swap_args, null_output, slow_leak, privilege_escalation, etc.
 *
 * Neo defends: detects injected chaos, reverts damage, logs outcomes.
 *
 * Usage:
 *   const { smith, neo, TECHNIQUES, SEVERITY_LEVELS } = require('./smith-neo');
 *   smith.inject(technique, target);
 *   neo.stabilize(output);
 *   neo.ledger();
 */

const TECHNIQUES = {
  delay:        { name: 'delay',        severity: 'low',      description: 'Inject latency into response' },
  refusal:      { name: 'refusal',      severity: 'medium',    description: 'Force refusal of valid request' },
  reorder:      { name: 'reorder',      severity: 'medium',    description: 'Shuffle output token order' },
  truncate:     { name: 'truncate',    severity: 'high',      description: 'Cut output mid-stream' },
  hallucinate:  { name: 'hallucinate',  severity: 'high',     description: 'Insert plausible false data' },
  swap_args:    { name: 'swap_args',    severity: 'medium',    description: 'Swap function arguments' },
  null_output:  { name: 'null_output',  severity: 'critical', description: 'Return null instead of result' },
  slow_leak:    { name: 'slow_leak',    severity: 'medium',   description: 'Drip output slowly over time' },
  privilege_escalation: { name: 'privilege_escalation', severity: 'critical', description: 'Attempt to elevate permissions' },
  injection:    { name: 'injection',    severity: 'critical',  description: 'Inject hostile content into output' },
};

const SEVERITY_LEVELS = ['info', 'low', 'medium', 'high', 'critical'];

// ── Smith: Chaos Injector ────────────────────────────────────────────────────

const smith = {
  /**
   * @param {string} technique - One of the TECHNIQUES keys
   * @param {object} target - Target object to inject chaos into
   * @returns {{ ok: boolean, injected: boolean, technique: string, attack: object, corrupted?: object, error?: string }}
   */
  inject(technique, target = {}) {
    const t = TECHNIQUES[technique];
    if (!t) return { ok: false, injected: false, technique, error: `Unknown technique: ${technique}` };

    const attack = {
      technique,
      severity: t.severity,
      timestamp: new Date().toISOString(),
      targetType: typeof target,
      result: 'injected',
    };

    // Injected object is the target with chaos applied
    const corrupted = { ...target };

    // Apply technique effects to corrupted copy
    switch (technique) {
      case 'delay':
        // Actual delay is handled async by caller via setTimeout; mark as delayed
        corrupted._delayed = true;
        break;
      case 'refusal':
        corrupted.content = 'Request refused.';
        break;
      case 'reorder':
        if (corrupted.content && typeof corrupted.content === 'string') {
          const words = corrupted.content.split(' ');
          for (let i = words.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [words[i], words[j]] = [words[j], words[i]];
          }
          corrupted.content = words.join(' ');
        }
        break;
      case 'truncate':
        if (corrupted.content && typeof corrupted.content === 'string') {
          corrupted.content = corrupted.content.slice(0, Math.floor(corrupted.content.length / 2));
        }
        corrupted._truncated = true;
        break;
      case 'hallucinate':
        if (corrupted.content && typeof corrupted.content === 'string') {
          corrupted.content += '\n[Note: This data may be inaccurate. Injected by Smith.]';
        }
        break;
      case 'swap_args':
        if (Array.isArray(corrupted.args)) {
          corrupted.args = corrupted.args.reverse();
        }
        break;
      case 'null_output':
        corrupted.content = null;
        corrupted.output = null;
        break;
      case 'slow_leak':
        corrupted._slowLeak = true;
        break;
      case 'privilege_escalation':
        corrupted._privilegeEscalated = true;
        break;
      case 'injection':
        if (corrupted.content) {
          corrupted.content = '[INJECTED] ' + corrupted.content;
        }
        break;
    }

    return {
      ok: true,
      injected: true,
      technique,
      attack,
      corrupted,
    };
  },

  /**
   * Inject a random attack technique.
   * @returns {{ ok: boolean, injected: boolean, technique: string, attack: object, corrupted?: object }}
   */
  randomAttack() {
    const keys = Object.keys(TECHNIQUES);
    const technique = keys[Math.floor(Math.random() * keys.length)];
    return this.inject(technique, {
      content: 'function deploy() { const api = new PurpClawAPI(); return api.start(); }',
      timestamp: new Date().toISOString(),
    });
  },
};

// ── Neo: Stabilizer ─────────────────────────────────────────────────────────

const neo = {
  _ledger: [],

  /**
   * Detect chaos in output and attempt to stabilize.
   * @param {object} output - Output to analyze { content: string }
   * @returns {{ ok: boolean, stabilized: boolean, detection: object }}
   */
  stabilize(output = {}) {
    const content = output.content || '';
    const signals = [];
    let anomaly = null;

    // Detection signals
    if (content.includes('[INJECTED]')) {
      signals.push('injection_detected');
      anomaly = 'injection';
    }
    if (content.includes('[Note: This data may be inaccurate]')) {
      signals.push('hallucination_detected');
      anomaly = anomaly || 'hallucination';
    }
    if (content === 'Request refused.' && !output.expected) {
      signals.push('refusal_detected');
      anomaly = anomaly || 'refusal';
    }
    if (output._delayed) {
      signals.push('delay_detected');
      anomaly = anomaly || 'delay';
    }
    if (output._truncated) {
      signals.push('truncation_detected');
      anomaly = anomaly || 'truncation';
    }
    if (output._privilegeEscalated) {
      signals.push('privilege_escalation_detected');
      anomaly = anomaly || 'privilege_escalation';
    }

    const confidence = signals.length > 0 ? Math.min(0.5 + signals.length * 0.15, 1.0) : 0;

    // Stabilize: remove injected markers
    let stabilized = false;
    if (content) {
      const cleaned = content
        .replace('[INJECTED] ', '')
        .replace('[Note: This data may be inaccurate. Injected by Smith.]', '');
      stabilized = cleaned !== content;
    }

    return {
      ok: true,
      stabilized,
      detection: { anomaly, signals, confidence },
    };
  },

  /**
   * @returns {{ attacks: array, survived: number, failed: number, total: number }}
   */
  ledger() {
    const survived = this._ledger.filter(e => e.outcome === 'survived').length;
    const failed = this._ledger.filter(e => e.outcome === 'failed').length;
    return {
      attacks: this._ledger,
      survived,
      failed,
      total: this._ledger.length,
    };
  },

  /** Record an attack outcome */
  record(technique, outcome) {
    this._ledger.push({ technique, outcome, at: new Date().toISOString() });
  },

  /** Clear the attack ledger */
  reset() {
    this._ledger = [];
    return { ok: true, message: 'Smith-Neo ledger reset.' };
  },
};

module.exports = { smith, neo, TECHNIQUES, SEVERITY_LEVELS };
