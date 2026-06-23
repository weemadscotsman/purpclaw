'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';

type KernelJob = {
  id?: string;
  goal?: string;
  route?: string;
  state?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  finishedAt?: string;
  finalReport?: string;
  error?: string;
  events?: Array<{ type?: string; message?: string; stage?: string; at?: string; ts?: string }>;
};

type HarnessMission = {
  missionId?: string;
  task?: string;
  status?: string;
  synthesis?: string;
  subtasks?: Array<{ title?: string; status?: string; agent?: string }>;
};

type TowerAgent = {
  id?: string;
  name?: string;
  agentName?: string;
  division?: string;
  status?: string;
  task?: string;
  currentTask?: string;
};

type TraceEvent = {
  id?: string;
  at?: string;
  ts?: number;
  source?: string;
  action?: string;
  status?: string;
  detail?: string;
  route?: string;
  jobId?: string;
  sessionId?: string;
};

type WorkState = {
  jobs: KernelJob[];
  missions: HarnessMission[];
  agents: TowerAgent[];
  traces: TraceEvent[];
  errors: string[];
  loadedAt: string | null;
};

const ACTIVE_STATES = new Set(['queued', 'accepted', 'delegated', 'running', 'started', 'working', 'synthesizing', 'active']);
const DONE_STATES = new Set(['completed', 'complete', 'done', 'success']);
const BAD_STATES = new Set(['failed', 'error', 'blocked', 'offline']);

function defaultPos() {
  if (typeof window === 'undefined') return { x: 28, y: 88 };
  return { x: Math.max(8, window.innerWidth - 448), y: 88 };
}

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function saveStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function stateColor(state?: string) {
  const s = String(state || '').toLowerCase();
  if (BAD_STATES.has(s)) return '#fb7185';
  if (DONE_STATES.has(s)) return '#34d399';
  if (ACTIVE_STATES.has(s)) return '#22d3ee';
  return '#94a3b8';
}

function compact(value: unknown, fallback = 'unknown') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function latestJobLine(job: KernelJob) {
  const events = Array.isArray(job.events) ? job.events : [];
  const last = events[events.length - 1];
  return compact(last?.message || last?.stage || last?.type || job.finalReport || job.error || job.route, 'waiting for trace');
}

async function getJson(path: string) {
  const res = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(3500) });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

export function AgentWorkDock() {
  const [pos, setPos] = useState({ x: 28, y: 88 });
  const [ready, setReady] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [data, setData] = useState<WorkState>({ jobs: [], missions: [], agents: [], traces: [], errors: [], loadedAt: null });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const posRef = useRef(pos);

  useEffect(() => {
    const hydrate = setTimeout(() => {
      const storedPos = readStored('purpclaw.agentWorkDock.pos', defaultPos());
      const storedView = readStored('purpclaw.agentWorkDock.view', { minimized: false, hidden: false });
      setPos(storedPos);
      posRef.current = storedPos;
      setMinimized(storedView.minimized);
      setHidden(storedView.hidden);
      setReady(true);
    }, 0);
    return () => clearTimeout(hydrate);
  }, []);

  const load = useCallback(async () => {
    const errors: string[] = [];
    const [jobsRes, harnessRes, traceRes, towerRes] = await Promise.allSettled([
      getJson('/api/kernel/jobs?limit=10'),
      getJson('/api/harness/missions'),
      getJson('/api/trace/recent?limit=80'),
      getJson('/api/service-proxy?port=7790&path=' + encodeURIComponent('/tower/status') + '&soft=1'),
    ]);

    const jobs = jobsRes.status === 'fulfilled' ? (jobsRes.value.jobs || []) : [];
    const missions = harnessRes.status === 'fulfilled' ? (harnessRes.value.missions || harnessRes.value.jobs || []) : [];
    const traces = traceRes.status === 'fulfilled' ? (traceRes.value.events || []) : [];
    const towerPayload = towerRes.status === 'fulfilled' ? towerRes.value : null;
    const tower = towerPayload?.data || towerPayload;
    const agents = [...(tower?.activeAgents || []), ...(tower?.registeredAgents || [])];

    for (const [label, result] of [['kernel', jobsRes], ['harness', harnessRes], ['trace', traceRes], ['tower', towerRes]] as const) {
      if (result.status === 'rejected') errors.push(`${label}: ${result.reason?.message || result.reason}`);
    }

    setData({
      jobs: jobs.slice(0, 10),
      missions: missions.slice(0, 8),
      agents: agents.slice(0, 16),
      traces: traces.slice(-12).reverse(),
      errors,
      loadedAt: new Date().toLocaleTimeString(),
    });
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const interval = setInterval(load, 5000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, [load]);

  const summary = useMemo(() => {
    const activeJobs = data.jobs.filter(job => ACTIVE_STATES.has(String(job.state || '').toLowerCase()));
    const activeMissions = data.missions.filter(mission => ACTIVE_STATES.has(String(mission.status || '').toLowerCase()));
    const workingAgents = data.agents.filter(agent => ACTIVE_STATES.has(String(agent.status || '').toLowerCase()) || agent.status === 'working');
    const failures = [
      ...data.jobs.filter(job => BAD_STATES.has(String(job.state || '').toLowerCase())),
      ...data.missions.filter(mission => BAD_STATES.has(String(mission.status || '').toLowerCase())),
    ].length + data.errors.length;
    return { activeJobs, activeMissions, workingAgents, failures };
  }, [data]);

  const beginDrag = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { dx: event.clientX - pos.x, dy: event.clientY - pos.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const next = {
      x: Math.max(8, Math.min(window.innerWidth - 220, event.clientX - drag.current.dx)),
      y: Math.max(8, Math.min(window.innerHeight - 88, event.clientY - drag.current.dy)),
    };
    posRef.current = next;
    setPos(next);
  };

  const endDrag = () => {
    drag.current = null;
    saveStored('purpclaw.agentWorkDock.pos', posRef.current);
  };

  const setView = (next: { minimized?: boolean; hidden?: boolean }) => {
    const view = { minimized, hidden, ...next };
    setMinimized(view.minimized);
    setHidden(view.hidden);
    saveStored('purpclaw.agentWorkDock.view', view);
  };

  if (!ready) return null;
  if (hidden) {
    return (
      <button type="button" onClick={() => setView({ hidden: false, minimized: true })} style={reopenStyle}>
        Work Monitor
      </button>
    );
  }

  return (
    <section style={{ ...panelStyle, left: pos.x, top: pos.y, width: minimized ? 270 : 420 }}>
      <div style={headerStyle} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <div>
          <div style={titleStyle}>Agent Work Monitor</div>
          <div style={subStyle}>
            {summary.workingAgents.length} agents / {summary.activeJobs.length + summary.activeMissions.length} active jobs / {summary.failures} issues
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onPointerDown={event => event.stopPropagation()} onClick={() => setView({ minimized: !minimized })} style={smallButtonStyle}>{minimized ? 'open' : 'min'}</button>
          <button type="button" onPointerDown={event => event.stopPropagation()} onClick={() => setView({ hidden: true })} style={smallButtonStyle}>hide</button>
        </div>
      </div>

      {minimized ? (
        <div style={miniBodyStyle}>
          <span style={{ color: summary.failures ? '#fb7185' : '#34d399' }}>{summary.failures ? 'attention needed' : 'running clean'}</span>
          <span>{data.loadedAt || 'loading'}</span>
        </div>
      ) : (
        <div style={bodyStyle}>
          <WorkSection title="Kernel jobs" empty="No kernel jobs are active or recent.">
            {data.jobs.slice(0, 5).map(job => (
              <WorkRow
                key={job.id || job.goal}
                title={compact(job.goal, job.id || 'kernel job')}
                meta={`${job.route || 'route?'} / ${job.source || 'source?'}`}
                state={job.state || 'unknown'}
                detail={latestJobLine(job)}
                href={job.id ? `/api/kernel/jobs/${encodeURIComponent(job.id)}` : undefined}
              />
            ))}
          </WorkSection>

          <WorkSection title="Harness missions" empty="No harness missions reported.">
            {data.missions.slice(0, 4).map(mission => (
              <WorkRow
                key={mission.missionId || mission.task}
                title={compact(mission.task, mission.missionId || 'harness mission')}
                meta={`${mission.subtasks?.length || 0} subtasks`}
                state={mission.status || 'unknown'}
                detail={mission.synthesis || mission.subtasks?.map(s => `${s.agent || 'agent'}:${s.status || '?'}`).join(' / ') || 'waiting'}
                href={mission.missionId ? `/mission/harness?mission=${encodeURIComponent(mission.missionId)}` : '/mission/harness'}
              />
            ))}
          </WorkSection>

          <WorkSection title="Agents" empty="No active or registered agents returned by tower.">
            {data.agents.slice(0, 6).map(agent => (
              <WorkRow
                key={agent.id || agent.name || agent.agentName}
                title={compact(agent.name || agent.agentName || agent.id, 'agent')}
                meta={agent.division || 'division?'}
                state={agent.status || 'idle'}
                detail={agent.currentTask || agent.task || 'no task detail from tower yet'}
                href="/agents"
              />
            ))}
          </WorkSection>

          <WorkSection title="Latest trace" empty="No trace events yet.">
            {data.traces.slice(0, 5).map(trace => (
              <WorkRow
                key={trace.id || `${trace.ts}-${trace.source}-${trace.action}`}
                title={`${trace.source || 'trace'} / ${trace.action || 'event'}`}
                meta={trace.route || trace.jobId || trace.sessionId || ''}
                state={trace.status || 'info'}
                detail={trace.detail || 'no detail'}
              />
            ))}
          </WorkSection>

          {data.errors.length ? (
            <div style={errorBoxStyle}>
              {data.errors.map(error => <div key={error}>{error}</div>)}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function WorkSection({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const count = Array.isArray(children) ? children.filter(Boolean).length : children ? 1 : 0;
  return (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>{title}</div>
      {count ? children : <div style={emptyStyle}>{empty}</div>}
    </div>
  );
}

function WorkRow({ title, meta, state, detail, href }: { title: string; meta?: string; state?: string; detail?: string; href?: string }) {
  const content = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={rowTitleStyle}>{title}</span>
        <span style={{ ...stateStyle, color: stateColor(state), borderColor: `${stateColor(state)}66`, background: `${stateColor(state)}14` }}>{state || 'unknown'}</span>
      </div>
      <div style={rowMetaStyle}>{meta || 'local runtime'}</div>
      <div style={rowDetailStyle}>{detail}</div>
    </>
  );
  if (href) {
    return <a href={href} style={rowStyle}>{content}</a>;
  }
  return <div style={rowStyle}>{content}</div>;
}

const panelStyle: CSSProperties = {
  position: 'fixed',
  zIndex: 900,
  maxWidth: 'calc(100vw - 20px)',
  background: 'linear-gradient(180deg, rgba(13,8,22,0.98), rgba(8,5,14,0.98))',
  border: '1px solid rgba(217,70,239,0.32)',
  borderRadius: 8,
  boxShadow: '0 18px 70px rgba(0,0,0,0.42)',
  color: '#f5f0ff',
  overflow: 'hidden',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 12px',
  cursor: 'move',
  userSelect: 'none',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(217,70,239,0.08)',
};

const titleStyle: CSSProperties = { fontSize: 11, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase', color: '#d946ef' };
const subStyle: CSSProperties = { marginTop: 3, fontSize: 10, color: 'rgba(255,255,255,0.55)' };
const smallButtonStyle: CSSProperties = { height: 24, padding: '0 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.13)', borderRadius: 4, color: '#f5f0ff', fontSize: 10, cursor: 'pointer' };
const bodyStyle: CSSProperties = { maxHeight: 'min(620px, calc(100vh - 150px))', overflowY: 'auto', padding: 10, display: 'grid', gap: 10 };
const miniBodyStyle: CSSProperties = { padding: '8px 12px', display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 10, color: 'rgba(255,255,255,0.65)' };
const sectionStyle: CSSProperties = { display: 'grid', gap: 6 };
const sectionTitleStyle: CSSProperties = { fontSize: 9, color: 'rgba(255,255,255,0.38)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.4 };
const rowStyle: CSSProperties = { display: 'block', padding: 9, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, background: 'rgba(255,255,255,0.035)', color: 'inherit', textDecoration: 'none' };
const rowTitleStyle: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 800 };
const rowMetaStyle: CSSProperties = { marginTop: 3, fontSize: 9, color: 'rgba(255,255,255,0.38)', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const rowDetailStyle: CSSProperties = { marginTop: 5, fontSize: 10, color: 'rgba(255,255,255,0.62)', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };
const stateStyle: CSSProperties = { flex: '0 0 auto', border: '1px solid', borderRadius: 999, padding: '1px 7px', fontSize: 8, fontWeight: 900, textTransform: 'uppercase' };
const emptyStyle: CSSProperties = { padding: 10, border: '1px dashed rgba(255,255,255,0.09)', borderRadius: 6, color: 'rgba(255,255,255,0.28)', fontSize: 10 };
const errorBoxStyle: CSSProperties = { padding: 10, border: '1px solid rgba(251,113,133,0.32)', background: 'rgba(251,113,133,0.08)', color: '#fb7185', borderRadius: 6, fontSize: 10 };
const reopenStyle: CSSProperties = {
  position: 'fixed',
  zIndex: 900,
  right: 18,
  top: 86,
  padding: '7px 10px',
  background: 'rgba(13,8,22,0.94)',
  border: '1px solid rgba(217,70,239,0.32)',
  borderRadius: 6,
  color: '#d946ef',
  fontSize: 10,
  fontWeight: 900,
  textTransform: 'uppercase',
  cursor: 'pointer',
};
