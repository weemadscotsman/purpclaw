/* screen-cockpit.jsx — LIVE SYSTEM COCKPIT (mockup 3)
 * Fullscreen ambient 3D field with floating chat in center, halos + constellations
 * around, mochi bottom-right, all data live.
 */

function CockpitStat({ label, value, sub, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 9, letterSpacing: '0.22em', color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: color || '#f3ecff', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 8.5, color: 'var(--text-faint)' }}>{sub}</div>}
    </div>
  );
}

function CockpitScreen({ chat }) {
  const { services, agents, eventTimeline, stream, pipeline, mochi, anyConnected, gatekeeper, mission } = useData();
  const evts = eventTimeline.events.length ? eventTimeline.events : stream.events;
  const online = services.filter(s => s.status === 'online' || s.status === 'degraded').length;
  const running = pipeline?.running ?? 0;
  const root = React.useRef(null);

  React.useEffect(() => {
    if (!window.gsap || !root.current) return;
    gsap.fromTo(root.current.querySelectorAll('.ck-float'),
      { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.8, stagger: 0.08, ease: 'power2.out', clearProps: 'opacity,transform' });
  }, []);

  const series = React.useMemo(() => {
    const buckets = new Array(36).fill(0);
    const now = Date.now(), span = 10 * 60 * 1000;
    evts.forEach(e => {
      const t = new Date(e.ts || e._time || now).getTime();
      const idx = Math.floor(((t - (now - span)) / span) * 36);
      if (idx >= 0 && idx < 36) buckets[idx]++;
    });
    return buckets.some(v => v) ? buckets : seededSeries(36, 17);
  }, [evts]);

  return (
    <div ref={root} className="screen" style={{ padding: 0, overflow: 'hidden' }}>
      {/* ambient full-bleed 3D layers */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.85 }}><Viz kind="spiral" /></div>
      <div style={{ position: 'absolute', left: 0, top: 0, width: '34%', height: '46%', opacity: 0.9 }}><Viz kind="constellation" /></div>
      <div style={{ position: 'absolute', right: 0, top: '6%', width: '30%', height: '40%', opacity: 0.9 }}><Viz kind="wave" /></div>
      <div style={{ position: 'absolute', right: '26%', top: 0, width: '22%', height: '38%', opacity: 0.8 }}><Viz kind="shield" /></div>
      <div style={{ position: 'absolute', left: 0, bottom: '8%', width: '24%', height: '42%', opacity: 0.85 }}><Viz kind="halo" /></div>
      <div style={{ position: 'absolute', right: 0, bottom: '14%', width: '28%', height: '38%', opacity: 0.85 }}><Viz kind="threads" /></div>

      {/* header */}
      <div className="ck-float" style={{ position: 'absolute', top: 10, left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.34em', color: '#f3ecff', textShadow: '0 0 18px rgba(168,85,247,0.7)' }}>LIVE SYSTEM COCKPIT</div>
        <div style={{ fontSize: 9.5, color: 'var(--text-dim)', marginTop: 3 }}>Everything is streaming.</div>
      </div>

      {/* corner labels */}
      <div className="ck-float" style={{ position: 'absolute', top: 64, left: 22, fontSize: 9, letterSpacing: '0.2em', color: 'var(--text-dim)' }}>
        SERVICES CONSTELLATION<br /><span className="tag cyan" style={{ marginTop: 4, display: 'inline-block' }}>LIVE</span>
        <div style={{ marginTop: 4, fontSize: 8.5 }}><b className="glow-c">{online}</b> / {services.length} ONLINE</div>
      </div>
      <div className="ck-float" style={{ position: 'absolute', top: 64, left: '36%', fontSize: 9, letterSpacing: '0.2em', color: 'var(--text-dim)' }}>
        AGENT SWARM<div style={{ fontSize: 8.5, marginTop: 3 }}><b style={{ color: '#fff' }}><Counter value={agents.length} /></b> ACTIVE</div>
      </div>
      <div className="ck-float" style={{ position: 'absolute', top: 64, left: '52%', width: 180 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--text-dim)' }}>EVENT TRAILS</div>
        <div style={{ fontSize: 8.5, color: 'var(--text-faint)', marginBottom: 3 }}><Counter value={evts.length} /> / min</div>
        <Bars data={series} h={36} />
      </div>
      <div className="ck-float" style={{ position: 'absolute', top: 60, right: '20%', textAlign: 'center' }}>
        <CockpitStat label="RISK SHIELD" value={gatekeeper.connected ? 'NOMINAL' : 'OFFLINE'} color={gatekeeper.connected ? 'var(--green)' : 'var(--amber)'} />
      </div>
      <div className="ck-float" style={{ position: 'absolute', top: 60, right: 30, textAlign: 'center' }}>
        <CockpitStat label="DREAM SWARM" value={<span className="glow-p">{anyConnected ? '72%' : '—'}</span>} sub="LIVE FLUIDIC" />
      </div>
      <div className="ck-float" style={{ position: 'absolute', top: '38%', right: 36, fontSize: 8.5, color: 'var(--text-dim)' }}>
        COHERENCE: <b className="glow-c">{anyConnected ? 'HIGH' : 'LOW'}</b>
      </div>

      {/* left rail stats */}
      <div className="ck-float" style={{ position: 'absolute', left: 22, top: '42%', fontSize: 9, letterSpacing: '0.18em', color: 'var(--text-dim)' }}>
        VOICE HALOS <span className="tag cyan" style={{ marginLeft: 5 }}>LIVE</span>
      </div>
      <div className="ck-float" style={{ position: 'absolute', left: 22, bottom: 96, fontSize: 9 }}>
        <div style={{ letterSpacing: '0.18em', color: 'var(--text-dim)', marginBottom: 6 }}>ORCH {pipeline?.running ? 'RUSHING' : 'IDLE'} <span style={{ color: 'var(--text-faint)' }}>{(pipeline?.total ?? 0)} workflows</span></div>
        {[['RUNNING', running, 'var(--magenta)'], ['WAITING', pipeline?.waiting ?? 0, 'var(--cyan)'], ['FAILED', pipeline?.failed ?? 0, 'var(--red)'], ['COMPLETED', pipeline?.completed ?? 0, 'var(--green)']].map(([k, v, c]) => (
          <div key={k} style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '2px 0' }}>
            <span className="dot" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
            <span style={{ color: 'var(--text-dim)', width: 78 }}>{k}</span>
            <b style={{ color: 'var(--text)' }}><Counter value={v || 0} /></b>
          </div>
        ))}
      </div>

      {/* memory threads numbers right */}
      <div className="ck-float" style={{ position: 'absolute', right: 30, top: '46%', fontSize: 9 }}>
        <div style={{ letterSpacing: '0.18em', color: 'var(--text-dim)', marginBottom: 5 }}>MEMORY THREADS</div>
        {[['ACTIVE', mission.data?.api?.memory?.active ?? '—', 'g'], ['ARCHIVED', mission.data?.api?.memory?.archived ?? '—', 'c'], ['FROZEN', mission.data?.api?.memory?.frozen ?? '—', 'p']].map(([k, v, d]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', width: 120, padding: '2px 0' }}>
            <span style={{ color: 'var(--text-dim)' }}><span className={`dot ${d}`} style={{ marginRight: 5 }} />{k}</span>
            <b style={{ color: 'var(--text)' }}>{typeof v === 'number' ? v.toLocaleString() : v}</b>
          </div>
        ))}
      </div>

      {/* central floating chat — centered with margin:auto (no transform; gsap clearProps would nuke it) */}
      <div className="ck-chat" style={{ position: 'absolute', left: 0, right: 0, top: '20%', bottom: '6%', margin: 'auto', width: 'min(620px, 46vw)', display: 'flex' }}>
        <div className="panel" style={{ flex: 1, boxShadow: '0 0 60px rgba(88,28,135,0.5)', background: 'rgba(12,6,24,0.88)' }}>
          <div className="panel-bd nopad" style={{ display: 'flex', flexDirection: 'column' }}>
            <MissionChat chat={chat} frameless />
          </div>
        </div>
      </div>

      {/* mochi bottom right */}
      <div className="ck-float" style={{ position: 'absolute', right: 26, bottom: 18, width: 250, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div className="mochi-cat" style={{ fontSize: 64 }}>🐱</div>
        <div className="mochi-bubble" style={{ flex: 1 }}>
          {mochi.data?.message || (mochi.connected ? `Hey Boss! 🐾 Systems nominal and Mochi's got your back. Shall we crush some missions today?` : 'Mochi offline — start the stack to wake the companion.')}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CockpitScreen });
