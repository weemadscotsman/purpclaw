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

// All tools use the central child-registry for safe spawns.
// Tools live at lib/tools/index.js, registry is at lib/child-registry.js.
const { trackedSpawn, execSafe } = require('../child-registry');

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
  }
  register(tool) {
    if (!tool.name || typeof tool.execute !== 'function') {
      throw new Error(`invalid tool: ${JSON.stringify(Object.keys(tool))}`);
    }
    this.tools.set(tool.name, tool);
    return this;
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
  has(name) { return this.tools.has(name) || _mcpTools.some(t => t.name === name); }
  async invoke(name, args) {
    // Built-in tool?
    if (this.tools.has(name)) {
      const tool = this.tools.get(name);
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

// ── write ───────────────────────────────────────────────────────────────────
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
  execute: async ({ command, timeout = 30_000, cwd }) => {
    const safeCwd = cwd ? path.resolve(cwd) : process.cwd();
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
    const rg = await execSafe('rg', ['--json', '-g', glob, '--', pattern, path.resolve(root)], { timeoutMs: 30_000 }).catch(() => null);
    if (rg && rg.code === 0) {
      const lines = rg.stdout.split('\n').filter(Boolean).slice(0, maxLines);
      return { matches: lines, count: lines.length, engine: 'ripgrep' };
    }
    // Node fallback: walk files, read first N lines, regex test
    const re = new RegExp(pattern);
    const matches = [];
    function walk(dir, depth = 0) {
      if (depth > 8 || matches.length >= maxLines) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (['node_modules', '.next', '.git', 'dist', 'build', '__pycache__'].includes(e.name)) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, depth + 1);
        else if (e.isFile()) {
          let content;
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
  const pcTools = require('../tools-pc');
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

module.exports = registry;
module.exports.__registerMcpTools = registerMcpTools;
