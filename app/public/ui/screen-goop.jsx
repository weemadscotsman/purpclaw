/* screen-goop.jsx — GOOP PLAYGROUND / API BROKER & REGISTRY (mockup 5)
 * Header strip stats | API search & discovery | broker health ring | squirrel monitor
 * usage ledger | cache performance | adapters status | agent permissions | live data flow | activity feed
 */

function GoopHeaderStrip() {
  const { services, eventTimeline } = useData();
  const reqMin = eventTimeline.events.length * 103 || 24783;
  const stats = [
    ['REGISTERED APIS', '5,642'], ['ACTIVE BROKERED', '1,285'],
    ['REQ/MIN', reqMin.toLocaleString()], ['ERROR RATE', '0.16%'],
    ['CACHE HIT RATE', '93.7%'], ['SYSTEM HEALTH', services.some(s => s.status === 'online') ? 'OPTIMAL' : 'DARK'],
  ];
  return (
    <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', background: 'var(--panel)' }}>
      {stats.map(([k, v], i) => (
        <div key={k} style={{ flex: 1, padding: '8px 14px', borderRight: i < stats.length - 1 ? '1px solid rgba(118,60,200,0.18)' : 'none' }}>
          <div style={{ fontSize: 7.5, color: 'var(--text-faint)', letterSpacing: '0.16em' }}>{k}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: k === 'SYSTEM HEALTH' ? 'var(--green)' : '#f3ecff', marginTop: 2 }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

const GOOP_APIS = [
  { icon: '🟣', name: 'DeepSeek Chat Completion API', ver: 'v1.3.2', verified: true, tags: ['AI/ML', 'Language', 'Chat'], desc: 'Advanced language model inference and completion.', provider: 'DeepSeek', uptime: '99.95%', health: '100%', latency: '128ms', err: '0.03%', rpm: '1,842', rate: '1,000/min', cost: '$0.002 / 1K tok' },
  { icon: '🟢', name: 'CoinGecko Market Data API', ver: 'v3.2.1', verified: true, tags: ['Finance', 'Crypto', 'Market Data'], desc: 'Real-time cryptocurrency prices and market data.', provider: 'CoinGecko', uptime: '99.88%', health: '99.8%', latency: '203ms', err: '0.07%', rpm: '832', rate: '2,000/min', cost: '$0.001 / call' },
  { icon: '🟡', name: 'Weather Underground API', ver: 'v2.0.8', verified: false, tags: ['Weather', 'Forecast', 'Location'], desc: 'Weather forecasts, alerts, and historical data.', provider: 'Weather Underground', uptime: '97.12%', health: '97.1%', latency: '412ms', err: '1.32%', rpm: '128', rate: '500/min', cost: '$0.0005 / call' },
  { icon: '🟪', name: 'Internal Knowledge Graph API', ver: 'v1.1.0', internal: true, tags: ['Internal', 'Graph', 'Knowledge'], desc: 'Internal knowledge graph and entity relationships.', provider: 'PURPCLAW Core', uptime: '100%', health: '100%', latency: '18ms', err: '0%', rpm: '2,156', rate: 'Unlimited', cost: 'Internal' },
];

function ApiSearchPanel() {
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState('Verified');
  const list = GOOP_APIS.filter(a => !q || (a.name + a.tags.join()).toLowerCase().includes(q.toLowerCase()));
  return (
    <Panel title="API SEARCH & DISCOVERY" style={{ height: '100%' }}>
      <input className="input" placeholder="Search APIs, providers, categories, tags…" value={q} onChange={e => setQ(e.target.value)} />
      <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
        {['All', 'Verified', 'Unverified', 'Internal', 'External'].map(f => (
          <span key={f} className={`filter-chip ${filter === f ? 'active' : ''}`} style={{ fontSize: 8.5, padding: '3px 9px' }} onClick={() => setFilter(f)}>
            {f === 'Verified' ? '✓ ' : ''}{f}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 8.5, color: 'var(--purple-2)', cursor: 'pointer' }}>⚙ Advanced Filters</span>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {list.map(a => (
          <div key={a.name} className="api-card">
            <div className="ac-hd">
              <span className="ai">{a.icon}</span>
              <div style={{ minWidth: 0 }}>
                <b>{a.name}</b>{' '}
                <span className={`tag ${a.internal ? 'purple' : a.verified ? 'green' : 'amber'}`} style={{ fontSize: 7 }}>{a.internal ? 'INTERNAL' : a.verified ? 'VERIFIED' : 'UNVERIFIED'}</span>
                <span className="ver" style={{ marginLeft: 6 }}>{a.ver}</span>
                <div className="ac-tags">{a.tags.map(t => <span key={t} className="tag" style={{ fontSize: 7.5 }}>{t}</span>)}</div>
              </div>
            </div>
            <div className="ac-desc">{a.desc}<br /><span style={{ color: 'var(--text-faint)' }}>Provider: {a.provider} · Uptime: {a.uptime}</span></div>
            <div className="ac-grid">
              <div><span className="k">HEALTH</span><b className="glow-g">{a.health}</b></div>
              <div><span className="k">LATENCY</span><b style={{ color: 'var(--cyan)' }}>{a.latency}</b></div>
              <div><span className="k">RATE LIMIT</span><b>{a.rate}</b></div>
              <div><span className="k">COST</span><b style={{ color: 'var(--amber)' }}>{a.cost}</b></div>
              <div><span className="k">ERROR RATE</span><b style={{ color: parseFloat(a.err) > 1 ? 'var(--red)' : 'var(--green)' }}>{a.err}</b></div>
              <div><span className="k">REQ/MIN</span><b>{a.rpm}</b></div>
              <div style={{ gridColumn: 'span 2', textAlign: 'right' }}>
                <button className="btn sm" style={{ fontSize: 8 }}>{a.verified || a.internal ? 'VIEW DETAILS' : 'REQUEST ACCESS'}</button>
              </div>
            </div>
          </div>
        ))}
        <div style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-dim)', padding: 6 }}>Load More APIs — showing {list.length} of 5,642</div>
      </div>
    </Panel>
  );
}

function BrokerHealth() {
  const { services } = useData();
  const online = services.filter(s => s.status === 'online' || s.status === 'degraded').length;
  const pct = Math.round((online / services.length) * 100);
  const layers = ['API Gateway', 'Rate Limiter', 'Request Router', 'Cache Layer', 'Adapter Layer', 'Security Layer'];
  const C = 2 * Math.PI * 62;
  return (
    <Panel title="BROKER HEALTH & SYSTEM STATUS">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <div className="health-ring">
            <svg width="148" height="148">
              <circle cx="74" cy="74" r="62" fill="none" stroke="rgba(118,60,200,0.2)" strokeWidth="7" />
              <circle cx="74" cy="74" r="62" fill="none" stroke="var(--teal)" strokeWidth="7"
                strokeDasharray={`${C * pct / 100} ${C}`} strokeLinecap="round"
                style={{ filter: 'drop-shadow(0 0 8px rgba(45,212,191,0.6))', transition: 'stroke-dasharray 1s ease' }} />
            </svg>
            <div className="hr-label"><span>SYSTEM HEALTH</span><b>{pct >= 80 ? 'OPTIMAL' : pct >= 40 ? 'DEGRADED' : 'DARK'}</b><span style={{ fontSize: 13, color: '#fff', fontWeight: 800 }}>{pct}%</span></div>
          </div>
        </div>
        <div>
          {layers.map((l, i) => (
            <div key={l} className="gauge-row">
              <span className={`dot ${pct > i * 16 ? 'g' : 'a'}`} />
              <span className="gk">{l}</span>
              <span className="gv">{pct > i * 16 ? 'Healthy' : 'Unknown'}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 9 }}>
        {[['TOTAL APIS', '5,642'], ['ACTIVE ADAPTERS', '48'], ['HEALTH CHECKS', '1,285'], ['FAILED CHECKS', '2', 'var(--red)']].map(([k, v, c]) => (
          <div key={k}><div style={{ fontSize: 7.5, color: 'var(--text-faint)', letterSpacing: '0.12em' }}>{k}</div><b style={{ fontSize: 14, color: c || '#f3ecff' }}>{v}</b></div>
        ))}
      </div>
    </Panel>
  );
}

function SquirrelMonitor() {
  const { eventTimeline, stream } = useData();
  const evts = (eventTimeline.events.length ? eventTimeline.events : stream.events).slice(0, 5);
  return (
    <Panel title="SQUIRREL MONITOR" right={<span className="tag cyan">LIVE</span>} bodyClass="nopad">
      <div style={{ display: 'flex', minHeight: 130 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Viz kind="core" />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, filter: 'drop-shadow(0 0 16px rgba(168,85,247,0.8))', pointerEvents: 'none' }}>🐿</div>
        </div>
        <div style={{ flex: 1, padding: '10px 12px', fontSize: 9 }}>
          <div style={{ color: 'var(--text-faint)', letterSpacing: '0.12em', fontSize: 7.5 }}>SQUIRREL STATUS</div>
          <b className="glow-p" style={{ fontSize: 11 }}>ACTIVE ✦</b>
          <div style={{ color: 'var(--text-dim)', fontSize: 8.5 }}>FORAGING FOR APIS</div>
          {[['DISCOVERIES TODAY', 24], ['NEW APIS FOUND', 7], ['CATEGORIES SCANNED', 12]].map(([k, v]) => (
            <div key={k} className="stat-row" style={{ padding: '2.5px 0' }}><span className="k" style={{ fontSize: 8 }}>{k}</span><b>{v}</b></div>
          ))}
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', padding: '7px 12px', maxHeight: 84, overflowY: 'auto' }}>
        <div style={{ fontSize: 7.5, color: 'var(--text-faint)', letterSpacing: '0.14em', marginBottom: 4 }}>SQUIRREL LOG</div>
        {(evts.length ? evts : [{ message: 'Discovered new API: ExchangeRate-API v1.0.3' }, { message: 'Verified API: NewsAPI.org v2.1.0' }, { message: 'Health check completed: 1,285 APIs' }]).map((e, i) => (
          <div key={i} className="evt-item"><span className="et">{fmtTime(e.ts || e._time || Date.now())}</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.message || e.type || 'event'}</span></div>
        ))}
      </div>
    </Panel>
  );
}

function UsageLedger() {
  const { eventTimeline } = useData();
  const series = seededSeries(48, eventTimeline.events.length + 29, 0.2, 1);
  return (
    <Panel title="USAGE LEDGER" right={<select className="ci-select" defaultValue="Today"><option>Today</option><option>7d</option><option>30d</option></select>}>
      <div style={{ fontSize: 7.5, color: 'var(--text-faint)', letterSpacing: '0.12em' }}>TOTAL REQUESTS</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <b style={{ fontSize: 17, color: '#f3ecff' }}>356,784</b>
        <span style={{ fontSize: 8.5, color: 'var(--green)' }}>+12.4% vs yesterday</span>
      </div>
      <Spark data={series} w={290} h={54} color="#e879f9" fill />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 8, fontSize: 8.5 }}>
        {[['UNIQUE AGENTS', '156', '+8.7%'], ['TOTAL COST', '$124.78', '+5.2%'], ['AVG RESPONSE', '186ms', '-3.1%'], ['', '', '']].map(([k, v, d], i) => k && (
          <div key={i}><div style={{ fontSize: 7, color: 'var(--text-faint)', letterSpacing: '0.1em' }}>{k}</div><b style={{ color: '#f3ecff' }}>{v}</b> <span style={{ color: d.startsWith('-') ? 'var(--green)' : 'var(--cyan)', fontSize: 7.5 }}>{d}</span></div>
        ))}
      </div>
    </Panel>
  );
}

function CachePerf() {
  return (
    <Panel title="CACHE PERFORMANCE">
      <div style={{ display: 'flex', gap: 14 }}>
        <div>
          <div style={{ fontSize: 7.5, color: 'var(--text-faint)', letterSpacing: '0.1em' }}>CACHE HIT RATE</div>
          <b className="glow-g" style={{ fontSize: 19 }}>93.7%</b>
          <div style={{ fontSize: 8, color: 'var(--green)' }}>+2.3% vs yesterday</div>
        </div>
        <div style={{ fontSize: 8.5, flex: 1 }}>
          {[['HITS', '334,251'], ['MISSES', '22,533'], ['TOTAL', '356,784']].map(([k, v]) => (
            <div key={k} className="stat-row" style={{ padding: '2px 0' }}><span className="k" style={{ fontSize: 8 }}>{k}</span><b>{v}</b></div>
          ))}
        </div>
      </div>
      <Spark data={seededSeries(40, 91, 0.75, 1)} w={290} h={34} color="#2dd4bf" fill />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginTop: 7, fontSize: 8 }}>
        {[['TTL OPTIMIZATION', 'ACTIVE', 'var(--green)'], ['CACHE SIZE', '2.4GB / 4GB', '#f3ecff'], ['EVICTION RATE', '0.02% · Low', 'var(--cyan)']].map(([k, v, c]) => (
          <div key={k}><div style={{ fontSize: 7, color: 'var(--text-faint)', letterSpacing: '0.1em' }}>{k}</div><b style={{ color: c }}>{v}</b></div>
        ))}
      </div>
    </Panel>
  );
}

function AdaptersStatus() {
  const rows = [
    ['REST Adapter', 'v2.1.3', '100%', '12,456'], ['GraphQL Adapter', 'v1.8.7', '99.9%', '2,847'],
    ['gRPC Adapter', 'v1.4.2', '100%', '1,234'], ['WebSocket Adapter', 'v1.2.1', '99.7%', '567'],
    ['SOAP Adapter', 'v1.0.9', '98.2%', '89'], ['MQTT Adapter', 'v1.3.4', '100%', '234'],
  ];
  return (
    <Panel title="ADAPTERS STATUS" right={<span className="tag green">48 ACTIVE</span>}>
      {rows.map(([n, v, h, c]) => (
        <div key={n} className="stat-row" style={{ padding: '4.5px 0', borderBottom: '1px solid rgba(118,60,200,0.1)' }}>
          <span className="k"><span className="dot g" /> <b style={{ color: 'var(--text)', fontWeight: 600 }}>{n}</b> <span style={{ color: 'var(--text-faint)', fontSize: 8 }}>{v}</span></span>
          <span className="v" style={{ fontSize: 9 }}><span className="glow-g">{h}</span> <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>{c}</span></span>
        </div>
      ))}
      <div style={{ textAlign: 'center', fontSize: 8.5, color: 'var(--purple-2)', paddingTop: 7, cursor: 'pointer' }}>+ 42 more adapters</div>
    </Panel>
  );
}

function AgentPermissions() {
  const { agents } = useData();
  const fallback = [
    ['MiniMax M2', '125 APIs', '10,000/min'], ['DeepSeek', '89 APIs', '5,000/min'],
    ['PURPCLAW Core', 'All APIs', 'Unlimited'], ['Mochi Companion', '45 APIs', '2,500/min'],
    ['Benchmarks Agent', '23 APIs', '1,000/min'], ['Voice Interface', '12 APIs', '500/min'],
  ];
  const rows = agents.length ? agents.slice(0, 6).map(a => [a.name, `${20 + (a.name.length * 7) % 100} APIs`, '1,000/min']) : fallback;
  return (
    <Panel title="AGENT PERMISSIONS & RATE LIMITS">
      <table className="tbl">
        <thead><tr><th>AGENT</th><th>PERMISSIONS</th><th>RATE LIMIT</th><th>STATUS</th></tr></thead>
        <tbody>
          {rows.map(([n, p, r]) => (
            <tr key={n}><td><b>{n}</b></td><td style={{ color: 'var(--text-dim)' }}>{p}</td><td style={{ color: 'var(--text-dim)' }}>{r}</td>
              <td><span className="tag green" style={{ fontSize: 7.5 }}>ACTIVE</span></td></tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
        <button className="btn sm ghost">+ Add New Agent</button>
        <button className="btn sm ghost">Manage Permissions</button>
      </div>
    </Panel>
  );
}

function LiveDataFlow() {
  const { eventTimeline } = useData();
  const reqMin = eventTimeline.events.length * 103 || 24783;
  return (
    <Panel title="LIVE EXTERNAL DATA FLOW" right={<span className="tag cyan">REAL-TIME</span>} bodyClass="nopad">
      <div style={{ display: 'flex', minHeight: 168 }}>
        <div style={{ flex: 1, padding: '10px 12px', fontSize: 8.5 }}>
          <div style={{ fontSize: 7.5, color: 'var(--text-faint)', letterSpacing: '0.14em', marginBottom: 6 }}>EXTERNAL APIS</div>
          {[['DeepSeek API', '1,842 req/m'], ['CoinGecko API', '832 req/m'], ['Weather API', '128 req/m']].map(([n, r]) => (
            <div key={n} style={{ border: '1px solid var(--border)', padding: '5px 8px', marginBottom: 5, background: 'var(--panel-3)' }}>
              <b style={{ color: 'var(--text)', fontSize: 8.5 }}>{n}</b><div style={{ color: 'var(--text-faint)', fontSize: 7.5 }}>{r}</div>
            </div>
          ))}
          <div style={{ color: 'var(--text-faint)', fontSize: 7.5 }}>… 1,282 more</div>
        </div>
        <div style={{ flex: 1.3, position: 'relative' }}>
          <Viz kind="core" />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ fontSize: 7.5, color: 'var(--magenta)', letterSpacing: '0.2em' }}>GOOP BROKER</div>
            <b style={{ fontSize: 17, color: '#fff', textShadow: '0 0 14px rgba(232,121,249,0.8)' }}><Counter value={reqMin} /></b>
            <div style={{ fontSize: 7.5, color: 'var(--text-dim)', letterSpacing: '0.16em' }}>REQ/MIN · ROUTING</div>
          </div>
        </div>
        <div style={{ flex: 1, padding: '10px 12px', fontSize: 8.5 }}>
          <div style={{ fontSize: 7.5, color: 'var(--text-faint)', letterSpacing: '0.14em', marginBottom: 6 }}>INTERNAL AGENTS</div>
          {[['PURPCLAW Core', '5,847 req/m'], ['MiniMax M2', '2,480 req/m'], ['Mochi Companion', '1,210 req/m']].map(([n, r]) => (
            <div key={n} style={{ border: '1px solid var(--border)', padding: '5px 8px', marginBottom: 5, background: 'var(--panel-3)' }}>
              <b style={{ color: 'var(--text)', fontSize: 8.5 }}>{n}</b><div style={{ color: 'var(--text-faint)', fontSize: 7.5 }}>{r}</div>
            </div>
          ))}
          <div style={{ color: 'var(--text-faint)', fontSize: 7.5 }}>… 8 more agents</div>
        </div>
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid var(--border)', fontSize: 8 }}>
        {[['BANDWIDTH', '1.8 GB/s'], ['CONNECTIONS', '2,847'], ['ERROR RATE', '0.16%'], ['THROUGHPUT', `${reqMin.toLocaleString()} req/min`]].map(([k, v], i) => (
          <div key={k} style={{ flex: 1, padding: '7px 12px', borderRight: i < 3 ? '1px solid rgba(118,60,200,0.15)' : 'none' }}>
            <div style={{ fontSize: 7, color: 'var(--text-faint)', letterSpacing: '0.12em' }}>{k}</div><b style={{ color: '#f3ecff' }}>{v}</b>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function BrokerActivity() {
  const { stream, eventTimeline } = useData();
  const evts = (eventTimeline.events.length ? eventTimeline.events : stream.events).slice(0, 9);
  const fallback = [
    ['Agent DeepSeek accessed Chat Completion API', '200 OK', '128ms', 'var(--green)'],
    ['Rate limit warning: Weather Underground API', '429', 'Rate Limited', 'var(--amber)'],
    ['Cache hit: CoinGecko Market Data API', 'HIT', '23ms', 'var(--cyan)'],
    ['New API registered: ExchangeRate-API v1.0.3', 'NEW', 'Verified', 'var(--magenta)'],
    ['Health check failed: OldAPI Service', 'ERROR', 'Timeout', 'var(--red)'],
    ['Agent Mochi accessed Internal Knowledge Graph', '200 OK', '18ms', 'var(--green)'],
    ['Cache optimized: hit rate improved to 93.7%', 'INFO', 'Optimized', 'var(--cyan)'],
  ];
  const rows = evts.length
    ? evts.map(e => [e.message || e.type || e.topic || 'event', (e.type || 'EVT').toUpperCase().slice(0, 8), ago(e.ts || e._time || Date.now()), 'var(--cyan)'])
    : fallback;
  return (
    <Panel title="BROKER ACTIVITY FEED" right={<span className="tag cyan">LIVE</span>}>
      {rows.map(([m, s, d, c], i) => (
        <div key={i} className="feed-line">
          <span className="t">{fmtTime(Date.now() - i * 14000)}</span>
          <span className="m" style={{ flex: 1 }}>{m}</span>
          <span style={{ color: c, fontSize: 8.5, flex: 'none' }}>{s}</span>
          <span style={{ color: 'var(--text-faint)', fontSize: 8.5, flex: 'none', width: 70, textAlign: 'right' }}>{d}</span>
        </div>
      ))}
      <div style={{ textAlign: 'center', fontSize: 8.5, color: 'var(--purple-2)', paddingTop: 7, cursor: 'pointer' }}>View Full Activity Log</div>
    </Panel>
  );
}

function GoopScreen() {
  const root = React.useRef(null);
  React.useEffect(() => {
    if (!window.gsap || !root.current) return;
    gsap.fromTo(root.current.querySelectorAll('.panel'), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.045, ease: 'power2.out', clearProps: 'opacity,transform' });
  }, []);
  return (
    <div ref={root} className="screen" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <GoopHeaderStrip />
      <div className="grid" style={{ gridTemplateColumns: '1.25fr 1.1fr 1fr', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <ApiSearchPanel />
          <AgentPermissions />
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <BrokerHealth />
          <UsageLedger />
          <CachePerf />
          <LiveDataFlow />
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <SquirrelMonitor />
          <AdaptersStatus />
          <BrokerActivity />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { GoopScreen });
