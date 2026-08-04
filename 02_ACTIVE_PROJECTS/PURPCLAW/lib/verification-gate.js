'use strict';

/**
 * SPEC-003: Verified Learning Gate
 *
 * Lessons enter memory through a gated pipeline:
 * EMERGENT -> PROBATIONARY -> TRUSTED
 * Confidence scored and decayed over time.
 * HIGH_STAKES lessons require human approval to reach TRUSTED.
 *
 * Storage: .purpclaw/verified-learning/{bucket}/{lessonId}.json
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW';
const DIR  = path.join(ROOT, '.purpclaw', 'verified-learning');

const BUCKETS = ['EMERGENT', 'PROBATIONARY', 'TRUSTED', 'DECAYED'];

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_REPEATABILITY    = 3;
const MIN_CONFIDENCE       = 0.2;
const DECAY_RATE          = 0.05;
const SUCCESS_BOOST        = 0.1;
const FAILURE_PENALTY     = 0.3;

// ── Storage helpers ─────────────────────────────────────────────────────────

function safeMkdir(bucket) {
  fs.mkdirSync(path.join(DIR, bucket), { recursive: true });
}

function lessonPath(bucket, lessonId) {
  return path.join(DIR, bucket, lessonId + '.json');
}

function allLessonPaths() {
  const results = [];
  for (const bucket of BUCKETS) {
    const bucketDir = path.join(DIR, bucket);
    if (!fs.existsSync(bucketDir)) continue;
    for (const file of fs.readdirSync(bucketDir)) {
      if (!file.endsWith('.json')) continue;
      const fullPath = path.join(bucketDir, file);
      try {
        results.push({ bucket, lesson: JSON.parse(fs.readFileSync(fullPath, 'utf8')) });
      } catch {}
    }
  }
  return results;
}

// ── Hash helper ─────────────────────────────────────────────────────────────

function contentHash(lesson, context) {
  return crypto.createHash('sha256').update(lesson + '|' + context).digest('hex').slice(0, 16);
}

// ── Internal helpers ────────────────────────────────────────────────────────

function _findLesson(lessonId) {
  for (const { bucket, lesson } of allLessonPaths()) {
    if (lesson.id === lessonId) {
      lesson._bucket = bucket;  // store on object so spread preserves it
      return lesson;
    }
  }
  return null;
}

function _saveLesson(lesson) {
  const bucket = lesson.status;
  safeMkdir(bucket);
  fs.writeFileSync(lessonPath(bucket, lesson.id), JSON.stringify(lesson, null, 2));
}

function _createLesson(lesson, context, outcome, scope, source) {
  const h = contentHash(lesson, context);
  const lessonId = 'vblk_' + crypto.randomBytes(8).toString('hex');
  const now = new Date().toISOString();

  const data = {
    id: lessonId,
    lesson,
    context_pattern: context,
    scope,
    status: 'EMERGENT',
    confidence: 0.5,
    evidence: {
      successes: outcome === 'success' ? 1 : 0,
      failures: outcome === 'failure' ? 1 : 0,
      last_tested: now,
      test_proof: null,
    },
    stakes: 'LOW',
    gate: { repeatability: 'PENDING', falsifiability: 'PENDING', human_review: 'SKIPPED' },
    created_at: now,
    updated_at: now,
    source,
    context_hash: h,
  };

  safeMkdir('EMERGENT');
  fs.writeFileSync(lessonPath('EMERGENT', lessonId), JSON.stringify(data, null, 2));
  return data;
}

// ── Core API ───────────────────────────────────────────────────────────────

/**
 * Observe a lesson outcome.
 * @param {object} opts
 * @param {string} opts.lesson
 * @param {string} [opts.context]
 * @param {'success'|'failure'} opts.outcome
 * @param {string} [opts.scope]
 * @param {string} [opts.source]
 */
function observe({ lesson, context = '', outcome, scope = 'session', source = 'interaction' }) {
  const h = contentHash(lesson, context);

  // Check if this lesson already exists
  for (const { bucket, lesson: l } of allLessonPaths()) {
    const existing = l;
    if (!existing.context_hash) continue; // legacy entry without hash
    if (existing.context_hash === h) {
      return _updateLesson({ ...existing, _bucket: bucket }, outcome);
    }
  }

  // New lesson
  return _createLesson(lesson, context, outcome, scope, source);
}

function _updateLesson(existing, outcome) {
  const { _bucket, ...lesson } = existing;
  const now = new Date().toISOString();
  const isSuccess = outcome === 'success';

  lesson.evidence = lesson.evidence || {};
  if (isSuccess) lesson.evidence.successes = (lesson.evidence.successes || 0) + 1;
  else           lesson.evidence.failures = (lesson.evidence.failures || 0) + 1;
  lesson.evidence.last_tested = now;
  lesson.updated_at = now;

  // Apply confidence change
  if (isSuccess) {
    lesson.confidence = Math.min(1.0, (lesson.confidence || 0.5) + SUCCESS_BOOST);
  } else {
    lesson.confidence = Math.max(0, (lesson.confidence || 0.5) - FAILURE_PENALTY);
  }

  // Gate 1: Repeatability
  if (lesson.status === 'EMERGENT' && (lesson.evidence.successes || 0) >= MIN_REPEATABILITY) {
    lesson.status = 'PROBATIONARY';
    lesson.gate = { repeatability: 'PASS', falsifiability: 'PENDING', human_review: 'SKIPPED' };
    lesson.confidence = 0.5; // reset on promotion
  }

  // Gate 2: Falsifiability — any failure in PROBATIONARY resets to EMERGENT
  if (lesson.status === 'PROBATIONARY' && outcome === 'failure') {
    lesson.status = 'EMERGENT';
    lesson.evidence.successes = 0;
    lesson.gate = { repeatability: 'PENDING', falsifiability: 'FAIL', human_review: 'SKIPPED' };
  }

  // Confidence decay
  lesson.confidence = Math.max(0, lesson.confidence - DECAY_RATE);
  if (lesson.confidence < MIN_CONFIDENCE && lesson.status !== 'DECAYED') {
    lesson.status = 'DECAYED';
  }

  // Save to correct bucket
  const newBucket = lesson.status;
  if (_bucket !== newBucket) {
    try { fs.unlinkSync(lessonPath(_bucket, lesson.id)); } catch {}
  }
  _saveLesson(lesson);
  return lesson;
}

/**
 * Submit a falsification test result.
 * @param {string} lessonId
 * @param {{ passed: boolean, test_proof: string, human_approval?: boolean }} opts
 */
function promote(lessonId, { passed, test_proof, human_approval } = {}) {
  const lesson = _findLesson(lessonId);
  if (!lesson) return null;

  lesson.evidence.test_proof = test_proof || lesson.evidence.test_proof;
  lesson.updated_at = new Date().toISOString();

  if (lesson.status === 'PROBATIONARY' && passed) {
    lesson.gate.falsifiability = 'PASS';

    if (lesson.stakes === 'HIGH' && !human_approval) {
      lesson.gate.human_review = 'PENDING';
      // stays PROBATIONARY
    } else {
      lesson.status = 'TRUSTED';
      lesson.gate.human_review = human_approval ? 'PASS' : 'SKIPPED';
      lesson.confidence = Math.min(1.0, lesson.confidence + 0.2);
    }
  } else if (lesson.status === 'PROBATIONARY' && !passed) {
    lesson.status = 'EMERGENT';
    lesson.evidence.successes = 0;
    lesson.gate.falsifiability = 'FAIL';
  }

  // Remove old bucket files so _findLesson always finds the latest
  const newBucket = lesson.status;
  for (const b of BUCKETS) {
    if (b === newBucket) continue;
    try { fs.unlinkSync(lessonPath(b, lesson.id)); } catch {}
  }

  _saveLesson(lesson);
  return lesson;
}

/**
 * Check if a lesson is trusted for the agent loop.
 * @param {string} lessonId
 * @returns {boolean}
 */
function isTrusted(lessonId) {
  const lesson = _findLesson(lessonId);
  return !!(lesson && lesson.status === 'TRUSTED');
}

/**
 * Get all trusted lessons matching context and scope.
 * @param {string} contextPattern
 * @param {string} scope
 * @returns {object[]}
 */
function getTrusted(contextPattern, scope) {
  const trusted = [];
  const trustedDir = path.join(DIR, 'TRUSTED');
  if (!fs.existsSync(trustedDir)) return [];

  for (const file of fs.readdirSync(trustedDir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const lesson = JSON.parse(fs.readFileSync(path.join(trustedDir, file), 'utf8'));
      if (lesson.scope !== scope && scope !== 'app') continue;
      if (lesson.context_pattern && !lesson.context_pattern.includes(contextPattern)) continue;
      trusted.push(lesson);
    } catch {}
  }
  return trusted;
}

/**
 * Get current status of a lesson.
 * @param {string} lessonId
 * @returns {object|null}
 */
function status(lessonId) {
  const lesson = _findLesson(lessonId);
  if (!lesson) return null;
  return {
    id: lesson.id,
    status: lesson.status,
    confidence: lesson.confidence,
    gate: lesson.gate,
    stakes: lesson.stakes,
    scope: lesson.scope,
    evidence: lesson.evidence,
  };
}

/**
 * Apply confidence decay to all lessons (called by idle engine).
 * @returns {number} count of lessons that decayed
 */
function decayAll() {
  let count = 0;
  for (const { bucket, lesson } of allLessonPaths()) {
    if (lesson.status === 'DECAYED') continue;
    const wasDecayed = lesson.confidence <= MIN_CONFIDENCE;
    lesson.confidence = Math.max(0, lesson.confidence - DECAY_RATE);
    if (lesson.confidence < MIN_CONFIDENCE) {
      lesson.status = 'DECAYED';
      count++;
    }
    if (lesson.confidence !== wasDecayed || bucket !== lesson.status) {
      _saveLesson(lesson);
    }
  }
  return count;
}

// ── Module API ─────────────────────────────────────────────────────────────

module.exports = {
  observe,
  promote,
  isTrusted,
  getTrusted,
  status,
  decayAll,
  MIN_REPEATABILITY,
  MIN_CONFIDENCE,
  DECAY_RATE,
  SUCCESS_BOOST,
  FAILURE_PENALTY,
};
