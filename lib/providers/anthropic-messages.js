'use strict';
/**
 * lib/providers/anthropic-messages.js — Anthropic Messages API driver.
 *
 * Implements the canonical ProviderAdapter contract (see types.ts).
 * Emits structured events: { type: 'token' | 'tool_call' | 'usage' | 'done' | 'error' }.
 *
 * Auth: either x-api-key or Authorization: Bearer + anthropic-version header.
 * Tools: emitted via content_block_start (tool_use) events.
 * See deep-research-report §"Add an Anthropic Messages adapter".
 */

const DEFAULT_BASE = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';

function buildHeaders(input) {
  const apiKey = input.apiKey || process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('anthropic_messages: missing apiKey (set ANTHROPIC_API_KEY or LLM_API_KEY)');
  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': ANTHROPIC_VERSION,
    ...(input.extraHeaders || {}),
  };
  // Either x-api-key or Bearer. Default to x-api-key for static keys.
  if (input.authType === 'bearer' || apiKey.startsWith('sk-ant-oat') || apiKey.includes('.')) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else {
    headers['x-api-key'] = apiKey;
  }
  return headers;
}

async function* anthropicMessagesDriver(input) {
  const baseUrl = input.baseUrl || DEFAULT_BASE;
  let headers;
  try { headers = buildHeaders(input); } catch (e) {
    yield { type: 'error', code: 'auth_missing', message: e.message };
    return;
  }

  // Convert messages: drop system from messages array, send as top-level system
  const msgs = (input.messages || []).filter((m) => m.role !== 'system');
  const systemMsg = (input.messages || []).find((m) => m.role === 'system');

  const tools = (input.tools || []).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));

  const body = {
    model: input.model,
    max_tokens: input.maxTokens || 4096,
    messages: msgs,
    stream: true,
  };
  if (systemMsg) body.system = typeof systemMsg.content === 'string' ? systemMsg.content : systemMsg.content;
  if (tools.length) body.tools = tools;

  let res;
  try {
    res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(input.timeoutMs || 60_000),
    });
  } catch (e) {
    yield { type: 'error', code: 'fetch_failed', message: e.message };
    return;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const retryAfter = Number(res.headers.get('retry-after') || 0);
    const errMsg = text.slice(0, 400);
    yield {
      type: 'error',
      code: `http_${res.status}`,
      message: errMsg,
      retryAfterMs: retryAfter > 0 ? retryAfter * 1000 : undefined,
    };
    return;
  }
  if (!res.body) {
    yield { type: 'error', code: 'no_body', message: 'no response body' };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  // Track tool blocks by index so content_block_stop can pair up the final input
  const blockByIndex = new Map();
  let finalModel = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';

    for (const frame of frames) {
      const eventLine = frame.split('\n').find((l) => l.startsWith('event: '));
      const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!eventLine || !dataLine) continue;
      const eventName = eventLine.slice(7).trim();
      let payload;
      try { payload = JSON.parse(dataLine.slice(6)); } catch { continue; }

      if (eventName === 'content_block_start' && payload.content_block?.type === 'tool_use') {
        blockByIndex.set(payload.index, {
          id: payload.content_block.id,
          name: payload.content_block.name,
          inputJson: '',
        });
      } else if (eventName === 'content_block_delta') {
        const blk = blockByIndex.get(payload.index);
        if (blk && payload.delta?.type === 'input_json_delta' && payload.delta.partial_json) {
          blk.inputJson += payload.delta.partial_json;
        } else if (payload.delta?.type === 'text_delta' && payload.delta.text) {
          yield { type: 'token', text: payload.delta.text };
        }
      } else if (eventName === 'content_block_stop') {
        const blk = blockByIndex.get(payload.index);
        if (blk) {
          let args = {};
          try { args = blk.inputJson ? JSON.parse(blk.inputJson) : {}; } catch {}
          yield {
            type: 'tool_call',
            call: { id: blk.id, name: blk.name, args },
          };
          blockByIndex.delete(payload.index);
        }
      } else if (eventName === 'message_delta' && payload.usage) {
        yield {
          type: 'usage',
          inputTokens: payload.usage.input_tokens,
          outputTokens: payload.usage.output_tokens,
          totalTokens: (payload.usage.input_tokens || 0) + (payload.usage.output_tokens || 0),
        };
      } else if (eventName === 'message_start' && payload.message) {
        finalModel = payload.message.model || finalModel;
      } else if (eventName === 'message_stop') {
        yield { type: 'done', model: finalModel };
        return;
      } else if (eventName === 'error') {
        yield { type: 'error', code: 'stream_error', message: payload.error?.message || 'stream error' };
      }
    }
  }
  yield { type: 'done', model: finalModel };
}

module.exports = {
  name: 'anthropic_messages',
  streamMode: 'sse',
  authType: 'x-api-key',
  streamRun: anthropicMessagesDriver,
  healthCheck: async () => {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY;
      if (!apiKey) return { ok: false, detail: 'no key' };
      const res = await fetch(`${DEFAULT_BASE}/v1/models`, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
        signal: AbortSignal.timeout(3000),
      });
      return { ok: res.ok, detail: res.status };
    } catch (e) {
      return { ok: false, detail: e.message };
    }
  },
};
