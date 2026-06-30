/* chat.jsx — Mission Cockpit chat surface (shared by Mission Control + Cockpit screens)
 * Wired to the real agent-loop via POST :7780/api/chat (SSE).
 */

const TOOL_ICONS = { 'web.search': '🔍', search: '🔍', read_file: '📄', write_file: '📝', bash: '⌨', exec: '⌨', browse: '🌐', memory: '🧠' };
function toolIcon(name = '') {
  const k = Object.keys(TOOL_ICONS).find(k => name.toLowerCase().includes(k.split('.')[0]));
  return k ? TOOL_ICONS[k] : '⚙';
}

function ToolChip({ t }) {
  return (
    <div className={`tool-chip ${t.status === 'ok' ? 'ok' : t.status === 'err' ? 'err' : ''}`}>
      <span className="ti">{t.status === 'running' ? '◌' : t.status === 'ok' ? '✓' : t.status === 'err' ? '✕' : '⚙'}</span>
      <div>
        <span className="tn">{t.tool}</span>
        <span className="tk">{t.status === 'running' ? 'RUNNING' : 'TOOL'}</span>
      </div>
    </div>
  );
}

function ChatMessage({ m }) {
  if (m.role === 'user') {
    return (
      <div className="msg user">
        <div className="msg-row" style={{ justifyContent: 'flex-end' }}>
          <div style={{ minWidth: 0 }}>
            <div className="msg-bubble">{m.text}</div>
          </div>
          <div className="msg-avatar">👤</div>
        </div>
      </div>
    );
  }
  return (
    <div className="msg">
      <div className="msg-row">
        <div className="msg-avatar glow-c">◈</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="msg-meta">
            <span className="who assistant">{m.model || 'PURPCLAW'}</span>
            {m.tools?.length > 0 && <span className="badge">TOOL CALLS ▾</span>}
            {m.streaming && !m.text && <span className="badge" style={{ borderColor: 'rgba(232,121,249,0.4)', color: 'var(--magenta)' }}>REASONING</span>}
            <span className="ts">{fmtClock(m.ts)}</span>
          </div>
          <div className="msg-bubble">
            {m.text || (m.streaming ? '…' : '')}
            {m.tools?.length > 0 && (
              <div className="tool-chips">
                {m.tools.map((t, i) => <ToolChip key={i} t={t} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MissionChat({ chat, title = 'MISSION COCKPIT', sub = 'Chat • Orchestrate • Execute', frameless }) {
  const { messages, send, phase, busy } = chat;
  const [draft, setDraft] = React.useState('');
  const [model, setModel] = React.useState('AUTO');
  const scrollRef = React.useRef(null);
  const settingsHook = window.__settingsSingleton;

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, phase]);

  const submit = () => {
    if (!draft.trim() || busy) return;
    send(draft.trim());
    setDraft('');
  };

  const body = (
    <div className="chat">
      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-faint)' }}>
            <div style={{ fontSize: 30, marginBottom: 10, filter: 'drop-shadow(0 0 12px rgba(168,85,247,0.6))' }}>◈</div>
            <div style={{ letterSpacing: '0.2em', fontSize: 10 }}>PURPCLAW READY — SEND A MISSION</div>
            <div style={{ fontSize: 9, marginTop: 6 }}>wired to :7780 /api/chat — the real agent-loop brain</div>
          </div>
        )}
        {messages.map((m, i) => <ChatMessage key={m.id || i} m={m} />)}
      </div>
      {busy && (
        <div className="thinking-line">
          <span className="dots"><i /><i /><i /></span>
          {phase === 'thinking' ? 'Thinking…' : 'Responding…'}
        </div>
      )}
      <div className="chat-input">
        <div className="chat-input-box">
          <textarea
            rows={1}
            placeholder="Message PURPCLAW…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          />
          <div className="chat-input-row">
            <span className="ci-icon" title="attach">📎</span>
            <span className="ci-icon" title="mention">@</span>
            <span className="ci-icon" title="commands">/</span>
            <span className="ci-icon" title="apps">⊞</span>
            <span className="ci-icon" title="boost">⚡</span>
            <span style={{ flex: 1 }} />
            <select className="ci-select" value={model} onChange={e => setModel(e.target.value)}>
              <option>AUTO</option>
              <option>MiniMax M2</option>
              <option>DeepSeek</option>
              <option>Claude</option>
              <option>Gemini</option>
              <option>Local / Ollama</option>
            </select>
            <span className="ci-select">⊕ LOCAL</span>
            <select className="ci-select" defaultValue="TOOLS">
              <option>TOOLS</option><option>ALL ON</option><option>READ-ONLY</option><option>OFF</option>
            </select>
            <button className="btn primary" onClick={submit} disabled={busy}>SEND ⏎</button>
          </div>
        </div>
        <div className="chat-hint">Press / for commands • Shift+Enter for newline</div>
      </div>
    </div>
  );

  if (frameless) return body;
  return (
    <div className="panel" style={{ minHeight: 0, height: '100%' }}>
      <div className="panel-hd">
        <h3>{title}</h3>
        <span className="hd-sub">{sub}</span>
        <div className="hd-right">
          <span>THREAD <b style={{ color: 'var(--text)' }}>{(messages[0]?.ts ? new Date(messages[0].ts).getTime().toString(36) : '9f3c2b1e').slice(0, 8)}</b></span>
          <span>☆</span><span>⤴</span>
          <span className="tag purple">⟳ PINNED ▾</span>
        </div>
      </div>
      <div className="panel-bd nopad" style={{ display: 'flex', flexDirection: 'column' }}>{body}</div>
    </div>
  );
}

Object.assign(window, { MissionChat, ChatMessage });
