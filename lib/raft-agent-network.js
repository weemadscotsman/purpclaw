'use strict';

const http = require('http');
const https = require('https');

function configFromEnv(env = process.env) {
  const baseUrl = env.RAFT_AGENT_NETWORK_BASE_URL || env.RAFT_API_BASE_URL || env.RAFT_API_URL || '';
  return {
    ok: Boolean(baseUrl && (env.RAFT_AGENT_NETWORK_API_KEY || env.RAFT_API_KEY)),
    baseUrl,
    apiKeyPresent: Boolean(env.RAFT_AGENT_NETWORK_API_KEY || env.RAFT_API_KEY),
    dispatchEnabled: String(env.RAFT_AGENT_NETWORK_ENABLE_DISPATCH || '').toLowerCase() === 'true',
    statusPath: env.RAFT_AGENT_NETWORK_STATUS_PATH || '/v1/raft/status',
    dispatchPath: env.RAFT_AGENT_NETWORK_DISPATCH_PATH || '/v1/raft/dispatch',
  };
}

function requestJson(method, urlString, body = null, timeoutMs = 30000) {
  return new Promise(resolve => {
    let url;
    try { url = new URL(urlString); } catch (error) {
      resolve({ ok: false, status: 0, error: `invalid Raft URL: ${error.message}` });
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
        authorization: `Bearer ${process.env.RAFT_AGENT_NETWORK_API_KEY || process.env.RAFT_API_KEY || ''}`,
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
  return {
    task: String(options.message || parsed.task || parsed.message || text || '').trim(),
    peer: String(options.peer || parsed.peer || parsed.agent || '').trim(),
    channel: String(options.channel || parsed.channel || 'imessage').trim(),
    thread: String(options.thread || parsed.thread || parsed.conversation || '').trim(),
    targetCapability: String(options.targetCapability || parsed.capability || parsed.targetCapability || '').trim(),
    source: options.source || parsed.source || 'surface-action',
    metadata: {
      purpclaw_surface: options.source || 'surface-action',
      provider: 'raft',
      network: 'agent',
      gateway_channel: true,
      bounded: true,
    },
  };
}

function safeSummary(payload) {
  return {
    task_chars: payload.task.length,
    peer_present: Boolean(payload.peer),
    channel: payload.channel,
    thread_present: Boolean(payload.thread),
    target_capability: payload.targetCapability || null,
    provider: 'raft',
    gateway_channel: true,
  };
}

async function status(options = {}) {
  const cfg = configFromEnv();
  if (!cfg.ok) {
    return {
      ok: false,
      configured: false,
      provider: 'raft',
      gateway_channel: true,
      required: ['RAFT_AGENT_NETWORK_BASE_URL or RAFT_API_BASE_URL', 'RAFT_AGENT_NETWORK_API_KEY or RAFT_API_KEY'],
    };
  }
  const url = new URL(cfg.statusPath, cfg.baseUrl).toString();
  const result = await requestJson('GET', url, null, options.timeoutMs || 30000);
  return {
    ok: result.ok,
    configured: true,
    provider: 'raft',
    gateway_channel: true,
    status: result.status,
    body: result.body,
    error: result.error,
  };
}

async function dispatch(task = '', options = {}) {
  const cfg = configFromEnv();
  const payload = resolvePayload(task, options);
  if (!cfg.ok) {
    return { ok: false, configured: false, provider: 'raft', gateway_channel: true, error: 'Raft Agent Network is not configured', summary: safeSummary(payload) };
  }
  if (!cfg.dispatchEnabled || options.confirmDispatch !== true) {
    return {
      ok: false,
      configured: true,
      provider: 'raft',
      gateway_channel: true,
      error: 'Raft Agent Network dispatch is disabled until RAFT_AGENT_NETWORK_ENABLE_DISPATCH=true and confirmDispatch=true are both set',
      summary: safeSummary(payload),
    };
  }
  if (!payload.task) {
    return { ok: false, configured: true, provider: 'raft', gateway_channel: true, error: 'task/message is required', summary: safeSummary(payload) };
  }
  const url = new URL(cfg.dispatchPath, cfg.baseUrl).toString();
  const result = await requestJson('POST', url, payload, options.timeoutMs || 30000);
  return {
    ok: result.ok,
    configured: true,
    provider: 'raft',
    gateway_channel: true,
    status: result.status,
    body: result.body,
    error: result.error,
    summary: safeSummary(payload),
  };
}

module.exports = { configFromEnv, resolvePayload, safeSummary, status, dispatch };
