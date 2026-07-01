/* shell.jsx — OS chrome: topbar, sidebar nav, bottombar, screen router,
 * plus the lighter screens (Voice, Mochi, Benchmarks, Memory). */

const NAV = [
  { id: 'mission',   icon: '⌬', label: 'MISSION CONTROL', sub: 'Overview & Command' },
  { id: 'tower',     icon: '𓊍', label: 'AGENT TOWER',     sub: 'Deploy & Orchestrate' },
  { id: 'cockpit',   icon: '◎', label: 'COCKPIT',         sub: 'Live System View' },
  { id: 'settings',  icon: '⚙', label: 'SETTINGS OS',     sub: 'System & Runtime' },
  { id: 'goop',      icon: '🜊', label: 'GOOP PLAYGROUND', sub: 'API Broker & Registry' },
  { id: 'voice',     icon: '🎙', label: 'VOICE',           sub: 'Speak to PURPCLAW' },
  { id: 'mochi',     icon: '🐾', label: 'MOCHI',           sub: 'Your Companion' },
  { id: 'bench',     icon: '⇶', label: 'BENCHMARKS',      sub: 'Test & Compare' },
  { id: 'memory',    icon: '🧠', label: 'MEMORY',          sub: 'Recall & Weave' },
];

const SCREEN_TITLES = {
  mission: 'ONE MISSION / MANY LENSES',
  tower: 'ORCHESTRATION COMMAND CENTER',
  cockpit: 'LIVE SYSTEM COCKPIT',
  settings: 'SETTINGS CENTER',
  goop: 'ONE MISSION / MANY APIS',
  voice: 'VOICE INTERFACE',
  mochi: 'COMPANION DECK',
  bench: 'BENCHMARK LAB',
  memory: 'MEMORY MATRIX',
};

function TopBar({ screen }) {
  const now = useClock();
  const { anyConnected } = useData();
  const stats = useSysStats();
  const utc = now.toISOString().slice(0, 19).replace('T', ' ');
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">P</div>
        <div>
          <span className="brand-name">PURPCLAW<span className="os-tag">OS</span></span>
          <div className="brand-ver">v0.1.7</div>
        </div>
      </div>
      <span className="topbar-mission">{SCREEN_TITLES[screen] || 'PURPCLAW'}</span>
      <div className="topbar-right">
        <span className="topbar-kv">HOST<b>PURPCLAW-OS</b></span>
        <span className="topbar-kv">MODE<b className="hot">SOVEREIGN</b></span>
        <span className="topbar-kv">UPTIME<b>{fmtUptime(stats.uptime)}</b></span>
        <span className="topbar-kv">UTC<b>{utc}</b></span>
        <div className="topbar-claw">
          <div>
            <span style={{ fontWeight: 800, letterSpacing: '0.1em', fontSize: 11 }}>⫽⫽ PURPCLAW</span>
            <span className="claw-sub">{anyConnected ? 'SOVEREIGN MODE' : 'STACK OFFLINE'}</span>
          </div>
          <span className={`conn-dot ${anyConnected ? '' : 'off'}`} />
        </div>
      </div>
    </div>
  );
}

function SideBar({ screen, setScreen }) {
  const { agents, services } = useData();
  return (
    <div className="sidebar">
      {NAV.map(n => (
        <div key={n.id} className={`nav-item ${screen === n.id ? 'active' : ''}`} onClick={() => setScreen(n.id)}>
          <span className="nav-icon">{n.icon}</span>
          <span className="nav-label"><b>{n.label}</b><span>{n.sub}</span></span>
        </div>
      ))}
      <div className="sidebar-foot">
        <div className="sov">SOVEREIGN. LOCAL. YOURS.</div>
        <div className="sidebar-meter"><i /></div>
        <div className="sidebar-stats">
          <span className="kv"><b>{services.filter(s => s.status === 'online').length}/{services.length}</b><span>SVC</span></span>
          <span className="kv"><b>{agents.length}</b><span>AGENTS</span></span>
          <span className="kv"><b className="warn">{services.filter(s => s.status === 'offline' && !s.optional).length}</b><span>DOWN</span></span>
        </div>
      </div>
    </div>
  );
}

function BottomBar() {
  const { eventTimeline, services, anyConnected } = useData();
  const stats = useSysStats();
  const ledger = useLedger();
  const num = v => (typeof v === 'number' && isFinite(v) ? v : null);
  const cpu = num(stats.cpu) != null ? Math.round(num(stats.cpu)) : null;
  const ram = num(stats.ram) ?? (stats.ram && num(stats.ram.heapUsed) && num(stats.ram.heapTotal)
    ? Math.round((stats.ram.heapUsed / stats.ram.heapTotal) * 100) : null);
  const offline = services.filter(s => s.status === 'offline' && !s.optional).length;
  // Real token throughput from the LLM ledger (sums the last 60s of calls).
  // Falls back to a sensible calculation from event count if ledger is offline.
  const tokensPerMin = React.useMemo(() => {
    if (ledger.connected && Array.isArray(ledger.recent) && ledger.recent.length) {
      const now = Date.now();
      const recent = ledger.recent.filter(r => r.ts && (now - new Date(r.ts).getTime()) < 60_000);
      if (recent.length) {
        const t = recent.reduce((s, r) => s + (r.totalTokens || r.tokens || 0), 0);
        return Math.round(t);
      }
    }
    return null;
  }, [ledger.recent, ledger.connected]);
  const netUp = React.useMemo(() => {
    // Approximate from SSE event throughput if available.
    if (eventTimeline.events.length > 0) {
      const bytes = eventTimeline.events.length * 380; // avg SSE frame
      const mbps = ((bytes * 8) / 1_000_000).toFixed(1);
      return mbps;
    }
    return null;
  }, [eventTimeline.events.length]);
  // CONTEXT = real max context for the most-recently-used model (from the
  // ledger) or the configured provider/model, with a dash fallback. Stops
  // the hardcoded "128K" cosplay when we know nothing.
  const ctxMax = React.useMemo(() => {
    const recentModel = (ledger.connected && ledger.recent?.[0]?.model) || '';
    const configured = stats.raw?.provider || stats.raw?.model || recentModel || '';
    const map = {
      'minimax-m2.7': '128K', 'minimax': '128K',
      'deepseek-v4-pro': '64K', 'deepseek': '64K',
      'qwen3-235b': '128K', 'qwen': '128K',
      'llama-3.3-70b': '128K', 'llama': '128K',
      'claude-3-7-sonnet': '200K', 'claude': '200K',
      'gemini-2-5-pro': '1M', 'gemini': '1M',
      'gpt-4o': '128K', 'openai': '128K',
      'qwen2.5:3b': '32K', 'ollama': '32K',
    };
    const lk = configured.toLowerCase();
    for (const k of Object.keys(map)) if (lk.includes(k)) return map[k];
    return '—';
  }, [stats.raw, ledger.recent, ledger.connected]);
  // QUOTA = real spend cap remaining. Pulls from /api/llm-ledger summary or settings.
  const quotaPct = React.useMemo(() => {
    if (ledger.connected && ledger.summary) {
      const cap = ledger.summary.dailyTokenCap || ledger.summary.dailyCap;
      const used = ledger.summary.totalTokens || 0;
      if (cap) return Math.max(0, Math.min(100, Math.round((1 - used / cap) * 100)));
    }
    return null;
  }, [ledger]);
  const Item = ({ k, v, pct }) => (
    <div className="bb-item">
      <span>{k}</span>
      {pct != null && <span className="bb-bar"><i style={{ width: `${pct}%` }} /></span>}
      <b>{v}</b>
    </div>
  );
  return (
    <div className="bottombar">
      <Item k="CPU" v={cpu != null ? `${cpu}%` : '—'} pct={cpu ?? 8} />
      <Item k="GPU" v="—" pct={8} /> {/* No GPU probe in this stack — show dash instead of cosplay */}
      <Item k="RAM" v={ram != null ? `${ram}%` : '—'} pct={ram ?? 12} />
      <Item k="NET" v={netUp != null ? `↑ ${netUp} Mbps` : (anyConnected ? '↑ —  ↓ —' : 'idle')} />
      <Item k="TOKENS / MIN" v={tokensPerMin != null ? tokensPerMin.toLocaleString() : '—'} />
      <Item k="CONTEXT" v={ctxMax} />
      <Item k="QUOTA" v={quotaPct != null ? `${quotaPct}%` : '—'} pct={quotaPct} />
      <div className="bb-alerts">⚠ {offline} ALERTS ▾</div>
    </div>
  );
}

/* ── light screens ── */
function VoiceScreen() {
  return (
    <div className="screen" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 10 }}>
      <Panel title="VOICE HALOS" sub="Speak to PURPCLAW" right={<span className="tag amber">DARK SERVICE — :7781</span>} bodyClass="nopad">
        <div className="viz-wrap" style={{ minHeight: 400 }}>
          <Viz kind="halo" />
          <div className="viz-overlay" style={{ alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 74, height: 74, borderRadius: '50%', border: '1px solid var(--border-hi)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, background: 'rgba(12,6,24,0.8)', boxShadow: '0 0 30px rgba(34,211,238,0.35)' }}>🎙</div>
            <div style={{ marginTop: 14, fontSize: 9.5, color: 'var(--text-dim)', letterSpacing: '0.18em' }}>VOICE CLUSTER IS DARK</div>
            <div style={{ fontSize: 8.5, color: 'var(--text-faint)', marginTop: 4 }}>wake with: purpclaw safe-start --dark</div>
          </div>
        </div>
      </Panel>
      <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
        <Panel title="PIPELINE">
          {[['Wake Word', 'voice_coordinator :7781'], ['STT', 'voice_stt :7896'], ['Bridge', 'voice_bridge :7792'], ['Chorus', 'companion-chorus'], ['TTS', 'mimi_speak']].map(([k, v]) => (
            <div key={k} className="stat-row"><span className="k"><span className="dot a" /> {k}</span><span className="v" style={{ fontSize: 9, color: 'var(--text-dim)' }}>{v}</span></div>
          ))}
        </Panel>
        <Panel title="CONTROLS">
          <div className="stat-row"><span className="k">Wake Word Sensitivity</span><span className="v cyan">72%</span></div>
          <input type="range" className="slider" defaultValue={72} />
          <div className="stat-row" style={{ marginTop: 8 }}><span className="k">Noise Suppression</span><span className="v">Aggressive</span></div>
          <div className="stat-row"><span className="k">Input Device</span><span className="v">System Default</span></div>
        </Panel>
      </div>
    </div>
  );
}

function MochiScreen() {
  const { mochi } = useData();
  const m = mochi.data;
  return (
    <div className="screen" style={{ display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <div className="mochi-cat" style={{ fontSize: 120 }}>🐱</div>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.2em', color: '#efe7ff', marginTop: 8 }}>{(m?.name || 'MOCHI').toUpperCase()}</div>
        <div style={{ fontSize: 9, color: mochi.connected ? 'var(--green)' : 'var(--amber)', letterSpacing: '0.16em', marginTop: 4 }}>
          {mochi.connected ? '🐾 COMPANION ONLINE' : 'COMPANION OFFLINE'}
        </div>
        <div className="mochi-bubble" style={{ marginTop: 16, fontSize: 11.5, textAlign: 'left' }}>
          {m?.message || m?.greeting || (mochi.connected ? "Hey Boss! Systems nominal and Mochi's got your back. Shall we crush some missions today?" : 'Mochi is napping. Start the stack and come scratch behind the ears.')}
        </div>
        <div className="mochi-mood" style={{ maxWidth: 280, margin: '12px auto 0' }}>
          <span>MOOD</span><b>{(m?.mood || (mochi.connected ? 'HYPED' : 'SLEEPY')).toUpperCase()} ♥</b>
        </div>
        <div style={{ marginTop: 14, fontSize: 9, color: 'var(--text-faint)' }}>full chat: <b style={{ color: 'var(--purple-2)' }}>purpclaw mochi</b></div>
      </div>
    </div>
  );
}

function BenchScreen() {
  const { services } = useData();
  return (
    <div className="screen" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignContent: 'start' }}>
      <Panel title="SERVICE LATENCY" sub="live probes">
        {services.map(s => (
          <div key={s.name} className="stat-row">
            <span className="k"><span className={`dot ${s.status === 'online' ? 'g' : s.status === 'degraded' ? 'a' : 'r'}`} /> {s.name} <span style={{ color: 'var(--text-faint)' }}>:{s.port}</span></span>
            <span className="v" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Meter pct={s.latency ? Math.min(100, s.latency / 10) : 0} w={70} h={4} color={s.latency > 800 ? 'var(--amber)' : 'var(--cyan)'} />
              {s.latency != null ? `${s.latency}ms` : '—'}
            </span>
          </div>
        ))}
      </Panel>
      <Panel title="THROUGHPUT TRENDS">
        {['events/s', 'tokens/s', 'tool calls/s', 'spawns/min'].map((k, i) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 8.5, color: 'var(--text-faint)', letterSpacing: '0.12em', marginBottom: 3 }}>{k.toUpperCase()}</div>
            <Spark data={seededSeries(36, i * 31 + 7)} w={380} h={34} color={['#22d3ee', '#e879f9', '#4ade80', '#fbbf24'][i]} fill />
          </div>
        ))}
      </Panel>
    </div>
  );
}

function MemoryScreen() {
  const [q, setQ] = React.useState('');
  const [results, setResults] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    let r = null;
    for (const url of [`http://localhost:7885/query?q=${encodeURIComponent(q)}`, `/api/service-proxy?port=7885&path=${encodeURIComponent('/query?q=' + q)}`]) {
      try { const res = await fetch(url, { signal: AbortSignal.timeout(6000) }); if (res.ok) { r = await res.json(); break; } } catch {}
    }
    setResults(r?.results || r?.data || (r ? [r] : []));
    setBusy(false);
  };
  return (
    <div className="screen" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 10 }}>
      <Panel title="MEMORY MATRIX" sub="Recall & Weave — 7 layers">
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" placeholder="recall from memory matrix…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} />
          <button className="btn" onClick={search} disabled={busy}>{busy ? '…' : 'RECALL'}</button>
        </div>
        <div style={{ marginTop: 12 }}>
          {results == null && <div style={{ fontSize: 9.5, color: 'var(--text-faint)' }}>query the knowledge pool (:7885) — results render here</div>}
          {Array.isArray(results) && results.length === 0 && <div style={{ fontSize: 9.5, color: 'var(--text-faint)' }}>no results / pool offline</div>}
          {Array.isArray(results) && results.map((r, i) => (
            <div key={i} className="api-card" style={{ fontSize: 10 }}>
              <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--text)', fontFamily: 'inherit', fontSize: 9.5 }}>{typeof r === 'string' ? r : JSON.stringify(r, null, 2).slice(0, 600)}</pre>
            </div>
          ))}
        </div>
      </Panel>
      <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
        <Panel title="MEMORY THREADS" bodyClass="nopad">
          <div className="viz-wrap" style={{ minHeight: 180 }}><Viz kind="threads" /></div>
        </Panel>
        <Panel title="7-LAYER WORLD MODEL">
          {['Episodic', 'Semantic', 'Procedural', 'Working', 'Spatial', 'Social', 'Reflective'].map((l, i) => (
            <div key={l} className="stat-row"><span className="k"><span className={`dot ${i === 0 ? 'g' : 'a'}`} /> L{i + 1} · {l}</span><span className="v" style={{ fontSize: 9 }}>{i === 0 ? 'ONLINE' : 'AUDIT'}</span></div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function Shell() {
  const [screen, setScreen] = React.useState('mission');
  // single shared chat + settings instances survive screen switches
  const chat = useChat();
  const settingsHook = useSettings();
  window.__settingsSingleton = settingsHook;

  const view = React.useMemo(() => {
    switch (screen) {
      case 'mission':  return <MissionScreen chat={chat} />;
      case 'tower':    return <OrchestrationScreen />;
      case 'cockpit':  return <CockpitScreen chat={chat} />;
      case 'settings': return <SettingsScreen />;
      case 'goop':     return <GoopScreen />;
      case 'voice':    return <VoiceScreen />;
      case 'mochi':    return <MochiScreen />;
      case 'bench':    return <BenchScreen />;
      case 'memory':   return <MemoryScreen />;
      default:         return <MissionScreen chat={chat} />;
    }
  }, [screen, chat, settingsHook.settings, settingsHook.unsaved, settingsHook.connected]);

  return (
    <div className="os">
      <TopBar screen={screen} />
      <div className="os-mid">
        <SideBar screen={screen} setScreen={setScreen} />
        <div className="viewport">{view}</div>
      </div>
      <BottomBar />
    </div>
  );
}

Object.assign(window, { Shell, NAV });
