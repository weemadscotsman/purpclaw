'use strict';

/**
 * OMNI-SURGEON — OMNICODE adapter
 * ─────────────────────────────
 * Thin wrapper that turns OMNICODE MCP tool calls into the OMNI snapshot
 * shape. OMNI-SURGEON uses this as its repo-truth backend instead of
 * re-implementing file walking, symbol extraction, etc.
 *
 * Why: the OMNICODE platform already does indexing, AST parsing,
 * blast radius, blindspot reporting, spaghetti reports, and exact
 * symbol retrieval. Per the master integration spec, OMNI-SURGEON
 * should NOT duplicate that. It should call OMNICODE and turn the
 * results into OMNI artifacts (truth-snapshot.json, feature-registry.json,
 * patch-review.json).
 *
 * Transport: JSON-RPC 2.0 over stdio. We spawn
 *   node omnicode-mcp/dist/server.js
 * and talk to it the same way the OmniCode MCP clients do.
 *
 * If OMNICODE is offline or fails, the adapter returns a structured
 * `degraded` result. The OMNI lib modules (truth-scanner, etc.) then
 * fall back to direct file-system scanning.
 *
 * Usage:
 *   const { createOmnicodeClient } = require('./omnicode-adapter');
 *   const client = createOmnicodeClient();
 *   const truth = await client.truthSnapshot('E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW');
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const OMNICODE_SERVER = path.join('E:', 'god folder', '02_ACTIVE_PROJECTS', 'omnicode-platform', 'omnicode-mcp', 'dist', 'server.js');

const SCHEMA_VERSION = '0.1.0-omnicode-adapter';

/**
 * A minimal JSON-RPC 2.0 client over stdio. Speaks the same protocol
 * OmniCode uses (Claude / Cursor / Codex all use this same shape).
 */
class JsonRpcStdioClient {
  constructor(cmd, args, env = {}) {
    this.cmd = cmd;
    this.args = args;
    this.env = env;
    this.proc = null;
    this.rl = null;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
    this.isOpen = false;
  }

  async start() {
    this.proc = spawn(this.cmd, this.args, {
      env: Object.assign({}, process.env, this.env, { OMNICODE_ROLE: 'agent', OMNICODE_USER: 'omni-adapter' }),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.rl = readline.createInterface({ input: this.proc.stdout });
    this.rl.on('line', (line) => this.handleLine(line));
    this.proc.stderr.on('data', (chunk) => {
      if (process.env.OMNI_DEBUG) process.stderr.write('[omnicode] ' + chunk);
    });
    this.proc.on('exit', (code) => {
      this.isOpen = false;
      for (const [, p] of this.pending) p.reject(new Error('omnicode exited with code ' + code));
      this.pending.clear();
    });
    this.isOpen = true;
  }

  handleLine(line) {
    this.buffer += line;
    let trimmed = this.buffer.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      this.buffer = '';
      return;
    }
    try {
      const msg = JSON.parse(trimmed);
      this.buffer = '';
      this.handleMessage(msg);
    } catch (_) {
      // wait for more data
    }
  }

  handleMessage(msg) {
    if (msg.id != null && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error('RPC error: ' + msg.error.message + ' (code ' + msg.error.code + ')'));
      else p.resolve(msg.result);
    }
  }

  async call(method, params) {
    if (!this.isOpen) throw new Error('omnicode client not open');
    params = params || {};
    const id = this.nextId++;
    const msg = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify(msg) + '\n');
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('omnicode RPC timeout for ' + method));
        }
      }, 120_000);
    });
  }

  async stop() {
    // Fully reap the OMNICODE child so Node's event loop can drain.
    if (this.rl) {
      try { this.rl.close(); this.rl.removeAllListeners(); } catch (_) {}
      this.rl = null;
    }
    if (this.proc && !this.proc.killed) {
      try { this.proc.kill(); } catch (_) { /* already dead */ }
      try { if (this.proc.stdin && !this.proc.stdin.destroyed) this.proc.stdin.end(); } catch (_) {}
      try { if (this.proc.stdout && !this.proc.stdout.destroyed) this.proc.stdout.destroy(); } catch (_) {}
      try { if (this.proc.stderr && !this.proc.stderr.destroyed) this.proc.stderr.destroy(); } catch (_) {}
      // Wait for the 'exit' event with a tight timeout. If it
      // doesn't fire in 1s, the caller can still proceed.
      await new Promise((resolve) => {
        if (!this.proc) return resolve();
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        this.proc.once('exit', finish);
        this.proc.once('close', finish);
        setTimeout(finish, 1000);
      });
    }
    this.isOpen = false;
    this.proc = null;
  }
}

function makeFallbackSnapshot(repoPath, reason) {
  return {
    ok: false,
    degraded: true,
    reason: reason,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: 'fallback',
    repoRoot: repoPath,
    scanStats: { files: 0, imports: 0, routes: 0, staticAssets: 0, services: 0, features: 0, brokenLinks: 0, missingRoutes: 0, godFiles: 0, cycles: 0, deadLike: 0, elapsedMs: 0 },
    files: [], imports: [], routes: [], staticAssets: [], services: [], features: [], brokenLinks: [], missingRoutes: [], godFiles: [], cycles: [], deadLike: [],
  };
}

function shapeOmniSnapshot(input) {
  const generatedAt = new Date().toISOString();
  // OMNICODE outputs are in OCAP compact-summary format for budgeted
  // responses. The full output is in a markdown file referenced in the
  // budget notice. We parse the compact summary, plus the file headers
  // and bullet points, plus numeric counts (e.g. "Blindspots: 3416").
  const routeCount = countPattern(input.routeMapResult, /^\s*-\s/gm)
    + (input.routeMapResult.match(/Route Map \(/i) ? 1 : 0);
  const testCount = countPattern(input.testMapResult, /^\s*-\s/gm)
    + countPattern(input.testMapResult, /Test Map \(/i);
  // Parse blindspot number out of "Blindspots: 3416 (88.3% …)"
  const blindspotM = input.blindspotResult.match(/Blindspots:\s*(\d+)/i);
  const blindspotCount = blindspotM ? Number(blindspotM[1]) : 0;
  // Parse coverage: "Coverage: 686 tree-sitter" — the file count
  const coverageM = input.blindspotResult.match(/Coverage:\s*(\d+)/i);
  const fileCount = coverageM ? Number(coverageM[1]) : 0;
  // Parse "DEAD SYMBOLS" header and count bullets
  const deadCodeM = input.deadCodeResult.match(/DEAD SYMBOLS[\s\S]*?Top\s+(\d+)\s+of\s+(\d+)/i);
  const deadCodeCount = deadCodeM ? Number(deadCodeM[2]) : countPattern(input.deadCodeResult, /^\s*-\s\[[a-z]+\]/gm);
  // Parse spaghetti for cycles / god files (the compact summary is sparse,
  // but the artifact path is referenced)
  const cycleCount = countPattern(input.spaghettiResult, /cycle|cyclic/gi);
  const godFileCount = countPattern(input.spaghettiResult, /god\s*object/gi);
  // Imported count from anywhere
  const importCount = countPattern(input.spaghettiResult, /imports?:/i)
    + countPattern(input.blindspotResult, /unresolved.*import/gi);
  return {
    ok: true,
    degraded: false,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: generatedAt,
    source: 'omnicode',
    repoRoot: input.repoPath,
    scanStats: {
      files: fileCount,
      imports: importCount,
      routes: routeCount,
      staticAssets: 0,
      services: 0,
      features: 0,
      brokenLinks: blindspotCount,
      missingRoutes: 0,
      godFiles: godFileCount,
      cycles: cycleCount,
      deadLike: deadCodeCount,
      elapsedMs: 0,
    },
    // The shape includes the full text outputs of the OMNICODE tools so
    // downstream OMNI consumers (the Feature Registry, Patch Governor)
    // can mine them for richer detail.
    omnicodeOutputs: {
      repoMap: input.repoMapResult,
      routeMap: input.routeMapResult,
      testMap: input.testMapResult,
      configMap: input.configMapResult,
      spaghetti: input.spaghettiResult,
      blindspot: input.blindspotResult,
      deadCode: input.deadCodeResult,
    },
    files: [],
    imports: [],
    routes: [],
    staticAssets: [],
    services: [],
    features: [],
    brokenLinks: [],
    missingRoutes: [],
    godFiles: [],
    cycles: [],
    deadLike: [],
  };
}

function countPattern(s, re) {
  if (!s) return 0;
  const src = re.source;
  let flags = re.flags || '';
  if (!flags.includes('g')) flags += 'g';
  const m = s.match(new RegExp(src, flags));
  return m ? m.length : 0;
}

function extractText(r) {
  if (!r) return '';
  if (r.content && r.content[0] && r.content[0].text) return r.content[0].text;
  if (typeof r === 'string') return r;
  return '';
}

function createOmnicodeClient(options) {
  options = options || {};
  const serverPath = options.serverPath || OMNICODE_SERVER;
  let rpc = null;
  let available = false;
  let startError = null;

  async function ensureStarted() {
    if (rpc && available) return rpc;
    if (rpc) {
      await rpc.stop();
      rpc = null;
    }
    if (!fs.existsSync(serverPath)) {
      throw new Error('OMNICODE server not found at ' + serverPath);
    }
    const c = new JsonRpcStdioClient('node', [serverPath], options.env || {});
    await c.start();
    try {
      const r = await c.call('tools/list', {});
      available = r && r.tools && Array.isArray(r.tools);
      if (!available) throw new Error('omnicode tools/list returned no tools array');
    } catch (e) {
      startError = e.message;
      available = false;
      await c.stop();
      throw e;
    }
    startError = null;
    rpc = c;
    return c;
  }

  return {
    async available() {
      try { await ensureStarted(); return true; }
      catch (_) { return false; }
    },

    async truthSnapshot(repoPath, options2) {
      options2 = options2 || {};
      try {
        const c = await ensureStarted();
        const repoMap = await c.call('tools/call', { name: 'repo_map', arguments: { path: repoPath } });
        const routeMap = await c.call('tools/call', { name: 'route_map', arguments: { path: repoPath } });
        const testMap = await c.call('tools/call', { name: 'test_map', arguments: { path: repoPath } });
        const configMap = await c.call('tools/call', { name: 'config_map', arguments: { path: repoPath } });
        const spaghetti = await c.call('tools/call', { name: 'spaghetti_report', arguments: { path: repoPath } });
        const blindspot = await c.call('tools/call', { name: 'blindspot_report', arguments: { path: repoPath } });
        const deadCode = await c.call('tools/call', { name: 'dead_code_scan', arguments: { path: repoPath } });

        const t0 = Date.now();
        const snapshot = shapeOmniSnapshot({
          repoPath: repoPath,
          repoMapResult: extractText(repoMap),
          routeMapResult: extractText(routeMap),
          testMapResult: extractText(testMap),
          configMapResult: extractText(configMap),
          spaghettiResult: extractText(spaghetti),
          blindspotResult: extractText(blindspot),
          deadCodeResult: extractText(deadCode),
        });
        snapshot.scanStats.elapsedMs = Date.now() - t0;
        return snapshot;
      } catch (e) {
        if (process.env.OMNI_DEBUG) process.stderr.write('[omnicode-adapter] truthSnapshot failed: ' + (e.stack || e.message) + '\n');
        if (options2.useFallback !== false) {
          return makeFallbackSnapshot(repoPath, 'omnicode unavailable: ' + (e.message || startError || 'unknown'));
        }
        throw e;
      }
    },

    async routeMap(repoPath) {
      try { const c = await ensureStarted(); return await c.call('tools/call', { name: 'route_map', arguments: { path: repoPath } }); }
      catch (e) { return { ok: false, error: e.message }; }
    },

    async testMap(repoPath) {
      try { const c = await ensureStarted(); return await c.call('tools/call', { name: 'test_map', arguments: { path: repoPath } }); }
      catch (e) { return { ok: false, error: e.message }; }
    },

    async configMap(repoPath) {
      try { const c = await ensureStarted(); return await c.call('tools/call', { name: 'config_map', arguments: { path: repoPath } }); }
      catch (e) { return { ok: false, error: e.message }; }
    },

    async blastRadius(repoPath, symbol) {
      try { const c = await ensureStarted(); return await c.call('tools/call', { name: 'blast_radius', arguments: { path: repoPath, symbol_name: symbol } }); }
      catch (e) { return { ok: false, error: e.message }; }
    },

    async deadCodeScan(repoPath) {
      try { const c = await ensureStarted(); return await c.call('tools/call', { name: 'dead_code_scan', arguments: { path: repoPath } }); }
      catch (e) { return { ok: false, error: e.message }; }
    },

    async blindspotReport(repoPath) {
      try { const c = await ensureStarted(); return await c.call('tools/call', { name: 'blindspot_report', arguments: { path: repoPath } }); }
      catch (e) { return { ok: false, error: e.message }; }
    },

    async spaghettiReport(repoPath) {
      try { const c = await ensureStarted(); return await c.call('tools/call', { name: 'spaghetti_report', arguments: { path: repoPath } }); }
      catch (e) { return { ok: false, error: e.message }; }
    },

    async cockpitStatus(repoPath) {
      try {
        const c = await ensureStarted();
        const r = await c.call('tools/call', { name: 'omni_cockpit_status', arguments: { path: repoPath } });
        const txt = (r && r.content && r.content[0] && r.content[0].text) || '{}';
        return JSON.parse(txt);
      } catch (e) {
        return { ok: false, degraded: true, source: 'fallback', reason: e.message, generatedAt: new Date().toISOString() };
      }
    },

    async close() {
      if (rpc) { await rpc.stop(); rpc = null; }
      available = false;
    },
  };
}

if (require.main === module) {
  (async () => {
    const c = createOmnicodeClient();
    const ok = await c.available();
    console.log('OMNICODE available:', ok);
    if (ok) {
      const snap = await c.truthSnapshot('E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW', { useFallback: true });
      console.log('snapshot source:', snap.source, 'ok:', snap.ok, 'degraded:', snap.degraded);
      console.log('stats:', JSON.stringify(snap.scanStats, null, 2));
    }
    await c.close();
  })();
}

module.exports = { createOmnicodeClient, OMNICODE_SERVER, SCHEMA_VERSION };
