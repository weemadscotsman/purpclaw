'use strict';

/**
 * EMAIL GATEWAY ADAPTER — PURPCLAW
 * =================================
 *
 * Mirrors lib/gateways/telegram.js. Bridges PURPCLAW /api/chat (port 7780)
 * to email via IMAP IDLE (receive) + SMTP (send).
 *
 * Transport:
 *   - Incoming: IMAP IDLE on INBOX (real-time push from the server)
 *   - Outgoing: SMTP (nodemailer)
 *
 * Environment:
 *   EMAIL_IMAP_HOST            (required to receive)
 *   EMAIL_IMAP_PORT             (optional, default 993)
 *   EMAIL_IMAP_USER
 *   EMAIL_IMAP_PASS
 *   EMAIL_IMAP_TLS              (optional, default true)
 *   EMAIL_SMTP_HOST             (required to send)
 *   EMAIL_SMTP_PORT             (optional, default 465)
 *   EMAIL_SMTP_USER
 *   EMAIL_SMTP_PASS
 *   EMAIL_SMTP_SECURE           (optional, default true)
 *   EMAIL_FROM                  (optional, defaults to EMAIL_SMTP_USER)
 *   EMAIL_ALLOW_FROM            (optional, comma-separated sender allowlist; default = any)
 *   PURPCLAW_API_URL            (optional, default http://127.0.0.1:7780)
 *   PORT                        (optional, default 7798)  /health endpoint
 *
 * Safety: all log output goes through lib/secret-redactor.js; both modules
 *   are dynamic-require'd so the adapter boots in not_configured mode if
 *   they're missing.
 */

const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let redactor = null;
try { redactor = require(path.join(ROOT, 'lib', 'secret-redactor.js')); }
catch { redactor = { redact: (s) => String(s) }; }

const env = process.env;
const IMAP = {
  host: env.EMAIL_IMAP_HOST,
  port: parseInt(env.EMAIL_IMAP_PORT || '993', 10),
  user: env.EMAIL_IMAP_USER,
  pass: env.EMAIL_IMAP_PASS,
  tls: (env.EMAIL_IMAP_TLS || 'true').toLowerCase() !== 'false',
};
const SMTP = {
  host: env.EMAIL_SMTP_HOST,
  port: parseInt(env.EMAIL_SMTP_PORT || '465', 10),
  user: env.EMAIL_SMTP_USER,
  pass: env.EMAIL_SMTP_PASS,
  secure: (env.EMAIL_SMTP_SECURE || 'true').toLowerCase() !== 'false',
};
const FROM = env.EMAIL_FROM || SMTP.user;
const ALLOW_FROM = (env.EMAIL_ALLOW_FROM || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const API_URL = env.PURPCLAW_API_URL || 'http://127.0.0.1:7780';
const PORT = parseInt(env.PORT || '7798', 10);

const log = (...args) => {
  const line = `[email-gateway ${new Date().toISOString()}] ${args.map(String).join(' ')}`;
  console.log(redactor.redact(line));
};

const imapConfigured = Boolean(IMAP.host && IMAP.user && IMAP.pass);
const smtpConfigured = Boolean(SMTP.host && SMTP.user && SMTP.pass);

// ── lib loaders (dynamic, so missing dep → not_configured) ───────────────

let ImapFlow = null;
let nodemailer = null;
let imapLoadError = null;
let smtpLoadError = null;

try { ImapFlow = require('imapflow').ImapFlow; }
catch (e) { imapLoadError = e.message; }

try { nodemailer = require('nodemailer'); }
catch (e) { smtpLoadError = e.message; }

// ── PURPCLAW chat ────────────────────────────────────────────────────────

function purpclawChat(message, opts = {}) {
  const body = JSON.stringify({ message, spawnAgents: opts.spawnAgents !== false });
  return new Promise((resolve, reject) => {
    const u = new URL(`${API_URL}/api/chat`);
    const lib = u.protocol === 'https:' ? require('https') : require('http');
    const req = lib.request({
      method: 'POST', hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      timeout: 60000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`chat api ${res.statusCode}: ${text.slice(0, 200)}`));
        try { resolve(JSON.parse(text)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('chat timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function shapeReply(chatResult) {
  const responses = Array.isArray(chatResult?.responses) ? chatResult.responses : [];
  const kernel = responses.find((r) => r.source === 'api-kernel' && r.jobId);
  const orchestrator = responses.find((r) => r.source === 'orchestrator');
  if (kernel) return `🔧 routed → job ${kernel.jobId} (${kernel.route || 'kernel'}) · ${kernel.status}\n\n[Kernel is working — reply will follow when complete.]`;
  if (orchestrator) {
    const out = orchestrator.result || orchestrator.output || orchestrator.response;
    if (out) return String(out);
  }
  if (chatResult?.mission?.summary) return String(chatResult.mission.summary);
  return '🤖 (no response shape recognised)';
}

// ── SMTP send (nodemailer) ───────────────────────────────────────────────

let smtpTransport = null;
function getTransport() {
  if (smtpTransport) return smtpTransport;
  if (!nodemailer) return null;
  smtpTransport = nodemailer.createTransport({
    host: SMTP.host,
    port: SMTP.port,
    secure: SMTP.secure,
    auth: { user: SMTP.user, pass: SMTP.pass },
  });
  return smtpTransport;
}

async function sendMail(to, subject, text, opts = {}) {
  const t = getTransport();
  if (!t) throw new Error('smtp not configured (missing nodemailer or env)');
  return t.sendMail({
    from: FROM,
    to,
    subject: opts.subject || `Re: ${subject || ''}`.trim(),
    text,
    inReplyTo: opts.inReplyTo,
    references: opts.references,
  });
}

// ── IMAP IDLE (imapflow) ─────────────────────────────────────────────────

let imapClient = null;
async function startImapLoop() {
  if (!ImapFlow) {
    log('imapflow not installed; cannot start IDLE loop');
    return;
  }
  const client = new ImapFlow({
    host: IMAP.host,
    port: IMAP.port,
    secure: IMAP.tls,
    auth: { user: IMAP.user, pass: IMAP.pass },
    logger: false,
  });
  imapClient = client;
  await client.connect();
  log(`imap connected to ${IMAP.host}:${IMAP.port} as ${IMAP.user}`);

  // Resolve UIDs we've already seen so we don't process them on connect
  const lock = await client.getMailboxLock('INBOX');
  let lastUid = (await client.status('INBOX', { uidNext: true })).uidNext - 1;
  lock.release();

  client.on('exists', async (data) => {
    try {
      const lock2 = await client.getMailboxLock('INBOX');
      try {
        const status = await client.status('INBOX', { uidNext: true });
        const newLast = status.uidNext - 1;
        if (newLast <= lastUid) return;
        for (let uid = lastUid + 1; uid <= newLast; uid++) {
          const msg = await client.fetchOne(String(uid), { source: true, envelope: true, uid: true }, { uid: true });
          if (!msg) continue;
          await handleIncoming(msg);
        }
        lastUid = newLast;
      } finally {
        lock2.release();
      }
    } catch (e) {
      log('exists handler error:', e.message);
    }
  });

  // Idle. imapflow does this automatically when on('exists') is subscribed.
  await client.idle();
  log('imap idle loop running');
}

async function handleIncoming(msg) {
  const from = msg.envelope?.from?.[0];
  const fromAddr = from ? `${from.name ? from.name + ' ' : ''}<${from.address}>`.trim() : 'unknown';
  const subject = msg.envelope?.subject || '(no subject)';
  const source = msg.source?.toString('utf8') || '';
  const text = source.split(/\r?\n/).filter((l) => !l.startsWith('>')).join('\n').slice(0, 4000);
  if (ALLOW_FROM.length) {
    const senderEmail = (from?.address || '').toLowerCase();
    if (!ALLOW_FROM.includes(senderEmail)) {
      log(`<- ${fromAddr} (blocked by allowlist)`);
      return;
    }
  }
  log(`<- ${fromAddr}  subject="${subject.slice(0, 60)}"`);
  if (!smtpConfigured) {
    log('no smtp configured; cannot reply');
    return;
  }
  try {
    const result = await purpclawChat(text, { spawnAgents: true });
    const reply = shapeReply(result);
    await sendMail(from?.address, subject, reply, {
      inReplyTo: msg.envelope?.messageId,
      references: msg.envelope?.messageId,
    });
    log(`-> replied to ${from?.address || '?'}`);
  } catch (e) {
    log('handle error:', e.message);
  }
}

// ── health ───────────────────────────────────────────────────────────────

function startHealth() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (u.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        mode: (imapConfigured || smtpConfigured) ? 'configured' : 'not_configured',
        imap: imapConfigured,
        smtp: smtpConfigured,
        imapflow: Boolean(ImapFlow),
        nodemailer: Boolean(nodemailer),
        api: API_URL,
        port: PORT,
        pid: process.pid,
        uptime: process.uptime(),
      }));
      return;
    }
    if (u.pathname === '/version') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ name: 'purpclaw-email-gateway', version: '0.1.0' }));
      return;
    }
    res.writeHead(404); res.end();
  });
  server.listen(PORT, '127.0.0.1', () => log(`/health listening on :${PORT}`));
  return server;
}

let stopping = false;
function shutdown(signal, server) {
  log(`received ${signal}, shutting down`);
  stopping = true;
  if (imapClient) imapClient.logout().catch(() => {});
  setTimeout(() => process.exit(0), 1500).unref();
  if (server) server.close();
}

function main() {
  if (!imapConfigured && !smtpConfigured) {
    log('no EMAIL_*_HOST/USER/PASS set — booting in not_configured mode (health is 200)');
  } else {
    log(`imap=${imapConfigured} smtp=${smtpConfigured} imapflow=${Boolean(ImapFlow)} nodemailer=${Boolean(nodemailer)}`);
    if (imapLoadError) log('imapflow load error:', imapLoadError);
    if (smtpLoadError) log('nodemailer load error:', smtpLoadError);
  }
  const server = startHealth();
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
    process.on(sig, () => shutdown(sig, server));
  }
  if (imapConfigured && ImapFlow) {
    startImapLoop().catch((e) => { log('imap failed:', e.message); });
  }
}

if (require.main === module) main();

module.exports = { main, shapeReply, sendMail, startImapLoop, purpclawChat, startHealth };
