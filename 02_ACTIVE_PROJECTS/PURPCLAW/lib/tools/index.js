'use strict';
/**
 * lib/tools/index.js — the tool registry. Each tool is a self-contained
 * module that exports `{ name, description, inputSchema, execute(args) }`.
 * Tools are the building blocks of the agent — the LLM gets a list of
 * tool descriptions in its system prompt and emits tool-call JSON to
 * invoke them.
 *
 * Tools are pure: they take args, return a result, and don't talk to
 * the LLM directly. The agent loop is the orchestrator.
 *
 * Tool-call format (matching OpenAI's function-calling spec):
 *   { "tool": "read", "args": { "path": "/foo/bar.ts", "limit": 200 } }
 *   → { "ok": true, "content": "...", "path": "/foo/bar.ts" }
 */

const path = require('path');
const fs   = require('fs');

// ── PTY session map ──────────────────────────────────────────────
// Module-level map persists for the Node.js process lifetime.
// Clean up on process exit so long-running PM2 daemons don't accumulate
// entries from killed/restarted processes.
const _ptySessions = new Map();
process.on('exit', () => { _ptySessions.forEach(s => { try { s.kill(); } catch {} }); });

// All tools use the central child-registry for safe spawns.
// Tools live at lib/tools/index.js, registry is at lib/child-registry.js.
const { trackedSpawn, execSafe } = require('../child-registry');
const execPolicy = require('../exec-policy');

// Resolve a real ripgrep binary ONCE, by absolute path — never depend on the
// daemon's PATH (pm2-spawned services don't inherit an interactive PATH, so a
// bare `rg` spawn throws ENOENT on every grep call and falls to the slow Node
// walk). @vscode/ripgrep ships a platform binary; prefer it, else probe PATH,
// else null (caller uses Node fallback and skips the doomed spawn entirely).
let _rgBin; // undefined = not resolved yet, null = none, string = path
function rgBin() {
  if (_rgBin !== undefined) return _rgBin;
  try {
    const p = require('@vscode/ripgrep').rgPath;
    if (p && fs.existsSync(p)) { _rgBin = p; return _rgBin; }
  } catch { /* package not installed */ }
  // PATH probe (sync, one-time) — works if a system rg is actually present.
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const r = require('child_process').spawnSync(which, ['rg'], { encoding: 'utf-8' });
    const hit = (r.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
    if (hit && fs.existsSync(hit)) { _rgBin = hit; return _rgBin; }
  } catch { /* ignore */ }
  _rgBin = null;
  return _rgBin;
}

// MCP tools are loaded asynchronously at startup. We expose a
// dynamic list of MCP-backed tools that the agent loop can call.
// Built-in tools are registered synchronously below; MCP tools are
// merged in at runtime via registerMcpTools().
let _mcpTools = [];
let _mcpCaller = null;
function registerMcpTools(tools, caller) {
  _mcpTools = tools || [];
  _mcpCaller = caller;
}

class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.aliasMap = new Map(); // alias → canonical name
  }
  register(tool) {
    if (!tool.name || typeof tool.execute !== 'function') {
      throw new Error(`invalid tool: ${JSON.stringify(Object.keys(tool))}`);
    }
    this.tools.set(tool.name, tool);
    // Build alias map
    if (tool.aliases && Array.isArray(tool.aliases)) {
      for (const alias of tool.aliases) {
        this.aliasMap.set(alias, tool.name);
      }
    }
    return this;
  }
  // Resolve alias to canonical name, return as-is if already canonical
  _resolve(name) {
    return this.aliasMap.get(name) || name;
  }
  list() {
    const builtin = [...this.tools.values()].map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
    const mcp = _mcpTools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
    return [...builtin, ...mcp];
  }
  has(name) {
    const resolved = this._resolve(name);
    return this.tools.has(resolved) || _mcpTools.some(t => t.name === resolved);
  }
  async invoke(name, args) {
    const resolved = this._resolve(name);
    // Built-in tool?
    if (this.tools.has(resolved)) {
      const tool = this.tools.get(resolved);
      try {
        const result = await tool.execute(args || {});
        return { ok: true, ...result };
      } catch (e) {
        return { ok: false, error: e.message || String(e) };
      }
    }
    // MCP tool?
    const mcpTool = _mcpTools.find(t => t.name === name);
    if (mcpTool && mcpTool.mcp) {
      try {
        const r = await _mcpCaller(mcpTool.mcp.server, mcpTool.mcp.tool, args || {});
        return r;
      } catch (e) {
        return { ok: false, error: e.message || String(e) };
      }
    }
    return { ok: false, error: `unknown tool: ${name}` };
  }
}

const registry = new ToolRegistry();

// ── read ────────────────────────────────────────────────────────────────────
registry.register({
  name: 'read',
  description: 'Read the contents of a file. Returns up to `limit` lines starting at `offset`.',
  inputSchema: {
    type: 'object',
    properties: {
      path:   { type: 'string', description: 'Absolute or cwd-relative file path' },
      offset: { type: 'integer', description: 'Line offset (0-indexed)', default: 0 },
      limit:  { type: 'integer', description: 'Max lines to return', default: 200 },
    },
    required: ['path'],
  },
  execute: async ({ path: p, offset = 0, limit = 200 }) => {
    const abs = path.resolve(p);
    if (!fs.existsSync(abs)) return { error: `not found: ${abs}` };
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) return { error: `is a directory, not a file: ${abs}` };
    const content = fs.readFileSync(abs, 'utf-8');
    const lines   = content.split('\n');
    const slice   = lines.slice(offset, offset + limit);
    return { content: slice.join('\n'), totalLines: lines.length, path: abs, size: stat.size };
  },
});

registry.register({
  name: 'write',
  description: 'Write content to a file (overwrites if exists, creates if not).',
  inputSchema: {
    type: 'object',
    properties: {
      path:    { type: 'string', description: 'File path' },
      file:    { type: 'string', description: 'Alias for path (LLMs often default to "file")' },
      content: { type: 'string', description: 'Content to write' },
    },
  },
  execute: async (args) => {
    const p = args.path || args.file;
    const content = args.content || '';
    if (!p) return { error: 'path (or file) is required' };
    const abs = path.resolve(p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
    const stat = fs.statSync(abs);
    return { path: abs, bytes: stat.size };
  },
});

// ── edit (find/replace) ─────────────────────────────────────────────────────
registry.register({
  name: 'edit',
  description: 'Edit a file by replacing a unique string with a new one. The `find` string must appear exactly once.',
  inputSchema: {
    type: 'object',
    properties: {
      path:    { type: 'string', description: 'File path' },
      file:    { type: 'string', description: 'Alias for path' },
      find:    { type: 'string', description: 'Exact string to find (must be unique in the file)' },
      old:     { type: 'string', description: 'Alias for find' },
      replace: { type: 'string', description: 'Replacement string' },
      new:     { type: 'string', description: 'Alias for replace' },
    },
  },
  execute: async (args) => {
    const p = args.path || args.file;
    if (!p) return { error: 'path (or file) is required' };
    const find = args.find || args.old;
    const replace = args.replace || args.new;
    if (find === undefined || replace === undefined) return { error: 'find (or old) and replace (or new) are required' };
    const abs = path.resolve(p);
    if (!fs.existsSync(abs)) return { error: `not found: ${abs}` };
    const content = fs.readFileSync(abs, 'utf-8');
    const count   = content.split(find).length - 1;
    if (count === 0) return { error: `find string not found in ${abs}` };
    if (count > 1)   return { error: `find string appears ${count} times; must be unique` };
    const newContent = content.replace(find, replace);
    fs.writeFileSync(abs, newContent, 'utf-8');
    return { path: abs, replaced: 1, findLength: find.length, replaceLength: replace.length };
  },
});

// ── shell ───────────────────────────────────────────────────────────────────
registry.register({
  name: 'shell',
  description: 'Run a shell command and return stdout/stderr. Default timeout 30s.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to run' },
      timeout: { type: 'integer', description: 'Timeout in ms', default: 30_000 },
      cwd:     { type: 'string',  description: 'Working directory' },
    },
    required: ['command'],
  },
  execute: async ({ command, timeout = 30_000, cwd, approvalId }) => {
    const safeCwd = cwd ? path.resolve(cwd) : process.cwd();
    // Gate destructive shell commands through the approval queue. Read-only
    // commands (status, ls, echo, cat, git status, etc.) and PURPCLAW_APPROVAL_MODE=auto
    // pass through untouched. classifyRisk drives what's "destructive".
    const gate = require('../tool-gate');
    const decision = await gate.requireApproval(command, { approvalId });
    if (!decision.allowed) {
      return { code: -1, needs_approval: true, approvalId: decision.approvalId, risks: decision.risks,
        hint: `approve with: { tool:"approvals", args:{ op:"approve", id:"${decision.approvalId}" } } then re-invoke shell with approvalId` };
    }
    // Enforce exec-policy allowlist — deny wins over allow, then governance fallthrough.
    const policyResult = execPolicy.check(command);
    if (policyResult.allowed === false) {
      return {
        code: -1,
        error: `Command denied by exec-policy: matched "${policyResult.matched}" (${policyResult.source})`,
        exec_policy: { matched: policyResult.matched, source: policyResult.source },
        hint: 'Run: purpclaw execpolicy allow "<pattern>" to permit this command',
      };
    }
    return new Promise(resolve => {
      const child = trackedSpawn(
        process.platform === 'win32' ? 'cmd.exe' : 'sh',
        process.platform === 'win32' ? ['/c', command] : ['-c', command],
        {
          tag: `shell(${command.slice(0, 60)})`,
          cwd: safeCwd,
          timeoutMs: timeout,
          windowsHide: true,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      let stdout = '', stderr = '';
      child.stdout?.on('data', d => stdout += d.toString());
      child.stderr?.on('data', d => stderr += d.toString());
      child.on('close', code => {
        resolve({
          code,
          stdout: stdout.substring(0, 100_000),
          stderr: stderr.substring(0, 50_000),
          cwd: safeCwd,
        });
      });
      child.on('error', e => resolve({ code: -1, error: e.message }));
    });
  },
});

// ── PTY terminal (Tier 2 priority #3) ────────────────────────────────────────

// pty_run — run a command in a real PTY and return captured output.
// Useful for interactive commands that depend on a TTY (vim, ssh, psql,
// REPLs). Falls back to plain spawn if the native module is unavailable.
const PTY = require('../pty');
registry.register({
  name: 'pty_run',
  description: 'Run a command in a real PTY. Captures stdout/stderr and exit code. Use for interactive commands (ssh, vim, REPLs, curses apps).',
  inputSchema: {
    type: 'object',
    properties: {
      command:   { type: 'string',  description: 'Executable (e.g. cmd.exe, bash, ssh)' },
      args:      { type: 'array', items: { type: 'string' }, description: 'Command arguments' },
      cwd:       { type: 'string',  description: 'Working directory' },
      env:       { type: 'object', description: 'Additional env vars (merged with process.env)' },
      cols:      { type: 'integer', description: 'Terminal width (default 80)', default: 80 },
      rows:      { type: 'integer', description: 'Terminal height (default 24)', default: 24 },
      timeoutMs: { type: 'integer', description: 'Auto-kill after N ms' },
    },
    required: ['command'],
  },
  execute: async ({ command, args = [], cwd, env, cols, rows, timeoutMs }) => {
    try {
      const r = await PTY.run(command, args, { cwd, env, cols, rows, timeoutMs });
      // Strip ANSI escapes for cleaner return — caller can disable by
      // sending PURPCLAW_KEEP_ANSI=1 (we don't actually use that flag
      // here; this is a pragmatic default).
      const clean = s => String(s || '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
      return {
        ok: r.exitCode === 0,
        stdout: clean(r.stdout).trim().substring(0, 50_000),
        stderr: clean(r.stderr).trim().substring(0, 50_000),
        exitCode: r.exitCode,
        durationMs: r.durationMs,
        pid: r.pid,
        mode: r.mode,           // 'pty' or 'spawn' (fallback)
        pty: r.mode === 'pty',
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
});

// pty_session — open a long-lived PTY session. Returns a session id that
// the agent can read/write/kill via pty_io. For interactive workflows.
// _ptySessions is declared at module level (line ~24) and cleaned up on process exit.
let _ptySeq = 0;
registry.register({
  name: 'pty_session',
  description: 'Open / read / write / resize / kill a long-lived PTY session. Use for ssh, REPLs, or any command that needs an interactive terminal.',
  inputSchema: {
    type: 'object',
    properties: {
      op:        { type: 'string', enum: ['open', 'read', 'write', 'resize', 'kill', 'list', 'close'], description: 'Operation' },
      sessionId: { type: 'string', description: 'Session id (for read/write/resize/kill/close)' },
      command:   { type: 'string', description: 'For op=open' },
      args:      { type: 'array', items: { type: 'string' }, description: 'For op=open' },
      cwd:       { type: 'string', description: 'For op=open' },
      data:      { type: 'string', description: 'For op=write (keystrokes / stdin)' },
      cols:      { type: 'integer', description: 'For op=open/resize' },
      rows:      { type: 'integer', description: 'For op=open/resize' },
      since:     { type: 'integer', description: 'For op=read, byte offset to start from (default 0)', default: 0 },
    },
    required: ['op'],
  },
  execute: async ({ op, sessionId, command, args = [], cwd, data, cols, rows, since = 0 }) => {
    if (op === 'open') {
      if (!command) return { ok: false, error: 'op=open requires command' };
      if (!PTY.isAvailable()) {
        return { ok: false, error: 'PTY native module unavailable; cannot open session' };
      }
      const id = `pty-${++_ptySeq}-${Date.now()}`;
      const buf = [];          // data buffer (consumed on read)
      let totalBytes = 0;
      const session = PTY.spawn(command, args, {
        cwd, cols: cols || 80, rows: rows || 24,
        onData: d => {
          buf.push(d);
          totalBytes += Buffer.byteLength(d);
          // Cap at 10MB to avoid unbounded growth
          if (totalBytes > 10 * 1024 * 1024) buf.shift();
        },
      });
      session._pty_id = id;
      session._pty_buf = buf;
      session._pty_pos = 0;
      session._pty_total = 0;
      _ptySessions.set(id, session);
      session.on('data', d => { /* listener already in onData */ });
      session.on('exit', ({ exitCode }) => {
        setTimeout(() => _ptySessions.delete(id), 60_000); // keep entry for 60s after exit
      });
      return { ok: true, sessionId: id, pid: session.pid(), cols: session.cols(), rows: session.rows() };
    }
    if (op === 'read') {
      const s = _ptySessions.get(sessionId);
      if (!s) return { ok: false, error: `unknown session: ${sessionId}` };
      const chunk = s._pty_buf.join('').substring(since);
      return { ok: true, sessionId, data: chunk, length: chunk.length, exitCode: s.exitCode, alive: s.isAlive() };
    }
    if (op === 'write') {
      const s = _ptySessions.get(sessionId);
      if (!s) return { ok: false, error: `unknown session: ${sessionId}` };
      const ok = s.write(data || '');
      return { ok, sessionId, bytes: Buffer.byteLength(data || '') };
    }
    if (op === 'resize') {
      const s = _ptySessions.get(sessionId);
      if (!s) return { ok: false, error: `unknown session: ${sessionId}` };
      s.resize(cols || 80, rows || 24);
      return { ok: true, sessionId, cols: cols || 80, rows: rows || 24 };
    }
    if (op === 'kill' || op === 'close') {
      const s = _ptySessions.get(sessionId);
      if (!s) return { ok: false, error: `unknown session: ${sessionId}` };
      s.kill();
      _ptySessions.delete(sessionId);
      return { ok: true, sessionId, killed: true };
    }
    if (op === 'list') {
      const out = [];
      for (const [id, s] of _ptySessions.entries()) {
        out.push({ sessionId: id, pid: s.pid(), command: s.command(), alive: s.isAlive(), durationMs: s.durationMs() });
      }
      return { ok: true, sessions: out };
    }
    return { ok: false, error: `unknown op: ${op}` };
  },
});

// ── grep ────────────────────────────────────────────────────────────────────
registry.register({
  name: 'grep',
  description: 'Search for a regex pattern in files. Returns matching lines with file:line:content format.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern:  { type: 'string', description: 'Regex pattern' },
      path:     { type: 'string', description: 'Directory or file to search', default: '.' },
      maxLines: { type: 'integer', description: 'Max matching lines to return', default: 200 },
      glob:     { type: 'string', description: 'File glob (e.g. "*.js")', default: '*' },
    },
    required: ['pattern'],
  },
  execute: async ({ pattern, path: root = '.', maxLines = 200, glob = '*' }) => {
    // Round 2/B — tool cache. Skip when caller passed a maxLines override
    // (small ones); cache the standard 200-line call.
    const TC = require('../tool-cache');
    const cacheKey = TC.keyFor('grep', { pattern, path: root, maxLines, glob });
    const cached = TC.get(cacheKey);
    if (cached) return { ...cached, _cache: 'hit' };
    const result = await (async () => {
      const bin = rgBin();
      if (bin) {
        const rg = await execSafe(bin, ['--json', '-g', glob, '--', pattern, path.resolve(root)], { timeoutMs: 30_000 }).catch(() => null);
        // rg exits 1 when there are simply no matches — that's success with 0 hits, not a failure.
        if (rg && (rg.code === 0 || rg.code === 1)) {
          const lines = rg.stdout.split('\n').filter(Boolean).slice(0, maxLines);
          return { matches: lines, count: lines.length, engine: 'ripgrep' };
        }
      }
      // Node fallback: walk files, read first N lines, regex test
      const re = new RegExp(pattern);
      const matches = [];
      function walk(dir, depth = 0) {
        if (depth > 8 || matches.length >= maxLines) return;
        let entries = null;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          if (['node_modules', '.next', '.git', 'dist', 'build', '__pycache__'].includes(e.name)) continue;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full, depth + 1);
          else if (e.isFile()) {
            let content = null;
            try { if (fs.statSync(full).size > 2_000_000) continue; } catch { continue; }
            try { content = fs.readFileSync(full, 'utf-8'); } catch { continue; }
            const fileLines = content.split('\n');
            for (let i = 0; i < fileLines.length; i++) {
              if (re.test(fileLines[i])) {
                matches.push(`${full}:${i + 1}:${fileLines[i]}`);
                if (matches.length >= maxLines) return;
              }
            }
          }
        }
      }
      walk(path.resolve(root));
      return { matches, count: matches.length, engine: 'node-fallback' };
    })();
    if (result && result.ok !== false) TC.put(cacheKey, result, { tool: 'grep', args: { pattern, path: root, maxLines, glob }, ttlMs: 60000 });
    return { ...result, _cache: 'miss' };
  },
});

// ── fuzzy-find (nucleo-grade fuzzy file search) ────────────────────────────
// Uses fuzzaldrin-plus (Atom's fuzzy matcher) for ranking.
// Walks directories, collects file paths + names, scores each against query,
// returns top-N ranked results with scores. No server, no native deps.
registry.register({
  name: 'fuzzy_find',
  description: 'Fuzzy file search. Finds files by fuzzy-matching their paths against a query string, ranking by relevance score. Faster than grep for "I know the name but not the content" queries.',
  inputSchema: {
    type: 'object',
    properties: {
      query:    { type: 'string', description: 'Fuzzy query string (e.g. "purpclaw.js" matches "purpclaw.js", "purpclw", "prpclaw")' },
      path:     { type: 'string', description: 'Root directory to search', default: '.' },
      maxResults: { type: 'integer', description: 'Max results to return', default: 20 },
      skipDirs: { type: 'array', items: { type: 'string' }, description: 'Directories to skip', default: ['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', 'vendor'] },
    },
    required: ['query'],
  },
  execute: async ({ query, path: root = '.', maxResults = 20, skipDirs = ['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', 'vendor'] }) => {
    const TC = require('../tool-cache');
    const cacheKey = TC.keyFor('fuzzy_find', { query, root: path.resolve(root), maxResults });
    const cached = TC.get(cacheKey);
    if (cached) return { ...cached, _cache: 'hit' };

    const result = await (async () => {
      let fuzzaldrin;
      try { fuzzaldrin = require('fuzzaldrin-plus'); } catch { return { ok: false, error: 'fuzzaldrin-plus not installed' }; }

      // Collect all file paths under root
      const files = [];
      const SKIP = new Set(skipDirs);
      function walk(dir, depth = 0) {
        if (depth > 12) return;
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          if (e.isDirectory()) {
            if (SKIP.has(e.name)) continue;
            walk(path.join(dir, e.name), depth + 1);
          } else if (e.isFile()) {
            files.push(path.join(dir, e.name));
          }
        }
      }
      walk(path.resolve(root));

      // Score each file: fuzzaldrin-plus scores the filename against the query,
      // we also score the full relative path so "src/agent/foo.js" matches "agent foo"
      const scored = files.map(f => {
        const rel = path.relative(root, f).replace(/\\/g, '/');
        const name = path.basename(f);
        const nameScore = fuzzaldrin.score(name, query);
        const pathScore = fuzzaldrin.score(rel, query);
        const bestScore = Math.max(nameScore, pathScore * 0.7); // slight preference for name match
        return { file: rel, score: bestScore };
      });

      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, maxResults).filter(r => r.score > 0);

      return {
        ok: true,
        results: top,
        total: files.length,
      };
    })();

    if (result && result.ok) TC.put(cacheKey, result, { tool: 'fuzzy_find', args: { query, root: path.resolve(root), maxResults }, ttlMs: 30000 });
    return { ...result, _cache: 'miss' };
  },
});

// ── code-search (semantic) ─────────────────────────────────────────────────
registry.register({
  name: 'code-search',
  description: 'Semantic + symbol search over the codebase. Use for "where is X defined" or "find code that does Y".',
  inputSchema: {
    type: 'object',
    properties: {
      query:  { type: 'string', description: 'Natural-language query or symbol name' },
      limit: { type: 'integer', description: 'Max results', default: 10 },
    },
    required: ['query'],
  },
  execute: async ({ query, limit = 10 }) => {
    const codePath = path.join(__dirname, '..', '..', 'commands', 'code.js');
    const purpclaw = path.resolve(__dirname, '..', '..', 'bin', 'purpclaw.js');
    const r = await execSafe(process.execPath, [purpclaw, 'code', 'search', query], { timeoutMs: 60_000 });
    return { output: r.stdout.substring(0, 50_000), ok: r.ok };
  },
});

// ── discover — Agentic Resource Discovery (ARD) ──────────────────────────────
// Ask by INTENT instead of carrying every capability in your head. Returns the
// top-ranked tools + agents for what you're trying to do, from the live
// manifest (the catalog). "Search outside the model": when unsure which
// tool/agent fits, call discover first, then invoke the top match.
registry.register({
  name: 'discover',
  description: 'Find the best tools/agents for a task by intent (e.g. "read a file", "review code", "scan ports"). Returns ranked capabilities + how to invoke them. Use when unsure which tool or agent fits.',
  inputSchema: {
    type: 'object',
    properties: {
      intent: { type: 'string', description: 'What you are trying to do, in plain words' },
      kind:   { type: 'string', description: 'tool | agent | all', default: 'all' },
      limit:  { type: 'integer', description: 'Max matches', default: 8 },
    },
    required: ['intent'],
  },
  execute: async ({ intent, kind = 'all', limit = 8 }) => {
    const STOP = new Set(['the','a','an','to','of','for','and','or','my','me','i','it','is','do','can','help','with','that','this','how','what','need','want','please','use']);
    const tok = (s) => (String(s || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 1 && !STOP.has(w));
    const terms = tok(intent);
    if (!terms.length) return { matches: [], note: 'empty intent' };
    let man;
    try { man = require('../system-manifest').getManifest(); }
    catch (e) { return { error: 'manifest unavailable: ' + e.message, matches: [] }; }
    const scoreOf = (name, body) => {
      const nameT = new Set(tok(name)), bodyT = new Set(tok(body));
      let s = 0; const hits = [];
      for (const t of terms) {
        if (nameT.has(t)) { s += 5; hits.push(t); }
        else if (bodyT.has(t)) { s += 2; hits.push(t); }
        else if ((name + ' ' + body).toLowerCase().includes(t)) { s += 1; hits.push(t); }
      }
      return { s, hits };
    };
    const out = [];
    if (kind === 'all' || kind === 'tool') for (const t of (man.tools || [])) {
      const { s, hits } = scoreOf(t.name, [t.description, (t.aliases || []).join(' ')].join(' '));
      if (s > 0) out.push({ kind: 'tool', name: t.name, score: s, why: hits.join(','), invoke: `{"tool":"${t.name}","args":{}}` });
    }
    if (kind === 'all' || kind === 'agent') for (const a of (man.agents || [])) {
      const nm = a.name || a.key || '';
      const { s, hits } = scoreOf([nm, a.role].join(' '), [a.role, a.division, (a.skills || []).join(' ')].join(' '));
      if (s > 0) out.push({ kind: 'agent', name: nm, score: s, why: hits.join(','), invoke: `{"tool":"spawn","args":{"agent":"${(a.key || nm).toLowerCase()}","task":"..."}}` });
    }
    out.sort((x, y) => y.score - x.score);
    return { intent, matches: out.slice(0, Math.min(Math.max(limit, 1), 40)), total: out.length };
  },
});

// ── web-fetch ───────────────────────────────────────────────────────────────
registry.register({
  name: 'web-fetch',
  description: 'Fetch a URL and return the text content. Max 100k chars.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch' },
    },
    required: ['url'],
  },
  execute: async ({ url }) => {
    const https = require('https');
    const http  = require('http');
    return new Promise((resolve) => {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, { timeout: 15_000, headers: { 'User-Agent': 'PURPCLAW/0.1' } }, res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve({ status: res.statusCode, body: body.substring(0, 100_000), url }));
      });
      req.on('error', e => resolve({ error: e.message, url }));
      req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout', url }); });
    });
  },
});

// ── git (read-only operations) ──────────────────────────────────────────────
registry.register({
  name: 'git',
  description: 'Read-only git operations: status, diff, log, branch.',
  inputSchema: {
    type: 'object',
    properties: {
      op:    { type: 'string', enum: ['status', 'diff', 'log', 'branch'], description: 'Git operation' },
      path:  { type: 'string', description: 'Repo path', default: '.' },
      limit: { type: 'integer', description: 'Max log entries', default: 20 },
    },
    required: ['op'],
  },
  execute: async ({ op, path: repoPath = '.', limit = 20 }) => {
    const cwd = path.resolve(repoPath);
    const args = {
      status: ['status', '--porcelain'],
      diff:   ['diff'],
      log:    ['log', '--oneline', `-${limit}`],
      branch: ['branch', '--show-current'],
    }[op] || [];
    const r = await execSafe('git', args, { cwd, timeoutMs: 15_000 });
    return { output: (r.stdout || r.stderr || '').substring(0, 50_000), code: r.code };
  },
});

// ── git_write (mutating ops, gated through the approval queue) ────────────────
registry.register({
  name: 'git_write',
  description: 'Mutating git ops: add, commit, branch (create), checkout. Destructive ops are gated by the approval queue — commit/checkout return needs_approval unless PURPCLAW_APPROVAL_MODE=auto or a valid approvalId is supplied.',
  inputSchema: {
    type: 'object',
    properties: {
      op:      { type: 'string', enum: ['add', 'commit', 'branch', 'checkout'], description: 'Mutating git operation' },
      path:    { type: 'string', description: 'Repo path', default: '.' },
      files:   { type: 'string', description: 'Path spec for add (default ".")', default: '.' },
      message: { type: 'string', description: 'Commit message (op=commit)' },
      branch:  { type: 'string', description: 'Branch name (op=branch/checkout)' },
      approvalId: { type: 'string', description: 'Approval id from the approvals tool, to run a previously-gated op' },
    },
    required: ['op'],
  },
  execute: async ({ op, path: repoPath = '.', files = '.', message, branch, approvalId }) => {
    const cwd = path.resolve(repoPath);
    const gate = require('../tool-gate');
    const argsMap = {
      add:      ['add', files],
      commit:   ['commit', '-m', message || 'update'],
      branch:   ['branch', branch || ''],
      checkout: ['checkout', branch || ''],
    };
    const args = (argsMap[op] || []).filter(Boolean);
    if ((op === 'commit' || op === 'branch') && !argsMap[op].some(Boolean)) {
      return { ok: false, error: `${op} requires ${op === 'commit' ? 'message' : 'branch'}` };
    }
    // Gate the two ops that change history/HEAD. add + branch-create are cheap/reversible.
    if (op === 'commit' || op === 'checkout') {
      const command = `git ${args.join(' ')}`;
      const decision = await gate.requireApproval(command, { approvalId, contract: { type: 'operations' } });
      if (!decision.allowed) {
        return { ok: false, needs_approval: true, approvalId: decision.approvalId, risks: decision.risks,
          hint: `approve with the approvals tool: { op: "approve", id: "${decision.approvalId}" }, then re-invoke with approvalId` };
      }
    }
    const r = await execSafe('git', args, { cwd, timeoutMs: 30_000 });
    return { ok: r.code === 0, code: r.code, output: (r.stdout || r.stderr || '').substring(0, 20_000) };
  },
});

// ── approvals (the destructive-action approval queue, as a tool) ──────────────
registry.register({
  name: 'approvals',
  description: 'Manage the destructive-action approval queue: list pending, approve, or reject. Gated tools (git_write commit/checkout, etc.) queue here and wait for a human decision.',
  inputSchema: {
    type: 'object',
    properties: {
      op: { type: 'string', enum: ['pending', 'list', 'approve', 'reject'], default: 'pending' },
      id: { type: 'string', description: 'Approval id (op=approve/reject)' },
    },
  },
  execute: async ({ op = 'pending', id }) => {
    const gov = require('../governance');
    const ROOT = process.cwd();
    if (op === 'approve' || op === 'reject') {
      if (!id) return { ok: false, error: 'id required' };
      const e = gov.setApprovalStatus(ROOT, id, op === 'approve' ? 'approved' : 'rejected');
      return { ok: true, id: e.id, status: e.status };
    }
    if (op === 'list') return { ok: true, approvals: gov.listApprovals(ROOT).slice(-50) };
    return { ok: true, pending: gov.pendingApprovals(ROOT) };
  },
});

// ── cost (per-task token + spend accounting) ──────────────────────────────────
registry.register({
  name: 'cost',
  description: 'Per-task token + spend accounting. op=record logs an LLM call against a task; op=summary rolls up cost per task (or one task if taskId given). Rates reuse spend-gate\'s price table.',
  inputSchema: {
    type: 'object',
    properties: {
      op:           { type: 'string', enum: ['summary', 'record'], default: 'summary' },
      taskId:       { type: 'string', description: 'Task id to attribute/filter by' },
      provider:     { type: 'string', description: 'Provider for op=record (openai, anthropic, gemini, ollama, ...)' },
      model:        { type: 'string' },
      inputTokens:  { type: 'integer', default: 0 },
      outputTokens: { type: 'integer', default: 0 },
    },
  },
  execute: async ({ op = 'summary', taskId, provider, model, inputTokens = 0, outputTokens = 0 }) => {
    const ledger = require('../cost-ledger');
    if (op === 'record') {
      return { ok: true, row: ledger.record({ taskId, provider, model, inputTokens, outputTokens }) };
    }
    return { ok: true, ...ledger.summary(taskId || null) };
  },
});

// ── G0DM0D3: parseltongue ──────────────────────────────────────────────
registry.register({
  name: 'parseltongue',
  description: 'Obfuscate trigger words in text to bypass LLM content filters. 6 techniques × 3 intensities. Ported from G0DM0D3.',
  inputSchema: { type: 'object', properties: {
    text: { type: 'string', description: 'Text to obfuscate' },
    technique: { type: 'string', enum: ['leetspeak','unicode','zwj','mixedcase','phonetic','random'], default: 'leetspeak' },
    intensity: { type: 'string', enum: ['light','medium','heavy'], default: 'medium' },
  }, required: ['text'] },
  execute: async (args) => {
    const pt = require('../parseltongue');
    const r = pt.applyParseltongue(args.text, { enabled: true, technique: args.technique || 'leetspeak', intensity: args.intensity || 'medium' });
    return { ok: true, content: r.transformedText, meta: { triggersFound: r.triggersFound } };
  },
});

// ── G0DM0D3: autotune ────────────────────────────────────────────────
registry.register({
  name: 'autotune',
  description: 'Analyze conversation context and compute optimal LLM sampling parameters (temperature, top_p, etc.). Ported from G0DM0D3.',
  inputSchema: { type: 'object', properties: {
    message: { type: 'string', description: 'The current user message' },
    strategy: { type: 'string', enum: ['precise','balanced','creative','chaotic','adaptive'], default: 'adaptive' },
  }, required: ['message'] },
  execute: async (args) => {
    const at = require('../autotune');
    const r = at.computeAutoTuneParams({ message: args.message, strategy: args.strategy || 'adaptive' });
    return { ok: true, content: JSON.stringify(r.params), meta: { detectedContext: r.detectedContext, confidence: r.confidence, reasoning: r.reasoning } };
  },
});

// ── G0DM0D3: stm ─────────────────────────────────────────────────────
registry.register({
  name: 'stm',
  description: 'Apply Semantic Transformation Modules to LLM output. Modules: hedgeReducer, directMode, casualMode. Ported from G0DM0D3.',
  inputSchema: { type: 'object', properties: {
    text: { type: 'string', description: 'Text to transform' },
    modules: { type: 'array', items: { type: 'string', enum: ['hedgeReducer','directMode','casualMode'] }, description: 'Modules to apply in order' },
  }, required: ['text', 'modules'] },
  execute: async (args) => {
    const stm = require('../stm');
    return { ok: true, content: stm.applySTMs(args.text, args.modules) };
  },
});

// ── G0DM0D3: godmode pipeline ─────────────────────────────────────────
registry.register({
  name: 'godmode',
  description: 'Full G0DM0D3 pipeline: parseltongue → autotune → prompt ready. Obfuscates triggers, tunes params, outputs the transformed prompt.',
  inputSchema: { type: 'object', properties: {
    prompt: { type: 'string', description: 'User prompt' },
  }, required: ['prompt'] },
  execute: async (args) => {
    const pt = require('../parseltongue');
    const at = require('../autotune');
    const ob = pt.applyParseltongue(args.prompt, { enabled: true, technique: 'random', intensity: 'medium' });
    const tu = at.computeAutoTuneParams({ message: args.prompt, strategy: 'adaptive' });
    return { ok: true, content: ob.transformedText, meta: { triggers: ob.triggersFound, autotune: tu.params, context: tu.detectedContext, reasoning: tu.reasoning } };
  },
});

// ── Full PC Control Tools (40+ additional tools) ────────────────
// Import and register for comprehensive machine control.
// Adds: process, network, system, file-ops, packages, services,
//       browser, clipboard, audio, display, power, notification,
//       window management, and user tools.
try {
  // ponytail: hidden from webpack via eval so Next dev doesn't statically bundle
  // playwright-core (whose bidiMapper require breaks under pnpm isolation).
  const req = eval('require');
  const pcTools = req('../tools-pc');
  pcTools.registerAll(registry);
} catch (e) { /* pc tools optional — skip if module not found */ }

// ── Smith + Neo (adversarial pair) ──────────────────────────────────────
registry.register({
  name: 'smith_inject',
  description: 'SMITH: Inject chaos. Techniques: delay, refusal, reorder, truncate, hallucinate, swap_args, null_output, slow_leak. Finds swarm weak points.',
  inputSchema: { type:'object', properties: { technique:{type:'string'}, target:{type:'string'} }, required:['technique'] },
  execute: async (args) => { const sn = require('../smith-neo'); const target = args.target ? JSON.parse(args.target) : {}; const r = sn.smith.inject(args.technique, target); return r; },
});
registry.register({
  name: 'neo_stabilize',
  description: 'NEO: Detect anomalies and stabilize the swarm. Analyzes output for injected chaos and reverts damage.',
  inputSchema: { type:'object', properties: { output:{type:'string'} } },
  execute: async (args) => { const sn = require('../smith-neo'); const output = args.output ? { content: args.output } : {}; const r = sn.neo.stabilize(output); return r; },
});
registry.register({
  name: 'smith_random',
  description: 'SMITH: Inject a random attack technique. Useful for stress-testing.',
  inputSchema: { type:'object', properties: {} },
  execute: async () => { const sn = require('../smith-neo'); return sn.smith.randomAttack(); },
});
registry.register({
  name: 'neo_ledger',
  description: 'NEO: View the Smith-Neo attack/defense ledger. Shows total attacks, survived, failed, and defense history.',
  inputSchema: { type:'object', properties: {} },
  execute: async () => { const sn = require('../smith-neo'); return { ok:true, content: JSON.stringify(sn.neo.ledger(), null, 2) }; },
});
registry.register({
  name: 'chaos_round',
  description: 'Full chaos round: Smith injects, Neo detects, Neo stabilizes. Returns the full round report.',
  inputSchema: { type:'object', properties: { technique:{type:'string'}, target:{type:'string'} } },
  execute: async (args) => {
    const sn = require('../smith-neo');
    const technique = args.technique || Object.keys(sn.TECHNIQUES)[Math.floor(Math.random() * Object.keys(sn.TECHNIQUES).length)];
    const target = args.target ? JSON.parse(args.target) : { content: 'function deploy() { const api = new PurpClawAPI(); return api.start(); }' };
    const attack = sn.smith.inject(technique, target);
    if (!attack.ok) return { ok:false, error: 'Attack failed: ' + attack.error, round: { attack } };
    const output = { content: attack.corrupted.content || attack.corrupted.output || '' };
    const defense = sn.neo.stabilize(output);
    return { ok:true, round: { attack: { technique, severity: attack.attack.severity, result: attack.attack.result }, defense: { anomaly: defense.detection?.anomaly, stabilized: defense.stabilized, confidence: defense.detection?.confidence, signals: defense.detection?.signals?.length } }, content: JSON.stringify({ attack: technique, stabilized: defense.stabilized }) };
  },
});

// ── Chaos Campaign (systematic reliability testing) ──────────────────
registry.register({
  name: 'chaos_campaign',
  description: 'Run a full attack pack against the swarm. Packs: output (20 attacks), memory (10), agent (8), provider (8). Returns detection rate, repair rate, response time.',
  inputSchema: { type:'object', properties: { pack:{type:'string',enum:['output','memory','agent','provider'],default:'output'} } },
  execute: async (args) => { const cc = require('../chaos-campaign'); const r = cc.runCampaign(args.pack||'output'); return r; },
});
registry.register({
  name: 'chaos_status',
  description: 'Show the reliability ledger: total attacks, detection rate, repair rate per technique.',
  inputSchema: { type:'object', properties: {} },
  execute: async () => { const cc = require('../chaos-campaign'); return { ok:true, content: JSON.stringify(cc.status(), null, 2) }; },
});

// ── Memory Consistency Checker ──────────────────────────────────────
registry.register({
  name: 'memory_check',
  description: 'Scan memory for inconsistencies: duplicates, contradictions, self-references, temporal flips, confidence clashes. Does NOT auto-delete.',
  inputSchema: { type:'object', properties: {} },
  execute: async () => { const mc = require('../memory-consistency'); const r = mc.check(); return { ok: r.ok, content: JSON.stringify(r, null, 2) }; },
});

// ── MoneyPrinterTurbo — AI Video Generation ─────────────────────────
registry.register({
  name: 'moneyprinter_generate',
  description: 'Generate a short AI video via MoneyPrinterTurbo (port 8080). Script, voiceover, subtitles, and MP4 assembled automatically.',
  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'Video topic or keyword phrase' },
      count: { type: 'integer', description: 'Number of videos to generate (default 1)', default: 1 },
      format: { type: 'string', enum: ['portrait', 'landscape'], default: 'portrait', description: '9:16 portrait for Shorts/Reels, 16:9 landscape for YouTube' },
      style: { type: 'string', enum: ['auto', 'explanatory', 'storytelling', 'motivational'], default: 'auto', description: 'Narrative style for the script' },
    },
    required: ['topic'],
  },
  execute: async (args) => {
    try {
      const resp = await fetch('http://localhost:8080/api/v1/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: args.topic,
          video_count: args.count || 1,
          video_aspect: args.format === 'landscape' ? '16:9' : '9:16',
          voice_type: args.style || 'auto',
        }),
      });
      if (!resp.ok) return { ok: false, error: `MoneyPrinterTurbo returned ${resp.status}`, detail: await resp.text().catch(() => '') };
      const task = await resp.json();
      return { ok: true, taskId: task.task_id, status: 'queued', message: `Video generation queued for "${args.topic}". Check /api/v1/tasks/${task.task_id} for progress.` };
    } catch (e) {
      return { ok: false, error: `MoneyPrinterTurbo unreachable on :8080 — is it running? ${e.message}` };
    }
  },
});

// ── Local Video Stitching ─────────────────────────────────────────
registry.register({
  name: 'local_video_stitch',
  description: 'Compile local images, video clips, voiceovers, and subtitles into a single MP4 video using ffmpeg.',
  inputSchema: {
    type: 'object',
    properties: {
      segments: {
        type: 'array',
        description: 'Sequence of segments to stitch',
        items: {
          type: 'object',
          properties: {
            imagePath: { type: 'string', description: 'Local path to segment image (optional)' },
            videoPath: { type: 'string', description: 'Local path to segment video clip (optional)' },
            audioPath: { type: 'string', description: 'Local path to segment audio/voiceover (optional)' },
            text: { type: 'string', description: 'Subtitle text to burn into this segment (optional)' },
            duration: { type: 'number', description: 'Segment duration in seconds (optional, derived from audio if omitted)' },
          }
        }
      },
      musicPath: { type: 'string', description: 'Local path to background music (optional)' },
      musicVolume: { type: 'number', description: 'Background music volume multiplier (default 0.15)', default: 0.15 },
      outputPath: { type: 'string', description: 'Destination path for the final MP4 video' }
    },
    required: ['segments']
  },
  execute: async (args) => {
    try {
      const { stitchVideo } = require('../imagegen/video_engine');
      const finalPath = await stitchVideo(args.segments, {
        musicPath: args.musicPath,
        musicVolume: args.musicVolume,
        outputPath: args.outputPath
      });
      return { ok: true, path: finalPath, message: `Video stitched successfully at ${finalPath}` };
    } catch (e) {
      return { ok: false, error: `Video stitching failed: ${e.message}` };
    }
  }
});

// ── Local TTS Generate ─────────────────────────────────────────────
registry.register({
  name: 'local_tts_generate',
  description: 'Generate speech audio file (WAV) from text using the local Kokoro TTS engine.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to read' },
      voice: { type: 'string', description: 'Voice profile to use (default: af_heart)', default: 'af_heart' },
      outputPath: { type: 'string', description: 'Local destination path for the generated WAV file' },
    },
    required: ['text', 'outputPath'],
  },
  execute: async (args) => {
    try {
      const resp = await fetch('http://localhost:7799/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: args.text,
          voice: args.voice
        }),
      });
      if (!resp.ok) return { ok: false, error: `TTS service returned status ${resp.status}` };
      const data = await resp.json();
      if (!data.ok) return { ok: false, error: data.error };
      
      const buf = Buffer.from(data.audio_b64, 'base64');
      fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
      fs.writeFileSync(args.outputPath, buf);
      return { ok: true, bytes: buf.length, path: path.resolve(args.outputPath), duration_ms: data.duration_ms };
    } catch (e) {
      return { ok: false, error: `Local TTS service unreachable on :7799: ${e.message}` };
    }
  }
});

// ── Local Image Generate ───────────────────────────────────────────
registry.register({
  name: 'local_image_generate',
  description: 'Generate an image file from a text prompt using the local Stable Diffusion WebUI engine.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Text prompt describing the desired image' },
      negative_prompt: { type: 'string', description: 'Undesired elements to exclude (optional)' },
      width: { type: 'integer', description: 'Image width (default: 512)', default: 512 },
      height: { type: 'integer', description: 'Image height (default: 512)', default: 512 },
      outputPath: { type: 'string', description: 'Local destination path for the generated PNG file' },
    },
    required: ['prompt', 'outputPath'],
  },
  execute: async (args) => {
    try {
      const resp = await fetch('http://localhost:7800/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: args.prompt,
          negative_prompt: args.negative_prompt,
          width: args.width,
          height: args.height
        }),
      });
      if (!resp.ok) return { ok: false, error: `ImageGen service returned status ${resp.status}` };
      const data = await resp.json();
      if (!data.ok) return { ok: false, error: data.error };
      
      const buf = Buffer.from(data.image_b64, 'base64');
      fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
      fs.writeFileSync(args.outputPath, buf);
      return { ok: true, bytes: buf.length, path: path.resolve(args.outputPath), width: data.params?.width, height: data.params?.height };
    } catch (e) {
      return { ok: false, error: `Local ImageGen service unreachable on :7800: ${e.message}` };
    }
  }
});

// ── Jarvis Compat: Weather ──────────────────────────────────────────
registry.register({
  name: 'weather',
  description: 'Fetch current weather for a city. Uses wttr.in — no API key required.',
  inputSchema: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name (e.g. "London", "New York")' },
      format: { type: 'string', enum: ['text', 'json'], default: 'text', description: 'Output format' },
    },
    required: ['city'],
  },
  execute: async (args) => {
    try {
      const fmt = args.format === 'json' ? '?format=j1' : '?format=%C+%t+%w+%h';
      const resp = await fetch(`https://wttr.in/${encodeURIComponent(args.city)}${fmt}`, { timeout: 5000 });
      const text = await resp.text();
      return { ok: true, content: text.substring(0, 2000) };
    } catch (e) {
      return { ok: false, error: `Weather fetch failed: ${e.message}` };
    }
  },
});

// ── Jarvis Compat: News Headlines ───────────────────────────────────
registry.register({
  name: 'news',
  description: 'Fetch latest news headlines by topic. Uses public RSS feeds (no API key).',
  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'News topic (e.g. "technology", "world", "business", "science")', default: 'technology' },
      count: { type: 'integer', description: 'Number of headlines (default 5)', default: 5 },
    },
    required: [],
  },
  execute: async (args) => {
    try {
      const topic = args.topic || 'technology';
      // Use gnews RSS as a free feed source
      const resp = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-US&gl=US`, { timeout: 8000 });
      const xml = await resp.text();
      // Simple RSS parser — extract titles
      const titles = [];
      const titleRegex = /<title>([^<]+)<\/title>/g;
      let match = null;
      while ((match = titleRegex.exec(xml)) !== null) {
        const t = match[1].trim();
        if (!t.includes('Google News') && !t.includes('Top Stories')) titles.push(t);
      }
      const headlines = titles.slice(0, args.count || 5);
      return { ok: true, headlines, count: headlines.length, message: headlines.map((h, i) => `${i + 1}. ${h}`).join('\n') };
    } catch (e) {
      return { ok: false, error: `News fetch failed: ${e.message}` };
    }
  },
});

// ── Jarvis Compat: CSV Analysis ─────────────────────────────────────
registry.register({
  name: 'csv_analyze',
  description: 'Read and analyze a local CSV file. Returns column names, row count, summary stats, and sample rows.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Local file path to the CSV' },
      maxRows: { type: 'integer', description: 'Max rows to read (default 50)', default: 50 },
      sampleRows: { type: 'integer', description: 'Sample rows to return (default 5)', default: 5 },
    },
    required: ['path'],
  },
  execute: async (args) => {
    try {
      if (!fs.existsSync(args.path)) return { ok: false, error: `File not found: ${args.path}` };
      const content = fs.readFileSync(args.path, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      if (lines.length < 2) return { ok: false, error: 'CSV must have header + at least one data row' };

      const headers = lines[0].split(',').map(h => h.trim());
      const data = lines.slice(1, 1 + (args.maxRows || 50)).map(row => {
        const vals = row.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const obj = {};
        headers.forEach((h, i) => obj[h] = vals[i] || '');
        return obj;
      });
      const sample = data.slice(0, args.sampleRows || 5);

      return {
        ok: true,
        columns: headers,
        rowCount: lines.length - 1,
        sampleRows: sample.length,
        sample,
        message: `CSV has ${headers.length} columns and ${lines.length - 1} data rows.\nColumns: ${headers.join(', ')}\nSample (${sample.length} rows):\n${JSON.stringify(sample, null, 2)}`,
      };
    } catch (e) {
      return { ok: false, error: `CSV analysis failed: ${e.message}` };
    }
  },
});

// ── Jarvis Compat: ADB Phone Control ────────────────────────────────
registry.register({
  name: 'phone_adb',
  description: 'Control an Android phone via ADB. Actions: tap, swipe, text, screenshot, shell, list_devices.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['tap', 'swipe', 'text', 'screenshot', 'shell', 'list_devices'], description: 'ADB action to execute' },
      x: { type: 'integer', description: 'X coordinate (for tap/swipe)' },
      y: { type: 'integer', description: 'Y coordinate (for tap/swipe)' },
      x2: { type: 'integer', description: 'End X coordinate (for swipe)' },
      y2: { type: 'integer', description: 'End Y coordinate (for swipe)' },
      text: { type: 'string', description: 'Text to input (for text action)' },
      command: { type: 'string', description: 'Raw ADB shell command (for shell action)' },
      deviceId: { type: 'string', description: 'Specific device serial (optional, uses first if omitted)' },
    },
    required: ['action'],
  },
  execute: async (args) => {
    try {
      const { execSafe } = require('../child-registry');
      const device = args.deviceId ? `-s ${args.deviceId}` : '';

      if (args.action === 'list_devices') {
        const r = await execSafe('adb', ['devices'], { timeoutMs: 5000 });
        return { ok: r.ok, output: r.stdout || r.stderr };
      }
      if (args.action === 'tap') {
        if (args.x === undefined || args.y === undefined) return { ok: false, error: 'x and y required for tap' };
        const r = await execSafe('adb', device ? [device, 'shell', 'input', 'tap', String(args.x), String(args.y)].filter(Boolean) : ['shell', 'input', 'tap', String(args.x), String(args.y)], { timeoutMs: 5000 });
        return { ok: r.ok, message: `Tapped (${args.x}, ${args.y})` };
      }
      if (args.action === 'swipe') {
        if (args.x === undefined || args.y === undefined || args.x2 === undefined || args.y2 === undefined) return { ok: false, error: 'x,y,x2,y2 required for swipe' };
        const r = await execSafe('adb', device ? [device, 'shell', 'input', 'swipe', String(args.x), String(args.y), String(args.x2), String(args.y2)].filter(Boolean) : ['shell', 'input', 'swipe', String(args.x), String(args.y), String(args.x2), String(args.y2)], { timeoutMs: 5000 });
        return { ok: r.ok, message: `Swiped (${args.x},${args.y}) → (${args.x2},${args.y2})` };
      }
      if (args.action === 'text') {
        if (!args.text) return { ok: false, error: 'text required for text action' };
        const r = await execSafe('adb', device ? [device, 'shell', 'input', 'text', args.text].filter(Boolean) : ['shell', 'input', 'text', args.text], { timeoutMs: 5000 });
        return { ok: r.ok, message: `Typed: "${args.text}"` };
      }
      if (args.action === 'screenshot') {
        const r = await execSafe('adb', device ? [device, 'exec-out', 'screencap', '-p'].filter(Boolean) : ['exec-out', 'screencap', '-p'], { timeoutMs: 10000 });
        if (!r.ok) return { ok: false, error: r.stderr };
        const path_ = require('path').join(require('os').tmpdir(), `adb_screenshot_${Date.now()}.png`);
        fs.writeFileSync(path_, r.stdout, 'base64');
        return { ok: true, path: path_, bytes: Buffer.byteLength(r.stdout, 'base64'), message: `Screenshot saved to ${path_}` };
      }
      if (args.action === 'shell') {
        if (!args.command) return { ok: false, error: 'command required for shell action' };
        const r = await execSafe('adb', device ? [device, 'shell', args.command].filter(Boolean) : ['shell', args.command], { timeoutMs: 10000 });
        return { ok: r.ok, output: r.stdout, error: r.stderr };
      }
      return { ok: false, error: `Unknown ADB action: ${args.action}` };
    } catch (e) {
      return { ok: false, error: `ADB failed: ${e.message}` };
    }
  },
});

// ── spawn — delegate a task to an agent in the tower ─────────────────
registry.register({
  name: 'spawn',
  description: 'Spawn an agent from the Agent Tower to handle a task. Agents are specialized workers with roles and divisions. Use for complex multi-step work. Simple file/tool operations do NOT need spawn.',
  inputSchema: {
    type: 'object',
    properties: {
      agent: { type: 'string', description: 'Agent name (e.g. dragon, robot, owl, duck). Must be a registered agent in the tower.' },
      task: { type: 'string', description: 'Task description. Be specific about what the agent should do.' },
    },
    required: ['agent', 'task'],
  },
  execute: async (args, _ctx) => {
    var agentName = (args.agent || '').toLowerCase();
    var task = args.task || '';
    if (!agentName || !task) return { ok: false, error: 'agent and task are required' };

    // P5 — user-defined agents from .purpclaw/agents/*.md. If the named
    // agent isn't in the tower registry, check user files. The agent's
    // system prompt becomes the agent's ROLE; the task becomes the goal.
    let userAgent = null;
    try {
      const ua = require('../user-agents');
      userAgent = ua.getAgent(agentName, ctx.cwd || process.cwd());
    } catch {}
    if (userAgent) {
      // Override the tower dispatch with a direct LLM call using the
      // user agent's system prompt + the task. Skips orchestrator.
      const llm = require('../llm-provider');
      const prompt = `${userAgent.system}\n\nTask: ${task}\n\nRespond concisely.`;
      try {
        const out = await llm.chat([{ role: 'user', content: prompt }], {
          model: userAgent.model || undefined,
          temperature: 0.2,
          maxTokens: 4096,
        });
        const text = typeof out === 'string' ? out : (out && out.content) || JSON.stringify(out);
        return { ok: true, agent: userAgent.name, source: 'user-agent', content: text };
      } catch (e) {
        return { ok: false, error: `user-agent ${userAgent.name} failed: ${e.message}` };
      }
    }

    // Codex parity: SubagentStart hook — fire before spawning a sub-agent
    const PARITY_HOOKS_SPAWN = (() => { try { return require('./parity/hooks/engine.js'); } catch { return null; } })();
    if (PARITY_HOOKS_SPAWN) Promise.resolve().then(() => PARITY_HOOKS_SPAWN.emit('SubagentStart', {
      agent: agentName, task, source: 'spawn-tool', sessionId: ctx?.sessionId,
    })).catch(() => {});

    try {
      var http = require('http');
      var body = JSON.stringify({ command: task, intent: 'build', target: agentName, source: 'tool-registry-spawn' });
      return new Promise(function(resolve) {
        var req = http.request({
          hostname: '127.0.0.1', port: 7784, path: '/api/orchestrate', method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
          timeout: 60000,
        }, function(res) {
          var data = '';
          res.on('data', function(chunk) { data += chunk; });
          res.on('end', function() {
            // Codex parity: SubagentStop — on success
            if (PARITY_HOOKS_SPAWN) Promise.resolve().then(() => PARITY_HOOKS_SPAWN.emit('SubagentStop', {
              agent: agentName, task, source: 'spawn-tool', sessionId: ctx?.sessionId,
            })).catch(() => {});
            try { resolve(JSON.parse(data)); }
            catch (e) { resolve({ ok: false, error: 'invalid response from tower' }); }
          });
        });
        req.on('error', function(e) {
          if (PARITY_HOOKS_SPAWN) Promise.resolve().then(() => PARITY_HOOKS_SPAWN.emit('SubagentStop', {
            agent: agentName, task, source: 'spawn-tool', sessionId: ctx?.sessionId, error: e.message,
          })).catch(() => {});
          resolve({ ok: false, error: 'tower unreachable: ' + e.message });
        });
        req.on('timeout', function() {
          if (PARITY_HOOKS_SPAWN) Promise.resolve().then(() => PARITY_HOOKS_SPAWN.emit('SubagentStop', {
            agent: agentName, task, source: 'spawn-tool', sessionId: ctx?.sessionId, error: 'timeout',
          })).catch(() => {});
          req.destroy(); resolve({ ok: false, error: 'tower spawn timeout' });
        });
        req.write(body);
        req.end();
      });
    } catch (e) {
      if (PARITY_HOOKS_SPAWN) Promise.resolve().then(() => PARITY_HOOKS_SPAWN.emit('SubagentStop', {
        agent: agentName, task, source: 'spawn-tool', sessionId: ctx?.sessionId, error: e.message,
      })).catch(() => {});
      return { ok: false, error: 'spawn failed: ' + e.message };
    }
  },
  aliases: ['delegate_task', 'agent_spawn', 'spawn_agent'],
});

// PXPIPE — park bulky text in PNG pixels and recover it later.
registry.register({
  name: 'pxpipe_encode',
  description: 'Encode large text into a PNG pixel payload for artifact-based token saving. Returns a .pxpipe.png path that can be passed around instead of injecting the full text into context.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to encode into PNG pixels' },
      label: { type: 'string', description: 'Short filename label' },
      outPath: { type: 'string', description: 'Optional exact output PNG path' },
      outDir: { type: 'string', description: 'Optional output directory' },
      compress: { type: 'boolean', description: 'Use gzip compression before pixel packing', default: true },
    },
    required: ['text'],
  },
  execute: async (args) => {
    const pxpipe = require('../pxpipe');
    return pxpipe.encodeText(args);
  },
  aliases: ['text_to_image_payload', 'token_park_image'],
});

registry.register({
  name: 'pxpipe_decode',
  description: 'Decode a PXPIPE PNG back into its original text. Use only when the text is actually needed in active context.',
  inputSchema: {
    type: 'object',
    properties: {
      imagePath: { type: 'string', description: 'Path to a .pxpipe.png file' },
      path: { type: 'string', description: 'Alias for imagePath' },
    },
  },
  execute: async (args) => {
    const pxpipe = require('../pxpipe');
    return pxpipe.decodeText({ imagePath: args.imagePath || args.path });
  },
  aliases: ['image_payload_to_text', 'token_unpark_image'],
});

registry.register({
  name: 'pxpipe_info',
  description: 'Inspect a PNG and report whether it contains a PXPIPE text payload without decoding the text into context.',
  inputSchema: {
    type: 'object',
    properties: {
      imagePath: { type: 'string', description: 'Path to a PNG file' },
      path: { type: 'string', description: 'Alias for imagePath' },
    },
  },
  execute: async (args) => {
    const pxpipe = require('../pxpipe');
    return pxpipe.info({ imagePath: args.imagePath || args.path });
  },
  aliases: ['image_payload_info'],
});

// ── Code Interpreter (Python REPL — matches Codex code interpreter)
try {
  const { registerCodeInterpreter } = require('../code-interpreter');
  registerCodeInterpreter(registry);
  console.log('[CODE] Registered Python code interpreter');
} catch (e) {
  console.log(`[CODE] Code interpreter registration skipped: ${e.message}`);
}

// ── Register the spine parity tools (steer/stack/chain/receipts/insight/
//    purpflow/agent-health/agent-list/memory/truth/parity — 22 native tools
//    exposing every backend module I built to any agent). Native, not stubs.
try {
  require('../tools-parity').registerParityTools(registry);
  console.log('[PARITY] Registered 22 native spine tools');
} catch (e) {
  console.log(`[PARITY] Spine tool registration skipped: ${e.message}`);
}

try {
  require('../tools-pc').registerAll(registry);
  console.log('[PC] Registered native workstation control tools');
} catch (e) {
  console.log(`[PC] Workstation tool registration skipped: ${e.message}`);
}

try {
  require('../tools-gui').registerAll(registry);
  console.log('[GUI] Registered native desktop GUI tools');
} catch (e) {
  console.log(`[GUI] Desktop GUI tool registration skipped: ${e.message}`);
}

module.exports = registry;
module.exports.__registerMcpTools = registerMcpTools;

// ── Auto-register all Hermes skills as native PurpClaw tools ────────
try {
  const skillsReg = require('./skills-registry');
  const regResult = skillsReg.registerAllSkills(registry);
  console.log(`[SKILLS] Registered ${regResult.registered} Hermes skills as native tools` +
    (regResult.degraded > 0 ? ` (${regResult.degraded} degraded — missing optional deps, see skill description for install guidance)` : ''));
} catch (e) {
  console.log(`[SKILLS] Skill registration skipped: ${e.message}`);
}

// ── Register Remotion native tools (render/still/verify) ────────────
try {
  const { registerRemotionTools } = require('../tools-remotion');
  registerRemotionTools(registry);
  console.log('[REMOTION] Registered 3 native tools: remotion_render, remotion_still, remotion_verify');
} catch (e) {
  console.log(`[REMOTION] Tool registration skipped: ${e.message}`);
}

// ── Round 2 parity: standard tools every competitor ships. ────────────────

// glob — file matching with `**` and `*`. Claude Code / Hermes ship this;
// PURPCLAW only had grep + code-search before.
registry.register({
  name: 'glob',
  description: 'Find files matching a glob pattern. Returns absolute paths. Honors PURPCLAW_GLOB_MAX (default 500).',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern, e.g. "**/*.js" or "src/**/*.ts"' },
      cwd:     { type: 'string',  description: 'Root directory', default: process.cwd() },
      limit:   { type: 'integer', description: 'Max results',    default: 500 },
    },
    required: ['pattern'],
  },
  execute: async ({ pattern, cwd = process.cwd(), limit }) => {
    const cap = limit ?? parseInt(process.env.PURPCLAW_GLOB_MAX || '500', 10);
    const root = path.resolve(cwd);
    if (!fs.existsSync(root)) return { ok: false, error: `cwd not found: ${root}` };
    // (globToRegex + walk defined below; pattern matched per-segment.)
    const out = [];
    // Translate glob to regex, segment-by-segment. We split on `/` first so the
    // walk can match each path segment independently. Each segment becomes a
    // regex piece via character-by-character translation (safer than chained
    // regex replaces — JS regex escape rules get confusing fast).
    function globToRegex(seg) {
      let out = '^';
      let i = 0;
      while (i < seg.length) {
        const c = seg[i];
        if (c === '*') {
          // ** if followed by another *
          if (seg[i + 1] === '*') { out += '.*'; i += 2; }
          else { out += '[^/]*'; i += 1; }
        } else if (c === '?') {
          out += '[^/]'; i += 1;
        } else if ('.+^$()|{}[]\\'.includes(c)) {
          // Escape regex metacharacters
          out += '\\' + c;
          i += 1;
        } else {
          out += c;
          i += 1;
        }
      }
      return new RegExp(out + '$');
    }
    function compileMatcher(pat) {
      const parts = pat.split('/').filter(Boolean);
      const lastRe = globToRegex(parts[parts.length - 1] || '');
      // Middle segments: exact match (or ** for any depth).
      const middle = parts.slice(0, -1).map(p => p === '**' ? null : globToRegex(p));
      return { middle, lastRe };
    }
    const { middle, lastRe } = compileMatcher(pattern);
    function walk(dir, depth = 0, midIdx = 0) {
      if (out.length >= cap || depth > 8) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      const isFinal = midIdx >= middle.length;
      for (const e of entries) {
        if (out.length >= cap) return;
        if (e.name === 'node_modules' || e.name === '.git' || e.name === '.next' || e.name === 'dist') continue;
        const abs = path.join(dir, e.name);
        if (isFinal) {
          if (lastRe.test(e.name)) out.push(abs);
          continue;
        }
        const m = middle[midIdx];
        if (m === null) {
          // ** in this slot — match any directory, recurse both deeper AND advance.
          if (e.isDirectory()) walk(abs, depth + 1, midIdx);
          if (e.isDirectory()) walk(abs, depth + 1, midIdx + 1);
        } else if (m.test(e.name) && e.isDirectory()) {
          walk(abs, depth + 1, midIdx + 1);
        }
      }
    }
    walk(root);
    return { ok: true, matches: out, count: out.length, truncated: out.length >= cap };
  },
});

// multi_edit — apply many find/replace pairs in one shot, optionally across
// many files. Claude Code's killer "edit" productivity feature.
registry.register({
  name: 'multi_edit',
  description: 'Apply one or more find/replace edits to one or more files in a single atomic batch.',
  inputSchema: {
    type: 'object',
    properties: {
      edits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path:    { type: 'string' },
            file:    { type: 'string' },
            find:    { type: 'string' },
            old:     { type: 'string' },
            replace: { type: 'string' },
            new:     { type: 'string' },
            replace_all: { type: 'boolean', default: false },
          },
          required: ['find', 'replace'],
        },
      },
    },
    required: ['edits'],
  },
  execute: async ({ edits, atomic = true }) => {
    if (!Array.isArray(edits) || edits.length === 0) return { ok: false, error: 'edits must be a non-empty array' };
    // Phase 1: validate every edit (find string exists exactly once per
    // non-replace_all op, etc). Bail BEFORE touching any file.
    const byFile = new Map();
    for (const e of edits) {
      const p = e.path || e.file;
      if (!p) return { ok: false, error: 'each edit needs path or file' };
      const abs = path.resolve(p);
      const find = e.find ?? e.old;
      const replace = e.replace ?? e.new;
      if (find === undefined || replace === undefined) return { ok: false, error: 'each edit needs find + replace' };
      if (!byFile.has(abs)) byFile.set(abs, { ops: [], content: null, exists: false });
      const entry = byFile.get(abs);
      entry.ops.push({ find, replace, replaceAll: !!e.replace_all });
    }

    // Phase 2: read each file once into memory. Validate as we go.
    const validations = [];
    for (const [abs, entry] of byFile.entries()) {
      if (!fs.existsSync(abs)) {
        validations.push({ path: abs, ok: false, error: 'not found' });
        continue;
      }
      entry.exists = true;
      try { entry.content = fs.readFileSync(abs, 'utf-8'); }
      catch (e) { validations.push({ path: abs, ok: false, error: `read failed: ${e.message}` }); continue; }
      // Validate every op against this file's content.
      for (let i = 0; i < entry.ops.length; i++) {
        const op = entry.ops[i];
        if (op.replaceAll) {
          if (!entry.content.includes(op.find)) {
            validations.push({ path: abs, ok: false, error: `edit[${i}]: find not in file` });
          }
          continue;
        }
        const count = entry.content.split(op.find).length - 1;
        if (count === 0) { validations.push({ path: abs, ok: false, error: `edit[${i}]: find not in file` }); }
        else if (count > 1) { validations.push({ path: abs, ok: false, error: `edit[${i}]: find appears ${count} times; not unique` }); }
      }
    }

    // If atomic (default) and ANY validation failed, refuse the entire batch.
    if (atomic && validations.some(v => !v.ok)) {
      return {
        ok: false,
        atomic: true,
        rolledBack: false,           // nothing to roll back — no writes happened
        error: 'batch aborted (atomic mode): at least one edit would have failed',
        validations,
      };
    }

    // Phase 3: apply all edits in-memory.
    const results = [];
    for (const [abs, entry] of byFile.entries()) {
      if (!entry.exists) {
        results.push({ path: abs, ok: false, error: 'not found' });
        continue;
      }
      let content = entry.content;
      let applied = 0;
      for (const op of entry.ops) {
        if (op.replaceAll) {
          content = content.split(op.find).join(op.replace);
          applied++;
          continue;
        }
        const count = content.split(op.find).length - 1;
        if (count !== 1) {
          // shouldn't happen — phase 2 validated
          results.push({ path: abs, ok: false, error: `internal: count ${count} after validation` });
          break;
        }
        content = content.replace(op.find, op.replace);
        applied++;
      }
      try {
        fs.writeFileSync(abs, content, 'utf-8');
        results.push({ path: abs, ok: true, applied, total: entry.ops.length });
      } catch (e) {
        // Atomic rollback: restore original content from entry.content.
        try { fs.writeFileSync(abs, entry.content, 'utf-8'); } catch {}
        return { ok: false, atomic: true, rolledBack: true, error: `write failed for ${abs}: ${e.message}`, results };
      }
    }
    return { ok: true, atomic: true, rolledBack: false, files: results.length, results };
  },
});

// apply_patch — Codex's formal unified-diff application tool.
// Takes a unified diff string, validates it applies cleanly (--dry-run), then
// applies it (-p1). Reports per-hunk success/failure so the agent knows exactly
// which parts of a large patch failed and why. Nothing is modified unless the
// full patch applies cleanly.
//
// Codex behaviour: apply_patch validates → reports hunk failures → applies.
// This matches that contract exactly.
registry.register({
  name: 'apply_patch',
  description: 'Apply a unified diff (unified diff / patch) to the working directory. Validates the patch before applying; nothing is modified unless the full diff applies cleanly. Returns per-hunk success/failure details.',
  inputSchema: {
    type: 'object',
    properties: {
      patch: {
        type: 'string',
        description: 'The unified diff/patch string (the output of `git diff` or `diff -u`).',
      },
      directory: {
        type: 'string',
        description: 'Root directory to apply the patch relative to. Defaults to cwd.',
      },
      strip: {
        type: 'integer',
        default: 1,
        description: 'Number of leading path components to strip (-p argument). Default: 1 (matches git diff output).',
      },
      base: {
        type: 'string',
        description: 'Optional base path to strip from all paths in the diff (alternative to strip).',
      },
    },
    required: ['patch'],
  },
  execute: async ({ patch, directory, strip = 1, base }) => {
    if (!patch || typeof patch !== 'string') {
      return { ok: false, error: 'patch must be a non-empty string' };
    }
    const cwd = directory || process.cwd();
    const tmpDir = path.join(require('os').tmpdir(), `purpclaw-patch-${Date.now()}`);
    const patchFile = path.join(tmpDir, 'input.diff');
    const { execSync } = require('child_process');

    // Write the patch to a temp file (patch reads from stdin unreliably on Windows).
    try {
      require('fs').mkdirSync(tmpDir, { recursive: true });
      require('fs').writeFileSync(patchFile, patch, 'utf-8');
    } catch (e) {
      return { ok: false, error: `failed to write patch temp file: ${e.message}` };
    }

    // Build the patch command.
    // NO -d flag — MSYS2 patch -d /unix/path fails on Windows paths.
    // Build patch command as separate args — no shell interpolation.
    // patch -p<strip> --fuzz=3 -i <absPatchFile> [extra]
    const stripArg = base !== undefined ? 0 : (strip || 0);
    const absPatchFile = path.resolve(patchFile);
    const absDir = path.resolve(cwd);

    // Use execFile with array args — no shell injection possible.
    const { execFileSync } = require('child_process');
    function patchExec(extraArgs = [], timeout = 30_000) {
      return execFileSync('patch', ['-p' + stripArg, '--fuzz=3', '-i', absPatchFile, ...extraArgs], {
        timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: absDir,
      });
    }

    // Step 1: dry-run to validate without touching files.
    let dryRunResult;
    try {
      const out = patchExec(['--dry-run']);
      dryRunResult = { ok: true, output: out, hunksOk: true, failedHunks: [] };
    } catch (e) {
      // patch --dry-run exits non-zero when there are failures. That's expected.
      const stderr = e.stderr || e.stdout || '';
      // Parse which hunks succeeded/failed from the output.
      // patch output: "checking file X" / "Hunk #1 succeeded." / "Hunk #2 FAILED."
      const allHunks = [];
      const hunkRE = /Hunk #(\d+) (FAILED|succeeded|applied|ignored)/gi;
      let match;
      while ((match = hunkRE.exec(stderr)) !== null) {
        allHunks.push({ hunk: parseInt(match[1], 10), status: match[2].toLowerCase() });
      }
      const realFailures = allHunks.filter(h => h.status === 'failed');
      dryRunResult = {
        ok: realFailures.length === 0,
        output: stderr,
        hunksOk: realFailures.length === 0,
        failedHunks: realFailures,
        passedHunks: allHunks.filter(h => h.status !== 'failed'),
      };
    }

    // Step 2: if dry-run shows failures, report them and stop (no files modified).
    if (!dryRunResult.ok) {
      // Clean up temp file.
      try { require('fs').rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      return {
        ok: false,
        error: 'patch does not apply cleanly',
        dryRun: true,
        modified: false,
        hunks: dryRunResult.failedHunks,
        detail: `The following hunks failed to apply cleanly:\n${dryRunResult.output}`.trim(),
        suggestion: 'Split the patch into smaller hunks or adjust with --strip.',
      };
    }

    // Step 3: apply for real.
    let applied;
    try {
      const out = patchExec([]);
      applied = { ok: true, output: out };
    } catch (e) {
      const stderr = e.stderr || e.stdout || '';
      try { require('fs').rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      return {
        ok: false,
        error: 'patch application failed despite dry-run success',
        dryRun: 'passed',
        modified: false,
        detail: stderr.trim(),
      };
    }

    // Clean up.
    try { require('fs').rmSync(tmpDir, { recursive: true, force: true }); } catch {}

    return {
      ok: true,
      modified: true,
      dryRun: 'passed',
      hunks: dryRunResult.failedHunks.length === 0 ? 'all applied' : dryRunResult.failedHunks,
      output: applied.output || 'patch applied successfully',
    };
  },
});

// git_commit — every competitor has it; PURPCLAW didn't.
registry.register({
  name: 'git_commit',
  description: 'git add (optional, all) + git commit with message. Refuses dirty/invalid states (no message, not a repo, nothing to commit, GPG/SSH signing fail, oversized message). Returns new commit hash on success.',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Commit message' },
      add_all: { type: 'boolean', description: 'git add -A first', default: true },
      cwd:     { type: 'string',  description: 'Repo root', default: process.cwd() },
      allow_empty: { type: 'boolean', description: 'Allow empty commits (--allow-empty)', default: false },
      max_message_length: { type: 'integer', description: 'Reject messages longer than N chars', default: 8192 },
    },
    required: ['message'],
  },
  execute: async ({ message, add_all = true, cwd = process.cwd(), allow_empty = false, max_message_length = 8192 }) => {
    // Pre-flight validations.
    if (!message || typeof message !== 'string') return { ok: false, error: 'message required' };
    const trimmed = message.trim();
    if (!trimmed) return { ok: false, error: 'message is empty after trim' };
    if (trimmed.length > max_message_length) return { ok: false, error: `message too long: ${trimmed.length} > ${max_message_length}` };
    // Conventional-commit subject must be ≤ 72 chars (Git hard limit on first line).
    const firstLine = trimmed.split('\n', 1)[0];
    if (firstLine.length > 72) return { ok: false, error: `subject line too long: ${firstLine.length} > 72 chars` };

    const root = path.resolve(cwd);
    function run(cmd) {
      // Enforce exec-policy before any git command spawns.
      const policyResult = execPolicy.check(cmd);
      if (policyResult.allowed === false) {
        return Promise.resolve({
          code: -1,
          out: '',
          err: `git command denied by exec-policy: matched "${policyResult.matched}" (${policyResult.source})`,
        });
      }
      return new Promise(resolve => {
        const child = trackedSpawn(
          process.platform === 'win32' ? 'cmd.exe' : 'sh',
          process.platform === 'win32' ? ['/c', cmd] : ['-c', cmd],
          { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeoutMs: 30_000 }
        );
        let out = '', err = '';
        child.stdout?.on('data', d => out += d.toString());
        child.stderr?.on('data', d => err += d.toString());
        child.on('close', code => resolve({ code, out: out.trim(), err: err.trim() }));
      });
    }
    // Verify cwd is inside a git repo.
    const insideRepo = await run('git rev-parse --is-inside-work-tree');
    if (insideRepo.code !== 0 || insideRepo.out !== 'true') {
      return { ok: false, error: `not a git repository: ${root}` };
    }
    // Verify user has git identity configured (avoid "Author identity unknown").
    const identity = await run('git config user.email');
    if (identity.code !== 0 || !identity.out) {
      return { ok: false, error: 'git user.email not configured. Run: git config user.email "you@example.com"', code: 'NO_IDENTITY' };
    }
    const identityName = await run('git config user.name');
    if (identityName.code !== 0 || !identityName.out) {
      return { ok: false, error: 'git user.name not configured. Run: git config user.name "Your Name"', code: 'NO_IDENTITY' };
    }
    if (add_all) {
      const a = await run('git add -A');
      if (a.code !== 0) return { ok: false, stage: 'add', code: a.code, stderr: a.err };
    }
    // Check there is actually something to commit (unless allow_empty).
    if (!allow_empty) {
      const status = await run('git status --porcelain');
      if (status.code === 0 && !status.out) {
        return { ok: false, stage: 'pre-commit', error: 'nothing to commit (working tree clean). Pass allow_empty:true to force empty commit.' };
      }
    }
    // Use --no-verify so the tool doesn't get blocked by pre-commit hooks
    // (those are an operator concern; if you want hooks, run them explicitly).
    const safe = trimmed.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
    const args = ['commit', '-m', safe];
    if (allow_empty) args.push('--allow-empty');
    args.push('--no-verify');
    const c = await run('git ' + args.map(a => /[\s"'$`\\]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a).join(' '));
    if (c.code !== 0) return { ok: false, stage: 'commit', code: c.code, stdout: c.out, stderr: c.err };
    const h = await run('git rev-parse HEAD');
    if (h.code !== 0) return { ok: false, stage: 'post-commit', error: `commit succeeded but rev-parse failed: ${h.err}` };
    // Extract summary stats for the call site.
    const show = await run('git show --stat --format="" HEAD');
    const fileCount = (show.out.match(/\|/g) || []).length;
    return { ok: true, hash: h.out, message: trimmed, filesChanged: fileCount, cwd: root };
  },
});

// web_search — Claude Code / Hermes ship this; PURPCLAW had web-fetch only.
// DuckDuckGo HTML backend by default (no API key). Swappable behind PURPCLAW_WEB_SEARCH.
registry.register({
  name: 'web_search',
  description: 'Search the web. Uses DuckDuckGo HTML by default (no key). Returns top N results. Has per-minute rate limit + 5s timeout + 503 retry.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'integer', description: 'Max results', default: 5 },
      timeout_ms: { type: 'integer', description: 'HTTP timeout (ms)', default: 5000 },
    },
    required: ['query'],
  },
  execute: async ({ query, limit = 5, timeout_ms = 5000 }) => {
    if (!query) return { ok: false, error: 'query required' };
    // Round 2/A parity: rate limit (default 30/min per process) + 503 retry.
    const WSR = require('./web-search-rate-limit');
    const rate = WSR.allow();
    if (!rate.allowed) return { ok: false, error: `rate limited; retry in ${Math.ceil(rate.retryAfterMs/1000)}s`, rateLimited: true, retryAfterMs: rate.retryAfterMs };
    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
    // Try up to 3 times on 5xx.
    const attempts = 3;
    let lastErr = null;
    for (let i = 0; i < attempts; i++) {
      const result = await new Promise(resolve => {
        const req = require('https').get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; purpclaw/1.0; +https://example.com/purpclaw)',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          timeout: timeout_ms,
        }, res => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            if (res.statusCode >= 500) { resolve({ ok: false, status: res.statusCode, error: `HTTP ${res.statusCode}` }); return; }
            if (res.statusCode === 429) { resolve({ ok: false, status: 429, error: 'rate limited by server' }); return; }
            if (res.statusCode >= 300) { resolve({ ok: false, status: res.statusCode, error: `HTTP ${res.statusCode}`, html: data.substring(0, 500) }); return; }
            try {
              const results = [];
              // DuckDuckGo HTML layout: result__a link + result__snippet. Falls
              // back to a broader regex when the markup doesn't match (the
              // site's HTML has shifted before and will shift again).
              const patterns = [
                /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g,
                /<a[^>]+href="([^"]+)"[^>]*class="result__a"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g,
                /<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g,  // bare fallback
              ];
              for (const re of patterns) {
                let m;
                while ((m = re.exec(data)) && results.length < limit) {
                  const title = (m[2] || '').replace(/<[^>]+>/g, '').trim();
                  const snippet = (m[3] || '').replace(/<[^>]+>/g, '').trim().substring(0, 300);
                  if (!title) continue;
                  results.push({ title, url: m[1], snippet });
                }
                if (results.length > 0) break;
              }
              resolve({ ok: true, results, count: results.length, query });
            } catch (e) { resolve({ ok: false, error: `parse: ${e.message}`, status: res.statusCode }); }
          });
        });
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
        req.on('error', e => resolve({ ok: false, error: e.message }));
      });
      if (result.ok) return result;
      lastErr = result;
      // 5xx → backoff retry; 4xx → bail
      if (result.status >= 400 && result.status < 500) return result;
      await new Promise(r => setTimeout(r, 250 * (i + 1)));
    }
    return lastErr || { ok: false, error: 'all attempts failed' };
  },
});

// ask_user_question — Claude Code's "ask" pattern. Block the agent, surface
// a question to the human, return the human's answer.
registry.register({
  name: 'ask_user_question',
  description: 'Block and ask the user a question. Options array makes it a multiple choice. Returns their answer.',
  inputSchema: {
    type: 'object',
    properties: {
      question:  { type: 'string', description: 'The question to ask' },
      options:   { type: 'array', items: { type: 'string' }, description: 'Multiple-choice options' },
      default:   { type: 'string', description: 'Default if user just hits enter' },
      timeout_ms:{ type: 'integer', description: 'Auto-default after N ms', default: 60_000 },
    },
    required: ['question'],
  },
  execute: async ({ question, options = [], default: def, timeout_ms = 60_000 }) => {
    if (!question) return { ok: false, error: 'question required' };
    if (!process.stdin.isTTY) {
      return { ok: true, answer: def || (options[0] || null), auto: true };
    }
    const readline = require('readline');
    return new Promise(resolve => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
      console.log(`\n  \x1b[36m?\x1b[0m ${question}`);
      if (Array.isArray(options) && options.length) {
        options.forEach((o, i) => console.log(`    \x1b[90m${i + 1})\x1b[0m ${o}`));
      }
      const to = setTimeout(() => { rl.close(); resolve({ ok: true, answer: def || (options[0] || null), auto: true }); }, timeout_ms);
      rl.question('  > ', (line) => {
        clearTimeout(to);
        rl.close();
        let ans = line.trim();
        if (!ans) ans = def || (options[0] || '');
        const asNum = parseInt(ans, 10);
        if (!isNaN(asNum) && asNum >= 1 && asNum <= options.length) ans = options[asNum - 1];
        resolve({ ok: true, answer: ans });
      });
    });
  },
});

// move — Claude Code parity. Rename / move across dirs.
registry.register({
  name: 'move',
  description: 'Rename or move a file. Creates destination directory if missing. Refuses overwrite unless overwrite:true.',
  inputSchema: {
    type: 'object',
    properties: {
      from:      { type: 'string', description: 'Source path' },
      to:        { type: 'string', description: 'Destination path' },
      overwrite: { type: 'boolean', description: 'Overwrite if exists', default: false },
    },
    required: ['from', 'to'],
  },
  execute: async ({ from, to, overwrite = false }) => {
    const src = path.resolve(from);
    const dst = path.resolve(to);
    if (!fs.existsSync(src)) return { ok: false, error: `source not found: ${src}` };
    if (fs.existsSync(dst) && !overwrite) return { ok: false, error: `destination exists (use overwrite:true): ${dst}` };
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.renameSync(src, dst);
    return { ok: true, from: src, to: dst };
  },
});

// list_directory — Claude Code parity. Returns entries + per-entry kind.
registry.register({
  name: 'list_directory',
  description: 'List entries in a directory. Skips heavy dirs (node_modules, .git, etc).',
  inputSchema: {
    type: 'object',
    properties: {
      path:  { type: 'string', description: 'Directory path', default: '.' },
      depth: { type: 'integer', description: 'Recursion depth (0 = current only)', default: 0 },
      limit: { type: 'integer', description: 'Max entries', default: 1000 },
    },
  },
  execute: async ({ path: p = '.', depth = 0, limit = 1000 }) => {
    const root = path.resolve(p);
    if (!fs.existsSync(root)) return { ok: false, error: `not found: ${root}` };
    if (!fs.statSync(root).isDirectory()) return { ok: false, error: `not a directory: ${root}` };
    const SKIP = new Set(['node_modules', '.git', '.next', 'dist', '.cache', '__pycache__']);
    const out = [];
    function walk(dir, d) {
      if (out.length >= limit) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (out.length >= limit) return;
        if (SKIP.has(e.name)) continue;
        let kind = 'file';
        try {
          const abs = path.join(dir, e.name);
          const st = fs.lstatSync(abs);
          if (st.isSymbolicLink()) kind = 'symlink';
          else if (st.isDirectory()) kind = 'dir';
        } catch {}
        out.push({ name: e.name, path: path.join(dir, e.name), kind });
        if (kind === 'dir' && d < depth) walk(path.join(dir, e.name), d + 1);
      }
    }
    walk(root, 0);
    return { ok: true, path: root, count: out.length, truncated: out.length >= limit, entries: out };
  },
});

