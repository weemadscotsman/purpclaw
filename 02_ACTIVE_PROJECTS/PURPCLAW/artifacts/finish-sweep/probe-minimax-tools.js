'use strict';
/**
 * Probe: reproduce the MiniMax "tool result's tool id() not found (2013)" 400
 * that forces agent_tower into one-shot fallback.
 *
 * Replays EXACTLY what lib/agent-loop.js sends:
 *   turn 1: system + user, tools enabled -> model emits structured tool-call
 *   turn 2: assistant(content with raw JSON) + user("[tool] result")
 *
 * Prints each request's message shapes (never the API key) and the response
 * status. Run: node artifacts/finish-sweep/probe-minimax-tools.js
 */
const llm = require('../../lib/llm-provider');

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'shell',
      description: 'Run a shell command',
      parameters: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] },
    },
  },
];

function describeMessages(msgs) {
  return msgs.map(m => ({
    role: m.role,
    hasToolCalls: Array.isArray(m.tool_calls),
    toolCallIds: Array.isArray(m.tool_calls) ? m.tool_calls.map(t => t.id) : undefined,
    toolCallId: m.tool_call_id,
    contentPreview: String(m.content || '').slice(0, 60),
  }));
}

async function collect(stream) {
  let text = '';
  const calls = [];
  for await (const c of stream) {
    if (c.type === 'tool-call') calls.push({ id: c.id, tool: c.tool, args: c.args });
    if (c.content) text += c.content;
  }
  return { text, calls };
}

(async () => {
  const base = [
    { role: 'system', content: 'You are a test probe. Use the shell tool when asked to list files.' },
    { role: 'user', content: 'List the files in the current directory. Use the shell tool.' },
  ];
  console.log('--- turn 1 request shapes:', JSON.stringify(describeMessages(base)));
  const t1 = await collect(llm.streamChat(base, { tools: TOOLS, maxTokens: 500 }));
  console.log('--- turn 1 result: text=', JSON.stringify(t1.text.slice(0, 80)), 'calls=', JSON.stringify(t1.calls));

  if (!t1.calls.length) { console.log('no tool call emitted; protocol not exercised'); return; }

  // Exactly what agent-loop line 300/332 sends on the follow-up:
  const follow = [
    ...base,
    { role: 'assistant', content: t1.text + t1.calls.map(c => JSON.stringify({ tool: c.tool, args: c.args })).join('\n') },
    { role: 'user', content: '[shell] file1.js\nfile2.js\nfile3.js' },
  ];
  console.log('--- turn 2 request shapes:', JSON.stringify(describeMessages(follow)));
  try {
    const t2 = await collect(llm.streamChat(follow, { tools: TOOLS, maxTokens: 500 }));
    console.log('--- turn 2 OK: text=', JSON.stringify(t2.text.slice(0, 120)), 'calls=', t2.calls.length);
  } catch (e) {
    console.log('--- turn 2 FAILED:', e.message.slice(0, 300));
  }
})().catch(e => { console.error('probe error:', e.message); process.exit(1); });
