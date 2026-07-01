'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TIMELINE_FILE = path.join(ROOT, 'registry', 'timeline.json');
const COUNCIL_VOTES_FILE = path.join(ROOT, 'registry', 'council-votes.json');
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

function uid(prefix = 'evt') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
}

function compact(value, limit = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
}

function isoFrom(value, fallback = null) {
  if (!value && fallback) return fallback;
  if (!value) return new Date().toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? (fallback || new Date().toISOString()) : date.toISOString();
}

function locationForMode(mode) {
  switch (mode) {
    case 'after_hours':
    case 'ambient_life':
      return 'Tea Room';
    case 'council':
    case 'arena':
      return 'Council Chamber';
    case 'emergency':
      return 'War Room';
    case 'news':
    case 'commentary':
    case 'directors_cut':
    case 'radio':
    case 'brainstorm':
    case 'interview':
    case 'vent':
      return 'Studio';
    default:
      return 'Studio';
  }
}

function keyFor(event) {
  const kind = event.kind || 'unknown';
  const subject = event.subject || event.title || event.summary || 'general';
  return `${kind}:${String(subject).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)}`;
}

class Timeline {
  constructor(file = TIMELINE_FILE) {
    this.file = file;
  }

  load() {
    const data = readJson(this.file, null);
    if (!data || typeof data !== 'object') {
      return {
        schema: 'purpclaw.timeline.v1',
        version: '0.1.0',
        updated: new Date().toISOString(),
        events: [],
        patterns: {},
      };
    }
    if (!Array.isArray(data.events)) data.events = [];
    if (!data.patterns || typeof data.patterns !== 'object') data.patterns = {};
    return data;
  }

  save(data) {
    data.updated = new Date().toISOString();
    writeJson(this.file, data);
  }

  record(input = {}) {
    const data = this.load();
    const event = {
      id: input.id || uid('evt'),
      timestamp: input.timestamp || new Date().toISOString(),
      kind: input.kind || 'note',
      source: input.source || 'manual',
      title: compact(input.title || input.summary || input.kind || 'Timeline event', 120),
      summary: compact(input.summary || input.title || '', 240),
      agents: normalizeList(input.agents),
      location: input.location || null,
      mood: input.mood || null,
      severity: input.severity || null,
      subject: input.subject || null,
      refs: input.refs || {},
      data: input.data || {},
    };

    data.events.push(event);
    data.events.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    this._updatePattern(data, event);
    this.save(data);
    return event;
  }

  backfill(opts = {}) {
    const write = !!opts.write;
    const data = this.load();
    const existingKeys = new Set((data.events || []).map(event => this._dedupeKey(event)).filter(Boolean));
    const candidates = [
      ...this._eventsFromCouncilVotes(),
      ...this._eventsFromStudioSessions(),
    ].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

    const added = [];
    const skipped = [];
    for (const event of candidates) {
      const dedupeKey = this._dedupeKey(event);
      if (dedupeKey && existingKeys.has(dedupeKey)) {
        skipped.push(event);
        continue;
      }
      existingKeys.add(dedupeKey);
      added.push(event);
    }

    if (write && added.length) {
      for (const event of added) {
        data.events.push(event);
        this._updatePattern(data, event);
      }
      data.events.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
      this.save(data);
    }

    return {
      schema: 'purpclaw.timeline.backfill.v1',
      write,
      candidates: candidates.length,
      added: added.length,
      skipped: skipped.length,
      events: added,
    };
  }

  recent(limit = 20, filter = {}) {
    const data = this.load();
    let events = data.events.slice();
    if (filter.kind) events = events.filter(e => e.kind === filter.kind);
    if (filter.agent) events = events.filter(e => (e.agents || []).includes(filter.agent));
    if (filter.source) events = events.filter(e => e.source === filter.source);
    return events.slice(-limit).reverse();
  }

  patterns(limit = 20) {
    const data = this.load();
    return Object.values(data.patterns || {})
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0) || (b.count || 0) - (a.count || 0))
      .slice(0, limit);
  }

  describeRecent(limit = 20) {
    const events = this.recent(limit);
    const lines = [`\nPURPCLAW Timeline - recent ${events.length} events\n`];
    for (const event of events) {
      lines.push(`${event.timestamp}  ${event.kind}  ${event.title}`);
      if (event.agents && event.agents.length) lines.push(`  agents: ${event.agents.join(', ')}`);
      if (event.location) lines.push(`  location: ${event.location}`);
      if (event.summary && event.summary !== event.title) lines.push(`  ${event.summary}`);
    }
    return lines.join('\n');
  }

  describePatterns(limit = 20) {
    const patterns = this.patterns(limit);
    const lines = [`\nPURPCLAW Timeline Patterns - ${patterns.length} observed\n`];
    for (const pattern of patterns) {
      lines.push(`${String(pattern.confidence).padStart(3)}%  x${String(pattern.count).padEnd(3)} ${pattern.label}`);
      lines.push(`  first: ${pattern.first_seen}`);
      lines.push(`  last:  ${pattern.last_seen}`);
      if (pattern.tradition) lines.push('  status: tradition candidate');
    }
    return lines.join('\n');
  }

  _updatePattern(data, event) {
    const key = keyFor(event);
    const existing = data.patterns[key] || {
      key,
      label: event.subject || event.title || event.kind,
      kind: event.kind,
      source: event.source,
      count: 0,
      confidence: 0,
      first_seen: event.timestamp,
      last_seen: event.timestamp,
      event_ids: [],
      tradition: false,
    };

    existing.count += 1;
    existing.last_seen = event.timestamp;
    if (!existing.first_seen || event.timestamp < existing.first_seen) existing.first_seen = event.timestamp;
    existing.event_ids = [...new Set([...(existing.event_ids || []), event.id])].slice(-25);
    existing.confidence = Math.min(95, Math.max(existing.confidence || 0, Math.round(existing.count * 14)));
    existing.tradition = existing.count >= 3 && existing.confidence >= 42;
    data.patterns[key] = existing;
  }

  _dedupeKey(event) {
    const refs = event.refs || {};
    if (refs.vote_id) return `vote:${refs.vote_id}`;
    if (refs.session_id) return `${event.kind}:session:${refs.session_id}`;
    if (event.id) return `id:${event.id}`;
    return null;
  }

  _eventsFromCouncilVotes() {
    const votesData = readJson(COUNCIL_VOTES_FILE, { votes: [] });
    return (votesData.votes || []).map(vote => ({
      id: `backfill_vote_${vote.vote_id}`,
      timestamp: isoFrom(vote.timestamp),
      kind: 'council.vote_cast',
      source: 'timeline.backfill',
      title: compact(`Council vote ${vote.outcome || 'recorded'}: ${vote.problem}`, 120),
      summary: vote.decision || vote.outcome || '',
      agents: vote.attendees || (vote.votes || []).map(v => v.agent_id),
      location: 'Council Chamber',
      mood: null,
      severity: vote.outcome === 'vetoed' || vote.outcome === 'rejected' ? 'HIGH' : null,
      subject: vote.problem || vote.vote_id,
      refs: { vote_id: vote.vote_id },
      data: {
        meeting_type: vote.meeting_type,
        chair: vote.chair,
        vote_type: vote.vote_type,
        outcome: vote.outcome,
        tally: vote.tally,
        dissenters: vote.dissenters || [],
        chaoPassers: vote.chaoPassers || [],
      },
    }));
  }

  _eventsFromStudioSessions() {
    const sessionsData = readJson(STUDIO_SESSION_LOG_FILE, { sessions: [] });
    return (sessionsData.sessions || []).map(session => {
      const conversation = session.conversation || session.log || [];
      const firstTurnTs = conversation[0] && (conversation[0].timestamp || conversation[0].ts);
      const timestamp = isoFrom(session.timestamp || firstTurnTs);
      const kind = session.ambient ? 'studio.ambient_life' : 'studio.session_ended';
      return {
        id: `backfill_session_${session.id}`,
        timestamp,
        kind,
        source: 'timeline.backfill',
        title: compact(`${session.ambient ? 'Ambient life' : 'Studio session'}: ${session.mode || 'unknown'}`, 120),
        summary: session.duck_observation || session.footer || session.topic || '',
        agents: session.participants || [],
        location: locationForMode(session.mode),
        mood: null,
        severity: null,
        subject: session.mode || session.id,
        refs: { session_id: session.id },
        data: {
          mode: session.mode,
          topic: session.topic || null,
          turns: session.duration_turns || conversation.length || 0,
          votes_cast: session.votes_cast || 0,
          ambient: !!session.ambient,
        },
      };
    });
  }
}

module.exports = { Timeline, TIMELINE_FILE };

if (require.main === module) {
  const timeline = new Timeline();
  const args = process.argv.slice(2);
  if (args[0] === 'patterns') console.log(timeline.describePatterns(parseInt(args[1], 10) || 20));
  else console.log(timeline.describeRecent(parseInt(args[0], 10) || 20));
}
