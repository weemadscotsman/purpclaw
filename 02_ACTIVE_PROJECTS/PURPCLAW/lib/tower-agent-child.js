/**
 * tower-agent-child.js
 * =====================
 * Forked child process for each Agent Tower agent.
 * Receives run params over IPC, executes via AgentGateway,
 * streams events back to the parent tower process.
 *
 * Parent sends: { type: 'run', id, prompt, provider, model, role, opts }
 * Parent sends: { type: 'abort', id }
 * Parent sends: { type: 'ping' }
 * Child sends:  { type: 'event', id, event: { type, ... } }
 * Child sends:  { type: 'done', id, result: { content, toolCalls, turns, error } }
 * Child sends:  { type: 'pong', id }
 */

'use strict';

const { AgentGateway } = require('./agent-gateway');

const PURP_DIR = __dirname.startsWith('/e/god') ? '/e/god folder/02_ACTIVE_PROJECTS/PURPCLAW' : __dirname;

// Track in-flight run so we can abort it
let currentJob = null;
let currentController = null;

function send(msg) {
  process.send(msg);
}

process.on('message', async (msg) => {
  const { type, id } = msg;

  if (type === 'ping') {
    send({ type: 'pong', id });
    return;
  }

  if (type === 'abort') {
    if (currentController) {
      try { currentController.abort(); } catch (_) {}
      currentController = null;
    }
    currentJob = null;
    send({ type: 'done', id, result: { error: 'Aborted by parent', toolCalls: [], turns: 0 } });
    return;
  }

  if (type === 'run') {
    const { prompt, provider, model, role, opts = {} } = msg;

    try {
      const gateway = new AgentGateway({ cwd: PURP_DIR, provider, model });

      const toolEvents = [];

      gateway.on('tool.start', (event) => {
        send({ type: 'event', id, event: {
          type: 'tool-call',
          tool: event.tool,
          args: event.arguments,
        }});
      });

      gateway.on('tool.complete', (event) => {
        send({ type: 'event', id, event: {
          type: 'tool-result',
          tool: event.tool,
          ok: event.ok,
          result: event.result,
          error: event.error,
        }});
      });

      // Support AbortController for cancellation
      currentController = opts._signal || null;

      const result = await gateway.submit({
        prompt,
        provider,
        model,
        title: `Agent Tower: ${role}`,
        source: 'agent-tower',
        platform: 'agent-tower',
        role,
        auto_route: true,
        max_turns: opts.maxTurns || opts.max_turns || 10,
        max_tokens: opts.maxTokens || opts.max_tokens,
        temperature: opts.temperature,
        permission_profile: opts.permissionProfile || opts.permission_profile || 'autonomous',
        operator_initiated: false,
        cwd: PURP_DIR,
        // no_spine removed: see agent_tower.js — child agents do governed work
        // and must participate in the memory lifecycle too.
      });

      currentJob = null;
      currentController = null;

      send({ type: 'event', id, event: { type: 'token', content: result.message } });
      send({ type: 'done', id, result: {
        content: result.message,
        turns: result.turns || 0,
        toolCalls: toolEvents,
      }});

    } catch (err) {
      currentJob = null;
      currentController = null;
      send({ type: 'done', id, result: {
        error: err.message,
        content: '',
        toolCalls: [],
        turns: 0,
      }});
    }
    return;
  }
});

// Signal parent we're alive
process.send({ type: 'ready' });
