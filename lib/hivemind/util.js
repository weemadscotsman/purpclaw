'use strict';

const crypto = require('crypto');

const STOP = new Set(['the','and','for','with','that','this','from','into','onto','over','under','then','than','have','has','had','will','would','could','should','shall','your','their','there','were','been','being','just','only','also','about','after','before','between','within','without','through','using','used','use','run','runs','task','work','make','build','create','fix','thing','stuff','system','agent','agents','purpclaw']);

function slugify(text, fallback = 'skill') {
  const s = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return s || fallback;
}

function hash(input, len = 10) {
  return crypto.createHash('sha256').update(String(input || '')).digest('hex').slice(0, len);
}

function tokenize(text) {
  const words = String(text || '').toLowerCase().match(/[a-z][a-z0-9_-]{2,32}/g) || [];
  return [...new Set(words.filter(w => !STOP.has(w)))];
}

function overlapScore(a, b) {
  const aa = new Set(Array.isArray(a) ? a : tokenize(a));
  const bb = new Set(Array.isArray(b) ? b : tokenize(b));
  if (!aa.size || !bb.size) return 0;
  let hit = 0;
  for (const token of aa) if (bb.has(token)) hit++;
  return hit / Math.max(aa.size, bb.size);
}

function clamp(n, min = 0, max = 1) {
  n = Number(n);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function nowIso() { return new Date().toISOString(); }

function ageDays(iso) {
  const t = new Date(iso || 0).getTime();
  if (!Number.isFinite(t) || t <= 0) return 9999;
  return (Date.now() - t) / 86400000;
}

function decayMultiplier(iso, halfLifeDays = 45) {
  const days = Math.max(0, ageDays(iso));
  return Math.pow(0.5, days / Math.max(1, halfLifeDays));
}

function safeString(value, limit = 1000) {
  if (typeof value === 'string') return value.slice(0, limit);
  try { return JSON.stringify(value).slice(0, limit); } catch { return String(value || '').slice(0, limit); }
}

module.exports = { slugify, hash, tokenize, overlapScore, clamp, uniq, nowIso, ageDays, decayMultiplier, safeString };
