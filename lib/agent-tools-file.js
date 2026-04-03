// ═══════════════════════════════════════════════════════════════════════════
// PURPCLAW — Agent File Tools
//
// Core tools for file operations. All must:
// - Return structured {ok, data, error} responses
// - Track operations in session
// - Respect working directory
// - Handle errors cleanly
//
// Tool priority: read → write → patch → diff → glob → grep
//
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ENCODING = 'utf8';

// ─── Read ─────────────────────────────────────────────────────────────────

function readFile(filePath, options = {}) {
  const absPath = path.resolve(filePath);
  const { offset = 0, limit = null, asLines = false } = options;

  try {
    if (!fs.existsSync(absPath)) {
      return { ok: false, error: `File not found: ${absPath}` };
    }

    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
      return { ok: false, error: `Is a directory: ${absPath}` };
    }

    // Size guard — no binary files
    if (stat.size > 2 * 1024 * 1024) {
      return { ok: false, error: `File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Use glob to find specific section.` };
    }

    let content = fs.readFileSync(absPath, ENCODING);

    if (asLines) {
      const lines = content.split('\n');
      return {
        ok: true,
        data: {
          path: absPath,
          totalLines: lines.length,
          lines: limit ? lines.slice(offset, offset + limit) : lines.slice(offset),
          truncated: limit && lines.length > limit
        }
      };
    }

    return {
      ok: true,
      data: {
        path: absPath,
        size: stat.size,
        lines: content.split('\n').length,
        content: content.substring(0, 100000) // cap at 100k chars
      }
    };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Write ─────────────────────────────────────────────────────────────────

function writeFile(filePath, content, options = {}) {
  const absPath = path.resolve(filePath);
  const { mkdir = false, append = false } = options;

  try {
    // Ensure directory exists
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) {
      if (mkdir) {
        fs.mkdirSync(dir, { recursive: true });
      } else {
        return { ok: false, error: `Directory does not exist: ${dir}` };
      }
    }

    if (append) {
      fs.appendFileSync(absPath, content, ENCODING);
    } else {
      fs.writeFileSync(absPath, content, ENCODING);
    }

    const stat = fs.statSync(absPath);
    return {
      ok: true,
      data: {
        path: absPath,
        size: stat.size,
        lines: content.split('\n').length,
        written: !append
      }
    };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Patch (targeted find/replace) ─────────────────────────────────────────

function patchFile(filePath, oldString, newString, options = {}) {
  const { replaceAll = false, force = false } = options;
  const absPath = path.resolve(filePath);

  try {
    if (!fs.existsSync(absPath)) {
      return { ok: false, error: `File not found: ${absPath}` };
    }

    const content = fs.readFileSync(absPath, ENCODING);

    if (!content.includes(oldString)) {
      if (force) {
        return { ok: false, error: 'old_string not found in file — patch failed' };
      }
      return { ok: false, error: `old_string not found in ${absPath}` };
    }

    const patched = replaceAll
      ? content.split(oldString).join(newString)
      : content.replace(oldString, newString);

    if (patched === content) {
      return { ok: false, error: 'No change after patch' };
    }

    fs.writeFileSync(absPath, patched, ENCODING);

    const oldLines = content.split('\n').length;
    const newLines = patched.split('\n').length;

    return {
      ok: true,
      data: {
        path: absPath,
        changes: {
          linesAdded: newLines - oldLines,
          linesRemoved: oldLines - newLines,
          replaceAll
        }
      }
    };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Diff ──────────────────────────────────────────────────────────────────

function diffFile(filePath, options = {}) {
  const absPath = path.resolve(filePath);
  const { computeHash = false } = options;

  try {
    if (!fs.existsSync(absPath)) {
      return { ok: false, error: `File not found: ${absPath}` };
    }

    const stat = fs.statSync(absPath);
    const content = fs.readFileSync(absPath, ENCODING);
    const lines = content.split('\n');

    let hash = null;
    if (computeHash) {
      const crypto = require('crypto');
      hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    }

    return {
      ok: true,
      data: {
        path: absPath,
        size: stat.size,
        lines: lines.length,
        hash,
        firstLine: lines[0] || '',
        lastLine: lines[lines.length - 1] || ''
      }
    };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function diffTwo(pathA, pathB) {
  const absA = path.resolve(pathA);
  const absB = path.resolve(pathB);

  try {
    const contentA = fs.existsSync(absA) ? fs.readFileSync(absA, ENCODING) : '';
    const contentB = fs.existsSync(absB) ? fs.readFileSync(absB, ENCODING) : '';

    if (contentA === contentB) {
      return { ok: true, data: { identical: true } };
    }

    const linesA = contentA.split('\n');
    const linesB = contentB.split('\n');

    return {
      ok: true,
      data: {
        pathA: absA,
        pathB: absB,
        identical: false,
        linesA: linesA.length,
        linesB: linesB.length,
        sizeA: contentA.length,
        sizeB: contentB.length
      }
    };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Glob ─────────────────────────────────────────────────────────────────

function globFiles(pattern, options = {}) {
  const { cwd = process.cwd(), limit = 100, types = 'file' } = options;

  try {
    // Simple glob implementation — no external deps
    const results = [];

    function walkDir(dir, maxDepth = 5, depth = 0) {
      if (depth > maxDepth) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== '.git') {
              walkDir(fullPath, maxDepth, depth + 1);
            }
          } else if (entry.isFile()) {
            if (matchPattern(entry.name, pattern)) {
              results.push({
                path: fullPath,
                name: entry.name,
                size: fs.statSync(fullPath).size,
                relative: path.relative(cwd, fullPath)
              });
              if (results.length >= limit) return;
            }
          }
        }
      } catch {}
    }

    function matchPattern(name, pattern) {
      if (pattern === '*') return true;
      if (pattern === '**/*') return true;
      // Simple wildcard
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      return regex.test(name);
    }

    walkDir(path.resolve(cwd));

    return {
      ok: true,
      data: {
        pattern,
        cwd: path.resolve(cwd),
        count: results.length,
        files: results
      }
    };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Grep ─────────────────────────────────────────────────────────────────

function grepFiles(query, options = {}) {
  const { cwd = process.cwd(), filePattern = '*', caseSensitive = false, limit = 100, context = 0 } = options;

  try {
    // Use grep if available, otherwise fallback to manual
    const results = [];
    const regex = new RegExp(query, caseSensitive ? '' : 'i');

    function walkDir(dir, maxDepth = 5, depth = 0) {
      if (depth > maxDepth || results.length >= limit) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== '.git') {
              walkDir(fullPath, maxDepth, depth + 1);
            }
          } else if (entry.isFile()) {
            if (!matchGlob(entry.name, filePattern)) continue;
            try {
              const stat = fs.statSync(fullPath);
              if (stat.size > 5 * 1024 * 1024) continue; // skip >5MB
              const content = fs.readFileSync(fullPath, ENCODING);
              const lines = content.split('\n');

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if ((caseSensitive && line.includes(query)) || (!caseSensitive && line.toLowerCase().includes(query.toLowerCase()))) {
                  results.push({
                    path: fullPath,
                    line: i + 1,
                    text: line.trim().substring(0, 200),
                    context: context > 0 ? lines.slice(Math.max(0, i - context), i + context + 1) : null
                  });
                  if (results.length >= limit) return;
                }
              }
            } catch {}
          }
        }
      } catch {}
    }

    function matchGlob(name, pattern) {
      if (pattern === '*') return true;
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\\./g, '.') + '$', 'i');
      return regex.test(name);
    }

    walkDir(path.resolve(cwd));

    return {
      ok: true,
      data: {
        query,
        cwd: path.resolve(cwd),
        count: results.length,
        matches: results
      }
    };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Bash ─────────────────────────────────────────────────────────────────

function runBash(command, options = {}) {
  const { cwd = process.cwd(), timeout = 30, env = {}, capture = true } = options;

  try {
    const start = Date.now();
    const result = execSync(command, {
      cwd: path.resolve(cwd),
      encoding: 'utf8',
      timeout: timeout * 1000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, ...env },
      windowsHide: true
    });

    return {
      ok: true,
      data: {
        command,
        cwd: path.resolve(cwd),
        duration: Date.now() - start,
        stdout: capture ? result.substring(0, 50000) : '[captured]',
        exitCode: 0
      }
    };

  } catch (err) {
    if (err.status !== undefined) {
      // Command ran but failed
      return {
        ok: false,
        data: {
          command,
          cwd: path.resolve(cwd),
          duration: 0,
          stdout: err.stdout ? err.stdout.toString().substring(0, 50000) : '',
          stderr: err.stderr ? err.stderr.toString().substring(0, 10000) : '',
          exitCode: err.status
        },
        error: `Exit code: ${err.status}`
      };
    }
    return { ok: false, error: err.message };
  }
}

// ─── Export ────────────────────────────────────────────────────────────────

module.exports = {
  readFile,
  writeFile,
  patchFile,
  diffFile,
  diffTwo,
  globFiles,
  grepFiles,
  runBash
};