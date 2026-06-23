#!/usr/bin/env node
'use strict';

async function main() {
  process.env.LLM_FALLBACK = process.env.LLM_FALLBACK || 'ollama';
  process.env.LLM_FALLBACK_MODEL = process.env.LLM_FALLBACK_MODEL || process.env.OLLAMA_MODEL || 'qwen2.5:3b';

  const llm = require('../lib/llm-provider');
  const fakePrimary = {
    providerName: 'openai',
    provider: llm.PROVIDERS.openai,
    baseUrl: 'http://127.0.0.1:9/v1',
    apiKey: 'bad-key',
    model: 'bad-primary',
    format: 'openai',
    authHeader: 'Bearer',
    extraHeaders: {},
  };

  const checks = [];
  const chat = await llm.chat([{ role: 'user', content: 'Reply with exactly: chat fallback ok' }], {
    maxTokens: 24,
    temperature: 0,
  }, fakePrimary);
  checks.push({
    name: 'chat fallback',
    pass: chat.fallback?.to === 'ollama' && /chat fallback ok/i.test(chat.content),
    detail: { model: chat.model, fallback: chat.fallback || null, content: chat.content },
  });

  process.env.SWARM_PROVIDER = 'openai';
  process.env.SWARM_BASE_URL = 'http://127.0.0.1:9/v1';
  process.env.SWARM_API_KEY = 'bad-key';
  process.env.SWARM_MODEL = 'bad-swarm';
  const swarm = await llm.swarm([{ role: 'user', content: 'Reply with exactly: swarm fallback ok' }], {
    maxTokens: 24,
    temperature: 0,
  });
  checks.push({
    name: 'swarm fallback',
    pass: swarm.fallback?.to === 'ollama' && /swarm fallback ok/i.test(swarm.content),
    detail: { model: swarm.model, fallback: swarm.fallback || null, content: swarm.content },
  });

  const allPass = checks.every(check => check.pass);
  console.log(JSON.stringify({
    ok: allPass,
    providerInfo: llm.getProviderInfo(),
    checks,
  }, null, 2));
  process.exit(allPass ? 0 : 1);
}

main().catch(error => {
  console.error(`verify-llm-fallback failed: ${error.message}`);
  process.exit(1);
});
