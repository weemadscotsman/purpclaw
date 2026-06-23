'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CockpitShell } from '../components/CockpitShell';

// Real data, one shell. The legacy static /ui bundle is archived; this page
// renders the tower from /api/mission-data inside CockpitShell.

type TowerFloor = {
  id: string;
  level: number;
  div: string;
  agents: number;
  working: number;
  divisionAgents: string[];
};

const DIVISION_COLORS: Record<string, string> = {
  INTELLIGENCE:   '#22d3ee',
  ENGINEERING:    '#a855f7',
  SECURITY:       '#f43f5e',
  OPERATIONS:     '#fbbf24',
  MEDIA_OPS:      '#ec4899',
  MANAGEMENT:     '#facc15',
  SCIENCE:        '#06b6d4',
  CREATIVE:       '#f472b6',
  INFRASTRUCTURE: '#a3a300',
  LOBBY:          '#67e8f9',
  UNKNOWN:        '#7b7fa3',
};

function colorFor(div: string): string {
  return DIVISION_COLORS[div] || DIVISION_COLORS.UNKNOWN;
}

export default function SkyscraperPage() {
  const router = useRouter();
  const [floors, setFloors] = useState<TowerFloor[]>([]);
  const [division, setDivision] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch('/api/mission-data', { cache: 'no-store' });
      if (!r.ok) {
        setError(`mission-data ${r.status}`);
        return;
      }
      const data = await r.json();
      const tower = data?.tower || {};
      const active = Array.isArray(tower.activeAgents) ? tower.activeAgents : [];
      const registered = Array.isArray(tower.registeredAgents) ? tower.registeredAgents : [];
      const byDiv = new Map<string, { agents: string[]; working: number }>();
      for (const a of [...active, ...registered]) {
        const d = String(a.division || 'UNKNOWN').toUpperCase().replace(/[\s-]/g, '_');
        if (!byDiv.has(d)) byDiv.set(d, { agents: [], working: 0 });
        const e = byDiv.get(d)!;
        e.agents.push(a.name || a.id || 'unnamed');
        if (a.status === 'working') e.working += 1;
      }
      const built: TowerFloor[] = [];
      let level = 1;
      built.push({ id: 'lobby', level: level++, div: 'LOBBY', agents: 0, working: 0, divisionAgents: [] });
      built.push({ id: 'infrastructure', level: level++, div: 'INFRASTRUCTURE', agents: byDiv.get('INFRASTRUCTURE')?.agents.length || 0, working: byDiv.get('INFRASTRUCTURE')?.working || 0, divisionAgents: byDiv.get('INFRASTRUCTURE')?.agents || [] });
      for (const d of ['INTELLIGENCE', 'CREATIVE', 'SCIENCE', 'MEDIA_OPS', 'ENGINEERING', 'SECURITY', 'OPERATIONS', 'MANAGEMENT']) {
        const e = byDiv.get(d);
        if (!e || e.agents.length === 0) continue;
        built.push({ id: `f-${d.toLowerCase()}`, level: level++, div: d, agents: e.agents.length, working: e.working, divisionAgents: e.agents });
      }
      setFloors(built);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, []);

  // Bottom-heavy tower: floor 1 (lobby) at base, level-N at top.
  const total = floors.length;
  const visible = division === 'all' ? floors : floors.filter(f => f.div === division);

  return (
    <CockpitShell title="Abliterator · 3D Agent Tower">
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '8px 14px',
          background: 'rgba(168,85,247,0.10)',
          borderBottom: '1px solid var(--border-default)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#a855f7' }}>AGENT TOWER · 3D SKYSCRAPER</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{total} floors · {visible.reduce((s, f) => s + f.agents, 0)} agents across {total - 2} divisions</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              value={division}
              onChange={e => setDivision(e.target.value)}
              style={{ background: 'rgba(168,85,247,0.10)', border: '1px solid rgba(168,85,247,0.40)', color: '#efe7ff', fontSize: 10, padding: '4px 8px', borderRadius: 3 }}
            >
              <option value="all">All divisions</option>
              {floors.map(f => f.div).filter(d => d !== 'LOBBY').map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <button onClick={load} style={{ padding: '6px 12px', background: 'rgba(168,85,247,0.10)', border: '1px solid rgba(168,85,247,0.40)', borderRadius: 4, color: '#a855f7', fontSize: 10, fontWeight: 700, letterSpacing: 1, cursor: 'pointer' }}>↻ REFRESH</button>
            <button onClick={() => router.push('/mission')} style={{ padding: '6px 14px', background: 'rgba(217,70,239,0.20)', border: '1px solid rgba(217,70,239,0.5)', borderRadius: 4, color: '#d946ef', fontSize: 10, fontWeight: 700, letterSpacing: 1, cursor: 'pointer' }}>← BACK TO COCKPIT</button>
          </div>
        </div>
        <div style={{ flex: 1, background: '#050208', overflow: 'auto', padding: 24, position: 'relative' }}>
          {error && (
            <div style={{ padding: 16, background: 'rgba(251,113,133,0.10)', border: '1px solid rgba(251,113,133,0.30)', borderRadius: 4, color: '#fb7185', fontSize: 11 }}>
              Mission data unavailable: {error}. Check that unified_api :7780 is running.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 8, paddingBottom: 32 }}>
            {[...visible].reverse().map((floor, idx) => {
              const widthPct = 40 + (floor.agents * 4); // wider floor = more agents
              const w = Math.min(86, widthPct);
              const color = colorFor(floor.div);
              return (
                <div key={floor.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: `${w}%`, fontSize: 9, color: 'rgba(255,255,255,0.5)', marginBottom: 2, fontFamily: 'JetBrains Mono, monospace' }}>
                    <span style={{ color, fontWeight: 700 }}>L{floor.level}</span>
                    <span>{floor.div}</span>
                    <span style={{ color: 'var(--text-dim)' }}>{floor.agents} agt · {floor.working} wrk</span>
                  </div>
                  <div
                    style={{
                      width: `${w}%`,
                      height: 28,
                      background: `linear-gradient(180deg, ${color}30 0%, ${color}10 100%)`,
                      border: `1px solid ${color}80`,
                      boxShadow: `0 0 ${8 + floor.working * 4}px ${color}40`,
                      display: 'grid',
                      gridTemplateColumns: `repeat(${Math.max(2, Math.min(8, floor.agents))}, 1fr)`,
                      gap: 4,
                      padding: 4,
                    }}
                  >
                    {floor.divisionAgents.slice(0, 8).map(name => (
                      <div key={name} title={name} style={{ background: `${color}60`, borderRadius: 1, height: '100%', border: `1px solid ${color}cc`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: '#fff', fontWeight: 700, textShadow: '0 0 4px #000', overflow: 'hidden' }}>
                        {name.slice(0, 2).toUpperCase()}
                      </div>
                    ))}
                  </div>
                  {idx < visible.length - 1 && <div style={{ height: 2, width: `${Math.max(8, w * 0.3)}%`, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)' }} />}
                </div>
              );
            })}
            {floors.length === 0 && !error && (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, padding: 40 }}>Probing tower…</div>
            )}
          </div>
        </div>
      </div>
    </CockpitShell>
  );
}
