'use client';

import React, { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Agent } from '../hooks/useMissionData';

const DIVISION_COLORS: Record<string, string> = {
  ENGINEERING: '#3498DB',
  SECURITY: '#27AE60',
  INTELLIGENCE: '#E74C3C',
  OPERATIONS: '#FF5722',
  CREATIVE: '#E91E63',
  MEDIA_OPS: '#9B59B6',
  MANAGEMENT: '#1ABC9C',
  SCIENCE: '#00BCD4',
  INFRASTRUCTURE: '#F39C12',
};

interface SwarmOrchestrationViewProps {
  agents: Agent[];
  teams?: { leader: string; members: string[] }[];
}

function buildNodes(agents: Agent[], divOrder: string[]): Node[] {
  const divMap = new Map<string, Agent[]>();
  for (const a of agents) {
    if (!divMap.has(a.division)) divMap.set(a.division, []);
    divMap.get(a.division)!.push(a);
  }

  const cols = divOrder.filter(d => divMap.has(d));
  if (cols.length === 0) return [];

  const colWidth = 220;
  const nodeHeight = 70;
  const padding = 40;

  const nodes: Node[] = [];
  for (let ci = 0; ci < cols.length; ci++) {
    const div = cols[ci];
    const agentsInDiv = divMap.get(div)!;
    const color = DIVISION_COLORS[div] || '#888';

    for (let ai = 0; ai < agentsInDiv.length; ai++) {
      const a = agentsInDiv[ai];
      const x = ci * colWidth + padding;
      const y = ai * (nodeHeight + 20) + padding + 40;

      const statusColor = a.status === 'working' ? '#22c55e' : a.status === 'completed' ? '#a855f7' : a.status === 'error' ? '#ef4444' : '#666';

      nodes.push({
        id: a.id,
        position: { x, y },
        data: {
          label: (
            <div className="flex flex-col items-center gap-1 p-2">
              <div className="text-lg">{a.emoji}</div>
              <div className="text-[10px] font-mono text-white/80 uppercase truncate max-w-[120px]">{a.name}</div>
              <div
                className="text-[8px] px-1.5 py-0.5 rounded uppercase font-bold"
                style={{ backgroundColor: `${statusColor}20`, color: statusColor }}
              >
                {a.status}
              </div>
            </div>
          ),
        },
        style: {
          background: '#0f1117',
          border: `1px solid ${color}40`,
          borderRadius: 8,
          minWidth: 130,
        },
      });
    }
  }
  return nodes;
}

function buildEdges(agents: Agent[]): Edge[] {
  // Group agents by teamId
  const teamMap = new Map<string, Agent[]>();
  for (const a of agents) {
    if (a.teamId) {
      if (!teamMap.has(a.teamId)) teamMap.set(a.teamId, []);
      teamMap.get(a.teamId)!.push(a);
    }
  }

  const edges: Edge[] = [];
  for (const [, members] of teamMap) {
    if (members.length < 2) continue;
    const leader = members[0];
    for (let i = 1; i < members.length; i++) {
      edges.push({
        id: `${leader.id}->${members[i].id}`,
        source: leader.id,
        target: members[i].id,
        style: { stroke: '#ffffff20', strokeWidth: 1 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#ffffff20' },
      });
    }
  }
  return edges;
}

const DIVISION_ORDER = ['ENGINEERING', 'SECURITY', 'INTELLIGENCE', 'OPERATIONS', 'CREATIVE', 'MEDIA_OPS', 'MANAGEMENT', 'SCIENCE', 'INFRASTRUCTURE'];

export function SwarmOrchestrationView({ agents, teams = [] }: SwarmOrchestrationViewProps) {
  const initialNodes = useMemo(() => buildNodes(agents, DIVISION_ORDER), [agents]);
  const initialEdges = useMemo(() => buildEdges(agents), [agents]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const workingCount = agents.filter(a => a.status === 'working').length;
  const idleCount = agents.filter(a => a.status === 'idle').length;
  const completedCount = agents.filter(a => a.status === 'completed').length;
  const errorCount = agents.filter(a => a.status === 'error').length;

  return (
    <div className="h-full flex flex-col">
      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-3 px-1">
        <Stat label="Total" value={agents.length} color="#fff" />
        <Stat label="Working" value={workingCount} color="#22c55e" />
        <Stat label="Idle" value={idleCount} color="#888" />
        <Stat label="Completed" value={completedCount} color="#a855f7" />
        <Stat label="Errors" value={errorCount} color="#ef4444" />
        <div className="flex-1" />
        {teams.length > 0 && (
          <span className="text-[10px] text-white/30 font-mono">{teams.length} teams active</span>
        )}
      </div>

      {/* Graph */}
      <div className="flex-1 rounded-xl border border-white/10 bg-black/20 overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable
          panOnDrag
          zoomOnScroll
          minZoom={0.1}
          maxZoom={2}
          style={{ background: 'transparent' }}
        >
          <Background color="rgba(255,255,255,0.05)" gap={24} size={1} />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[10px] text-white/40 uppercase">{label}:</span>
      <span className="text-[11px] font-mono font-bold" style={{ color }}>{value}</span>
    </div>
  );
}