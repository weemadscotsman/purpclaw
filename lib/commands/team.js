'use strict';

/**
 * lib/commands/team.js — `purpclaw team ...` CLI command
 *
 * Prompts 5/6/7 front door. Spawns the 4-role team:
 *   - /analyst   — research, trends, sourcing
 *   - /writer    — writing, editing, content shaping
 *   - /marketer  — marketing, growth, campaigns
 *   - /coder     — development, automation, integration
 *   - /pipeline  — full Analyst -> Writer -> Marketer flow
 *   - /who       — team overview
 *
 * When the user types "purpclaw team run <topic>" or "/pipeline <topic>",
 * the team-router runs all 3 stages sequentially with fresh LLM calls.
 */

const http = require('http');
const path = require('path');

function httpJSON(method, port, path, body, timeoutMs = 180000) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: '127.0.0.1', port, path, method,
      headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {},
      timeout: timeoutMs,
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: null }); }
      });
    });
    req.on('error', e => resolve({ status: 0, body: { error: e.message } }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: { error: 'timeout' } }); });
    if (data) req.write(data);
    req.end();
  });
}

/**
 * Call the unified_api /api/chat endpoint. The chat handler builds its own
 * system prompt, so we fold the role persona into the user message via
 * a system: prefix that the agent loop respects.
 */
async function callAgent(systemPrompt, userPrompt, opts) {
  const port = opts.port || 7780;
  const provider = opts.provider || 'minimax';
  const model = opts.model || 'MiniMax-M3';
  const t0 = Date.now();
  // Fold the system prompt into the user message as a [system: ...] prefix
  // because the chat handler doesn't accept a separate system field.
  const message = `[system instructions: ${systemPrompt}]\n\n${userPrompt}`;
  const r = await httpJSON('POST', port, '/api/chat', {
    message,
    provider, model,
  });
  if (r.status !== 200 || !r.body || !r.body.ok) {
    throw new Error(`chat failed: ${r.status} ${r.body && r.body.error || 'unknown'}`);
  }
  return { reply: r.body.reply || '', model: r.body.model || model, durationMs: Date.now() - t0 };
}

async function run(args = []) {
  const router = require('../team-router');
  const sub = (args[0] || '').toLowerCase();
  const tail = args.slice(1).join(' ').trim();

  // /who
  if (sub === 'who' || sub === '' && (args.length === 0 || tail === '')) {
    console.log(router.teamOverview());
    return 0;
  }

  // /pipeline <topic>  or  team run <topic>
  if (sub === 'pipeline' || (sub === 'run' && tail)) {
    const topic = (sub === 'pipeline' ? tail : tail).trim();
    if (!topic) {
      console.log('  Usage: purpclaw team pipeline <topic>');
      return 1;
    }
    console.log(`[team] running full pipeline: Analyst -> Writer -> Marketer`);
    console.log(`[team] topic: "${topic}"`);
    console.log('');
    const result = await router.runPipeline(topic, {
      provider: 'minimax', model: 'MiniMax-M3',
      log: (s) => console.log(`  ${s}`),
      run: async ({ systemPrompt, userPrompt, role, label }) => {
        const out = await callAgent(systemPrompt, userPrompt, {});
        return out.reply;
      },
    });
    console.log('');
    console.log('═'.repeat(72));
    console.log(`Pipeline complete. ${result.stages.length} stages. ${result.totalMs}ms total.`);
    console.log('');
    for (const s of result.stages) {
      console.log(`── ${s.label} (${s.role}) — ${s.durationMs}ms, ${s.output.length} chars ──`);
      console.log(s.output);
      console.log('');
    }
    console.log('═'.repeat(72));
    console.log('FINAL PROMOTION PLAN');
    console.log('═'.repeat(72));
    console.log(result.finalPlan);
    return 0;
  }

  // /<role> <topic>  or  team <role> <topic>  or  natural-language phrase
  if (sub && tail) {
    // If first arg is a known role, treat the rest as the topic
    const knownRoles = ['analyst', 'writer', 'marketer', 'coder'];
    let role = null;
    let topic = '';
    if (knownRoles.includes(sub)) {
      role = sub;
      topic = tail;
    } else {
      // Try the natural-language router
      const r = router.route([sub, tail].join(' '));
      if (r.intent === 'fallback') {
        console.log(r.question);
        return 1;
      }
      role = r.role;
      topic = r.topic || tail;
    }
    if (!role) {
      console.log('  Could not route this. Try /analyst, /writer, /marketer, /coder, /pipeline.');
      return 1;
    }
    console.log(`[team] routing to /${role} — topic: "${topic}"`);
    const roleInfo = router.ROUTING_TABLE[role];
    const systemPrompt = `You are the ${role} on a 4-role content team. ` +
      `Owner: Eddie. ` +
      `Colleagues: ${Object.keys(router.ROUTING_TABLE).join(', ')}. ` +
      `Your area: ${roleInfo.description}`;
    const userPrompt = `Topic: ${topic}\n\nDeliver your best ${role} output for this. Be specific, cite sources, be useful.`;
    const out = await callAgent(systemPrompt, userPrompt, {});
    console.log('');
    console.log(`── /${role} (${out.durationMs}ms) ──`);
    console.log(out.reply);
    return 0;
  }

  // /who / /pipeline / etc. with no arg
  console.log(router.teamOverview());
  return 0;
}

module.exports = { run };
