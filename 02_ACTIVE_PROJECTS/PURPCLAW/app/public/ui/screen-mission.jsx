/* screen-mission.jsx — MISSION CONTROL (mockup 1)
 * Top row: SERVICES | AGENTS | EVENTS | RISK GATE | DREAM SWARM
 * Mid: TOWER + ORCH + EVT STREAM (left col) | MISSION COCKPIT chat (center) | right rail
 * Right rail: PROVIDER ROUTER | MEMORY THREADS | SELF-EVOLUTION | MOCHI
 */

function ServicesCard() {
  const { services } = useData();
  const online = services.filter(s => s.status === 'online' || s.status === 'degraded').length;
  return (
    <Panel title="SERVICES" right={<span><b className="glow-c"><Counter value={online} /></b> / {services.length} ONLINE</span>} bodyClass="nopad">
      <div className="viz-wrap" style={{ minHeight: 120 }}>
        <Viz kind="constellation" />
      </div>
    </Panel>
  );
}

function AgentsCard() {
  const { agents } = useData();
  const active = agents.filter(a => a.status === 'working').length || agents.length;
  const byDiv = {};
  agents.forEach(a => { const k = divMeta(a.division).name; byDiv[k] = (byDiv[k] || 0) + 1; });
  const top = Object.entries(byDiv).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    <Panel title="AGENTS" right={<span className="tag cyan"><Counter value={agents.length} /> ACTIVE</span>} bodyClass="nopad">
      <div className="viz-wrap" style={{ minHeight: 120 }}>
        <Viz kind="burst" />
        <div className="viz-overlay" style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 3 }}>
          {top.length ? top.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8, fontSize: 9, width: 118, justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>{k}</span><b style={{ color: 'var(--text)' }}>{v}</b>
            </div>
          )) : <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>no live agents</span>}
          {Object.keys(byDiv).length > 5 && <div style={{ fontSize: 8.5, color: 'var(--text-faint)', width: 118 }}>+ {Object.keys(byDiv).length - 5} more</div>}
        </div>
      </div>
    </Panel>
  );
}

function EventsCard() {
  const { stream, eventTimeline } = useData();
  const evts = eventTimeline.events.length ? eventTimeline.events : stream.events;
  // bucket events into 40 slots over last 10 min
  const series = React.useMemo(() => {
    const buckets = new Array(40).fill(0);
    const now = Date.now(), span = 10 * 60 * 1000;
    evts.forEach(e => {
      const t = new Date(e.ts || e._time || now).getTime();
      const idx = Math.floor(((t - (now - span)) / span) * 40);
      if (idx >= 0 && idx < 40) buckets[idx]++;
    });
    return buckets.some(v => v) ? buckets : seededSeries(40, evts.length + 11);
  }, [evts]);
  const counts = { info: 0, warn: 0, alert: 0, crit: 0 };
  evts.forEach(e => {
    const lv = String(e.type || e.level || 'info').toLowerCase();
    if (lv.includes('crit') || lv.includes('fatal')) counts.crit++;
    else if (lv.includes('alert') || lv.includes('error')) counts.alert++;
    else if (lv.includes('warn')) counts.warn++;
    else counts.info++;
  });
  const total = Math.max(1, evts.length);
  return (
    <Panel title="EVENTS" right={<span><b style={{ color: 'var(--text)' }}><Counter value={evts.length} /></b> / min</span>}>
      <div style={{ display: 'flex', gap: 10, height: '100%' }}>
        <div style={{ flex: 1, alignSelf: 'flex-end' }}><Bars data={series} h={76} /></div>
        <div style={{ flex: 'none', fontSize: 9, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
          <div><span style={{ color: 'var(--text-dim)' }}>INFO</span> <b className="glow-c">{Math.round(counts.info / total * 100)}%</b></div>
          <div><span style={{ color: 'var(--text-dim)' }}>WARN</span> <b style={{ color: 'var(--amber)' }}>{Math.round(counts.warn / total * 100)}%</b></div>
          <div><span style={{ color: 'var(--text-dim)' }}>ALERT</span> <b style={{ color: 'var(--pink)' }}>{Math.round(counts.alert / total * 100)}%</b></div>
          <div><span style={{ color: 'var(--text-dim)' }}>CRIT</span> <b style={{ color: 'var(--red)' }}>{Math.round(counts.crit / total * 100)}%</b></div>
        </div>
      </div>
    </Panel>
  );
}

function RiskGateCard() {
  const { gatekeeper } = useData();
  const gk = gatekeeper.data;
  const score = gk?.riskScore ?? gk?.score ?? 12;
  const gates = ['INPUT', 'MODEL', 'TOOLS', 'DATA', 'OUTPUT'];
  return (
    <Panel title="RISK GATE" right={<span>SHIELD: <b className={gatekeeper.connected ? 'glow-g' : ''} style={{ color: gatekeeper.connected ? undefined : 'var(--amber)' }}>{gatekeeper.connected ? 'NOMINAL' : 'OFFLINE'}</b></span>} bodyClass="nopad">
      <div className="viz-wrap" style={{ minHeight: 120 }}>
        <Viz kind="shield" />
        <div className="viz-overlay" style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 2 }}>
          {gates.map(g => (
            <div key={g} style={{ display: 'flex', width: 92, justifyContent: 'space-between', fontSize: 9 }}>
              <span style={{ color: 'var(--text-dim)' }}>{g}</span>
              <span className={gatekeeper.connected ? 'check' : 'x'}>{gatekeeper.connected ? '✓' : '–'}</span>
            </div>
          ))}
          <div style={{ width: 92, marginTop: 5, fontSize: 8, color: 'var(--text-faint)', letterSpacing: '0.1em' }}>RISK SCORE</div>
          <div style={{ width: 92, fontSize: 13, fontWeight: 800 }}><span className="glow-p"><Counter value={score} /></span> <span style={{ color: 'var(--text-faint)', fontSize: 9 }}>/ 100</span></div>
        </div>
      </div>
    </Panel>
  );
}

function DreamSwarmCard() {
  const { anyConnected } = useData();
  const amp = anyConnected ? 72 : 12;
  return (
    <Panel title="DREAM SWARM" bodyClass="nopad">
      <div className="viz-wrap" style={{ minHeight: 120 }}>
        <Viz kind="wave" />
        <div className="viz-overlay">
          <div style={{ fontSize: 8.5, color: 'var(--text-dim)', letterSpacing: '0.12em' }}>AMPLITUDE</div>
          <div className="big-num" style={{ fontSize: 22 }}><Counter value={amp} format={v => `${Math.round(v)}%`} /></div>
          <div style={{ marginTop: 'auto', alignSelf: 'flex-end', fontSize: 8.5, color: 'var(--text-dim)' }}>
            COHERENCE: <b className="glow-c">{anyConnected ? 'HIGH' : 'LOW'}</b>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function TowerMini() {
  const { floors, agents } = useData();
  const named = floors.filter(f => f.div !== 'LOBBY');
  return (
    <Panel title="TOWER" dot="p" right={<span>{Math.max(named.length, 1)} FLOORS</span>} bodyClass="nopad">
      <div className="viz-wrap" style={{ minHeight: 188 }}>
        <Viz kind="tower" />
        <div className="viz-overlay" style={{ justifyContent: 'center', gap: 4, alignItems: 'flex-end' }}>
          {(named.length ? named : [{ id: 'core', level: 1, div: 'CORE' }]).slice(0, 7).map((f, i, arr) => (
            <div key={f.id} style={{ fontSize: 8.5, color: 'var(--text-dim)', display: 'flex', gap: 7 }}>
              <span style={{ color: 'var(--text-faint)' }}>{arr.length - i}</span>
              <span>{divMeta(f.div).name.toUpperCase().slice(0, 9)}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function OrchMini() {
  const { pipeline } = useData();
  const wf = pipeline?.workflows || pipeline?.recent || [];
  const running = pipeline?.running ?? wf.filter(w => w.status === 'running').length;
  const waiting = pipeline?.waiting ?? wf.filter(w => w.status === 'pending' || w.status === 'waiting').length;
  const failed = pipeline?.failed ?? wf.filter(w => w.status === 'failed').length;
  const completed = pipeline?.completed ?? wf.filter(w => w.status === 'completed' || w.status === 'done').length;
  const total = pipeline?.total ?? wf.length;
  return (
    <Panel title="ORCH" dot={running ? 'g' : 'a'} sub={running ? 'RUNNING' : 'IDLE'} right={<span>{total} WORKFLOWS</span>} bodyClass="nopad">
      <div className="viz-wrap" style={{ minHeight: 150 }}>
        <Viz kind="spiral" />
        <div className="viz-overlay" style={{ justifyContent: 'flex-end', gap: 3 }}>
          {[['RUNNING', running, 'var(--magenta)'], ['WAITING', waiting, 'var(--cyan)'], ['FAILED', failed, 'var(--red)'], ['COMPLETED', completed, 'var(--green)']].map(([k, v, c]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', width: 120, fontSize: 9 }}>
              <span style={{ color: 'var(--text-dim)' }}><span className="dot" style={{ background: c, boxShadow: `0 0 6px ${c}`, marginRight: 6 }} />{k}</span>
              <b style={{ color: 'var(--text)' }}><Counter value={v || 0} /></b>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function EvtStreamMini() {
  const { stream, eventTimeline } = useData();
  const evts = (eventTimeline.events.length ? eventTimeline.events : stream.events).slice(0, 9);
  return (
    <Panel title="EVT STREAM" dot="c" right={<span className="tag cyan">LIVE FEED</span>}>
      {evts.length === 0 && <div style={{ fontSize: 9, color: 'var(--text-faint)', padding: '8px 0' }}>awaiting events…</div>}
      {evts.map((e, i) => (
        <div key={e.id || e._id || i} className="evt-item">
          <span className="et">{fmtTime(e.ts || e._time || Date.now())}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {e.message || e.type || e.topic || e.raw || 'event'}
          </span>
        </div>
      ))}
      <div style={{ fontSize: 8.5, color: 'var(--text-faint)', letterSpacing: '0.2em', paddingTop: 6 }}>STREAMING… <span style={{ float: 'right' }}>›››</span></div>
    </Panel>
  );
}

function ProviderRouter() {
  // REAL data: llm-ledger groups every actual model call (tokens + cost)
  const ledger = useLedger();
  const [directConfig, setDirectConfig] = React.useState(null);
  React.useEffect(() => {
    // The settings hook may be offline (returns null). Fetch the config
    // directly from /api/llm-ledger (real backend) and /api/mission-data
    // so this panel never cosplays "No provider configured" when there
    // is in fact a working provider underneath.
    let cancelled = false;
    (async () => {
      let resolved = null;
      // /api/llm-config returns the actual configured provider + model
      try {
        const r = await fetch('/api/llm-config');
        if (r.ok) { const j = await r.json(); if (j?.ok && (j.provider || j.model)) { resolved = { LLM_PROVIDER: j.provider, LLM_MODEL: j.model }; } }
      } catch {}
      // /api/llm-ledger has the most-recent call's model
      if (!resolved) {
        try {
          const r = await fetch('/api/llm-ledger');
          if (r.ok) { const j = await r.json(); if (j?.success && j.recent?.[0]?.model) { resolved = { LLM_PROVIDER: 'live-ledger', LLM_MODEL: j.recent[0].model }; } }
        } catch {}
      }
      // /api/chat last-known (set by streamChat)
      if (!resolved && window.__lastChatModel) {
        resolved = { LLM_PROVIDER: window.__lastChatProvider || 'chat', LLM_MODEL: window.__lastChatModel };
      }
      if (!cancelled && resolved) setDirectConfig(resolved);
    })();
    return () => { cancelled = true; };
  }, [ledger.recent]);
  const S = window.__settingsSingleton;
  const configured = directConfig?.LLM_PROVIDER || S?.settings?.LLM_PROVIDER || S?.settings?.llmProvider || null;
  const configuredModel = directConfig?.LLM_MODEL || S?.settings?.LLM_MODEL || S?.settings?.llmModel || null;
  const byModel = React.useMemo(() => {
    const m = new Map();
    (ledger.recent || []).forEach(r => {
      const k = r.model || r.provider || 'unknown';
      if (!m.has(k)) m.set(k, { name: k, calls: 0, tokens: 0, cost: 0 });
      const e = m.get(k);
      e.calls++; e.tokens += (r.totalTokens || r.tokens || 0); e.cost += (r.cost || 0);
    });
    return [...m.values()].sort((a, b) => b.calls - a.calls);
  }, [ledger.recent]);
  const maxCalls = Math.max(1, ...byModel.map(p => p.calls));
  // When ledger is empty, surface the *actually configured* provider + model
  // (not a fake placeholder) so the panel never cosplays.
  const placeholder = byModel.length === 0 && (configured || configuredModel);
  return (
    <Panel title="PROVIDER ROUTER" right={<span>LEDGER: <b className={ledger.connected ? 'glow-g' : ''} style={{ color: ledger.connected ? undefined : 'var(--amber)' }}>{ledger.connected ? 'LIVE' : 'OFFLINE'}</b></span>}>
      {byModel.length === 0 && placeholder && (
        <div className="prov-row">
          <span className="pi">◆</span>
          <b>{configuredModel || configured}</b>
          <span className="pl">CONFIGURED</span>
          <span className="pp">0</span>
          <div className="prov-bar"><i style={{ width: '4%' }} /></div>
          <span className="pt">0 calls · awaiting first chat</span>
        </div>
      )}
      {byModel.length === 0 && !placeholder && (
        <div className="prov-row" style={{ opacity: 0.55 }}>
          <span className="pi">◆</span>
          <b>No provider configured</b>
          <span className="pl">IDLE</span>
          <span className="pp">0</span>
          <div className="prov-bar"><i style={{ width: '4%' }} /></div>
          <span className="pt">set LLM_PROVIDER in .env</span>
        </div>
      )}
      {byModel.slice(0, 6).map((p, i) => (
        <div key={p.name} className="prov-row">
          <span className="pi">{['◆', '◈', '⬡', '◉', '⬢', '◇'][i % 6]}</span>
          <b title={p.name}>{p.name}</b>
          <span className="pl">{(p.tokens / 1000).toFixed(1)}K tk</span>
          <span className="pp">{p.calls}</span>
          <div className="prov-bar"><i style={{ width: `${(p.calls / maxCalls) * 100}%` }} /></div>
          <span className="pt">${p.cost.toFixed(3)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 7, fontSize: 8.5, color: 'var(--text-faint)' }}>
        <span>TOTAL <b style={{ color: 'var(--text)' }}>{ledger.summary?.totalCalls ?? 0}</b> calls · <b style={{ color: 'var(--text)' }}>{((ledger.summary?.totalTokens ?? 0) / 1000).toFixed(1)}K</b> tokens</span>
        <span style={{ color: 'var(--cyan)' }}>${(ledger.summary?.totalCost ?? 0).toFixed(4)}</span>
      </div>
    </Panel>
  );
}

function MemoryThreadsCard() {
  // REAL data: knowledge pool stats (:7885 /pool/stats)
  const { stats, connected } = usePool();
  return (
    <Panel title="MEMORY THREADS" right={<span>{connected ? `${stats.memories.toLocaleString()} MEMORIES` : 'POOL OFFLINE'}</span>} bodyClass="nopad">
      <div className="viz-wrap" style={{ minHeight: 96 }}>
        <Viz kind="threads" />
        <div className="viz-overlay" style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 3 }}>
          {[['MEMORIES', stats?.memories, 'g'], ['SKILLS', stats?.skillsCount, 'c'], ['ROUTING', stats?.routingProfiles, 'p']].map(([k, v, d]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', width: 104, fontSize: 9 }}>
              <span style={{ color: 'var(--text-dim)' }}><span className={`dot ${d}`} style={{ marginRight: 5 }} />{k}</span>
              <b style={{ color: 'var(--text)' }}>{typeof v === 'number' ? v.toLocaleString() : '—'}</b>
            </div>
          ))}
          <div style={{ width: 104, display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(118,60,200,0.25)', paddingTop: 3, fontSize: 9 }}>
            <span style={{ color: 'var(--text-dim)' }}>QUERIES</span><b>{stats?.queries != null ? stats.queries.toLocaleString() : '—'}</b>
          </div>
          <div style={{ width: 104, textAlign: 'right', fontSize: 8, color: 'var(--purple-2)', cursor: 'pointer', letterSpacing: '0.12em' }}>BROWSE</div>
        </div>
      </div>
    </Panel>
  );
}

function SelfEvolutionCard() {
  // REAL data: pool learnings + agent-scores eval meta
  const { stats } = usePool();
  const scores = useScores();
  const failures = stats?.failures ?? null;
  const queries = stats?.queries ?? null;
  const evalScore = (failures != null && queries) ? (1 - failures / Math.max(1, queries)).toFixed(3) : null;
  return (
    <Panel title="SELF-EVOLUTION" right={<span className="tag purple">GENESIS LIVE</span>} bodyClass="nopad">
      <div className="viz-wrap" style={{ minHeight: 104 }}>
        <Viz kind="brain" />
        <div className="viz-overlay" style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 3 }}>
          {[['LEARNINGS', stats?.memories], ['ADAPTATIONS', stats?.routingProfiles], ['EVAL SCORE', evalScore], ['FAILURES', failures]].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', width: 112, fontSize: 9 }}>
              <span style={{ color: 'var(--text-dim)' }}>{k}</span>
              <b style={{ color: k === 'FAILURES' && v ? 'var(--red)' : 'var(--text)' }}>{v != null ? (typeof v === 'number' ? v.toLocaleString() : v) : '—'}</b>
            </div>
          ))}
          <div style={{ width: 112, textAlign: 'right', fontSize: 8.5, marginTop: 3 }}>
            <span style={{ color: 'var(--text-dim)' }}>TASKS</span> <b className="glow-g">{scores.meta?.totalTasksRecorded ?? 0}</b>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function MochiCard() {
  const { mochi } = useData();
  const m = mochi.data;
  return (
    <Panel title="MOCHI" dot={mochi.connected ? 'p' : 'r'} sub={mochi.connected ? '🐾 COMPANION ONLINE' : 'OFFLINE'}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div className="mochi-cat">🐱</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mochi-bubble">
            {m?.message || m?.greeting || (mochi.connected
              ? `Hey Boss! Systems nominal and ${m?.name || 'Mochi'}'s got your back. Shall we crush some missions today?`
              : 'Mochi is napping — wake the stack with `purpclaw safe-start --core`.')}
          </div>
          <div className="mochi-mood">
            <span>MOOD</span>
            <b>{(m?.mood || (mochi.connected ? 'HYPED' : 'SLEEPY')).toUpperCase()} <span style={{ color: 'var(--magenta)' }}>♥</span></b>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function MissionScreen({ chat }) {
  const root = React.useRef(null);
  React.useEffect(() => {
    if (!window.gsap || !root.current) return;
    gsap.fromTo(root.current.querySelectorAll('.panel'),
      { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.04, ease: 'power2.out', clearProps: 'opacity,transform' });
  }, []);
  return (
    <div ref={root} className="screen" style={{ display: 'grid', gridTemplateRows: '172px 1fr', gap: 10, overflow: 'hidden' }}>
      <div className="grid" style={{ gridTemplateColumns: '1.15fr 1.15fr 1.2fr 1.1fr 1.1fr', minHeight: 0 }}>
        <ServicesCard /><AgentsCard /><EventsCard /><RiskGateCard /><DreamSwarmCard />
      </div>
      <div className="grid" style={{ gridTemplateColumns: '216px 1fr 300px', minHeight: 0 }}>
        <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 10, minHeight: 0 }}>
          <TowerMini /><OrchMini /><EvtStreamMini />
        </div>
        <MissionChat chat={chat} />
        <div style={{ display: 'grid', gridTemplateRows: 'auto auto auto 1fr', gap: 10, minHeight: 0, overflow: 'auto' }}>
          <ProviderRouter /><MemoryThreadsCard /><SelfEvolutionCard /><MochiCard />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MissionScreen, ProviderRouter, MochiCard, MemoryThreadsCard, SelfEvolutionCard });
