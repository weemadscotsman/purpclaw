'use strict';

const fs = require('fs');
const path = require('path');

function businessDir(rootDir) {
  return path.join(rootDir, 'agent_work', 'business');
}

function ensureBusinessDir(rootDir) {
  const dir = businessDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson(rootDir, name, fallback) {
  const file = path.join(businessDir(rootDir), name);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(rootDir, name, value) {
  const dir = ensureBusinessDir(rootDir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
  return file;
}

function appendJsonl(rootDir, name, value) {
  const dir = ensureBusinessDir(rootDir);
  const file = path.join(dir, name);
  fs.appendFileSync(file, JSON.stringify(value) + '\n', 'utf8');
  return file;
}

function readJsonl(rootDir, name) {
  const file = path.join(businessDir(rootDir), name);
  try {
    return fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

module.exports = {
  businessDir,
  ensureBusinessDir,
  readJson,
  writeJson,
  appendJsonl,
  readJsonl,
};
