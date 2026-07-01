'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HIVEMIND_DIR = path.join(ROOT, '.purpclaw', 'hivemind');
const TRACES_DIR = path.join(HIVEMIND_DIR, 'traces');
const SKILLS_DIR = path.join(HIVEMIND_DIR, 'skills');
const INDEX_FILE = path.join(HIVEMIND_DIR, 'index.json');
const RULES_FILE = path.join(HIVEMIND_DIR, 'promotion-rules.json');
const SCORES_FILE = path.join(HIVEMIND_DIR, 'skill-scores.json');
const EVENTS_FILE = path.join(HIVEMIND_DIR, 'events.jsonl');
const SPRING_INDEX_FILE = path.join(HIVEMIND_DIR, 'spring-index.json');
const DOCTRINE_DIR = path.join(HIVEMIND_DIR, 'doctrine');
const PRINCIPLES_DIR = path.join(HIVEMIND_DIR, 'principles');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function ensureHivemindDirs() {
  ensureDir(HIVEMIND_DIR);
  ensureDir(TRACES_DIR);
  ensureDir(SKILLS_DIR);
  ensureDir(DOCTRINE_DIR);
  ensureDir(PRINCIPLES_DIR);
  ensureDefaults();
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

function appendJsonl(file, row) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf8');
}

function defaultRules() {
  return {
    schema: 'purpclaw.hivemind.promotion-rules.v1',
    min_success_count: 2,
    min_score: 0.75,
    require_tests_passed: false,
    require_evidence: true,
    allow_partial: false,
    reject_if_rollback: true,
    reject_if_destructive: true,
    max_files_touched: 16,
    max_error_count: 0,
    max_skills_loaded: 3,
    decay_half_life_days: 45,
    autoskill: true,
    antiskills: true,
    doctrine_min_success_count: 7,
    doctrine_min_score: 0.93,
    spring_min_trust: 0.72,
    max_promotable_spring_rank: 2,
    spring_doctrine_enabled: true
  };
}

function ensureDefaults() {
  if (!fs.existsSync(INDEX_FILE)) writeJsonAtomic(INDEX_FILE, { schema: 'purpclaw.hivemind.index.v1', skills: {}, antiskills: {}, doctrines: {}, updated_at: new Date().toISOString() });
  if (!fs.existsSync(RULES_FILE)) writeJsonAtomic(RULES_FILE, defaultRules());
  if (!fs.existsSync(SCORES_FILE)) writeJsonAtomic(SCORES_FILE, { schema: 'purpclaw.hivemind.skill-scores.v1', scores: {}, updated_at: new Date().toISOString() });
  if (!fs.existsSync(SPRING_INDEX_FILE)) writeJsonAtomic(SPRING_INDEX_FILE, {
    schema: 'purpclaw.spring.index.v1',
    doctrine: 'PURPCLAW learns from verified experience, not recycled output.',
    records: {},
    updated_at: new Date().toISOString()
  });
}


module.exports = {
  ROOT,
  HIVEMIND_DIR,
  TRACES_DIR,
  SKILLS_DIR,
  INDEX_FILE,
  RULES_FILE,
  SCORES_FILE,
  EVENTS_FILE,
  SPRING_INDEX_FILE,
  DOCTRINE_DIR,
  PRINCIPLES_DIR,
  ensureDir,
  ensureHivemindDirs,
  readJson,
  writeJsonAtomic,
  appendJsonl,
  defaultRules
};
