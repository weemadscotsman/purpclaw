'use strict';

const fs = require('fs');
const spinebus = require('../spinebus');

function parseJsonArg(raw, fallback = {}) {
  if (!raw) return fallback;
  if (fs.existsSync(raw)) return JSON.parse(fs.readFileSync(raw, 'utf8'));
  return JSON.parse(raw);
}
function print(obj) { console.log(JSON.stringify(obj, null, 2)); }
function usage() {
  console.log(`
  purpclaw spinebus health
  purpclaw spinebus route "message text"
  purpclaw spinebus envelope <json-or-text>
  purpclaw spinebus registry
  purpclaw spinebus lesson <json-or-file>
  purpclaw spinebus dream-queue [json-or-file]
`);
}
async function run(args = []) {
  const [area, ...rest] = args;
  try {
    if (!area || area === 'help' || area === '--help') return usage();
    if (area === 'health') return print(spinebus.getSpinebusHealth());
    if (area === 'registry') return print(spinebus.loadInvocationRegistry());
    if (area === 'route') return print(spinebus.routeText({ text: rest.join(' '), source: { type: 'cli', sessionId: 'local' }, planOnly: true }));
    if (area === 'envelope') {
      const raw = rest.join(' ');
      let input;
      try { input = parseJsonArg(raw); } catch { input = { text: raw, source: { type: 'cli', sessionId: 'local' } }; }
      return print(spinebus.createJobEnvelope(input));
    }
    if (area === 'lesson') return print(spinebus.queueLessonProposal(parseJsonArg(rest.join(' '))));
    if (area === 'dream-queue') {
      if (!rest.length) return print(spinebus.readJsonl(spinebus.DREAM_QUEUE_FILE));
      return print(spinebus.queueDreamTask(parseJsonArg(rest.join(' '))));
    }
    usage();
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e.message || String(e) }, null, 2));
    process.exitCode = 1;
  }
}
module.exports = { run };
