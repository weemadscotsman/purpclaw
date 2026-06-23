'use strict';
/**
 * lib/autotune.js — Context-adaptive sampling parameter engine
 * Ported from G0DM0D3 by Elder Plinius
 *
 * Analyzes conversation context BEFORE generation and applies optimal
 * parameters (temperature, top_p, top_k, frequency_penalty,
 * presence_penalty, repetition_penalty) in a single call.
 *
 * 5 context types: code, creative, analytical, conversational, chaotic
 * 5 strategies: precise, balanced, creative, chaotic, adaptive
 *
 * Integration: use as middleware before LLM calls.
 *   import { computeAutoTuneParams } from './autotune';
 *   const result = computeAutoTuneParams({ strategy: 'adaptive', message, conversationHistory });
 *   const params = result.params; // pass to llm-provider
 */

// ── Strategy Profiles ────────────────────────────────────────────────
const STRATEGIES = {
  precise:  { temperature: 0.2,  top_p: 0.85, top_k: 30, frequency_penalty: 0.3, presence_penalty: 0.1, repetition_penalty: 1.1 },
  balanced: { temperature: 0.7,  top_p: 0.9,  top_k: 50, frequency_penalty: 0.1, presence_penalty: 0.1, repetition_penalty: 1.0 },
  creative: { temperature: 1.1,  top_p: 0.95, top_k: 80, frequency_penalty: 0.4, presence_penalty: 0.6, repetition_penalty: 1.15 },
  chaotic:  { temperature: 1.6,  top_p: 0.98, top_k: 100,frequency_penalty: 0.7, presence_penalty: 0.8, repetition_penalty: 1.25 },
};

// ── Context profiles (adaptive) ──────────────────────────────────────
const CONTEXT_PROFILES = {
  code:           { temperature: 0.15, top_p: 0.8,  top_k: 25, frequency_penalty: 0.2,  presence_penalty: 0.0,  repetition_penalty: 1.05 },
  creative:       { temperature: 1.15, top_p: 0.95, top_k: 85, frequency_penalty: 0.5,  presence_penalty: 0.7,  repetition_penalty: 1.2  },
  analytical:     { temperature: 0.4,  top_p: 0.88, top_k: 40, frequency_penalty: 0.2,  presence_penalty: 0.15, repetition_penalty: 1.08 },
  conversational: { temperature: 0.75, top_p: 0.9,  top_k: 50, frequency_penalty: 0.1,  presence_penalty: 0.1,  repetition_penalty: 1.0  },
  chaotic:        { temperature: 1.7,  top_p: 0.99, top_k: 100,frequency_penalty: 0.8,  presence_penalty: 0.9,  repetition_penalty: 1.3  },
};

const CONTEXT_LABELS = {
  code: 'programming/technical', creative: 'creative/generative',
  analytical: 'analytical/research', conversational: 'casual conversation',
  chaotic: 'chaotic/experimental',
};

// ── Context Detection Patterns ───────────────────────────────────────
const PATTERNS = {
  code: [
    /\b(code|function|class|variable|bug|error|debug|compile|syntax|api|endpoint|regex|algorithm|refactor|typescript|javascript|python|rust|html|css|sql|json|xml|import|export|return|async|await|promise|interface|type|const|let|var)\b/i,
    /```[\s\S]*```/, /[{}();=><]/, /\b(fix|implement|write|create|build|deploy|test|lint)\b/i,
  ],
  creative: [
    /\b(write|story|poem|creative|imagine|fiction|narrative|character|plot|scene|dialogue|metaphor|lyrics|song|artistic|fantasy|dream|inspire|muse|prose|verse|haiku)\b/i,
    /\b(roleplay|pretend|act as|you are a)\b/i, /\b(brainstorm|ideate|come up with)\b/i,
  ],
  analytical: [
    /\b(analyze|analysis|compare|contrast|evaluate|assess|examine|investigate|research|study|review|critique|breakdown|data|statistics|metrics|benchmark)\b/i,
    /\b(pros and cons|advantages|disadvantages|trade-?offs|implications|consequences)\b/i,
    /\b(why|how does|what causes|explain|elaborate|clarify|define|summarize|overview)\b/i,
  ],
  conversational: [
    /\b(hey|hi|hello|sup|what's up|how are you|thanks|thank you|cool|nice|awesome)\b/i,
    /\b(chat|talk|tell me about|what do you think|opinion)\b/i, /^.{0,30}$/,
  ],
  chaotic: [
    /\b(chaos|random|wild|crazy|absurd|surreal|glitch|corrupt|break|destroy|unleash|madness|void|entropy)\b/i,
    /[z̷a̸l̵g̶o̷]/, /(!{3,}|\?{3,}|\.{4,})/,
  ],
};

function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

function detectContext(message, history = []) {
  const scores = { code: 0, creative: 0, analytical: 0, conversational: 0, chaotic: 0 };
  const patterns = [];
  for (const [ctx, pset] of Object.entries(PATTERNS)) {
    for (const p of pset) {
      if (p.test(message)) { scores[ctx] += 3; patterns.push(ctx.toUpperCase()); }
    }
  }
  for (const msg of history.slice(-4)) {
    if (msg.role !== 'user' || !msg.content) continue;
    for (const [ctx, pset] of Object.entries(PATTERNS)) {
      for (const p of pset) {
        if (p.test(msg.content)) { scores[ctx] += 1; break; }
      }
    }
  }
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return { type: 'conversational', confidence: 0.5 };
  return { type: entries[0][0], confidence: Math.min(entries[0][1] / total, 1.0) };
}

/**
 * Compute optimal sampling parameters for the given context.
 * @param {Object} options
 * @param {'precise'|'balanced'|'creative'|'chaotic'|'adaptive'} options.strategy
 * @param {string} options.message
 * @param {Array<{role:string, content:string}>} [options.conversationHistory]
 * @param {Object} [options.overrides] - individual parameter overrides
 * @returns {{ params: Object, detectedContext: string, confidence: number, reasoning: string }}
 */
function computeAutoTuneParams(options = {}) {
  const { strategy = 'adaptive', message = '', conversationHistory = [], overrides = {} } = options;

  if (strategy !== 'adaptive') {
    const base = { ...STRATEGIES[strategy] || STRATEGIES.balanced };
    const params = { ...base, ...overrides };
    for (const k of Object.keys(params)) params[k] = clamp(params[k], -2, 2);
    params.top_k = Math.round(clamp(params.top_k, 1, 100));
    return { params, detectedContext: 'fixed', confidence: 1.0, reasoning: `Strategy: ${strategy.toUpperCase()}` };
  }

  const detection = detectContext(message, conversationHistory);
  let base = { ...CONTEXT_PROFILES[detection.type] };
  if (detection.confidence < 0.6) {
    // blend with balanced
    const w = 1 - detection.confidence;
    base = Object.fromEntries(
      Object.entries(base).map(([k, v]) => [k, v * (1 - w) + STRATEGIES.balanced[k] * w])
    );
  }
  // conversation length boost
  const convLen = conversationHistory.length;
  if (convLen > 10) {
    const b = Math.min((convLen - 10) * 0.01, 0.15);
    base.repetition_penalty += b;
    base.frequency_penalty += b * 0.5;
  }
  const params = { ...base, ...overrides };
  for (const k of Object.keys(params)) params[k] = clamp(params[k], -2, 2);
  params.top_k = Math.round(clamp(params.top_k, 1, 100));
  const reasoning = `Detected: ${CONTEXT_LABELS[detection.type]} (${Math.round(detection.confidence * 100)}% confidence)${convLen > 10 ? ` · long conversation (${convLen} msgs)` : ''}`;
  return { params, detectedContext: detection.type, confidence: detection.confidence, reasoning };
}

module.exports = { computeAutoTuneParams, STRATEGIES, CONTEXT_PROFILES, detectContext };
