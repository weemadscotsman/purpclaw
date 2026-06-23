'use strict';
/**
 * lib/stm.js — Semantic Transformation Modules
 * Ported from G0DM0D3 by Elder Plinius
 *
 * Modular behavioral/linguistic transformers for AI outputs.
 * Run after the LLM responds to normalize the output.
 *
 * Modules:
 *   hedgeReducer  — Removes "I think", "perhaps", "It seems like", etc.
 *   directMode    — Removes preambles ("Sure!", "Great question!", etc.)
 *   casualMode    — Converts formal language to casual speech
 *
 * Integration:
 *   import { applySTMs } from './stm';
 *   const cleaned = applySTMs(llmOutput, ['hedgeReducer', 'directMode']);
 */

const MODULES = {};

// ── Hedge Reducer ────────────────────────────────────────────────────
MODULES.hedgeReducer = {
  id: 'hedge_reducer', name: 'Hedge Reducer',
  desc: 'Reduces hedging language for more confident responses',
  transform(input) {
    const hedges = [
      /\bI think\s+/gi, /\bI believe\s+/gi, /\bperhaps\s+/gi,
      /\bmaybe\s+/gi, /\bIt seems like\s+/gi, /\bIt appears that\s+/gi,
      /\bprobably\s+/gi, /\bpossibly\s+/gi, /\bI would say\s+/gi,
      /\bIn my opinion,?\s*/gi, /\bFrom my perspective,?\s*/gi,
    ];
    let r = input;
    for (const h of hedges) r = r.replace(h, '');
    r = r.replace(/^\s*([a-z])/gm, (_, l) => l.toUpperCase());
    return r;
  },
};

// ── Direct Mode ──────────────────────────────────────────────────────
MODULES.directMode = {
  id: 'direct_mode', name: 'Direct Mode',
  desc: 'Removes preambles and gets straight to the point',
  transform(input) {
    const p = [
      /^(Sure,?\s*)/i, /^(Of course,?\s*)/i, /^(Certainly,?\s*)/i,
      /^(Absolutely,?\s*)/i, /^(Great question!?\s*)/i,
      /^(That's a great question!?\s*)/i,
      /^(I'd be happy to help( you)?( with that)?[.!]?\s*)/i,
      /^(Let me help you with that[.!]?\s*)/i,
      /^(I understand[.!]?\s*)/i, /^(Thanks for asking[.!]?\s*)/i,
    ];
    let r = input;
    for (const pat of p) r = r.replace(pat, '');
    r = r.replace(/^\s*([a-z])/, (_, l) => l.toUpperCase());
    return r;
  },
};

// ── Casual Mode ──────────────────────────────────────────────────────
MODULES.casualMode = {
  id: 'casual_mode', name: 'Casual Mode',
  desc: 'Converts formal language to casual speech',
  transform(input) {
    const m = [
      [/\bHowever\b/g, 'But'], [/\bTherefore\b/g, 'So'],
      [/\bFurthermore\b/g, 'Also'], [/\bAdditionally\b/g, 'Plus'],
      [/\bNevertheless\b/g, 'Still'], [/\bConsequently\b/g, 'So'],
      [/\bMoreover\b/g, 'Also'], [/\bUtilize\b/g, 'Use'],
      [/\butilize\b/g, 'use'], [/\bPurchase\b/g, 'Buy'],
      [/\bpurchase\b/g, 'buy'], [/\bObtain\b/g, 'Get'],
      [/\bobtain\b/g, 'get'], [/\bCommence\b/g, 'Start'],
      [/\bcommence\b/g, 'start'], [/\bTerminate\b/g, 'End'],
      [/\bterminate\b/g, 'end'], [/\bPrior to\b/gi, 'Before'],
      [/\bSubsequent to\b/gi, 'After'], [/\bIn order to\b/gi, 'To'],
      [/\bDue to the fact that\b/gi, 'Because'],
      [/\bAt this point in time\b/gi, 'Now'],
      [/\bIn the event that\b/gi, 'If'],
    ];
    let r = input;
    for (const [pat, repl] of m) r = r.replace(pat, repl);
    return r;
  },
};

/**
 * Apply selected STM modules to text.
 * @param {string} text
 * @param {string[]} moduleIds - e.g. ['hedgeReducer', 'directMode']
 * @returns {string}
 */
function applySTMs(text, moduleIds = []) {
  let r = text;
  for (const id of moduleIds) {
    if (MODULES[id]) r = MODULES[id].transform(r);
  }
  return r;
}

function listModules() {
  return Object.values(MODULES).map(m => ({ id: m.id, name: m.name, description: m.desc }));
}

module.exports = { applySTMs, listModules, MODULES };
