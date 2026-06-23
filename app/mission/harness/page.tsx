'use client';

/**
 * PURPCLAW Mission Control — Harness Page
 * ========================================
 * Operator UI for the autonomous productivity harness.  Drives the harness
 * service on :7798 through same-origin Next adapters. Falls back to local file
 * archive readout when the service is offline (read-only).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CockpitShell } from '../../components/CockpitShell';

// The harness service port — referenced in the status line but was never
// defined, which threw "HARNESS_PORT is not defined" and crashed the page.
const HARNESS_PORT = 7798;

function harnessProxy(path: string, soft = true) {
  return `/api/service-proxy?port=7798&path=${encodeURIComponent(path)}${soft ? '&soft=1' : ''}`;
}

function unwrapProxy(payload: any) {
  return payload?.data ?? payload;
}

type SubtaskState = 'pending' | 'in_progress' | 'accepted' | 'challenged' | 'rejected' | 'failed';
type HarnessState = 'idle' | 'planning' | 'executing' | 'reviewing' | 'synthesizing' | 'done' | 'failed' | 'stopped';

interface Subtask {
  id: string;
  index: number;
  description: string;
  rationale?: string;
  state: SubtaskState;
  attempts: number;
  verdict?: 'ACCEPTED' | 'CHALLENGED' | 'REJECTED';
  verdictReason?: string;
  dispatchedTo?: string;
  output?: string;
  contract?: { preferredAgents?: string[]; verificationGates?: string[] };
  karenEscalations?: Array<{ at: number; decision: { action: string; reason: string } }>;
}

interface TraceEntry { timestamp: number; stage: string; event: string; summary: string; subtaskId?: string }
interface LogEntry { timestamp: number; level: string; message: string }

interface HarnessJob {
  id: string;
  goal: string;
  state: HarnessState;
  plan: Subtask[];
  log: LogEntry[];
  trace: TraceEntry[];
  scratchpad: string[];
  iteration: number;
  maxIterations: number;
  toolsUsed?: number;
  startedAt: number;
  finishedAt?: number;
  finalReport?: string;
  classification?: { type: string; confidence: string };
  usedFallbackPlanner?: boolean;
}

const GOAL_PRESETS = [
  'Audit which dark-cluster services (voice, vision, autodream, reasoning, stt, chorus) are currently reachable and produce a 1-page operator brief.',
  'Draft a launch readiness checklist for shipping PURPCLAW to a new operator: env vars, key services, smoke test, common failure modes.',
  'Inspect the agent tower roster, identify the 5 most-used divisions, and propose 3 staffing changes based on coverage gaps.',
  'Run the spaghetti-audit, list the top 10 worst offenders, and recommend a fix order ranked by risk-adjusted cleanup value.',
];

const STAGE_COLOR: Record<string, string> = {
  operator:     '#9aa0a6',
  tower:        '#ff66c4',
  orchestrator: '#ffd166',
  mirrorvale:   '#c792ea',
  llm:          '#00ff9d',
  karen:        '#5cd9ff',
  gates:        '#82c4ff',
};

export default function HarnessPage() {
  const [goal, setGoal] = useState(GOAL_PRESETS[0]);
  const [job, setJob] = useState<HarnessJob | null>(null);
  const [history, setHistory] = useState<HarnessJob[]>([]);
  const [serviceOnline, setServiceOnline] = useState<boolean | null>(null);
  const [streaming, setStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Health probe
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(harnessProxy('/health'), { cache: 'no-store' });
        const body = await r.json().catch(() => null);
        if (!cancelled) setServiceOnline(r.ok && body?.status === 'online');
      } catch {
        if (!cancelled) setServiceOnline(false);
      }
    })();
    const t = setInterval(async () => {
      try {
        const r = await fetch(harnessProxy('/health'), { cache: 'no-store' });
        const body = await r.json().catch(() => null);
        setServiceOnline(r.ok && body?.status === 'online');
      }
      catch { setServiceOnline(false); }
    }, 8000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Load history when service comes online
  const refreshHistory = useCallback(async () => {
    if (!serviceOnline) return;
    try {
      const r = await fetch(harnessProxy('/harness/jobs'), { cache: 'no-store' });
      const data = unwrapProxy(await r.json());
      setHistory(Array.isArray(data?.jobs) ? data.jobs : []);
    } catch {}
  }, [serviceOnline]);

  useEffect(() => {
    if (!serviceOnline) return;
    let cancelled = false;
    const loadHistory = async () => {
      try {
        const r = await fetch(harnessProxy('/harness/jobs'), { cache: 'no-store' });
        const data = unwrapProxy(await r.json());
        if (!cancelled) setHistory(Array.isArray(data?.jobs) ? data.jobs : []);
      } catch {}
    };
    void loadHistory();
    return () => { cancelled = true; };
  }, [serviceOnline]);

  const closeStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStreaming(false);
  };

  const attachStream = useCallback((jobId: string) => {
    closeStream();
    const es = new EventSource(`/api/harness/missions/${encodeURIComponent(jobId)}/stream`);
    eventSourceRef.current = es;
    setStreaming(true);

    es.onmessage = (m) => {
      try {
        const event = JSON.parse(m.data);
        if (event.type === 'done' && event.job) {
          setJob(event.job);
          closeStream();
          refreshHistory();
          return;
        }
        if (event.type === 'state') {
          setJob(curr => curr ? { ...curr, state: event.state } : curr);
        }
        if (event.type === 'subtask' && event.subtask) {
          setJob(curr => {
            if (!curr) return curr;
            const idx = curr.plan.findIndex(s => s.id === event.subtask.id);
            const plan = [...curr.plan];
            if (idx >= 0) plan[idx] = event.subtask;
            else plan.push(event.subtask);
            return { ...curr, plan };
          });
        }
        if (event.type === 'trace' && event.entry) {
          setJob(curr => curr ? { ...curr, trace: [...curr.trace, event.entry].slice(-200) } : curr);
        }
        if (event.type === 'log' && event.entry) {
          setJob(curr => curr ? { ...curr, log: [...curr.log, event.entry].slice(-300) } : curr);
        }
      } catch {}
    };
    es.onerror = () => { closeStream(); };
  }, [refreshHistory]);

  const handleRun = async () => {
    if (!goal.trim() || streaming) return;
    if (!serviceOnline) return;
    try {
      const r = await fetch(harnessProxy('/harness/run', false), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: goal.trim() }),
      });
      const data = unwrapProxy(await r.json());
      if (!data?.jobId) return;
      // Optimistic shell
      setJob({
        id: data.jobId,
        goal: goal.trim(),
        state: data.state || 'planning',
        plan: [], log: [], trace: [], scratchpad: [],
        iteration: 0, maxIterations: 30, startedAt: Date.now()
      });
      attachStream(data.jobId);
    } catch (e) {
      console.error('harness run failed', e);
    }
  };

  const handleStop = async () => {
    if (!job) return;
    try { await fetch(harnessProxy(`/harness/jobs/${job.id}/stop`, false), { method: 'POST' }); }
    catch {}
  };

  const handleLoadHistory = async (id: string) => {
    closeStream();
    try {
      const r = await fetch(harnessProxy(`/harness/jobs/${id}`), { cache: 'no-store' });
      const data = unwrapProxy(await r.json());
      if (data && data.id) setJob(data);
    } catch {}
  };

  const counts = useMemo(() => {
    if (!job) return { total: 0, accepted: 0, failed: 0, pending: 0 };
    return job.plan.reduce((acc, s) => {
      acc.total++;
      if (s.state === 'accepted') acc.accepted++;
      else if (s.state === 'failed' || s.state === 'rejected') acc.failed++;
      else acc.pending++;
      return acc;
    }, { total: 0, accepted: 0, failed: 0, pending: 0 });
  }, [job]);

  return (
    <CockpitShell title="Execution Harness · Autonomous Missions">
    <div style={{ ...pageStyle, minHeight: 0, height: '100%', overflowY: 'auto' }}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Mission Control · Harness</p>
          <h1 style={h1Style}>Autonomous Productivity Harness</h1>
          <p style={subtitleStyle}>
            Goal → plan → tower dispatch (penguin / dragon / wolf / owl / …) → verification gates →
            verdict → KAREN escalation on repeated fail → synthesis.
            Live dispatch only. If the tower or orchestrator is offline, the harness reports a blocker.
          </p>
        </div>
        <div style={statsStyle}>
          <span style={badge(serviceOnline === null ? '#9aa0a6' : serviceOnline ? '#00ff9d' : '#ff8a8a')}>
            harness service · {serviceOnline === null ? 'probing…' : serviceOnline ? `online :${HARNESS_PORT}` : `offline :${HARNESS_PORT}`}
          </span>
          {job && (
            <>
              <span style={badge('#11151a')}>{job.state}</span>
              <span style={badge('#11151a')}>plan {counts.total}</span>
              <span style={badge('#003827', '#00ff9d')}>accepted {counts.accepted}</span>
              <span style={badge('#3d2a00', '#ffd166')}>pending {counts.pending}</span>
              <span style={badge('#3d1f1f', '#ff8a8a')}>failed {counts.failed}</span>
              <span style={badge('#11151a')}>iter {job.iteration}/{job.maxIterations}</span>
              {job.toolsUsed != null && <span style={badge('#11151a')}>tools {job.toolsUsed}</span>}
            </>
          )}
        </div>
      </header>

      <section style={inputSectionStyle}>
        <div style={presetStripStyle}>
          {GOAL_PRESETS.map(g => (
            <button key={g} type="button" onClick={() => setGoal(g)} disabled={streaming} style={presetChipStyle}>
              {g.slice(0, 64)}{g.length > 64 ? '…' : ''}
            </button>
          ))}
        </div>
        <textarea
          value={goal}
          onChange={e => setGoal(e.target.value)}
          disabled={streaming}
          rows={4}
          placeholder="Describe a complex productivity goal — the harness will decompose, execute via the swarm, and synthesise."
          style={textareaStyle}
        />
        <div style={controlsStyle}>
          <button type="button" onClick={handleRun} disabled={streaming || !serviceOnline || !goal.trim()} style={primaryButtonStyle}>
            {streaming ? 'Running…' : serviceOnline ? 'Run Harness' : 'Service offline'}
          </button>
          <button type="button" onClick={handleStop} disabled={!streaming} style={buttonStyle}>Stop</button>
          {!serviceOnline && (
            <span style={hintStyle}>Start with: <code>purpclaw safe-start harness</code></span>
          )}
        </div>
      </section>

      <div style={gridStyle}>
        <section style={panelStyle}>
          <div style={panelTitleStyle}>
            <h2 style={h2Style}>Plan</h2>
            <span style={mutedStyle}>{job?.plan.length ?? 0} subtasks</span>
          </div>
          <ol style={subtaskListStyle}>
            {(job?.plan ?? []).map(s => (
              <li key={s.id} style={subtaskStyle(s.state)}>
                <div style={subtaskHeadStyle}>
                  <strong>#{s.index + 1}</strong>
                  <span style={subtaskBadge(s.state)}>{s.state.replace('_', ' ')}</span>
                  {s.verdict && <span style={verdictBadge(s.verdict)}>{s.verdict}</span>}
                  {s.attempts > 0 && <span style={mutedSmallStyle}>attempt {s.attempts}</span>}
                  {s.dispatchedTo && <span style={mutedSmallStyle}>→ {s.dispatchedTo}</span>}
                </div>
                <div style={{ fontSize: 12, color: '#e6edf3', marginTop: 4 }}>{s.description}</div>
                {s.rationale && <div style={mutedSmallStyle}>why: {s.rationale}</div>}
                {s.verdictReason && <div style={mutedSmallStyle}>judge: {s.verdictReason}</div>}
                {s.karenEscalations?.length ? (
                  <div style={karenLineStyle}>
                    ↳ KAREN <strong>{s.karenEscalations.at(-1)!.decision.action}</strong>
                    <span style={mutedSmallStyle}> — {s.karenEscalations.at(-1)!.decision.reason}</span>
                  </div>
                ) : null}
                {s.output && (
                  <details style={{ marginTop: 4 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 11, color: '#9aa0a6' }}>deliverable ({s.output.length} chars)</summary>
                    <pre style={preStyle}>{s.output}</pre>
                  </details>
                )}
              </li>
            ))}
            {!job?.plan.length && <li style={emptyStyle}>Run the harness to generate a plan.</li>}
          </ol>
        </section>

        <section style={panelStyle}>
          <div style={panelTitleStyle}>
            <h2 style={h2Style}>Pipeline Trace</h2>
            <span style={mutedStyle}>{job?.trace.length ?? 0} phases</span>
          </div>
          <div style={traceListStyle}>
            {(job?.trace ?? []).slice(-80).map((entry, idx) => (
              <div key={`${entry.timestamp}-${idx}`} style={traceRowStyle(STAGE_COLOR[entry.stage] || '#9aa0a6')}>
                <span style={{ color: STAGE_COLOR[entry.stage] || '#9aa0a6', textTransform: 'uppercase', fontWeight: 700, width: 92, display: 'inline-block' }}>
                  {entry.stage}
                </span>
                <span style={{ width: 130, display: 'inline-block' }}>{entry.event}</span>
                <span style={mutedStyle}>{entry.summary}</span>
              </div>
            ))}
            {!job?.trace.length && <div style={emptyStyle}>pipeline trace will appear as phases run</div>}
          </div>
        </section>

        <section style={panelStyle}>
          <div style={panelTitleStyle}>
            <h2 style={h2Style}>Live Log</h2>
            <span style={mutedStyle}>{job?.log.length ?? 0} entries</span>
          </div>
          <div style={logListStyle}>
            {(job?.log ?? []).slice(-180).map((e, i) => (
              <div key={`${e.timestamp}-${i}`} style={logRowStyle(e.level)}>
                <span style={{ color: '#9aa0a6', width: 76, display: 'inline-block' }}>{new Date(e.timestamp).toLocaleTimeString()}</span>
                <span style={{ width: 60, display: 'inline-block', fontWeight: 600 }}>{e.level.toUpperCase()}</span>
                <span>{e.message}</span>
              </div>
            ))}
            {!job?.log.length && <div style={emptyStyle}>no log entries yet</div>}
          </div>
        </section>

        <section style={panelStyle}>
          <div style={panelTitleStyle}>
            <h2 style={h2Style}>Job History</h2>
            <span style={mutedStyle}>{history.length}</span>
          </div>
          <ul style={historyListStyle}>
            {history.map(h => (
              <li key={h.id} style={historyRowStyle}>
                <button type="button" onClick={() => handleLoadHistory(h.id)} style={historyButtonStyle}>
                  <span style={statusBadge(h.state)}>{h.state}</span>
                  <span style={{ fontSize: 11, marginLeft: 8 }}>{h.goal.slice(0, 100)}{h.goal.length > 100 ? '…' : ''}</span>
                  <span style={{ display: 'block', fontSize: 10, color: '#9aa0a6', marginTop: 4 }}>
                    {(h.plan?.filter(s => s.state === 'accepted').length ?? 0)}/{h.plan?.length ?? 0} accepted
                    · {new Date(h.startedAt).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
            {!history.length && <li style={emptyStyle}>no jobs yet</li>}
          </ul>
        </section>

        <section style={{ ...panelStyle, gridColumn: '1 / -1' }}>
          <div style={panelTitleStyle}>
            <h2 style={h2Style}>Final Report</h2>
            {job?.finalReport && <span style={{ ...mutedStyle, color: '#00ff9d' }}>synthesised</span>}
          </div>
          {job?.finalReport
            ? <pre style={reportStyle}>{job.finalReport}</pre>
            : <div style={emptyStyle}>final report will land here when the harness completes</div>
          }
        </section>
      </div>
    </div>
    </CockpitShell>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = { minHeight: '100vh', background: '#030508', color: '#e6edf3', padding: '20px 24px 32px', fontFamily: 'ui-sans-serif, system-ui, sans-serif' };
const headerStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 16, alignItems: 'start' };
const eyebrowStyle: React.CSSProperties = { fontSize: 10, color: '#9aa0a6', textTransform: 'uppercase', letterSpacing: 2, margin: 0 };
const h1Style: React.CSSProperties = { fontSize: 22, margin: '4px 0' };
const subtitleStyle: React.CSSProperties = { color: '#9aa0a6', fontSize: 12, maxWidth: 760, margin: 0 };
const statsStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 11 };
const mutedStyle: React.CSSProperties = { color: '#9aa0a6', fontSize: 11 };
const mutedSmallStyle: React.CSSProperties = { color: '#9aa0a6', fontSize: 10 };
const emptyStyle: React.CSSProperties = { color: '#9aa0a6', fontSize: 11, fontStyle: 'italic', padding: '12px 4px' };

const inputSectionStyle: React.CSSProperties = { display: 'grid', gap: 8, padding: 12, border: '1px solid #1f242b', borderRadius: 8, background: '#11151a', marginTop: 14 };
const presetStripStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6 };
const presetChipStyle: React.CSSProperties = { padding: '4px 10px', fontSize: 10, border: '1px solid #1f242b', borderRadius: 999, background: '#14181e', color: '#9aa0a6', cursor: 'pointer' };
const textareaStyle: React.CSSProperties = { width: '100%', minHeight: 92, padding: 10, background: '#0b0e13', color: '#e6edf3', border: '1px solid #1f242b', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, lineHeight: 1.45, resize: 'vertical' };
const controlsStyle: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' };
const buttonStyle: React.CSSProperties = { padding: '6px 14px', background: '#14181e', color: '#e6edf3', border: '1px solid #1f242b', borderRadius: 4, cursor: 'pointer', fontSize: 12 };
const primaryButtonStyle: React.CSSProperties = { ...buttonStyle, background: '#00ff9d', color: '#000', fontWeight: 600 };
const hintStyle: React.CSSProperties = { ...mutedStyle, marginLeft: 'auto' };

const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 14 };
const panelStyle: React.CSSProperties = { border: '1px solid #1f242b', borderRadius: 8, background: '#11151a', padding: 12, display: 'grid', gap: 8, minHeight: 200 };
const panelTitleStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const h2Style: React.CSSProperties = { margin: 0, fontSize: 13 };

const subtaskListStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, maxHeight: 360, overflow: 'auto' };
const subtaskStyle = (state: SubtaskState): React.CSSProperties => ({
  padding: '8px 10px', borderRadius: 6, background: '#0b0e13', display: 'grid', gap: 4, fontSize: 11,
  borderLeft: `3px solid ${state === 'accepted' ? '#00ff9d' : state === 'rejected' || state === 'failed' ? '#ff8a8a' : state === 'in_progress' || state === 'challenged' ? '#5cd9ff' : '#1f242b'}`
});
const subtaskHeadStyle: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
const subtaskBadge = (state: SubtaskState): React.CSSProperties => {
  const colors: Record<SubtaskState, [string, string]> = {
    pending: ['#14181e', '#9aa0a6'],
    in_progress: ['rgba(0,212,255,0.18)', '#5cd9ff'],
    accepted: ['rgba(0,255,157,0.18)', '#00ff9d'],
    challenged: ['rgba(0,212,255,0.18)', '#5cd9ff'],
    rejected: ['rgba(255,100,100,0.18)', '#ff8a8a'],
    failed: ['rgba(255,100,100,0.18)', '#ff8a8a'],
  };
  const [bg, fg] = colors[state] || ['#14181e', '#9aa0a6'];
  return { padding: '1px 6px', borderRadius: 3, fontSize: 9, textTransform: 'uppercase', background: bg, color: fg };
};
const verdictBadge = (v: string): React.CSSProperties => {
  const map: Record<string, [string, string]> = {
    ACCEPTED: ['#003827', '#00ff9d'], CHALLENGED: ['#1f2d3d', '#5cd9ff'], REJECTED: ['#3d1f1f', '#ff8a8a']
  };
  const [bg, fg] = map[v] || ['#14181e', '#9aa0a6'];
  return { fontSize: 9, padding: '1px 5px', borderRadius: 3, background: bg, color: fg };
};
const karenLineStyle: React.CSSProperties = { fontSize: 10, color: '#5cd9ff', paddingLeft: 4 };
const preStyle: React.CSSProperties = { whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 10, maxHeight: 240, overflow: 'auto', padding: 6, background: '#06080b', borderRadius: 4, margin: '4px 0 0' };

const traceListStyle: React.CSSProperties = { display: 'grid', gap: 3, maxHeight: 360, overflow: 'auto', fontSize: 10, fontFamily: 'ui-monospace, monospace' };
const traceRowStyle = (color: string): React.CSSProperties => ({
  display: 'grid', gridTemplateColumns: '92px 130px minmax(0, 1fr)', gap: 6, padding: '3px 6px',
  borderLeft: `3px solid ${color}`, background: '#0b0e13', borderRadius: 3
});

const logListStyle: React.CSSProperties = { display: 'grid', gap: 2, fontFamily: 'ui-monospace, monospace', fontSize: 10, maxHeight: 360, overflow: 'auto', padding: '4px 0' };
const logRowStyle = (level: string): React.CSSProperties => {
  const colors: Record<string, string> = { info: '#5cd9ff', warn: '#ffd166', error: '#ff8a8a', verdict: '#c792ea' };
  return { padding: '2px 4px', display: 'grid', gridTemplateColumns: '76px 60px minmax(0, 1fr)', gap: 6, color: colors[level] || '#e6edf3' };
};

const historyListStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4, maxHeight: 320, overflow: 'auto' };
const historyRowStyle: React.CSSProperties = {};
const historyButtonStyle: React.CSSProperties = { width: '100%', textAlign: 'left', padding: '6px 8px', background: '#0b0e13', border: '1px solid #1f242b', borderRadius: 4, color: '#e6edf3', cursor: 'pointer', font: 'inherit' };
const statusBadge = (s: HarnessState): React.CSSProperties => {
  const map: Record<string, [string, string]> = {
    done: ['rgba(0,255,157,0.18)', '#00ff9d'], failed: ['rgba(255,100,100,0.15)', '#ff8a8a'],
    stopped: ['rgba(255,100,100,0.15)', '#ff8a8a'], executing: ['rgba(0,212,255,0.18)', '#5cd9ff']
  };
  const [bg, fg] = map[s] || ['#11151a', '#9aa0a6'];
  return { padding: '1px 6px', borderRadius: 3, fontSize: 9, textTransform: 'uppercase', background: bg, color: fg };
};

const reportStyle: React.CSSProperties = { whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: 12, background: '#06080b', borderRadius: 6, fontFamily: 'ui-monospace, monospace', fontSize: 11, maxHeight: 520, overflow: 'auto', lineHeight: 1.5 };

function badge(bg: string, fg: string = '#e6edf3'): React.CSSProperties {
  return { padding: '2px 8px', borderRadius: 4, background: bg, border: '1px solid #1f242b', color: fg, textTransform: 'uppercase', fontSize: 11 };
}
