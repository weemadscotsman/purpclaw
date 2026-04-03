'use client';

import React from 'react';
import type { MissionData } from '../hooks/useMissionData';

export function PipelinePanel({ data }: { data: MissionData }) {
  const active = data.pipeline?.active || [];
  const completed = data.pipeline?.completed?.slice(0, 20) || [];
  const queue = data.pipeline?.queue?.items || [];
  const diagFindings = data.diagnostics?.findings || [];
  const voteTally = data.diagnostics?.voteTally;
  const kernelJobs = data.kernelJobs.slice(0, 12);

  return (
    <div className="h-full overflow-y-auto space-y-4 p-1">
      <section className="rounded-xl border border-fuchsia-300/15 bg-fuchsia-300/[0.035] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-fuchsia-200/60 font-mono">API Kernel Intake</h3>
          <span className="text-[10px] text-white/30 font-mono">{kernelJobs.length} recent</span>
        </div>
        <div className="space-y-2">
          {kernelJobs.map((job) => (
            <div key={job.id} className="grid grid-cols-[minmax(100px,160px)_90px_120px_1fr] items-center gap-3 rounded bg-black/30 px-3 py-2 text-[11px] font-mono border-l-2 border-fuchsia-300/60">
              <span className="truncate text-fuchsia-200/70">{job.id}</span>
              <span className="uppercase text-[9px] tracking-wider text-white/45">{job.state}</span>
              <span className="truncate text-cyan-200/45">{job.linkedMissionId || job.route}</span>
              <span className="truncate text-white/60">{job.goal}</span>
            </div>
          ))}
          {kernelJobs.length === 0 && <div className="text-white/20 text-xs text-center py-4">No kernel jobs yet</div>}
        </div>
      </section>

      {/* Diagnostics summary */}
      {data.diagnostics && (
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-mono">Diagnostics Vote Tally</h3>
            {data.diagnostics.leadingCause && (
              <span className="text-[10px] text-amber-400 font-mono">Lead: {data.diagnostics.leadingCause}</span>
            )}
          </div>
          <div className="space-y-2">
            {voteTally && Object.entries(voteTally).length > 0 ? (
              Object.entries(voteTally).map(([cause, count]: [string, any]) => (
                <div key={cause} className="flex items-center gap-3">
                  <span className="text-[11px] text-white/60 font-mono w-32 truncate">{cause}</span>
                  <div className="flex-1 bg-black/40 rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${Math.min(100, (count as number) * 10)}%` }} />
                  </div>
                  <span className="text-[11px] text-white/40 font-mono w-6 text-right">{count as number}</span>
                </div>
              ))
            ) : (
              <div className="text-white/20 text-xs text-center py-4">No votes yet</div>
            )}
          </div>
        </section>
      )}

      {/* Queue */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-mono">Orchestrator Queue</h3>
          <span className="text-[10px] text-white/30 font-mono">{queue.length} pending</span>
        </div>
        <div className="space-y-2">
          {queue.map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-3 text-[11px] font-mono bg-black/30 rounded px-3 py-2">
              <span className="text-white/20 w-6">#{i + 1}</span>
              <span className={`uppercase text-[9px] tracking-wider px-1.5 py-0.5 rounded ${priorityClass(item.priority)}`}>
                P{item.priority}
              </span>
              <span className="text-white/60 truncate flex-1">{item.command}</span>
            </div>
          ))}
          {queue.length === 0 && <div className="text-white/20 text-xs text-center py-4">Queue empty</div>}
        </div>
      </section>

      {/* Active workflows */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-mono">Active Workflows</h3>
          <span className="text-[10px] text-white/30 font-mono">{active.length} running</span>
        </div>
        <div className="space-y-2">
          {active.map((wf: any) => (
            <div key={wf.id} className="flex items-center gap-3 text-[11px] font-mono bg-black/30 rounded px-3 py-2 border-l-2 border-cyan-400">
              <span className="text-white/20 shrink-0">{wf.id}</span>
              <span className="uppercase text-[9px] tracking-wider text-cyan-400 shrink-0 w-20">{wf.status}</span>
              <span className="text-white/40 shrink-0 w-20">{wf.intent}</span>
              <span className="text-white/60 truncate flex-1">{wf.target}</span>
              <span className="text-white/20 shrink-0">{wf.steps?.completed || 0}/{wf.steps?.total || 0}</span>
            </div>
          ))}
          {active.length === 0 && <div className="text-white/20 text-xs text-center py-4">No active workflows</div>}
        </div>
      </section>

      {/* Completed */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-mono">Recently Completed</h3>
          <span className="text-[10px] text-white/30 font-mono">{completed.length} shown</span>
        </div>
        <div className="space-y-2">
          {completed.map((wf: any) => (
            <div key={wf.id} className="flex items-center gap-3 text-[11px] font-mono bg-black/30 rounded px-3 py-2 border-l-2 border-emerald-400">
              <span className="text-white/20 shrink-0">{wf.id}</span>
              <span className="uppercase text-[9px] tracking-wider text-emerald-400 shrink-0 w-20">{wf.status}</span>
              <span className="text-white/40 shrink-0 w-20">{wf.intent}</span>
              <span className="text-white/60 truncate flex-1">{wf.target}</span>
              <span className="text-white/20 shrink-0">{wf.duration}ms</span>
            </div>
          ))}
          {completed.length === 0 && <div className="text-white/20 text-xs text-center py-4">No completed workflows</div>}
        </div>
      </section>
    </div>
  );
}

function priorityClass(priority: number) {
  if (priority === 0) return 'bg-rose-500/20 text-rose-400';
  if (priority === 1) return 'bg-amber-500/20 text-amber-400';
  if (priority === 2) return 'bg-cyan-500/20 text-cyan-400';
  return 'bg-white/10 text-white/40';
}
