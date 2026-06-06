'use client';

import React from 'react';
import { useState } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import type { MissionData } from '../hooks/useMissionData';
import { ServiceHealthGrid } from './ServiceHealthGrid';
import { useEPSHistory } from '../hooks/useEPSHistory';

function apiProxy(path: string) {
  return `/api/service-proxy?port=7780&path=${encodeURIComponent(path)}`;
}

function serviceReachable(status?: string) {
  return status === 'online' || status === 'degraded';
}

export function OverviewPanel({ data }: { data: MissionData }) {
  const [researchQuery, setResearchQuery] = useState('');
  const [researchDepth, setResearchDepth] = useState(2);
  const [researchModels, setResearchModels] = useState(8);
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchMessage, setResearchMessage] = useState('');
  const healthyCount = data.services.filter(s => serviceReachable(s.status)).length;
  const workingAgents = data.agents.filter(a => a.status === 'working').length;
  const errorAgents = data.agents.filter(a => a.status === 'error').length;
  const completedAgents = data.agents.filter(a => a.status === 'completed').length;
  const visionService = data.services.find(s => s.key === 'vision');
  const visionOnline = serviceReachable(visionService?.status);

  const recentLogs = data.logs.slice(0, 20);
  const latestKernelJob = data.kernelJobs[0];
  const researchJobs = data.kernelJobs.filter(job => job.route === 'deep-research-group');
  const latestResearchJob = researchJobs[0];
  const activeKernelJobs = data.kernelJobs.filter(job => ['queued', 'running', 'delegated', 'planning', 'executing', 'reviewing', 'synthesizing'].includes(job.state)).length;
  const rival = data.rivalBenchmark;
  const omnicode = data.omnicodeStatus;
  const delegation = data.delegationStatus;
  const llm = data.llmStatus;
  const researchStatus = data.researchStatus;
  const omniProof = omnicode?.proof;
  const rivalTotals = rival?.summary?.totals || {};
  const criticalLanes = (rival?.lanes || []).filter(lane => lane.priority === 1).slice(0, 5);
  const epsHistory = useEPSHistory(60);
  const chartData = epsHistory.map((p, i) => ({ i, eps: p.eps }));
  const openRouterReady = Boolean(researchStatus?.hasKey);

  const startResearchRoom = async () => {
    const query = researchQuery.trim();
    if (!query || researchBusy) return;
    setResearchBusy(true);
    setResearchMessage('');
    try {
      const res = await fetch(apiProxy('/api/research/group'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          kernelJob: true,
          depth: researchDepth,
          model_count: researchModels,
          source: 'mission-control-overview',
        }),
      });
      const proxied = await res.json();
      const payload = proxied.data ?? proxied;
      if (!res.ok || payload.ok === false) throw new Error(payload.error || proxied.error || 'research room failed to start');
      setResearchMessage(`started ${payload.job?.id || 'research job'}`);
      setResearchQuery('');
    } catch (error: any) {
      setResearchMessage(error?.message || 'research room failed to start');
    } finally {
      setResearchBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto space-y-4 p-1">
      {/* Top metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Services Online" value={`${healthyCount}/${data.services.length}`} color="#22c55e" />
        <MetricCard label="Working Agents" value={workingAgents} color="#00d4ff" />
        <MetricCard label="Kernel Jobs" value={data.kernelJobs.length} color="#f472b6" />
        <MetricCard label="Errors" value={errorAgents} color="#ef4444" />
        <MetricCard label="OmniCode" value={omnicode?.gates?.zeroUnknownFiles ? '0 unknown' : 'blocked'} color={omnicode?.gates?.zeroUnknownFiles ? '#22c55e' : '#f59e0b'} />
        <MetricCard label="Claude Checks" value={`${delegation?.posted || 0}/${(delegation?.missions || []).length || 3}`} color={(delegation?.waiting || 0) === 0 ? '#22c55e' : '#a78bfa'} />
        <MetricCard label="LLM Fallback" value={llm?.local?.online ? 'local on' : 'offline'} color={llm?.local?.online ? '#22c55e' : '#ef4444'} />
      </div>

      <section className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-cyan-200/60 font-mono">End-to-End Flow</h3>
          <span className="rounded border border-fuchsia-300/25 bg-fuchsia-300/10 px-2 py-1 text-[10px] font-mono text-fuchsia-200">{activeKernelJobs} active</span>
        </div>
        <div className="grid gap-2 md:grid-cols-5">
          <FlowStep label="Hello" active={data.apiConnected} detail={data.apiConnected ? 'chat intake online' : 'api offline'} />
          <FlowStep label="Kernel" active={Boolean(latestKernelJob)} detail={latestKernelJob?.id || 'waiting'} />
          <FlowStep label="Job" active={Boolean(latestKernelJob)} detail={latestKernelJob?.state || 'none'} />
          <FlowStep label="Swarm" active={Boolean(latestKernelJob?.linkedMissionId)} detail={latestKernelJob?.linkedMissionId || 'not delegated'} />
          <FlowStep label="Result" active={Boolean(latestKernelJob?.finishedAt || latestKernelJob?.state === 'delegated')} detail={latestKernelJob?.route || 'pending'} />
        </div>
        {latestKernelJob && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] text-white/55">
            <span className="text-cyan-200/70">{latestKernelJob.goal}</span>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-violet-300/15 bg-violet-300/[0.035] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[11px] uppercase tracking-[0.2em] text-violet-200/65 font-mono">Claude Cross-Check</h3>
            <p className="mt-1 text-xs text-white/35">Parallel lanes stay honest here: runtime fix, proof gate, and bridge review.</p>
          </div>
          <div className="flex gap-2 text-[10px] font-mono">
            <span className="rounded border border-violet-300/25 bg-violet-300/10 px-2 py-1 text-violet-200">posted {delegation?.posted || 0}</span>
            <span className="rounded border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-amber-200">waiting {delegation?.waiting ?? 3}</span>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {(delegation?.missions || []).map(mission => (
            <div key={mission.id} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">{mission.id}</span>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-mono ${mission.status === 'result-posted' ? 'bg-emerald-300/10 text-emerald-200' : 'bg-amber-300/10 text-amber-200'}`}>{mission.status}</span>
              </div>
              <div className="truncate text-xs text-white/65">{mission.title}</div>
              <div className="mt-1 truncate font-mono text-[10px] text-white/25">{mission.resultFile}</div>
            </div>
          ))}
          {!(delegation?.missions || []).length && (
            <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/35">Delegation board loading...</div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-sky-300/15 bg-sky-300/[0.035] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[11px] uppercase tracking-[0.2em] text-sky-200/65 font-mono">LLM Routing</h3>
            <p className="mt-1 text-xs text-white/35">API first, local fallback. Chat, completion, and swarm all use this provider path.</p>
          </div>
          <div className="flex gap-2 text-[10px] font-mono">
            <span className="rounded border border-sky-300/25 bg-sky-300/10 px-2 py-1 text-sky-200">{llm?.provider?.provider || 'loading'}:{llm?.provider?.model || '?'}</span>
            <span className={`rounded border px-2 py-1 ${llm?.local?.online ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200' : 'border-rose-300/25 bg-rose-300/10 text-rose-200'}`}>
              {llm?.fallback?.provider || 'fallback'}:{llm?.fallback?.model || '?'}
            </span>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          <ProofTile label="Primary Key" value={llm?.provider?.hasKey ? 'configured' : 'missing'} />
          <ProofTile label="Swarm Key" value={llm?.swarm?.hasKey ? 'configured' : 'missing'} />
          <ProofTile label="Local Online" value={llm?.local?.online ? 'yes' : 'no'} />
          <ProofTile label="Model Present" value={llm?.local?.modelAvailable ? 'yes' : 'no'} />
        </div>
        <div className="mt-3 truncate font-mono text-[10px] text-white/30">
          {(llm?.local?.models || []).join(', ') || llm?.local?.error || 'waiting for LLM status'}
        </div>
      </section>

      <section className="rounded-xl border border-teal-300/15 bg-teal-300/[0.035] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[11px] uppercase tracking-[0.2em] text-teal-200/65 font-mono">Research Room</h3>
            <p className="mt-1 text-xs text-white/35">OpenRouter model group runs through the same kernel archive as agent jobs.</p>
          </div>
          <div className="flex gap-2 text-[10px] font-mono">
            <span className={`rounded border px-2 py-1 ${openRouterReady ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200' : 'border-amber-300/25 bg-amber-300/10 text-amber-200'}`}>
              openrouter {openRouterReady ? 'keyed' : 'missing key'}
            </span>
            <span className="rounded border border-teal-300/25 bg-teal-300/10 px-2 py-1 text-teal-200">{researchJobs.length} jobs</span>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="grid gap-2 md:grid-cols-[1fr_112px_132px]">
            <input
              value={researchQuery}
              onChange={event => setResearchQuery(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') startResearchRoom(); }}
              placeholder="Research question..."
              className="min-w-0 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white/80 placeholder:text-white/20 outline-none focus:border-teal-300/45"
            />
            <select
              value={researchDepth}
              onChange={event => setResearchDepth(Number(event.target.value))}
              className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white/70 outline-none focus:border-teal-300/45"
            >
              <option value={1}>depth 1</option>
              <option value={2}>depth 2</option>
              <option value={3}>depth 3</option>
            </select>
            <input
              type="number"
              min={2}
              max={40}
              value={researchModels}
              onChange={event => setResearchModels(Math.max(2, Math.min(40, Number(event.target.value) || 2)))}
              className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white/70 outline-none focus:border-teal-300/45"
            />
          </div>
          <button
            onClick={startResearchRoom}
            disabled={researchBusy || !researchQuery.trim()}
            className="rounded-lg border border-teal-300/25 bg-teal-300/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-teal-100 transition hover:bg-teal-300/20 disabled:opacity-40"
          >
            {researchBusy ? 'Starting' : 'Start Room'}
          </button>
        </div>
        {researchMessage && <div className="mt-2 font-mono text-[10px] text-white/35">{researchMessage}</div>}
        <div className="mt-3 grid gap-2 md:grid-cols-5">
          <ProofTile label="Latest State" value={latestResearchJob?.state || 'none'} />
          <ProofTile label="Models Answered" value={latestResearchJob?.researchRun ? `${latestResearchJob.researchRun.successCount || 0}/${latestResearchJob.researchRun.memberCount || 0}` : 'n/a'} />
          <ProofTile label="Free Models" value={latestResearchJob?.researchRun?.freeModelCount ?? 'n/a'} />
          <ProofTile label="Sources" value={latestResearchJob?.researchRun?.sourceCount ?? 'n/a'} />
          <ProofTile label="Mode" value={latestResearchJob?.researchRun?.mode || 'kernel'} />
        </div>
        <div className="mt-3 truncate font-mono text-[10px] text-white/30">
          {researchStatus?.keySource ? `key source ${researchStatus.keySource}` : 'set OPENROUTER_API_KEY for real model-room answers'}
        </div>
        {latestResearchJob && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm text-white/70">{latestResearchJob.goal}</div>
                <div className="mt-1 font-mono text-[10px] text-white/25">{latestResearchJob.id}</div>
              </div>
              <span className={`rounded px-2 py-1 text-[10px] font-mono ${latestResearchJob.state === 'completed' ? 'bg-emerald-300/10 text-emerald-200' : latestResearchJob.state === 'failed' ? 'bg-rose-300/10 text-rose-200' : 'bg-cyan-300/10 text-cyan-200'}`}>{latestResearchJob.state}</span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {(latestResearchJob.researchRun?.members || []).slice(0, 4).map(member => (
                <div key={member.model} className="rounded border border-white/10 bg-black/30 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[10px] text-white/45">{member.model}</span>
                    <span className={member.status === 'ok' ? 'text-[10px] text-emerald-200' : 'text-[10px] text-rose-200'}>{member.status}</span>
                  </div>
                  {member.error && <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-white/30">{member.error}</div>}
                </div>
              ))}
            </div>
            {latestResearchJob.finalReport && (
              <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-white/10 bg-black/40 p-3 font-mono text-[10px] leading-4 text-white/45">
                {latestResearchJob.finalReport.slice(0, 2400)}
              </pre>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.035] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[11px] uppercase tracking-[0.2em] text-emerald-200/65 font-mono">OmniCode Bridge</h3>
            <p className="mt-1 text-xs text-white/35">Repo intelligence gate for PURPCLAW jobs: ledger proof first, swarm second.</p>
          </div>
          <div className="flex gap-2 text-[10px] font-mono">
            <span className={`rounded border px-2 py-1 ${omnicode?.gates?.zeroUnknownFiles ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200' : 'border-amber-300/25 bg-amber-300/10 text-amber-200'}`}>
              unknown {omniProof?.unknownFiles ?? '?'}
            </span>
            <span className={`rounded border px-2 py-1 ${omnicode?.gates?.destructiveRepairAllowed ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200' : 'border-rose-300/25 bg-rose-300/10 text-rose-200'}`}>
              repair {omnicode?.gates?.destructiveRepairAllowed ? 'clear' : 'blocked'}
            </span>
            <span className="rounded border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-cyan-200">{omnicode?.mode || 'loading'}</span>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          <ProofTile label="Files Accounted" value={omniProof?.filesAccounted ?? 'n/a'} />
          <ProofTile label="Source Coverage" value={omniProof?.sourceCoveragePercent != null ? `${omniProof.sourceCoveragePercent}%` : 'n/a'} />
          <ProofTile label="Blocking Gaps" value={omniProof?.blockingRepairGaps ?? 'n/a'} />
          <ProofTile label="Token Reduction" value={omniProof?.reductionDisplay || 'n/a'} />
        </div>
        <div className="mt-3 truncate font-mono text-[10px] text-white/30">{omnicode?.gates?.reason || omniProof?.benchmarkPath || 'waiting for OmniCode status'}</div>
      </section>

      <section className="rounded-xl border border-fuchsia-300/15 bg-fuchsia-300/[0.035] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[11px] uppercase tracking-[0.2em] text-fuchsia-200/65 font-mono">Rival Benchmark</h3>
            <p className="mt-1 text-xs text-white/35">Target: Odysseus. Beat it by being sharper at API harness, swarm proof, and local-first operator flow.</p>
          </div>
          <div className="flex gap-2 text-[10px] font-mono">
            <span className="rounded border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-emerald-200">ahead {rivalTotals.ahead || 0}</span>
            <span className="rounded border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-amber-200">contested {rivalTotals.contested || 0}</span>
            <span className="rounded border border-rose-300/25 bg-rose-300/10 px-2 py-1 text-rose-200">behind {rivalTotals.behind || 0}</span>
          </div>
        </div>
        <div className="grid gap-2 xl:grid-cols-5">
          {criticalLanes.map(lane => (
            <div key={lane.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">{lane.label}</span>
                <StatusDot status={lane.status} />
              </div>
              <p className="line-clamp-3 text-[11px] leading-4 text-white/38">{lane.winCondition}</p>
            </div>
          ))}
          {!criticalLanes.length && <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/35">Benchmark loading...</div>}
        </div>
      </section>

      {/* Service health */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-3 font-mono">Service Architecture</h3>
        <ServiceHealthGrid services={data.services} />
      </section>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-3 font-mono">Event Throughput</h3>
          <ResponsiveContainer width="100%" height={60}>
            <LineChart data={chartData}>
              <Line type="monotone" dataKey="eps" stroke="#00d4ff" strokeWidth={1.5} dot={false} />
              <Tooltip
                contentStyle={{ background: '#0f1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 10, color: '#fff' }}
                labelStyle={{ display: 'none' }}
                formatter={(v: any) => [`${v} EPS`, '']}
              />
            </LineChart>
          </ResponsiveContainer>
        </section>
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-3 font-mono">Pipeline Metrics</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <div className="text-xl font-light text-white/90">{data.pipeline?.metrics.total || 0}</div>
              <div className="text-[10px] text-white/30 uppercase">Total Tasks</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-light text-white/90">{data.pipeline?.metrics.avgResponseTime?.toFixed(0) || 0}ms</div>
              <div className="text-[10px] text-white/30 uppercase">Avg Response</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-light text-emerald-400">{data.pipeline?.metrics.completed || 0}</div>
              <div className="text-[10px] text-white/30 uppercase">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-light text-rose-400">{data.pipeline?.metrics.failed || 0}</div>
              <div className="text-[10px] text-white/30 uppercase">Failed</div>
            </div>
          </div>
        </section>
      </div>

      {/* Recent logs */}
      {data.diagnostics && data.diagnostics.findings.length > 0 && (
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-3 font-mono">Diagnostic Findings</h3>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {data.diagnostics.findings.slice(0, 5).map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] font-mono hover:bg-white/[0.02] px-2 py-1 rounded">
                <span className={`w-1.5 h-1.5 rounded-full ${f.severity === 'CRITICAL' || f.severity === 'ERROR' ? 'bg-rose-400' : f.severity === 'WARNING' ? 'bg-amber-400' : 'bg-cyan-400'}`} />
                <span className="text-white/40 shrink-0 w-20 truncate">{f.agent}</span>
                <span className="text-white/60 truncate flex-1">{f.description}</span>
                <span className="text-white/20 shrink-0">{f.confidence}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex-1 min-h-[200px]">
        <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-3 font-mono">Recent Events</h3>
        <div className="space-y-1">
          {recentLogs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 text-[11px] font-mono hover:bg-white/[0.02] px-2 py-1 rounded">
              <span className="text-white/20 shrink-0 w-16">{log.timestamp}</span>
              <span className={`uppercase text-[9px] tracking-wider shrink-0 w-16 ${typeColor(log.type)}`}>{log.type}</span>
              <span className="text-white/30 shrink-0 w-20 truncate">{log.source}</span>
              <span className="text-white/60 truncate flex-1">{log.message}</span>
            </div>
          ))}
          {recentLogs.length === 0 && (
            <div className="text-white/20 text-xs text-center py-8">No events yet</div>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center hover:border-white/20 transition-all">
      <div className="text-2xl font-light tracking-tight" style={{ color }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/30 mt-1">{label}</div>
    </div>
  );
}

function FlowStep({ label, active, detail }: { label: string; active: boolean; detail: string }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${active ? 'border-cyan-300/25 bg-cyan-300/10' : 'border-white/10 bg-black/20'}`}>
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.7)]' : 'bg-white/20'}`} />
        <span className="text-[10px] uppercase tracking-[0.16em] text-white/55">{label}</span>
      </div>
      <div className="mt-1 truncate font-mono text-[10px] text-white/30">{detail}</div>
    </div>
  );
}

function ProofTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
      <div className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">{label}</div>
      <div className="mt-1 truncate text-sm text-white/75">{value}</div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'ahead' ? '#34d399' : status === 'contested' ? '#fbbf24' : '#fb7185';
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}88` }} />;
}

function typeColor(type: string) {
  switch (type) {
    case 'agent': return 'text-cyan-400';
    case 'error': return 'text-rose-400';
    case 'system': return 'text-amber-400';
    case 'kernel': return 'text-fuchsia-400';
    case 'info': return 'text-emerald-400';
    default: return 'text-white/40';
  }
}
