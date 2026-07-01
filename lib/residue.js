'use strict';

const fs = require('fs');
const path = require('path');
const { Timeline } = require('./timeline');
const { Presence } = require('./presence');

const ROOT = path.resolve(__dirname, '..');
const RESIDUE_FILE = path.join(ROOT, 'registry', 'residue.json');
const STUDIO_SESSION_LOG_FILE = path.join(ROOT, 'registry', 'studio-session-log.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function slug(value) {
  return String(value || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80) || 'unknown';
}

function roomIdForLocation(location) {
  switch (location) {
    case 'Council Chamber': return 'council_chamber';
    case 'Tea Room': return 'tea_room';
    case 'Studio': return 'studio';
    case 'Archive': return 'archive';
    case 'War Room': return 'war_room';
    case 'Roof': return 'roof';
    default: return null;
  }
}

function roomName(roomId) {
  return String(roomId || '')
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function artifact(key, room, label, opts = {}) {
  return {
    key,
    room,
    label,
    type: opts.type || 'trace',
    source: opts.source || 'derived',
    strength: opts.strength || 1,
    agents: unique(opts.agents || []),
    evidence: unique(opts.evidence || []),
    first_seen: opts.timestamp || new Date().toISOString(),
    last_seen: opts.timestamp || new Date().toISOString(),
  };
}

class Residue {
  constructor(opts = {}) {
    this.file = opts.file || RESIDUE_FILE;
    this.timeline = opts.timeline || new Timeline(opts.timelineFile);
    this.presence = opts.presence || new Presence(opts);
  }

  load() {
    const data = readJson(this.file, null);
    if (!data || typeof data !== 'object') {
      return {
        schema: 'purpclaw.residue.v1',
        version: '0.1.0',
        updated: new Date().toISOString(),
        policy: { tradition_threshold: 3 },
        rooms: {},
      };
    }
    if (!data.rooms || typeof data.rooms !== 'object') data.rooms = {};
    return data;
  }

  save(data) {
    data.updated = new Date().toISOString();
    writeJson(this.file, data);
  }

  snapshot(opts = {}) {
    const persisted = this.load();
    const generated = this._deriveArtifacts();
    const merged = this._merge(persisted.rooms, generated);
    const snapshot = {
      schema: 'purpclaw.residue.snapshot.v1',
      generated_at: new Date().toISOString(),
      rooms: merged,
    };

    if (opts.write) {
      persisted.rooms = merged;
      this.save(persisted);
    }

    return snapshot;
  }

  describe(roomId = null) {
    const snapshot = this.snapshot();
    const rooms = roomId ? { [roomId]: snapshot.rooms[roomId] } : snapshot.rooms;
    const lines = ['\nPURPCLAW Residue\n'];

    for (const [id, room] of Object.entries(rooms)) {
      if (!room) continue;
      lines.push(`${room.name || roomName(id)}`);
      const artifacts = Object.values(room.artifacts || {})
        .sort((a, b) => (b.strength || 0) - (a.strength || 0) || String(b.last_seen).localeCompare(String(a.last_seen)));
      if (!artifacts.length) {
        lines.push('  Nothing durable left behind yet.');
        lines.push('');
        continue;
      }
      for (const item of artifacts.slice(0, 12)) {
        const tradition = item.tradition ? '  tradition' : '';
        lines.push(`  ${item.label}  x${item.strength}${tradition}`);
        if (item.agents && item.agents.length) lines.push(`    agents: ${item.agents.join(', ')}`);
        if (item.evidence && item.evidence.length) lines.push(`    evidence: ${item.evidence.slice(0, 2).join(' | ')}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  _merge(existingRooms, generatedRooms) {
    const merged = {};
    const roomIds = unique([...Object.keys(existingRooms || {}), ...Object.keys(generatedRooms || {})]);

    for (const roomId of roomIds) {
      const existing = existingRooms[roomId] || { id: roomId, name: roomName(roomId), artifacts: {} };
      const generated = generatedRooms[roomId] || { id: roomId, name: existing.name || roomName(roomId), artifacts: {} };
      const artifacts = {};
      const keys = unique([...Object.keys(existing.artifacts || {}), ...Object.keys(generated.artifacts || {})]);

      for (const key of keys) {
        const oldItem = existing.artifacts ? existing.artifacts[key] : null;
        const newItem = generated.artifacts ? generated.artifacts[key] : null;
        const item = {
          ...(oldItem || {}),
          ...(newItem || {}),
          key,
          strength: Math.max(oldItem ? oldItem.strength || 0 : 0, newItem ? newItem.strength || 0 : 0),
          agents: unique([...(oldItem ? oldItem.agents || [] : []), ...(newItem ? newItem.agents || [] : [])]),
          evidence: unique([...(oldItem ? oldItem.evidence || [] : []), ...(newItem ? newItem.evidence || [] : [])]).slice(-12),
          first_seen: [oldItem && oldItem.first_seen, newItem && newItem.first_seen].filter(Boolean).sort()[0] || new Date().toISOString(),
          last_seen: [oldItem && oldItem.last_seen, newItem && newItem.last_seen].filter(Boolean).sort().slice(-1)[0] || new Date().toISOString(),
        };
        item.tradition = (item.strength || 0) >= 3;
        artifacts[key] = item;
      }

      merged[roomId] = { id: roomId, name: existing.name || generated.name || roomName(roomId), artifacts };
    }

    return merged;
  }

  _addArtifact(rooms, item) {
    if (!item || !item.room) return;
    if (!rooms[item.room]) rooms[item.room] = { id: item.room, name: roomName(item.room), artifacts: {} };
    const current = rooms[item.room].artifacts[item.key];
    if (!current) {
      rooms[item.room].artifacts[item.key] = item;
      return;
    }
    current.strength += item.strength || 1;
    current.agents = unique([...(current.agents || []), ...(item.agents || [])]);
    current.evidence = unique([...(current.evidence || []), ...(item.evidence || [])]).slice(-12);
    current.first_seen = [current.first_seen, item.first_seen].filter(Boolean).sort()[0];
    current.last_seen = [current.last_seen, item.last_seen].filter(Boolean).sort().slice(-1)[0];
  }

  _deriveArtifacts() {
    const rooms = {};
    const timeline = this.timeline.load();
    const events = timeline.events || [];
    const presence = this.presence.snapshot();

    for (const [roomId, room] of Object.entries(presence.rooms || {})) {
      for (const visitor of room.recent_visitors || []) {
        if (visitor === 'hermes' && roomId === 'tea_room') {
          this._addArtifact(rooms, artifact('hermes_coffee_mug', roomId, 'coffee mug left by Hermes', {
            type: 'object',
            agents: ['hermes'],
            evidence: ['Hermes visited the Tea Room during crisis residue.'],
            timestamp: room.last_activity,
          }));
        }
        if (visitor === 'goose' && roomId === 'tea_room') {
          this._addArtifact(rooms, artifact('goose_tea_bag', roomId, 'tea bag left by Goose', {
            type: 'object',
            agents: ['goose'],
            evidence: ['Goose visited the Tea Room.'],
            timestamp: room.last_activity,
          }));
        }
      }
    }

    for (const event of events) {
      const roomId = roomIdForLocation(event.location);
      if (!roomId) continue;
      const text = `${event.title || ''} ${event.summary || ''}`.toLowerCase();
      const agents = event.agents || [];

      if (event.kind === 'council.vote_cast') {
        this._addArtifact(rooms, artifact(`vote_note_${slug(event.subject)}`, roomId, `vote note: ${event.subject || event.title}`, {
          type: 'record',
          agents,
          evidence: [event.title],
          timestamp: event.timestamp,
        }));
      }

      if (event.kind === 'studio.ambient_life') {
        this._addArtifact(rooms, artifact(`ambient_trace_${slug(event.subject)}`, roomId, `ambient trace: ${event.subject || 'office life'}`, {
          type: 'trace',
          agents,
          evidence: [event.summary || event.title],
          timestamp: event.timestamp,
        }));
      }

      if (text.includes('duck') && (text.includes('security') || text.includes('concerned'))) {
        this._addArtifact(rooms, artifact('duck_security_concern', roomId, 'duck concern in the room', {
          type: 'atmosphere',
          agents: ['duck'],
          evidence: [event.summary || event.title],
          timestamp: event.timestamp,
        }));
      }

      if (text.includes('burn') || text.includes('start again')) {
        this._addArtifact(rooms, artifact('phoenix_burn_mark', roomId, 'burn mark in the conversation', {
          type: 'trace',
          agents: unique([...agents, 'phoenix']),
          evidence: [event.summary || event.title],
          timestamp: event.timestamp,
        }));
      }

      if (text.includes('build broken') || text.includes('build: 0') || text.includes('build 0')) {
        this._addArtifact(rooms, artifact('build_failure_marker', roomId, 'build failure marker', {
          type: 'incident',
          agents,
          evidence: [event.title],
          timestamp: event.timestamp,
        }));
      }

      if (text.includes('provider') || text.includes('nvidia')) {
        this._addArtifact(rooms, artifact('provider_outage_note', roomId, 'provider outage note', {
          type: 'incident',
          agents,
          evidence: [event.title],
          timestamp: event.timestamp,
        }));
      }
    }

    for (const item of this._artifactsFromSessionConversations()) this._addArtifact(rooms, item);
    return rooms;
  }

  _artifactsFromSessionConversations() {
    const sessions = readJson(STUDIO_SESSION_LOG_FILE, { sessions: [] }).sessions || [];
    const out = [];
    for (const session of sessions) {
      const room = session.mode === 'after_hours' || session.mode === 'ambient_life' ? 'tea_room'
        : session.mode === 'council' || session.mode === 'arena' ? 'council_chamber'
          : 'studio';
      const turns = session.conversation || session.log || [];
      for (const turn of turns) {
        const speaker = turn.agent_id || turn.speaker;
        const text = String(turn.text || '').toLowerCase();
        const timestamp = turn.timestamp ? new Date(turn.timestamp).toISOString() : (session.timestamp || new Date().toISOString());
        if (speaker === 'hermes' && (text.includes('strange') || text.includes('trace') || text.includes('renderer'))) {
          out.push(artifact('hermes_open_notebook', room, 'Hermes left an open notebook', {
            type: 'object',
            agents: ['hermes'],
            evidence: [turn.text],
            timestamp,
          }));
        }
        if (speaker === 'phoenix' && (text.includes('burn') || text.includes('start again'))) {
          out.push(artifact('phoenix_burn_mark', room, 'burn mark in the conversation', {
            type: 'trace',
            agents: ['phoenix'],
            evidence: [turn.text],
            timestamp,
          }));
        }
        if (speaker === 'memory' && (text.includes('remember') || text.includes('same conversation'))) {
          out.push(artifact('memory_archive_marker', room, 'Memory filed a reference marker', {
            type: 'record',
            agents: ['memory'],
            evidence: [turn.text],
            timestamp,
          }));
        }
        if (speaker === 'smith' && (text.includes('exploitable') || text.includes('security'))) {
          out.push(artifact('smith_risk_note', room, 'Smith left a risk note', {
            type: 'record',
            agents: ['smith'],
            evidence: [turn.text],
            timestamp,
          }));
        }
      }
    }
    return out;
  }
}

module.exports = { Residue, RESIDUE_FILE };

if (require.main === module) {
  const residue = new Residue();
  const args = process.argv.slice(2);
  if (args[0] === '--json') console.log(JSON.stringify(residue.snapshot(), null, 2));
  else console.log(residue.describe(args[0]));
}
