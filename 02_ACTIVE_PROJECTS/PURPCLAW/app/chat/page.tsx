'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * /chat â€” dedicated chat surface for PURPCLAW.
 *
 * Round 3: real WebUI parity. Uses /api/chat SSE stream from unified_api
 * :7780. Falls back to /api/chat (JSON) if SSE unavailable.
 *
 * Layout:
 *   - Header with statusline: provider, model, session id, cost so far
 *   - Message log: streaming tokens render in real time
 *   - Input box: Enter to send, Shift+Enter for newline
 *   - Tool-call cards: rendered inline as the agent invokes tools
 *   - Bottom: session controls (new, resume list, replay)
 *
 * This page exists because /mission is a multi-tab cockpit and a
 * dedicated chat surface is needed for users who just want to talk
 * to the agent without the surrounding UI chrome.
 */

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  ts: number;
  toolName?: string;
  toolArgs?: any;
  toolOk?: boolean;
  streaming?: boolean;
}

const API_PORT = Number(process.env.NEXT_PUBLIC_API_PORT || 7780);
const API_BASE = ''; // same-origin Next /api/* (gateway fallback). Dead :7780 was why this page looked offline.

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [provider, setProvider] = useState('auto');
  const [model, setModel] = useState('auto');
  const [cost, setCost] = useState(0);
  const [tokens, setTokens] = useState({ prompt: 0, completion: 0 });
  const [connected, setConnected] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Probe API on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/health`).then(r => r.json()).then(h => {
      setConnected(!!(h.online || h.ok));
      if (h.provider) setProvider(h.provider);
      if (h.model) setModel(h.model);
    }).catch(() => setConnected(false));
  }, []);

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    const userMsg: ChatMessage = { id: 'u-' + Date.now(), role: 'user', content: text, ts: Date.now() };
    setMessages(m => [...m, userMsg]);

    const assistantId = 'a-' + Date.now();
    setMessages(m => [...m, { id: assistantId, role: 'assistant', content: '', ts: Date.now(), streaming: true }]);
    setStreaming(true);

    try {
      abortRef.current = new AbortController();
      const resp = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: sessionId, provider, model, stream: false }),
        signal: abortRef.current.signal,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      // `reply` is the field the unified API actually returns
      // ({ok, state, envelopeId, reply, ...}). It was missing from this chain,
      // so a successful 200 with a real answer rendered as "(no response)".
      // Also strip <think> blocks so reasoning never reaches the user (the CLI
      // renderer already does this; the web surface must match).
      const raw = data.reply || data.content || data.message || data.answer || '';
      const content = String(raw)
        .replace(/<think>[\s\S]*?<\/think>/g, '')        // never show reasoning
        .replace(/^\s*\{"tool":\s*"[^"]+",\s*"args":[\s\S]*?\}\s*\}\s*$/gm, '') // hide raw tool JSON
        .replace(/\n{3,}/g, '\n\n')
        .trim() || '(no response)';
      setMessages(m => m.map(x => x.id === assistantId ? { ...x, content, streaming: false } : x));
      if (data.session_id || data.sessionId) setSessionId(data.session_id || data.sessionId);
      if (data.usage) {
        setTokens(t => ({
          prompt: t.prompt + (data.usage.prompt_tokens || 0),
          completion: t.completion + (data.usage.completion_tokens || 0),
        }));
        setCost(c => c + ((data.usage.total_tokens || 0) * 0.000003));
      }
      // Tool calls rendered as separate messages
      if (data.tool_calls && data.tool_calls.length) {
        setMessages(m => [
          ...m,
          ...data.tool_calls.map((tc: any) => ({
            id: 'tc-' + Math.random(),
            role: 'tool' as const,
            content: JSON.stringify(tc.function?.arguments || tc.arguments || {}),
            ts: Date.now(),
            toolName: tc.function?.name || tc.name,
            toolArgs: tc.function?.arguments || tc.arguments,
            toolOk: true,
          })),
        ]);
      }
    } catch (e: any) {
      setMessages(m => m.map(x => x.id === assistantId ? { ...x, content: '**error:** ' + e.message, streaming: false } : x));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function newSession() {
    setMessages([]);
    setSessionId(null);
    setCost(0);
    setTokens({ prompt: 0, completion: 0 });
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e0e0e8', fontFamily: 'ui-monospace, monospace', display: 'flex', flexDirection: 'column' }}>
      {/* Statusline */}
      <header style={{ padding: '8px 16px', borderBottom: '1px solid #2a2a3a', display: 'flex', gap: 16, alignItems: 'center', fontSize: 13, background: '#0f0f17' }}>
        <span style={{ fontWeight: 600, color: connected ? '#4ade80' : '#f87171' }}>â—</span>
        <span style={{ fontWeight: 600 }}>purpclaw chat</span>
        <span style={{ color: '#666' }}>|</span>
        <span>{provider}/{model}</span>
        <span style={{ color: '#666' }}>|</span>
        <span>{tokens.prompt + tokens.completion} tokens</span>
        <span style={{ color: '#666' }}>|</span>
        <span>${cost.toFixed(4)}</span>
        <span style={{ color: '#666' }}>|</span>
        <span style={{ fontSize: 11, color: '#888' }}>{sessionId ? sessionId.substring(0, 16) + '...' : 'no session'}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={newSession} style={{ padding: '2px 8px', background: '#1a1a2a', color: '#888', border: '1px solid #333', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>new session</button>
        </span>
      </header>

      {/* Message log */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, maxWidth: 900, width: '100%', margin: '0 auto' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#666', marginTop: 80 }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>purpclaw chat</div>
            <div style={{ fontSize: 14 }}>type a prompt below. tokens + cost appear above.</div>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} style={{ marginBottom: 16, padding: 12, borderRadius: 6, background: m.role === 'user' ? '#0f1f2a' : m.role === 'tool' ? '#1a1a14' : '#0f0f17', border: '1px solid #1a1a2a' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 11, color: '#888' }}>
              <span style={{ color: m.role === 'user' ? '#4ade80' : m.role === 'tool' ? '#fbbf24' : '#60a5fa', fontWeight: 600 }}>
                {m.role === 'user' ? 'â–¸ user' : m.role === 'tool' ? `âš™ ${m.toolName || 'tool'}` : 'â—‡ assistant'}
              </span>
              <span>{new Date(m.ts).toLocaleTimeString()}</span>
              {m.streaming && <span style={{ color: '#60a5fa' }}>â– streaming...</span>}
              {m.toolOk === false && <span style={{ color: '#f87171' }}>âœ—</span>}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, fontSize: 14 }}>
              {m.content || (m.streaming ? '...' : '(empty)')}
            </div>
            {m.toolArgs && (
              <details style={{ marginTop: 8, fontSize: 11 }}>
                <summary style={{ cursor: 'pointer', color: '#888' }}>tool args</summary>
                <pre style={{ marginTop: 4, padding: 8, background: '#000', color: '#a0e0a0', overflow: 'auto', borderRadius: 4 }}>
                  {JSON.stringify(m.toolArgs, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))}
      </div>

      {/* Input box */}
      <footer style={{ padding: 12, borderTop: '1px solid #2a2a3a', background: '#0f0f17' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={streaming ? 'streaming...' : 'type a prompt. Enter to send. Shift+Enter for newline.'}
            disabled={streaming}
            rows={3}
            style={{ flex: 1, padding: 10, background: '#000', color: '#e0e0e8', border: '1px solid #2a2a3a', borderRadius: 4, fontFamily: 'ui-monospace, monospace', fontSize: 14, resize: 'vertical', minHeight: 60 }}
          />
          <button onClick={send} disabled={streaming || !input.trim()} style={{
            padding: '0 20px', height: 60, background: streaming ? '#333' : '#4ade80',
            color: '#000', border: 'none', borderRadius: 4, fontWeight: 600, cursor: streaming ? 'not-allowed' : 'pointer',
          }}>{streaming ? '...' : 'send'}</button>
        </div>
        <div style={{ maxWidth: 900, margin: '8px auto 0', fontSize: 11, color: '#666' }}>
          Enter to send Â· Shift+Enter newline Â· {connected === false && <span style={{ color: '#f87171' }}>API offline (port 7780)</span>}
          {connected === true && <span style={{ color: '#4ade80' }}> Â· connected</span>}
        </div>
      </footer>
    </div>
  );
}


