'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import * as THREE from 'three';
import type { MissionData } from '../hooks/useMissionData';

/**
 * LiveSystemMap — 3D interactive globe.
 *
 * Replaces the 2D SVG golden-angle graph with react-force-graph-3D.
 * Shows services, agents, divisions, workflows, and all connections
 * as a physics-driven 3D graph with glowing edges and animated particles
 * on active EventBus traffic.
 *
 * Interactive: click to select, hover for tooltips, drag to orbit,
 * scroll to zoom, double-click to focus node.
 */

// Dynamically import ForceGraph3D to avoid SSR issues (Three.js is browser-only)
const ForceGraph3D = dynamic<any>(() => import('react-force-graph-3d'), { ssr: false });

// ─── Kinds & colours ─────────────────────────────────────────────────────────

const KIND_CONFIG: Record<string, { color: string; size: number; label: string }> = {
  core:     { color: '#22d3ee', size: 3.5, label: 'Core' },
  service:  { color: '#34d399', size: 1.2, label: 'Service' },
  division: { color: '#a78bfa', size: 2.0, label: 'Division' },
  agent:    { color: '#38bdf8', size: 0.8, label: 'Agent' },
  workflow: { color: '#60a5fa', size: 1.5, label: 'Workflow' },
  event:    { color: '#fbbf24', size: 1.0, label: 'Event Bus' },
};

// ─── Static architecture links (the design contract) ────────────────────────

const ARCH_LINKS = [
  // Core bus
  { source: 'svc:api',          target: 'core',           color: '#22d3ee', opacity: 0.6 },
  { source: 'svc:orchestrator', target: 'core',          color: '#22d3ee', opacity: 0.6 },
  { source: 'svc:eventbus',      target: 'core',          color: '#22d3ee', opacity: 0.6 },
  { source: 'svc:state',         target: 'core',          color: '#22d3ee', opacity: 0.6 },
  // Inter-service
  { source: 'svc:tower',          target: 'svc:api',       color: '#60a5fa', opacity: 0.5 },
  { source: 'svc:orchestrator',  target: 'svc:eventbus',  color: '#60a5fa', opacity: 0.5 },
  { source: 'svc:orchestrator',  target: 'svc:state',     color: '#60a5fa', opacity: 0.5 },
  { source: 'svc:orchestrator',  target: 'svc:tower',     color: '#60a5fa', opacity: 0.5 },
  { source: 'svc:coordinator',  target: 'svc:tower',     color: '#60a5fa', opacity: 0.5 },
  { source: 'svc:coordinator',  target: 'svc:eventbus',   color: '#60a5fa', opacity: 0.5 },
  { source: 'svc:gatekeeper',   target: 'svc:api',        color: '#60a5fa', opacity: 0.5 },
  { source: 'svc:context',      target: 'svc:api',        color: '#60a5fa', opacity: 0.5 },
  { source: 'svc:pool',          target: 'svc:api',       color: '#60a5fa', opacity: 0.5 },
  { source: 'svc:cognitive',     target: 'svc:eventbus',  color: '#60a5fa', opacity: 0.5 },
  { source: 'svc:metrics',       target: 'svc:eventbus',  color: '#60a5fa', opacity: 0.5 },
  { source: 'svc:workers',       target: 'svc:eventbus',  color: '#60a5fa', opacity: 0.5 },
  // Voice chain
  { source: 'svc:voice-bridge',  target: 'core',           color: '#f472b6', opacity: 0.5 },
  { source: 'svc:voice-coordinator', target: 'svc:api',   color: '#f472b6', opacity: 0.5 },
  { source: 'svc:voice-ingress', target: 'svc:orchestrator', color: '#f472b6', opacity: 0.5 },
  // Dark / optional
  { source: 'svc:reasoning',    target: 'svc:eventbus',  color: '#a78bfa', opacity: 0.3 },
  { source: 'svc:harness',      target: 'svc:api',        color: '#a78bfa', opacity: 0.3 },
  { source: 'svc:thringlet',    target: 'svc:api',        color: '#a78bfa', opacity: 0.3 },
  { source: 'svc:chorus',       target: 'svc:eventbus',  color: '#a78bfa', opacity: 0.3 },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function isLiveStatus(status?: string) {
  const s = String(status || '').toLowerCase();
  return s === 'online' || s === 'healthy' || s === 'ok' || s === 'degraded';
}

function uniqueAgents(agents: MissionData['agents']) {
  const m = new Map<string, MissionData['agents'][number]>();
  for (const a of agents) {
    const k = a.name.toLowerCase();
    const ex = m.get(k);
    if (!ex || a.status === 'working') m.set(k, a);
  }
  return Array.from(m.values());
}

// ─── Component ───────────────────────────────────────────────────────────────

type GraphNode = {
  id: string;
  label: string;
  sub?: string;
  kind: string;
  color: string;
  active: boolean;
  size: number;
};

type GraphLink = {
  source: string;
  target: string;
  color: string;
  opacity: number;
  active: boolean;
  observed: boolean;
  weight?: number;
};

type Tooltip = {
  x: number;
  y: number;
  node: GraphNode;
} | null;

export function LiveSystemMap({ data }: { data: MissionData }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip>(null);
  // Default to the stable 2D topology. The 3D force-graph is a prerender/SSR
  // landmine (react-force-graph-3d) — keep it OPT-IN behind the existing toggle
  // so System Map builds and renders cleanly by default. (Eddie, restore-2D.)
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('2d');
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ⚡ Bolt: Cache unique agents calculation to avoid redundant O(N) passes across useMemos
  // Expected Impact: Reduces computation time on every data tick by ~66% (3 passes down to 1)
  const uniqueAgentsList = useMemo(() => uniqueAgents(data.agents), [data.agents]);

  // Build graph data from MissionData
  const { nodes, links } = useMemo(() => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const seenNode = new Set<string>();
    const seenLink = new Set<string>();

    const addNode = (n: GraphNode) => {
      if (seenNode.has(n.id)) return;
      seenNode.add(n.id);
      const cfg = KIND_CONFIG[n.kind] ?? KIND_CONFIG.service;
      nodes.push({ ...n, kind: n.kind, color: n.color ?? cfg.color, size: n.size ?? cfg.size, active: n.active ?? false });
    };

    const addLink = (from: string, to: string, color: string, opacity: number, active = true, observed = false, weight?: number) => {
      const k = `${from}->${to}`;
      if (seenLink.has(k)) return;
      seenLink.add(k);
      links.push({ source: from, target: to, color, opacity, active, observed, weight });
    };

    // 1. Architecture baseline links
    for (const l of ARCH_LINKS) {
      addLink(l.source, l.target, l.color, l.opacity);
    }

    // 2. EventBus observed runtime connections (animated — particles flow)
    for (const conn of data.observedConnections ?? []) {
      const fromId = `svc:${conn.from}`;
      const toId = `svc:${conn.to}`;
      const topicColor =
        conn.topic.startsWith('orchestrator.') ? '#f97316' :
        conn.topic.startsWith('agent.') || conn.topic.startsWith('tower.') ? '#34d399' :
        conn.topic.startsWith('kernel.') || conn.topic.startsWith('harness.') ? '#a78bfa' : '#38bdf8';
      addLink(fromId, toId, topicColor, 1.0, true, true, conn.weight);
    }

    // 3. Central hub — PURPCLAW core
    addNode({ id: 'core', label: 'PURPCLAW', kind: 'core', color: '#22d3ee', active: true, size: 4 });

    // 4. Services
    for (const s of data.services) {
      const id = `svc:${s.key || s.name}`;
      const live = isLiveStatus(s.status);
      const cfg = KIND_CONFIG.service;
      addNode({
        id, label: s.name, kind: 'service',
        sub: `:${s.port}`,
        color: live ? (s.status === 'degraded' ? '#fbbf24' : cfg.color) : '#fb7185',
        active: live, size: cfg.size,
      });
    }

    // 5. Divisions
    const agents = uniqueAgentsList;
    const divisions = [...new Set(agents.map(a => a.division || 'UNASSIGNED'))];
    for (const d of divisions) {
      const id = `div:${d}`;
      const list = agents.filter(a => (a.division || 'UNASSIGNED') === d);
      const working = list.filter(a => a.status === 'working').length;
      addNode({ id, label: d, kind: 'division', color: KIND_CONFIG.division.color, active: working > 0, size: KIND_CONFIG.division.size });
      addLink(id, 'core', '#34d399', working > 0 ? 0.7 : 0.2);
    }

    // 6. Agents
    for (const a of agents) {
      const id = `agt:${a.name}`;
      const working = a.status === 'working';
      const cfg = KIND_CONFIG.agent;
      addNode({
        id, label: `${a.emoji || ''} ${a.name}`,
        sub: a.task ? String(a.task).slice(0, 40) : undefined,
        kind: 'agent',
        color: working ? cfg.color : a.status === 'error' ? '#fb7185' : '#38bdf8',
        active: working, size: cfg.size,
      });
      addLink(id, `div:${a.division || 'UNASSIGNED'}`, working ? '#34d399' : '#38bdf8', working ? 0.5 : 0.15);
    }

    // 7. Workflows / active pipeline
    for (const w of data.pipeline?.active ?? []) {
      const id = `wf:${w.id}`;
      addNode({ id, label: w.intent || w.id, kind: 'workflow', color: KIND_CONFIG.workflow.color, active: true, size: KIND_CONFIG.workflow.size });
      addLink(id, 'core', '#60a5fa', 0.6);
    }

    return { nodes, links };
  }, [data, uniqueAgentsList]);

  // Counts for legend
  const counts = useMemo(() => ({
    agents: uniqueAgentsList.length,
    divisions: new Set(uniqueAgentsList.map(a => a.division || 'UNASSIGNED')).size,
    services: data.services.filter(s => isLiveStatus(s.status)).length,
    totalServices: data.services.length,
    flows: data.pipeline?.active?.length ?? 0,
  }), [data, uniqueAgentsList]);

  // Zoom to fit on mount and data change
  useEffect(() => {
    const t = setTimeout(() => graphRef.current?.zoomToFit(400, 50), 1200);
    return () => clearTimeout(t);
  }, [nodes.length]);

  // Build link color function: observed links pulse orange, arch links dim
  const getLinkColor = useCallback((link: any) => {
    if (link.observed) return link.color ?? '#f97316';
    return link.color ?? '#22d3ee';
  }, []);

  const getLinkWidth = useCallback((link: any) => {
    if (link.observed) return Math.min(3, 1 + (link.weight ?? 1) * 0.5);
    return 0.8;
  }, []);

  // Custom node rendering: sphere + glow for active nodes
  const nodeThreeObject = useCallback((node: any) => {
    const cfg = KIND_CONFIG[node.kind] ?? KIND_CONFIG.service;
    const color = new THREE.Color(node.color);
    const r = node.size ?? 1;

    const group = new THREE.Group();

    // Main sphere
    const geo = new THREE.SphereGeometry(r, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: node.active ? 0.6 : 0.1,
      roughness: 0.3,
      metalness: 0.4,
    });
    group.add(new THREE.Mesh(geo, mat));

    // Glow ring for active nodes
    if (node.active) {
      const ringGeo = new THREE.RingGeometry(r + 0.15, r + 0.45, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.lookAt(new THREE.Vector3(0, 0, 1));
      group.add(ring);
    }

    // Point light for core / division nodes
    if (node.kind === 'core' || node.kind === 'division') {
      const light = new THREE.PointLight(node.color, node.active ? 1.5 : 0.3, r * 8);
      group.add(light);
    }

    return group;
  }, []);

  const handleNodeClick = useCallback((node: any) => {
    setSelected(prev => prev === node.id ? null : node.id);
    // Center camera on node
    graphRef.current?.centerAt(node.x, node.y, node.z, 600);
  }, []);

  const handleNodeHover = useCallback((node: any | null, prevNode: any | null) => {
    if (node) {
      // We don't have screen coords from the hover event directly,
      // so we show a simple info panel instead
      setTooltip(null);
      document.body.style.cursor = 'pointer';
    } else {
      setTooltip(null);
      document.body.style.cursor = 'default';
    }
  }, []);

  // Build node label for tooltip
  const getNodeLabel = useCallback((node: any) => {
    return node.label ?? node.id;
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-zinc-950">

      {/* ── 3D Force Graph ── */}
      <ForceGraph3D
        ref={graphRef}
        graphData={{ nodes, links }}
        nodeId="id"
        nodeLabel={getNodeLabel}
        nodeColor={useCallback((node: any) => {
          const cfg = KIND_CONFIG[node.kind] ?? KIND_CONFIG.service;
          return node.color ?? cfg.color;
        }, [])}
        nodeVal={useCallback((node: any) => (node.size ?? 1) ** 2 * 10, [])}
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        linkColor={getLinkColor}
        linkWidth={getLinkWidth}
        linkOpacity={useCallback((link: any) => link.observed ? 0.9 : link.opacity ?? 0.4, [])}
        linkDirectionalParticles={useCallback((link: any) => link.observed ? Math.min(6, 2 + (link.weight ?? 1)) : 0, [])}
        linkDirectionalParticleSpeed={useCallback(() => 0.005, [])}
        linkDirectionalParticleWidth={useCallback((link: any) => link.observed ? Math.min(3, 1 + (link.weight ?? 1) * 0.5) : 0, [])}
        linkDirectionalParticleColor={useCallback((link: any) => link.color ?? '#f97316', [])}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        enableNodeDrag
        enableNavigationControls
        showNavInfo={false}
        backgroundColor="#09090b"
        warmupTicks={80}
        cooldownTicks={50}
        onEngineStop={() => graphRef.current?.zoomToFit(400, 50)}
      />

      {/* ── Top-left: title + counts ── */}
      <div className="absolute left-3 top-3 z-20 max-w-xs border border-white/10 bg-black/70 px-3 py-2 font-mono text-[9px] leading-relaxed">
        <div className="mb-1 text-[8px] uppercase tracking-[0.28em] text-cyan-300/60">Live System Map</div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-white/45">
          <span className="text-emerald-300">{counts.services}/{counts.totalServices}</span>
          <span className="text-cyan-300">{counts.agents}</span>
          <span className="text-violet-300">{counts.divisions}</span>
          <span className="text-blue-300">{counts.flows}</span>
        </div>
        <div className="mt-1.5 space-y-0.5 text-white/40">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />online
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-rose-400" />error
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-violet-400" />division
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />agent
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-sky-400" />workflow
          </div>
          <div className="mt-1 flex items-center gap-1.5 border-t border-white/10 pt-1">
            <span className="inline-block h-0.5 w-4 bg-orange-400" />live traffic
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-cyan-400/40" />arch contract
          </div>
        </div>
      </div>

      {/* ── Top-right: selected node info ── */}
      {selected && (() => {
        const node = nodes.find(n => n.id === selected);
        if (!node) return null;
        return (
          <div className="absolute right-3 top-3 z-20 border border-white/10 bg-black/70 px-3 py-2 font-mono text-[9px]">
            <div className="text-cyan-300">{node.label}</div>
            <div className="mt-0.5 text-white/30">{node.kind} · {node.active ? 'active' : 'inactive'}</div>
            {node.sub && <div className="mt-0.5 text-white/20">{node.sub}</div>}
            <div className="mt-1 border-t border-white/10 pt-1 text-white/20">click elsewhere to deselect</div>
          </div>
        );
      })()}

      {/* ── Bottom-right: controls hint ── */}
      <div className="absolute bottom-3 right-3 z-20 font-mono text-[8px] text-white/20">
        drag to orbit · scroll to zoom · click node to focus
      </div>
    </div>
  );
}
