'use strict';
/**
 * lib/commands/marketplace.js
 * purpclaw marketplace — skill/agent package registry CLI
 *
 * Subcommands:
 *   list    — show installed packages
 *   add     — install a package from source
 *   remove  — uninstall a package
 *   update  — re-fetch from source
 *   search  — search local manifest
 *   sources — list configured registries
 */

const MP = require('../marketplace');

const C = {
  reset  : '\x1b[0m',
  bold   : '\x1b[1m',
  dim    : '\x1b[2m',
  cyan   : '\x1b[36m',
  green  : '\x1b[32m',
  yellow : '\x1b[33m',
  red    : '\x1b[31m',
  blue   : '\x1b[34m',
  gray   : '\x1b[90m',
};

const isTTY = process.stdout.isTTY;
const col   = (c, s) => isTTY ? `${c}${s}${C.reset}` : s;

function die(msg) { console.error(col(C.red, 'error') + ' ' + msg); process.exit(1); }

async function run(args, ctx = {}) {
  const sub = (args[0] || 'list').toLowerCase();
  const json = args.includes('--json') || args.includes('--json-output');
  const verbose = args.includes('--verbose') || args.includes('-v');

  // Parse common flags
  const cleanArgs = args.filter(a => !a.startsWith('--'));

  // ── list ─────────────────────────────────────────────────────────────────────
  if (sub === 'list' || sub === 'ls') {
    const packages = MP.listInstalled();
    if (json) {
      console.log(JSON.stringify({ packages }, null, 2));
      return;
    }
    if (!packages.length) {
      console.log(col(C.gray, '  No packages installed.'));
      console.log(col(C.gray, "  Run `purpclaw marketplace add <source>` to install one.\n"));
      return;
    }
    console.log(col(C.cyan + C.bold, '\n  Installed packages (' + packages.length + ')'));
    console.log(col(C.gray, '  ' + '─'.repeat(60)) + '\n');
    for (const p of packages) {
      const typeTag  = col(p.type === 'agent' ? C.magenta : C.blue, p.type.padEnd(6));
      const nameTag  = col(C.white + C.bold, p.name);
      const source   = col(C.gray, p.source);
      const date     = col(C.gray, p.installed_at ? '  ' + p.installed_at.slice(0, 10) : '');
      const srcType  = col(C.dim, '[' + p.source_type + ']');
      console.log(`  ${typeTag}  ${nameTag}  ${srcType}${date}`);
      if (verbose) console.log(col(C.gray, `         ${source}`));
    }
    console.log('');
    return;
  }

  // ── add ───────────────────────────────────────────────────────────────────────
  if (sub === 'add') {
    // Parse --name=value and --type=value first (before filtering)
    let name = null, type = null;
    const positional = [];
    for (const a of args.slice(1)) { // skip subcommand 'add'
      if (a.startsWith('--name=')) name = a.slice(7);
      else if (a.startsWith('--type=')) type = a.slice(7);
      else if (a === '--name' || a === '--type') continue; // skip bare flags, handled below
      else positional.push(a);
    }
    // Handle bare --name <val> and --type <val>
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--name' && args[i + 1] && !args[i + 1].startsWith('--')) name = args[++i];
      else if (args[i] === '--type' && args[i + 1] && !args[i + 1].startsWith('--')) type = args[++i];
    }

    const src = positional[0];
    if (!src) {
      console.log('usage: purpclaw marketplace add <source> [--name <name>] [--type skill|agent|both]');
      console.log('       source can be a local path, git URL, or https URL');
      return 1;
    }

    if (!name) {
      // Derive name from source: last path segment or repo name
      if (src.includes('/')) {
        const parts = src.replace(/\\/g, '/').split('/');
        name = parts[parts.length - 1].replace(/\.git$/, '');
      } else {
        name = src;
      }
    }

    const result = MP.addPackage(name, src, type);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.ok) {
        console.log(col(C.green, '  ✓') + ' ' + result.message);
      } else {
        console.log(col(C.red, '  ✗') + ' ' + result.message);
        return 1;
      }
    }
    return;
  }

  // ── remove ────────────────────────────────────────────────────────────────────
  if (sub === 'remove' || sub === 'rm') {
    const name = cleanArgs[1];
    if (!name) {
      console.log('usage: purpclaw marketplace remove <name> [--json]');
      return 1;
    }
    const removeFiles = args.includes('--purge') || args.includes('--remove-files');
    const result = MP.removePackage(name, { removeFiles });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.ok) {
        console.log(col(C.green, '  ✓') + ' ' + result.message);
      } else {
        console.log(col(C.red, '  ✗') + ' ' + result.message);
        return 1;
      }
    }
    return;
  }

  // ── update ───────────────────────────────────────────────────────────────────
  if (sub === 'update') {
    const name = cleanArgs[1];
    if (!name) {
      console.log('usage: purpclaw marketplace update <name> [--json]');
      return 1;
    }
    const result = MP.updatePackage(name);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.ok) {
        console.log(col(C.green, '  ✓') + ' ' + result.message);
      } else {
        console.log(col(C.red, '  ✗') + ' ' + result.message);
        return 1;
      }
    }
    return;
  }

  // ── search ───────────────────────────────────────────────────────────────────
  if (sub === 'search') {
    const query = cleanArgs[1];
    if (!query) {
      console.log('usage: purpclaw marketplace search <query> [--json]');
      return 1;
    }
    const results = MP.searchPackages(query);
    if (json) {
      console.log(JSON.stringify({ query, packages: results }, null, 2));
      return;
    }
    if (!results.length) {
      console.log(col(C.gray, `  No packages matching '${query}'.`));
      return;
    }
    console.log(col(C.cyan + C.bold, `\n  Search results for '${query}' (${results.length})`));
    console.log(col(C.gray, '  ' + '─'.repeat(60)) + '\n');
    for (const p of results) {
      const typeTag = col(p.type === 'agent' ? C.magenta : C.blue, p.type);
      console.log(`  ${typeTag.padEnd(7)} ${col(C.white + C.bold, p.name)}`);
      console.log(col(C.gray, `         ${p.source}`));
    }
    console.log('');
    return;
  }

  // ── sources ──────────────────────────────────────────────────────────────────
  if (sub === 'sources') {
    const sources = MP.listSources();
    if (json) {
      console.log(JSON.stringify({ sources }, null, 2));
      return;
    }
    if (!sources.length) {
      console.log(col(C.gray, '  No source registries configured.'));
      console.log(col(C.gray, "  Add one: purpclaw marketplace sources add <url>\n"));
      return;
    }
    console.log(col(C.cyan + C.bold, '\n  Configured source registries (' + sources.length + ')'));
    console.log(col(C.gray, '  ' + '─'.repeat(60)) + '\n');
    for (const url of sources) {
      console.log(col(C.green, '  •') + ' ' + col(C.cyan, url));
    }
    console.log('');
    return;
  }

  // ── source add / source remove ───────────────────────────────────────────────
  if (sub === 'source') {
    const action = cleanArgs[1] || 'list';
    const url = cleanArgs[2];
    if (action === 'add' || action === 'register') {
      if (!url) {
        console.log('usage: purpclaw marketplace sources add <url> [--json]');
        return 1;
      }
      const result = MP.addSource(url);
      if (json) console.log(JSON.stringify(result, null, 2));
      else console.log(col(C.green, '  ✓') + ' ' + result.message);
      return;
    }
    if (action === 'remove' || action === 'rm') {
      if (!url) {
        console.log('usage: purpclaw marketplace sources remove <url> [--json]');
        return 1;
      }
      const result = MP.removeSource(url);
      if (json) console.log(JSON.stringify(result, null, 2));
      else console.log(result.ok ? (col(C.green, '  ✓') + ' ' + result.message) : (col(C.red, '  ✗') + ' ' + result.message));
      return;
    }
    // Fall through: source list
    const sources = MP.listSources();
    if (json) console.log(JSON.stringify({ sources }, null, 2));
    else {
      if (!sources.length) {
        console.log(col(C.gray, '  No source registries configured.'));
      } else {
        console.log(col(C.cyan + C.bold, '\n  Source registries (' + sources.length + ')'));
        for (const u of sources) console.log(col(C.green, '  •') + ' ' + col(C.cyan, u));
      }
    }
    return;
  }

  // ── unknown subcommand ────────────────────────────────────────────────────────
  console.log(`purpclaw marketplace — skill & agent package registry

  ${col(C.bold, 'listing:')}
  purpclaw marketplace list              list installed packages
  purpclaw marketplace list --json      JSON output
  purpclaw marketplace list --verbose   show full source paths

  ${col(C.bold, 'installing:')}
  purpclaw marketplace add <source> [--name <pkg>] [--type skill|agent|both]
                                      install a package from local path, git URL, or https

  ${col(C.bold, 'uninstalling:')}
  purpclaw marketplace remove <name> [--purge]    remove a package (--purge also deletes files)

  ${col(C.bold, 'updating:')}
  purpclaw marketplace update <name>   re-fetch / refresh a package

  ${col(C.bold, 'searching:')}
  purpclaw marketplace search <query>   search installed packages by name or type

  ${col(C.bold, 'sources:')}
  purpclaw marketplace sources          list configured source registries
  purpclaw marketplace sources add <url>
  purpclaw marketplace sources remove <url>

  ${col(C.bold, 'flags:')}
  --json, --json-output   machine-readable output
  --verbose, -v            show full details
`);
}

module.exports = { run };
