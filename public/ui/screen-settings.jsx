/* screen-settings.jsx — SETTINGS CENTER (mockup 2)
 * Left: settings nav handled by main sidebar; here: header bar (profile/scope/mode/apply),
 * filters, presets row, settings table grouped by section, right rail: live preview /
 * router flow / telemetry snapshot / system notes + config scope.
 * Backed by GET/POST :7780 /api/settings — unknown keys are stored, real ones drive runtime.
 */

const SETTINGS_SCHEMA = [
  {
    section: 'CORE SERVICES',
    items: [
      { key: 'orchestratorMode', name: 'Orchestrator Mode', desc: 'Determines scheduling & coordination strategy', type: 'select', options: ['Adaptive Parallel', 'Sequential', 'Priority Queue', 'Chaos'], def: 'Adaptive Parallel', scope: 'System' },
      { key: 'eventBusThroughput', name: 'Event Bus Throughput', desc: 'Max events per second', type: 'slider', min: 1000, max: 500000, def: 250000, fmt: v => `${Math.round(v / 1000)}K eps`, scope: 'System' },
      { key: 'serviceAutoRestart', name: 'Service Auto-Restart', desc: 'Automatically restart failed services', type: 'toggle', def: true, scope: 'System' },
    ],
  },
  {
    section: 'AGENTS',
    items: [
      { key: 'maxActiveAgents', name: 'Max Active Agents', desc: 'Concurrency limit for active agents', type: 'slider', min: 1, max: 256, def: 128, fmt: v => `${Math.round(v)}`, scope: 'User' },
      { key: 'agentMeshTopology', name: 'Agent Mesh Topology', desc: 'How agents discover & connect', type: 'select', options: ['Small World', 'Full Mesh', 'Star', 'Ring'], def: 'Small World', scope: 'User' },
      { key: 'skillFailurePolicy', name: 'Skill Failure Policy', desc: 'Behavior when skill execution fails', type: 'select', options: ['Retry w/ Backoff', 'Fail Fast', 'Fallback Agent', 'Ignore'], def: 'Retry w/ Backoff', scope: 'User' },
    ],
  },
  {
    section: 'PROVIDER ROUTER',
    items: [
      { key: 'routingStrategy', name: 'Routing Strategy', desc: 'Primary routing algorithm', type: 'select', options: ['Latency + Cost', 'Latency First', 'Cost First', 'Round Robin'], def: 'Latency + Cost', scope: 'User' },
      { key: 'failoverMode', name: 'Failover Mode', desc: 'How to failover between providers', type: 'select', options: ['Health First', 'Sticky', 'Aggressive'], def: 'Health First', scope: 'User' },
      { key: 'maxCostPerRequest', name: 'Max Cost per Request', desc: 'Hard cap on provider spend', type: 'text', def: '$0.012', scope: 'User' },
    ],
  },
  {
    section: 'MEMORY SPINE',
    items: [
      { key: 'vectorDimension', name: 'Vector Dimension', desc: 'Embedding dimension', type: 'slider', min: 256, max: 4096, def: 1536, fmt: v => `${Math.round(v)}`, scope: 'Runtime' },
      { key: 'recallDepth', name: 'Recall Depth (k)', desc: 'Default recall depth', type: 'slider', min: 1, max: 100, def: 24, fmt: v => `${Math.round(v)}`, scope: 'Runtime' },
      { key: 'memoryTTL', name: 'Memory TTL', desc: 'Auto-expire memories after', type: 'select', options: ['7 days', '30 days', '90 days', 'Never'], def: '30 days', scope: 'User' },
    ],
  },
  {
    section: 'VOICE',
    items: [
      { key: 'wakeWordSensitivity', name: 'Wake Word Sensitivity', desc: 'How sensitive the wake word is', type: 'slider', min: 0, max: 100, def: 72, fmt: v => `${Math.round(v)}%`, scope: 'User' },
      { key: 'noiseSuppression', name: 'Noise Suppression', desc: 'Background noise reduction', type: 'select', options: ['Off', 'Light', 'Aggressive'], def: 'Aggressive', scope: 'User' },
      { key: 'inputDevice', name: 'Input Device', desc: 'Default microphone', type: 'select', options: ['System Default', 'USB Mic', 'Headset'], def: 'System Default', scope: 'User' },
    ],
  },
  {
    section: 'RISK GATE',
    items: [
      { key: 'approvalMode', name: 'Approval Mode', desc: 'Autonomy level for self-modification', type: 'select', options: ['read-only', 'workspace-write', 'full-auto'], def: 'workspace-write', scope: 'System' },
      { key: 'riskShieldLevel', name: 'Risk Shield Level', desc: 'Gate strictness across all 5 layers', type: 'slider', min: 0, max: 100, def: 80, fmt: v => `${Math.round(v)}%`, scope: 'System' },
      { key: 'destructiveOpsGate', name: 'Destructive Ops Gate', desc: 'Always require approval for destructive ops', type: 'toggle', def: true, scope: 'System' },
    ],
  },
];

const PRESETS = [
  { id: 'classic', icon: '◉', name: 'Classic', desc: 'Stable & predictable' },
  { id: 'hybrid', icon: '⇅', name: 'Hybrid', desc: 'Balanced power & control' },
  { id: 'immersive', icon: '⇶', name: 'Immersive', desc: 'Maximum presence' },
  { id: 'lowpower', icon: '⌁', name: 'Low Power', desc: 'Efficiency mode' },
  { id: 'chaos', icon: '⚙', name: 'Full Chaos', desc: 'No limits. All engines.' },
];

function SettingControl({ item, value, onChange }) {
  if (item.type === 'toggle') {
    const on = value ?? item.def;
    return (
      <div className="set-val">
        <div className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}><i /></div>
        <span style={{ fontSize: 9, color: on ? 'var(--magenta)' : 'var(--text-faint)' }}>{on ? 'ON' : 'OFF'}</span>
      </div>
    );
  }
  if (item.type === 'slider') {
    const v = Number(value ?? item.def);
    return (
      <div className="set-val">
        <input type="range" className="slider" min={item.min} max={item.max} value={v} onChange={e => onChange(Number(e.target.value))} />
        <span style={{ fontSize: 10, color: 'var(--text)', minWidth: 58, textAlign: 'right' }}>{item.fmt ? item.fmt(v) : v}</span>
      </div>
    );
  }
  if (item.type === 'select') {
    return (
      <select className="input" style={{ padding: '5px 8px', fontSize: 10 }} value={value ?? item.def} onChange={e => onChange(e.target.value)}>
        {item.options.map(o => <option key={o}>{o}</option>)}
      </select>
    );
  }
  return <input className="input" style={{ padding: '5px 8px', fontSize: 10 }} value={value ?? item.def} onChange={e => onChange(e.target.value)} />;
}

function RouterFlowMini() {
  const provs = [
    { name: 'MiniMax M2', pct: 95, cost: '$0.0012' },
    { name: 'DeepSeek', pct: 91, cost: '$0.0009' },
    { name: 'Claude', pct: 89, cost: '$0.0014' },
    { name: 'Gemini 2.5', pct: 88, cost: '$0.0011' },
    { name: 'Ollama', pct: 86, cost: '$0.0000' },
  ];
  return (
    <Panel title="ROUTER FLOW" right={<span className="tag green">● LIVE</span>}>
      <svg width="100%" height={provs.length * 26 + 10} style={{ display: 'block' }}>
        {provs.map((p, i) => {
          const y = 14 + i * 26, midY = (provs.length * 26) / 2 + 2;
          return <path key={i} d={`M 30 ${midY} C 70 ${midY}, 80 ${y}, 116 ${y}`} fill="none" stroke="rgba(34,211,238,0.4)" strokeWidth="1" />;
        })}
        <circle cx="22" cy={(provs.length * 26) / 2 + 2} r="4" fill="#e879f9" />
        <text x="6" y={(provs.length * 26) / 2 + 20} fill="#8b7bb8" fontSize="7.5" fontFamily="JetBrains Mono">USER</text>
        {provs.map((p, i) => {
          const y = 14 + i * 26;
          return (
            <g key={i}>
              <rect x="116" y={y - 9} width="118" height="18" fill="rgba(20,11,38,0.9)" stroke="rgba(118,60,200,0.3)" />
              <text x="123" y={y + 3} fill="#cfc3ee" fontSize="8" fontFamily="JetBrains Mono">{p.name} {p.pct}%</text>
              <text x="244" y={y + 3} fill="#5d5283" fontSize="7.5" fontFamily="JetBrains Mono">{p.cost}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ fontSize: 8.5, color: 'var(--text-faint)' }}>{provs.length} active routes</div>
    </Panel>
  );
}

function TelemetrySnapshot() {
  const { eventTimeline, services } = useData();
  const tps = eventTimeline.events.length * 12 || 2347;
  const lat = services.find(s => s.latency)?.latency ?? 412;
  return (
    <Panel title="TELEMETRY SNAPSHOT" right={<span className="tag cyan">LIVE</span>}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        {[
          ['TPS', tps.toLocaleString() + ' /s', '+12%', 'var(--cyan)'],
          ['P95 LATENCY', `${lat} ms`, '-8%', 'var(--green)'],
          ['ERROR RATE', '0.18 %', '-21%', 'var(--green)'],
          ['COST / MIN', '$0.042', '+5%', 'var(--amber)'],
        ].map(([k, v, d, c]) => (
          <div key={k}>
            <div style={{ fontSize: 7.5, color: 'var(--text-faint)', letterSpacing: '0.1em' }}>{k}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#f3ecff' }}>{v}</div>
            <div style={{ fontSize: 8, color: c }}>{d}</div>
          </div>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 10 }}>
        {[['EVENTS', '#e879f9'], ['LATENCY', '#2dd4bf'], ['ERRORS', '#f43f5e'], ['COST', '#4ade80']].map(([k, c], i) => (
          <div key={k}>
            <div style={{ fontSize: 7.5, color: 'var(--text-faint)', letterSpacing: '0.1em', marginBottom: 2 }}>{k}</div>
            <Spark data={seededSeries(24, i * 13 + 5)} w={62} h={22} color={c} fill />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SettingsScreen() {
  const S = window.__settingsSingleton;
  const { settings, connected, stage, apply, unsaved, reload } = S;
  const [preset, setPreset] = React.useState('hybrid');
  const [filter, setFilter] = React.useState('All');
  const [query, setQuery] = React.useState('');
  const [collapsed, setCollapsed] = React.useState({});
  const [applying, setApplying] = React.useState(false);
  const root = React.useRef(null);

  React.useEffect(() => {
    if (!window.gsap || !root.current) return;
    gsap.fromTo(root.current.querySelectorAll('.panel'), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.05, ease: 'power2.out', clearProps: 'opacity,transform' });
  }, []);

  const val = (key, def) => (settings && settings[key] !== undefined ? settings[key] : def);
  const visible = SETTINGS_SCHEMA.map(sec => ({
    ...sec,
    items: sec.items.filter(it => {
      if (query && !(it.name + it.desc + it.key).toLowerCase().includes(query.toLowerCase())) return false;
      if (filter === 'Modified') return settings && settings[it.key] !== undefined;
      if (filter === 'System' || filter === 'User' || filter === 'Runtime') return it.scope === filter;
      return true;
    }),
  })).filter(sec => sec.items.length);

  const doApply = async () => {
    setApplying(true);
    const ok = await apply();
    setApplying(false);
    if (window.gsap && root.current) {
      const btn = root.current.querySelector('.apply-btn');
      btn && gsap.fromTo(btn, { scale: 0.94 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' });
    }
    if (!ok) alert('Backend unreachable — settings not persisted (:7780 /api/settings)');
  };

  const modifiedCount = settings ? Object.keys(settings).length : 0;

  return (
    <div ref={root} className="screen" style={{ display: 'grid', gridTemplateColumns: '1fr 318px', gridTemplateRows: 'auto 1fr', gap: 10, overflow: 'hidden' }}>
      {/* header row spanning both columns */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.1em', color: '#efe7ff' }}>SETTINGS CENTER</div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>Control every layer of your PURPCLAW stack.</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 9.5 }}>
          <span style={{ color: 'var(--text-faint)' }}>PROFILE</span>
          <select className="ci-select" value={preset} onChange={e => setPreset(e.target.value)}>{PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <span style={{ color: 'var(--text-faint)' }}>SCOPE</span>
          <select className="ci-select" defaultValue="User"><option>User</option><option>System</option><option>Runtime</option></select>
          <span style={{ color: 'var(--text-faint)' }}>MODE</span>
          <span className="tag green">{connected ? 'Live' : 'Offline'}</span>
          <span style={{ color: 'var(--amber)' }}>UNSAVED ◦ {unsaved}</span>
          <button className="btn primary apply-btn" disabled={applying || !unsaved} onClick={doApply}>{applying ? 'APPLYING…' : 'APPLY CHANGES'}</button>
        </div>
      </div>

      {/* left column — presets + filters + table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
        <div className="panel" style={{ flex: 'none' }}>
          <div className="panel-bd" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="input" placeholder="Search settings, services, keys…  /" value={query} onChange={e => setQuery(e.target.value)} style={{ maxWidth: 320 }} />
              {['All', 'Modified', 'System', 'User', 'Runtime', 'Secret'].map(f => (
                <span key={f} className={`filter-chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                  {f}{f === 'Modified' && modifiedCount ? ` ◦ ${modifiedCount}` : ''}
                </span>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="btn sm ghost">⇣ IMPORT</button>
                <button className="btn sm ghost">⇡ EXPORT</button>
                <button className="btn sm danger" onClick={reload}>⟳ RESET ALL</button>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 8.5, color: 'var(--text-faint)', letterSpacing: '0.18em', marginBottom: 7 }}>PRESETS</div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
                {PRESETS.map(p => (
                  <div key={p.id} className={`preset ${preset === p.id ? 'active' : ''}`} onClick={() => setPreset(p.id)}>
                    <b>{p.icon} {p.name}</b><span>{p.desc}</span>
                    <span className="preset-apply">{preset === p.id ? 'ACTIVE' : 'APPLY'}</span>
                  </div>
                ))}
                <div className="preset" style={{ borderStyle: 'dashed', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>
                  <b style={{ color: 'var(--text-dim)' }}>+</b><span>SAVE PRESET</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel" style={{ flex: 1, minHeight: 0 }}>
          <div className="set-row" style={{ borderBottom: '1px solid var(--border)', background: 'rgba(10,5,22,0.6)' }}>
            <span style={{ fontSize: 8.5, color: 'var(--text-faint)', letterSpacing: '0.16em' }}>SETTING</span>
            <span style={{ fontSize: 8.5, color: 'var(--text-faint)', letterSpacing: '0.16em' }}>VALUE</span>
            <span style={{ fontSize: 8.5, color: 'var(--text-faint)', letterSpacing: '0.16em' }}>STATUS</span>
            <span style={{ fontSize: 8.5, color: 'var(--text-faint)', letterSpacing: '0.16em' }}>SCOPE</span>
            <span style={{ fontSize: 8.5, color: 'var(--text-faint)', letterSpacing: '0.16em' }}>LAST MODIFIED</span>
          </div>
          <div className="panel-bd nopad" style={{ overflowY: 'auto' }}>
            {visible.map(sec => (
              <div key={sec.section}>
                <div className="set-section" onClick={() => setCollapsed(c => ({ ...c, [sec.section]: !c[sec.section] }))}>
                  <span style={{ color: 'var(--text-faint)' }}>{collapsed[sec.section] ? '›' : '⌄'}</span> {sec.section}
                </div>
                {!collapsed[sec.section] && sec.items.map(it => (
                  <div key={it.key} className="set-row">
                    <div className="set-name">
                      <span className="set-dot" style={{ opacity: settings && settings[it.key] !== undefined ? 1 : 0.25 }} />
                      <div style={{ minWidth: 0 }}>
                        <span className="sn">{it.name}</span>
                        <span className="sd">{it.desc}</span>
                      </div>
                    </div>
                    <SettingControl item={it} value={settings ? settings[it.key] : undefined} onChange={v => stage(it.key, v)} />
                    <span className="set-status"><span className={`dot ${connected ? 'g' : 'a'}`} /> {connected ? 'Live' : 'Local'}</span>
                    <span className="set-scope">{it.scope}</span>
                    <span className="set-mod">{settings && settings[it.key] !== undefined ? 'modified' : '—'}</span>
                  </div>
                ))}
              </div>
            ))}
            {!visible.length && <div style={{ padding: 20, fontSize: 10, color: 'var(--text-faint)' }}>no settings match</div>}
          </div>
        </div>
      </div>

      {/* right rail */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflowY: 'auto' }}>
        <Panel title="LIVE PREVIEW" right={<span className="tag purple">OVERLAY</span>} bodyClass="nopad">
          <div className="viz-wrap" style={{ minHeight: 130 }}>
            <Viz kind="shield" />
            <div className="viz-overlay" style={{ alignItems: 'flex-end' }}>
              <div style={{ fontSize: 8.5, color: 'var(--text-dim)' }}>DREAM SWARM<br /><b className="glow-c" style={{ fontSize: 14 }}>SIGNAL 72%</b></div>
              <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 8.5, color: 'var(--text-dim)' }}>
                <span>THREAT LVL <b style={{ color: 'var(--text)' }}>2 / 100</b></span>
                <span>COHERENCE <b className="glow-c">HIGH</b></span>
              </div>
            </div>
          </div>
        </Panel>
        <RouterFlowMini />
        <TelemetrySnapshot />
        <Panel title="SYSTEM NOTES" sub="CONFIG SCOPE">
          <div style={{ border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.05)', padding: '9px 11px', fontSize: 9.5 }}>
            <b style={{ color: 'var(--amber)', letterSpacing: '0.1em', fontSize: 9 }}>☄ MODIFIED SETTINGS</b>
            <div style={{ color: 'var(--text-dim)', marginTop: 5 }}>You have unsaved changes. Apply or export your profile to persist.</div>
            <button className="btn sm" style={{ marginTop: 8, borderColor: 'rgba(251,191,36,0.5)', color: 'var(--amber)', background: 'transparent' }} onClick={doApply}>REVIEW CHANGES</button>
          </div>
          <div style={{ marginTop: 10 }}>
            {[['System', 58], ['User', 34], ['Runtime', 12], ['Secret', 9]].map(([k, v]) => (
              <div key={k} className="stat-row"><span className="k">▣ {k}</span><span className="v">{v} settings</span></div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

Object.assign(window, { SettingsScreen });
