import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/bridge — the single shared turn engine for PurpClaw Bridge (dual chat).
 *
 * Both panes (A and B) call THIS route. The only difference between them is the
 * `provider`/`model` in the body — so there is ONE engine, two faces, exactly
 * per the "one brain, many faces" rule. No second fake chat system.
 *
 * Providers:
 *   - nvidia   → NVIDIA NIM free endpoints (OpenAI-compatible, key from env)
 *   - openai   → api.openai.com
 *   - ollama   → local, no key (privacy / local-vs-cloud demo)
 *   - custom   → any OpenAI-compatible baseUrl
 *   - purpclaw → the local unified_api :7780 /api/chat — the REAL door.
 *                When that route is upgraded to agent-loop.runAgent, the
 *                bridge inherits tools/skills/memory with zero UI changes.
 *
 * Body: { provider, model, baseUrl?, messages:[{role,content}], maxTokens? }
 * Returns: { reply, model, provider } | { error }
 *
 * Modes (called from /api/bridge/{send,debate,critique,merge}):
 *   - 'send'    — A → B: send A's last message to B
 *   - 'debate'  — both answer, then critique each other, then summarize
 *   - 'critique'— one critiques the other's last output
 *   - 'merge'   — combine both outputs into one final answer
 *   - 'auto'    — let them talk for N turns (capped)
 *   - 'stop'    — kill any in-flight auto loop
 */

type Provider = 'nvidia' | 'openai' | 'ollama' | 'custom' | 'purpclaw';
type Mode = 'send' | 'debate' | 'critique' | 'merge' | 'auto' | 'stop' | 'turn';

interface ProviderCfg { baseUrl: string; keyEnv?: string; needsKey: boolean; }

const PROVIDERS: Record<Provider, ProviderCfg> = {
  nvidia:   { baseUrl: 'https://integrate.api.nvidia.com/v1', keyEnv: 'NVIDIA_API_KEY',  needsKey: true },
  openai:   { baseUrl: 'https://api.openai.com/v1',           keyEnv: 'OPENAI_API_KEY',  needsKey: true },
  ollama:   { baseUrl: 'http://127.0.0.1:11434/v1',           needsKey: false },
  custom:   { baseUrl: '',                                    keyEnv: 'LLM_API_KEY',     needsKey: false },
  purpclaw: { baseUrl: 'http://127.0.0.1:7780',               needsKey: false },
};

interface Msg { role: 'system' | 'user' | 'assistant'; content: string; }

interface TurnArgs {
  provider: Provider;
  model: string;
  baseUrl?: string;
  messages: Msg[];
  maxTokens?: number;
}

async function callOpenAICompatible(args: TurnArgs) {
  const cfg = PROVIDERS[args.provider];
  const baseUrl = (args.provider === 'custom' ? (args.baseUrl || '') : cfg.baseUrl).replace(/\/$/, '');
  if (!baseUrl) return { error: 'baseUrl required for custom provider' };
  if (cfg.needsKey && cfg.keyEnv && !process.env[cfg.keyEnv]) {
    return { error: `${cfg.keyEnv} not set on server` };
  }
  const key = cfg.keyEnv ? (process.env[cfg.keyEnv] || '') : '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      max_tokens: Math.min(Math.max(64, args.maxTokens || 1024), 4096),
      temperature: 0.6,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return { error: `provider ${res.status}: ${t.slice(0, 200)}` };
  }
  const j: any = await res.json().catch(() => null);
  const reply = j?.choices?.[0]?.message?.content;
  if (reply == null) return { error: `no reply: ${JSON.stringify(j).slice(0, 200)}` };
  return { reply, model: j?.model || args.model };
}

async function callPurpclaw(messages: Msg[]) {
  const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const res = await fetch('http://127.0.0.1:7780/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: lastUser, spawnAgents: false }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) return { error: `purpclaw :7780 → ${res.status}` };
  const j: any = await res.json().catch(() => null);
  const reply = j?.reply || j?.content || j?.message ||
    (Array.isArray(j?.responses) ? j.responses.map((r: any) => r.content || JSON.stringify(r)).join('\n') : null) ||
    JSON.stringify(j);
  return { reply, model: j?.model || 'purpclaw' };
}

export async function runTurn(args: TurnArgs): Promise<{ reply?: string; model?: string; error?: string }> {
  if (args.provider === 'purpclaw') {
    return callPurpclaw(args.messages);
  }
  return callOpenAICompatible(args);
}

// ── In-memory bridge session store (transient, per-process) ─────
const bridgeSessions = new Map<string, any>();

export function getBridgeSession(id: string) {
  return bridgeSessions.get(id);
}

export function setBridgeSession(id: string, state: any) {
  bridgeSessions.set(id, state);
}

export function clearBridgeSession(id: string) {
  bridgeSessions.delete(id);
}

function newSessionId() {
  return 'bridge-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// ── Main POST handler ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  const mode: Mode = (body.mode || 'turn') as Mode;

  // ── Mode: stop — cancel a bridge loop ─────────────────────
  if (mode === 'stop') {
    const id = body.sessionId;
    if (id && bridgeSessions.has(id)) {
      bridgeSessions.set(id, { ...bridgeSessions.get(id), stopped: true });
      return NextResponse.json({ ok: true, sessionId: id, stopped: true });
    }
    return NextResponse.json({ ok: true, stopped: false });
  }

  // ── Mode: turn — single chat turn (used by both panes) ─────
  if (mode === 'turn') {
    const provider = (body.provider || 'nvidia') as Provider;
    if (!PROVIDERS[provider]) {
      return NextResponse.json({ error: `unknown provider: ${provider}` }, { status: 400 });
    }
    const messages: Msg[] = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) return NextResponse.json({ error: 'messages required' }, { status: 400 });
    try {
      const r = await runTurn({ provider, model: body.model || 'meta/llama-3.3-70b-instruct', messages, maxTokens: body.maxTokens });
      return NextResponse.json({ ...r, provider, mode: 'turn' });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'bridge turn failed' }, { status: 500 });
    }
  }

  // ── Mode: send — A→B (or B→A) handoff ──────────────────────
  if (mode === 'send') {
    const sessionId = body.sessionId || newSessionId();
    const from = body.from as 'A' | 'B';
    const to = body.to as 'A' | 'B';
    const fromConfig = body.fromConfig; // { provider, model, baseUrl? }
    const toConfig = body.toConfig;
    const message = body.message;
    if (!fromConfig || !toConfig || !message) {
      return NextResponse.json({ error: 'send needs fromConfig, toConfig, message' }, { status: 400 });
    }
    try {
      const r = await runTurn({
        provider: toConfig.provider,
        model: toConfig.model,
        baseUrl: toConfig.baseUrl,
        messages: [
          { role: 'system', content: `You are Side ${to}. The other AI (Side ${from}) just said:\n\n"${message}"\n\nRespond thoughtfully.` },
        ],
        maxTokens: body.maxTokens || 1024,
      });
      if (r.reply) {
        const state = bridgeSessions.get(sessionId) || { history: [] };
        state.history.push({ from, to, message, reply: r.reply, ts: Date.now() });
        bridgeSessions.set(sessionId, state);
      }
      return NextResponse.json({ ...r, mode: 'send', sessionId });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'bridge send failed' }, { status: 500 });
    }
  }

  // ── Mode: debate — both answer, then critique each other, then summarize ─
  if (mode === 'debate') {
    const sessionId = body.sessionId || newSessionId();
    const aConfig = body.aConfig;
    const bConfig = body.bConfig;
    const prompt = body.prompt;
    const maxTurns = Math.min(body.maxTurns || 3, 5); // hard cap at 5
    if (!aConfig || !bConfig || !prompt) {
      return NextResponse.json({ error: 'debate needs aConfig, bConfig, prompt' }, { status: 400 });
    }
    const transcript: any[] = [];
    try {
      // Step 1: A answers
      const aReply = await runTurn({
        provider: aConfig.provider, model: aConfig.model, baseUrl: aConfig.baseUrl,
        messages: [{ role: 'system', content: `You are Side A. Argue FOR this proposal clearly and specifically.` },
                  { role: 'user', content: prompt }],
        maxTokens: body.maxTokens || 1024,
      });
      transcript.push({ side: 'A', role: 'argues-for', content: aReply.reply || '', error: aReply.error });

      // Step 2: B answers
      const bReply = await runTurn({
        provider: bConfig.provider, model: bConfig.model, baseUrl: bConfig.baseUrl,
        messages: [{ role: 'system', content: `You are Side B. Argue AGAINST this proposal clearly and specifically.` },
                  { role: 'user', content: prompt }],
        maxTokens: body.maxTokens || 1024,
      });
      transcript.push({ side: 'B', role: 'argues-against', content: bReply.reply || '', error: bReply.error });

      // Step 3: A critiques B (if turns allow)
      if (maxTurns >= 3) {
        const aCrit = await runTurn({
          provider: aConfig.provider, model: aConfig.model, baseUrl: aConfig.baseUrl,
          messages: [{ role: 'system', content: `You are Side A. Critique Side B's argument briefly. Be specific.` },
                    { role: 'user', content: `Original prompt: ${prompt}\n\nSide B said: ${bReply.reply || '(no response)'}` }],
          maxTokens: Math.min(body.maxTokens || 1024, 512),
        });
        transcript.push({ side: 'A', role: 'critique', content: aCrit.reply || '', error: aCrit.error });
      }

      // Step 4: B critiques A (if turns allow)
      if (maxTurns >= 4) {
        const bCrit = await runTurn({
          provider: bConfig.provider, model: bConfig.model, baseUrl: bConfig.baseUrl,
          messages: [{ role: 'system', content: `You are Side B. Critique Side A's argument briefly. Be specific.` },
                    { role: 'user', content: `Original prompt: ${prompt}\n\nSide A said: ${aReply.reply || '(no response)'}` }],
          maxTokens: Math.min(body.maxTokens || 1024, 512),
        });
        transcript.push({ side: 'B', role: 'critique', content: bCrit.reply || '', error: bCrit.error });
      }

      // Step 5: summary (always)
      const summary = await runTurn({
        provider: aConfig.provider, model: aConfig.model, baseUrl: aConfig.baseUrl,
        messages: [{ role: 'system', content: `You are a neutral summarizer. Combine the FOR/AGAINST debate and critiques into a single balanced recommendation. Be specific and actionable.` },
                  { role: 'user', content: transcript.map(t => `[${t.side}/${t.role}]\n${t.content}`).join('\n\n') }],
        maxTokens: Math.min(body.maxTokens || 1024, 1024),
      });
      transcript.push({ side: 'merge', role: 'summary', content: summary.reply || '', error: summary.error });

      bridgeSessions.set(sessionId, { transcript, ts: Date.now() });
      return NextResponse.json({ mode: 'debate', sessionId, transcript, summary: summary.reply });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'bridge debate failed' }, { status: 500 });
    }
  }

  // ── Mode: critique — one critiques the other ───────────────
  if (mode === 'critique') {
    const sessionId = body.sessionId || newSessionId();
    const criticConfig = body.criticConfig;
    const targetConfig = body.targetConfig;
    const targetOutput = body.targetOutput;
    const originalPrompt = body.originalPrompt || '';
    if (!criticConfig || !targetOutput) {
      return NextResponse.json({ error: 'critique needs criticConfig + targetOutput' }, { status: 400 });
    }
    try {
      const r = await runTurn({
        provider: criticConfig.provider, model: criticConfig.model, baseUrl: criticConfig.baseUrl,
        messages: [
          { role: 'system', content: 'You are a critical reviewer. Identify concrete flaws, missing considerations, or improvements. Be specific and actionable.' },
          { role: 'user', content: `Original prompt: ${originalPrompt}\n\nOther AI's response:\n${targetOutput}\n\nCritique this response.` },
        ],
        maxTokens: 1024,
      });
      bridgeSessions.set(sessionId, { critique: r.reply, ts: Date.now() });
      return NextResponse.json({ ...r, mode: 'critique', sessionId });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'bridge critique failed' }, { status: 500 });
    }
  }

  // ── Mode: merge — combine two outputs into one final answer ─
  if (mode === 'merge') {
    const sessionId = body.sessionId || newSessionId();
    const mergerConfig = body.mergerConfig;
    const aOutput = body.aOutput;
    const bOutput = body.bOutput;
    const originalPrompt = body.originalPrompt || '';
    if (!mergerConfig || !aOutput || !bOutput) {
      return NextResponse.json({ error: 'merge needs mergerConfig, aOutput, bOutput' }, { status: 400 });
    }
    try {
      const r = await runTurn({
        provider: mergerConfig.provider, model: mergerConfig.model, baseUrl: mergerConfig.baseUrl,
        messages: [
          { role: 'system', content: 'You are a merger. Combine the two responses below into one final answer that captures the best of both. Be specific and actionable.' },
          { role: 'user', content: `Original prompt: ${originalPrompt}\n\nResponse A:\n${aOutput}\n\nResponse B:\n${bOutput}\n\nFinal merged answer:` },
        ],
        maxTokens: 2048,
      });
      bridgeSessions.set(sessionId, { merged: r.reply, ts: Date.now() });
      return NextResponse.json({ ...r, mode: 'merge', sessionId });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'bridge merge failed' }, { status: 500 });
    }
  }

  // ── Mode: auto — multi-turn loop with stop support ────────
  if (mode === 'auto') {
    const sessionId = body.sessionId || newSessionId();
    const aConfig = body.aConfig;
    const bConfig = body.bConfig;
    const prompt = body.prompt;
    const maxTurns = Math.min(body.maxTurns || 3, 5);
    if (!aConfig || !bConfig || !prompt) {
      return NextResponse.json({ error: 'auto needs aConfig, bConfig, prompt' }, { status: 400 });
    }
    const state = { transcript: [], stopped: false, ts: Date.now() };
    bridgeSessions.set(sessionId, state);
    const transcript: any[] = [];
    try {
      for (let i = 0; i < maxTurns; i++) {
        // Check stop flag
        if (bridgeSessions.get(sessionId)?.stopped) break;
        const side = (i % 2 === 0) ? 'A' : 'B';
        const cfg = (side === 'A') ? aConfig : bConfig;
        const lastOther = transcript[transcript.length - 1];
        const messages: Msg[] = [{ role: 'system', content: `You are Side ${side} in a 2-AI conversation. Respond to what was just said. Be specific.` }];
        if (lastOther) {
          messages.push({ role: 'user', content: `Side ${lastOther.side} said:\n${lastOther.content}\n\nYour turn.` });
        } else {
          messages.push({ role: 'user', content: prompt });
        }
        const r = await runTurn({ provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl, messages, maxTokens: 1024 });
        const turn = { side, content: r.reply || '', error: r.error, turn: i + 1 };
        transcript.push(turn);
        state.transcript = transcript;
        bridgeSessions.set(sessionId, state);
        if (r.error) break;
      }
      return NextResponse.json({ mode: 'auto', sessionId, transcript, stopped: !!state.stopped });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'bridge auto failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `unknown mode: ${mode}` }, { status: 400 });
}

// GET /api/bridge/session/:id — inspect bridge state
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parts = url.pathname.split('/');
  const id = parts[parts.length - 1];
  const state = bridgeSessions.get(id);
  if (!state) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ sessionId: id, state });
}
