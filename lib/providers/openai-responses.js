'use strict';
/**
 * lib/providers/openai-responses.js — OpenAI Responses API driver.
 *
 * Implements the canonical ProviderAdapter contract (see types.ts).
 * Emits structured { type: 'token' | 'tool_call' | 'usage' | 'done' | 'error' } events.
 *
 * Uses /v1/responses (the new structured protocol), not legacy /chat/completions.
 * Supports tool calling via response.output_item.added (function_call).
 *
 * See deep-research-report §"Add an OpenAI Responses adapter".
 */

const DEFAULT_BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

async function* openAIResponsesDriver(input) {
  const baseUrl = input.baseUrl || DEFAULT_BASE;
  const apiKey = input.apiKey || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('openai_responses: missing apiKey (set OPENAI_API_KEY or LLM_API_KEY)');

  const tools = (input.tools || []).map((t) => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
    strict: t.strict !== false,
  }));

  let res;
  try {
    res = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(input.extraHeaders || {}),
      },
      body: JSON.stringify({
        model: input.model,
        input: input.messages || [],
        tools,
        tool_choice: input.toolChoice || 'auto',
        parallel_tool_calls: true,
        stream: true,
      }),
      signal: AbortSignal.timeout(input.timeoutMs || 60_000),
    });
  } catch (e) {
    yield { type: 'error', code: 'fetch_failed', message: e.message };
    return;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    yield { type: 'error', code: `http_${res.status}`, message: text.slice(0, 400) };
    return;
  }
  if (!res.body) {
    yield { type: 'error', code: 'no_body', message: 'no response body' };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalUsage = null;
  let finalModel = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';

    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') {
        if (finalUsage) yield { type: 'usage', ...finalUsage };
        yield { type: 'done', model: finalModel };
        return;
      }
      let event;
      try { event = JSON.parse(payload); } catch { continue; }

      if (event.type === 'response.output_text.delta' && event.delta) {
        yield { type: 'token', text: event.delta };
      } else if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') {
        // Tool call detected via structured event — no regex required
        let args = {};
        try { args = event.item.arguments ? JSON.parse(event.item.arguments) : {}; } catch {}
        yield {
          type: 'tool_call',
          call: {
            id: event.item.call_id || event.item.id,
            name: event.item.name,
            args,
          },
        };
      } else if (event.type === 'response.completed' && event.response) {
        finalModel = event.response.model || finalModel;
        if (event.response.usage) {
          finalUsage = {
            inputTokens: event.response.usage.input_tokens,
            outputTokens: event.response.usage.output_tokens,
            totalTokens: event.response.usage.total_tokens,
          };
        }
      } else if (event.type === 'response.error' || event.type === 'error') {
        yield { type: 'error', code: event.code || 'response_error', message: event.message || 'response error' };
      }
    }
  }
  if (finalUsage) yield { type: 'usage', ...finalUsage };
  yield { type: 'done', model: finalModel };
}

module.exports = {
  name: 'openai_responses',
  streamMode: 'sse',
  authType: 'bearer',
  streamRun: openAIResponsesDriver,
  healthCheck: async () => {
    try {
      const res = await fetch(`${DEFAULT_BASE}/models`, {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || ''}` },
        signal: AbortSignal.timeout(3000),
      });
      return { ok: res.ok, detail: res.status };
    } catch (e) {
      return { ok: false, detail: e.message };
    }
  },
};
