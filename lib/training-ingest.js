'use strict';
/**
 * lib/training-ingest.js — Agnostic content ingestion for the training buffer.
 * Scans directories, detects file types, converts to training examples.
 * 
 * Supported file types:
 *   .md, .txt, .json, .csv, .yaml, .yml, .toml, .xml, .html, .css, .js, .ts,
 *   .jsx, .tsx, .py, .rb, .go, .rs, .java, .cpp, .c, .h, .hpp, .sh, .bash,
 *   .ps1, .bat, .sql, .r, .m, .swift, .kt, .scala, .lua, .php, .pl, .pm,
 *   .cfg, .conf, .ini, .env, .gitignore, .dockerfile, .proto, .gradle,
 *   .pdf, .epub (text extraction), .srt, .vtt (transcript format)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const TRAINING_DIR = process.env.PURPCLAW_TRAINING_DIR || 'E:/training';
const RAW_DIR = path.join(TRAINING_DIR, 'raw');

// File types we can ingest, grouped by category
const SUPPORTED_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.csv', '.yaml', '.yml', '.toml', '.xml',
  '.html', '.css', '.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go',
  '.rs', '.java', '.cpp', '.c', '.h', '.hpp', '.sh', '.bash', '.ps1',
  '.bat', '.sql', '.r', '.m', '.swift', '.kt', '.scala', '.lua', '.php',
  '.pl', '.pm', '.cfg', '.conf', '.ini', '.gitignore', '.proto', '.gradle',
  '.srt', '.vtt', '.log',
]);

// Directories to skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.next', 'build', 'dist',
  '.cache', '.npm', '.yarn', 'venv', '.venv', '.env', 'env',
  'agent_work', 'logs', '.pm2', '.claude', '.hermes',
]);

// Max file size to process (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Scan a directory and return all supported files
 */
function scanDirectory(dirPath, maxFiles = 5000) {
  const results = [];
  let count = 0;

  function walk(current) {
    if (count >= maxFiles) return;
    try {
      for (const entry of fs.readdirSync(current)) {
        if (count >= maxFiles) return;
        const full = path.join(current, entry);
        let stat;
        try { stat = fs.statSync(full); } catch { continue; }

        if (stat.isDirectory()) {
          if (!SKIP_DIRS.has(entry) && !entry.startsWith('.')) {
            walk(full);
          }
        } else if (stat.isFile() && stat.size > 0 && stat.size <= MAX_FILE_SIZE) {
          const ext = path.extname(entry).toLowerCase();
          if (SUPPORTED_EXTENSIONS.has(ext)) {
            results.push({ path: full, ext, size: stat.size });
            count++;
          }
        }
      }
    } catch {}
  }

  walk(dirPath);
  return results;
}

/**
 * Read a file and create a training entry
 */
function fileToTrainingEntry(filePath, ext) {
  try {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (!content || content.length < 50) return null;

    const fileName = path.basename(filePath);
    const relPath = path.relative(path.parse(filePath).root, filePath);
    const now = new Date().toISOString();

    // Categorize by extension
    let category = 'text';
    if (['.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.cpp', '.c', '.h', '.hpp', '.sh', '.bash', '.ps1', '.bat', '.sql', '.r', '.m', '.swift', '.kt', '.scala', '.lua', '.php', '.pl', '.pm', '.proto', '.gradle'].includes(ext)) {
      category = 'code';
    } else if (['.json', '.yaml', '.yml', '.toml', '.xml', '.cfg', '.conf', '.ini', '.env', '.gitignore', '.dockerfile'].includes(ext)) {
      category = 'config';
    } else if (['.csv'].includes(ext)) {
      category = 'data';
    } else if (['.md', '.txt', '.html'].includes(ext)) {
      category = 'documentation';
    } else if (['.srt', '.vtt', '.log'].includes(ext)) {
      category = 'log';
    }

    return {
      ts: Date.now(),
      source: 'ingest',
      file: relPath,
      category,
      content: content.substring(0, 8000),  // cap at 8k chars
      metadata: {
        fileName,
        ext,
        size: content.length,
        lines: content.split('\n').length,
        category,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Ingest a directory: scan, convert, append to training buffer
 */
function ingestDirectory(dirPath, options = {}) {
  const maxFiles = options.maxFiles || 5000;
  const dryRun = options.dryRun || false;
  const search = options.search || '';

  if (!fs.existsSync(dirPath)) {
    return { ok: false, error: `Directory not found: ${dirPath}` };
  }

  // Scan
  const files = scanDirectory(dirPath, maxFiles);
  let filtered = files;

  // Apply search filter
  if (search) {
    const lower = search.toLowerCase();
    filtered = files.filter(f => f.path.toLowerCase().includes(lower));
  }

  const stats = { scanned: files.length, matched: filtered.length, ingested: 0, skipped: 0, errors: 0, byCategory: {} };

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      stats,
      samples: filtered.slice(0, 10).map(f => ({
        path: f.path,
        ext: f.ext,
        size: f.size,
      })),
      message: `Dry run: ${files.length} files found, ${filtered.length} match filter. Run without --dry-run to ingest.`,
    };
  }

  // Ensure raw dir exists
  if (!fs.existsSync(RAW_DIR)) {
    fs.mkdirSync(RAW_DIR, { recursive: true });
  }

  // Today's buffer file
  const dateStr = new Date().toISOString().slice(0, 10);
  const bufferFile = path.join(RAW_DIR, `${dateStr}.ndjson`);
  const stream = fs.createWriteStream(bufferFile, { flags: 'a' });

  for (const file of filtered) {
    try {
      const entry = fileToTrainingEntry(file.path, file.ext);
      if (entry) {
        stream.write(JSON.stringify(entry) + '\n');
        stats.ingested++;
        stats.byCategory[entry.category] = (stats.byCategory[entry.category] || 0) + 1;
      } else {
        stats.skipped++;
      }
    } catch {
      stats.errors++;
    }
  }

  stream.end();

  return {
    ok: true,
    stats,
    bufferFile,
    message: `Ingested ${stats.ingested} files into ${bufferFile}. Categories: ${Object.entries(stats.byCategory).map(([k, v]) => `${k}=${v}`).join(', ')}`,
  };
}

/**
 * Search the training buffer for matching entries
 */
function searchBuffer(query) {
  const lower = query.toLowerCase();
  const results = [];

  if (!fs.existsSync(RAW_DIR)) {
    return { ok: true, results: [], message: 'No training data yet.' };
  }

  for (const f of fs.readdirSync(RAW_DIR).sort().reverse().slice(0, 5)) {
    if (!f.endsWith('.ndjson')) continue;
    const fpath = path.join(RAW_DIR, f);
    try {
      const lines = fs.readFileSync(fpath, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const content = (entry.content || entry.input?.content || '').toLowerCase();
          if (content.includes(lower)) {
            results.push({
              file: f,
              source: entry.source || 'unknown',
              category: entry.category || entry.metadata?.category || 'unknown',
              preview: (entry.content || '').substring(0, 200),
              ts: entry.ts,
            });
            if (results.length >= 50) break;
          }
        } catch {}
      }
    } catch {}
    if (results.length >= 50) break;
  }

  return { ok: true, results, count: results.length };
}

module.exports = { ingestDirectory, searchBuffer, scanDirectory, SUPPORTED_EXTENSIONS };
