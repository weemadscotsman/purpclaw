'use strict';

const LLM = require('./llm-provider');

const profiles = new Map();
const LOCAL = new Set(['ollama', 'lmstudio', 'custom']);

function apiMode(profile) {
  if (profile.format === 'anthropic') return 'anthropic_messages';
  if (profile.format === 'gemini') return 'gemini_generate_content';
  if (profile.format === 'codex') return 'codex_responses';
  return 'chat_completions';
}

function registerProvider(id, profile, options = {}) {
  if (!id || !profile) throw new Error('provider id and profile are required');
  const normalized = {
    id,
    baseUrl: profile.baseUrl || '',
    defaultModel: profile.defaultModel || '',
    apiMode: profile.apiMode || apiMode(profile),
    format: profile.format || 'openai',
    authHeader: profile.authHeader || 'Bearer',
    envVars: profile.envVars || [],
    modelEnvVars: profile.modelEnvVars || [],
    baseUrlEnvVars: profile.baseUrlEnvVars || [],
    local: options.local ?? LOCAL.has(id),
    fallbackModels: profile.fallbackModels || [],
    source: options.source || 'builtin',
    metadata: profile.metadata || {},
  };
  profiles.set(id, normalized);
  return normalized;
}

for (const [id, provider] of Object.entries(LLM.PROVIDERS || {})) {
  const aliases = (LLM.PROVIDER_ENV_ALIASES || {})[id] || {};
  registerProvider(id, {
    ...provider,
    envVars: aliases.apiKey || [`${id.toUpperCase().replace(/-/g, '_')}_API_KEY`],
    modelEnvVars: aliases.model || [`${id.toUpperCase().replace(/-/g, '_')}_MODEL`],
    baseUrlEnvVars: aliases.baseUrl || [`${id.toUpperCase().replace(/-/g, '_')}_BASE_URL`],
  });
}

function firstEnv(names = []) {
  for (const name of names) if (process.env[name]) return { name, value: process.env[name] };
  return null;
}

function getProvider(id) { return profiles.get(id) || null; }
function listProviders() { return [...profiles.values()].map(profile => ({ ...profile, configured: profile.local || !!firstEnv(profile.envVars) })); }

function resolveRuntime(request = {}) {
  const providerId = String(request.provider || process.env.LLM_PROVIDER || 'minimax').toLowerCase();
  const profile = getProvider(providerId);
  if (!profile) throw new Error(`unknown provider: ${providerId}`);
  const keyHit = request.apiKey ? { name: 'explicit', value: request.apiKey } : firstEnv(profile.envVars);
  if (!profile.local && !keyHit) throw new Error(`no credentials configured for provider: ${providerId}`);
  const modelHit = request.model ? { name: 'explicit', value: request.model } : firstEnv(profile.modelEnvVars);
  const urlHit = request.baseUrl ? { name: 'explicit', value: request.baseUrl } : firstEnv(profile.baseUrlEnvVars);
  const model = modelHit?.value || profile.defaultModel;
  const baseUrl = urlHit?.value || profile.baseUrl;
  if (!baseUrl) throw new Error(`no base URL configured for provider: ${providerId}`);
  return {
    provider: providerId,
    model: providerId === 'minimax' && /^MiniMax-M3$/i.test(model) ? 'MiniMax-M2.7' : model,
    apiMode: profile.apiMode,
    baseUrl,
    apiKey: keyHit?.value || (profile.local ? providerId : ''),
    authHeader: profile.authHeader,
    source: request.provider || request.model || request.baseUrl || request.apiKey ? 'explicit' : (modelHit || urlHit || keyHit ? 'environment' : 'default'),
    credentialSource: keyHit?.name || (profile.local ? 'local' : null),
    profile,
  };
}

function registerPlugin(id, profile) { return registerProvider(id, profile, { source: 'plugin', local: profile.local }); }

module.exports = { registerProvider, registerPlugin, getProvider, listProviders, resolveRuntime };
