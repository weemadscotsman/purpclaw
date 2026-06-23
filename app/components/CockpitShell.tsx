'use client';

import { useEffect, useState, useCallback, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AgentWorkDock } from './AgentWorkDock';
import { SessionSidebar } from './SessionSidebar';

type MissionData = {
  api?: { status?: string; uptime?: number; bridgeConnected?: boolean; memory?: { rss: number } };
  tower?: { tower?: { totalActive: number; totalRegistered: number; uptime: number } };
  livePorts?: Array<{ id: string; ok: boolean; status?: number | string }>;
  services?: Array<{ id: string; key?: string; name: string; ok: boolean; status: string | number; port?: number | null; healthPort?: number | null; healthPath?: string | null; url?: string | null; error?: string | null; required?: boolean; group?: string; note?: string | null }>;
  llmLedger?: { totalCalls: number; totalTokens: number; totalCost: number };
  hostTelemetry?: { cpuPct: number | null; ramPct: number | null; processRssMb: number; platform: string; sampledAt: string };
};

type RailItem = { id: string; label: string; sub: string; href: string; icon: string };
type RailGroup = { id: string; label: string; items: RailItem[] };

const RAIL_GROUPS: RailGroup[] = [
  {
    id: 'ops', label: 'OPERATIONS',
    items: [
      { id: 'mission',  label: 'Mission Control', sub: 'Overview & Command',      href: '/mission',         icon: 'MC' },
      { id: 'harness',  label: 'Mission Harness', sub: 'Runs, Streams & Results', href: '/mission/harness', icon: 'HX' },
      { id: 'tower',    label: 'Agent Tower',     sub: 'Deploy & Orchestrate',    href: '/agents',          icon: 'AT' },
    ],
  },
  {
    id: 'obs', label: 'OBSERVABILITY',
    items: [
      { id: 'system',   label: 'System Map',      sub: 'Services, Agents & Flows', href: '/system-map', icon: 'MAP' },
      { id: 'omni',     label: 'OMNI Cockpit',    sub: 'Truth & Integrity',        href: '/omni',       icon: 'OM' },
      { id: 'log',      label: 'Task Log',        sub: 'Live Stream of Runs',      href: '/pipeline',   icon: 'TL' },
    ],
  },
  {
    id: 'int', label: 'INTELLIGENCE',
    items: [
      { id: 'evolution',label: 'Self Evolution',  sub: 'Loop Status & Controls',     href: '/evolution',  icon: 'EV' },
      { id: 'memory',   label: 'Memory',           sub: 'Recall & Weave',             href: '/memory',     icon: 'ME' },
      { id: 'ablate',   label: 'Abliterator',      sub: 'Redact, Purge & Forget',     href: '/abliterator', icon: 'AB' },
    ],
  },
  {
    id: 'mod', label: 'MODELS & ROUTING',
    items: [
      { id: 'providers',label: 'Providers & Models', sub: 'Routing & Sentinel',      href: '/providers', icon: 'PR' },
      { id: 'goop',     label: 'GOOP Playground',     sub: 'API Broker & Registry',   href: '/bridge',    icon: 'GP' },
    ],
  },
  {
    id: 'iface', label: 'INTERFACE',
    items: [
      { id: 'mochi',    label: 'MOCHI',            sub: 'Your Companion',     href: '/mochi', icon: 'MO' },
      { id: 'swarm',    label: 'Agent Swarm',      sub: 'Live Roster View',   href: '/swarm', icon: 'SW' },
    ],
  },
  {
    id: 'sys', label: 'SYSTEM',
    items: [
      { id: 'settings', label: 'Settings OS',      sub: 'System & Runtime',   href: '/settings', icon: 'ST' },
    ],
  },
];

function Bar({ pct, color = '#34d399' }: { pct: number; color?: string }) {
  return (
    <div style={{ width: 30, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color, boxShadow: `0 0 6px ${color}80`, transition: 'width 300ms' }} />
    </div>
  );
}

function Bdg({ label, value, color = '#22d3ee' }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '0 12px', borderRight: '1px solid var(--border-subtle)', minWidth: 0 }}>
      <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 11, color, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', marginTop: 2, textShadow: `0 0 8px ${color}40` }}>{value}</span>
    </div>
  );
}

function PwrStat({ label, pct, unit, color }: { label: string; pct: number | null; unit: string; color?: string }) {
  const measured = typeof pct === 'number' && Number.isFinite(pct);
  const value = measured ? pct : 0;
  const c = color || (value > 80 ? '#fb7185' : value > 60 ? '#fbbf24' : '#22d3ee');
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, padding: '0 6px' }}>
      <Bar pct={value} color={measured ? c : '#475569'} />
      <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{label}</span>
      <span style={{ color: measured ? c : '#64748b', fontWeight: 700 }}>{measured ? `${pct}${unit}` : 'N/A'}</span>
    </span>
  );
}

export function CockpitShell({ children, title = 'One Mission / Many Lenses', hideRail = false }: { children: ReactNode; title?: string; hideRail?: boolean }) {
  const pathname = usePathname() || '/mission';
  const [data, setData] = useState<MissionData | null>(null);
  const [uptime, setUptime] = useState<string>('-');
  const [now, setNow] = useState<string>('');
  const [alertsOpen, setAlertsOpen] = useState(false);

  // FIX 2026-06-22: Claude-style sidebar collapse state.
  // Session list / chat history / New + Save live in the left panel now;
  // user can collapse to a slim icon strip when they want more room.
  // Persisted in localStorage so it survives reloads + route changes.
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('purpclaw.sidebar.open');
      if (stored === '0') setSidebarOpen(false);
      if (stored === '1') setSidebarOpen(true);
    } catch { /* SSR / no storage — keep default */ }
  }, []);
  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => {
      const next = !prev;
      try { window.localStorage.setItem('purpclaw.sidebar.open', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    try {
      // Fetch mission data + real host telemetry + service health together so
      // the footer (CPU/RAM/RSS + HEALTH/SERVICES) shows real numbers, not N/A.
      // /api/mission-data has no livePorts/services array, so the footer's
      // HEALTH/SERVICES were always N/A - /api/services carries that.
      const [missionRes, hostRes, svcRes] = await Promise.all([
        fetch('/api/mission-data', { cache: 'no-store' }),
        fetch('/api/host-telemetry', { cache: 'no-store' }).catch(() => null),
        fetch('/api/services', { cache: 'no-store' }).catch(() => null),
      ]);
      if (missionRes.ok) {
        const md = await missionRes.json();
        let host = null;
        try { if (hostRes && hostRes.ok) host = await hostRes.json(); } catch { /* host optional */ }
        let livePorts = md.livePorts;
        try {
          if (svcRes && svcRes.ok) {
            const sj = await svcRes.json();
            if (Array.isArray(sj.services)) {
              livePorts = sj.services.map((s: { id?: string; ok?: boolean; status?: number | string }) => ({ id: s.id, ok: !!s.ok, status: s.status }));
              md.services = sj.services;
            }
          }
        } catch { /* services optional */ }
        setData({ ...md, hostTelemetry: host || md.hostTelemetry || null, livePorts });
      }
    } catch { /* keep last */ }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const i = setInterval(load, 5000);
    return () => { clearTimeout(first); clearInterval(i); };
  }, [load]);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(d.toISOString().slice(11, 19));
      const seconds = data?.api?.uptime || data?.tower?.tower?.uptime;
      if (seconds) {
        const d2 = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        setUptime(`${d2 ? d2 + 'D ' : ''}${h}H ${m}M`);
      }
    };
    tick();
    const i = setInterval(tick, 2000);
    return () => clearInterval(i);
  }, [data?.api?.uptime, data?.tower?.tower?.uptime]);

  const serviceTotal = data?.livePorts?.length || 0;
  const serviceUp = data?.livePorts?.filter(service => service.ok).length || 0;
  const healthPct = serviceTotal ? Math.round((serviceUp / serviceTotal) * 100) : null;
  const alertCount = Math.max(0, serviceTotal - serviceUp);
  const tokenTotal = data?.llmLedger?.totalTokens;
  const serviceAlerts = (data?.services || []).filter(service => !service.ok);

  return (
    <div className="cockpit-shell" style={{
      height: '100vh',
      overflow: 'hidden',
      display: 'grid',
      gridTemplateColumns: hideRail ? '1fr' : (sidebarOpen ? '19rem 1fr' : '3.25rem 1fr'),
      gridTemplateRows: '56px 1fr 40px',
      gridTemplateAreas: hideRail
        ? `"header" "main" "footer"`
        : `"rail header" "rail main" "rail footer"`,
      background: 'var(--bg-void)',
      color: 'var(--text-primary)',
      position: 'relative',
      transition: 'grid-template-columns 200ms ease',
    }}>
      {/* =================== LEFT PANEL (SessionSidebar + toggle) ===================
          FIX 2026-06-22: replaced the icon-rail with the full SessionSidebar.
          SessionSidebar carries both the chat-session list (top) and the stack-page
          nav (bottom — same items the old RAIL_GROUPS used). Toggle collapses it
          to a slim 52px strip with a single expand button, Claude/Codex-style. */}
      {!hideRail && <aside className="cockpit-rail" style={{
        gridArea: 'rail',
        background: 'linear-gradient(180deg, rgba(18,10,31,0.96) 0%, rgba(10,6,18,1.0) 100%)',
        borderRight: '1px solid var(--border-default)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 10,
        overflow: 'hidden',
      }}>
        {sidebarOpen ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
            {/* Slim header row with logo + collapse toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: 'linear-gradient(135deg, #d946ef 0%, #a855f7 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, color: 'white', fontSize: 16, fontFamily: 'JetBrains Mono, monospace',
                  boxShadow: '0 0 16px rgba(217,70,239,0.5)',
                }}>P</div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontWeight: 800, fontSize: 12, color: '#f5f0ff', letterSpacing: 0.8, textShadow: '0 0 8px rgba(217,70,239,0.4)' }}>PURPCLAW</span>
                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>OS v0.2.0</span>
                </div>
              </div>
              <button
                onClick={toggleSidebar}
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
                style={{
                  width: 26, height: 26, borderRadius: 6,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
                  color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 14, lineHeight: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >‹</button>
            </div>
            {/* The actual session list + stack pages nav */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>
              <SessionSidebar activeSessionId={null} />
            </div>
          </div>
        ) : (
          // Collapsed: slim icon strip with expand button
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', padding: '12px 0' }}>
            <button
              onClick={toggleSidebar}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'linear-gradient(135deg, #d946ef 0%, #a855f7 100%)',
                border: 'none', color: 'white', cursor: 'pointer', fontSize: 18,
                boxShadow: '0 0 16px rgba(217,70,239,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'JetBrains Mono, monospace', fontWeight: 900,
              }}
            >›</button>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => { try { window.location.href = '/mission'; } catch { /* noop */ } }}
              title="New chat"
              aria-label="New chat"
              style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'rgba(34,211,238,0.10)', border: '1px solid rgba(34,211,238,0.30)',
                color: '#22d3ee', cursor: 'pointer', fontSize: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 8,
              }}
            >+</button>
          </div>
        )}

        {/* Bottom rail badge — always visible at the bottom of the panel */}
        <div className="cockpit-rail-bottom" style={{ padding: '10px 12px', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d399' }} />
            <span style={{ fontSize: 9, color: '#34d399', fontFamily: 'JetBrains Mono, monospace' }}>SOVEREIGN</span>
          </div>
        </div>
      </aside>}

      {/* =================== TOP HEADER =================== */}
      <header className="cockpit-header" style={{
        gridArea: 'header',
        background: 'linear-gradient(90deg, rgba(18,10,31,0.92) 0%, rgba(10,6,18,0.98) 100%)',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        backdropFilter: 'blur(12px)',
        position: 'relative',
        zIndex: 5,
      }}>
        {/* Center: title in brackets */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <h1 style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 700,
            color: '#d946ef',
            letterSpacing: 2.5,
            fontFamily: 'JetBrains Mono, monospace',
            textTransform: 'uppercase',
            textShadow: '0 0 16px rgba(217,70,239,0.5)',
          }}>
            [ {title} ]
          </h1>
        </div>

        {/* Right: live status badges */}
        <div className="cockpit-header-badges" style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <Bdg label="HOST"   value="PURPCLAW-OS" color="#22d3ee" />
          <Bdg label="MODE"   value="SOVEREIGN"    color="#d946ef" />
          <Bdg label="UPTIME" value={uptime}       color="#a855f7" />
          <Bdg label="UTC"    value={now}          color="#22d3ee" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', marginLeft: 8, background: 'rgba(217,70,239,0.10)', border: '1px solid rgba(217,70,239,0.30)', borderRadius: 4 }}>
            <span style={{ fontSize: 8, letterSpacing: 1.5, color: 'rgba(255,255,255,0.5)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>PURPCLAW</span>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d399' }} />
          </div>
        </div>
      </header>

      {/* =================== MAIN CONTENT =================== */}
      <main className="cockpit-main" style={{
        gridArea: 'main',
        overflow: 'auto',
        minHeight: 0,
        minWidth: 0,
        position: 'relative',
      }}>
        {children}
      </main>

      {/* =================== BOTTOM STATUS BAR =================== */}
      <footer className="cockpit-footer" style={{
        gridArea: 'footer',
        background: 'linear-gradient(90deg, rgba(18,10,31,0.92) 0%, rgba(10,6,18,0.98) 100%)',
        borderTop: '1px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        fontFamily: 'JetBrains Mono, monospace',
        color: 'rgba(255,255,255,0.75)',
        position: 'relative',
        zIndex: 5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <PwrStat label="HEALTH" pct={healthPct} unit="%" color="#34d399" />
          <Bdg label="SERVICES" value={serviceTotal ? `${serviceUp}/${serviceTotal}` : 'N/A'} color="#22d3ee" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <PwrStat label="CPU" pct={data?.hostTelemetry?.cpuPct ?? null} unit="%" />
          <PwrStat label="RAM" pct={data?.hostTelemetry?.ramPct ?? null} unit="%" color="#34d399" />
          <PwrStat label="GPU" pct={null} unit="%" color="#22d3ee" />
          <PwrStat label="VRAM" pct={null} unit="%" color="#a855f7" />
          <Bdg label="WEB RSS" value={data?.hostTelemetry ? `${data.hostTelemetry.processRssMb} MB` : 'N/A'} color="#fbbf24" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <Bdg label="LLM CALLS" value={data?.llmLedger?.totalCalls ?? 'N/A'} color="#22d3ee" />
          <Bdg label="TOKENS TOTAL" value={typeof tokenTotal === 'number' ? tokenTotal.toLocaleString() : 'N/A'} color="#a855f7" />
          <button type="button" onClick={() => setAlertsOpen(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 10px', marginLeft: 8,
            background: 'rgba(251,113,133,0.12)',
            border: '1px solid rgba(251,113,133,0.35)',
            borderRadius: 4, color: '#fb7185',
            fontWeight: 700, fontSize: 10,
            cursor: 'pointer',
          }}>
            <span>!</span><span>{alertCount} {alertCount === 1 ? 'ALERT' : 'ALERTS'}</span>
          </button>
        </div>
      </footer>
      {alertsOpen && (
        <div role="dialog" aria-label="Stack alerts" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.54)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setAlertsOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(520px, 96vw)', height: '100%', background: 'linear-gradient(180deg, rgba(18,10,31,0.98), rgba(10,6,18,1))', borderLeft: '1px solid rgba(251,113,133,0.35)', boxShadow: '-16px 0 60px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, color: '#fb7185', letterSpacing: 1.5, fontWeight: 800, textTransform: 'uppercase' }}>{alertCount} Stack {alertCount === 1 ? 'Alert' : 'Alerts'}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.48)', marginTop: 3 }}>Real service status from /api/services. Click through to the responsible page.</div>
              </div>
              <button type="button" onClick={() => setAlertsOpen(false)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#f5f0ff', borderRadius: 4, padding: '5px 9px', cursor: 'pointer' }}>close</button>
            </div>
            <div style={{ padding: 14, overflowY: 'auto', display: 'grid', gap: 10 }}>
              {!serviceAlerts.length && (
                <div style={{ padding: 16, border: '1px solid rgba(52,211,153,0.35)', background: 'rgba(52,211,153,0.08)', borderRadius: 6, color: '#34d399', fontSize: 12 }}>No service alerts right now.</div>
              )}
              {serviceAlerts.map(service => (
                <div key={service.id || service.name} style={{ padding: 12, border: '1px solid rgba(251,113,133,0.26)', background: 'rgba(251,113,133,0.07)', borderRadius: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ color: '#f5f0ff', fontSize: 12, fontWeight: 800 }}>{service.name || service.id}</div>
                      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 2, fontFamily: 'JetBrains Mono, monospace' }}>{service.id} / {service.group || 'service'} / {service.required ? 'required' : 'optional'}</div>
                    </div>
                    <div style={{ color: '#fb7185', fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>{String(service.status || 'offline')}</div>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, marginTop: 8, lineHeight: 1.5 }}>
                    {service.error || service.note || 'No successful health response.'}
                    {service.healthPort && service.healthPath ? <div>Health: :{service.healthPort}{service.healthPath}</div> : null}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <Link href="/system-map" style={alertActionStyle}>Open System Map</Link>
                    <Link href="/settings?scope=system" style={alertActionStyle}>Open Settings</Link>
                    {service.id === 'cognitive' || service.name?.toLowerCase().includes('memory') ? <Link href="/memory" style={alertActionStyle}>Open Memory</Link> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <AgentWorkDock />
    </div>
  );
}

const alertActionStyle: React.CSSProperties = {
  padding: '5px 9px',
  background: 'rgba(217,70,239,0.13)',
  border: '1px solid rgba(217,70,239,0.35)',
  borderRadius: 4,
  color: '#d946ef',
  fontSize: 10,
  fontWeight: 800,
  textDecoration: 'none',
  textTransform: 'uppercase',
  letterSpacing: 0.7,
};

