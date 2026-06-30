'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CockpitShell } from '../components/CockpitShell';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AwakenStatus {
  run_id: string | null;
  mode: string;
  status: string;
  truth_state: string;
  writes_allowed: string;
  phase: string;
  evidence_path: string | null;
  report_path: string | null;
  total_runs: number;
  last_run_at: string | null;
  feeds: {
    growth: Record<string, unknown>;
    companion_cognitive: Record<string, unknown>;
    stress: Record<string, unknown>;
    self_improving: Record<string, unknown>;
  };
  recent_events: Array<{ runId?: string; phase?: string; type?: string; category?: string; item?: string; badge?: string; ts?: string }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function badge(label: string, status: string | null) {
  const colors: Record<string, string> = {
    ACTIVE: '#00cc88', LOADED: '#00aadd', PARTIAL: '#ffaa00',
    WARNING: '#ffaa00', MISSING: '#ff4444', UNKNOWN: '#666688',
    CLEAN: '#00cc88', IDLE: '#666688', ERROR: '#ff4444',
    loaded_not_running: '#ffaa00', loaded: '#00aadd', missing: '#ff4444',
  };
  const color = colors[status || 'unknown'] || '#666688';
  return `${label}: `;
}

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { color: string; bg: string }> = {
    idle:      { color: '#666688', bg: '#111122' },
    active:    { color: '#ff8888', bg: '#1a0010' },
    stopping:  { color: '#ffaa00', bg: '#1a1000' },
    stopped:  { color: '#888888', bg: '#111111' },
    failed:    { color: '#ff4444', bg: '#1a0000' },
    unknown:   { color: '#666688', bg: '#111122' },
  };
  const s = map[status || 'unknown'] || map.unknown;
  return (
    <span style={{ background: s.bg, border: `1px solid ${s.color}44`, borderRadius: 4, padding: '2px 8px', fontSize: 10, fontFamily: 'monospace', color: s.color }}>
      {status ? status.toUpperCase() : 'UNKNOWN'}
    </span>
  );
}

function TruthBadge({ state }: { state: string }) {
  const map: Record<string, string> = { clean: '#00cc88', warning: '#ffaa00', error: '#ff4444', unknown: '#666688' };
  return <span style={{ color: map[state] || map.unknown, fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold' }}>{state.toUpperCase()}</span>;
}

function FeedCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ background: '#080812', border: '1px solid #111133', borderRadius: 6, padding: '12px 16px', marginBottom: 12 }}>
      <div style={{ color: '#333355', fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{title}</div>
      {items.map((item, i) => <div key={i} style={{ color: '#667788', fontSize: 11, fontFamily: 'monospace', lineHeight: '1.7' }}>{item}</div>)}
    </div>
  );
}

function FeedItem({ label, value, warn = false }: { label: string; value: string | number | boolean | null; warn?: boolean }) {
  const display = value === null || value === undefined ? 'UNKNOWN' : String(value);
  const color = (warn || display === 'UNKNOWN') ? '#ffaa00' : display === 'missing' || display === 'error' ? '#ff4444' : '#667788';
  return (
    <div style={{ color, fontSize: 11, fontFamily: 'monospace', lineHeight: '1.7' }}>
      {label}: <span style={{ color: '#aabbcc' }}>{display}</span>
    </div>
  );
}

// ── Card Components ─────────────────────────────────────────────────────────────

function GrowthCard({ feed }: { feed: Record<string, unknown> }) {
  const items = [
    <FeedItem key="auto_research" label="Auto Research" value={feed.auto_research_active as string} warn={feed.auto_research_active === 'missing'} />,
    <FeedItem key="research_queue" label="Research Queue" value={feed.research_queue_length as number | null} />,
    <FeedItem key="auto_evolve" label="Auto Evolve" value={feed.auto_evolve_active as string} warn={feed.auto_evolve_active === 'missing'} />,
    <FeedItem key="pending_proposals" label="Pending Proposals" value={feed.pending_evolution_proposals as number | null} />,
    <FeedItem key="idle_sessions" label="Idle Engine Sessions" value={feed.idle_engine_sessions as number} />,
    <FeedItem key="idle_cycles" label="Idle Engine Cycles" value={feed.idle_engine_cycles as number} />,
    <FeedItem key="evolution_ticks" label="Evolution Ticks" value={feed.evolution_ticks as number} />,
    <FeedItem key="drift_watcher" label="Drift Watcher" value={feed.drift_watcher_status as string} warn={feed.drift_watcher_status === 'missing'} />,
    <FeedItem key="donor_pending" label="Donor Pending" value={feed.donor_pending as number} />,
    <FeedItem key="skill_forge" label="Skill Forge" value={feed.skill_forge_count as number | null} warn={(feed.skill_forge_count as number | null) === null} />,
    <FeedItem key="mutations" label="Mutations Applied" value={feed.mutations_applied as number | null} warn={(feed.mutations_applied as number | null) === null} />,
    <FeedItem key="quarantined" label="Quarantined" value={feed.gate_pipeline_quarantined as number} />,
    <FeedItem key="last_tick" label="Last Tick" value={feed.last_evolution_tick as string | null} />,
    <FeedItem key="last_feedback" label="Last Feedback" value={feed.last_training_feedback_time as string | null} />,
  ];
  return <FeedCard title="AUTONOMOUS GROWTH" items={items.map((item, i) => <div key={i}>{item}</div>)} />;
}

function CompanionCard({ feed }: { feed: Record<string, unknown> }) {
  const mochiStatus = feed.mochi_phase === 2 ? 'ACTIVE' : feed.mochi_phase === 1 ? 'PHASE_1' : 'MISSING';
  const items = [
    `Mochi: ${badge('Mochi', mochiStatus)} bond=${feed.mochi_bond || 0} mood=${feed.mochi_mood || 'unknown'}`,
    `  name=${feed.mochi_name || 'Asher'} species=${feed.mochi_species || 'dragon'}`,
    `${badge('Duck', 'ACTIVE')} — always observing, non-needy by design`,
    `${badge('Weatherman', feed.weatherman_status as string)} — context/status signals`,
    `${badge('Shaman', feed.shaman_status as string)} — ritual mode available`,
    `${badge('Chorus', feed.chorus_phase ? 'PARTIAL' : 'MISSING')} — companion chorus`,
    `  Cognitive Spine: ${feed.cognitive_spine_alive ? 'alive' : 'offline'}`,
  ];
  return <FeedCard title="COMPANIONS" items={items} />;
}

function StressCard({ feed }: { feed: Record<string, unknown> }) {
  const oldSvc = feed.old_service_count as number;
  const newSvc = feed.current_service_count as number;
  const oldTools = feed.old_tool_count as number;
  const newTools = feed.current_tool_count as number;
  const items = [
    `Services: ${oldSvc} → ${newSvc} (${newSvc - oldSvc >= 0 ? '+' : ''}${newSvc - oldSvc})`,
    `Tool registry: ${oldTools} → ${newTools} (reconciliation complete)`,
    <div key="doctrine" style={{ color: '#667788', fontSize: 11, fontFamily: 'monospace', lineHeight: '1.7' }}>
      Doctrine: <span style={{ color: '#aabbcc' }}>{feed.doctrine_status as string || 'unknown'}</span>
    </div>,
    <div key="resolved" style={{ color: '#00cc88', fontSize: 11, fontFamily: 'monospace', lineHeight: '1.7' }}>
      Resolved: {(feed.resolved_blockers as string[])?.join(', ') || 'none'}
    </div>,
    <div key="unresolved" style={{ color: '#ffaa00', fontSize: 11, fontFamily: 'monospace', lineHeight: '1.7' }}>
      Unresolved: {(feed.unresolved_blockers as string[])?.join(', ') || 'none'}
    </div>,
    <div key="drift" style={{ color: '#ffaa00', fontSize: 11, fontFamily: 'monospace', lineHeight: '1.7' }}>
      Drift warnings: {(feed.drift_warnings as string[])?.join(', ') || 'none'}
    </div>,
    <div key="runs" style={{ color: '#667788', fontSize: 11, fontFamily: 'monospace', lineHeight: '1.7' }}>
      AWAKEN runs: {feed.total_awaken_runs as number} | Last: {feed.last_awaken_result as string || 'unknown'}
    </div>,
  ];
  return <FeedCard title="STRESS / HISTORICAL TRUTH" items={items} />;
}

function SelfImprovingCard({ feed }: { feed: Record<string, unknown> }) {
  const items = [
    <FeedItem key="pending" label="Pending Confirmations" value={feed.pending_confirmation as number} warn={(feed.pending_confirmation as number) > 0} />,
    <FeedItem key="hot_lines" label="Memory Hot Lines" value={feed.memory_hot_lines as number} />,
    <FeedItem key="reflections" label="Self Reflections" value={feed.self_reflection_count as number} />,
    <FeedItem key="heartbeat" label="Heartbeat" value={feed.heartbeat_last_run as string | null} />,
    <FeedItem key="violations" label="Boundary Violations" value={feed.security_boundary_violations as number} warn={(feed.security_boundary_violations as number) > 0} />,
    <FeedItem key="corrections_total" label="Corrections Total" value={feed.corrections_total as number} />,
    <FeedItem key="corrections_accepted" label="Corrections Accepted" value={feed.corrections_accepted as number} />,
  ];
  return <FeedCard title="SELF-IMPROVING" items={items.map((item, i) => <div key={i}>{item}</div>)} />;
}

function EventFeed({ events }: { events: AwakenStatus['recent_events'] }) {
  if (!events?.length) return <div style={{ color: '#333355', fontSize: 11, fontFamily: 'monospace' }}>No events yet.</div>;
  return (
    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
      {events.map((event, i) => {
        const ts = event.ts ? new Date(event.ts).toLocaleTimeString() : '';
        const parts = [event.badge, event.type, event.category, event.item].filter(Boolean);
        return (
          <div key={i} style={{ color: '#556677', fontSize: 10, fontFamily: 'monospace', padding: '2px 0', borderBottom: '1px solid #111122' }}>
            {ts && <span style={{ color: '#334455', marginRight: 8 }}>{ts}</span>}
            {event.badge && <span style={{ color: '#8888aa', marginRight: 6 }}>[{event.badge}]</span>}
            {event.type && <span style={{ color: '#667788', marginRight: 6 }}>{event.type}</span>}
            {event.item || event.category || 'event'}
          </div>
        );
      })}
    </div>
  );
}

// ── Idle Screen ────────────────────────────────────────────────────────────────

function IdleScreen({
  totalRuns, lastRun, onStart, selectedMode, onModeChange,
}: {
  totalRuns: number; lastRun: string | null;
  onStart: () => void; selectedMode: string; onModeChange: (m: string) => void;
}) {
  const [holding, setHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const HOLD_MS = 2000;

  const startHold = () => {
    setHolding(true);
    let elapsed = 0;
    holdTimer.current = setInterval(() => {
      elapsed += 50;
      setHoldProgress(Math.min(elapsed / HOLD_MS, 1));
      if (elapsed >= HOLD_MS) {
        if (holdTimer.current) clearInterval(holdTimer.current);
        setHolding(false);
        setHoldProgress(0);
        onStart();
      }
    }, 50);
  };

  const cancelHold = () => {
    if (holdTimer.current) clearInterval(holdTimer.current);
    setHolding(false);
    setHoldProgress(0);
  };

  const MODES = ['watch', 'work', 'monster', 'ritual'];
  const MODE_DESCRIPTIONS: Record<string, string> = {
    watch: 'Read-only monitoring — no writes',
    work: 'Safe docs and evidence writes',
    monster: 'Autonomous scanning and research',
    ritual: 'Shaman-led guided session',
  };

  return (
    <div style={{ textAlign: 'center', paddingTop: 40 }}>
      <div style={{ color: '#555577', fontSize: 11, fontFamily: 'monospace', marginBottom: 32 }}>
        {totalRuns} runs logged · last run {lastRun ? new Date(lastRun).toLocaleDateString() : 'never'}
      </div>

      {/* Big red button */}
      <div style={{ position: 'relative', display: 'inline-block', marginBottom: 24 }}>
        <button
          onMouseDown={startHold}
          onMouseUp={cancelHold}
          onMouseLeave={cancelHold}
          onTouchStart={startHold}
          onTouchEnd={cancelHold}
          style={{
            width: 220, height: 220, borderRadius: '50%',
            background: holding ? 'radial-gradient(circle at 40% 40%, #ff4444, #880000)' : 'radial-gradient(circle at 40% 40%, #cc2222, #550000)',
            border: `4px solid ${holding ? '#ffaaaa' : '#aa0000'}`,
            boxShadow: holding ? '0 0 60px rgba(255,0,0,0.6), inset 0 0 30px rgba(0,0,0,0.5)' : '0 0 30px rgba(200,0,0,0.4), inset 0 0 20px rgba(0,0,0,0.5)',
            cursor: 'pointer', transition: 'all 0.1s', position: 'relative', overflow: 'hidden', userSelect: 'none',
          }}
        >
          {/* Progress ring */}
          {holding && (
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
              <circle cx="110" cy="110" r="106" fill="none" stroke="#ff8888" strokeWidth="4"
                strokeDasharray={`${2 * Math.PI * 106}`}
                strokeDashoffset={`${2 * Math.PI * 106 * (1 - holdProgress)}`}
                strokeLinecap="round" transform="rotate(-90 110 110)"
                style={{ transition: 'stroke-dashoffset 0.05s linear' }}
              />
            </svg>
          )}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{holding ? '⏳' : '🔴'}</div>
            <div style={{ color: '#fff', fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '0.15em', textShadow: '0 0 10px rgba(255,100,100,0.8)' }}>
              DO NOT<br />PRESS
            </div>
          </div>
        </button>
      </div>

      <div style={{ color: '#444455', fontSize: 10, fontFamily: 'monospace', marginBottom: 24 }}>
        Hold for 2 seconds to awaken
      </div>

      {/* Mode selector */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ color: '#333355', fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>MODE</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {MODES.map(m => (
            <button key={m} onClick={() => onModeChange(m)}
              style={{
                padding: '6px 14px', borderRadius: 4,
                background: selectedMode === m ? '#1a0010' : 'transparent',
                border: `1px solid ${selectedMode === m ? '#550033' : '#222233'}`,
                color: selectedMode === m ? '#ff88aa' : '#444466',
                fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
              }}>
              <div style={{ fontWeight: 'bold' }}>{m}</div>
              <div style={{ fontSize: 9, color: selectedMode === m ? '#cc6688' : '#333355' }}>{MODE_DESCRIPTIONS[m]}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ color: '#333355', fontSize: 10, fontFamily: 'monospace', borderTop: '1px solid #1a1a2e', paddingTop: 16, maxWidth: 400, margin: '0 auto' }}>
        Truth must pass. Actions are logged. Dangerous mutations require approval.
      </div>
    </div>
  );
}

// ── Active Panel ───────────────────────────────────────────────────────────────

function ActivePanel({ data, onStop }: { data: AwakenStatus; onStop: () => void }) {
  const [activeTab, setActiveTab] = useState<'runtime' | 'growth' | 'companions' | 'stress' | 'selfimproving'>('runtime');
  const [confirmed, setConfirmed] = useState(false);

  const tabs = [
    { id: 'runtime' as const, label: 'Runtime' },
    { id: 'growth' as const, label: 'Growth' },
    { id: 'companions' as const, label: 'Companions' },
    { id: 'stress' as const, label: 'STRESS' },
    { id: 'selfimproving' as const, label: 'Self-Improve' },
  ];

  return (
    <div>
      {/* Run info */}
      <div style={{ background: '#080812', border: '1px solid #1a0022', borderRadius: 6, padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div><span style={{ color: '#444466', fontSize: 10, fontFamily: 'monospace' }}>RUN </span><span style={{ color: '#aabbcc', fontFamily: 'monospace', fontSize: 11 }}>{data.run_id || '—'}</span></div>
          <div><span style={{ color: '#444466', fontSize: 10, fontFamily: 'monospace' }}>MODE </span><span style={{ color: '#cc88ff', fontFamily: 'monospace', fontSize: 11 }}>{data.mode}</span></div>
          <div><span style={{ color: '#444466', fontSize: 10, fontFamily: 'monospace' }}>TRUTH </span><TruthBadge state={data.truth_state} /></div>
          <div><span style={{ color: '#444466', fontSize: 10, fontFamily: 'monospace' }}>WRITES </span><span style={{ color: '#aabbcc', fontFamily: 'monospace', fontSize: 11 }}>{data.writes_allowed}</span></div>
          <div><span style={{ color: '#444466', fontSize: 10, fontFamily: 'monospace' }}>STATUS </span><StatusBadge status={data.status} /></div>
        </div>
      </div>

      {/* Stop */}
      <div style={{ marginBottom: 16, textAlign: 'center' }}>
        {!confirmed ? (
          <button onClick={() => setConfirmed(true)}
            style={{ padding: '8px 20px', background: 'transparent', border: '1px solid #330022', borderRadius: 6, color: '#884466', fontSize: 12, fontFamily: 'monospace', cursor: 'pointer' }}>
            STOP AWAKEN
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
            <span style={{ color: '#664455', fontSize: 11, fontFamily: 'monospace' }}>Confirm stop?</span>
            <button onClick={onStop}
              style={{ padding: '6px 14px', background: '#1a0000', border: '1px solid #ff4444', borderRadius: 6, color: '#ff8888', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
              YES, STOP
            </button>
            <button onClick={() => setConfirmed(false)}
              style={{ padding: '6px 14px', background: 'transparent', border: '1px solid #333355', borderRadius: 6, color: '#555577', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
              NO
            </button>
          </div>
        )}
      </div>

      {/* Evidence path */}
      {data.evidence_path && (
        <div style={{ background: '#050510', border: '1px solid #111133', borderRadius: 4, padding: '6px 12px', marginBottom: 12, fontFamily: 'monospace', fontSize: 10, color: '#444466' }}>
          Evidence: <span style={{ color: '#3a3a5a' }}>{data.evidence_path}</span>
          {data.report_path && <span style={{ marginLeft: 16 }}>Report: <span style={{ color: '#3a3a5a' }}>{data.report_path}</span></span>}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1a1a2e', marginBottom: 16 }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px', background: 'transparent', border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #8800cc' : '2px solid transparent',
              color: activeTab === tab.id ? '#cc88ff' : '#444466',
              fontSize: 11, fontFamily: 'monospace', cursor: 'pointer', letterSpacing: '0.05em',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ minHeight: 300 }}>
        {activeTab === 'runtime' && (
          <div>
            <div style={{ color: '#444466', fontSize: 10, marginBottom: 12, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Recent Events</div>
            <EventFeed events={data.recent_events} />
          </div>
        )}
        {activeTab === 'growth' && <GrowthCard feed={data.feeds?.growth || {}} />}
        {activeTab === 'companions' && <CompanionCard feed={data.feeds?.companion_cognitive || {}} />}
        {activeTab === 'stress' && <StressCard feed={data.feeds?.stress || {}} />}
        {activeTab === 'selfimproving' && <SelfImprovingCard feed={data.feeds?.self_improving || {}} />}
      </div>
    </div>
  );
}

// ── Feed Panel (always visible) ─────────────────────────────────────────────────

function FeedPanel({ data }: { data: AwakenStatus }) {
  const [activeTab, setActiveTab] = useState<'runtime' | 'growth' | 'companions' | 'stress' | 'selfimproving'>('runtime');

  const tabs = [
    { id: 'runtime' as const, label: 'Runtime' },
    { id: 'growth' as const, label: 'Growth' },
    { id: 'companions' as const, label: 'Companions' },
    { id: 'stress' as const, label: 'STRESS' },
    { id: 'selfimproving' as const, label: 'Self-Improve' },
  ];

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid #1a1a2e' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '6px 14px', background: 'transparent', border: 'none',
              borderBottom: `2px solid ${activeTab === tab.id ? '#ff6666' : 'transparent'}`,
              color: activeTab === tab.id ? '#ff8888' : '#444466',
              fontFamily: 'monospace', fontSize: 11, cursor: 'pointer', transition: 'all 0.15s',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {activeTab === 'runtime' && (
          <div>
            <div style={{ color: '#444466', fontSize: 10, marginBottom: 12, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Recent Events</div>
            <EventFeed events={data.recent_events} />
          </div>
        )}
        {activeTab === 'growth' && <GrowthCard feed={data.feeds?.growth || {}} />}
        {activeTab === 'companions' && <CompanionCard feed={data.feeds?.companion_cognitive || {}} />}
        {activeTab === 'stress' && <StressCard feed={data.feeds?.stress || {}} />}
        {activeTab === 'selfimproving' && <SelfImprovingCard feed={data.feeds?.self_improving || {}} />}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AwakenPage() {
  const [data, setData] = useState<AwakenStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMode, setSelectedMode] = useState('work');
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/awaken/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleStart = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/awaken/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: selectedMode }),
      });
      const json = await res.json();
      if (!json.ok) setError(json.error);
    } catch (err) {
      setError(String(err));
    }
    setTimeout(fetchStatus, 500);
  };

  const handleStop = async () => {
    try {
      await fetch('/api/awaken/stop', { method: 'POST' });
      setTimeout(fetchStatus, 500);
    } catch (err) {
      setError(String(err));
    }
  };

  const isActive = data?.status === 'active';

  return (
    <CockpitShell><div style={{ minHeight: '100vh', background: '#060610', color: '#c0c0d0', fontFamily: 'system-ui, sans-serif', padding: '0 0 60px 0' }}>
      {/* Top bar */}
      <div style={{ background: '#08080f', borderBottom: '1px solid #111122', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18 }}>🔴</span>
          <span style={{ color: '#8888aa', fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.05em' }}>PURPCLAW / AWAKEN</span>
          <StatusBadge status={data?.status || 'unknown'} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {data && (
            <span style={{ color: '#333355', fontSize: 10, fontFamily: 'monospace' }}>
              {data.total_runs} runs · last {data.last_run_at ? new Date(data.last_run_at).toLocaleString() : 'never'}
            </span>
          )}
          <button onClick={fetchStatus}
            style={{ background: 'transparent', border: '1px solid #222244', borderRadius: 4, color: '#444466', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer', padding: '4px 10px' }}>
            ↻
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#1a0000', border: '1px solid #ff4444', borderRadius: 4, padding: '8px 16px', margin: '16px 24px', fontFamily: 'monospace', fontSize: 11, color: '#ff8888' }}>
          Error: {error}
        </div>
      )}

      {/* Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        {loading && !data ? (
          <div style={{ textAlign: 'center', paddingTop: 80, color: '#333355', fontFamily: 'monospace', fontSize: 12 }}>Loading...</div>
        ) : isActive ? (
          <ActivePanel data={data!} onStop={handleStop} />
        ) : (
          <IdleScreen
            totalRuns={data?.total_runs || 0}
            lastRun={data?.last_run_at || null}
            onStart={handleStart}
            selectedMode={selectedMode}
            onModeChange={setSelectedMode}
          />
        )}
      </div>

      {/* Feed panels — always visible when data exists so user can inspect state in idle */}
      {data && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 32px' }}>
          <div style={{ borderTop: '1px solid #1a1a2e', paddingTop: 24 }}>
            <FeedPanel data={data} />
          </div>
        </div>
      )}
    </div>
    </CockpitShell>
  );
}
