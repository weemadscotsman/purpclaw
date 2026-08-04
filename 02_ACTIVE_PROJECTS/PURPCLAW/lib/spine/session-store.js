'use strict';

/**
 * Compatibility adapter for callers using the historical spine session API.
 * Conversational history is stored only in session-repository.js.
 */

const repository = require('../session-repository');

function appendTurn(sessionId, role, content) {
  if (!sessionId) return null;
  const existing = repository.loadSession(sessionId)
    || repository.createSession('New Chat', '', '', { id: sessionId, source: 'api' });
  const messages = Array.isArray(existing.messages) ? existing.messages.slice() : [];
  messages.push({ role, content, ts: new Date().toISOString() });
  return repository.saveSession(sessionId, messages, {
    title: existing.title,
    provider: existing.provider,
    model: existing.model,
    source: existing.source || 'api',
    profile: existing.profile,
  });
}

function getHistory(sessionId) {
  const session = repository.loadSession(sessionId);
  return session && Array.isArray(session.messages) ? session.messages : [];
}

function load(sessionId) {
  return { turns: getHistory(sessionId) };
}

function save(sessionId, state = {}) {
  if (!sessionId) return null;
  const existing = repository.loadSession(sessionId)
    || repository.createSession('New Chat', '', '', { id: sessionId, source: 'api' });
  const turns = Array.isArray(state.turns) ? state.turns : [];
  return repository.saveSession(sessionId, turns, {
    title: existing.title,
    provider: existing.provider,
    model: existing.model,
    source: existing.source || 'api',
    profile: existing.profile,
  });
}

module.exports = { appendTurn, getHistory, load, save };
