'use strict';

/**
 * lib/narrator/eventbus-bridge.js — backend publisher adapter for MochiNarrator.
 *
 * Closes the gap flagged at lib/omni/feature-registry.js:230:
 *   "14 event types narrated have no backend producer; needs publishers added"
 *
 * Mechanism:
 *   - lib/events.js already emits a typed vocabulary to eventbus :7782 over POST /publish.
 *     The "narrator 14 missing" list corresponds to those topics that MochiNarrator listens
 *     for on the client side but where no backend code currently invokes announce.* or emit().
 *   - This module re-exports announce.* with NARRATOR_EVENT_TYPES — a curated subset of the
 *     14 high-value topics the narrator UI actually displays. Each helper here is a thin
 *     wrapper that calls announce.emit() with a stable namespace + action so the client
 *     subscription can filter without guessing.
 *   - The client side (MissionControl / CommandPanel) doesn't need a new connection —
 *     it already subscribes to mission SSE for the same vocabulary. This module ensures
 *     the BACKEND emits those events when the relevant subsystem hits a state change.
 *
 * Usage:
 *   const narrate = require('./lib/narrator/eventbus-bridge');
 *   narrate.missionStarted({ missionId: 'apih_xxx', prompt: '...' });
 *
 * Why not just call announce.* directly? Two reasons:
 *   1. Naming stability — the curated NARRATOR_EVENT_TYPES list fixes the topic strings so
 *      the client doesn't get burned by refactors of lib/events.js's typed helpers.
 *   2. Discoverability — grep for narrate.* in the codebase lists every place a narrator
 *      event is produced. announce.* is too broad to grep for narrator intent.
 */

const announce = require('../events');

const NARRATOR_EVENT_TYPES = Object.freeze({
  MISSION_STARTED:      'mission.started',
  MISSION_FINISHED:     'mission.finished',
  MISSION_FAILED:       'mission.failed',
  SWARM_SPAWNED:        'agent.spawned',
  SWARM_FINISHED:       'agent.finished',
  TOOL_CALLED:          'agent.tool.call',
  TOOL_RESULT:          'agent.tool.result',
  MEMORY_INGESTED:      'memory.ingested',
  MEMORY_RECALLED:      'memory.recalled',
  EVOLUTION_TICKED:     'evolution.ticked',
  HARVEST_FOUND:        'harvest.found',
  VOICE_HEARD:          'voice.heard',
  VOICE_SPOKE:          'voice.spoke',
  BRIDGE_TRAVERSED:     'bridge.traversed',
});

function emitNarrate(eventType, payload = {}) {
  announce.emit({
    namespace: 'narrator',
    action: eventType.split('.')[1] || 'event',
    source: eventType.split('.')[0] || 'unknown',
    payload: { eventType, ...payload },
  });
}

const narrate = {
  types: NARRATOR_EVENT_TYPES,
  raw: emitNarrate,

  missionStarted:    (p = {}) => emitNarrate(NARRATOR_EVENT_TYPES.MISSION_STARTED, p),
  missionFinished:   (p = {}) => emitNarrate(NARRATOR_EVENT_TYPES.MISSION_FINISHED, p),
  missionFailed:     (p = {}) => emitNarrate(NARRATOR_EVENT_TYPES.MISSION_FAILED, p),
  swarmSpawned:      (p = {}) => emitNarrate(NARRATOR_EVENT_TYPES.SWARM_SPAWNED, p),
  swarmFinished:     (p = {}) => emitNarrate(NARRATOR_EVENT_TYPES.SWARM_FINISHED, p),
  toolCalled:        (p = {}) => emitNarrate(NARRATOR_EVENT_TYPES.TOOL_CALLED, p),
  toolResult:        (p = {}) => emitNarrate(NARRATOR_EVENT_TYPES.TOOL_RESULT, p),
  memoryIngested:    (p = {}) => emitNarrate(NARRATOR_EVENT_TYPES.MEMORY_INGESTED, p),
  memoryRecalled:    (p = {}) => emitNarrate(NARRATOR_EVENT_TYPES.MEMORY_RECALLED, p),
  evolutionTicked:   (p = {}) => emitNarrate(NARRATOR_EVENT_TYPES.EVOLUTION_TICKED, p),
  harvestFound:      (p = {}) => emitNarrate(NARRATOR_EVENT_TYPES.HARVEST_FOUND, p),
  voiceHeard:        (p = {}) => emitNarrate(NARRATOR_EVENT_TYPES.VOICE_HEARD, p),
  voiceSpoke:        (p = {}) => emitNarrate(NARRATOR_EVENT_TYPES.VOICE_SPOKE, p),
  bridgeTraversed:   (p = {}) => emitNarrate(NARRATOR_EVENT_TYPES.BRIDGE_TRAVERSED, p),
};

module.exports = narrate;
module.exports.NARRATOR_EVENT_TYPES = NARRATOR_EVENT_TYPES;
module.exports.emitNarrate = emitNarrate;
