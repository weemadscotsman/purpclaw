'use client';

import { useEffect, useState, useCallback, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ErrorBoundary } from './ErrorBoundary';

type MissionData = {
  api?: { status?: string; uptime?: number; bridgeConnected?: boolean; memory?: { rss: number } };
  tower?: { tower?: { totalActive: number; totalRegistered: number; uptime: number } };
  livePorts?: Array<{ id: string; ok: boolean; status: number }>;
  services?: Array<{ id: string; name: string; status: string }>;
  llmLedger?: { totalCalls: number; totalTokens: number; totalCost: number };
  hostTelemetry?: { cpuPct: number | null; ramPct: number | null; processRssMb: number; platform: string; sampledAt: string };
};

type RailItem = { id: string; label: string; sub: string; href: string; icon: string };
type RailGroup = { id: string; label: string; items: RailItem[] };

const RAIL_GROUPS: RailGroup[] = [
  {
    id: 'ops', label: 'OPERATIONS',
    items: [
      { id: 'mission',  label: 'Mission Control', sub: 'Overview & Command',      href: '/mission',         icon: '◇' },
      { id: 'harness',  label: 'Mission Harness', sub: 'Runs, Streams & Results', href: '/mission/harness', icon: 'HX' },
      { id: 'tower',    label: 'Agent Tower',     sub: 'Deploy & Orchestrate',    href: '/agents',          icon: '⛬' },
    ],
  },
  {
    id: 'obs', label: 'OBSERVABILITY',
    items: [
      { id: 'system',   label: 'System Map',      sub: 'Services, Agents & Flows', href: '/system-map', icon: 'MAP' },
      { id: 'omni',     label: 'OMNI Cockpit',    sub: 'Truth & Integrity',        href: '/omni',       icon: 'OM' },
      { id: 'log',      label: 'Task Log',        sub: 'Live Stream of Runs',      href: '/pipeline',   icon: '⚡' },
    ],
  },
  {
    id: 'int', label: 'INTELLIGENCE',
    items: [
      { id: 'evolution',label: 'Self Evolution',  sub: 'Loop Status & Controls',     href: '/evolution',  icon: 'EV' },
      { id: 'memory',   label: 'Memory',           sub: 'Recall & Weave',             href: '/inline',     icon: '◈' },
      { id: 'ablate',   label: 'Abliterator',      sub: 'Redact, Purge & Forget',     href: '/skyscraper', icon: '◬' },
    ],
  },
  {
    id: 'mod', label: 'MODELS & ROUTING',
    items: [
      { id: 'providers',label: 'Providers & Models', sub: 'Routing & Sentinel',      href: '/providers', icon: '🛰' },
      { id: 'goop',     label: 'GOOP Playground',     sub: 'API Broker & Registry',   href: '/bridge',    icon: '⌬' },
    ],
  },
  {
    id: 'iface', label: 'INTERFACE',
    items: [
      { id: 'voice',    label: 'Voice',            sub: 'Speak to PURPCLAW',  href: '/voice', icon: '◉' },
      { id: 'mochi',    label: 'MOCHI',            sub: 'Your Companion',     href: '/mochi', icon: '✦' },
      { id: 'swarm',    label: 'Agent Swarm',      sub: 'Live Roster View',   href: '/swarm', icon: '⊞' },
    ],
  },
  {
    id: 'sys', label: 'SYSTEM',
    items: [
      { id: 'settings', label: 'Settings OS',      sub: 'System & Runtime',   href: '/settings', icon: '⚙' },
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

export function CockpitShell({ children, title = 'One Mission / Many Lenses' }: { children: ReactNode; title?: string }) {
  const pathname = usePathname() || '/mission';
  const [data, setData] = useState<MissionData | null>(null);
  const [uptime, setUptime] = useState<string>('—');
  const [now, setNow] = useState<string>('');

  const load = useCallback(async () => {
    try {
      // Fetch mission data + real host telemetry + service health together so
      // the footer (CPU/RAM/RSS + HEALTH/SERVICES) shows real numbers, not N/A.
      // /api/mission-data has no livePorts/services array, so the footer's
      // HEALTH/SERVICES were always N/A — /api/services carries that.
      const [missionRes, hostRes, svcRes] = await Promise.allSettled([
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
            if (Array.isArray(sj.services)) livePorts = sj.services.map((s: { id?: string; ok?: boolean }) => ({ id: s.id, ok: !!s.ok }));
          }
        } catch { /* services optional */ }
        setData({ ...md, hostTelemetry: host || md.hostTelemetry || null, livePorts });
      }
    } catch { /* keep last */ }
  }, []);

  useEffect(() => {
    load();
    const i = setInterval(load, 15_000);
    return () => clearInterval(i);
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

  return (
    <div className="cockpit-shell" style={{
      minHeight: '100vh',
      display: 'grid',
      gridTemplateColumns: '220px 1fr',
      gridTemplateRows: '56px 1fr 40px',
      gridTemplateAreas: `"rail header" "rail main" "rail footer"`,
      background: 'var(--bg-void)',
      color: 'var(--text-primary)',
      position: 'relative',
    }}>
      {/* =================== LEFT RAIL =================== */}
      <aside className="cockpit-rail" style={{
        gridArea: 'rail',
        background: 'linear-gradient(180deg, rgba(18,10,31,0.96) 0%, rgba(10,6,18,1.0) 100%)',
        borderRight: '1px solid var(--border-default)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 10,
      }}>
        {/* Logo block */}
        <div className="cockpit-rail-logo" style={{ padding: '14px 18px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'linear-gradient(135deg, #d946ef 0%, #a855f7 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, color: 'white', fontSize: 22, fontFamily: 'JetBrains Mono, monospace',
              boxShadow: '0 0 20px rgba(217,70,239,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
            }}>P</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: '#f5f0ff', letterSpacing: 0.8, textShadow: '0 0 12px rgba(217,70,239,0.4)' }}>PURPCLAW</span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1, marginTop: 1 }}>OS v0.1.7</span>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="cockpit-nav" style={{ padding: '4px 0', flex: 1, overflowY: 'auto' }}>
          {RAIL_GROUPS.map(group => (
            <div key={group.id} className="cockpit-nav-group" style={{ marginBottom: 6 }}>
              <div className="cockpit-nav-group-label" style={{
                padding: '10px 18px 4px',
                fontSize: 8,
                color: 'rgba(255,255,255,0.35)',
                letterSpacing: 2,
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 700,
                textTransform: 'uppercase',
              }}>{group.label}</div>
              {group.items.map(item => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '7px 18px',
                      color: isActive ? '#f5f0ff' : 'rgba(245,240,255,0.6)',
                      background: isActive ? 'linear-gradient(90deg, rgba(217,70,239,0.22) 0%, rgba(168,85,247,0.06) 70%, transparent 100%)' : 'transparent',
                      borderLeft: isActive ? '3px solid #d946ef' : '3px solid transparent',
                      textDecoration: 'none',
                      fontSize: 12,
                      transition: 'all 150ms',
                      cursor: 'pointer',
                      position: 'relative',
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(168,85,247,0.08)'; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <span style={{
                      fontSize: 16,
                      color: isActive ? '#d946ef' : 'rgba(168,85,247,0.55)',
                      width: 22, textAlign: 'center',
                      textShadow: isActive ? '0 0 12px rgba(217,70,239,0.7)' : 'none',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}>{item.icon}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                      <span style={{ fontWeight: isActive ? 700 : 500, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' }}>{item.label}</span>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: 'JetBrains Mono, monospace', marginTop: 1, letterSpacing: 0.3 }}>{item.sub}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom rail badge */}
        <div className="cockpit-rail-bottom" style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, fontFamily: 'JetBrains Mono, monospace' }}>SOVEREIGN · LOCAL · YOURS</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d399' }} />
            <span style={{ fontSize: 9, color: '#34d399', fontFamily: 'JetBrains Mono, monospace' }}>SOVEREIGN MODE</span>
          </div>
        </div>
      </aside>

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
        position: 'relative',
      }}>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
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
          <span style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 10px', marginLeft: 8,
            background: 'rgba(251,113,133,0.12)',
            border: '1px solid rgba(251,113,133,0.35)',
            borderRadius: 4, color: '#fb7185',
            fontWeight: 700, fontSize: 10,
          }}>
            <span>▲</span><span>{alertCount} {alertCount === 1 ? 'ALERT' : 'ALERTS'}</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
