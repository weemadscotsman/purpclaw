'use strict';

const http = require('http');
const llm = require('./llm-provider');

function requestJson(rawUrl, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let url = null;
    try { url = new URL(rawUrl); } catch (error) { resolve({ ok: false, error: error.message }); return; }
    const req = http.request({
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: 'GET',
      timeout: timeoutMs,
    }, (res) => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: JSON.parse(text) });
        } catch (error) {
          resolve({ ok: false, status: res.statusCode, error: error.message });
        }
      });
    });
    req.on('error', error => resolve({ ok: false, error: error.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: `timeout after ${timeoutMs}ms` });
    });
    req.end();
  });
}

async function getLlmStatus() {
  const providerInfo = llm.getProviderInfo();
  const fallback = providerInfo.fallback || { enabled: false };
  let local = {
    provider: fallback.provider || null,
    online: false,
    modelAvailable: false,
    models: [],
    error: null,
  };

  if (fallback.provider === 'ollama') {
    const base = (fallback.baseUrl || 'http://localhost:11434/v1').replace(/\/v1\/?$/, '');
    const tags = await requestJson(`${base}/api/tags`);
    const models = tags.ok && Array.isArray(tags.json?.models)
      ? tags.json.models.map(model => model.name || model.model).filter(Boolean)
      : [];
    local = {
      provider: 'ollama',
      online: tags.ok,
      modelAvailable: models.includes(fallback.model),
      models,
      error: tags.ok ? null : tags.error || `HTTP ${tags.status || '?'}`,
    };
  }

  return {
    ok: true,
    service: 'purpclaw-llm-routing',
    apiFirst: true,
    provider: providerInfo.main,
    swarm: providerInfo.swarm,
    fallback,
    minimax: providerInfo.minimax,
    local,
    routing: {
      chat: providerInfo.minimax?.reserved ? 'minimax-reserved-then-local-fallback' : 'primary-then-local-fallback',
      swarm: providerInfo.minimax?.reserved ? 'minimax-reserved-then-local-fallback' : 'primary-then-local-fallback',
      complete: providerInfo.minimax?.reserved ? 'minimax-reserved-then-local-fallback' : 'primary-then-local-fallback',
    },
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  getLlmStatus,
};
