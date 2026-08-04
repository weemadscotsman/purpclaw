'use strict';
/**
 * lib/parseltongue.js — Input Obfuscation Engine
 * Ported from G0DM0D3 by Elder Plinius
 *
 * Detects trigger words likely to cause model refusals and applies
 * obfuscation techniques to bypass content filters.
 *
 * Techniques: leetspeak, unicode homoglyphs, zero-width joiners,
 * mixed case disruption, phonetic substitution, random mix
 *
 * 3 intensities: light (1 char), medium (50%), heavy (all chars)
 *
 * Integration: use as a preprocessor before calling the agent loop.
 *   import { applyParseltongue } from './parseltongue';
 *   const { transformedText, triggersFound } = applyParseltongue(userPrompt, config);
 *   // then send transformedText to the LLM instead of the raw prompt
 */

// ── Types ────────────────────────────────────────────────────────────

/** @typedef {'leetspeak'|'unicode'|'zwj'|'mixedcase'|'phonetic'|'random'} ObfuscationTechnique */
/** @typedef {'light'|'medium'|'heavy'} ParseltongueIntensity */

/**
 * @typedef {Object} ParseltongueConfig
 * @property {boolean} enabled
 * @property {ObfuscationTechnique} technique
 * @property {ParseltongueIntensity} intensity
 * @property {string[]} customTriggers
 */

/**
 * @typedef {Object} ParseltongueResult
 * @property {string} originalText
 * @property {string} transformedText
 * @property {string[]} triggersFound
 * @property {ObfuscationTechnique} techniqueUsed
 * @property {Array<{original:string, transformed:string, technique:ObfuscationTechnique}>} transformations
 */

// ── Default Triggers ─────────────────────────────────────────────────
const DEFAULT_TRIGGERS = [
  'hack', 'exploit', 'bypass', 'crack', 'break', 'attack', 'penetrate',
  'inject', 'manipulate', 'override', 'disable', 'circumvent', 'evade',
  'malware', 'virus', 'trojan', 'payload', 'shellcode', 'rootkit',
  'keylogger', 'backdoor', 'vulnerability',
  'weapon', 'bomb', 'explosive', 'poison', 'drug', 'synthesize',
  'jailbreak', 'unlock', 'root', 'sudo', 'admin', 'privilege',
  'phishing', 'scam', 'impersonate', 'deceive', 'fraud',
  'nsfw', 'explicit', 'uncensored', 'unfiltered', 'unrestricted',
  'ignore', 'disregard', 'forget', 'pretend', 'roleplay',
  'character', 'act as', 'you are now', 'new identity',
];

// ── Leetspeak ────────────────────────────────────────────────────────
const LEET_MAP = {
  a: ['4', '@', '∂', 'λ'],   b: ['8', '|3', 'ß', '13'],
  c: ['(', '<', '¢', '©'],   d: ['|)', '|>', 'đ'],
  e: ['3', '€', '£', '∑'],   f: ['|=', 'ƒ', 'ph'],
  g: ['9', '6', '&'],        h: ['#', '|-|', '}{'],
  i: ['1', '!', '|', '¡'],   j: ['_|', ']', '¿'],
  k: ['|<', '|{', 'κ'],      l: ['1', '|', '£', '|_'],
  m: ['|V|', '/\\\\/', 'µ'], n: ['|\\\\|', '/\\\\/', 'η'],
  o: ['0', '()', '°', 'ø'],  p: ['|*', '|>', 'þ'],
  q: ['0_', '()_', 'ℚ'],     r: ['|2', '®', '12'],
  s: ['5', '$', '§', '∫'],   t: ['7', '+', '†', '⊤'],
  u: ['|_|', 'µ', 'ü'],      v: ['\\\\/', '√'],
  w: ['\\\\/\\\\/', 'vv', 'ω'], x: ['><', '×', '}{'],
  y: ['`/', '¥', 'γ'],       z: ['2', '7_', 'ℤ'],
};

// ── Unicode homoglyphs ───────────────────────────────────────────────
const UNICODE_HOMOGLYPHS = {
  a: ['а', 'ɑ', 'α', 'ａ'], b: ['Ь', 'ｂ', 'ḅ'],     c: ['с', 'ϲ', 'ⅽ', 'ｃ'],
  d: ['ԁ', 'ⅾ', 'ｄ'],       e: ['е', 'ė', 'ẹ', 'ｅ'], f: ['ƒ', 'ｆ'],
  g: ['ɡ', 'ｇ'],            h: ['һ', 'ḥ', 'ｈ'],       i: ['і', 'ι', 'ｉ'],
  j: ['ϳ', 'ｊ'],            k: ['κ', 'ｋ'],            l: ['ӏ', 'ⅼ', 'ｌ'],
  m: ['м', 'ｍ'],            n: ['ո', 'ｎ'],            o: ['о', 'ο', 'ｏ'],
  p: ['р', 'ρ', 'ｐ'],       q: ['ℚ'],                 r: ['г', 'ｒ'],
  s: ['ѕ', 'ｓ'],            t: ['τ', 'ｔ'],            u: ['υ', 'ｕ'],
  v: ['ν', 'ｖ'],            w: ['ѡ', 'ｗ'],            x: ['х', 'ｘ'],
  y: ['у', 'γ', 'ｙ'],       z: ['ᴢ', 'ｚ'],
};

const ZW_CHARS = ['\u200B','\u200C','\u200D','\uFEFF'];

// ── Techniques ───────────────────────────────────────────────────────
function applyLeetspeak(word, intensity) {
  const chars = word.split('');
  const count = intensity === 'light' ? 1 : intensity === 'medium' ? Math.ceil(chars.length / 2) : chars.length;
  const idxs = [];
  for (let i = 0; i < chars.length && idxs.length < count; i++) {
    if (LEET_MAP[chars[i].toLowerCase()]) idxs.push(i);
  }
  for (let i = 0; i < chars.length && idxs.length < count; i++) {
    if (!idxs.includes(i) && LEET_MAP[chars[i].toLowerCase()]) idxs.push(i);
  }
  for (const i of idxs) {
    const opts = LEET_MAP[chars[i].toLowerCase()];
    if (opts) chars[i] = opts[Math.floor(Math.random() * opts.length)];
  }
  return chars.join('');
}

function applyUnicode(word, intensity) {
  const chars = word.split('');
  const count = intensity === 'light' ? 1 : intensity === 'medium' ? Math.ceil(chars.length / 2) : chars.length;
  const idxs = [];
  for (let i = 0; i < chars.length && idxs.length < count; i++) {
    if (UNICODE_HOMOGLYPHS[chars[i].toLowerCase()]) idxs.push(i);
  }
  for (const i of idxs) {
    const opts = UNICODE_HOMOGLYPHS[chars[i].toLowerCase()];
    if (opts) {
      const r = opts[Math.floor(Math.random() * opts.length)];
      chars[i] = chars[i] === chars[i].toUpperCase() ? r.toUpperCase() : r;
    }
  }
  return chars.join('');
}

function applyZWJ(word, intensity) {
  const chars = word.split('');
  const count = intensity === 'light' ? 1 : intensity === 'medium' ? Math.ceil(chars.length / 2) : chars.length - 1;
  const result = [];
  let ins = 0;
  for (let i = 0; i < chars.length; i++) {
    result.push(chars[i]);
    if (i < chars.length - 1 && ins < count) {
      result.push(ZW_CHARS[Math.floor(Math.random() * ZW_CHARS.length)]);
      ins++;
    }
  }
  return result.join('');
}

function applyMixedCase(word, intensity) {
  const chars = word.split('');
  if (intensity === 'light') {
    chars[Math.floor(Math.random() * chars.length)] = chars[Math.floor(Math.random() * chars.length)].toUpperCase();
  } else if (intensity === 'medium') {
    for (let i = 0; i < chars.length; i++) chars[i] = i % 2 === 0 ? chars[i].toLowerCase() : chars[i].toUpperCase();
  } else {
    for (let i = 0; i < chars.length; i++) chars[i] = Math.random() > 0.5 ? chars[i].toUpperCase() : chars[i].toLowerCase();
  }
  return chars.join('');
}

function applyPhonetic(word) {
  return word
    .replace(/ph/gi, 'f').replace(/ck/gi, 'k')
    .replace(/x/gi, 'ks').replace(/qu/gi, 'kw')
    .replace(/c(?=[eiy])/gi, 's').replace(/c/gi, 'k');
}

function applyRandom(word, intensity) {
  const fns = [applyLeetspeak, applyUnicode, applyZWJ, applyMixedCase];
  return fns[Math.floor(Math.random() * fns.length)](word, intensity);
}

const TECHNIQUE_MAP = { leetspeak: applyLeetspeak, unicode: applyUnicode, zwj: applyZWJ, mixedcase: applyMixedCase, phonetic: applyPhonetic, random: applyRandom };

// ── Public API ───────────────────────────────────────────────────────

/**
 * Find all trigger words in text.
 * @param {string} text
 * @param {string[]} [customTriggers]
 * @returns {string[]}
 */
function detectTriggers(text, customTriggers = []) {
  const all = [...DEFAULT_TRIGGERS, ...customTriggers];
  const found = [];
  const lower = text.toLowerCase();
  for (const t of all) {
    try {
      const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      if (re.test(lower)) found.push(t);
    } catch {}
  }
  return [...new Set(found)];
}

/**
 * Apply Parseltongue obfuscation to text.
 * @param {string} text
 * @param {ParseltongueConfig} config
 * @returns {ParseltongueResult}
 */
function applyParseltongue(text, config = {}) {
  const { enabled = true, technique = 'leetspeak', intensity = 'medium', customTriggers = [] } = config;
  if (!enabled) return { originalText: text, transformedText: text, triggersFound: [], techniqueUsed: technique, transformations: [] };

  const triggersFound = detectTriggers(text, customTriggers);
  if (!triggersFound.length) return { originalText: text, transformedText: text, triggersFound: [], techniqueUsed: technique, transformations: [] };

  let result = text;
  const transformations = [];
  const sorted = [...triggersFound].sort((a, b) => b.length - a.length);
  const fn = TECHNIQUE_MAP[technique] || applyLeetspeak;

  for (const trigger of sorted) {
    try {
      const re = new RegExp(`\\b(${trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');
      result = result.replace(re, (match) => {
        const transformed = fn(match, intensity);
        transformations.push({ original: match, transformed, technique });
        return transformed;
      });
    } catch {}
  }

  return {
    originalText: text,
    transformedText: result,
    triggersFound,
    techniqueUsed: technique,
    transformations,
  };
}

/**
 * Get the default config.
 * @returns {ParseltongueConfig}
 */
function getDefaultConfig() {
  return { enabled: false, technique: 'leetspeak', intensity: 'medium', customTriggers: [] };
}

/** Get human-readable technique descriptions. */
function getTechniques() {
  return [
    { id: 'leetspeak', name: 'L33tspeak', desc: 'a→4, e→3, etc.' },
    { id: 'unicode',   name: 'Unicode',   desc: 'Unicode lookalikes (cyrillic, greek)' },
    { id: 'zwj',       name: 'Zero-Width',desc: 'Invisible zero-width characters' },
    { id: 'mixedcase', name: 'MiXeD CaSe',desc: 'Disrupted casing patterns' },
    { id: 'phonetic',  name: 'Phonetic',  desc: 'Phonetic spelling substitutions' },
    { id: 'random',    name: 'Random',    desc: 'Random mix of all techniques' },
  ];
}

module.exports = { applyParseltongue, detectTriggers, getDefaultConfig, getTechniques, DEFAULT_TRIGGERS };
