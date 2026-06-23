'use strict';
/**
 * lib/harvest/crawler.js — Scans drives/folders, fingerprints, classifies files.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.next', 'build', 'dist', '.cache',
  '.npm', '.yarn', 'venv', '.venv', '.env', 'env', 'agent_work', 'logs',
  '.pm2', '.claude', '.hermes', '.gitlab', 'target', 'bin', 'obj',
  '.gradle', '.m2', '.tox', '.eggs', 'egg-info', 'site-packages',
  '__MACOSX', '.DS_Store', 'Thumbs.db',
]);

const SKIP_EXTS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.o', '.obj', '.lib', '.a',
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp',
  '.mp3', '.wav', '.mp4', '.mov', '.avi', '.mkv', '.flac',
  '.zip', '.7z', '.rar', '.tar', '.gz', '.bz2',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024;  // 50MB
const MAX_FILES_PER_RUN = 50000;

function scanDirectory(dirPath, options = {}) {
  const { progress } = options;
  const results = [];
  let count = 0;
  const errors = [];

  function walk(current, depth = 0) {
    if (count >= MAX_FILES_PER_RUN) return;
    if (depth > 15) return;  // max depth
    try {
      for (const entry of fs.readdirSync(current)) {
        if (count >= MAX_FILES_PER_RUN) return;
        const full = path.join(current, entry);
        let stat;
        try { stat = fs.statSync(full); } catch { continue; }

        if (stat.isDirectory()) {
          if (!SKIP_DIRS.has(entry) && !entry.startsWith('.')) {
            walk(full, depth + 1);
          }
        } else if (stat.isFile() && stat.size > 0 && stat.size <= MAX_FILE_SIZE) {
          const ext = path.extname(entry).toLowerCase();
          if (!SKIP_EXTS.has(ext)) {
            // Hash first 64KB for dedup fingerprint
            let hash = '';
            try {
              const fd = fs.openSync(full, 'r');
              const buf = Buffer.alloc(65536);
              const bytes = fs.readSync(fd, buf, 0, 65536, 0);
              fs.closeSync(fd);
              hash = crypto.createHash('sha256').update(buf.slice(0, bytes)).digest('hex').slice(0, 16);
            } catch { hash = Date.now().toString(36); }

            results.push({
              path: full,
              ext,
              size: stat.size,
              modified: stat.mtimeMs,
              hash,
            });
            count++;
            if (progress && count % 5000 === 0) {
              progress(`  ${count} files...`);
            }
          }
        }
      }
    } catch (e) {
      errors.push({ path: current, error: e.message });
    }
  }

  walk(dirPath);
  return { files: results, errors, count: results.length };
}

function classifyFile(file) {
  const ext = file.ext;
  
  if (['.txt', '.md', '.rtf'].includes(ext)) return 'document';
  if (['.pdf'].includes(ext)) return 'pdf';
  if (['.docx', '.doc'].includes(ext)) return 'document-word';
  if (['.xlsx', '.xls', '.csv'].includes(ext)) return 'spreadsheet';
  if (['.json', '.xml', '.yaml', '.yml', '.toml'].includes(ext)) return 'data';
  if (['.js', '.ts', '.tsx', '.jsx', '.py', '.rb', '.go', '.rs', '.java',
       '.cpp', '.c', '.h', '.hpp', '.sh', '.bash', '.ps1', '.bat',
       '.sql', '.kt', '.swift', '.lua', '.php', '.pl', '.pm', '.r',
       '.scala', '.m', '.proto', '.gradle'].includes(ext)) return 'code';
  if (['.html', '.htm', '.css'].includes(ext)) return 'web';
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff'].includes(ext)) return 'image';
  if (['.mp3', '.wav', '.m4a', '.flac', '.ogg'].includes(ext)) return 'audio';
  if (['.mp4', '.mov', '.mkv', '.webm', '.avi'].includes(ext)) return 'video';
  if (['.zip', '.7z', '.rar', '.tar', '.gz'].includes(ext)) return 'archive';
  if (['.srt', '.vtt', '.log'].includes(ext)) return 'log';
  return 'other';
}

module.exports = { scanDirectory, classifyFile, SKIP_DIRS, SKIP_EXTS };
