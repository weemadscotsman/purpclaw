/* screen-orchestration.jsx — ORCHESTRATION COMMAND CENTER (mockup 4)
 * Cols: AGENT TOWER 3D | ORCHESTRATOR + SPAWN CHAIN + PIPELINES/TOOL ROUTING/TASK QUEUE | DIVISIONS + KERNEL+SWARM | LEADERBOARD + OUTCOMES + HIERARCHY
 * Real data: tower roster (:7790), pipeline (:7784), spawn via /api/spawn.
 */

function AgentTowerPanel() {
  const { floors, agents } = useData();
  const named = floors.filter(f => f.div !== 'LOBBY' && f.agents > 0);
  return (
    <Panel title="◎ AGENT TOWER" sub="STRATUM OVERVIEW" bodyClass="nopad" style={{ height: '100%' }}>
      <div className="viz-wrap" style={{ minHeight: 320 }}>
        <Viz kind="tower" />
        <div className="viz-overlay" style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 8 }}>
          {(named.length ? named : floors.filter(f => f.div !== 'LOBBY')).slice(0, 7).map((f, i, arr) => (
            <div key={f.id} style={{ fontSize: 8.5, textAlign: 'right' }}>
              <span style={{ color: 'var(--cyan)' }}>L{arr.length - i}</span>{' '}
              <span style={{ color: 'var(--text-dim)' }}>{divMeta(f.div).name.toUpperCase()}</span>
              <div style={{ color: 'var(--text-faint)', fontSize: 8 }}>{f.agents} Agents</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 'none', padding: '9px 12px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 8.5, color: 'var(--text-faint)', letterSpacing: '0.16em', marginBottom: 7 }}>TOWER CONTROLS</div>
        <div style={{ display: 'flex', gap: 7 }}>
          <button className="btn sm ghost">⏻ POWER CYCLE</button>
          <button className="btn sm ghost">⟳ BALANCE LOAD</button>
          <button className="btn sm ghost">⊞ REBUILD</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontSize: 9 }}>
          <span style={{ color: 'var(--text-dim)' }}>STATUS</span>
          <span><b className="glow-g">{agents.length ? 'NOMINAL' : 'DARK'}</b> <span className={`dot ${agents.length ? 'g' : 'a'}`} style={{ marginLeft: 5 }} /></span>
        </div>
      </div>
    </Panel>
  );
}

function OrchestratorPanel() {
  const [tab, setTab] = React.useState('COMMAND');
  const [directive, setDirective] = React.useState('');
  const [deploying, setDeploying] = React.useState(false);
  const [result, setResult] = React.useState(null);

  const deploy = async () => {
    if (!directive.trim() || deploying) return;
    setDeploying(true); setResult(null);
    let r = null;
    for (const url of ['http://localhost:7784/api/orchestrate', '/api/service-proxy?port=7784&path=' + encodeURIComponent('/api/orchestrate')]) {
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: directive, priority: 'high' }), signal: AbortSignal.timeout(8000) });
        if (res.ok) { r = await res.json(); break; }
      } catch {}
    }
    setResult(r ? { ok: true, id: r.workflowId || r.id || 'dispatched' } : { ok: false });
    setDeploying(false);
  };

  return (
    <Panel title="ORCHESTRATOR" right={
      <div style={{ display: 'flex', gap: 2 }}>
        {['COMMAND', 'DELEGATE', 'OBSERVE'].map(t => (
          <span key={t} className={`filter-chip ${tab === t ? 'active' : ''}`} style={{ padding: '2px 6px', fontSize: 7.5 }} onClick={() => setTab(t)}>{t}</span>
        ))}
      </div>}>
      <div style={{ fontSize: 8.5, color: 'var(--text-faint)', letterSpacing: '0.14em' }}>DIRECTIVE</div>
      <textarea className="input" rows={3} style={{ marginTop: 5, resize: 'none', fontSize: 10.5 }}
        placeholder="Launch a coordinated research and intel sweep across DeFi, AI infra, and L2 ecosystems. Prioritize novel exploits, yield opps, and protocol risk."
        value={directive} onChange={e => setDirective(e.target.value)} />
      <div style={{ fontSize: 8.5, color: 'var(--text-faint)', letterSpacing: '0.14em', marginTop: 9 }}>OBJECTIVES</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
        {['research', 'intel', 'defi', 'infrastructure', 'risk'].map(o => <span key={o} className="tag purple">{o}</span>)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <span style={{ fontSize: 8.5, color: 'var(--text-faint)', letterSpacing: '0.14em' }}>PRIORITY</span>
        <b style={{ color: 'var(--pink)', fontSize: 10 }}>HIGH ›››</b>
      </div>
      <button className="btn primary" style={{ width: '100%', marginTop: 11, padding: '10px 0' }} onClick={deploy} disabled={deploying}>
        {deploying ? 'DEPLOYING…' : 'DEPLOY MISSION →'}
      </button>
      {result && (
        <div style={{ marginTop: 8, fontSize: 9, color: result.ok ? 'var(--green)' : 'var(--red)' }}>
          {result.ok ? `✓ dispatched — workflow ${result.id}` : '✕ orchestrator unreachable (:7784)'}
        </div>
      )}
    </Panel>
  );
}

function OrchestratorAI() {
  const { agents, anyConnected } = useData();
  return (
    <Panel title="ORCHESTRATOR AI" bodyClass="nopad">
      <div className="viz-wrap" style={{ minHeight: 168 }}>
        <Viz kind="halo" />
        <div className="viz-overlay" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ border: '1px solid var(--border-hi)', background: 'rgba(12,6,24,0.85)', padding: '10px 16px', textAlign: 'center' }}>
            <b style={{ color: '#fff', fontSize: 11, letterSpacing: '0.1em' }}>ORCH-A7</b>
            <div style={{ fontSize: 8.5, color: anyConnected ? 'var(--green)' : 'var(--amber)', marginTop: 3 }}>{anyConnected ? 'ACTIVE ●' : 'STANDBY ○'}</div>
          </div>
        </div>
      </div>
      <div style={{ flex: 'none', padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 8.5, color: 'var(--text-faint)', letterSpacing: '0.14em' }}>DECISION CONFIDENCE</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 5 }}>
          <b style={{ fontSize: 13, color: '#fff' }}>{anyConnected ? '94%' : '—'}</b>
          <Meter pct={anyConnected ? 94 : 0} color="linear-gradient(90deg,var(--teal),var(--cyan))" w="100%" />
        </div>
      </div>
    </Panel>
  );
}

function SpawnChain() {
  const [spawning, setSpawning] = React.useState(null);
  const chain = [
    { name: 'ORCH-A7', role: 'Commander', icon: '👑', lvl: 7 },
    { name: 'RESEARCH-12', role: 'Analyst', icon: '🔬', lvl: 5 },
    { name: 'SCRAPER-44', role: 'Collector', icon: '🛰', lvl: 4 },
    { name: 'EVAL-9X', role: 'Validator', icon: '🛡', lvl: 4 },
    { name: 'EXEC-77', role: 'Operator', icon: '⚙', lvl: 5 },
  ];
  const templates = ['RESEARCHER', 'SCRAPER', 'ANALYST', 'VALIDATOR', 'OPERATOR', 'COORDINATOR', 'CUSTOM +'];

  const spawn = async (tpl) => {
    if (spawning) return;
    setSpawning(tpl);
    for (const url of ['http://localhost:7790/api/spawn', '/api/service-proxy?port=7790&path=' + encodeURIComponent('/api/spawn')]) {
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: tpl.toLowerCase(), task: `spawned from UI (${tpl})` }), signal: AbortSignal.timeout(8000) });
        if (r.ok) break;
      } catch {}
    }
    setTimeout(() => setSpawning(null), 800);
  };

  return (
    <Panel title="SPAWN CHAIN" right={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>AUTO-SPAWN <span className="toggle on" style={{ transform: 'scale(0.85)' }}><i /></span></span>}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'stretch', overflowX: 'auto', paddingBottom: 4 }}>
        {chain.map((c, i) => (
          <React.Fragment key={c.name}>
            <div className="spawn-node">
              <b>{c.name}</b><span className="sr">{c.role}</span>
              <span className="si">{c.icon}</span>
              <span className="sl">LVL {c.lvl}</span>
            </div>
            {i < chain.length - 1 && <div className="spawn-arrow">SPAWNS<br />→</div>}
          </React.Fragment>
        ))}
      </div>
      <div style={{ fontSize: 8.5, color: 'var(--text-faint)', letterSpacing: '0.14em', margin: '9px 0 6px' }}>SPAWN TEMPLATES</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {templates.map(t => (
          <span key={t} className={`filter-chip ${spawning === t ? 'active' : ''}`} onClick={() => spawn(t)}>
            {spawning === t ? '◌ SPAWNING' : t}
          </span>
        ))}
      </div>
    </Panel>
  );
}

function DivisionsPanel() {
  const { floors } = useData();
  const divs = floors.filter(f => f.div !== 'LOBBY' && f.agents > 0);
  const fallback = [
    { div: 'INTELLIGENCE', agents: 0 }, { div: 'ENGINEERING', agents: 0 },
    { div: 'SECURITY', agents: 0 }, { div: 'OPERATIONS', agents: 0 },
  ];
  const list = divs.length ? divs : fallback;
  return (
    <Panel title="DIVISIONS" right={<span>{list.length} ACTIVE</span>}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {list.slice(0, 8).map((d, i) => {
          const meta = divMeta(d.div);
          const eff = d.agents ? Math.min(99, 80 + (d.working || 0) * 4 + (i % 7)) : 0;
          return (
            <div key={d.div} className="div-card">
              <div className="dc-hd"><b>{meta.name.toUpperCase().slice(0, 9)}</b><span>LVL {Math.max(1, Math.min(7, d.agents))}</span></div>
              <div style={{ height: 44, position: 'relative', margin: '6px 0', overflow: 'hidden' }}>
                <MiniMesh color={meta.color} seed={i + 3} />
              </div>
              <div className="dc-stats">
                <span><b>{d.agents}</b>AGENTS</span>
                <span style={{ textAlign: 'right' }}><b>{eff ? `${eff}%` : '—'}</b>EFFICIENCY</span>
              </div>
            </div>
          );
        })}
        {list.length < 8 && (
          <div className="div-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', color: 'var(--text-faint)', cursor: 'pointer', minHeight: 96 }}>
            <div style={{ fontSize: 18 }}>+</div><div style={{ fontSize: 8, letterSpacing: '0.12em' }}>CREATE DIVISION</div>
          </div>
        )}
      </div>
    </Panel>
  );
}

/* tiny canvas mesh for division cards (2D, cheap) */
function MiniMesh({ color = '#22d3ee', seed = 1 }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width = cv.clientWidth * 2, H = cv.height = cv.clientHeight * 2;
    let x = seed * 7919, rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    const pts = Array.from({ length: 7 }, () => ({ x: rnd() * W, y: rnd() * H, dx: (rnd() - .5) * .6, dy: (rnd() - .5) * .6 }));
    let raf, dead = false;
    function draw() {
      if (dead) return;
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = color + '44'; ctx.fillStyle = color;
      pts.forEach(p => { p.x = (p.x + p.dx + W) % W; p.y = (p.y + p.dy + H) % H; });
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < W * 0.45) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, 7); ctx.fill(); });
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => { dead = true; cancelAnimationFrame(raf); };
  }, [color, seed]);
  return <canvas ref={ref} style={{ width: '100%', height: '100%' }} />;
}

function KernelSwarmPanel() {
  const { agents, anyConnected } = useData();
  return (
    <Panel title="KERNEL+SWARM">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <div style={{ fontSize: 8.5, color: 'var(--text-faint)', letterSpacing: '0.14em' }}>KERNEL CORE</div>
          <div style={{ marginTop: 6 }}>
            <b style={{ color: '#fff', fontSize: 12 }}>KERNEL-Q</b>
            <div style={{ fontSize: 8.5, color: 'var(--text-dim)' }}>v3.7 <b className={anyConnected ? 'glow-g' : ''} style={{ marginLeft: 6 }}>{anyConnected ? 'STABLE' : 'DARK'}</b></div>
          </div>
          {[['CPU', 68], ['MEM', 72], ['NET', 91]].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, fontSize: 8.5 }}>
              <span style={{ color: 'var(--text-dim)', width: 26 }}>{k}</span>
              <Meter pct={anyConnected ? v : 4} w="100%" h={4} />
              <span style={{ color: 'var(--text)', width: 28, textAlign: 'right' }}>{anyConnected ? `${v}%` : '—'}</span>
            </div>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 8.5, color: 'var(--text-faint)', letterSpacing: '0.14em' }}>SWARM OVERVIEW</div>
          <div className="big-num" style={{ fontSize: 24 }}><Counter value={agents.length} /></div>
          <div style={{ fontSize: 8.5, color: 'var(--text-dim)' }}>TOTAL AGENTS</div>
          <div style={{ marginTop: 6, fontSize: 8.5 }}>
            {[['ACTIVE', agents.filter(a => a.status === 'working').length, 'p'], ['IDLE', agents.filter(a => a.status === 'idle').length, 'c'], ['SPAWNING', 0, 'a'], ['OFFLINE', 0, 'r']].map(([k, v, d]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5px 0' }}>
                <span style={{ color: 'var(--text-dim)' }}><span className={`dot ${d}`} style={{ marginRight: 5 }} />{k}</span><b>{v}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function WorkflowPipelines() {
  const { pipeline } = useData();
  const wf = (pipeline?.workflows || pipeline?.recent || []).slice(0, 5);
  const fallback = [
    { name: 'DeFi Research Pipeline', agents: 18, pct: 93 },
    { name: 'AI Infra Watch', agents: 14, pct: 91 },
    { name: 'L2 Risk Monitor', agents: 12, pct: 89 },
    { name: 'Yield Opportunity Scanner', agents: 16, pct: 94 },
  ];
  const rows = wf.length ? wf.map(w => ({ name: w.name || w.task?.slice(0, 34) || w.id, agents: w.agents?.length ?? w.agentCount ?? '—', pct: w.progress ?? (w.status === 'completed' ? 100 : 50) })) : fallback;
  return (
    <Panel title="WORKFLOW PIPELINES" sub="LIVE PIPELINES" right={<span style={{ cursor: 'pointer' }}>✕</span>}>
      {rows.map((r, i) => (
        <div key={i} className="pipe-row">
          <div className="pr-hd">
            <b>◇ {r.name}</b>
            <span style={{ fontSize: 8.5, color: 'var(--text-dim)' }}>{r.agents} AGENTS<br /><b style={{ color: 'var(--cyan)' }}>{r.pct}%</b></span>
          </div>
          <div className="pr-stages"><em>COLLECT</em>›<em>ANALYZE</em>›<em>VALIDATE</em>›<em>REPORT</em></div>
        </div>
      ))}
      <div style={{ paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--purple-2)', cursor: 'pointer' }}>
        <span>+ NEW PIPELINE</span><span>→</span>
      </div>
    </Panel>
  );
}

function ToolRouting() {
  const rows = [
    ['WEB SEARCH', 'Serper API', '24.1k calls', 92],
    ['ON-CHAIN DATA', 'Alchemy', '18.7k calls', 95],
    ['NEWS & FEEDS', 'GDELT API', '12.3k calls', 90],
    ['AI MODEL', 'OpenRouter', '8.9k calls', 93],
    ['STORAGE', 'Arweave', '6.2k calls', 98],
  ];
  return (
    <Panel title="TOOL ROUTING" sub="ACTIVE ROUTES" right={<span style={{ cursor: 'pointer' }}>⤢</span>}>
      {rows.map(([k, p, c, h], i) => (
        <div key={i} className="stat-row" style={{ borderBottom: '1px solid rgba(118,60,200,0.1)', padding: '6px 0' }}>
          <span className="k"><span className="dot c" /> <b style={{ color: 'var(--text)', fontWeight: 600 }}>{k}</b> <span style={{ color: 'var(--text-faint)' }}>{p}</span></span>
          <span className="v" style={{ fontSize: 9 }}><span style={{ color: 'var(--text-dim)' }}>{c}</span> <b className="glow-c" style={{ marginLeft: 7 }}>{h}%</b></span>
        </div>
      ))}
      <button className="btn sm ghost" style={{ width: '100%', marginTop: 9 }}>MANAGE TOOLS →</button>
    </Panel>
  );
}

function TaskQueue() {
  const { eventTimeline, stream } = useData();
  const evts = (eventTimeline.events.length ? eventTimeline.events : stream.events).slice(0, 6);
  const fallback = [
    { m: 'Investigate new LRT exploit vector', a: 'RESEARCH-12', t: '2m ago' },
    { m: 'Scan for mispriced L2 bridges', a: 'SCRAPER-44', t: '4m ago' },
    { m: 'Validate Uniswap v4 hooks', a: 'EVAL-9X', t: '6m ago' },
    { m: 'Monitor governance attacks', a: 'RISK-BOT-3', t: '7m ago' },
    { m: 'Track whale onchain movements', a: 'INTEL-7A', t: '9m ago' },
  ];
  const rows = evts.length ? evts.map(e => ({ m: e.message || e.type || e.topic || 'task', a: e.agentName || e.agentId || 'SWARM', t: ago(e.ts || e._time || Date.now()) })) : fallback;
  const [tab, setTab] = React.useState('ACTIVE');
  return (
    <Panel title="TASK QUEUE" sub="LIVE TASKS" right={<span style={{ cursor: 'pointer' }}>✕</span>}>
      <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
        {[`ACTIVE (${rows.length})`, 'PENDING (12)', 'COMPLETED'].map((t, i) => (
          <span key={t} className={`filter-chip ${i === 0 === (tab === 'ACTIVE') && i === 0 ? 'active' : ''}`} style={{ padding: '3px 8px', fontSize: 8 }} onClick={() => setTab(t)}>{t}</span>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={i} className="task-row">
          <span className="tm">{r.m}</span>
          <span className="ta">{String(r.a).toUpperCase().slice(0, 12)}</span>
          <span className="tt">{r.t}</span>
        </div>
      ))}
      <button className="btn sm ghost" style={{ width: '100%', marginTop: 9 }}>VIEW ALL TASKS →</button>
    </Panel>
  );
}

function Leaderboard() {
  const { agents } = useData();
  const fallback = [
    ['ORCH-A7', '9,214,330'], ['NEXUS-9', '7,812,990'], ['STRATOS-5', '6,604,221'], ['PURPCLAW-01', '5,331,009'], ['ECHO-3', '4,882,117'],
  ];
  const rows = agents.length
    ? agents.slice(0, 5).map((a, i) => [a.name.toUpperCase(), ((5 - i) * 1.7e6 + 214330).toLocaleString()])
    : fallback;
  return (
    <Panel title="LEADERBOARD" sub="TOP COMMANDERS">
      {rows.map(([n, xp], i) => (
        <div key={n} className="lb-row">
          <span className="rank">{i + 1}</span>
          <span style={{ fontSize: 12 }}>{['👑', '🔮', '🛰', '⚙', '🛡'][i]}</span>
          <b>{n}</b>
          <span className="xp">{xp} XP</span>
        </div>
      ))}
      <button className="btn sm ghost" style={{ width: '100%', marginTop: 9 }}>VIEW FULL LEADERBOARD →</button>
    </Panel>
  );
}

function OutcomesPanel() {
  const { pipeline, eventTimeline } = useData();
  const completed = pipeline?.completed ?? 312;
  const rows = [
    ['MISSIONS COMPLETED', completed, '+24%'],
    ['DATA ACQUIRED', '2.41 TB', '+18%'],
    ['VALUE DISCOVERED', '$4.82M', '+31%'],
    ['RISKS IDENTIFIED', 127, '+12%'],
    ['AUTONOMOUS ACTIONS', eventTimeline.events.length * 47 || 9812, '+27%'],
    ['SUCCESS RATE', '93.6%', '+6%'],
  ];
  return (
    <Panel title="OUTCOMES" sub="IMPACT SUMMARY">
      {rows.map(([k, v, d]) => (
        <div key={k} className="stat-row">
          <span className="k">{k}</span>
          <span className="v">{typeof v === 'number' ? v.toLocaleString() : v} <span style={{ color: 'var(--green)', fontSize: 8.5, marginLeft: 5 }}>{d}</span></span>
        </div>
      ))}
      <button className="btn sm ghost" style={{ width: '100%', marginTop: 9 }}>VIEW IMPACT REPORT →</button>
    </Panel>
  );
}

function SwarmHierarchy() {
  const { agents } = useData();
  const names = agents.length ? agents.map(a => a.name.toUpperCase()) : ['RESEARCH-12', 'INTEL-7A', 'SCRAPER-44', 'EVAL-9X', 'RISK-BOT-3', 'WORKER-01', 'WORKER-02', 'WORKER-03'];
  return (
    <Panel title="SWARM HIERARCHY" right={<span style={{ cursor: 'pointer' }}>✕</span>}>
      <div style={{ textAlign: 'center' }}>
        <span className="tag purple" style={{ fontSize: 9 }}>👑 ORCH-A7 · LVL 7</span>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 26, margin: '7px 0 0' }}>
          <span style={{ color: 'var(--text-faint)' }}>╱</span><span style={{ color: 'var(--text-faint)' }}>╲</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 2 }}>
          {names.slice(0, 2).map(n => <span key={n} className="tag amber" style={{ fontSize: 8.5 }}>◈ {n.slice(0, 12)} · L5</span>)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 18, margin: '6px 0 0' }}>
          <span style={{ color: 'var(--text-faint)' }}>╱</span><span style={{ color: 'var(--text-faint)' }}>│</span><span style={{ color: 'var(--text-faint)' }}>╲</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginTop: 2, flexWrap: 'wrap' }}>
          {names.slice(2, 5).map(n => <span key={n} className="tag pink" style={{ fontSize: 8 }}>◇ {n.slice(0, 11)} · L4</span>)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginTop: 8, flexWrap: 'wrap' }}>
          {names.slice(5, 8).map(n => <span key={n} className="tag" style={{ fontSize: 8 }}>▫ {n.slice(0, 11)}</span>)}
          {names.length > 8 && <span className="tag" style={{ fontSize: 8 }}>…</span>}
        </div>
        <div style={{ marginTop: 10, fontSize: 8.5, color: 'var(--amber)' }}>👑 AGENTS CAN COMMAND OTHER AGENTS</div>
      </div>
    </Panel>
  );
}

function OrchestrationScreen() {
  const root = React.useRef(null);
  React.useEffect(() => {
    if (!window.gsap || !root.current) return;
    gsap.fromTo(root.current.querySelectorAll('.panel'), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.04, ease: 'power2.out', clearProps: 'opacity,transform' });
  }, []);
  return (
    <div ref={root} className="screen" style={{ display: 'grid', gridTemplateColumns: '296px 1fr 276px', gap: 10, alignContent: 'start' }}>
      {/* left: tower full height */}
      <div style={{ gridRow: 'span 3', display: 'flex', flexDirection: 'column', minHeight: 620 }}><AgentTowerPanel /></div>

      {/* middle: row 1 — orchestrator | orch AI | divisions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.62fr 1.5fr', gap: 10 }}>
        <OrchestratorPanel />
        <OrchestratorAI />
        <DivisionsPanel />
      </div>
      {/* right rail */}
      <div style={{ gridRow: 'span 3', display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 10, alignContent: 'start' }}>
        <Leaderboard />
        <OutcomesPanel />
        <SwarmHierarchy />
      </div>

      {/* middle row 2 — spawn chain | kernel+swarm */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 10 }}>
        <SpawnChain />
        <KernelSwarmPanel />
      </div>

      {/* middle row 3 — pipelines | tool routing | task queue */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1.1fr', gap: 10 }}>
        <WorkflowPipelines />
        <ToolRouting />
        <TaskQueue />
      </div>
    </div>
  );
}

Object.assign(window, { OrchestrationScreen, MiniMesh });
