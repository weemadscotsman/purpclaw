'use client';

import { useEffect, useState } from 'react';
import type { MissionData } from '../hooks/useMissionData';

/**
 * SwarmPanel — LIVE delegation + swarm-mission status.
 *
 * Pulls the coordinator session stats (orchestrator :7784 /api/swarm/status)
 * for the real mission counts, and uses delegationStatus + agentScores from
 * the shared data model for history and rankings.
 */
export function SwarmPanel({ data }: { data: MissionData }) {
  // delegationStatus / agentScores carry extra runtime fields (history,
  // totalDelegations, list) beyond the strict typed shape — read loosely.
  const delegation = data?.delegationStatus as any;
  const agents = data?.agents || [];
  const scores = data?.agentScores as any;

  // Live swarm-mission session from the coordinator (via the orchestrator).
  const [swarm, setSwarm] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch('/api/service-proxy?port=7784&path=' + encodeURIComponent('/api/swarm/status') + '&soft=1', { signal: AbortSignal.timeout(5000) });
        if (!alive || !r.ok) return;
        const body = await r.json();
        setSwarm(body?.data || body);
      } catch { /* coordinator unreachable — history-only view */ }
    };
    pull();
    const t = setInterval(pull, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const session = swarm?.session;

  const activeAgents = agents.filter(a => { const s = a.status as string; return s === 'active' || s === 'working'; });
  const idleAgents = agents.filter(a => { const s = a.status as string; return s === 'idle' || s === 'ready'; });
  const errorAgents = agents.filter(a => { const s = a.status as string; return s === 'error' || s === 'failed'; });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-cyan-400">Delegation Graph</h2>
        <span className="text-[10px] text-zinc-500">
          {agents.length} agents · {activeAgents.length} active · {errorAgents.length} errors
        </span>
      </div>

      {/* Live swarm-mission session (coordinator) */}
      {session && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-fuchsia-500/15 bg-fuchsia-500/[0.04] px-4 py-2 text-[11px] font-mono">
          <span className="text-fuchsia-300/80 uppercase tracking-widest text-[9px]">Swarm Session</span>
          <span className="text-zinc-300">{session.totalTasks ?? 0} <span className="text-zinc-600">tasks</span></span>
          <span className="text-emerald-400">{session.completedTasks ?? 0} <span className="text-zinc-600">done</span></span>
          <span className="text-rose-400">{session.failedTasks ?? 0} <span className="text-zinc-600">failed</span></span>
          {swarm?.metrics?.avgResponseTime > 0 && (
            <span className="text-cyan-300">{(swarm.metrics.avgResponseTime / 1000).toFixed(1)}s <span className="text-zinc-600">avg</span></span>
          )}
          {typeof swarm?.metrics?.queueDepth === 'number' && (
            <span className="text-amber-300">{swarm.metrics.queueDepth} <span className="text-zinc-600">queued</span></span>
          )}
        </div>
      )}

      {/* Agent stats row */}
      <div className="grid grid-cols-4 gap-2">
        <div className="p-3 bg-zinc-900/60 border border-zinc-800 text-center">
          <div className="text-lg font-bold text-zinc-200">{activeAgents.length}</div>
          <div className="text-[9px] uppercase tracking-wider text-emerald-400 mt-1">Active</div>
        </div>
        <div className="p-3 bg-zinc-900/60 border border-zinc-800 text-center">
          <div className="text-lg font-bold text-zinc-200">{idleAgents.length}</div>
          <div className="text-[9px] uppercase tracking-wider text-zinc-400 mt-1">Idle</div>
        </div>
        <div className="p-3 bg-zinc-900/60 border border-zinc-800 text-center">
          <div className="text-lg font-bold text-zinc-200">{errorAgents.length}</div>
          <div className="text-[9px] uppercase tracking-wider text-rose-400 mt-1">Errors</div>
        </div>
        <div className="p-3 bg-zinc-900/60 border border-zinc-800 text-center">
          <div className="text-lg font-bold text-zinc-200">{delegation?.totalDelegations || 0}</div>
          <div className="text-[9px] uppercase tracking-wider text-cyan-400 mt-1">Delegations</div>
        </div>
      </div>

      {/* Delegation log */}
      {delegation?.history && delegation.history.length > 0 ? (
        <div className="space-y-1 max-h-60 overflow-y-auto">
          <h3 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Delegation History</h3>
          {delegation.history.slice(-20).reverse().map((d: any, i: number) => (
            <div key={i} className="flex items-start gap-2 px-2 py-1 text-[10px] font-mono hover:bg-white/5">
              <span className="text-zinc-600 w-14 shrink-0">{d.ts ? new Date(d.ts).toLocaleTimeString() : ''}</span>
              <span className={d.success ? 'text-emerald-400' : 'text-rose-400 w-4 shrink-0'}>
                {d.success ? '✓' : '✗'}
              </span>
              <span className="text-cyan-400 shrink-0">{d.agent || '?'}</span>
              <span className="text-zinc-400 truncate">{d.task || d.description || d.action || ''}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="text-xs text-zinc-400">No delegation history yet.</div>
          <div className="text-[10px] text-zinc-600 mt-2">
            Agent delegations appear here as they are assigned and executed.
          </div>
        </div>
      )}

      {/* Agent score list */}
      {scores && scores.list && scores.list.length > 0 && (
        <div className="mt-4 border-t border-zinc-800 pt-3">
          <h3 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Agent Scores</h3>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {scores.list.map((s: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
                <span className="w-20 truncate">{s.name || s.agent || `Agent ${i}`}</span>
                <div className="flex-1 h-2 bg-zinc-800 rounded-none overflow-hidden">
                  <div
                    className="h-full bg-cyan-500/60"
                    style={{ width: `${Math.min(100, (s.score || 0) * 100)}%` }}
                  />
                </div>
                <span className="text-zinc-500 w-8 text-right">{(s.score || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

