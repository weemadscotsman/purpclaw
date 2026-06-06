'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { MissionData } from '../hooks/useMissionData';

// react-force-graph-3d uses WebGL/window — must load client-only.
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false });

type GNode = {
  id: string;
  name: string;
  kind: 'core' | 'service' | 'division' | 'agent' | 'workflow' | 'event';
  color: string;
  val: number;
  active: boolean;
};
type GLink = { source: string; target: string; particles: number; color: string };

const DIVISION_COLOR = '#a78bfa';

function uniqueAgents(agents: MissionData['agents']) {
  const m = new Map<string, MissionData['agents'][number]>();
  for (const a of agents) {
    const k = a.name.toLowerCase();
    const ex = m.get(k);
    if (!ex || a.status === 'working') m.set(k, a);
  }
  return Array.from(m.values());
}

export function LiveSystemMap({ data }: { data: MissionData }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const graph = useMemo(() => {
    const nodes: GNode[] = [];
    const links: GLink[] = [];
    const add = (n: GNode) => nodes.push(n);

    add({ id: 'core', name: 'PURPCLAW', kind: 'core', color: '#22d3ee', val: 28, active: true });

    // Services
    for (const s of data.services) {
      const online = s.status === 'online' || s.status === 'degraded';
      add({
        id: `svc:${s.key || s.name}`, name: `${s.name} :${s.port}`, kind: 'service',
        color: s.status === 'online' ? '#34d399' : s.status === 'degraded' ? '#fbbf24' : '#fb7185',
        val: 7, active: online,
      });
      links.push({ source: `svc:${s.key || s.name}`, target: 'core', particles: online ? 2 : 0, color: online ? '#34d39966' : '#fb718533' });
    }

    // Divisions + agents
    const agents = uniqueAgents(data.agents);
    const divisions = [...new Set(agents.map(a => a.division || 'UNASSIGNED'))];
    for (const d of divisions) {
      const list = agents.filter(a => (a.division || 'UNASSIGNED') === d);
      const activeCount = list.filter(a => a.status === 'working').length;
      add({ id: `div:${d}`, name: d, kind: 'division', color: DIVISION_COLOR, val: 10 + Math.min(8, list.length), active: activeCount > 0 });
      links.push({ source: `div:${d}`, target: 'core', particles: activeCount > 0 ? 3 : 0, color: activeCount ? '#34d399aa' : '#a78bfa44' });
    }
    for (const a of agents) {
      const working = a.status === 'working';
      const err = a.status === 'error';
      add({
        id: `agt:${a.name}`, name: `${a.emoji || ''} ${a.name}${a.task ? ` — ${String(a.task).slice(0, 40)}` : ''}`,
        kind: 'agent',
        color: working ? '#34d399' : err ? '#fb7185' : '#38bdf8',
        val: working ? 6 : 3, active: working,
      });
      links.push({
        source: `agt:${a.name}`, target: `div:${a.division || 'UNASSIGNED'}`,
        particles: working ? 4 : 0, color: working ? '#34d399cc' : err ? '#fb718566' : '#38bdf833',
      });
    }

    // Active workflows
    for (const w of data.pipeline?.active || []) {
      const id = `wf:${w.id}`;
      add({ id, name: `⚙ ${w.intent || w.id}`, kind: 'workflow', color: '#60a5fa', val: 6, active: true });
      links.push({ source: id, target: 'core', particles: 5, color: '#60a5facc' });
    }

    // Recent events — the "firing" pulses
    (data.logs || []).slice(0, 12).forEach((e, i) => {
      const id = `evt:${e.id || i}`;
      const isErr = (e.type || '').toLowerCase().includes('error');
      add({ id, name: `${e.source || e.type}: ${String(e.message || '').slice(0, 50)}`, kind: 'event', color: isErr ? '#fb7185' : '#e879f9', val: 2, active: i < 4 });
      links.push({ source: id, target: 'core', particles: i < 6 ? 3 : 1, color: isErr ? '#fb718577' : '#e879f955' });
    });

    return { nodes, links };
  }, [data.services, data.agents, data.pipeline, data.logs]);

  const counts = useMemo(() => ({
    agents: uniqueAgents(data.agents).length,
    divisions: new Set(uniqueAgents(data.agents).map(a => a.division || 'UNASSIGNED')).size,
    services: data.services.filter(s => s.status === 'online' || s.status === 'degraded').length,
    totalServices: data.services.length,
    flows: data.pipeline?.active?.length || 0,
    events: data.logs?.length || 0,
  }), [data]);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      {/* Live legend / counts */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-xl border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-md">
        <div className="text-[8px] uppercase tracking-[0.28em] font-mono text-cyan-300/50">relative mapped knowledge graph</div>
        <div className="text-sm font-black text-white/85">Live System Map</div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] font-mono text-white/45">
          <span><span className="text-emerald-300">{counts.services}/{counts.totalServices}</span> services</span>
          <span><span className="text-cyan-300">{counts.agents}</span> agents</span>
          <span><span className="text-violet-300">{counts.divisions}</span> divisions</span>
          <span><span className="text-blue-300">{counts.flows}</span> flows</span>
          <span><span className="text-fuchsia-300">{counts.events}</span> events</span>
        </div>
      </div>
      <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-col gap-1 rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-[9px] font-mono text-white/45 backdrop-blur-md">
        {[['#34d399', 'working / online'], ['#fb7185', 'error / offline'], ['#a78bfa', 'division'], ['#60a5fa', 'workflow'], ['#e879f9', 'event']].map(([c, l]) => (
          <div key={l} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c as string }} />{l}</div>
        ))}
      </div>

      {size.w > 0 && (
        <ForceGraph3D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={graph}
          backgroundColor="rgba(3,5,8,0)"
          nodeLabel={(n: any) => n.name}
          nodeColor={(n: any) => n.color}
          nodeVal={(n: any) => n.val}
          nodeOpacity={0.92}
          nodeResolution={12}
          linkColor={(l: any) => l.color}
          linkWidth={(l: any) => (l.particles > 0 ? 1.2 : 0.4)}
          linkDirectionalParticles={(l: any) => l.particles}
          linkDirectionalParticleSpeed={0.012}
          linkDirectionalParticleWidth={2}
          warmupTicks={40}
          cooldownTime={6000}
          onNodeClick={(n: any) => {
            const fg = fgRef.current;
            if (!fg || n.x == null) return;
            const dist = 90;
            const ratio = 1 + dist / Math.hypot(n.x, n.y, n.z || 1);
            fg.cameraPosition({ x: n.x * ratio, y: n.y * ratio, z: (n.z || 1) * ratio }, n, 800);
          }}
        />
      )}
    </div>
  );
}

export default LiveSystemMap;
