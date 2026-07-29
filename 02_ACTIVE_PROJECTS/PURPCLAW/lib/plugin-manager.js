'use strict';
/**
 * lib/plugin-manager.js — PURPCLAW plugin system.
 *
 * Codex parity: Codex runs plugins in separate processes.
 * This supports both:
 *   - Inline: same Node.js process (backward compatible)
 *   - Isolated: worker thread via lib/plugin-isolator.js
 *
 * Plugin manifest fields:
 *   { "name": "...", "main": "index.js", "isolate": true }
 *
 * Isolated plugins get their own V8 heap. No shared globals.
 * Tools are registered in the worker; dispatch routes to the worker.
 *
 * Hooks, commands, and providers always run in the main process.
 * Only tool execute() runs in the worker (if isolate=true).
 */

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '..');
const USER_DIR   = path.join(ROOT, '.purpclaw', 'plugins');
const PROJECT_DIR = path.join(ROOT, '.purpclaw', 'project-plugins');
const CONFIG     = path.join(ROOT, '.purpclaw', 'plugins.json');

let _isolator;
function getIsolator() {
  if (!_isolator) {
    try { _isolator = require('./plugin-isolator').isolator; } catch { _isolator = null; }
  }
  return _isolator;
}

class PluginManager {
  constructor() {
    this.plugins    = new Map();   // name → plugin record
    this.hooks      = new Map();   // event → [{plugin, handler, priority, matcher}]
    this.commands    = new Map();   // name → {plugin, handler, description}
    this.cliCommands  = new Map();  // name → {plugin, handler, description}
    this.skills       = new Map();  // name → {plugin, name, description, instructions, metadata}
    this.loaded     = false;
  }

  // ── Config ──────────────────────────────────────────────────────────────────

  config() {
    try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); }
    catch { return { enabled: [], disabled: [] }; }
  }

  saveConfig(c) {
    fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
    fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2), 'utf8');
    return c;
  }

  enable(name) {
    const c = this.config();
    c.enabled  = [...new Set([...(c.enabled || []), name])];
    c.disabled = (c.disabled || []).filter(x => x !== name);
    this.saveConfig(c);
  }

  disable(name) {
    const c = this.config();
    c.enabled  = (c.enabled || []).filter(x => x !== name);
    c.disabled = [...new Set([...(c.disabled || []), name])];
    this.saveConfig(c);
  }

  // ── Discovery ───────────────────────────────────────────────────────────────

  discover() {
    const found = new Map();
    const dirs = [USER_DIR];
    if (process.env.PURPCLAW_ENABLE_PROJECT_PLUGINS === '1') dirs.push(PROJECT_DIR);
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const root       = path.join(dir, entry.name);
        const manifestFile = path.join(root, 'plugin.json');
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
          found.set(manifest.name || entry.name, {
            name    : manifest.name || entry.name,
            root,
            manifest,
            enabled : false,
            loaded  : false,
            error   : null,
          });
        } catch { /* no manifest */ }
      }
    }
    return [...found.values()];
  }

  // ── Context factory ─────────────────────────────────────────────────────────

  context(plugin) {
    const self = this;
    const tools = require('./tools');
    const providers = require('./provider-registry');

    const base = {
      registerTool(tool) {
        if (!tool || !tool.name) return;
        if (plugin.isolated) return; // tools live in the worker
        tools.register({ ...tool, name: tool.name });
      },

      registerHook(event, handler, options = {}) {
        if (!self.hooks.has(event)) self.hooks.set(event, []);
        self.hooks.get(event).push({
          plugin   : plugin.name,
          handler,
          priority : Number(options.priority) || 0,
          matcher  : options.matcher,
        });
      },

      registerCommand(name, handler, description = '') {
        self.commands.set(name, { plugin: plugin.name, handler, description });
      },

      registerCliCommand(name, handler, description = '') {
        self.cliCommands.set(name, { plugin: plugin.name, handler, description });
      },

      registerProvider(id, profile) {
        providers.registerPlugin(id, profile);
      },

      // ── P1-6: Plugin contributes a skill ────────────────────────────────────
      // A plugin can now register a skill the same way it registers a tool or hook.
      // The skill is registered with the plugin name as its namespace prefix
      // (e.g. "my-plugin:code-review" if name="code-review" and plugin.name="my-plugin").
      // Skills are discovered by skill-registry.js via pluginRegistry() below,
      // so they appear in purpclaw skills list alongside disk-based skills.
      registerSkill(skillDef) {
        if (!skillDef || !skillDef.name) return;
        const yaml = (() => { try { return require('js-yaml'); } catch { return null; } })();
        // Build inline skill record
        const meta = (yaml && skillDef.content)
          ? (() => {
              const match = String(skillDef.content).match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
              if (!match) return {};
              try { return yaml.load(match[1]) || {}; } catch { return {}; }
            })()
          : { description: skillDef.description || '' };
        const namespaced = skillDef.name.includes(':')
          ? skillDef.name
          : `${plugin.name}:${skillDef.name}`;
        const record = {
          plugin     : plugin.name,
          name       : namespaced,
          skillName  : skillDef.name,   // un-namespaced name
          description: meta.description || skillDef.description || '',
          version    : meta.version || skillDef.version || null,
          content    : skillDef.content || `<!-- Skill "${skillDef.name}" from plugin "${plugin.name}" -->\n${skillDef.description || ''}`,
          metadata   : { ...meta, source: 'plugin', plugin: plugin.name, inline: true },
          path       : plugin.root,       // plugin directory as skill "path"
          main       : null,             // no file — content is inline
          resources  : [],
          inline     : true,
        };
        self.skills.set(namespaced, record);
        // Also register under un-namespaced if no conflict
        if (!self.skills.has(skillDef.name)) {
          self.skills.set(skillDef.name, record);
        }
      },

      dispatchTool(name, args, ctx) {
        // Route to worker if isolated, else inline
        if (plugin.isolated) {
          const iso = getIsolator();
          if (iso && iso.isRunning(plugin.name)) {
            return iso.invoke(plugin.name, name, args);
          }
          return Promise.resolve({ ok: false, error: `plugin worker not running: ${plugin.name}` });
        }
        const TR = require('./tool-runtime').ToolRuntime;
        const tr = new TR();
        return tr.invoke(name, args, ctx);
      },

      dataPath(...parts) {
        return path.join(plugin.root, ...parts);
      },
    };

    return base;
  }

  // ── Load ────────────────────────────────────────────────────────────────────

  load() {
    if (this.loaded) return this.list();
    return this.loadAllSync();
  }

  loadAllSync() {
    const cfg     = this.config();
    const enabled = new Set(cfg.enabled  || []);
    const disabled = new Set(cfg.disabled || []);

    for (const plugin of this.discover()) {
      plugin.enabled = enabled.has(plugin.name) && !disabled.has(plugin.name);
      this.plugins.set(plugin.name, plugin);
      if (!plugin.enabled) continue;

      // Check env requirements
      for (const env of plugin.manifest.requiresEnv || []) {
        const key = typeof env === 'string' ? env : env.name;
        if (!process.env[key]) {
          plugin.error = `missing env: ${key}`;
          plugin.enabled = false;
          break;
        }
      }
      if (!plugin.enabled) continue;

      // Check isolation flag
      plugin.isolated = plugin.manifest.isolate === true;

      if (plugin.isolated) {
        // Async load via worker — try, fall back to inline
        const iso = getIsolator();
        if (iso) {
          iso.spawn(plugin.name, plugin.root, plugin.manifest).then((result) => {
            if (result.ok) {
              plugin.loaded = true;
            } else {
              plugin.error = result.error;
              plugin.loaded = false;
            }
          }).catch((err) => {
            plugin.error = err.message;
            plugin.loaded = false;
          });
          // Mark as "loading" — will be ready async
          plugin.loaded = 'pending';
          continue;
        }
        // Isolator not available, fall back to inline
        plugin.isolated = false;
      }

      this._loadInline(plugin);
    }

    this.loaded = true;
    return this.list();
  }

  _loadInline(plugin) {
    try {
      const mod = require(path.join(plugin.root, plugin.manifest.main || 'index.js'));
      if (typeof mod.register !== 'function') {
        throw new Error('plugin must export register(ctx)');
      }
      mod.register(this.context(plugin));
      plugin.loaded = true;
      plugin.error  = null;
    } catch (err) {
      plugin.loaded = false;
      plugin.error  = err.message;
    }
  }

  // ── List ───────────────────────────────────────────────────────────────────

  list() {
    return [...this.plugins.values()].map(p => ({
      name        : p.name,
      version     : (p.manifest && p.manifest.version) || '0',
      description : (p.manifest && p.manifest.description) || '',
      enabled     : p.enabled,
      loaded      : p.loaded,
      isolated    : p.isolated || false,
      error       : p.error || null,
      root        : p.root || null,
      manifest    : p.manifest || null,
    }));
  }

  // ── Hooks ─────────────────────────────────────────────────────────────────

  handlers(event) {
    const found = [...(this.hooks.get(event) || [])];
    for (const [key, list] of this.hooks) {
      if (key.endsWith('*') && event.startsWith(key.slice(0, -1))) {
        found.push(...list);
      }
    }
    return found.sort((a, b) => b.priority - a.priority);
  }

  matches(matcher, context) {
    if (!matcher) return true;
    if (typeof matcher === 'function') return matcher(context);
    const str = String(context.name || context.tool || context.platform || '');
    if (typeof matcher === 'string') return new RegExp(matcher).test(str);
    return Object.entries(matcher).every(([key, value]) =>
      new RegExp(value).test(String(context[key] ?? ''))
    );
  }

  async emitMutable(event, payload = {}) {
    let context  = { ...payload };
    const results = [];
    for (const hook of this.handlers(event)) {
      if (!this.matches(hook.matcher, context)) continue;
      try {
        const result = await hook.handler(context, event);
        results.push(result);
        if (result?.patch && typeof result.patch === 'object') {
          context = { ...context, ...result.patch };
        }
        if (result?.action === 'block') {
          return { context, results, blocked: true, reason: result.reason || `blocked by ${hook.plugin}` };
        }
      } catch (err) {
        results.push({ plugin: hook.plugin, error: err.message });
      }
    }
    return { context, results, blocked: false };
  }

  async emit(event, payload = {}) {
    return (await this.emitMutable(event, payload)).results;
  }

  // ── Commands ────────────────────────────────────────────────────────────────

  commandCatalog() {
    return [...this.commands].map(([name, c]) => ({
      name,
      description : c.description,
      plugin      : c.plugin,
    }));
  }

  async runCommand(name, args, ctx) {
    const c = this.commands.get(name);
    if (!c) throw new Error(`plugin command not found: ${name}`);
    return c.handler(args, ctx);
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  unloadAll() {
    const iso = getIsolator();
    if (iso) iso.terminateAll();
    this.plugins.clear();
    this.hooks.clear();
    this.commands.clear();
    this.cliCommands.clear();
    this.skills.clear();
    this.loaded = false;
  }

  // ── P1-6: Expose plugin skills to skill-registry.js ────────────────────────
  // Returns all registered plugin skills in the same shape as disk-based skills.
  // Called by lib/skill-registry.js to merge plugin skills into discovery results.
  pluginRegistry() {
    return [...this.skills.values()].map(s => ({
      name       : s.name,
      description: s.description,
      version    : s.version,
      path       : s.path,
      main       : s.main,       // null for inline
      metadata   : s.metadata,
      inline     : s.inline || false,
      source     : 'plugin',
      plugin     : s.plugin,
    }));
  }
}

const manager = new PluginManager();
module.exports = manager;
module.exports.PluginManager = PluginManager;
