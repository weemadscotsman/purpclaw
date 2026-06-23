'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MissionData } from '../hooks/useMissionData';

/**
 * LiveSystemMap — 2D SVG layout.
 *
 * Shows services, agents, divisions, workflows, and inter-service connections
 * as nodes and edges. Connections come from two sources:
 *   1. Known architecture links (baseline — always shown)
 *   2. EventBus SSE observed connections (real runtime traffic)
 *
 * Interactive: click a node to select, hover for port info.
 */

type Node = {
  id: string;
  label: string;
  sub?: string;
  kind: 'core' | 'service' | 'division' | 'agent' | 'workflow' | 'event';
  color: string;
  active: boolean;
  x: number;
  y: number;
  size: number;
};

type Link = {
  source: string;
  target: string;
  active: boolean;
  color: string;
  weight?: number;
  observed?: boolean;
};

// Known architecture links — the static connection contract.
// These reflect how the system is *designed* to be wired.
const ARCH_LINKS: Link[] = [
  // Core bus
  { source: 'svc:api',            target: 'core',  active: true, color: '#22d3ee88' },
  { source: 'svc:orchestrator',   target: 'core',  active: true, color: '#22d3ee88' },
  { source: 'svc:eventbus',       target: 'core',  active: true, color: '#22d3ee88' },
  { source: 'svc:state',          target: 'core',  active: true, color: '#22d3ee88' },
  // Inter-service known paths
  { source: 'svc:tower',          target: 'svc:api',        active: true, color: '#60a5fa88' },
  { source: 'svc:orchestrator',   target: 'svc:eventbus',   active: true, color: '#60a5fa88' },
  { source: 'svc:orchestrator',   target: 'svc:state',      active: true, color: '#60a5fa88' },
  { source: 'svc:orchestrator',   target: 'svc:tower',      active: true, color: '#60a5fa88' },
  { source: 'svc:coordinator',    target: 'svc:tower',      active: true, color: '#60a5fa88' },
  { source: 'svc:coordinator',    target: 'svc:eventbus',   active: true, color: '#60a5fa88' },
  { source: 'svc:gatekeeper',     target: 'svc:api',         active: true, color: '#60a5fa88' },
  { source: 'svc:context',        target: 'svc:api',         active: true, color: '#60a5fa88' },
  { source: 'svc:pool',           target: 'svc:api',         active: true, color: '#60a5fa88' },
  { source: 'svc:cognitive',      target: 'svc:eventbus',    active: true, color: '#60a5fa88' },
  { source: 'svc:metrics',        target: 'svc:eventbus',   active: true, color: '#60a5fa88' },
  { source: 'svc:workers',        target: 'svc:eventbus',   active: true, color: '#60a5fa88' },
  // Voice chain
  { source: 'svc:voice-bridge',   target: 'core',  active: true, color: '#f472b688' },
  { source: 'svc:voice-coordinator', target: 'svc:api',     active: true, color: '#f472b688' },
  { source: 'svc:voice-ingress',  target: 'svc:orchestrator', active: true, color: '#f472b688' },
  // Dark / optional
  { source: 'svc:reasoning',      target: 'svc:eventbus',   active: true, color: '#a78bfa44' },
  { source: 'svc:harness',        target: 'svc:api',         active: true, color: '#a78bfa44' },
  { source: 'svc:thringlet',      target: 'svc:api',         active: true, color: '#a78bfa44' },
  { source: 'svc:chorus',          target: 'svc:eventbus',   active: true, color: '#a78bfa44' },
];

function uniqueAgents(agents: MissionData['agents']) {
  const m = new Map<string, MissionData['agents'][number]>();
  for (const a of agents) {
    const k = a.name.toLowerCase();
    const ex = m.get(k);
    if (!ex || a.status === 'working') m.set(k, a);
  }
  return Array.from(m.values());
}

function isLiveStatus(status?: string) {
  const s = String(status || '').toLowerCase();
  return s === 'online' || s === 'healthy' || s === 'ok' || s === 'degraded';
}

function LiveSystemMap({ data }: { data: MissionData }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const { nodes, links } = useMemo(() => {
    const nodes: Node[] = [];
    const links: Link[] = [];
    const seenLinks = new Set<string>();
    let index = 0;

    const linkKey = (from: string, to: string) => `${from}->${to}`;

    const addNode = (n: Omit<Node, 'x' | 'y'>) => {
      if (nodes.find(x => x.id === n.id)) return; // dedupe
      const angle = (index * 137.5) % 360; // golden angle
      const radius = 80 + (n.kind === 'core' ? 0 : n.kind === 'division' ? 40 : n.kind === 'agent' ? 90 : 60);
      const x = 300 + radius * Math.cos(angle * Math.PI / 180);
      const y = 250 + radius * Math.sin(angle * Math.PI / 180);
      nodes.push({ ...n, x, y });
      index++;
    };
    const addLink = (from: string, to: string, active: boolean, color: string, weight = 1, observed = false) => {
      const k = linkKey(from, to);
      if (seenLinks.has(k)) return; // dedupe
      seenLinks.add(k);
      links.push({ source: from, target: to, active, color, weight, observed });
    };

    // 1. Architecture baseline links (always present)
    for (const l of ARCH_LINKS) addLink(l.source, l.target, l.active, l.color);

    // 2. Observed connections from EventBus SSE (real runtime traffic)
    for (const conn of (data.observedConnections || [])) {
      const fromId = `svc:${conn.from}`;
      const toId = `svc:${conn.to}`;
      // color by topic family
      const topicColor = conn.topic.startsWith('orchestrator.')
        ? '#f97316cc' : conn.topic.startsWith('agent.') || conn.topic.startsWith('tower.')
          ? '#34d399cc' : conn.topic.startsWith('kernel.') || conn.topic.startsWith('harness.')
            ? '#a78bfacc' : '#38bdf8cc';
      addLink(fromId, toId, true, topicColor, conn.weight, true);
    }

    // 3. Central hub
    addNode({ id: 'core', label: 'PURPCLAW', kind: 'core', color: '#22d3ee', active: true, size: 26 });

    // 4. Service nodes
    for (const s of data.services) {
      const lid = `svc:${s.key || s.name}`;
      addNode({
        id: lid, label: s.name, sub: `:${s.port}`, kind: 'service',
        color: isLiveStatus(s.status) ? (s.status === 'degraded' ? '#fbbf24' : '#34d399') : '#fb7185',
        active: isLiveStatus(s.status), size: 10,
      });
    }

    // 5. Divisions
    const agents = uniqueAgents(data.agents);
    const divisions = [...new Set(agents.map(a => a.division || 'UNASSIGNED'))];
    for (const d of divisions) {
      const did = `div:${d}`;
      const list = agents.filter(a => (a.division || 'UNASSIGNED') === d);
      const activeCount = list.filter(a => a.status === 'working').length;
      addNode({
        id: did, label: d, kind: 'division', color: '#a78bfa',
        active: activeCount > 0, size: 14,
      });
      addLink(did, 'core', activeCount > 0, activeCount ? '#34d399aa' : '#a78bfa44');
    }

    // 6. Agents
    for (const a of agents) {
      const aid = `agt:${a.name}`;
      const working = a.status === 'working';
      addNode({
        id: aid, label: `${a.emoji || ''} ${a.name}`,
        sub: a.task ? String(a.task).slice(0, 40) : '',
        kind: 'agent',
        color: working ? '#34d399' : a.status === 'error' ? '#fb7185' : '#38bdf8',
        active: working, size: 8,
      });
      addLink(aid, `div:${a.division || 'UNASSIGNED'}`, working,
        working ? '#34d399cc' : a.status === 'error' ? '#fb718566' : '#38bdf833');
    }

    // 7. Workflows
    for (const w of data.pipeline?.active || []) {
      const wid = `wf:${w.id}`;
      addNode({ id: wid, label: w.intent || w.id, kind: 'workflow', color: '#60a5fa', active: true, size: 12 });
      addLink(wid, 'core', true, '#60a5facc');
    }

    return { nodes, links };
  }, [data.services, data.agents, data.pipeline, data.logs, data.observedConnections]);

  const counts = useMemo(() => ({
    agents: uniqueAgents(data.agents).length,
    divisions: new Set(uniqueAgents(data.agents).map(a => a.division || 'UNASSIGNED')).size,
    services: data.services.filter(s => isLiveStatus(s.status)).length,
    totalServices: data.services.length,
    flows: data.pipeline?.active?.length || 0,
    events: data.logs?.length || 0,
  }), [data]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-950">
      {/* Legend */}
      <div className="absolute left-3 top-3 z-10 border border-white/10 bg-black/60 px-3 py-2 text-[9px] font-mono leading-relaxed">
        <div className="text-[8px] uppercase tracking-[0.28em] text-cyan-300/50">Live System Map</div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-white/45">
          <span className="text-emerald-300">{counts.services}/{counts.totalServices}</span> services
          <span className="text-cyan-300">{counts.agents}</span> agents
          <span className="text-violet-300">{counts.divisions}</span> divisions
          <span className="text-blue-300">{counts.flows}</span> flows
        </div>
        <div className="mt-1 space-y-0.5">
          {[['#34d399', 'online'], ['#fb7185', 'error'], ['#a78bfa', 'division'], ['#60a5fa', 'workflow'], ['#38bdf8', 'agent']].map(([c, l]) => (
            <div key={l} className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5" style={{ background: c as string }} />{l}</div>
          ))}
          <div className="mt-1 border-t border-white/10 pt-1">
            <div className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-orange-400 opacity-70" />live connection</div>
            <div className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-cyan-400/50" />arch contract</div>
          </div>
        </div>
      </div>

      {/* SVG canvas */}
      <svg width="100%" height="100%" viewBox="0 0 600 500" className="absolute inset-0" style={{ opacity: 0.85 }}>
        {/* Architecture baseline links — thin, static */}
        {links.filter(l => !l.observed).map((l, i) => {
          const src = nodes.find(n => n.id === l.source);
          const tgt = nodes.find(n => n.id === l.target);
          if (!src || !tgt) return null;
          return (
            <line
              key={`arch-${i}`}
              x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
              stroke={l.color}
              strokeWidth={l.active ? 1 : 0.5}
              opacity={l.active ? 0.5 : 0.15}
            />
          );
        })}
        {/* Observed runtime connections — thick, animated pulse */}
        {links.filter(l => l.observed).map((l, i) => {
          const src = nodes.find(n => n.id === l.source);
          const tgt = nodes.find(n => n.id === l.target);
          if (!src || !tgt) return null;
          const strokeWidth = Math.min(4, 1 + (l.weight || 1) * 0.5);
          return (
            <g key={`obs-${i}`}>
              {/* Glow ring */}
              <line
                x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                stroke={l.color} strokeWidth={strokeWidth + 3}
                opacity={0.15} className="animate-pulse"
              />
              {/* Main line */}
              <line
                x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                stroke={l.color} strokeWidth={strokeWidth}
                opacity={0.85}
              />
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map(n => {
          const isHovered = hovered === n.id;
          const isSelected = selected === n.id;
          const r = n.size * (isSelected ? 1.5 : isHovered ? 1.25 : 1);

          return (
            <g
              key={n.id}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setSelected(n.id === selected ? null : n.id)}
              style={{ cursor: 'pointer', transition: 'all 0.15s' }}
            >
              {/* Glow for active nodes */}
              {n.active && (
                <circle cx={n.x} cy={n.y} r={r + 4} fill="none" stroke={n.color} strokeWidth={1} opacity={0.25}
                  className="animate-pulse" />
              )}
              {/* Main circle */}
              <circle cx={n.x} cy={n.y} r={r} fill={n.active ? n.color : '#3f3f46'} stroke="#1f2937" strokeWidth={1.5}
                opacity={n.active ? 0.9 : 0.4} />
              {/* Label */}
              <text x={n.x} y={n.y + r + 12} textAnchor="middle" fill={isHovered ? '#e4e4e7' : '#a1a1aa'}
                fontSize={n.kind === 'core' ? 10 : n.kind === 'division' ? 9 : 8}
                fontFamily="JetBrains Mono, monospace"
                fontWeight={n.kind === 'core' ? 700 : 400}
                className="pointer-events-none select-none"
              >
                {n.label.length > 20 ? n.label.slice(0, 18) + '…' : n.label}
              </text>
              {isHovered && n.sub && (
                <text x={n.x} y={n.y + r + 24} textAnchor="middle" fill="#71717a"
                  fontSize={7} fontFamily="monospace" className="pointer-events-none select-none">
                  {n.sub.length > 28 ? n.sub.slice(0, 26) + '…' : n.sub}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Click info */}
      {selected && (
        <div className="absolute bottom-3 right-3 border border-white/10 bg-black/70 px-3 py-2 text-[9px] font-mono">
          <div className="text-cyan-300">{selected}</div>
          <div className="text-zinc-500">click to deselect</div>
        </div>
      )}
    </div>
  );
}

export { LiveSystemMap };
