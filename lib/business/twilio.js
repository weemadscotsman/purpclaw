'use strict';

const crypto = require('crypto');
const { appendJsonl, readJsonl } = require('./store');

function config() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || '',
    from: process.env.TWILIO_FROM_NUMBER || '',
    brand: process.env.PURPCLAW_MESSAGE_BRAND || 'PurpClaw',
  };
}

function status() {
  const cfg = config();
  return {
    configured: Boolean(cfg.accountSid && cfg.authToken && (cfg.messagingServiceSid || cfg.from)),
    accountSid: cfg.accountSid ? `${cfg.accountSid.slice(0, 6)}...` : null,
    sender: cfg.messagingServiceSid || cfg.from || null,
    brand: cfg.brand,
  };
}

function normalizePhone(phone) {
  const value = String(phone || '').trim();
  if (!/^\+[1-9]\d{7,14}$/.test(value)) {
    throw new Error('phone must use E.164 format, for example +15551234567');
  }
  return value;
}

function recordConsent(rootDir, input) {
  const entry = {
    id: `consent-${crypto.randomUUID()}`,
    phone: normalizePhone(input.phone),
    status: input.status || 'opted-in',
    source: input.source,
    evidence: input.evidence || null,
    recordedAt: input.recordedAt || new Date().toISOString(),
  };
  if (!entry.source) throw new Error('consent source is required');
  appendJsonl(rootDir, 'consent.jsonl', entry);
  return entry;
}

function currentConsent(rootDir, phone) {
  const normalized = normalizePhone(phone);
  return readJsonl(rootDir, 'consent.jsonl')
    .filter(entry => entry.phone === normalized)
    .at(-1) || null;
}

function compliantBody(body, brand) {
  const text = String(body || '').trim();
  if (!text) throw new Error('message body is required');
  const branded = text.toLowerCase().includes(brand.toLowerCase()) ? text : `${brand}: ${text}`;
  return /\bstop\b/i.test(branded) ? branded : `${branded}\nReply STOP to opt out.`;
}

async function send(rootDir, input) {
  const cfg = config();
  if (!status().configured) {
    throw new Error('Twilio is not configured; set account, token, and sender environment variables');
  }
  const phone = normalizePhone(input.to);
  const consent = currentConsent(rootDir, phone);
  if (!consent || consent.status !== 'opted-in') {
    throw new Error('recipient has no current recorded opt-in');
  }
  const body = compliantBody(input.body, cfg.brand);
  const params = new URLSearchParams({ To: phone, Body: body });
  if (cfg.messagingServiceSid) params.set('MessagingServiceSid', cfg.messagingServiceSid);
  else params.set('From', cfg.from);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: params,
      signal: AbortSignal.timeout(30_000),
    }
  );
  const result = await response.json();
  appendJsonl(rootDir, 'outbound.jsonl', {
    id: result.sid || `failed-${crypto.randomUUID()}`,
    to: phone,
    body,
    status: response.ok ? result.status : 'failed',
    error: response.ok ? null : result.message || `Twilio HTTP ${response.status}`,
    sentAt: new Date().toISOString(),
  });
  if (!response.ok) throw new Error(result.message || `Twilio HTTP ${response.status}`);
  return result;
}

function draft(rootDir, input) {
  const cfg = config();
  const entry = {
    id: `draft-${crypto.randomUUID()}`,
    to: normalizePhone(input.to),
    body: compliantBody(input.body, cfg.brand),
    status: 'draft',
    createdAt: new Date().toISOString(),
  };
  appendJsonl(rootDir, 'outbox.jsonl', entry);
  return entry;
}

module.exports = {
  config,
  status,
  normalizePhone,
  recordConsent,
  currentConsent,
  compliantBody,
  send,
  draft,
};
