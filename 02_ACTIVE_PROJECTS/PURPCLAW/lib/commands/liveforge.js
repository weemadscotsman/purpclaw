'use strict';

const fs = require('fs');
const liveforge = require('../liveforge');

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
  purpclaw liveforge health
  purpclaw liveforge create <json-or-file>
  purpclaw liveforge surface create <json-or-file>
  purpclaw liveforge surface read <surfaceId>
  purpclaw liveforge surface list
  purpclaw liveforge state read <surfaceId>
  purpclaw liveforge event <json-or-file>
  purpclaw liveforge event write <json-or-file>
  purpclaw liveforge receipt write <json-or-file>
  purpclaw liveforge patch preview <json-or-file>
  purpclaw liveforge patch read <patchId>
  purpclaw liveforge patch list [surfaceId]
  purpclaw liveforge patch audience <patchId> <viewerId>
  purpclaw liveforge privacy answer <json-or-file>
  purpclaw liveforge tool-route register <json-or-file>
  purpclaw liveforge tool-route list
  purpclaw liveforge tool execute <json-or-file>
  purpclaw liveforge proposal create <json-or-file>
  purpclaw liveforge proposal list [surfaceId]
  purpclaw liveforge proposal approve <json-or-file>
  purpclaw liveforge lesson propose <json-or-file>
  purpclaw liveforge lesson list [status]
  purpclaw liveforge lesson replay <json-or-file>
  purpclaw liveforge lesson promote <json-or-file>
  purpclaw liveforge replay <json-or-file>
  purpclaw liveforge promote <json-or-file>
  purpclaw liveforge patterns list
  purpclaw liveforge audit fake-green [surfaceId]
  purpclaw liveforge registry snapshot
`);
}

async function run(args = []) {
  const [area, action, ...rest] = args;

  try {
    if (!area || area === 'help' || area === '--help') return usage();

    if (area === 'health') return print(liveforge.health());
    if (area === 'create') return print(liveforge.createSurface(parseJsonArg([action, ...rest].filter(Boolean).join(' '))));
    if (area === 'event' && action && action !== 'write' && action !== 'validate') return print(liveforge.writeEvent(parseJsonArg([action, ...rest].join(' '))));
    if (area === 'replay') return print(liveforge.replayLesson(parseJsonArg([action, ...rest].filter(Boolean).join(' '))));
    if (area === 'promote') return print(liveforge.promoteLesson(parseJsonArg([action, ...rest].filter(Boolean).join(' '))));

    if (area === 'surface' || area === 'surfaces') {
      if (action === 'create') return print(liveforge.createSurface(parseJsonArg(rest.join(' '))));
      if (action === 'read') return print(liveforge.readSurface(rest[0]));
      if (action === 'list' || action === 'ls') return print(liveforge.listSurfaces());
    }

    if (area === 'event' || area === 'events') {
      if (action === 'write' || action === 'validate') return print(liveforge.writeEvent(parseJsonArg(rest.join(' '))));
    }

    if (area === 'state') {
      if (action === 'read' || action === 'get') return print(liveforge.readSurfaceState(rest[0]));
    }

    if (area === 'receipt' || area === 'receipts') {
      if (action === 'write') return print(liveforge.writeReceipt(parseJsonArg(rest.join(' '))));
    }

    if (area === 'patch' || area === 'patches') {
      if (action === 'preview') return print(liveforge.createPatchPreview(parseJsonArg(rest.join(' '))));
      if (action === 'read') return print(liveforge.readPatchPreview(rest[0]));
      if (action === 'list' || action === 'ls') return print(liveforge.listPatchPreviews(rest[0] || null));
      if (action === 'audience') return print(liveforge.readPatchForAudience(rest[0], rest[1] || 'anonymous'));
    }

    if (area === 'privacy') {
      if (action === 'answer') return print(liveforge.answerVisibilityQuestion(parseJsonArg(rest.join(' '))));
    }

    if (area === 'tool-route' || area === 'tool-routes') {
      if (action === 'register') return print(liveforge.registerToolRoute(parseJsonArg(rest.join(' '))));
      if (action === 'list' || action === 'ls') return print(liveforge.readToolRoutes());
    }

    if (area === 'tool' || area === 'tools') {
      if (action === 'execute') return print(await liveforge.executeToolRequest(parseJsonArg(rest.join(' '))));
    }

    if (area === 'proposal' || area === 'proposals') {
      if (action === 'create') return print(liveforge.createGeneratedToolProposal(parseJsonArg(rest.join(' '))));
      if (action === 'list' || action === 'ls') return print(liveforge.listGeneratedToolProposals(rest[0] || null));
      if (action === 'approve') return print(await liveforge.approveGeneratedToolProposal(parseJsonArg(rest.join(' '))));
    }

    if (area === 'lesson' || area === 'lessons') {
      if (action === 'propose') return print(liveforge.proposeLesson(parseJsonArg(rest.join(' '))));
      if (action === 'list' || action === 'ls') return print(liveforge.listLessons(rest[0] || null));
      if (action === 'replay') return print(liveforge.replayLesson(parseJsonArg(rest.join(' '))));
      if (action === 'promote') return print(liveforge.promoteLesson(parseJsonArg(rest.join(' '))));
    }

    if (area === 'patterns') {
      if (action === 'list' || action === 'ls') return print(liveforge.listApprovedPatterns());
    }

    if (area === 'audit') {
      if (action === 'fake-green') return print(liveforge.fakeGreenAudit(rest[0] || null));
    }

    if (area === 'registry') {
      if (action === 'snapshot') return print(liveforge.buildInvocationRegistry());
    }

    usage();
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e.message || String(e) }, null, 2));
    process.exitCode = 1;
  }
}

module.exports = { run };
