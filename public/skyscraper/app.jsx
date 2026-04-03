/* app.jsx — main shell, header, tabs, content routing.
 * Real data only via useData() from data-hooks.js
 */

const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA } = React;

// ─────────────────────────────────────────────────────────────
// Tabs config
// ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'skyscraper', label: 'Skyscraper',    icon: '🏢', code: 'SKY' },
  { id: 'overview',   label: 'Overview',      icon: '◈',  code: '01'  },
  { id: 'command',    label: 'Command',        icon: '◎',  code: 'CM'  },
  { id: 'graph',      label: 'Project Graph',  icon: 'G',  code: 'GX'  },
  { id: 'swarm',      label: 'Swarm',          icon: '⬡',  code: 'SW'  },
  { id: 'harness',    label: 'Harness',        icon: 'HX', code: 'HX'  },
  { id: 'agents',     label: 'Agents',         icon: '◉',  code: 'AG'  },
  { id: 'delegation', label: 'Delegation',     icon: '⟶',  code: 'DLG' },
  { id: 'workflows',  label: 'Workflows',      icon: '◫',  code: 'WFL' },
  { id: 'pipeline',   label: 'Pipeline',       icon: '◆',  code: 'PL'  },
  { id: 'messages',   label: 'Messages',       icon: '✉',  code: 'MSG' },
  { id: 'gatekeeper', label: 'Gatekeeper',     icon: '⚖',  code: 'GK'  },
  { id: 'pool',       label: 'Pool',           icon: '◉',  code: 'POL' },
  { id: 'cognitive',  label: 'Cognitive',      icon: '⌬',  code: 'CG'  },
  { id: 'events',     label: 'Events',         icon: '≡',  code: 'EVT' },
  { id: 'output',     label: 'Output',         icon: '⟩_', code: 'OUT' },
  { id: 'logs',       label: 'Logs',           icon: '≡',  code: 'LG'  },
  { id: 'mochi',      label: 'Mochi',          icon: '♥',  code: 'MCH' },
];

// SKY_SUB_TABS — Agent Tower folded INTO Skyscraper (the iso view IS the tower)
const SKY_SUB_TABS = [
  { id: 'tower',    label: 'Skyscraper',      icon: '🏢' },
  { id: 'venting',  label: 'Venting Machine', icon: '◎' },
  { id: 'satellite',label: 'Satellite Office',icon: '◇' },
];

// ─────────────────────────────────────────────────────────────
// TWEAK defaults
// ─────────────────────────────────────────────────────────────
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "primaryAccent": "#a855f7",
  "showWindows": true,
  "animateAgents": true,
  "showAgentMessages": true,
  "rotation": 0
}/*EDITMODE-END*/;

// ─────────────────────────────────────────────────────────────
// Clock
// ─────────────────────────────────────────────────────────────
function Clock() {
  const [now, setNow] = useStateA(new Date());
  useEffectA(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="hdr-clock">
      {now.toLocaleTimeString('en-US', { hour12: false })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Dial — small radial gauge (used in header)
// ─────────────────────────────────────────────────────────────
function Dial({ value, color = '#22d3ee', size = 36 }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, (value || 0) / 100));
  return (
    <div className="dial" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={c} strokeDashoffset={c - pct * c} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: 'stroke-dashoffset 600ms ease' }} />
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// derive a single health tone — drives sky + billboard
// ─────────────────────────────────────────────────────────────
function useHealthTone() {
  const { agents, services, anyConnected } = useData();
  if (!anyConnected) return { tone: 'bad', text: 'OFFLINE', color: 'var(--red)' };
  const errors = agents.filter(a => a.status === 'error').length;
  const offlineCore = services.filter(s => !s.optional && s.status === 'offline').length;
  const degraded = services.filter(s => s.status === 'degraded').length;
  if (errors > 0 || offlineCore > 0) return { tone: 'bad',  text: errors ? `${errors} FAULTS` : 'CORE DEGRADED', color: 'var(--red)' };
  if (degraded > 0)                  return { tone: 'warn', text: 'PARTIAL', color: 'var(--amber)' };
  const working = agents.filter(a => a.status === 'working').length;
  if (working > 0)                   return { tone: 'good', text: `${working} AGENTS WORKING`, color: 'var(--emerald)' };
  return { tone: 'good', text: 'ALL CLEAR', color: 'var(--emerald)' };
}

// ─────────────────────────────────────────────────────────────
// Header — REAL: shows actual agent counts, service health, connection state
// ─────────────────────────────────────────────────────────────
function Header() {
  const { agents, services, mochi, connections, anyConnected } = useData();
  const working = agents.filter(a => a.status === 'working').length;
  const errors  = agents.filter(a => a.status === 'error').length;
  const total   = agents.length;
  const onlineSvc = services.filter(s => s.status === 'online').length;
  const sysLoad = services.length ? Math.round((1 - onlineSvc / services.length) * 50) + (errors > 0 ? 25 : 0) + (working > 5 ? 15 : 0) : 0;

  return (
    <header className="hdr">
      <div className="hdr-brand">
        <div className="hdr-pulse" style={{
          background: anyConnected ? 'var(--cyan)' : 'var(--red)',
          boxShadow: `0 0 18px ${anyConnected ? 'var(--cyan)' : 'var(--red)'}`,
        }} />
        <div className="hdr-logo">PURPCLAW</div>
        <div className="hdr-sub">// Command Center</div>
      </div>

      <div className="hdr-vitals">
        <div className="vital">
          <div className="vital-dot" style={{ background: 'var(--cyan)', color: 'var(--cyan)' }} />
          <div>
            <div className="vital-num" style={{ color: 'var(--cyan)' }}>
              {anyConnected ? working : '—'}
              {anyConnected && <span style={{ color: 'var(--text-3)', fontSize: 11 }}>/{total}</span>}
            </div>
            <div className="vital-lbl">agents active</div>
          </div>
        </div>
        <div className="vital">
          <div className="vital-dot" style={{ background: errors ? 'var(--red)' : 'var(--emerald)', color: errors ? 'var(--red)' : 'var(--emerald)' }} />
          <div>
            <div className="vital-num" style={{ color: errors ? 'var(--red)' : 'var(--emerald)' }}>{anyConnected ? errors : '—'}</div>
            <div className="vital-lbl">faults</div>
          </div>
        </div>
        <div className="vital">
          <div className="vital-dot" style={{ background: 'var(--emerald)', color: 'var(--emerald)' }} />
          <div>
            <div className="vital-num" style={{ color: 'var(--emerald)' }}>
              {anyConnected ? onlineSvc : '—'}
              {anyConnected && <span style={{ color: 'var(--text-3)', fontSize: 11 }}>/{services.length}</span>}
            </div>
            <div className="vital-lbl">services</div>
          </div>
        </div>
        <div className="vital">
          <Dial value={sysLoad} color={sysLoad > 60 ? 'var(--red)' : 'var(--amber)'} size={36} />
          <div>
            <div className="vital-num" style={{ color: sysLoad > 60 ? 'var(--red)' : 'var(--amber)', fontSize: 13 }}>
              {anyConnected ? `${sysLoad}%` : '—'}
            </div>
            <div className="vital-lbl">system load</div>
          </div>
        </div>
      </div>

      <div className="hdr-spark" title="events per 30s">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', color: 'var(--text-3)', textTransform: 'uppercase' }}>signal</span>
        <HeaderSparkline width={110} height={24} color="#22d3ee" />
      </div>

      <StaleIndicator />

      <div className="hdr-right">
        <div className="conn-strip">
          {[
            { lbl: 'API',   ok: connections.api },
            { lbl: 'TOWER', ok: connections.tower },
            { lbl: 'ORCH',  ok: connections.orch },
            { lbl: 'EVT',   ok: connections.bus },
          ].map(c => (
            <div key={c.lbl} className={`conn ${c.ok ? 'ok' : 'bad'}`}>
              <span className="conn-dot" />{c.lbl}
            </div>
          ))}
        </div>
        {mochi.connected && mochi.data && (
          <div className="hdr-mochi" title={`${mochi.data.name} the ${mochi.data.species} — ${mochi.data.mood || 'curious'}`}>
            <span className="hdr-mochi-face">{mochiFace(mochi.data)}</span>
            <span className="hdr-mochi-name">{mochi.data.name}</span>
          </div>
        )}
        <AuditExport compact />
        <ExportPanel compact />
        <IdentityChip />
        <Clock />
      </div>
    </header>
  );
}

function mochiFace(m) {
  if (!m) return '(·ω·)';
  const eye = m.eye || '·';
  return `(${eye}${m.verb || 'ω'}${eye})`;
}

// ─────────────────────────────────────────────────────────────
// Disconnected banner
// ─────────────────────────────────────────────────────────────
function DisconnectedBanner() {
  const { anyConnected, mission } = useData();
  if (anyConnected) return null;
  if (mission.loading) return null;
  return (
    <div style={{
      flexShrink: 0,
      padding: '8px 18px',
      background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.18), rgba(239, 68, 68, 0.06))',
      borderBottom: '1px solid rgba(239, 68, 68, 0.4)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--red)',
      letterSpacing: '0.08em',
      zIndex: 20,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', boxShadow: '0 0 8px var(--red)' }} />
      <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>backend offline</span>
      <span style={{ color: 'var(--text-3)' }}>
        no PURPCLAW services reachable on localhost:7780–7790. start the stack with <span style={{ color: 'var(--cyan)' }}>purpclaw start</span> and refresh.
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────
function EmptyState({ icon, title, hint, color = 'var(--text-3)' }) {
  return (
    <div style={{
      flex: 1,
      display: 'grid',
      placeItems: 'center',
      padding: 30,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 48, color, textShadow: `0 0 20px ${color}`, opacity: 0.5 }}>{icon || '◌'}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-2)', letterSpacing: '0.04em' }}>{title}</div>
        {hint && <div style={{ color: 'var(--text-3)', fontSize: 12, lineHeight: 1.5 }}>{hint}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tabbar
// ─────────────────────────────────────────────────────────────
function TabBar({ active, onChange }) {
  return (
    <nav className="tabbar">
      {TABS.map(tab => (
        <button
          key={tab.id}
          className={`tab${active === tab.id ? ' active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span>{tab.label}</span>
          <span className="tab-badge">{tab.code}</span>
        </button>
      ))}
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────
// Skyscraper tab (the hero) — REAL agents, REAL floors
// ─────────────────────────────────────────────────────────────
function SkyscraperTab({ t, setTweak, zoom, setZoom, pan, setPan, resetView, selectedFloorOverride, onSelectedFloorChange }) {
  const { floors, agents, mission, anyConnected, services, mochi, stream } = useData();
  const health = useHealthTone();
  const [subTab, setSubTab] = useStateA('tower');
  const [selectedFloor, setSelectedFloor] = useStateA(null);

  // pick a default selection when floors arrive
  useEffectA(() => {
    if (!selectedFloor && floors.length > 0) {
      const firstWithAgents = floors.find(f => f.agents > 0) || floors[0];
      setSelectedFloor(firstWithAgents.id);
    }
  }, [floors]);

  // sync with external selection (palette / keyboard)
  useEffectA(() => {
    if (selectedFloorOverride && selectedFloorOverride !== selectedFloor) {
      setSelectedFloor(selectedFloorOverride);
    }
  }, [selectedFloorOverride]);
  useEffectA(() => {
    if (onSelectedFloorChange) onSelectedFloorChange(selectedFloor);
  }, [selectedFloor]);

  const floor = floors.find(f => f.id === selectedFloor);
  const div = floor ? divMeta(floor.div) : null;

  if (subTab === 'venting') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 10, gap: 10, minHeight: 0 }}>
        <SkySubBar active={subTab} onChange={setSubTab} />
        <VentingMachine />
      </div>
    );
  }
  if (subTab === 'satellite') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 10, gap: 10, minHeight: 0 }}>
        <SkySubBar active={subTab} onChange={setSubTab} />
        <SatelliteOffice />
      </div>
    );
  }

  const towerOnline = services.find(s => s.key === 'tower')?.status === 'online';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 10, gap: 10, minHeight: 0 }}>
      <SkySubBar active={subTab} onChange={setSubTab} />
      <div className="sky">
        {/* spine */}
        {floors.length > 0 ? (
          <FloorSpine
            floors={floors}
            divisions={DIVISIONS}
            selected={selectedFloor}
            onSelect={setSelectedFloor}
          />
        ) : (
          <div className="spine">
            <div className="spine-h"><span>Floors</span><span>0</span></div>
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
              {towerOnline ? 'no divisions populated' : 'agent_tower offline'}
            </div>
          </div>
        )}

        {/* tower stage */}
        <div className="stage">
          <div className="stage-h">
            <span className="stage-title">
              {floor ? `▲ AGENT OFFICE // FL.${String(floor.level).padStart(2,'0')}` : '▲ AGENT OFFICE'}
            </span>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              {floors.length > 0 && (
                <>
                  <ZoomControl zoom={zoom} setZoom={setZoom} onReset={resetView} />
                  <RotationControl rotation={t.rotation || 0} onRotate={(v) => setTweak('rotation', v)} />
                </>
              )}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                {agents.length} agents · {floors.length} floors
              </span>
            </div>
          </div>
          <div className="stage-canvas">
            {floors.length > 0 ? (
              <>
                <IsoTower
                  floors={floors}
                  divisions={DIVISIONS}
                  selected={selectedFloor}
                  onSelect={setSelectedFloor}
                  showWindows={t.showWindows}
                  rotation={t.rotation || 0}
                  onRotate={(v) => setTweak('rotation', v)}
                  zoom={zoom}
                  setZoom={setZoom}
                  pan={pan}
                  setPan={setPan}
                  mochi={mochi}
                  stream={stream}
                  healthTone={health.tone}
                  statusText={health.text}
                  statusColor={health.color}
                />
                <div style={{
                  position: 'absolute', left: 14, bottom: 12,
                  display: 'flex', flexDirection: 'column', gap: 6,
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: 'var(--text-3)', pointerEvents: 'none',
                }}>
                  <div>VIEW · ISO 30°{t.rotation ? ` + ${Math.round(t.rotation)}°` : ''} · {Math.round(zoom * 100)}%</div>
                  <div style={{ color: 'var(--text-mute)', fontSize: 9 }}>drag rotate · shift+drag pan · wheel zoom</div>
                  <div>SOURCE · tower:7790</div>
                  <div style={{ color: towerOnline ? 'var(--emerald)' : 'var(--red)' }}>
                    {towerOnline ? 'LIVE' : 'OFFLINE'}
                  </div>
                </div>
                {floor && div && (
                  <div style={{
                    position: 'absolute', right: 14, top: 12,
                    display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end',
                    fontFamily: 'var(--font-mono)', fontSize: 10, pointerEvents: 'none',
                  }}>
                    <span style={{
                      padding: '4px 10px', borderRadius: 999,
                      background: `${div.color}15`, border: `1px solid ${div.color}`,
                      color: div.color, textShadow: `0 0 6px ${div.color}`,
                      letterSpacing: '0.16em', textTransform: 'uppercase',
                    }}>
                      ◉ {div.name}
                    </span>
                    <span style={{ color: 'var(--text-3)' }}>FL.{String(floor.level).padStart(2,'0')} · {floor.agents} agents · {floor.working || 0} working</span>
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                icon="🏢"
                title={towerOnline ? 'tower online, no agents registered' : 'agent_tower not reachable'}
                hint={towerOnline
                  ? 'spawn an agent via the chat composer or `purpclaw run "<task>"` to populate floors.'
                  : 'start the stack with `purpclaw start`. mission-control polls :7790/tower/status every 4s.'}
                color={towerOnline ? 'var(--cyan)' : 'var(--red)'}
              />
            )}
          </div>
        </div>

        {/* cavity / floor room */}
        <div className="cavity">
          <div className="cavity-h">
            <div className="cavity-h-l">
              <span className="cavity-h-tag" style={{ color: div?.color }}>
                FLOOR · {floor ? String(floor.level).padStart(2,'0') : '--'}
              </span>
              <span className="cavity-h-title" style={{ color: div?.color, textShadow: div ? `0 0 6px ${div.color}` : 'none' }}>
                {div?.name || '—'}
              </span>
            </div>
            {floor && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: div?.color }}>
              {floor.agents} agents · {floor.working || 0} working
            </span>}
          </div>
          <div className="cavity-room">
            {floor && div && floor.agents > 0 ? (
              <FloorRoom
                floor={floor}
                division={div}
                agents={agents}
                showMessages={t.showAgentMessages}
                animate={t.animateAgents}
              />
            ) : (
              <EmptyState
                icon={floor ? '◌' : '◇'}
                title={floor ? `floor empty — no agents on ${div?.name}` : 'select a floor'}
                hint={floor ? 'agents in this division spawn here when the orchestrator delegates work.' : 'click any floor on the spine or directly on the tower.'}
                color={div?.color || 'var(--text-3)'}
              />
            )}
          </div>
          <div className="cavity-foot">
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
              agents on this floor
            </div>
            {floor && agents.filter(a => a.floor === selectedFloor).map(a => (
              <div key={a.id} className="agent-chip" style={{
                borderColor: a.status === 'error' ? 'var(--red)' : `${div?.color || 'var(--line-soft)'}`,
                boxShadow: a.status === 'working' ? `0 0 8px ${div?.color}33` : 'none',
              }}>
                <span className="agent-chip-emoji">{a.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="agent-chip-name">{a.name}</div>
                  <div className="agent-chip-task">{a.task || (a.status === 'idle' ? '· idle, registered' : '· no task')}</div>
                </div>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: a.status === 'working' ? 'var(--emerald)'
                          : a.status === 'error' ? 'var(--red)'
                          : a.status === 'completed' ? 'var(--purple)'
                          : 'var(--text-mute)',
                  boxShadow: a.status === 'working' ? '0 0 5px var(--emerald)'
                           : a.status === 'error' ? '0 0 5px var(--red)' : 'none',
                }} />
              </div>
            ))}
            {floor && agents.filter(a => a.floor === selectedFloor).length === 0 && (
              <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                no agents on this floor
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SkySubBar({ active, onChange }) {
  const { tower } = useData();
  const totalAgents = (tower.activeAgents?.length || 0) + (tower.registeredAgents?.length || 0);
  const venting = (tower.activeAgents || []).filter(a => a.status === 'error' || a.status === 'stalled').length;
  return (
    <div className="sky-subs">
      {SKY_SUB_TABS.map(t => {
        const badge = t.id === 'tower' ? totalAgents
                    : t.id === 'venting' ? venting
                    : 0;
        return (
          <button
            key={t.id}
            className={`sky-sub${active === t.id ? ' active' : ''}`}
            onClick={() => onChange(t.id)}
          >
            <span className="sky-sub-icon">{t.icon}</span>
            <span className="sky-sub-label">{t.label}</span>
            {badge > 0 && <span className="sky-sub-badge">{badge}</span>}
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '0 14px',
        fontFamily: 'var(--font-mono)', fontSize: 10,
        color: 'var(--text-3)',
        letterSpacing: '0.18em', textTransform: 'uppercase',
      }}>
        <span>view mode</span>
        <span style={{ color: 'var(--cyan)' }}>ISOMETRIC · 30°</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Venting Machine — REAL: agents whose status is 'error' or stalled
// ─────────────────────────────────────────────────────────────
function VentingMachine() {
  const { agents, connections } = useData();
  const venting = agents.filter(a => a.status === 'error' || a.status === 'stalled');

  return (
    <div className="panel" style={{ flex: 1 }}>
      <div className="panel-h">
        <div className="panel-h-l">
          <span className="panel-tag">agent decompression</span>
          <span className="panel-title">Venting Machine</span>
        </div>
        <span className="pill" style={{ color: venting.length ? 'var(--amber)' : 'var(--emerald)' }}>
          {venting.length} cooling off
        </span>
      </div>
      <div className="panel-body" style={{ padding: 0, position: 'relative' }}>
        {!connections.tower ? (
          <EmptyState
            icon="◎"
            title="agent_tower offline"
            hint="venting state is derived from /tower/status — bring the tower service back to see who's cooling off."
            color="var(--red)"
          />
        ) : venting.length === 0 ? (
          <EmptyState
            icon="◉"
            title="all systems nominal"
            hint="no agents in error or stall state. the venting machine is empty."
            color="var(--emerald)"
          />
        ) : (
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {venting.map(a => {
              const m = divMeta(a.division);
              return (
                <div key={a.id} style={{
                  padding: 12,
                  background: 'var(--panel-2)',
                  border: `1px solid ${m.color}40`,
                  borderLeft: `3px solid ${m.color}`,
                  borderRadius: 8,
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 12,
                  alignItems: 'start',
                }}>
                  <div style={{
                    width: 44, height: 44,
                    display: 'grid', placeItems: 'center',
                    fontSize: 24,
                    background: `${m.color}15`,
                    border: `1px solid ${m.color}`,
                    borderRadius: '50%',
                    boxShadow: `0 0 12px ${m.color}66`,
                  }}>{a.emoji}</div>
                  <div>
                    <div className="row" style={{ gap: 10, marginBottom: 4 }}>
                      <span style={{ color: m.color, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{a.name}</span>
                      <span className="pill" style={{ color: m.color, fontSize: 8 }}>{m.name.toUpperCase()}</span>
                      <span style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>· {a.status}</span>
                    </div>
                    <div style={{ color: 'var(--text-2)', fontSize: 11.5, lineHeight: 1.5 }}>
                      {a.task || '(no current task)'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', color: 'var(--text-3)', textTransform: 'uppercase' }}>since</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: m.color }}>
                      {a.startTime ? new Date(a.startTime).toLocaleTimeString('en-US', { hour12: false }) : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Satellite Office — placeholder for off-site agent services
// ─────────────────────────────────────────────────────────────
function SatelliteOffice() {
  const { services } = useData();
  const satellite = services.filter(s => ['voice', 'cognitive', 'pool'].includes(s.key));
  const online = satellite.filter(s => s.status === 'online');

  return (
    <div className="panel" style={{ flex: 1 }}>
      <div className="panel-h">
        <div className="panel-h-l">
          <span className="panel-tag">remote workers</span>
          <span className="panel-title">Satellite Office</span>
        </div>
        <span className="pill" style={{ color: online.length ? 'var(--emerald)' : 'var(--text-3)' }}>
          {online.length}/{satellite.length} online
        </span>
      </div>
      <div className="panel-body" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {satellite.map(s => {
          const tone = s.status === 'online' ? 'var(--emerald)' : s.status === 'degraded' ? 'var(--amber)' : 'var(--text-3)';
          return (
            <div key={s.key} style={{
              padding: 14, borderRadius: 8,
              background: 'var(--panel-2)',
              border: `1px solid ${s.status === 'online' ? tone : 'var(--line-soft)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              opacity: s.status === 'online' ? 1 : 0.6,
            }}>
              <div className="row" style={{ gap: 14 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: tone, boxShadow: `0 0 8px ${tone}` }} />
                <div>
                  <div style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.name}</div>
                  <div style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 10, marginTop: 2 }}>
                    :{s.port} · {s.path}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: tone, fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em' }}>
                  {s.status}
                </div>
                {s.latency != null && (
                  <div style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 10, marginTop: 2 }}>
                    {s.latency}ms
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div style={{ marginTop: 8, padding: 10, background: 'var(--panel-2)', borderRadius: 6, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.5 }}>
          satellite services run alongside the core tower. voice handles ball commands; cognitive runs the memory matrix + reasoning loop; pool serves the open knowledge index.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CommandComposerDock — persistent command bar (always visible)
// ─────────────────────────────────────────────────────────────
function CommandComposerDock() {
  const { tower, connections, anyConnected } = useData();
  const [mode, setMode]         = useStateA('chat');
  const [text, setText]         = useStateA('');
  const [selAgent, setSelAgent] = useStateA('');
  const [busy, setBusy]         = useStateA(false);
  const [collapsed, setCollapsed] = useStateA(false);
  const [history, setHistory]   = useStateA([]);
  const towerAgents = [...(tower.activeAgents || []), ...(tower.registeredAgents || [])];

  const MODE_CFG = {
    chat:        { label: 'Chat Stack',   endpoint: ':7780/api/chat',       hint: 'Talk to the stack through Unified API' },
    api:         { label: 'API Command',  endpoint: ':7780/api/command',     hint: 'Send a command through the gateway' },
    orchestrate: { label: 'Allocate Job', endpoint: ':7784/api/orchestrate', hint: 'Create a traced workflow' },
    tower:       { label: 'Single Agent', endpoint: ':7790/api/spawn',       hint: 'Assign one selected tower agent' },
  };

  const submit = async () => {
    const cmd = text.trim();
    if (!cmd || busy) return;
    if (mode === 'tower' && !selAgent) {
      setHistory(p => [{ mode, text: cmd, status: 'select an agent' }, ...p.slice(0, 4)]);
      return;
    }
    setBusy(true);
    try {
      let result;
      if (mode === 'orchestrate') {
        const r = await tryProxySend(7784, '/api/orchestrate', { command: cmd, source: 'command-dock' }, 10000);
        result = r ? `workflow ${r.workflowId || '—'} · ${r.status || 'queued'}` : 'orchestrator offline';
      } else if (mode === 'tower') {
        const j = await tryProxySend(7790, '/api/spawn', { agentName: selAgent, task: cmd }, 10000);
        result = j ? `spawned ${selAgent}` : 'tower offline';
      } else {
        const path = mode === 'api' ? '/api/command' : '/api/chat';
        const j = await tryProxySend(7780, path, mode === 'api' ? { text: cmd } : { message: cmd }, 10000);
        result = j?.result || j?.response || j?.reply || j?.message || (j ? 'sent' : 'api offline');
      }
      setHistory(p => [{ mode, text: cmd, status: String(result).slice(0, 60) }, ...p.slice(0, 4)]);
      setText('');
    } catch (e) {
      setHistory(p => [{ mode, text: cmd, status: e.message }, ...p.slice(0, 4)]);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ flexShrink: 0, borderBottom: '1px solid rgba(34,211,238,0.1)', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(20px)', padding: '8px 14px', zIndex: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed ? 0 : 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'rgba(34,211,238,0.45)' }}>primary command bus</span>
          <span style={{ height: 1, width: 40, background: 'rgba(34,211,238,0.2)' }} />
          {!collapsed && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-mute)' }}>{MODE_CFG[mode].hint}</span>}
        </div>
        <button onClick={() => setCollapsed(c => !c)} style={{ padding: '3px 10px', borderRadius: 4, background: 'var(--panel-2)', border: '1px solid var(--line-soft)', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', cursor: 'pointer' }}>
          {collapsed ? 'Open Dock' : 'Compact'}
        </button>
      </div>

      {!collapsed && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'stretch' }}>
          {/* Mode selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line-soft)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
              {Object.entries(MODE_CFG).map(([m, cfg]) => (
                <button key={m} onClick={() => setMode(m)} style={{ padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 9, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', background: mode === m ? 'rgba(34,211,238,0.1)' : 'rgba(0,0,0,0.2)', border: `1px solid ${mode === m ? 'rgba(34,211,238,0.35)' : 'transparent'}`, color: mode === m ? 'var(--cyan)' : 'var(--text-3)' }}>{cfg.label}</button>
              ))}
            </div>
            {mode === 'tower' && (
              <select value={selAgent} onChange={e => setSelAgent(e.target.value)} style={{ padding: '4px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--line)', color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontSize: 10, outline: 'none' }}>
                <option value="">Select agent</option>
                {towerAgents.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
              </select>
            )}
          </div>

          {/* Input area */}
          <div style={{ borderRadius: 10, border: '1px solid rgba(34,211,238,0.15)', background: 'rgba(3,16,24,0.8)', padding: '8px 12px', boxShadow: '0 0 24px rgba(34,211,238,0.05)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--cyan)', flexShrink: 0 }}>{MODE_CFG[mode].label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-mute)', flexShrink: 0 }}>{MODE_CFG[mode].endpoint}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }} placeholder="Direct the tower, allocate a job, or talk to the stack…" style={{ flex: 1, padding: '6px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(34,211,238,0.15)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none' }} />
              <button onClick={submit} disabled={busy || !text.trim()} style={{ padding: '6px 18px', borderRadius: 6, cursor: busy || !text.trim() ? 'default' : 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--emerald)', opacity: busy || !text.trim() ? 0.4 : 1 }}>
                {busy ? '…' : 'Send'}
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {['status', 'Explain current system state. Do not edit.', 'Create a plan only. Do not edit files.'].map((chip, i) => (
                <button key={i} onClick={() => setText(chip)} style={{ padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line-soft)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 9, cursor: 'pointer' }}>{chip.length > 32 ? chip.slice(0, 30) + '…' : chip}</button>
              ))}
            </div>
          </div>

          {/* Dispatch trace */}
          <div style={{ width: 196, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'var(--text-mute)' }}>dispatch trace · {history.length} recent</div>
            {history.length === 0 ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-mute)' }}>No dispatches from this console yet.</div>
              : history.map((h, i) => (
                <div key={i} style={{ padding: '4px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line-soft)' }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 1 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', color: 'var(--cyan)' }}>{h.mode}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--emerald)' }}>{h.status}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.text}</div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Header, TabBar, EmptyState, DisconnectedBanner, SkyscraperTab, mochiFace, CommandComposerDock });

// ─────────────────────────────────────────────────────────────
// App root
// ─────────────────────────────────────────────────────────────
function AppInner() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tab, setTab] = useStateA('skyscraper');
  const [paletteOpen, setPaletteOpen] = useStateA(false);
  const [focusMode, setFocusMode] = useStateA(false);
  const [zoom, setZoom] = useStateA(1);
  const [pan, setPan] = useStateA({ x: 0, y: 0 });
  const [selectedWorkflow, setSelectedWorkflow] = useStateA(null);
  const [cameras, setCameras] = useStateA([]);
  const [selectedFloorGlobal, setSelectedFloorGlobal] = useStateA(null);

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); setTweak('rotation', 0); };

  const ctx = useData();

  // global keyboard shortcuts
  useEffectA(() => {
    const handler = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(p => !p);
        return;
      }
      if (e.key === 'Escape' && focusMode) {
        setFocusMode(false);
        return;
      }
      if (paletteOpen) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'f') { e.preventDefault(); setFocusMode(f => !f); }
      else if (k === 'r') { e.preventDefault(); setTweak('rotation', ((t.rotation || 0) + 45) % 360); }
      else if (k === '0') { e.preventDefault(); resetView(); }
      else if (k >= '1' && k <= '9') {
        const idx = parseInt(k) - 1;
        if (ctx.floors[idx]) { setTab('skyscraper'); setSelectedFloorGlobal(ctx.floors[idx].id); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [paletteOpen, focusMode, t.rotation, ctx.floors]);

  const handlePaletteAction = (action) => {
    switch (action.type) {
      case 'tab':           setTab(action.id); break;
      case 'floor':         setTab('skyscraper'); setSelectedFloorGlobal(action.id); break;
      case 'agent':         setTab('skyscraper'); if (action.floor) setSelectedFloorGlobal(action.floor); break;
      case 'workflow':      setTab('delegation'); setSelectedWorkflow(action.id); break;
      case 'toggle_focus':  setFocusMode(f => !f); break;
      case 'reset_view':    resetView(); break;
      case 'refresh':       window.location.reload(); break;
      case 'tweaks_open':   try { window.parent.postMessage({ type: '__activate_edit_mode' }, '*'); } catch {}; break;
      case 'save_camera': {
        const id = `cam-${Date.now()}`;
        setCameras(c => [...c, { id, name: `View ${c.length + 1}`, zoom, rotation: t.rotation || 0, pan }]);
        break;
      }
      case 'camera_load': {
        const cam = cameras.find(c => c.id === action.id);
        if (cam) { setZoom(cam.zoom); setTweak('rotation', cam.rotation); setPan(cam.pan); }
        break;
      }
    }
  };

  const paletteCtx = {
    tabs: TABS,
    floors: ctx.floors,
    agents: ctx.agents,
    workflows: [...(ctx.pipeline?.active || []), ...(ctx.pipeline?.completed || []).slice(0, 5)],
    cameras,
  };

  return (
    <div className={`app${focusMode ? ' focus-mode' : ''}`}>
      <Header />
      <TabBar active={tab} onChange={setTab} />
      <CommandComposerDock />
      <DisconnectedBanner />
      <div className="main">
        {tab === 'skyscraper' && (
          <SkyscraperTab
            t={t} setTweak={setTweak}
            zoom={zoom} setZoom={setZoom}
            pan={pan} setPan={setPan}
            resetView={resetView}
            selectedFloorOverride={selectedFloorGlobal}
            onSelectedFloorChange={setSelectedFloorGlobal}
          />
        )}
        {tab === 'overview'   && <OverviewTab />}
        {tab === 'command'    && <CommandTab />}
        {tab === 'graph'      && <ProjectGraphTab />}
        {tab === 'swarm'      && <SwarmTab />}
        {tab === 'harness'    && <HarnessTab />}
        {tab === 'agents'     && <AgentsTab />}
        {tab === 'delegation' && <DelegationTab selectedOverride={selectedWorkflow} />}
        {tab === 'workflows'  && <WorkflowsTab />}
        {tab === 'pipeline'   && <PipelineTab />}
        {tab === 'messages'   && <MessagesTab />}
        {tab === 'gatekeeper' && <GatekeeperTab />}
        {tab === 'pool'       && <PoolTab />}
        {tab === 'cognitive'  && <CognitiveTab />}
        {tab === 'events'     && <EventsTab />}
        {tab === 'output'     && <OutputTab />}
        {tab === 'logs'       && <LogsTab />}
        {tab === 'mochi'      && <MochiTab />}
      </div>

      <WorkflowRibbon
        visible={!focusMode}
        onSelectWorkflow={setSelectedWorkflow}
        onJumpToDelegation={() => setTab('delegation')}
      />

      <NotificationToaster />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onAction={handlePaletteAction}
        ctx={paletteCtx}
      />

      {focusMode && (
        <button className="focus-toggle" onClick={() => setFocusMode(false)}>
          exit focus · esc
        </button>
      )}

      <TweaksPanel>
        <TweakSection label="Skyscraper" />
        <TweakToggle  label="Lit windows"          value={t.showWindows}       onChange={(v) => setTweak('showWindows', v)} />
        <TweakToggle  label="Animate agents"       value={t.animateAgents}     onChange={(v) => setTweak('animateAgents', v)} />
        <TweakToggle  label="Inter-agent links"    value={t.showAgentMessages} onChange={(v) => setTweak('showAgentMessages', v)} />
        <TweakSlider  label="Tower rotation"       value={t.rotation || 0} min={0} max={360} unit="°"
                      onChange={(v) => setTweak('rotation', v)} />
        <TweakSection label="Theme" />
        <TweakColor   label="Primary accent"       value={t.primaryAccent}
                      options={['#a855f7','#22d3ee','#ec4899','#f59e0b','#10b981']}
                      onChange={(v) => setTweak('primaryAccent', v)} />
      </TweaksPanel>

      {/* keyboard hint chip */}
      {!focusMode && !paletteOpen && (
        <div style={{
          position: 'fixed', bottom: 8, right: 14, zIndex: 50,
          fontFamily: 'var(--font-mono)', fontSize: 9,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--text-mute)', pointerEvents: 'none',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ padding: '2px 6px', border: '1px solid var(--line)', borderRadius: 3, color: 'var(--text-3)' }}>⌘K</span>
          <span>palette</span>
          <span style={{ marginLeft: 10, padding: '2px 6px', border: '1px solid var(--line)', borderRadius: 3, color: 'var(--text-3)' }}>F</span>
          <span>focus</span>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <DataProvider>
      <AppInner />
    </DataProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
