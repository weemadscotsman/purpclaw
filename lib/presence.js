'use strict';

const fs = require('fs');
const path = require('path');
const { Timeline } = require('./timeline');

const ROOT = path.resolve(__dirname, '..');
const PRESENCE_FILE = path.join(ROOT, 'registry', 'presence.json');
const WORLD_FILE = path.join(ROOT, 'registry', 'studio-world-state.json');

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

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function ago(timestamp) {
  const ms = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function roomForLocation(rooms, location) {
  if (!location) return null;
  const target = String(location).toLowerCase();
  return Object.values(rooms).find(room =>
    (room.locations || []).some(loc => String(loc).toLowerCase() === target)
  ) || null;
}

function atmosphereFor(room, world, events) {
  const state = world.state || {};
  if (room.id === 'war_room') return 'alert';
  if (state.build_health === 0 || state.provider_latency === 'CRITICAL') return 'crisis residue';
  if (events.some(e => e.severity === 'HIGH')) return 'tense';
  if (room.id === 'tea_room' && events.some(e => (e.agents || []).length > 0)) return 'recently occupied';
  return room.default_atmosphere || 'quiet';
}

class Presence {
  constructor(opts = {}) {
    this.file = opts.file || PRESENCE_FILE;
    this.timeline = opts.timeline || new Timeline(opts.timelineFile);
  }

  load() {
    const data = readJson(this.file, null);
    if (!data || typeof data !== 'object') {
      return { schema: 'purpclaw.presence.v1', version: '0.1.0', updated: new Date().toISOString(), rooms: {} };
    }
    if (!data.rooms || typeof data.rooms !== 'object') data.rooms = {};
    return data;
  }

  world() {
    return readJson(WORLD_FILE, { schema: 'purpclaw.studio.world-state.v1', state: {} });
  }

  snapshot(opts = {}) {
    const data = this.load();
    const world = this.world();
    const timelineData = this.timeline.load();
    const events = (timelineData.events || []).slice().sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    const endedSessions = new Set(
      events
        .filter(e => e.kind === 'studio.session_ended' && e.refs && e.refs.session_id)
        .map(e => e.refs.session_id)
    );

    const rooms = {};
    for (const [id, room] of Object.entries(data.rooms)) {
      const roomEvents = events.filter(event => {
        const mapped = roomForLocation(data.rooms, event.location);
        return mapped && mapped.id === id;
      });
      const recentEvents = roomEvents.slice(-8).reverse();
      const recentVisitors = uniq(recentEvents.flatMap(e => e.agents || [])).slice(0, 12);
      const currentOccupants = uniq(
        roomEvents
          .filter(e => e.kind === 'studio.session_started' && e.refs && e.refs.session_id && !endedSessions.has(e.refs.session_id))
          .flatMap(e => e.agents || [])
      );

      rooms[id] = {
        ...room,
        current_occupants: currentOccupants,
        recent_visitors: recentVisitors,
        atmosphere: atmosphereFor(room, world, recentEvents),
        recent_events: recentEvents.map(e => ({
          id: e.id,
          timestamp: e.timestamp,
          kind: e.kind,
          title: e.title,
          agents: e.agents || [],
          age: ago(e.timestamp),
        })),
        last_activity: recentEvents[0] ? recentEvents[0].timestamp : null,
      };
    }

    const snapshot = {
      schema: 'purpclaw.presence.snapshot.v1',
      generated_at: new Date().toISOString(),
      world: world.state || {},
      rooms,
    };

    if (opts.write) {
      data.updated = snapshot.generated_at;
      for (const [id, room] of Object.entries(snapshot.rooms)) {
        data.rooms[id] = {
          ...data.rooms[id],
          current_occupants: room.current_occupants,
          recent_visitors: room.recent_visitors,
          atmosphere: room.atmosphere,
          last_activity: room.last_activity,
        };
      }
      writeJson(this.file, data);
    }

    return snapshot;
  }

  describe(roomId = null) {
    const snapshot = this.snapshot();
    const rooms = roomId ? { [roomId]: snapshot.rooms[roomId] } : snapshot.rooms;
    const lines = ['\nPURPCLAW Presence\n'];

    for (const room of Object.values(rooms)) {
      if (!room) continue;
      lines.push(`${room.name}`);
      lines.push(`  Atmosphere: ${room.atmosphere}`);
      lines.push(`  Occupants: ${room.current_occupants.length ? room.current_occupants.join(', ') : 'empty'}`);
      lines.push(`  Recent visitors: ${room.recent_visitors.length ? room.recent_visitors.join(', ') : 'none'}`);
      lines.push(`  Objects: ${(room.objects || []).join(', ') || 'none'}`);
      if (room.traditions && room.traditions.length) lines.push(`  Traditions: ${room.traditions.join('; ')}`);
      if (room.recent_events && room.recent_events.length) {
        lines.push('  Recent events:');
        for (const event of room.recent_events.slice(0, 3)) {
          lines.push(`    ${event.age}: ${event.title}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

module.exports = { Presence, PRESENCE_FILE };

if (require.main === module) {
  const presence = new Presence();
  const args = process.argv.slice(2);
  if (args[0] === '--json') console.log(JSON.stringify(presence.snapshot(), null, 2));
  else console.log(presence.describe(args[0]));
}
