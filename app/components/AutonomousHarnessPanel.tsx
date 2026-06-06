'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { MissionData } from '../hooks/useMissionData';

type HarnessMissionStatus =
  | 'queued'
  | 'decomposing'
  | 'running'
  | 'synthesizing'
  | 'completed'
  | 'failed'
  | 'aborted';

type HarnessSubtask = {
  id: string;
  text: string;
  domain: string;
  agent: string;
  originalAgent?: string;
  executionOrder: number;
  dependsOn: string[];
  ownedPatterns?: string[];
  contextDepth?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempts: number;
  output?: string | null;
  error?: string | null;
};

type HarnessMission = {
  missionId: string;
  task: string;
  status: HarnessMissionStatus;
  startTime: string;
  endTime: string | null;
  subtasks: HarnessSubtask[];
  synthesis?: {
    summary?: string;
    filesModified?: string[];
    issuesFound?: string[];
    validationStatus?: string;
    workerCount?: number;
  } | null;
  error?: string | null;
};

type HarnessStatus = {
  ok: boolean;
  mode?: string;
  activeMissions?: number;
  missionCount?: number;
  missions?: Array<Pick<HarnessMission, 'missionId' | 'task' | 'status' | 'startTime' | 'endTime'> & { subtaskCount?: number; hasError?: boolean }>;
  note?: string;
  error?: string;
};

const PRESETS = [
  'Build the end-to-end harness flow: decompose the job, route each slice to the right specialist, verify output, and return one final result.',
  'Audit the app UI and remove duplicate telemetry panels so every tab has a distinct operator purpose.',
  'Add an API endpoint, secure it, update the frontend call, and produce a smoke-test checklist.',
];

const STATUS_CLASS: Record<string, string> = {
  queued: 'text-sky-300 border-sky-400/30 bg-sky-400/10',
  decomposing: 'text-cyan-300 border-cyan-400/30 bg-cyan-400/10',
  running: 'text-amber-300 border-amber-400/30 bg-amber-400/10',
  delegated: 'text-fuchsia-300 border-fuchsia-400/30 bg-fuchsia-400/10',
  synthesizing: 'text-violet-300 border-violet-400/30 bg-violet-400/10',
  completed: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10',
  failed: 'text-rose-300 border-rose-400/30 bg-rose-400/10',
  aborted: 'text-zinc-300 border-zinc-400/30 bg-zinc-400/10',
  pending: 'text-zinc-300 border-zinc-400/20 bg-white/[0.03]',
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/service-proxy?port=7780&path=${encodeURIComponent(path)}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const envelope = await response.json();
  if (!response.ok || envelope.status === 'offline' || envelope.status === 'disabled') {
    throw new Error(envelope.error || envelope.data?.error || 'Harness API unavailable');
  }
  return envelope.data as T;
}

export function AutonomousHarnessPanel({ data }: { data: MissionData }) {
  const [goal, setGoal] = useState(PRESETS[0]);
  const [status, setStatus] = useState<HarnessStatus | null>(null);
  const [mission, setMission] = useState<HarnessMission | null>(null);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const executionMode = 'live';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = mission && ['queued', 'decomposing', 'running', 'synthesizing'].includes(mission.status);
  const agentsOnline = useMemo(() => data.agents.filter(agent => agent.status !== 'error').length, [data.agents]);
  const latestKernelJobs = data.kernelJobs.slice(0, 6);

  const refreshStatus = async () => {
    const next = await apiFetch<HarnessStatus>('/api/harness/status');
    setStatus(next);
    if (!selectedMissionId && next.missions?.[0]?.missionId) {
      setSelectedMissionId(next.missions[0].missionId);
    }
  };

  const refreshMission = async (missionId: string) => {
    const result = await apiFetch<{ ok: boolean; mission: HarnessMission }>(`/api/harness/missions/${encodeURIComponent(missionId)}`);
    setMission(result.mission);
  };

  useEffect(() => {
    refreshStatus().catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedMissionId) return;
    refreshMission(selectedMissionId).catch(err => setError(err.message));
  }, [selectedMissionId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshStatus().catch(() => {});
      if (selectedMissionId) refreshMission(selectedMissionId).catch(() => {});
    }, active ? 1500 : 5000);
    return () => window.clearInterval(timer);
  }, [selectedMissionId, active]);

  const startHarness = async () => {
    const task = goal.trim();
    if (!task || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ ok: boolean; accepted: boolean; mission: HarnessMission }>('/api/harness/start', {
        method: 'POST',
        body: JSON.stringify({
          task,
          intent: 'complex-productivity-harness',
          options: { source: 'operator-shell', executionMode },
        }),
      });
      setSelectedMissionId(result.mission.missionId);
      setMission(result.mission);
      await refreshStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to start harness');
    } finally {
      setBusy(false);
    }
  };

  const abortHarness = async () => {
    if (!mission || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/harness/missions/${encodeURIComponent(mission.missionId)}/abort`, { method: 'POST', body: '{}' });
      await refreshMission(mission.missionId);
      await refreshStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to abort mission');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-cyan-300/10 bg-black/35 p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-cyan-300/60">Autonomous Harness</p>
              <h2 className="mt-1 text-lg font-black tracking-[0.08em] text-white">Hello {'>'} Kernel {'>'} Job {'>'} Swarm {'>'} Result</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-white/45">
                Unified API is now the spine. Chat and command intake create kernel jobs, kernel jobs hand off to swarm or harness execution, and every hop leaves a status trail.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] font-mono">
              <span className="rounded border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-300">API {data.apiConnected ? 'online' : 'offline'}</span>
              <span className="rounded border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-cyan-300">Tower {data.towerConnected ? 'linked' : 'offline'}</span>
              <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-white/45">{agentsOnline} agents visible</span>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {PRESETS.map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => setGoal(preset)}
                disabled={busy || !!active}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] text-white/55 hover:border-cyan-400/30 hover:text-cyan-200 disabled:opacity-40"
              >
                {preset.slice(0, 44)}
              </button>
            ))}
          </div>

          <textarea
            value={goal}
            onChange={event => setGoal(event.target.value)}
            disabled={busy || !!active}
            className="min-h-32 w-full resize-y rounded-xl border border-white/10 bg-black/50 p-3 font-mono text-xs leading-5 text-white/80 outline-none focus:border-cyan-400/35 disabled:opacity-50"
            placeholder="Give PURPCLAW a complex job..."
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={startHarness}
              disabled={busy || !!active || !goal.trim()}
              className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200 hover:bg-cyan-400/15 disabled:opacity-40"
            >
              {busy ? 'Starting' : 'Start Harness'}
            </button>
            <button
              type="button"
              onClick={abortHarness}
              disabled={busy || !active}
              className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-rose-200 hover:bg-rose-400/15 disabled:opacity-40"
            >
              Abort
            </button>
            {error && <span className="text-xs text-rose-300">{error}</span>}
          </div>
        </section>

        <aside className="rounded-xl border border-white/10 bg-black/35 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">Unified Status</h3>
            <span className="text-[10px] text-white/35">{status?.mode || 'checking'}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Metric label="Active" value={status?.activeMissions ?? 0} />
            <Metric label="Total" value={status?.missionCount ?? 0} />
          </div>
          <div className="mt-4">
            <h4 className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/60">API Kernel Spine</h4>
            <div className="space-y-2">
              {latestKernelJobs.map(job => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => job.linkedMissionId && setSelectedMissionId(job.linkedMissionId)}
                  className="block w-full rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-2 text-left hover:border-cyan-300/35"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-cyan-200/70">{job.id}</span>
                    <StatusPill status={job.state} />
                  </div>
                  <p className="line-clamp-2 text-[11px] text-white/45">{job.goal}</p>
                  <p className="mt-1 text-[10px] text-white/25">{job.route}{job.linkedMissionId ? ` -> ${job.linkedMissionId}` : ''}</p>
                </button>
              ))}
              {!latestKernelJobs.length && <p className="text-xs text-white/35">No kernel jobs yet. Say hello, then launch a Kernel + Swarm command.</p>}
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {(status?.missions || []).slice(-8).reverse().map(item => (
              <button
                key={item.missionId}
                type="button"
                onClick={() => setSelectedMissionId(item.missionId)}
                className={`block w-full rounded-lg border p-2 text-left text-[11px] transition ${selectedMissionId === item.missionId ? 'border-cyan-400/40 bg-cyan-400/10' : 'border-white/10 bg-white/[0.03] hover:border-white/20'}`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-mono text-white/60">{item.missionId}</span>
                  <StatusPill status={item.status} />
                </div>
                <p className="line-clamp-2 text-white/40">{item.task || `${item.subtaskCount || 0} subtasks`}</p>
              </button>
            ))}
            {!status?.missions?.length && <p className="text-xs text-white/35">No harness missions yet.</p>}
          </div>
        </aside>
      </div>

      <section className="mt-4 grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-xl border border-white/10 bg-black/35 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">Delegation Graph</h3>
            {mission && <StatusPill status={mission.status} />}
          </div>
          <div className="space-y-2">
            {(mission?.subtasks || []).map(subtask => (
              <article key={subtask.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded border border-white/10 bg-black/30 px-2 py-0.5 font-mono text-[10px] text-white/45">#{subtask.executionOrder}</span>
                  <StatusPill status={subtask.status} />
                  <span className="rounded border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-200">{subtask.domain}</span>
                  <span className="rounded border border-violet-400/20 bg-violet-400/10 px-2 py-0.5 text-[10px] text-violet-200">{subtask.agent}</span>
                </div>
                <p className="text-xs leading-5 text-white/70">{subtask.text}</p>
                <p className="mt-2 text-[10px] text-white/35">depends on: {subtask.dependsOn.length ? subtask.dependsOn.join(', ') : 'none'} | attempts: {subtask.attempts}</p>
              </article>
            ))}
            {!mission?.subtasks?.length && <p className="text-sm text-white/35">Start a harness job to see ordered delegation.</p>}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/35 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">Result Surface</h3>
            <span className="text-[10px] text-white/35">{mission?.missionId || 'no mission selected'}</span>
          </div>
          {mission?.error && <div className="mb-3 rounded-lg border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-200">{mission.error}</div>}
          {mission?.synthesis?.summary ? (
            <pre className="max-h-[620px] overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/60 p-4 text-xs leading-5 text-white/75">{mission.synthesis.summary}</pre>
          ) : (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white/35">
              Final synthesis appears here after every ordered lane completes.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">{label}</div>
      <div className="mt-1 font-mono text-lg text-white/80">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${STATUS_CLASS[status] || STATUS_CLASS.pending}`}>
      {status}
    </span>
  );
}
