'use strict';
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const REGISTRY = require('./messaging-registry');
const DB = process.env.PURPCLAW_SESSION_DB || path.join(process.cwd(), '.purpclaw', 'state.db');
const db = new DatabaseSync(DB);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS messaging_sessions(
  platform TEXT NOT NULL, conversation_id TEXT NOT NULL, user_id TEXT,
  session_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(platform,conversation_id)
);
CREATE TABLE IF NOT EXISTS messaging_inbound(
  platform TEXT NOT NULL, message_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
  status TEXT NOT NULL, result TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(platform,message_id)
);`);

function csv(value) { return String(value || '').split(',').map(item => item.trim()).filter(Boolean); }
function authorized(platform, conversationId, userId) {
  const definition = REGISTRY.get(platform); if (!definition) return false;
  const allow = csv(process.env[definition.channels]);
  if (!allow.length) return process.env.PURPCLAW_MESSAGING_ALLOW_OPEN === '1';
  return allow.includes(String(conversationId)) || allow.includes(String(userId));
}
function binding(platform, conversationId) { return db.prepare('SELECT * FROM messaging_sessions WHERE platform=? AND conversation_id=?').get(platform, String(conversationId)) || null; }
function listBindings(platform) { return db.prepare(`SELECT * FROM messaging_sessions ${platform ? 'WHERE platform=?' : ''} ORDER BY updated_at DESC`).all(...(platform ? [platform] : [])); }
function bind(platform, conversationId, userId, sessionId) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO messaging_sessions VALUES(?,?,?,?,?,?) ON CONFLICT(platform,conversation_id)
    DO UPDATE SET user_id=excluded.user_id,session_id=excluded.session_id,updated_at=excluded.updated_at`).run(platform, String(conversationId), userId == null ? null : String(userId), sessionId, now, now);
  return binding(platform, conversationId);
}
function chunks(text, limit) { const result=[]; let value=String(text||''); while(value.length){result.push(value.slice(0,limit));value=value.slice(limit);} return result.length?result:['']; }
async function handleInbound(input, options = {}) {
  const platform = String(input.platform || '').toLowerCase(), conversationId = String(input.conversationId || ''), messageId = String(input.messageId || '');
  if (!REGISTRY.get(platform)) throw new Error(`unsupported messaging platform: ${platform}`);
  if (!conversationId || !String(input.text || '').trim()) throw new Error('conversationId and text are required');
  if (!authorized(platform, conversationId, input.userId)) { const error = new Error('messaging sender is not authorized'); error.code = 'MESSAGING_UNAUTHORIZED'; throw error; }
  if (messageId) {
    const previous = db.prepare('SELECT * FROM messaging_inbound WHERE platform=? AND message_id=?').get(platform, messageId);
    if (previous?.status === 'completed') return { duplicate: true, ...(JSON.parse(previous.result || '{}')) };
    if (previous?.status === 'processing' && Date.now() - new Date(previous.updated_at).getTime() < 5 * 60_000) return { duplicate: true, pending: true, platform, conversationId };
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO messaging_inbound VALUES(?,?,?,?,NULL,?,?) ON CONFLICT(platform,message_id) DO UPDATE SET status='processing',updated_at=excluded.updated_at`).run(platform,messageId,conversationId,'processing',now,now);
  }
  const { AgentGateway } = require('./agent-gateway');
  const gateway = options.gateway || new AgentGateway({ cwd: options.cwd || process.cwd(), provider: options.provider, model: options.model });
  let current = binding(platform, conversationId);
  if (!current) { const session = gateway.createSession({ title: `${platform}:${conversationId}`, source: platform }); current = bind(platform, conversationId, input.userId, session.id); }
  try {
    const result = await gateway.submit({ prompt: String(input.text), session_id: current.session_id, platform, operator_initiated: false });
    bind(platform, conversationId, input.userId, result.session_id);
    const output = { sessionId: result.session_id, reply: result.message, turns: result.turns, platform, conversationId };
    if (messageId) db.prepare("UPDATE messaging_inbound SET status='completed',result=?,updated_at=? WHERE platform=? AND message_id=?").run(JSON.stringify(output),new Date().toISOString(),platform,messageId);
    if (options.deliver) for (const part of chunks(output.reply, REGISTRY.get(platform).limit)) await options.deliver(part, output);
    return output;
  } catch (error) {
    if (messageId) db.prepare("UPDATE messaging_inbound SET status='failed',result=?,updated_at=? WHERE platform=? AND message_id=?").run(JSON.stringify({ error: error.message }),new Date().toISOString(),platform,messageId);
    throw error;
  }
}
module.exports = { authorized, binding, bind, listBindings, handleInbound, chunks, DB };
