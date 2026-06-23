'use strict';
/**
 * lib/providers/registry.js — Provider driver registry.
 *
 * Maps provider id to driver implementation. llm-provider.js dispatches
 * to the right driver via this registry. Adding a new provider means
 * adding a new driver file and one line here.
 *
 * The shape of each driver is:
 *   { name, streamMode, authType, streamRun(input), healthCheck() }
 *
 * streamRun is an async generator that yields canonical events:
 *   { type: 'token'|'tool_call'|'usage'|'done'|'error', ...payload }
 *
 * See lib/providers/types.ts for the canonical contracts.
 */

const openai = require('./openai-responses');
const anthropic = require('./anthropic-messages');
const hermes = require('./hermes-cli');

// Each driver registers itself with the aliases it can serve.
// v2.1 — driver aliases are now STRICT. The openai driver uses
// `/v1/responses` (OpenAI's structured-output endpoint). Most OpenAI-
// compatible providers (nvidia, openrouter, huggingface, together, mistral,
// ollama, etc.) speak `/v1/chat/completions` — the legacy chat() path
// handles them correctly via resolveConfig() with their own baseUrl.
// Aliasing them here routed nvapi- keys to api.openai.com, which 401s.
//
// Keep the openai driver for OpenAI family only.
const DRIVERS = [
  { ...openai,     aliases: ['openai', 'gpt-4o', 'gpt-4o-mini', 'openai-responses'] },
  { ...anthropic,  aliases: ['anthropic', 'claude', 'claude-sonnet', 'anthropic-messages'] },
  { ...hermes,     aliases: ['hermes', 'hermes-cli', 'nous-hermes'] },
];

function findDriver(providerId) {
  if (!providerId) return null;
  const id = providerId.toLowerCase();
  for (const d of DRIVERS) {
    if (d.name === id || d.aliases?.includes(id)) return d;
  }
  return null;
}

function listDrivers() {
  return DRIVERS.map((d) => ({ name: d.name, aliases: d.aliases, streamMode: d.streamMode, authType: d.authType }));
}

module.exports = { DRIVERS, findDriver, listDrivers };
