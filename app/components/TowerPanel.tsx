'use client';

import React, { useMemo, useState } from 'react';
import type { Agent, MissionData } from '../hooks/useMissionData';
import { LoadingSpinner } from './LoadingSpinner';
import { useToast } from './Toast';

const DIVISION_ORDER = ['INTELLIGENCE', 'ENGINEERING', 'SECURITY', 'INFRASTRUCTURE', 'MEDIA_OPS', 'MANAGEMENT', 'SCIENCE', 'CREATIVE', 'OPERATIONS'];

// Route through the same-origin service proxy so spawn/kill work when the UI is
// served on any host (not just localhost). Matches the pattern used everywhere else.
function towerProxyUrl(path: string) {
  return `/api/service-proxy?port=7790&path=${encodeURIComponent(path)}`;
}

const DIVISION_COLORS: Record<string, string> = {
  INTELLIGENCE: '#fb7185',
  ENGINEERING: '#38bdf8',
  SECURITY: '#34d399',
  INFRASTRUCTURE: '#fbbf24',
  MEDIA_OPS: '#c084fc',
  MANAGEMENT: '#2dd4bf',
  SCIENCE: '#22d3ee',
  CREATIVE: '#f472b6',
  OPERATIONS: '#fb923c',
};

export function TowerPanel({ data }: { data: MissionData }) {
  const [spawnTask, setSpawnTask] = useState('');
  const [spawnAgentName, setSpawnAgentName] = useState('');
  const [spawning, setSpawning] = useState(false);
  const [killingId, setKillingId] = useState<string | null>(null);
  const { success, error } = useToast();

  const uniqueAgents = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const agent of data.agents) {
      const key = agent.name.toLowerCase();
      const existing = map.get(key);
      if (!existing || agent.status === 'working') map.set(key, agent);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [data.agents]);

  const activeAgents = uniqueAgents.filter(agent => agent.status === 'working');
  const erroredAgents = uniqueAgents.filter(agent => agent.status === 'error');
  const idleAgents = uniqueAgents.filter(agent => agent.status === 'idle');

  const divisions = useMemo(() => {
    const map = new Map<string, Agent[]>();
    for (const agent of uniqueAgents) {
      const division = agent.division || 'UNASSIGNED';
      if (!map.has(division)) map.set(division, []);
      map.get(division)!.push(agent);
    }
    return DIVISION_ORDER
      .filter(division => map.has(division))
      .map(division => {
        const agents = map.get(division)!;
        return {
          name: division,
          agents,
          active: agents.filter(agent => agent.status === 'working').length,
          errors: agents.filter(agent => agent.status === 'error').length,
          color: DIVISION_COLORS[division] || '#94a3b8',
        };
      });
  }, [uniqueAgents]);

  const handleSpawn = async () => {
    if (!spawnAgentName || !spawnTask) return;
    setSpawning(true);
    try {
      const res = await fetch(towerProxyUrl('/api/spawn'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName: spawnAgentName.toLowerCase(), task: spawnTask, options: { source: 'tower-panel' } }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload.success !== false) {
        success(`${spawnAgentName} spawned`);
        setSpawnTask('');
      } else {
        error(payload.error || `Spawn failed: ${res.status}`);
      }
    } catch (e: any) {
      error(`Spawn error: ${e.message}`);
    } finally {
      setSpawning(false);
    }
  };

  const handleKill = async (agentId: string) => {
    setKillingId(agentId);
    try {
      const res = await fetch(towerProxyUrl('/api/kill'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload.success !== false) success('Agent killed');
      else error(payload.error || `Kill failed: ${res.status}`);
    } catch (e: any) {
      error(`Kill error: ${e.message}`);
    } finally {
      setKillingId(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <section className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <TowerMetric label="Registered" value={uniqueAgents.length} sub="same source as Agents tab" color="#22d3ee" />
        <TowerMetric label="Active Jobs" value={activeAgents.length} sub="currently working" color="#34d399" />
        <TowerMetric label="Idle" value={idleAgents.length} sub="ready agents" color="#94a3b8" />
        <TowerMetric label="Faulted" value={erroredAgents.length} sub="needs attention" color="#fb7185" />
        <TowerMetric label="Divisions" value={divisions.length} sub="allocation lanes" color="#c084fc" />
      </section>

      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-5 rounded-2xl border border-cyan-300/15 bg-black/35 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[9px] uppercase tracking-[0.28em] text-cyan-300/45 font-mono">tower dispatch</div>
              <div className="text-lg font-black uppercase tracking-[0.16em] text-white/85">Single-Agent Launch Bay</div>
            </div>
            <div className={`h-2.5 w-2.5 rounded-full ${data.towerConnected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          </div>
          <div className="mt-4 grid grid-cols-[160px_1fr_auto] gap-2">
            <select
              value={spawnAgentName}
              onChange={e => setSpawnAgentName(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-xs text-white/70 font-mono outline-none focus:border-cyan-300/40"
            >
              <option value="">Agent</option>
              {uniqueAgents.map(agent => <option key={agent.name} value={agent.name}>{agent.name}</option>)}
            </select>
            <input
              value={spawnTask}
              onChange={e => setSpawnTask(e.target.value)}
              placeholder="Task for one selected agent..."
              className="rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-xs text-white/70 placeholder:text-white/20 outline-none focus:border-cyan-300/40"
            />
            <button
              onClick={handleSpawn}
              disabled={spawning || !spawnAgentName || !spawnTask}
              className="rounded-lg border border-emerald-300/30 bg-emerald-300/12 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200 disabled:opacity-35 hover:bg-emerald-300/20 flex items-center gap-2"
            >
              {spawning && <LoadingSpinner size={12} />}
              Spawn
            </button>
          </div>
          <div className="mt-3 text-[10px] text-white/30 font-mono">
            This panel only launches one selected agent. Bulk swarm direction lives in Swarm/Pipeline, profile editing lives in Agents.
          </div>
        </div>

        <div className="col-span-12 xl:col-span-7 rounded-2xl border border-white/10 bg-black/35 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[9px] uppercase tracking-[0.28em] text-white/35 font-mono">division allocation</div>
              <div className="text-lg font-black uppercase tracking-[0.16em] text-white/85">Tower Flow Board</div>
            </div>
            <div className="text-[10px] font-mono text-white/35">{uniqueAgents.length} registered / {activeAgents.length} active</div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {divisions.map(division => (
              <div key={division.name} className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-[9px] font-mono uppercase tracking-[0.16em]" style={{ color: division.color }}>{division.name}</div>
                  <div className="text-[10px] font-mono text-white/35">{division.agents.length}</div>
                </div>
                <div className="mt-3 flex h-8 items-end gap-1">
                  {division.agents.slice(0, 12).map(agent => (
                    <span
                      key={agent.id}
                      title={`${agent.name}: ${agent.status}${agent.task ? ` - ${agent.task}` : ''}`}
                      className="flex-1 rounded-t border border-white/5"
                      style={{
                        height: agent.status === 'working' ? '100%' : agent.status === 'error' ? '75%' : '42%',
                        backgroundColor: agent.status === 'working' ? '#34d399' : agent.status === 'error' ? '#fb7185' : `${division.color}66`,
                        boxShadow: agent.status === 'working' ? '0 0 12px rgba(52,211,153,0.45)' : 'none',
                      }}
                    />
                  ))}
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(4, (division.active / Math.max(division.agents.length, 1)) * 100)}%`, backgroundColor: division.active ? '#34d399' : division.color }} />
                </div>
                <div className="mt-2 text-[9px] font-mono text-white/30">{division.active} active / {division.errors} errors</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/35 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[9px] uppercase tracking-[0.28em] text-white/35 font-mono">lifecycle control</div>
            <div className="text-lg font-black uppercase tracking-[0.16em] text-white/85">Active Worker Processes</div>
          </div>
          <div className="text-[10px] font-mono text-white/35">{activeAgents.length} running</div>
        </div>
        <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
          {activeAgents.length === 0 ? (
            <div className="col-span-full rounded-xl border border-white/10 bg-white/[0.025] p-8 text-center text-[11px] uppercase tracking-[0.22em] text-white/25 font-mono">
              no active worker processes
            </div>
          ) : activeAgents.map(agent => (
            <ActiveAgentCard key={agent.id} agent={agent} killingId={killingId} onKill={() => handleKill(agent.id)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function TowerMetric({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[9px] uppercase tracking-[0.22em] text-white/35 font-mono">{label}</div>
      <div className="mt-2 text-4xl font-black font-mono leading-none" style={{ color, textShadow: `0 0 24px ${color}55` }}>{value}</div>
      <div className="mt-2 text-[10px] uppercase tracking-wider text-white/30 font-mono">{sub}</div>
    </div>
  );
}

function ActiveAgentCard({ agent, onKill, killingId }: { agent: Agent; onKill: () => void; killingId: string | null }) {
  const color = DIVISION_COLORS[agent.division] || '#94a3b8';
  const isKilling = killingId === agent.id;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border bg-black/50 text-2xl" style={{ borderColor: `${color}55` }}>{agent.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black uppercase tracking-wider text-white/85">{agent.name}</span>
            <span className="rounded-full bg-emerald-300/12 px-2 py-0.5 text-[8px] font-mono uppercase tracking-wider text-emerald-300">working</span>
          </div>
          <div className="mt-1 text-[10px] font-mono text-white/35">{agent.division} / {agent.role}</div>
          <div className="mt-3 rounded-lg bg-black/35 px-3 py-2 text-[11px] text-white/60 font-mono">{agent.task || 'No task reported'}</div>
        </div>
        <button
          onClick={onKill}
          disabled={killingId !== null}
          className="rounded-lg border border-rose-300/30 bg-rose-300/12 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-rose-200 disabled:opacity-40 hover:bg-rose-300/20 flex items-center gap-2"
        >
          {isKilling && <LoadingSpinner size={10} />}
          Kill
        </button>
      </div>
    </div>
  );
}
