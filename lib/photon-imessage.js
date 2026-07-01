'use strict';

const http = require('http');
const https = require('https');

function configFromEnv(env = process.env) {
  const baseUrl = env.PHOTON_IMESSAGE_BASE_URL || env.PHOTON_API_BASE_URL || env.PHOTON_API_URL || '';
  return {
    ok: Boolean(baseUrl && (env.PHOTON_IMESSAGE_API_KEY || env.PHOTON_API_KEY)),
    baseUrl,
    apiKeyPresent: Boolean(env.PHOTON_IMESSAGE_API_KEY || env.PHOTON_API_KEY),
    sendEnabled: String(env.PHOTON_IMESSAGE_ENABLE_SEND || '').toLowerCase() === 'true',
    sendPath: env.PHOTON_IMESSAGE_SEND_PATH || '/v1/imessage/send',
    statusPath: env.PHOTON_IMESSAGE_STATUS_PATH || '/v1/imessage/status',
  };
}

function requestJson(method, urlString, body = null, timeoutMs = 30000) {
  return new Promise(resolve => {
    let url;
    try { url = new URL(urlString); } catch (error) {
      resolve({ ok: false, status: 0, error: `invalid Photon URL: ${error.message}` });
      return;
    }
    const payload = body ? JSON.stringify(body) : '';
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method,
      timeout: timeoutMs,
      headers: {
        accept: 'application/json',
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        authorization: `Bearer ${process.env.PHOTON_IMESSAGE_API_KEY || process.env.PHOTON_API_KEY || ''}`,
      },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, body: parsed });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, error: 'timeout' }); });
    req.on('error', error => resolve({ ok: false, status: 0, error: error.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

function resolvePayload(task = '', options = {}) {
  let parsed = {};
  const text = String(task || '').trim();
  if (text.startsWith('{')) {
    try { parsed = JSON.parse(text); } catch {}
  }
  const to = options.to || parsed.to || parsed.recipient || '';
  const message = options.message || parsed.message || parsed.text || (text.startsWith('{') ? '' : text);
  return {
    to: String(to || '').trim(),
    message: String(message || '').trim(),
    service: options.service || parsed.service || 'imessage',
    source: options.source || parsed.source || 'surface-action',
    metadata: {
      purpclaw_surface: options.source || 'surface-action',
      no_mac_relay: true,
      provider: 'photon',
    },
  };
}

function safeSummary(payload) {
  return {
    to_present: Boolean(payload.to),
    message_chars: payload.message.length,
    service: payload.service,
    provider: 'photon',
    no_mac_relay: true,
  };
}

async function status(options = {}) {
  const cfg = configFromEnv();
  if (!cfg.ok) {
    return {
      ok: false,
      configured: false,
      provider: 'photon',
      no_mac_relay: true,
      required: ['PHOTON_IMESSAGE_BASE_URL or PHOTON_API_BASE_URL', 'PHOTON_IMESSAGE_API_KEY or PHOTON_API_KEY'],
    };
  }
  const url = new URL(cfg.statusPath, cfg.baseUrl).toString();
  const result = await requestJson('GET', url, null, options.timeoutMs || 30000);
  return {
    ok: result.ok,
    configured: true,
    provider: 'photon',
    no_mac_relay: true,
    status: result.status,
    body: result.body,
    error: result.error,
  };
}

async function send(task = '', options = {}) {
  const cfg = configFromEnv();
  const payload = resolvePayload(task, options);
  if (!cfg.ok) {
    return { ok: false, configured: false, provider: 'photon', no_mac_relay: true, error: 'Photon iMessage is not configured', summary: safeSummary(payload) };
  }
  if (!cfg.sendEnabled || options.confirmSend !== true) {
    return {
      ok: false,
      configured: true,
      provider: 'photon',
      no_mac_relay: true,
      error: 'Photon iMessage send is disabled until PHOTON_IMESSAGE_ENABLE_SEND=true and confirmSend=true are both set',
      summary: safeSummary(payload),
    };
  }
  if (!payload.to || !payload.message) {
    return { ok: false, configured: true, provider: 'photon', no_mac_relay: true, error: 'recipient and message are required', summary: safeSummary(payload) };
  }
  const url = new URL(cfg.sendPath, cfg.baseUrl).toString();
  const result = await requestJson('POST', url, payload, options.timeoutMs || 30000);
  return {
    ok: result.ok,
    configured: true,
    provider: 'photon',
    no_mac_relay: true,
    status: result.status,
    body: result.body,
    error: result.error,
    summary: safeSummary(payload),
  };
}

module.exports = { configFromEnv, resolvePayload, safeSummary, status, send };
