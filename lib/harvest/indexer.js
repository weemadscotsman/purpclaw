'use strict';
/**
 * lib/harvest/indexer.js — Stores harvested content for search + recall.
 * Pushes into training buffer, cognitive spine memory, and a local search index.
 */
const fs = require('fs');
const path = require('path');

const INDEX_FILE = path.join(__dirname, '..', '..', 'agent_work', 'harvest-index.json');
const LEDGER_FILE = path.join(__dirname, '..', '..', 'agent_work', 'harvest-ledger.jsonl');

function appendToBuffer(entry, trainingIngest) {
  if (!trainingIngest) return false;
  try {
    const { ingestDirectory } = trainingIngest;
    // Write directly as an NDJSON line to today's buffer
    const RAW_DIR = process.env.PURPCLAW_TRAINING_DIR 
      ? path.join(process.env.PURPCLAW_TRAINING_DIR, 'raw') 
      : 'E:/training/raw';
    if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });
    const dateStr = new Date().toISOString().slice(0, 10);
    const bufferFile = path.join(RAW_DIR, `${dateStr}.ndjson`);
    fs.appendFileSync(bufferFile, JSON.stringify(entry) + '\n');
    return true;
  } catch { return false; }
}

function addToLedger(entry) {
  try {
    const dir = path.dirname(LEDGER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LEDGER_FILE, JSON.stringify(entry) + '\n');
    return true;
  } catch { return false; }
}

function updateIndex(fileEntries) {
  try {
    let index = { files: [], categories: {}, totalSize: 0, updatedAt: null };
    if (fs.existsSync(INDEX_FILE)) {
      try { index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); } catch {}
    }
    
    for (const entry of fileEntries) {
      index.files.push({
        path: entry.path,
        ext: entry.ext,
        category: entry.category,
        hash: entry.hash,
        size: entry.size,
        modified: entry.modified,
        ingestedAt: new Date().toISOString(),
      });
      index.categories[entry.category] = (index.categories[entry.category] || 0) + 1;
      index.totalSize += entry.size;
    }
    index.updatedAt = new Date().toISOString();
    
    // Keep only last 100k entries to avoid unbounded growth
    if (index.files.length > 100000) {
      index.files = index.files.slice(-100000);
    }
    
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
    return true;
  } catch { return false; }
}

function searchIndex(query) {
  try {
    if (!fs.existsSync(INDEX_FILE)) return { ok: true, results: [], count: 0 };
    const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    const lower = query.toLowerCase();
    const results = index.files.filter(f => {
      return f.path.toLowerCase().includes(lower) || f.category.includes(lower) || f.ext === query;
    }).slice(0, 100);
    return { ok: true, results, count: results.length };
  } catch (e) {
    return { ok: false, error: e.message, results: [], count: 0 };
  }
}

function getStatus() {
  try {
    let index = { files: [], categories: {}, totalSize: 0 };
    if (fs.existsSync(INDEX_FILE)) {
      try { index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); } catch {}
    }
    let ledgerEntries = 0;
    if (fs.existsSync(LEDGER_FILE)) {
      ledgerEntries = fs.readFileSync(LEDGER_FILE, 'utf8').split('\n').filter(Boolean).length;
    }
    return {
      indexedFiles: index.files.length,
      categories: index.categories,
      totalSize: index.totalSize,
      ledgerEntries,
      updatedAt: index.updatedAt,
    };
  } catch {
    return { indexedFiles: 0, categories: {}, totalSize: 0, ledgerEntries: 0, updatedAt: null };
  }
}

module.exports = { appendToBuffer, addToLedger, updateIndex, searchIndex, getStatus, INDEX_FILE, LEDGER_FILE };
