'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// ── ANSI colours ──────────────────────────────────────────────────────────────
const isTTY = process.stdout.isTTY;
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', gray: '\x1b[90m'
};
const col = (c, s) => isTTY ? c + s + C.reset : s;

// ── Constants ────────────────────────────────────────────────────────────────
const INDEX_CACHE_TTL_MS = 3600 * 1000; // 1 hour

// ── Path resolvers (dynamic, profile-aware) ─────────────────────────────────
function _resolve(name) {
  const resolvers = {
    HERMES_HOME: () => process.env.PURPCLAW_HOME || path.join(os.homedir(), '.purpclaw'),
    SKILLS_DIR: () => path.join(_resolve('HERMES_HOME'), 'skills'),
    HUB_DIR: () => path.join(_resolve('SKILLS_DIR'), '.hub'),
    LOCK_FILE: () => path.join(_resolve('HUB_DIR'), 'lock.json'),
    QUARANTINE_DIR: () => path.join(_resolve('HUB_DIR'), 'quarantine'),
    AUDIT_LOG: () => path.join(_resolve('HUB_DIR'), 'audit.log'),
    TAPS_FILE: () => path.join(_resolve('HUB_DIR'), 'taps.json'),
    INDEX_CACHE_DIR: () => path.join(_resolve('HUB_DIR'), 'index-cache'),
  };
  return resolvers[name] ? resolvers[name]() : null;
}

// Backwards-compatible helpers
function hubDir() { return _resolve('HUB_DIR'); }
function lockFile() { return _resolve('LOCK_FILE'); }
function quarantineDir() { return _resolve('QUARANTINE_DIR'); }
function auditLog() { return _resolve('AUDIT_LOG'); }
function tapsFile() { return _resolve('TAPS_FILE'); }
function indexCacheDir() { return _resolve('INDEX_CACHE_DIR'); }
function skillsDir() { return _resolve('SKILLS_DIR'); }

// ── Hub directory setup ──────────────────────────────────────────────────────
function ensureHubDirs() {
  const dirs = [hubDir(), quarantineDir(), indexCacheDir()];
  for (const d of dirs) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
  if (!fs.existsSync(lockFile())) {
    fs.writeFileSync(lockFile(), JSON.stringify({ version: 1, installed: {} }) + '\n', 'utf8');
  }
  if (!fs.existsSync(auditLog())) fs.closeSync(fs.openSync(auditLog(), 'a'));
  if (!fs.existsSync(tapsFile())) {
    fs.writeFileSync(tapsFile(), JSON.stringify({ taps: [] }) + '\n', 'utf8');
  }
}

// ── Audit log ───────────────────────────────────────────────────────────────
function appendAuditLog(action, skillName, source, trustLevel, verdict, extra) {
  ensureHubDirs();
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const parts = [timestamp, action, skillName, `${source}:${trustLevel}`, verdict];
  if (extra) parts.push(extra);
  const line = parts.join(' ') + '\n';
  try {
    fs.appendFileSync(auditLog(), line, 'utf8');
  } catch (_) { /* best-effort */ }
}

// ── Index cache helpers ─────────────────────────────────────────────────────
function readIndexCache(key) {
  try {
    const cacheDir = indexCacheDir();
    if (!fs.existsSync(cacheDir)) return null;
    const cacheFile = path.join(cacheDir, `${key}.json`);
    if (!fs.existsSync(cacheFile)) return null;
    const stat = fs.statSync(cacheFile);
    if (Date.now() - stat.mtimeMs > INDEX_CACHE_TTL_MS) return null;
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch (_) { return null; }
}

function writeIndexCache(key, data) {
  try {
    ensureHubDirs();
    const cacheFile = path.join(indexCacheDir(), `${key}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf8');
    // Write .ignore to prevent search tools from indexing cached community content
    const ignoreFile = path.join(hubDir(), '.ignore');
    if (!fs.existsSync(ignoreFile)) {
      try { fs.writeFileSync(ignoreFile, '# Exclude hub internals\n*\n', 'utf8'); } catch (_) {}
    }
  } catch (_) { /* best-effort */ }
}

// ── Path validation ─────────────────────────────────────────────────────────
const _VALID_NAME_RE = /^[a-z][a-z0-9_-]*$/;

function validateSkillName(name) {
  if (typeof name !== 'string') throw new Error('Skill name must be a string');
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Skill name cannot be empty');
  if (!_VALID_NAME_RE.test(trimmed)) {
    throw new Error(`Invalid skill name: ${name}`);
  }
  return trimmed;
}

function normalizeLockInstallPath(installPath, skillName) {
  const normalized = installPath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
  const parts = normalized.split('/');
  if (!parts.length || parts[parts.length - 1] !== skillName) {
    throw new Error(`Install path must end with skill name: ${skillName}`);
  }
  return normalized;
}

function resolveLockInstallPath(installPath, skillName) {
  const normalized = normalizeLockInstallPath(installPath, skillName);
  const skillsRoot = path.resolve(skillsDir());
  let target = path.resolve(skillsDir());
  for (const part of normalized.split('/')) {
    if (!part) continue;
    target = path.join(target, part);
    try {
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) throw new Error(`Unsafe install path: symlink component in ${installPath}`);
      // Check for junction on Windows
      if (process.platform === 'win32' && stat.isDirectory()) {
        const real = fs.realpathSync(target);
        if (!real.startsWith(skillsRoot)) throw new Error(`Unsafe install path: junction escapes skills dir`);
      }
    } catch (e) {
      if (e.code === 'ENOENT') continue;
      throw e;
    }
  }
  target = path.resolve(target);
  if (target === skillsRoot || !target.startsWith(skillsRoot)) {
    throw new Error(`Unsafe install path: ${installPath}`);
  }
  return target;
}

function validateBundleRelPath(relPath) {
  if (typeof relPath !== 'string') throw new Error('Unsafe bundle path: not a string');
  const trimmed = relPath.trim().replace(/\\/g, '/');
  if (!trimmed || trimmed.startsWith('/')) throw new Error(`Unsafe bundle path: ${relPath}`);
  const parts = trimmed.split('/').filter(p => p && p !== '.');
  if (parts.some(p => p === '..')) throw new Error(`Unsafe bundle path: traversal detected in ${relPath}`);
  return parts.join('/');
}

// ── Content hash ─────────────────────────────────────────────────────────────
function contentHash(dir) {
  const h = crypto.createHash('sha256');
  const entries = [];
  function walk(d, prefix = '') {
    const items = fs.readdirSync(d);
    for (const item of items.sort()) {
      const full = path.join(d, item);
      const rel = prefix ? `${prefix}/${item}` : item;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full, rel);
      } else {
        h.update(rel);
        h.update('\x00');
        h.update(fs.readFileSync(full));
        h.update('\x00');
        entries.push(rel);
      }
    }
  }
  walk(dir);
  return 'sha256:' + crypto.createHash('sha256').update(h.digest()).digest('hex').slice(0, 16);
}

function bundleContentHash(files) {
  const h = crypto.createHash('sha256');
  for (const relPath of Object.keys(files).sort()) {
    h.update(relPath);
    h.update('\x00');
    const content = files[relPath];
    if (typeof content === 'string') h.update(content);
    else if (Buffer.isBuffer(content)) h.update(content);
    else h.update(String(content));
    h.update('\x00');
  }
  return 'sha256:' + h.digest('hex').slice(0, 16);
}

// ── HTTP helpers ────────────────────────────────────────────────────────────
function githubAuthHeaders() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
  const headers = { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'PURPCLAW-skills-hub/1.0' };
  if (token) headers['Authorization'] = `token ${token}`;
  return headers;
}

function httpsGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const { timeout = 20000, headers = {}, retries = 3, params = null } = options;
    let attempt = 0;
    const maxRetries = retries;

    const doRequest = () => {
      attempt++;
      try {
        const parsed = new URL(url);
        if (params) {
          const sp = new URLSearchParams();
          for (const [k, v] of Object.entries(params)) sp.set(k, v);
          parsed.search = sp.toString();
        }
        const mod = parsed.protocol === 'https:' ? https : http;
        const reqOptions = {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: 'GET',
          headers: { ...headers },
        };

        const req = mod.request(reqOptions, (res) => {
          // Follow redirects
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            if (attempt < maxRetries) {
              url = new URL(res.headers.location, url).toString();
              doRequest();
            } else {
              reject(new Error(`Too many redirects for ${url}`));
            }
            return;
          }

          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks);
            // Rate limit handling
            if (res.statusCode === 403 || res.statusCode === 429) {
              const remaining = res.headers['x-ratelimit-remaining'];
              if (remaining === '0' || res.statusCode === 429) {
                let waitMs = 1000 * Math.pow(2, Math.min(attempt - 1, 5));
                const reset = res.headers['x-ratelimit-reset'];
                const retryAfter = res.headers['retry-after'];
                if (retryAfter && /^\d+$/.test(retryAfter)) waitMs = Math.min(parseInt(retryAfter) * 1000, 60000);
                else if (reset) {
                  const delta = parseInt(reset) * 1000 - Date.now();
                  if (delta > 0 && delta < 60000) waitMs = delta;
                }
                if (attempt < maxRetries) {
                  setTimeout(doRequest, Math.min(waitMs, 30000));
                  return;
                }
              }
            }
            resolve({ statusCode: res.statusCode, headers: res.headers, body, text: body.toString('utf8') });
          });
        });

        req.on('error', (err) => {
          if (attempt < maxRetries) {
            setTimeout(doRequest, Math.min(1000 * Math.pow(2, attempt - 1), 30000));
          } else {
            reject(err);
          }
        });
        req.on('timeout', () => {
          req.destroy();
          if (attempt < maxRetries) {
            setTimeout(doRequest, 1000 * Math.pow(2, attempt - 1));
          } else {
            reject(new Error(`Timeout after ${timeout}ms for ${url}`));
          }
        });
        req.setTimeout(timeout);
        req.end();
      } catch (err) {
        reject(err);
      }
    };

    doRequest();
  });
}

// ── GitHub auth ─────────────────────────────────────────────────────────────
class GitHubAuth {
  constructor() {
    this._cachedToken = null;
    this._cachedMethod = null;
    this._appTokenExpiry = 0;
  }

  getHeaders() {
    const token = this._resolveToken();
    const headers = { Accept: 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `token ${token}`;
    return headers;
  }

  isAuthenticated() { return this._resolveToken() !== null; }

  authMethod() {
    this._resolveToken();
    return this._cachedMethod || 'anonymous';
  }

  _resolveToken() {
    if (this._cachedToken) {
      if (this._cachedMethod !== 'github-app' || Date.now() < this._appTokenExpiry) {
        return this._cachedToken;
      }
    }
    // 1. Env var
    const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (envToken) {
      this._cachedToken = envToken;
      this._cachedMethod = 'pat';
      return envToken;
    }
    // 2. gh CLI (skip on Windows for simplicity)
    try {
      const { execSync } = require('child_process');
      const result = execSync('gh auth token', { timeout: 5000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      if (result && result.trim()) {
        this._cachedToken = result.trim();
        this._cachedMethod = 'gh-cli';
        return this._cachedToken;
      }
    } catch (_) { /* gh not available */ }
    this._cachedMethod = 'anonymous';
    return null;
  }
}

// ── Frontmatter parser ───────────────────────────────────────────────────────
/**
 * Parse YAML-like frontmatter from the top of a SKILL.md file.
 * Handles: top-level keys, nested objects (indented), lists [- item],
 * block scalars (| and >), inline lists [a, b, c], quoted values.
 * @param {string} content - Raw file content
 * @returns {Object} Parsed key-value pairs (empty object on failure)
 */
function parseFrontmatter(content) {
  content = content.replace(/^\uFEFF/, '');
  if (!content.startsWith('---')) return {};
  // Find closing ---; ([^\n]*\n) stops at the first newline after ---
  const endMatch = content.slice(3).match(/---\s*([\n]|$)/);
  if (!endMatch) return {};
  const yamlText = content.slice(3, endMatch.index).trimEnd();
  try {
    const result = {};
    const lines = yamlText.split('\n');
    // Stack for building nested objects: [{indent, node}]
    const stack = [{ indent: -1, node: result }];
    let i = 0;

    while (i < lines.length) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();
      if (trimmed === '' || trimmed === '---') { i++; continue; }

      const indent = rawLine.search(/\S/);

      // Pop to parent depth
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack[stack.length - 1].node;

      // Block scalar key: key: | or key: >
      const blockKeyMatch = trimmed.match(/^(\w[\w-]*):\s*(\||>)$/);
      if (blockKeyMatch) {
        const key = blockKeyMatch[1];
        const blockIndent = indent + blockKeyMatch[0].length;
        const blockLines = [];
        for (i++; i < lines.length; i++) {
          const bLine = lines[i];
          if (bLine.trim() === '') { blockLines.push(''); continue; }
          const bIndent = bLine.search(/\S/);
          if (bIndent < blockIndent + 1) { i--; break; }
          blockLines.push(bLine.trimEnd());
        }
        parent[key] = blockLines.join('\n');
        i++; continue;
      }

      // List item: - value or - key: value
      if (trimmed.startsWith('- ')) {
        const itemContent = trimmed.slice(2).trim();
        const kvIdx = itemContent.indexOf(': ');
        let arr = parent._lastArr;
        if (!Array.isArray(arr)) { arr = []; parent._lastArr = arr; }
        if (kvIdx !== -1) {
          const k = itemContent.slice(0, kvIdx);
          const v = itemContent.slice(kvIdx + 2);
          const sub = {}; sub[k] = v;
          arr.push(sub);
          stack.push({ indent, node: sub });
        } else {
          arr.push(itemContent);
        }
        i++; continue;
      }

      // Key: value
      const kvMatch = trimmed.match(/^(\w[\w-]*):\s*(.*)$/);
      if (kvMatch) {
        const key = kvMatch[1];
        const val = kvMatch[2].trim();
        parent._lastKey = key;
        delete parent._lastArr;

        if (val === '|' || val === '>') {
          // Block scalar
          const blockIndent = indent + trimmed.length;
          const blockLines = [];
          for (i++; i < lines.length; i++) {
            const bLine = lines[i];
            if (bLine.trim() === '') { blockLines.push(''); continue; }
            const bIndent = bLine.search(/\S/);
            if (bIndent < blockIndent + 1) { i--; break; }
            blockLines.push(bLine.trimEnd());
          }
          parent[key] = blockLines.join('\n');
        } else if (val === '') {
          // Empty value — peek ahead for nested object or block scalar
          const nextRaw = lines[i + 1];
          const nextTrimmed = nextRaw ? nextRaw.trim() : '';
          if (nextTrimmed === '|' || nextTrimmed === '>') {
            i++; // advance past the empty-line / key: |
            const blockIndent = (lines[i] || '').search(/\S/);
            const blockLines = [];
            for (i++; i < lines.length; i++) {
              const bLine = lines[i];
              if (bLine.trim() === '') { blockLines.push(''); continue; }
              const bIndent = bLine.search(/\S/);
              if (bIndent < blockIndent + 1) { i--; break; }
              blockLines.push(bLine.trimEnd());
            }
            parent[key] = blockLines.join('\n');
          } else {
            // Check for nested child (indented next line)
            const nextIndent = nextRaw ? nextRaw.search(/\S/) : -1;
            if (nextIndent > indent) {
              parent[key] = {};
              stack.push({ indent, node: parent[key] });
            } else {
              parent[key] = null;
            }
          }
        } else if (val.startsWith('[')) {
          parent[key] = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
        } else {
          parent[key] = val.replace(/^["']|["']$/g, '');
        }
        i++; continue;
      }

      i++;
    }
    // Remove internal tracking keys
    for (const k of Object.keys(result)) { if (k.startsWith('_')) delete result[k]; }
    return result;
  } catch (_) { return {}; }
}

// ── Referenced paths extractor ───────────────────────────────────────────────
const ALLOWED_SUPPORT_DIRS = ['references', 'templates', 'scripts', 'assets', 'examples'];
// Block /../ traversal in any path segment, with word-boundary context to avoid
// false positives on bare filenames like "node_modules/../file"
const SUSPICIOUS_REF_RE = /\/(?:\.\.\/|\.\.$)|^\.\.\//;

function extractReferencedPaths(skillMd) {
  const normalized = skillMd.replace(/\\/g, '/');
  if (SUSPICIOUS_REF_RE.test(normalized)) return null;
  const paths = new Set();
  const re = /(references|templates|scripts|assets|examples)\/([^\s)`"'<>]+)/g;
  let match;
  while ((match = re.exec(normalized)) !== null) {
    const full = match[0];
    const topLevel = match[1];
    if (ALLOWED_SUPPORT_DIRS.includes(topLevel)) paths.add(full);
  }
  return paths;
}

// ── Trust rank helper ───────────────────────────────────────────────────────
function trustRank(level) {
  return { builtin: 3, trusted: 2, 'agent-created': 1, community: 0 }[level] ?? 0;
}

// ── HubLockFile ─────────────────────────────────────────────────────────────
class HubLockFile {
  constructor(_path) {
    this.path = _path || lockFile();
  }

  load() {
    if (!fs.existsSync(this.path)) return { version: 1, installed: {} };
    try {
      return JSON.parse(fs.readFileSync(this.path, 'utf8'));
    } catch (_) { return { version: 1, installed: {} }; }
  }

  save(data) {
    const dir = path.dirname(this.path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.path, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }

  record_install({ name, source, identifier, trust_level, scan_verdict, skill_hash, install_path, files, metadata, scan_provenance }) {
    ensureHubDirs();
    const safeName = validateSkillName(name);
    const safeInstallPath = normalizeLockInstallPath(install_path, safeName);
    const data = this.load();
    const now = new Date().toISOString();
    const existing = data.installed[safeName];
    data.installed[safeName] = {
      source, identifier, trust_level,
      scan_verdict: scan_verdict || 'safe',
      content_hash: skill_hash || '',
      install_path: safeInstallPath,
      files: files || [],
      metadata: metadata || {},
      scan_provenance: scan_provenance || {},
      installed_at: existing?.installed_at || now,
      updated_at: now,
    };
    this.save(data);
  }

  record_uninstall(name) {
    const safeName = validateSkillName(name);
    const data = this.load();
    delete data.installed[safeName];
    this.save(data);
  }

  get_installed(name) {
    const data = this.load();
    return data.installed[name] || null;
  }

  list_installed() {
    const data = this.load();
    return Object.entries(data.installed).map(([name, entry]) => ({ name, ...entry }));
  }
}

// ── TapsManager ─────────────────────────────────────────────────────────────
class TapsManager {
  constructor(_path) {
    this.path = _path || tapsFile();
  }

  load() {
    if (!fs.existsSync(this.path)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(this.path, 'utf8'));
      return Array.isArray(data.taps) ? data.taps : [];
    } catch (_) { return []; }
  }

  save(taps) {
    const dir = path.dirname(this.path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.path, JSON.stringify({ taps }, null, 2) + '\n', 'utf8');
  }

  add(repo, repoPath = 'skills/') {
    const taps = this.load();
    if (taps.some(t => t.repo === repo)) return false;
    taps.push({ repo, path: repoPath });
    this.save(taps);
    return true;
  }

  remove(repo) {
    const taps = this.load();
    const next = taps.filter(t => t.repo !== repo);
    if (next.length === taps.length) return false;
    this.save(next);
    return true;
  }

  list() { return this.load(); }
}

// ── GitHub source provider labels ───────────────────────────────────────────
const GITHUB_TAP_PROVIDERS = {
  'openai/skills': 'OpenAI',
  'anthropics/skills': 'Anthropic',
  'huggingface/skills': 'HuggingFace',
  'nvidia/skills': 'NVIDIA',
  'voltagent/awesome-agent-skills': 'VoltAgent',
  'garrytan/gstack': 'gstack',
  'minimax-ai/cli': 'MiniMax',
};

const TRUSTED_REPOS = new Set([
  'openai/skills', 'anthropics/skills', 'huggingface/skills',
  'nvidia/skills', 'NVIDIA/skills', 'garrytan/gstack',
]);

const DEFAULT_TAPS = [
  { repo: 'openai/skills', path: 'skills/.curated/' },
  { repo: 'openai/skills', path: 'skills/.system/' },
  { repo: 'anthropics/skills', path: 'skills/' },
  { repo: 'huggingface/skills', path: 'skills/' },
  { repo: 'nvidia/skills', path: 'skills/' },
];

// ── GitHubSource ────────────────────────────────────────────────────────────
class GitHubSource {
  constructor(extraTaps = []) {
    this.auth = new GitHubAuth();
    this.taps = [...DEFAULT_TAPS];
    if (extraTaps?.length) this.taps.push(...extraTaps);
    this._treeCache = {};
    this._treeRevisions = {};
    this._skillshGroupings = {};
    this._rateLimited = false;
  }

  source_id() { return 'github'; }
  is_rate_limited() { return this._rateLimited; }

  trust_level_for(identifier) {
    const parts = identifier.split('/');
    if (parts.length >= 2) {
      const repo = `${parts[0]}/${parts[1]}`.toLowerCase();
      if (TRUSTED_REPOS.has(repo)) return 'trusted';
    }
    return 'community';
  }

  async search(query, limit = 10) {
    const results = [];
    const queryLower = query.toLowerCase();

    for (const tap of this.taps) {
      try {
        const skills = await this._listSkillsInRepo(tap.repo, tap.path || '');
        for (const skill of skills) {
          const searchable = `${skill.name} ${skill.description} ${(skill.tags || []).join(' ')}`.toLowerCase();
          if (!queryLower || searchable.includes(queryLower)) {
            results.push(skill);
          }
        }
      } catch (_) { /* skip failing taps */ }
      if (results.length >= limit * 2) break;
    }

    // Deduplicate by identifier
    const seen = new Map();
    for (const r of results) {
      if (!seen.has(r.identifier) || trustRank(r.trust_level) > trustRank(seen.get(r.identifier).trust_level)) {
        seen.set(r.identifier, r);
      }
    }
    return [...seen.values()].slice(0, limit);
  }

  async inspect(identifier) {
    const parts = identifier.split('/');
    if (parts.length < 3) return null;
    const repo = `${parts[0]}/${parts[1]}`;
    const skillPath = parts.slice(2).join('/');
    const skillMdPath = `${skillPath}/SKILL.md`;

    try {
      const content = await this._fetchFileContent(repo, skillMdPath);
      if (!content) return null;

      const fm = parseFrontmatter(content);
      const skillName = fm.name || skillPath.split('/').pop();
      const description = fm.description || '';
      let tags = [];
      const metadata = fm.metadata || {};
      const hermesMeta = metadata.hermes || {};
      if (Array.isArray(hermesMeta.tags)) tags = hermesMeta.tags.map(String);
      if (!tags.length && Array.isArray(fm.tags)) tags = fm.tags.map(String);

      const provider = GITHUB_TAP_PROVIDERS[repo.toLowerCase()];
      return {
        name: skillName,
        description: String(description),
        source: 'github',
        identifier,
        trust_level: this.trust_level_for(identifier),
        repo,
        path: skillPath,
        tags,
        extra: { ...(provider ? { provider } : {}) },
      };
    } catch (_) { return null; }
  }

  async fetch(identifier) {
    const parts = identifier.split('/');
    if (parts.length < 3) return null;

    const repo = `${parts[0]}/${parts[1]}`;
    const skillPath = parts.slice(2).join('/');
    const skillMdContent = await this._fetchFileContent(repo, `${skillPath}/SKILL.md`);
    if (!skillMdContent) return null;

    const referenced = extractReferencedPaths(skillMdContent);
    if (referenced === null) return null;

    const files = { 'SKILL.md': skillMdContent };
    const revision = this._treeRevisions[repo] || '';

    const tree = await this._getRepoTree(repo);
    if (tree) {
      const [, entries] = tree;
      const prefix = `${skillPath}/`;
      const entriesByPath = new Map(entries.map(e => [e.path, e]));
      for (const relPath of referenced) {
        const itemPath = prefix + relPath;
        const item = entriesByPath.get(itemPath);
        if (!item || item.type !== 'blob' || item.mode === '120000') continue;
        const content = await this._fetchFileBytes(repo, itemPath);
        if (content) files[relPath] = content;
      }
    } else {
      for (const relPath of referenced) {
        const content = await this._fetchFileBytes(repo, `${skillPath}/${relPath}`);
        if (content) files[relPath] = content;
      }
    }

    const skillName = skillPath.split('/').pop();
    return {
      name: skillName,
      files,
      source: 'github',
      identifier,
      trust_level: this.trust_level_for(identifier),
      metadata: {
        source_url: revision
          ? `https://github.com/${repo}/tree/${revision}/${skillPath}`
          : `https://github.com/${repo}/${skillPath}`,
        source_revision: revision,
      },
    };
  }

  async _listSkillsInRepo(repo, repoPath = '') {
    const cacheKey = `${repo}_${repoPath}`.replace(/\//g, '_').replace(/ /g, '_');
    const cached = this._readCache(cacheKey);
    if (cached) return cached;

    try {
      const url = `https://api.github.com/repos/${repo}/contents/${repoPath}`.replace(/\/+$/, '');
      const resp = await httpsGet(url, { headers: this.auth.getHeaders() });
      if (resp.statusCode !== 200) return [];

      const entries = JSON.parse(resp.text);
      if (!Array.isArray(entries)) return [];

      const skills = [];
      const groupings = await this._getSkillshGroupings(repo);
      for (const entry of entries) {
        if (entry.type !== 'dir') continue;
        if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
        const prefix = repoPath.replace(/\/+$/, '');
        const skillIdentifier = prefix ? `${repo}/${prefix}/${entry.name}` : `${repo}/${entry.name}`;
        const meta = await this.inspect(skillIdentifier);
        if (meta) {
          if (groupings) {
            const category = groupings.get(meta.name) || groupings.get(entry.name);
            if (category) meta.extra = { ...meta.extra, category };
          }
          skills.push(meta);
        }
      }

      this._writeCache(cacheKey, skills);
      return skills;
    } catch (_) { return []; }
  }

  async _getRepoTree(repo) {
    if (this._treeCache[repo]) return this._treeCache[repo];

    try {
      const headers = this.auth.getHeaders();
      const repoResp = await httpsGet(`https://api.github.com/repos/${repo}`, { headers });
      if (repoResp.statusCode !== 200) {
        if (repoResp.statusCode === 403) this._rateLimited = true;
        return null;
      }
      const repoData = JSON.parse(repoResp.text);
      const defaultBranch = repoData.default_branch || 'main';

      const treeResp = await httpsGet(
        `https://api.github.com/repos/${repo}/git/trees/${defaultBranch}`,
        { headers, params: { recursive: '1' } }
      );
      if (treeResp.statusCode !== 200) {
        if (treeResp.statusCode === 403) this._rateLimited = true;
        return null;
      }

      const treeData = JSON.parse(treeResp.text);
      if (treeData.truncated) return null;

      const entries = treeData.tree || [];
      const revision = treeData.sha || '';
      this._treeCache[repo] = [defaultBranch, entries];
      this._treeRevisions[repo] = revision;
      return [defaultBranch, entries];
    } catch (_) { return null; }
  }

  async _fetchFileContent(repo, filePath) {
    const bytes = await this._fetchFileBytes(repo, filePath);
    if (!bytes) return null;
    try { return bytes.toString('utf8'); } catch (_) { return null; }
  }

  async _fetchFileBytes(repo, filePath) {
    try {
      const headers = { ...this.auth.getHeaders(), Accept: 'application/vnd.github.v3.raw' };
      const resp = await httpsGet(`https://api.github.com/repos/${repo}/contents/${filePath}`, { headers });
      if (resp.statusCode === 200) return resp.body;
      return null;
    } catch (_) { return null; }
  }

  async _getSkillshGroupings(repo) {
    if (this._skillshGroupings[repo] !== undefined) return this._skillshGroupings[repo];
    const content = await this._fetchFileContent(repo, 'skills.sh.json');
    const groupings = this._parseSkillshGroupings(content);
    this._skillshGroupings[repo] = groupings;
    return groupings;
  }

  _parseSkillshGroupings(content) {
    if (!content) return null;
    try {
      const data = JSON.parse(content);
      if (!Array.isArray(data.groupings)) return null;
      const mapping = new Map();
      for (const group of data.groupings) {
        if (!group || typeof group.title !== 'string' || !Array.isArray(group.skills)) continue;
        for (const member of group.skills) {
          if (typeof member === 'string' && member) mapping.set(member, group.title);
        }
      }
      return mapping.size ? mapping : null;
    } catch (_) { return null; }
  }

  _readCache(key) { return readIndexCache(`gh_${key}`); }
  _writeCache(key, data) { writeIndexCache(`gh_${key}`, data); }

  static _metaToDict(meta) {
    return {
      name: meta.name, description: meta.description, source: meta.source,
      identifier: meta.identifier, trust_level: meta.trust_level,
      repo: meta.repo, path: meta.path, tags: meta.tags, extra: meta.extra || {},
    };
  }
}

// ── OptionalSkillSource ─────────────────────────────────────────────────────
class OptionalSkillSource {
  constructor() {
    // optional-skills dir relative to this module
    this._optionalDir = path.join(__dirname, '..', 'optional-skills');
  }

  source_id() { return 'official'; }
  trust_level_for() { return 'builtin'; }

  async search(query, limit = 10) {
    const results = [];
    const queryLower = query.toLowerCase();
    for (const meta of this._scanAll()) {
      const searchable = `${meta.name} ${meta.description} ${(meta.tags || []).join(' ')}`.toLowerCase();
      if (!queryLower || searchable.includes(queryLower)) {
        results.push(meta);
      }
      if (results.length >= limit) break;
    }
    return results;
  }

  async inspect(identifier) {
    const rel = identifier.startsWith('official/') ? identifier.split('/', 2)[1] : identifier;
    const skillName = rel.split('/').pop();
    for (const meta of this._scanAll()) {
      if (meta.name === skillName) return meta;
    }
    return null;
  }

  async fetch(identifier) {
    const rel = identifier.startsWith('official/') ? identifier.split('/', 2)[1] : identifier;
    const skillDir = path.join(this._optionalDir, rel);
    const resolved = fs.existsSync(skillDir) ? path.resolve(skillDir) : null;

    // Try finding by name
    let actualDir = resolved;
    if (!actualDir) {
      const found = this._findSkillDir(rel.split('/').pop());
      if (!found) return null;
      actualDir = found;
    }

    // Security: must be within optional-skills root
    if (!actualDir.startsWith(path.resolve(this._optionalDir))) return null;

    const files = {};
    const walkDir = (dir, prefix = '') => {
      try {
        for (const entry of fs.readdirSync(dir)) {
          if (entry.startsWith('.') || entry === '__pycache__') continue;
          const full = path.join(dir, entry);
          const rel2 = prefix ? `${prefix}/${entry}` : entry;
          const stat = fs.statSync(full);
          if (stat.isDirectory()) walkDir(full, rel2);
          else if (!entry.endsWith('.pyc')) {
            try { files[rel2] = fs.readFileSync(full); } catch (_) {}
          }
        }
      } catch (_) {}
    };
    walkDir(actualDir);
    if (!Object.keys(files).length) return null;

    return {
      name: path.basename(actualDir),
      files,
      source: 'official',
      identifier: `official/${path.relative(this._optionalDir, actualDir).replace(/\\/g, '/')}`,
      trust_level: 'builtin',
      metadata: {},
    };
  }

  _findSkillDir(name) {
    if (!fs.existsSync(this._optionalDir)) return null;
    const search = (dir) => {
      try {
        for (const entry of fs.readdirSync(dir)) {
          const full = path.join(dir, entry);
          if (fs.statSync(full).isDirectory()) {
            if (fs.existsSync(path.join(full, 'SKILL.md')) && path.basename(full) === name) {
              return full;
            }
            const found = search(full);
            if (found) return found;
          }
        }
      } catch (_) {}
      return null;
    };
    return search(this._optionalDir);
  }

  _scanAll() {
    if (!fs.existsSync(this._optionalDir)) return [];
    const results = [];

    const search = (dir) => {
      try {
        for (const entry of fs.readdirSync(dir)) {
          const full = path.join(dir, entry);
          if (!fs.statSync(full).isDirectory() || entry.startsWith('.') || entry.startsWith('_')) continue;
          const skillMd = path.join(full, 'SKILL.md');
          if (!fs.existsSync(skillMd)) {
            search(full); // recurse
            continue;
          }
          try {
            const content = fs.readFileSync(skillMd, 'utf8');
            const fm = parseFrontmatter(content);
            let tags = [];
            const metadata = fm.metadata || {};
            const hermesMeta = metadata.hermes || {};
            if (Array.isArray(hermesMeta.tags)) tags = hermesMeta.tags;
            else if (Array.isArray(fm.tags)) tags = fm.tags;

            const relPath = path.relative(this._optionalDir, full).replace(/\\/g, '/');
            results.push({
              name: fm.name || path.basename(full),
              description: fm.description || '',
              source: 'official',
              identifier: `official/${relPath}`,
              trust_level: 'builtin',
              repo: 'NousResearch/hermes-agent',
              path: `optional-skills/${relPath}`,
              tags: tags.map(String),
              extra: {},
            });
          } catch (_) {}
        }
      } catch (_) {}
    };
    search(this._optionalDir);
    return results;
  }
}

// ── SkillsShSource ──────────────────────────────────────────────────────────
const GITHUB_TAP_LABELS = Object.values(GITHUB_TAP_PROVIDERS);

class SkillsShSource {
  constructor() {
    this.auth = new GitHubAuth();
    this.github = new GitHubSource();
    this.github.auth = this.auth;
  }

  source_id() { return 'skills-sh'; }
  trust_level_for(identifier) { return this.github.trust_level_for(this._normalize(identifier)); }

  async search(query, limit = 10) {
    if (!query.trim()) return this._sitemapCatalog(limit);

    const cacheKey = `skills_sh_search_${crypto.createHash('md5').update(`${query}|${limit}`).digest('hex')}`;
    const cached = readIndexCache(cacheKey);
    if (cached) return cached.slice(0, limit);

    try {
      const resp = await httpsGet(`https://skills.sh/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
      if (resp.statusCode !== 200) return [];
      const data = JSON.parse(resp.text);
      const items = Array.isArray(data.skills) ? data.skills : [];
      const results = items.slice(0, limit).map(item => this._metaFromSearchItem(item)).filter(Boolean);
      writeIndexCache(cacheKey, results);
      return results;
    } catch (_) { return []; }
  }

  async inspect(identifier) {
    const canonical = this._normalize(identifier);
    const detail = await this._fetchDetailPage(canonical);
    const meta = this._resolveGithubMeta(canonical, detail);
    if (!meta) return null;
    return this._finalizeInspectMeta(meta, canonical, detail);
  }

  async fetch(identifier) {
    const canonical = this._normalize(identifier);
    const detail = await this._fetchDetailPage(canonical);
    for (const candidate of this._candidateIds(canonical)) {
      const bundle = await this.github.fetch(candidate);
      if (bundle) {
        bundle.source = 'skills.sh';
        bundle.identifier = this._wrapId(canonical);
        return bundle;
      }
    }
    const resolved = await this._discoverIdentifier(canonical, detail);
    if (resolved) {
      const bundle = await this.github.fetch(resolved);
      if (bundle) {
        bundle.source = 'skills.sh';
        bundle.identifier = this._wrapId(canonical);
        return bundle;
      }
    }
    return null;
  }

  async _sitemapCatalog(limit) {
    const cacheKey = 'skills_sh_sitemap_v1';
    const cached = readIndexCache(cacheKey);
    if (cached) return cached.slice(0, limit);

    try {
      const resp = await httpsGet('https://www.skills.sh/sitemap.xml', { timeout: 30000 });
      if (resp.statusCode !== 200) return [];
      const locRe = /<loc>([^<]+)<\/loc>/gi;
      const smSkillRe = /^https?:\/\/(?:www\.)?skills\.sh\/(?=[^/]+\/[^/]+\/[^/]+)/i;
      const seen = new Set();
      const results = [];
      let match;
      while ((match = locRe.exec(resp.text)) !== null) {
        const url = match[1].trim();
        if (!smSkillRe.test(url)) continue;
        const parts = url.replace('https://www.skills.sh/', '').split('/');
        if (parts.length < 3) continue;
        const canonical = `${parts[0]}/${parts[1]}/${parts[2]}`.replace(/\/+$/, '');
        if (seen.has(canonical)) continue;
        seen.add(canonical);
        const repo = `${parts[0]}/${parts[1]}`;
        results.push({
          name: parts[2],
          description: `Indexed by skills.sh from ${repo}`,
          source: 'skills.sh',
          identifier: this._wrapId(canonical),
          trust_level: this.trust_level_for(canonical),
          repo,
          path: parts[2],
          extra: {
            detail_url: `https://skills.sh/${canonical}`,
            repo_url: `https://github.com/${repo}`,
          },
        });
        if (results.length >= limit) break;
      }
      if (results.length) writeIndexCache(cacheKey, results);
      return results;
    } catch (_) { return []; }
  }

  async _fetchDetailPage(identifier) {
    const cacheKey = `skills_sh_detail_${crypto.createHash('md5').update(identifier).digest('hex')}`;
    const cached = readIndexCache(cacheKey);
    if (cached) return cached;
    try {
      const resp = await httpsGet(`https://skills.sh/${identifier}`, { timeout: 20000 });
      if (resp.statusCode !== 200) return null;
      const data = this._parseDetailHtml(resp.text, identifier);
      if (data) writeIndexCache(cacheKey, data);
      return data;
    } catch (_) { return null; }
  }

  _parseDetailHtml(html, identifier) {
    const parts = identifier.split('/');
    if (parts.length < 3) return null;
    const repo = `${parts[0]}/${parts[1]}`;
    const installMatch = /npx\s+skills\s+add\s+([^?\s<]+)/i.exec(html);
    const h1Match = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html);
    return {
      repo: installMatch ? this._extractRepoSlug(installMatch[1]) || repo : repo,
      install_skill: parts[2],
      page_title: h1Match ? this._stripHtml(h1Match[1]).trim() : null,
      detail_url: `https://skills.sh/${identifier}`,
      repo_url: `https://github.com/${repo}`,
    };
  }

  _resolveGithubMeta(identifier, detail) {
    for (const candidate of this._candidateIds(identifier)) {
      const meta = this.github.inspect(candidate);
      if (meta) return meta;
    }
    return null;
  }

  _finalizeInspectMeta(meta, canonical, detail) {
    meta.source = 'skills.sh';
    meta.identifier = this._wrapId(canonical);
    meta.trust_level = this.trust_level_for(canonical);
    if (detail) {
      meta.description = detail.page_title || meta.description;
    }
    return meta;
  }

  async _discoverIdentifier(identifier, detail) {
    const parts = identifier.split('/');
    if (parts.length < 3) return null;
    const repo = (detail && detail.repo) || `${parts[0]}/${parts[1]}`;
    const token = parts[2];

    const basePaths = ['skills/', '.agents/skills/', '.claude/skills/'];
    for (const basePath of basePaths) {
      const skills = await this.github._listSkillsInRepo(repo, basePath);
      for (const meta of skills) {
        if (this._matchesSkill(meta, [token])) return meta.identifier;
      }
    }
    return null;
  }

  _matchesSkill(meta, tokens) {
    const candidates = new Set();
    const add = (v) => { if (v) candidates.add(v.toLowerCase().replace(/[_\/]/g, '-')); };
    add(meta.name); add(meta.path);
    const identParts = meta.identifier.split('/');
    if (identParts.length >= 3) add(identParts.slice(2).join('/'));
    for (const tok of tokens) {
      const norm = tok.toLowerCase().replace(/[_\/]/g, '-');
      if (candidates.has(norm)) return true;
    }
    return false;
  }

  _normalize(identifier) {
    for (const prefix of ['skills-sh/', 'skills.sh/', 'skils-sh/', 'skils.sh/']) {
      if (identifier.startsWith(prefix)) return identifier.slice(prefix.length);
    }
    return identifier;
  }

  _candidateIds(identifier) {
    const parts = identifier.split('/');
    if (parts.length < 3) return [identifier];
    const repo = `${parts[0]}/${parts[1]}`;
    const skill = parts.slice(2).join('/').replace(/^\/+/, '');
    return [
      `${repo}/${skill}`,
      `${repo}/skills/${skill}`,
      `${repo}/.agents/skills/${skill}`,
      `${repo}/.claude/skills/${skill}`,
    ];
  }

  _wrapId(identifier) { return `skills-sh/${identifier}`; }
  _extractRepoSlug(v) {
    v = v.trim();
    if (v.startsWith('https://github.com/')) v = v.slice(19);
    v = v.replace(/\/+$/, '');
    const p = v.split('/');
    return p.length >= 2 ? `${p[0]}/${p[1]}` : null;
  }

  _metaFromSearchItem(item) {
    if (!item || typeof item !== 'object') return null;
    const canonical = item.id || (item.source && item.skillId ? `${item.source}/${item.skillId}` : null);
    if (!canonical || canonical.split('/').length < 3) return null;
    const parts = canonical.split('/');
    const repo = `${parts[0]}/${parts[1]}`;
    const skill = parts.slice(2).join('/');
    return {
      name: item.name || skill,
      description: item.description || `Indexed by skills.sh from ${repo}`,
      source: 'skills.sh',
      identifier: this._wrapId(canonical),
      trust_level: this.trust_level_for(canonical),
      repo,
      path: skill,
      extra: { installs: item.installs, detail_url: `https://skills.sh/${canonical}` },
    };
  }

  _stripHtml(v) { return v.replace(/<[^>]+>/g, '').trim(); }
}

// ── ClawHubSource ───────────────────────────────────────────────────────────
class ClawHubSource {
  constructor() { this._catalogCache = null; }

  source_id() { return 'clawhub'; }
  trust_level_for() { return 'community'; }

  async search(query, limit = 10) {
    if (!query.trim()) return this._loadCatalogIndex().slice(0, limit);
    const cacheKey = `clawhub_search_v1_${crypto.createHash('md5').update(query).digest('hex')}_${limit}`;
    const cached = readIndexCache(cacheKey);
    if (cached) return cached;

    try {
      const resp = await httpsGet(`https://clawhub.ai/api/v1/skills`, { params: { search: query, limit } });
      if (resp.statusCode !== 200) return [];
      const data = JSON.parse(resp.text);
      const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
      const results = items.slice(0, limit).map(item => this._itemToMeta(item)).filter(Boolean);
      writeIndexCache(cacheKey, results);
      return results;
    } catch (_) { return []; }
  }

  async inspect(identifier) {
    const slug = identifier.split('/').pop();
    try {
      const resp = await httpsGet(`https://clawhub.ai/api/v1/skills/${slug}`);
      if (resp.statusCode !== 200) return null;
      const data = JSON.parse(resp.text);
      return this._itemToMeta(data.skill || data);
    } catch (_) { return null; }
  }

  async fetch(identifier) {
    const slug = identifier.split('/').pop();
    try {
      const resp = await httpsGet(`https://clawhub.ai/api/v1/skills/${slug}`);
      if (resp.statusCode !== 200) return null;
      const data = JSON.parse(resp.text);
      const skillData = data.skill || data;
      const latestVer = this._resolveLatestVersion(slug, skillData);
      if (!latestVer) return null;

      // Try download endpoint
      const files = {};
      const dlResp = await httpsGet(`https://clawhub.ai/api/v1/download`, { params: { slug, version: latestVer } });
      if (dlResp.statusCode === 200 && dlResp.body) {
        // ZIP handling would go here; for now just try to get SKILL.md
      }
      // Fallback: fetch skill files individually
      const skillResp = await httpsGet(`https://clawhub.ai/api/v1/skills/${slug}/versions/${latestVer}`);
      if (skillResp.statusCode === 200) {
        const verData = JSON.parse(skillResp.text);
        const fileList = verData.files || verData.version?.files || [];
        for (const f of fileList) {
          const fname = f.path || f.name;
          if (!fname || !f.content) continue;
          files[fname] = f.content;
        }
      }
      if (!files['SKILL.md']) return null;
      return { name: slug, files, source: 'clawhub', identifier: slug, trust_level: 'community', metadata: {} };
    } catch (_) { return null; }
  }

  _loadCatalogIndex() {
    const cacheKey = 'clawhub_catalog_v1';
    const cached = readIndexCache(cacheKey);
    if (cached) return cached;
    return []; // cursor-based walk skipped for simplicity
  }

  _resolveLatestVersion(slug, data) {
    if (data.latestVersion) {
      if (typeof data.latestVersion === 'string') return data.latestVersion;
      if (data.latestVersion.version) return data.latestVersion.version;
    }
    if (data.tags?.latest) return data.tags.latest;
    return null;
  }

  _itemToMeta(item) {
    if (!item || typeof item !== 'object') return null;
    const slug = item.slug || item.name || '';
    return {
      name: item.displayName || item.name || slug,
      description: item.summary || item.description || '',
      source: 'clawhub',
      identifier: slug,
      trust_level: 'community',
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
      extra: {},
    };
  }
}

// ── HermesIndexSource ───────────────────────────────────────────────────────
class HermesIndexSource {
  constructor() {
    this.auth = new GitHubAuth();
    this._index = null;
    this._loaded = false;
    this._github = null;
  }

  source_id() { return 'hermes-index'; }

  get is_available() {
    this._ensureLoaded();
    return Array.isArray(this._index?.skills) && this._index.skills.length > 0;
  }

  _ensureLoaded() {
    if (this._loaded) return;
    this._loaded = true;
    const cached = readIndexCache('hermes_index');
    if (cached && Array.isArray(cached.skills)) {
      this._index = cached;
      return;
    }
    // Network fetch skipped for browser compat; use cache
    this._index = { skills: [] };
  }

  get _gh() {
    if (!this._github) this._github = new GitHubSource();
    this._github.auth = this.auth;
    return this._github;
  }

  async search(query, limit = 10) {
    this._ensureLoaded();
    const skills = this._index?.skills || [];
    if (!skills.length) return [];
    if (!query.trim()) return skills.slice(0, limit).map(this._toMeta);

    const q = query.toLowerCase();
    const scored = [];
    for (let i = 0; i < skills.length; i++) {
      const s = skills[i];
      const haystack = [
        (s.name || '').toLowerCase(),
        (s.description || '').toLowerCase(),
        ...((s.tags || []).map(String)).map(t => t.toLowerCase()),
        (s.identifier || '').toLowerCase(),
      ].join(' ');
      if (!haystack.includes(q)) continue;
      const name = (s.name || '').toLowerCase();
      let score;
      if (name === q) score = 0;
      else if (name.startsWith(q)) score = 1;
      else score = 4;
      scored.push({ score, idx: i, s });
    }
    scored.sort((a, b) => a.score !== b.score ? a.score - b.score : a.idx - b.idx);
    return scored.slice(0, limit).map(x => this._toMeta(x.s));
  }

  async inspect(identifier) {
    this._ensureLoaded();
    const entry = this._findEntry(identifier);
    return entry ? this._toMeta(entry) : null;
  }

  async fetch(identifier) {
    this._ensureLoaded();
    const entry = this._findEntry(identifier);
    if (!entry) return null;
    const resolved = entry.resolved_github_id;
    if (resolved) {
      const bundle = await this._gh.fetch(resolved);
      if (bundle) {
        bundle.source = entry.source || 'hermes-index';
        bundle.identifier = identifier;
        return bundle;
      }
    }
    const repo = entry.repo;
    const p = entry.path;
    if (repo && p) {
      const bundle = await this._gh.fetch(`${repo}/${p}`);
      if (bundle) {
        bundle.source = entry.source || 'hermes-index';
        bundle.identifier = identifier;
        return bundle;
      }
    }
    return null;
  }

  _findEntry(identifier) {
    const skills = this._index?.skills || [];
    for (const s of skills) {
      if (s.identifier === identifier) return s;
    }
    for (const prefix of ['skills-sh/', 'skills.sh/', 'official/', 'github/', 'clawhub/']) {
      if (identifier.startsWith(prefix)) {
        const norm = identifier.slice(prefix.length);
        for (const s of skills) {
          if (s.identifier === norm || s.identifier === identifier) return s;
        }
      }
    }
    return null;
  }

  _toMeta(entry) {
    return {
      name: entry.name || '',
      description: entry.description || '',
      source: entry.source || 'hermes-index',
      identifier: entry.identifier || '',
      trust_level: entry.trust_level || 'community',
      repo: entry.repo || null,
      path: entry.path || null,
      tags: entry.tags || [],
      extra: entry.extra || {},
    };
  }
}

// ── LocalSource ─────────────────────────────────────────────────────────────
class LocalSource {
  constructor(localDir) {
    this.localDir = localDir || path.join(__dirname, '..', 'skills');
  }

  source_id() { return 'local'; }

  async search(query, limit = 10) {
    const results = [];
    if (!fs.existsSync(this.localDir)) return results;
    const queryLower = query.toLowerCase();
    const entries = fs.readdirSync(this.localDir);
    for (const name of entries) {
      const skillDir = path.join(this.localDir, name);
      const skillMd = path.join(skillDir, 'SKILL.md');
      if (!fs.statSync(skillDir).isDirectory() || !fs.existsSync(skillMd)) continue;
      if (name.startsWith('.') || name.startsWith('_')) continue;
      try {
        const content = fs.readFileSync(skillMd, 'utf8');
        const fm = parseFrontmatter(content);
        const desc = fm.description || '';
        const searchable = `${name} ${desc}`.toLowerCase();
        if (!queryLower || searchable.includes(queryLower)) {
          results.push({ name, description: String(desc), source: 'local', identifier: name, trust_level: 'community', tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [] });
        }
      } catch (_) { /* skip unreadable */ }
      if (results.length >= limit) break;
    }
    return results;
  }

  async inspect(identifier) {
    const skillMd = path.join(this.localDir, identifier, 'SKILL.md');
    if (!fs.existsSync(skillMd)) return null;
    try {
      const content = fs.readFileSync(skillMd, 'utf8');
      const fm = parseFrontmatter(content);
      return { name: fm.name || identifier, description: fm.description || '', source: 'local', identifier, trust_level: 'community', tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [] };
    } catch (_) { return null; }
  }

  async fetch(identifier) {
    const skillDir = path.join(this.localDir, identifier);
    const skillMd = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillMd)) return null;
    const files = {};
    const walkDir = (dir, prefix = '') => {
      try {
        for (const entry of fs.readdirSync(dir)) {
          if (entry.startsWith('.') || entry === '__pycache__') continue;
          const full = path.join(dir, entry);
          const rel = prefix ? `${prefix}/${entry}` : entry;
          const stat = fs.statSync(full);
          if (stat.isDirectory()) walkDir(full, rel);
          else if (entry.endsWith('.md') || entry.endsWith('.txt') || !entry.includes('.')) {
            try { files[rel] = fs.readFileSync(full, 'utf8'); } catch (_) {}
          }
        }
      } catch (_) {}
    };
    walkDir(skillDir);
    return { name: identifier, files, source: 'local', identifier, trust_level: 'community', metadata: {} };
  }
}

// ── Quarantine ──────────────────────────────────────────────────────────────
function quarantineBundle(bundle) {
  ensureHubDirs();
  const qDir = quarantineDir();
  const safeName = validateSkillName(bundle.name);
  const dest = path.join(qDir, safeName);
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const [relPath, content] of Object.entries(bundle.files)) {
    const safeRel = validateBundleRelPath(relPath);
    const fileDest = path.join(dest, ...safeRel.split('/'));
    const fileDir = path.dirname(fileDest);
    if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });
    if (typeof content === 'string') fs.writeFileSync(fileDest, content, 'utf8');
    else if (Buffer.isBuffer(content)) fs.writeFileSync(fileDest, content);
    else fs.writeFileSync(fileDest, String(content));
  }
  return dest;
}

// ── Install / Uninstall ─────────────────────────────────────────────────────
function installFromQuarantine(quarantinePath, skillName, bundle, scanResult) {
  ensureHubDirs();
  const safeSkillName = validateSkillName(skillName);
  const quarantineResolved = path.resolve(quarantinePath);
  const quarantineRoot = path.resolve(quarantineDir());

  if (!quarantineResolved.startsWith(quarantineRoot)) {
    throw new Error(`Unsafe quarantine path: ${quarantinePath}`);
  }

  // Check for symlinks in quarantine
  const checkSymlinks = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Quarantined skill contains symlinks: ${full}`);
      if (entry.isDirectory()) checkSymlinks(full);
    }
  };
  checkSymlinks(quarantineResolved);

  const installDir = path.join(skillsDir(), safeSkillName);
  if (fs.existsSync(installDir)) fs.rmSync(installDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(installDir), { recursive: true });
  fs.renameSync(quarantinePath, installDir);

  const lock = new HubLockFile();
  const skillHash = contentHash(installDir);
  const scanVerdict = typeof scanResult === 'string' ? scanResult : (scanResult?.verdict || 'safe');
  lock.record_install({
    name: safeSkillName,
    source: bundle.source || 'github',
    identifier: bundle.identifier || safeSkillName,
    trust_level: bundle.trust_level || 'community',
    scan_verdict: scanVerdict,
    skill_hash: skillHash,
    install_path: safeSkillName,
    files: Object.keys(bundle.files),
    metadata: bundle.metadata || {},
    scan_provenance: scanResult?.scan_provenance || {},
  });

  appendAuditLog('INSTALL', safeSkillName, bundle.source || 'github', bundle.trust_level || 'community', scanVerdict, skillHash);
  return installDir;
}

function uninstallSkill(skillName) {
  const safeName = validateSkillName(skillName);
  const lock = new HubLockFile();
  const entry = lock.get_installed(safeName);
  if (!entry) return { ok: false, error: `'${skillName}' is not a hub-installed skill (may be a builtin)` };

  let installPath;
  try {
    installPath = resolveLockInstallPath(entry.install_path, safeName);
  } catch (e) {
    return { ok: false, error: `Refusing to uninstall '${skillName}': ${e.message}` };
  }

  if (fs.existsSync(installPath)) fs.rmSync(installPath, { recursive: true, force: true });
  lock.record_uninstall(safeName);
  appendAuditLog('UNINSTALL', safeName, entry.source, entry.trust_level || 'community', 'n/a', 'user_request');
  return { ok: true, path: entry.install_path };
}

// ── Update checker ──────────────────────────────────────────────────────────
async function checkForUpdates(name = null) {
  const lock = new HubLockFile();
  let installed = lock.list_installed();
  if (name) installed = installed.filter(e => e.name === name);
  const tapsMgr = new TapsManager();
  const ghSource = new GitHubSource(tapsMgr.list());
  const localSource = new LocalSource(skillsDir());
  const sources = { github: ghSource, local: localSource };
  const results = [];

  for (const entry of installed) {
    const srcName = entry.source || '';
    const src = sources[srcName];
    if (!src) { results.push({ name: entry.name, identifier: entry.identifier, source: entry.source, status: 'unavailable' }); continue; }
    let bundle = null;
    try { bundle = await src.fetch(entry.identifier || entry.name); } catch (_) {}
    if (!bundle) { results.push({ name: entry.name, identifier: entry.identifier, source: entry.source, status: 'unavailable' }); continue; }
    const currentHash = entry.content_hash || entry.metadata?.content_hash || '';
    const latestHash = bundleContentHash(bundle.files || {});
    const status = currentHash === latestHash ? 'up_to_date' : 'update_available';
    results.push({ name: entry.name, identifier: entry.identifier, source: entry.source, status, current_hash: currentHash, latest_hash: latestHash, bundle });
  }
  return results;
}

// ── Source router ───────────────────────────────────────────────────────────
function createSourceRouter() {
  const tapsMgr = new TapsManager();
  const extraTaps = tapsMgr.list();
  return [
    new OptionalSkillSource(),
    new HermesIndexSource(),
    new SkillsShSource(),
    new GitHubSource(extraTaps),
    new ClawHubSource(),
    new LocalSource(),
  ];
}

// ── Unified search ─────────────────────────────────────────────────────────
async function unifiedSearch(query, sources, limit = 10) {
  const allResults = [];
  const sourceCount = {};

  await Promise.allSettled(sources.map(async (src) => {
    try {
      const results = await src.search(query, 50);
      sourceCount[src.source_id()] = results.length;
      allResults.push(...results);
    } catch (_) {}
  }));

  // Deduplicate by identifier, prefer higher trust
  const seen = new Map();
  for (const r of allResults) {
    if (!seen.has(r.identifier) || trustRank(r.trust_level) > trustRank(seen.get(r.identifier).trust_level)) {
      seen.set(r.identifier, r);
    }
  }
  return [...seen.values()].slice(0, limit);
}

// ── SkillsHub class (main API) ──────────────────────────────────────────────
class SkillsHub {
  constructor() {
    this.lock = new HubLockFile();
    this.taps = new TapsManager();
  }

  // installFromGithub(repo, skillName) — install a GitHub skill
  async installFromGithub(repo, skillName) {
    ensureHubDirs();
    const identifier = `${repo}/${skillName}`;
    const ghSource = new GitHubSource(this.taps.list());
    const bundle = await ghSource.fetch(identifier);
    if (!bundle) throw new Error(`Could not fetch skill ${identifier} from GitHub`);

    const qPath = quarantineBundle({ name: skillName, files: bundle.files, source: bundle.source, identifier: bundle.identifier, trust_level: bundle.trust_level, metadata: bundle.metadata || {} });
    const installedPath = installFromQuarantine(qPath, skillName, bundle, 'safe');
    return { name: skillName, path: installedPath, source: bundle.source, identifier: bundle.identifier };
  }

  async uninstall(skillName) { return uninstallSkill(skillName); }

  listInstalled() { return this.lock.list_installed(); }

  async listAvailable(query = '', limit = 20) {
    const sources = createSourceRouter();
    return unifiedSearch(query, sources, limit);
  }

  async searchHub(query, limit = 10) {
    const sources = createSourceRouter();
    return unifiedSearch(query, sources, limit);
  }

  async quarantineSkill(name) {
    const lock = new HubLockFile();
    const entry = lock.get_installed(name);
    if (!entry) throw new Error(`'${name}' is not installed`);
    const skillPath = path.join(skillsDir(), ...entry.install_path.split('/'));
    if (!fs.existsSync(skillPath)) throw new Error(`Skill directory not found: ${skillPath}`);

    const bundle = { name, files: {}, source: entry.source, identifier: entry.identifier, trust_level: entry.trust_level, metadata: entry.metadata || {} };
    const walkDir = (dir, prefix = '') => {
      try {
        for (const entry2 of fs.readdirSync(dir)) {
          if (entry2.startsWith('.')) continue;
          const full = path.join(dir, entry2);
          const rel = prefix ? `${prefix}/${entry2}` : entry2;
          const stat = fs.statSync(full);
          if (stat.isDirectory()) walkDir(full, rel);
          else try { bundle.files[rel] = fs.readFileSync(full); } catch (_) {}
        }
      } catch (_) {}
    };
    walkDir(skillPath);

    const qPath = quarantineBundle(bundle);
    // Remove from live skills dir
    if (fs.existsSync(skillPath)) fs.rmSync(skillPath, { recursive: true, force: true });
    this.lock.record_uninstall(name);
    appendAuditLog('QUARANTINE', name, entry.source, entry.trust_level || 'community', 'user_request', '');
    return qPath;
  }

  async restoreFromQuarantine(name) {
    const qDir = quarantineDir();
    const qPath = path.join(qDir, name);
    if (!fs.existsSync(qPath)) throw new Error(`No quarantined skill found: ${name}`);

    const files = {};
    const walkDir = (dir, prefix = '') => {
      try {
        for (const entry2 of fs.readdirSync(dir)) {
          if (entry2.startsWith('.')) continue;
          const full = path.join(dir, entry2);
          const rel = prefix ? `${prefix}/${entry2}` : entry2;
          const stat = fs.statSync(full);
          if (stat.isDirectory()) walkDir(full, rel);
          else try { files[rel] = fs.readFileSync(full); } catch (_) {}
        }
      } catch (_) {}
    };
    walkDir(qPath);

    const bundle = { name, files, source: 'quarantine', identifier: name, trust_level: 'community', metadata: {} };
    const qPath2 = quarantineBundle(bundle);
    const installedPath = installFromQuarantine(qPath2, name, bundle, 'restored');
    return { name, path: installedPath };
  }

  addTap(repo, repoPath = 'skills/') { return this.taps.add(repo, repoPath); }
  removeTap(repo) { return this.taps.remove(repo); }
  listTaps() { return this.taps.list(); }

  async rebuildIndex() {
    const sources = createSourceRouter();
    const allSkills = await unifiedSearch('', sources, 500);
    writeIndexCache('rebuilt_index', allSkills);
    return { count: allSkills.length };
  }

  async checkForUpdates(name = null) { return checkForUpdates(name); }
}

// ── CLI output helpers ──────────────────────────────────────────────────────
function formatSkillMeta(meta, idx) {
  const trustColors = { builtin: C.green, trusted: C.cyan, community: C.gray, 'agent-created': C.yellow };
  const trustCol = trustColors[meta.trust_level] || C.gray;
  const sourceCol = meta.source === 'local' ? C.green : C.cyan;
  const num = (idx + 1).toString().padStart(2, ' ');
  const name = (meta.name || '').padEnd(28);
  const desc = (meta.description || '').slice(0, 50).padEnd(50);
  const tags = (meta.tags || []).slice(0, 3).join(', ');
  return `  ${num}. ${sourceCol}${name}${C.reset} ${C.gray}${desc}${C.reset} [${trustCol}${meta.trust_level}${C.reset}] ${tags ? C.dim + tags + C.reset : ''}`;
}

function formatUpdateResult(r) {
  const statusColors = { up_to_date: C.green, update_available: C.yellow, unavailable: C.red };
  const statusCol = statusColors[r.status] || C.gray;
  const icon = r.status === 'up_to_date' ? '✔' : r.status === 'update_available' ? '↑' : '✘';
  return `  ${statusCol}${icon}${C.reset} ${C.cyan}${r.name.padEnd(28)}${C.reset} ${statusCol}${r.status}${C.reset} ${r.source ? C.gray + r.source + C.reset : ''}`;
}

// ── Module exports ──────────────────────────────────────────────────────────
module.exports = {
  SkillsHub,
  HubLockFile,
  TapsManager,
  GitHubSource,
  OptionalSkillSource,
  SkillsShSource,
  ClawHubSource,
  HermesIndexSource,
  LocalSource,
  GitHubAuth,
  ensureHubDirs,
  quarantineBundle,
  installFromQuarantine,
  uninstallSkill,
  checkForUpdates,
  contentHash,
  bundleContentHash,
  validateSkillName,
  parseFrontmatter,
  extractReferencedPaths,
  formatSkillMeta,
  formatUpdateResult,
  createSourceRouter,
  unifiedSearch,
  readIndexCache,
  writeIndexCache,
  // Path helpers
  hubDir, lockFile, quarantineDir, auditLog, tapsFile, indexCacheDir, skillsDir,
  // Constants
  GITHUB_TAP_PROVIDERS,
  DEFAULT_TAPS,
  TRUSTED_REPOS,
  INDEX_CACHE_TTL_MS,
};
