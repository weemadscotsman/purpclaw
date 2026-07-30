'use strict';

/**
 * lib/commands/plugin.js
 * purpclaw plugin — Codex-style plugin management
 *
 * Codex parity: codex plugin list/disable/enable/info
 * Plugin system: lib/plugin-manager.js (PluginManager class)
 * Plugins live in: .purpclaw/plugins/<name>/plugin.json
 */

const path = require('path');
const fs = require('fs');

const PLUGIN_DIR = path.join(__dirname, '..', '..', '.purpclaw', 'plugins');

async function run(args, ctx = {}) {
  const PM = (() => {
    try { return require(path.join(__dirname, '..', 'plugin-manager')); } catch { return null; }
  })();

  if (!PM) {
    console.log('error: plugin system not available');
    return 1;
  }

  const sub = (args[0] || 'list').toLowerCase();
  const json = args.includes('--json');
  const name = args[1];

  if (sub === 'list' || sub === 'ls') {
    const plugins = PM.load();
    if (json) {
      console.log(JSON.stringify({ plugins }, null, 2));
      return;
    }
    if (!plugins.length) {
      console.log('No plugins installed.\nInstall plugins to: .purpclaw/plugins/<name>/plugin.json');
      return;
    }
    console.log(`\nPURPCLAW PLUGINS  (${plugins.length} found)\n`);
    for (const p of plugins) {
      const status = p.enabled ? 'ON ' : 'OFF';
      const loadStr = p.loaded === 'pending'
        ? 'loading'
        : p.loaded ? 'loaded' : 'not loaded';
      const isoStr = p.isolated ? ' [isolated]' : '';
      const errStr = p.error ? `  ERROR: ${p.error}` : '';
      console.log(`  [${status}] ${p.name}  v${p.version}  (${loadStr})${isoStr}${errStr}`);
      if (p.description) console.log(`         ${p.description}`);
    }
    console.log('');
    return;
  }

  if (sub === 'enable') {
    if (!name) { console.log('usage: purpclaw plugin enable <name> [--json]'); return 1; }
    try {
      PM.enable(name);
      const plugins = PM.load();
      const p = plugins.find(x => x.name === name);
      console.log(json
        ? JSON.stringify({ ok: true, name, enabled: true, loaded: p?.loaded || false })
        : `✓ plugin '${name}' enabled${p?.loaded ? ' and loaded' : ''}`);
    } catch (e) {
      console.log(json ? JSON.stringify({ ok: false, error: e.message }) : `error: ${e.message}`);
    }
    return;
  }

  if (sub === 'disable') {
    if (!name) { console.log('usage: purpclaw plugin disable <name> [--json]'); return 1; }
    try {
      PM.disable(name);
      console.log(json
        ? JSON.stringify({ ok: true, name, enabled: false })
        : `✓ plugin '${name}' disabled`);
    } catch (e) {
      console.log(json ? JSON.stringify({ ok: false, error: e.message }) : `error: ${e.message}`);
    }
    return;
  }

  if (sub === 'info') {
    if (!name) { console.log('usage: purpclaw plugin info <name> [--json]'); return 1; }
    const plugins = PM.load();
    const p = plugins.find(x => x.name === name);
    if (!p) {
      console.log(json ? JSON.stringify({ ok: false, error: `plugin not found: ${name}` }) : `error: plugin not found: ${name}`);
      return 1;
    }
    const info = {
      name        : p.name,
      version     : p.version,
      description : p.description,
      enabled     : p.enabled,
      loaded      : p.loaded === 'pending' ? 'loading' : p.loaded,
      isolated    : p.isolated || false,
      error       : p.error || null,
      root        : p.root,
      manifest    : p.manifest || null,
    };
    if (json) {
      console.log(JSON.stringify(info, null, 2));
    } else {
      console.log(`\n${p.name}  v${p.version}`);
      console.log('─'.repeat(40));
      console.log(`  Description: ${p.description || '(none)'}`);
      console.log(`  Enabled:    ${p.enabled}`);
      console.log(`  Loaded:     ${p.loaded}`);
      console.log(`  Root:       ${p.root}`);
      if (p.error) console.log(`  Error:      ${p.error}`);
      if (p.manifest) {
        const m = p.manifest;
        console.log(`  Main:       ${m.main || 'index.js'}`);
        console.log(`  Tools:      ${(m.tools || []).join(', ') || '(none)'}`);
        console.log(`  Hooks:      ${(m.hooks || []).join(', ') || '(none)'}`);
        console.log(`  Commands:   ${(m.commands || []).join(', ') || '(none)'}`);
        if (m.requiresEnv?.length) console.log(`  Env vars:   ${m.requiresEnv.join(', ')}`);
      }
      console.log('');
    }
    return;
  }

  if (sub === 'commands' || sub === 'cmds') {
    if (!PM.commandCatalog) {
      console.log(json ? JSON.stringify({ ok: false, error: 'command catalog not available' }) : 'error: command catalog not available');
      return 1;
    }
    const cmds = PM.commandCatalog();
    if (json) {
      console.log(JSON.stringify({ commands: cmds }, null, 2));
    } else {
      if (!cmds.length) { console.log('No plugin commands registered.'); return; }
      console.log(`\nPLUGIN COMMANDS  (${cmds.length})\n`);
      for (const c of cmds) console.log(`  ${c.name}  (${c.plugin})\n    ${c.description}`);
      console.log('');
    }
    return;
  }

  // ── plugin add (Codex parity) ────────────────────────────────────────────────
  // `codex plugin add sample@debug` or `codex plugin add sample --marketplace debug`
  if (sub === 'add') {
    const PM = (() => {
      try { return require(path.join(__dirname, '..', 'plugin-manager')); } catch { return null; }
    })();
    if (!PM) { console.log('error: plugin system not available'); return 1; }

    // Parse: plugin[@marketplace] or plugin --marketplace <name>
    let pluginArg = args[1];
    let marketplace = null;

    const mktIdx = args.indexOf('--marketplace');
    if (mktIdx !== -1 && args[mktIdx + 1]) marketplace = args[mktIdx + 1];

    if (!pluginArg || pluginArg.startsWith('--')) {
      console.log('usage: purpclaw plugin add <plugin>[@<marketplace>] [--marketplace <name>]');
      return 1;
    }

    // Parse plugin@marketplace shorthand
    const [pluginName, mktShort] = pluginArg.split('@');
    const resolvedMkt = marketplace || mktShort || 'default';
    const json = args.includes('--json');

    // Try to install from marketplace if marketplace system is available
    try {
      const MP = require('./marketplace');
      const result = MP.addPackage(pluginName, pluginName, 'plugin');
      if (json) console.log(JSON.stringify(result));
      else if (result.ok) console.log(col(C.green, '  ✓') + ' ' + result.message);
      else console.log(col(C.red, '  ✗') + ' ' + result.message);
    } catch (e) {
      if (json) console.log(JSON.stringify({ ok: false, error: e.message }));
      else console.log(col(C.red, '  ✗') + ' plugin add failed: ' + e.message);
    }
    return;
  }

  // ── plugin remove (Codex parity) ─────────────────────────────────────────────
  if (sub === 'remove' || sub === 'rm') {
    const PM = (() => {
      try { return require(path.join(__dirname, '..', 'plugin-manager')); } catch { return null; }
    })();
    if (!PM) { console.log('error: plugin system not available'); return 1; }

    let pluginArg = args[1];
    const mktIdx = args.indexOf('--marketplace');
    if (mktIdx !== -1 && args[mktIdx + 1]) pluginArg = args[mktIdx + 1];

    if (!pluginArg || pluginArg.startsWith('--')) {
      console.log('usage: purpclaw plugin remove <plugin> [--json]');
      return 1;
    }

    const pluginName = pluginArg.split('@')[0];
    const json = args.includes('--json');

    try {
      PM.disable(pluginName);
      if (json) console.log(JSON.stringify({ ok: true, name: pluginName, removed: true }));
      else console.log(col(C.green, '  ✓') + ` plugin '${pluginName}' disabled and removed`);
    } catch (e) {
      if (json) console.log(JSON.stringify({ ok: false, error: e.message }));
      else console.log(col(C.red, '  ✗') + ' ' + e.message);
    }
    return;
  }

  // ── plugin marketplace (Codex parity) ───────────────────────────────────────
  if (sub === 'marketplace') {
    // Codex: codex plugin marketplace add/list/upgrade/remove
    const mpCmd = require('./marketplace');
    // Handle --help before delegating
    if (args.includes('--help') || args.includes('-h')) {
      return mpCmd.run(['--help'], ctx);
    }
    // Map Codex's 'upgrade' to our 'update'
    const mpArgs = args.slice(1).map(a => a === 'upgrade' ? 'update' : a);
    return mpCmd.run(mpArgs, ctx);
  }

  // Help
  console.log(`purpclaw plugin — Codex-style plugin management
  purpclaw plugin list                    list all plugins (discovered + loaded)
  purpclaw plugin info <name>            show plugin details
  purpclaw plugin enable <name>         enable a plugin
  purpclaw plugin disable <name>         disable a plugin
  purpclaw plugin commands               list plugin-registered commands
  purpclaw plugin add <name>[@<mkt>]    install a plugin from marketplace
  purpclaw plugin remove <name>          remove a plugin
  purpclaw plugin marketplace add <src>  add a marketplace source
  purpclaw plugin marketplace list        list marketplace sources
  purpclaw plugin marketplace upgrade     upgrade a marketplace
  purpclaw plugin marketplace remove <n> remove a marketplace
  purpclaw --json                       JSON output (append to any subcommand)
`);
}

module.exports = { run };
