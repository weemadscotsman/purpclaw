/* chat-hooks.js — real chat wiring to unified_api (:7780)
 *   POST /api/chat  Accept: text/event-stream
 *     events: phase {phase}, token {content,model}, tool-call {tool,args},
 *             tool-result {tool,ok,content}, done {reply,model,toolCalls}, error
 *   GET/POST /api/settings
 */

const CHAT_BASES = ['', 'http://localhost:7780']; // same-origin proxy first, then direct

async function chatFetch(path, opts = {}, timeoutMs = 5000) {
  for (const base of CHAT_BASES) {
    try {
      const r = await fetch(base + path, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
      if (r.ok) return r;
    } catch {}
  }
  return null;
}

// streaming POST — fetch-reader SSE parse (EventSource can't POST)
async function streamChat(message, handlers, opts = {}) {
  let res = null;
  for (const base of ['http://localhost:7780', '']) {
    try {
      res = await fetch(base + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({ message, model: opts.model, source: 'webui' }),
      });
      if (res.ok) break; else res = null;
    } catch { res = null; }
  }
  if (!res || !res.body) { handlers.onError?.('backend unreachable (:7780 /api/chat)'); return; }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const blocks = buf.split('\n\n');
    buf = blocks.pop();
    for (const block of blocks) {
      let ev = 'message', data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) ev = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      let j; try { j = JSON.parse(data); } catch { continue; }
      if (ev === 'phase')       handlers.onPhase?.(j.phase);
      else if (ev === 'token')  {
        handlers.onToken?.(j.content || '', j.model);
        // Record the model used so PROVIDER ROUTER and bottom bar CONTEXT
        // can show the real provider when /api/settings is offline.
        if (j.model) {
          window.__lastChatModel = j.model;
          // strip 'ollama::' prefix to show a clean provider name
          window.__lastChatProvider = j.model.startsWith('ollama::') ? 'ollama' : (j.model.split('-')[0] || j.model);
        }
      }
      else if (ev === 'tool-call')   handlers.onToolCall?.(j);
      else if (ev === 'tool-result') handlers.onToolResult?.(j);
      else if (ev === 'done')   {
        handlers.onDone?.(j);
        if (j.model) {
          window.__lastChatModel = j.model;
          window.__lastChatProvider = j.model.startsWith('ollama::') ? 'ollama' : (j.model.split('-')[0] || j.model);
        }
      }
      else if (ev === 'error')  handlers.onError?.(j.error || 'unknown error');
    }
  }
}

function useChat() {
  const [messages, setMessages] = React.useState([]);
  const [phase, setPhase] = React.useState('idle'); // idle|thinking|responding|error
  const busy = phase === 'thinking' || phase === 'responding';

  const send = React.useCallback(async (text) => {
    if (!text.trim()) return;
    const ts = new Date();
    setMessages(m => [...m, { role: 'user', text, ts }]);
    setPhase('thinking');
    const aid = `a-${Date.now()}`;
    setMessages(m => [...m, { role: 'assistant', id: aid, text: '', model: '', tools: [], ts: new Date(), streaming: true }]);
    const patch = (fn) => setMessages(m => m.map(x => x.id === aid ? fn(x) : x));
    await streamChat(text, {
      onPhase: (p) => { if (p === 'responding' || p === 'thinking') setPhase(p); },
      onToken: (content, model) => { setPhase('responding'); patch(x => ({ ...x, text: x.text + content, model: model || x.model })); },
      onToolCall: (j) => patch(x => ({ ...x, tools: [...x.tools, { tool: j.tool, status: 'running' }] })),
      onToolResult: (j) => patch(x => ({
        ...x,
        tools: x.tools.map((t, i, arr) =>
          (t.tool === j.tool && t.status === 'running' && i === arr.findIndex(y => y.tool === j.tool && y.status === 'running'))
            ? { ...t, status: j.ok ? 'ok' : 'err' } : t),
      })),
      onDone: (j) => { patch(x => ({ ...x, text: j.reply || x.text, model: j.model || x.model, streaming: false })); setPhase('idle'); },
      onError: (e) => { patch(x => ({ ...x, text: x.text || `⚠ ${e}`, streaming: false, error: true })); setPhase('idle'); },
    });
  }, []);

  return { messages, send, phase, busy };
}

// ── settings (live read/write to :7780 /api/settings) ──
function useSettings() {
  // Each successful chat records the model used. The settings hook also
  // queries /api/llm-ledger for the most recent call. We fall back across
  // three sources so the PROVIDER ROUTER never cosplays when the settings
  // endpoint is down: (1) /api/llm-ledger, (2) /api/mission-data,
  // (3) hardcoded last-used model (in window.__lastChatModel).
  const [settings, setSettings] = React.useState(null);
  const [connected, setConnected] = React.useState(false);
  const [dirty, setDirty] = React.useState({});

  const load = React.useCallback(async () => {
    // primary: /api/settings (settings endpoint)
    const r = await chatFetch('/api/settings', {}, 2000);
    if (r) { try { setSettings(await r.json()); setConnected(true); return; } catch {} }
    // fallback 1: /api/llm-ledger (real backend)
    try {
      const lr = await fetch('/api/llm-ledger');
      if (lr.ok) { const j = await lr.json(); if (j?.success) { setSettings({ LLM_PROVIDER: 'live-ledger', LLM_MODEL: j.recent?.[0]?.model || '', recent: j.recent }); setConnected(true); return; } }
    } catch {}
    // fallback 2: /api/mission-data (real backend, has provider info)
    try {
      const mr = await fetch('/api/mission-data');
      if (mr.ok) { const j = await mr.json(); if (j?.api) { setSettings({ LLM_PROVIDER: j.api.provider || 'unified_api', LLM_MODEL: j.api.model || '' }); setConnected(true); return; } }
    } catch {}
    // fallback 3: last used model from chat
    if (window.__lastChatModel) {
      setSettings({ LLM_PROVIDER: window.__lastChatProvider, LLM_MODEL: window.__lastChatModel });
      setConnected(true);
      return;
    }
    setConnected(false);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const stage = React.useCallback((key, value) => {
    setDirty(d => ({ ...d, [key]: value }));
    setSettings(s => ({ ...(s || {}), [key]: value }));
  }, []);

  const apply = React.useCallback(async () => {
    if (!Object.keys(dirty).length) return true;
    const r = await chatFetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dirty),
    }, 5000);
    if (r) { setDirty({}); await load(); return true; }
    return false;
  }, [dirty, load]);

  return { settings, connected, dirty, stage, apply, reload: load, unsaved: Object.keys(dirty).length };
}

// ── live system stats from :7780 /api/status (fallback synthetic ticker) ──
function useSysStats(intervalMs = 5000) {
  const [stats, setStats] = React.useState({ cpu: null, ram: null, uptime: null, tokens: null });
  React.useEffect(() => {
    let dead = false;
    async function tick() {
      const j = await tryFetchJson('/api/service-proxy?port=7780&path=' + encodeURIComponent('/api/status'), 3000)
        || await tryFetchJson('http://localhost:7780/api/status', 3000);
      if (dead) return;
      const d = j?.data ?? j;
      if (d) setStats({
        cpu: d.cpu ?? d.system?.cpu ?? null,
        ram: d.memory ?? d.system?.memory ?? null,
        uptime: d.uptime ?? null,
        tokens: d.tokensPerMin ?? d.tokens ?? null,
        raw: d,
      });
    }
    tick(); const t = setInterval(tick, intervalMs);
    return () => { dead = true; clearInterval(t); };
  }, [intervalMs]);
  return stats;
}

// clock
function useClock() {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return now;
}

Object.assign(window, { useChat, useSettings, useSysStats, useClock, streamChat, chatFetch });

// ── LLM ledger (real call/token/cost accounting) ──
function useLedger(intervalMs = 6000) {
  const [s, set] = React.useState({ summary: null, recent: [], connected: false });
  React.useEffect(() => {
    let dead = false;
    async function tick() {
      const j = await tryFetchJson('/api/llm-ledger', 4000);
      if (dead) return;
      if (j && j.success) set({ summary: j.summary, recent: j.recent || [], connected: true });
      else set(p => ({ ...p, connected: false }));
    }
    tick(); const t = setInterval(tick, intervalMs);
    return () => { dead = true; clearInterval(t); };
  }, [intervalMs]);
  return s;
}

// ── knowledge pool stats (real skills/memories/queries/failures) ──
function usePool(intervalMs = 8000) {
  const [s, set] = React.useState({ stats: null, connected: false });
  React.useEffect(() => {
    let dead = false;
    async function tick() {
      const j = await tryFetchJson('http://localhost:7885/pool/stats', 3500)
        || await tryFetchJson('/api/service-proxy?port=7885&path=' + encodeURIComponent('/pool/stats'), 3500);
      if (dead) return;
      const d = j?.data ?? j;
      if (d && d.skillsCount != null) set({ stats: d, connected: true });
      else set(p => ({ ...p, connected: false }));
    }
    tick(); const t = setInterval(tick, intervalMs);
    return () => { dead = true; clearInterval(t); };
  }, [intervalMs]);
  return s;
}

// ── agent scores (real leaderboard) ──
function useScores(intervalMs = 10000) {
  const [s, set] = React.useState({ leaderboard: [], meta: null, connected: false });
  React.useEffect(() => {
    let dead = false;
    async function tick() {
      const j = await tryFetchJson('/api/agent-scores', 4000);
      if (dead) return;
      if (j && j.success) set({ leaderboard: j.leaderboard || [], meta: j.meta, connected: true });
      else set(p => ({ ...p, connected: false }));
    }
    tick(); const t = setInterval(tick, intervalMs);
    return () => { dead = true; clearInterval(t); };
  }, [intervalMs]);
  return s;
}

// ── live skill search against the pool (GOOP registry) ──
function useSkillSearch(query, limit = 8) {
  const [s, set] = React.useState({ results: [], count: 0, busy: false, connected: false });
  React.useEffect(() => {
    let dead = false;
    const q = (query || 'agent').trim() || 'agent';
    set(p => ({ ...p, busy: true }));
    const run = async () => {
      const path = `/pool/skills/search?q=${encodeURIComponent(q)}&limit=${limit}`;
      const j = await tryFetchJson(`http://localhost:7885${path}`, 4000)
        || await tryFetchJson(`/api/service-proxy?port=7885&path=${encodeURIComponent(path)}`, 4000);
      if (dead) return;
      const d = j?.data ?? j;
      if (d && Array.isArray(d.results)) set({ results: d.results, count: d.count, busy: false, connected: true });
      else set({ results: [], count: 0, busy: false, connected: false });
    };
    const t = setTimeout(run, 350); // debounce
    return () => { dead = true; clearTimeout(t); };
  }, [query, limit]);
  return s;
}

Object.assign(window, { useLedger, usePool, useScores, useSkillSearch });
