'use client';

import React from 'react';
import { useGatekeeperStatus } from '../hooks/useGatekeeperStatus';
import { LoadingSpinner } from './LoadingSpinner';

function MetricCard({ label, value, color, sublabel }: { label: string; value: string | number; color: string; sublabel?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
      <div className="text-2xl font-light tracking-tight" style={{ color }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/30 mt-1">{label}</div>
      {sublabel && <div className="text-[9px] text-white/20 mt-0.5">{sublabel}</div>}
    </div>
  );
}

export function GatekeeperPanel() {
  const { status, amendments, loading, acceptAmendment, rejectAmendment } = useGatekeeperStatus();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner size={24} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto space-y-4 p-1">
      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Queue Depth"
          value={status?.queueDepth ?? 0}
          color={status?.queueDepth === 0 ? '#22c55e' : '#fbbf24'}
          sublabel="Pending validations"
        />
        <MetricCard
          label="Pass Rate"
          value={status?.passRate != null ? `${(status.passRate * 100).toFixed(0)}%` : '—'}
          color={status?.passRate == null ? '#888' : status.passRate > 0.8 ? '#22c55e' : status.passRate > 0.5 ? '#fbbf24' : '#ef4444'}
          sublabel="Adversarial probes"
        />
        <MetricCard
          label="Last Probe"
          value={status?.lastProbeAt ? new Date(status.lastProbeAt).toLocaleTimeString('en-US', { hour12: false }) : 'Never'}
          color={status?.lastProbePass ? '#22c55e' : status?.lastProbePass === false ? '#ef4444' : '#888'}
          sublabel={status?.lastProbePass == null ? 'No probes run' : (status.lastProbePass ? 'PASSED' : 'FAILED')}
        />
        <MetricCard
          label="Amendments"
          value={amendments.filter(a => a.status === 'pending').length}
          color="#a78bfa"
          sublabel="Pending proposals"
        />
      </div>

      {/* Skill Amendments */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-3 font-mono">Skill Amendments</h3>
        {amendments.length === 0 ? (
          <div className="text-white/20 text-xs text-center py-8">No amendments proposed</div>
        ) : (
          <div className="space-y-2">
            {amendments.map(am => (
              <div key={am.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-white/60 truncate">{am.file}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded uppercase font-bold ${am.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : am.status === 'accepted' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                        {am.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-white/50 font-mono mb-2">{am.reason}</div>
                    <div className="text-[10px] text-white/30 mb-2">
                      Confidence: <span className="text-cyan-400">{am.confidence}%</span>
                    </div>
                    {am.originalCode && (
                      <div className="mt-2 p-2 rounded bg-black/60 border border-white/5">
                        <div className="text-[9px] text-white/20 uppercase mb-1">Original</div>
                        <pre className="text-[10px] font-mono text-rose-400 overflow-x-auto">{am.originalCode.substring(0, 120)}</pre>
                        <div className="text-[9px] text-white/20 uppercase mt-2 mb-1">Proposed</div>
                        <pre className="text-[10px] font-mono text-emerald-400 overflow-x-auto">{am.proposedFix.substring(0, 120)}</pre>
                      </div>
                    )}
                  </div>
                  {am.status === 'pending' && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => acceptAmendment(am.id)}
                        className="px-3 py-1 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => rejectAmendment(am.id)}
                        className="px-3 py-1 rounded text-[9px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 transition-all"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
