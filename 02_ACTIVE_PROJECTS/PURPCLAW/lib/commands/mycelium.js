'use strict';

const fs = require('fs');
const mycelium = require('../mycelium');

function parseJsonArg(raw, fallback = {}) {
  if (!raw) return fallback;
  if (fs.existsSync(raw)) return JSON.parse(fs.readFileSync(raw, 'utf8'));
  return JSON.parse(raw);
}

function print(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

function usage() {
  console.log(`
  purpclaw mycelium health
  purpclaw mycelium spore add <json-or-file>
  purpclaw mycelium spore write <json-or-file>
  purpclaw mycelium spores list
  purpclaw mycelium query <json-or-file>
  purpclaw mycelium nutrients <json-or-file>
  purpclaw mycelium bundle <json-or-file>
  purpclaw mycelium route add <json-or-file>
  purpclaw mycelium route list
  purpclaw mycelium conflicts
  purpclaw mycelium warn <json-or-file>
  purpclaw mycelium replay <json-or-file>
  purpclaw mycelium promote <json-or-file>

  aliases:
  purpclaw fungus ...
`);
}

async function run(args = []) {
  const [area, action, ...rest] = args;
  try {
    if (!area || area === 'help' || area === '--help') return usage();
    if (area === 'health') return print(mycelium.health());
    if (area === 'spore' || area === 'spores') {
      if (action === 'write' || action === 'create' || action === 'add') return print(mycelium.writeSpore(parseJsonArg(rest.join(' '))));
      if (action === 'list' || action === 'ls') return print(mycelium.readSpores());
    }
    if (area === 'query' || area === 'nutrients' || area === 'bundle') return print(mycelium.nutrientBundle(parseJsonArg([action, ...rest].filter(Boolean).join(' '))));
    if (area === 'route' || area === 'routes') {
      if (action === 'add' || action === 'register') return print(mycelium.registerRoute(parseJsonArg(rest.join(' '))));
      if (action === 'list' || action === 'ls') return print(mycelium.listRoutes());
    }
    if (area === 'conflicts') return print(mycelium.listConflicts());
    if (area === 'warn' || area === 'failure') return print(mycelium.knownFailureWarning(parseJsonArg([action, ...rest].filter(Boolean).join(' '))));
    if (area === 'replay') return print(mycelium.replayPattern(parseJsonArg([action, ...rest].filter(Boolean).join(' '))));
    if (area === 'promote' || area === 'pattern') return print(mycelium.promotePattern(parseJsonArg([action, ...rest].filter(Boolean).join(' '))));
    usage();
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e.message || String(e) }, null, 2));
    process.exitCode = 1;
  }
}

module.exports = { run };
