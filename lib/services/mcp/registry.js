'use strict';
/**
 * lib/services/mcp/registry.js — Tool / Resource / Prompt registry.
 *
 * A tiny, in-memory registry that the MCP server uses to look up
 * capabilities exposed to clients. Registrations are stable, atomic,
 * and emit change events so transports can broadcast
 * `notifications/{tools,resources,prompts}/list_changed`.
 *
 * 🌵 CACTUS — designed for low memory: lazy validation, no deep clones,
 * pagination cursors are just opaque offsets into the underlying arrays.
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

const DEFAULT_PAGE_SIZE = 100;

function opaqueCursor(index) {
  return Buffer.from(JSON.stringify({ i: index })).toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor || typeof cursor !== 'string') return 0;
  try {
    const j = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
    return Math.max(0, parseInt(j && j.i, 10) || 0);
  } catch { return 0; }
}

class CapabilityRegistry extends EventEmitter {
  constructor() {
    super();
    this._tools     = new Map(); // name → def + handler
    this._resources = new Map(); // uri  → def + handler
    this._templates = new Map(); // uriTemplate → def
    this._prompts   = new Map(); // name → def + handler
    this._roots     = [];        // [{ uri, name }]
  }

  // ───────────────────────────── Tools ──────────────────────────────

  registerTool(def, handler) {
    if (!def || typeof def !== 'object') throw new TypeError('registerTool: def required');
    if (!def.name || typeof def.name !== 'string') throw new TypeError('registerTool: def.name required');
    if (typeof handler !== 'function') throw new TypeError('registerTool: handler must be function');
    this._tools.set(def.name, { def, handler });
    this.emit('tools/list_changed');
    return this;
  }

  unregisterTool(name) {
    const had = this._tools.delete(name);
    if (had) this.emit('tools/list_changed');
    return had;
  }

  listTools({ cursor, pageSize = DEFAULT_PAGE_SIZE } = {}) {
    const start = decodeCursor(cursor);
    const all = [...this._tools.values()].map(t => t.def);
    const slice = all.slice(start, start + pageSize);
    const nextStart = start + slice.length;
    const nextCursor = nextStart < all.length ? opaqueCursor(nextStart) : undefined;
    return { tools: slice, nextCursor };
  }

  async callTool(name, args, ctx = {}) {
    const entry = this._tools.get(name);
    if (!entry) {
      const err = new Error(`Unknown tool: ${name}`);
      err.code = 'TOOL_NOT_FOUND';
      throw err;
    }
    return await entry.handler(args || {}, ctx);
  }

  hasTool(name) { return this._tools.has(name); }

  // ─────────────────────────── Resources ────────────────────────────

  registerResource(def, handler) {
    if (!def || typeof def !== 'object') throw new TypeError('registerResource: def required');
    if (!def.uri || typeof def.uri !== 'string') throw new TypeError('registerResource: def.uri required');
    if (typeof handler !== 'function') throw new TypeError('registerResource: handler must be function');
    this._resources.set(def.uri, { def, handler });
    this.emit('resources/list_changed');
    return this;
  }

  registerResourceTemplate(def) {
    if (!def || !def.uriTemplate) throw new TypeError('registerResourceTemplate: uriTemplate required');
    this._templates.set(def.uriTemplate, def);
    this.emit('resources/list_changed');
    return this;
  }

  unregisterResource(uri) {
    const had = this._resources.delete(uri);
    if (had) this.emit('resources/list_changed');
    return had;
  }

  listResources({ cursor, pageSize = DEFAULT_PAGE_SIZE } = {}) {
    const start = decodeCursor(cursor);
    const all = [...this._resources.values()].map(r => r.def);
    const slice = all.slice(start, start + pageSize);
    const nextStart = start + slice.length;
    const nextCursor = nextStart < all.length ? opaqueCursor(nextStart) : undefined;
    return { resources: slice, nextCursor };
  }

  listResourceTemplates({ cursor, pageSize = DEFAULT_PAGE_SIZE } = {}) {
    const start = decodeCursor(cursor);
    const all = [...this._templates.values()];
    const slice = all.slice(start, start + pageSize);
    const nextStart = start + slice.length;
    const nextCursor = nextStart < all.length ? opaqueCursor(nextStart) : undefined;
    return { resourceTemplates: slice, nextCursor };
  }

  async readResource(uri, ctx = {}) {
    const entry = this._resources.get(uri);
    if (!entry) {
      const err = new Error(`Unknown resource: ${uri}`);
      err.code = 'RESOURCE_NOT_FOUND';
      throw err;
    }
    return await entry.handler(ctx);
  }

  // ───────────────────────────── Prompts ─────────────────────────────

  registerPrompt(def, handler) {
    if (!def || !def.name) throw new TypeError('registerPrompt: def.name required');
    if (typeof handler !== 'function') throw new TypeError('registerPrompt: handler must be function');
    this._prompts.set(def.name, { def, handler });
    this.emit('prompts/list_changed');
    return this;
  }

  unregisterPrompt(name) {
    const had = this._prompts.delete(name);
    if (had) this.emit('prompts/list_changed');
    return had;
  }

  listPrompts({ cursor, pageSize = DEFAULT_PAGE_SIZE } = {}) {
    const start = decodeCursor(cursor);
    const all = [...this._prompts.values()].map(p => p.def);
    const slice = all.slice(start, start + pageSize);
    const nextStart = start + slice.length;
    const nextCursor = nextStart < all.length ? opaqueCursor(nextStart) : undefined;
    return { prompts: slice, nextCursor };
  }

  async getPrompt(name, args, ctx = {}) {
    const entry = this._prompts.get(name);
    if (!entry) {
      const err = new Error(`Unknown prompt: ${name}`);
      err.code = 'PROMPT_NOT_FOUND';
      throw err;
    }
    return await entry.handler(args || {}, ctx);
  }

  // ───────────────────────────── Roots ──────────────────────────────

  setRoots(roots) {
    this._roots = Array.isArray(roots) ? roots.filter(r => r && r.uri) : [];
    this.emit('roots/list_changed');
  }

  listRoots() {
    return { roots: [...this._roots] };
  }

  // ──────────────────────── snapshot / stats ────────────────────────

  stats() {
    return {
      tools:     this._tools.size,
      resources: this._resources.size,
      templates: this._templates.size,
      prompts:   this._prompts.size,
      roots:     this._roots.length,
    };
  }

  clear() {
    this._tools.clear();
    this._resources.clear();
    this._templates.clear();
    this._prompts.clear();
    this._roots.length = 0;
    this.emit('tools/list_changed');
    this.emit('resources/list_changed');
    this.emit('prompts/list_changed');
  }
}

// Singleton — the server uses this same instance for its lifetime.
const registry = new CapabilityRegistry();
registry.setMaxListeners(200);

module.exports = {
  CapabilityRegistry,
  registry,
  opaqueCursor,
  decodeCursor,
  DEFAULT_PAGE_SIZE,
};
