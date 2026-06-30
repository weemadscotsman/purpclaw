'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * MissionTrace — live "where is my job right now" strip for the command room.
 *
 * Fixes the "BRO WHATS GOING ON" blindness: when you submit a mission/chat/
 * pipeline job, it registers on the spine (pipeline-registry) and this strip
 * shows it moving — phase (current_step), health light, flags (seek/die/
 * fake-green/black-hole), and time since last heartbeat.
 *
 * Source of truth = /api/pipeline (health.jobs, classified). Polls every 2.5s.
 * Renders NOTHING when nothing is active, so it never clutters an idle room.
 */

type Job = {
  job_id: string;
  pipeline_name?: string;
  lane?: string;
  status: string;
  current_step?: string;
  since_beat_ms?: number;
  light: 'green' | 'amber' | 'red' | 'purple';
  flags?: string[];
};

// A job is "live" only if its heartbeat is fresh. The registry accumulates
// zombie 'running' rows from processes that died without finish() — showing
// those as running is a UI/backend truth mismatch, so we gate on heartbeat.
const FRESH_MS = 45000;
function isLive(j: Job) {
  if (j.status === 'paused' || j.status === 'quarantined') return true; // intentional states
  return j.status === 'running' && (j.since_beat_ms == null || j.since_beat_ms < FRESH_MS);
}
const ACTIVE = new Set(['running', 'paused', 'quarantined']);
const LIGHT_DOT: Record<string, string> = {
  green: 'bg-emerald-400',
  amber: 'bg-amber-400',
  red: 'bg-rose-500',
  purple: 'bg-fuchsia-400',
};
const FLAG_LABEL: Record<string, string> = {
  seek: 'seeking', die: 'died', loop: 'looping', leak: 'leak',
  hide: 'hiding', 'fake-green': 'fake-green', 'black-hole': 'no-output',
};

function fmtAgo(ms?: number) {
  if (ms == null) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60}s`;
}

export function MissionTrace() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reachable, setReachable] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const seenDone = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch('/api/pipeline', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
        if (!alive) return;
        if (!r.ok) { setReachable(false); return; }
        const body = await r.json();
        setReachable(true);
        const all: Job[] = (body?.health?.jobs || []) as Job[];
        // Live jobs (fresh heartbeat), plus any that finished in the last 12s so
        // you SEE completion. Stale 'running' zombies are excluded — not active.
        const now = Date.now();
        const active = all.filter(isLive);
        for (const j of all) {
          if (!isLive(j) && !seenDone.current.has(j.job_id)) {
            // first time we observe it non-live — stamp it for a short grace window
            seenDone.current.set(j.job_id, now);
          }
        }
        const recentlyDone = all.filter(j => {
          const t = seenDone.current.get(j.job_id);
          // only surface genuinely terminal jobs (not stale-running zombies)
          return !isLive(j) && ACTIVE.has(j.status) === false && t && now - t < 12000;
        });
        // prune old stamps
        for (const [k, t] of seenDone.current) if (now - t > 60000) seenDone.current.delete(k);
        // SWARM/chat first, then by most-recent heartbeat
        const merged = [...active, ...recentlyDone].sort((a, b) => {
          const w = (j: Job) => (/(swarm|mission)/i.test(j.pipeline_name || j.lane || '') ? 0 : 1);
          return w(a) - w(b) || (a.since_beat_ms ?? 0) - (b.since_beat_ms ?? 0);
        });
        setJobs(merged.slice(0, 8));
      } catch { if (alive) setReachable(false); }
    };
    pull();
    const t = setInterval(pull, 2500);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Idle room → render nothing.
  if (!reachable && jobs.length === 0) return null;
  if (jobs.length === 0) return null;

  const activeCount = jobs.filter(isLive).length;

  return (
    <div className="shrink-0 border-b border-fuchsia-500/15 bg-zinc-950/80 backdrop-blur px-3 py-1.5">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="text-[9px] uppercase tracking-widest text-fuchsia-300/80 hover:text-fuchsia-200"
          title={collapsed ? 'show trace' : 'hide trace'}
        >
          {collapsed ? '▸' : '▾'} Mission Trace
        </button>
        <span className="text-[10px] font-mono text-zinc-500">
          {activeCount > 0 ? <span className="text-emerald-400">{activeCount} running</span> : <span className="text-zinc-600">idle</span>}
        </span>
        {activeCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
      </div>

      {!collapsed && (
        <div className="mt-1 space-y-0.5">
          {jobs.map(j => {
            const isActive = isLive(j);
            return (
              <div key={j.job_id} className="flex items-center gap-2 text-[10px] font-mono">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${LIGHT_DOT[j.light] || 'bg-zinc-600'} ${isActive ? 'animate-pulse' : ''}`} />
                <span className="text-cyan-400/90 shrink-0 w-28 truncate">{j.pipeline_name || j.lane || 'job'}</span>
                <span className={`shrink-0 w-16 ${isActive ? 'text-emerald-400' : j.light === 'red' ? 'text-rose-400' : 'text-zinc-500'}`}>{j.status}</span>
                <span className="text-zinc-400 truncate flex-1">{j.current_step || '—'}</span>
                {j.flags && j.flags.length > 0 && (
                  <span className="text-amber-400/90 shrink-0">{j.flags.map(f => FLAG_LABEL[f] || f).join(' ')}</span>
                )}
                <span className="text-zinc-600 shrink-0 w-10 text-right">{fmtAgo(j.since_beat_ms)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
