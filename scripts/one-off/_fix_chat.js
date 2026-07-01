const fs = require('fs');
const p = 'unified_api.js';
let s = fs.readFileSync(p, 'utf8');
const NL = s.includes('\r\n') ? '\r\n' : '\n';

// Locate the broken section by searching for its START and END markers
const startMarker = "      if ((req.headers['accept'] || '').includes('text/event-stream')) {" + NL +
                   "        return handleChatStream(req, res);" + NL +
                   "      }" + NL +
                   "      try {";

const endMarker = "      } catch (e) { return sendJson(res, 500, { error: e.message }); }" + NL +
                 "    }" + NL +
                 NL +
                 "    if (pathname === '/api/tower/spawn' && method === 'POST')";

const startIdx = s.indexOf(startMarker);
const endIdx = s.indexOf(endMarker);
console.log('  startIdx:', startIdx, 'endIdx:', endIdx);
if (startIdx < 0 || endIdx < 0) {
  console.log('  markers not found');
  process.exit(1);
}

// Build the replacement
const replacement = `      if ((req.headers['accept'] || '').includes('text/event-stream')) {
        return handleChatStream(req, res);
      }
      try {
        const body = await parseBody(req);
        const { message, spawnAgents = true, sessionId, provider, model, lane } = body;
        if (!message) return sendJson(res, 400, { error: 'message required' });

        // v2.1 — Lifecycle flow: called → routed → executed → watched → stopped → logged → verified → repaired → archived.
        const { announce } = require('./lib/events');
        const flow = announce.flow;
        const flowStart = Date.now();
        const flowTags = { sessionId: sessionId || null, provider: provider || null, model: model || null };
        flow.called('chat', { ...flowTags, msgLen: message.length });

        // Auto provider routing + buttery fallback — same one engine as SSE/CLI/TUI.
        const { runAgentRouted } = require('./lib/agent-router');
        let fullReply = '';
        let modelName = '';
        let toolCalls = [];
        const errors = [];
        let flowRoutedAnnounced = false;

        for await (const ev of runAgentRouted({
          prompt: message,
          model, provider, lane,
          opts: { maxTokens: 2048, temperature: 0.7, sessionId },
        })) {
          if (ev.type === 'route') {
            modelName = ev.model || modelName;
            if (!flowRoutedAnnounced) {
              flow.routed(ev.provider || provider || 'auto', ev.model || model || 'auto', { ...flowTags, via: ev.via || null, attempts: ev.attempts || 1 });
              flowRoutedAnnounced = true;
            }
          } else if (ev.type === 'token') {
            fullReply += ev.content;
            modelName = ev.model || modelName;
          } else if (ev.type === 'tool-call') {
            toolCalls.push({ tool: ev.tool, args: ev.args });
            flow.executed('tool-call', { ...flowTags, tool: ev.tool, args: ev.args });
          } else if (ev.type === 'tool-result') {
            flow.watched('tool-result', { ...flowTags, tool: ev.tool, ok: ev.ok !== false });
          } else if (ev.type === 'error') {
            errors.push(ev.error);
          } else if (ev.type === 'done') {
            break;
          }
        }

        flow.stopped(errors.length === 0, { ...flowTags, model: modelName, toolCount: toolCalls.length, durationMs: Date.now() - flowStart });
        flow.logged('events.jsonl', { ...flowTags, replyLen: fullReply.length, toolCount: toolCalls.length });

        let cleanedReply = fullReply
          .replace(/<think>[\\s\\S]*?<\\/think>/gi, '')
          .replace(/\\{\\s*"tool"\\s*:\\s*"[^"]+"\\s*,\\s*"args"\\s*:\\s*\\{[\\s\\S]*?\\}\\s*\\}/g, '')
          .replace(/<[^>]*?DSML[^>]*?>[\\s\\S]*<\\/[^>]*?DSML[^>]*?>/g, '')
          .replace(/<\\/?[^>]*?DSML[^>]*?>/g, '')
          .replace(/\\n{3,}/g, '\\n\\n')
          .trim();

        // Flow stage 7: VERIFIED
        const verifications = [];
        if (cleanedReply && cleanedReply.length > 0) verifications.push('reply_present');
        if (modelName) verifications.push('model_named');
        if (toolCalls.every(c => c.tool && typeof c.tool === 'string')) verifications.push('tools_well_formed');
        flow.verified('chat', { ...flowTags, checks: verifications, ok: verifications.length >= 2 });

        // Flow stage 8: REPAIRED
        if (errors.length || !cleanedReply) {
          flow.repaired('chat-empty-or-error', { ...flowTags, errors: errors.length, replyLen: (cleanedReply||'').length });
        }

        // Flow stage 9: ARCHIVED
        flow.archived('chat', { ...flowTags, sinks: ['trace.jsonl', 'notifications.jsonl'], totalMs: Date.now() - flowStart });

        return sendJson(res, 200, {
          ok: true,
          reply: cleanedReply,
          model: modelName,
          tool_calls: toolCalls,
          errors: errors.length > 0 ? errors : undefined,
          turns: toolCalls.length > 0 ? 'multi-turn' : 'single',
          sessionId: sessionId || null,
        });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
`;

const before = s.substring(0, startIdx);
const after = s.substring(endIdx + "      } catch (e) { return sendJson(res, 500, { error: e.message }); }\r\n    }".length + 2);
fs.writeFileSync(p, before + replacement + after);
console.log('  replaced');