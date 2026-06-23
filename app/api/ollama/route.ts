import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
// R5 fix: /api/ollama POST chats with a local LLM and POST might proxy
// arbitrary URLs. Gate with operator auth + 30/min rate limit.
import { checkOperator } from '../_lib/operator-auth';
import { checkRateLimit } from '../_lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const execAsync = promisify(exec);

// Discover Ollama on the host. Try common endpoints + a CLI probe so we
// work whether Ollama is on the user's box OR a server on the LAN.
const OLLAMA_HOSTS = [
  process.env.OLLAMA_HOST?.replace(/\/v1\/?$/, '').replace(/\/+$/, '') || 'http://localhost:11434',
  'http://127.0.0.1:11434',
  'http://localhost:11434',
];

async function probeOllama(): Promise<{ url: string; models: any[] } | null> {
  // Try the /api/tags endpoint on each candidate host in parallel
  const results = await Promise.allSettled(
    OLLAMA_HOSTS.map(async (url) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      try {
        const r = await fetch(`${url}/api/tags`, { signal: ctrl.signal });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const data = await r.json();
        return { url, models: Array.isArray(data?.models) ? data.models : [] };
      } finally {
        clearTimeout(timer);
      }
    })
  );
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.models.length >= 0) {
      // Even zero models is OK — Ollama is up, just no models installed
      return r.value;
    }
  }
  return null;
}

async function probeOllamaCLI(): Promise<{ url: string; models: any[] } | null> {
  // Fallback: ask the Ollama CLI directly. Useful when HTTP is firewalled
  // but the daemon is on the same machine.
  const candidates = [
    process.env.OLLAMA_PATH,
    'C:/Users/Admin/AppData/Local/Programs/Ollama/ollama',
    '/c/Users/Admin/AppData/Local/Programs/Ollama/ollama',
    '/usr/local/bin/ollama',
    '/usr/bin/ollama',
    'ollama',
  ].filter(Boolean) as string[];

  for (const path of candidates) {
    try {
      const { stdout } = await execAsync(`"${path}" list 2>&1`);
      if (!stdout) continue;
      const lines = stdout.trim().split('\n').slice(1); // drop header
      const models = lines
        .map(l => l.trim().split(/\s+/)[0])
        .filter(Boolean)
        .map(name => ({ name, model: name, source: 'cli' }));
      if (models.length > 0) {
        return { url: 'http://localhost:11434', models };
      }
    } catch {
      // try next
    }
  }
  return null;
}

export async function GET(_req: NextRequest) {
  try {
    let probe = await probeOllama();
    if (!probe) probe = await probeOllamaCLI();

    if (!probe) {
      return NextResponse.json({
        ok: false,
        available: false,
        error: 'ollama_not_running',
        hint: 'Install Ollama (https://ollama.com) and start it with `ollama serve`',
        models: [],
      });
    }

    // Normalize models — only chat-capable ones (skip pure embedding models)
    const chatModels = probe.models
      .filter((m: any) => {
        const caps = Array.isArray(m?.capabilities) ? m.capabilities : [];
        // Keep models that have completion capability (or no capability list = default to chat)
        if (caps.length === 0) return true;
        return caps.includes('completion') || caps.includes('chat') || caps.includes('tools');
      })
      .map((m: any) => ({
        name: m.name,
        family: m.details?.family || m.model?.split(':')[0] || m.name.split(':')[0],
        parameter_size: m.details?.parameter_size || '',
        context_length: m.details?.context_length || 0,
        quantization: m.details?.quantization_level || '',
        size_bytes: m.size || 0,
        source: 'ollama',
        url: probe.url,
      }));

    return NextResponse.json({
      ok: true,
      available: true,
      url: probe.url,
      models: chatModels,
      total_count: probe.models.length,
      chat_count: chatModels.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, available: false, error: e?.message || String(e), models: [] },
      { status: 500 }
    );
  }
}

// POST = chat directly to Ollama. Used by the dashboard chat when the user
// picks a local model. Streams back tokens in our own SSE format so the
// existing /api/chat UI pipeline can render it without changes.
export async function POST(req: NextRequest) {
  // R5 fix: ollama POST is a token-burn surface. Gate with operator auth
  // + 30/min rate limit so a LAN caller can't burn local CPU/GPU.
  const auth = checkOperator(req);
  if (!auth.ok) return auth.response;
  const limitado = checkRateLimit(req, 'ollama', 30);
  if (limitado) return limitado;
  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const model = (body?.model || '').toString();
  const message = (body?.message || body?.prompt || '').toString().trim();
  const history = Array.isArray(body?.history) ? body.history : [];
  const host = (body?.host || OLLAMA_HOSTS[0]).toString().replace(/\/+$/, '');

  if (!model) return new Response(JSON.stringify({ ok: false, error: 'no_model' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (!message) return new Response(JSON.stringify({ ok: false, error: 'empty_message' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const messages = [
    ...history.map((m: any) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  const upstream = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(JSON.stringify({ ok: false, error: 'upstream_error', status: upstream.status }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  const encoder = new TextEncoder();
  const ctrl = new AbortController();
  const stream = new ReadableStream({
    async start(controller) {
      const keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keepalive\n\n')); } catch {}
      }, 15_000);
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          // Ollama sends NDJSON: one JSON object per line
          for (const line of chunk.split('\n').filter(Boolean)) {
            try {
              const evt = JSON.parse(line);
              if (evt?.error) {
                controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: evt.error })}\n\n`));
                continue;
              }
              const content = evt?.message?.content;
              if (content) {
                controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify({ content, model, source: 'ollama' })}\n\n`));
              }
              if (evt?.done) {
                controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ reply: content || '', model, source: 'ollama', done: true })}\n\n`));
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      } catch (e: any) {
        try { controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: e?.message || String(e) })}\n\n`)); } catch {}
      } finally {
        clearInterval(keepalive);
        try { controller.close(); } catch {}
        try { reader.releaseLock(); } catch {}
      }
    },
    cancel() { try { ctrl.abort(); } catch {} },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
