/* cinematic.jsx — TimelineRibbon, FloorActivityPulses, HeaderSparkline */

const { useState: useS_c, useEffect: useE_c, useMemo: useM_c, useRef: useR_c } = React;

// ─────────────────────────────────────────────────────────────
// WorkflowRibbon — persistent timeline at bottom of viewport
// ─────────────────────────────────────────────────────────────
function WorkflowRibbon({ onSelectWorkflow, onJumpToDelegation, visible = true }) {
  const { pipeline, anyConnected } = useData();
  if (!visible) return null;

  const active = pipeline?.active || [];
  const completed = (pipeline?.completed || []).slice(0, 6);

  // span = the time window we're showing (5 min back, into now)
  const now = Date.now();
  const SPAN = 5 * 60 * 1000;
  const start = now - SPAN;

  const lanes = [...active.map(w => ({ ...w, _alive: true })), ...completed.map(w => ({ ...w, _alive: false }))];

  return (
    <div className="ribbon">
      <div className="ribbon-h">
        <div className="ribbon-h-l">
          <span className="ribbon-tag">workflow timeline</span>
          <span className="ribbon-sub">last 5 min · {active.length} active · {completed.length} archived</span>
        </div>
        <div className="ribbon-h-r">
          <span className="ribbon-now">
            <span className="ribbon-now-dot" />now
          </span>
        </div>
      </div>
      <div className="ribbon-body">
        {!anyConnected ? (
          <div className="ribbon-empty">backend offline — no workflow data</div>
        ) : lanes.length === 0 ? (
          <div className="ribbon-empty">no workflows in flight or recently archived</div>
        ) : (
          <div className="ribbon-lanes">
            {/* grid scale */}
            <div className="ribbon-scale">
              {[5, 4, 3, 2, 1, 0].map(m => (
                <div key={m} className="ribbon-tick" style={{ left: `${((SPAN - m * 60000) / SPAN) * 100}%` }}>
                  <span className="ribbon-tick-l">{m === 0 ? 'now' : `−${m}m`}</span>
                </div>
              ))}
            </div>
            {lanes.map(wf => {
              const startMs = wf.startTime ? new Date(wf.startTime).getTime() : now - 30000;
              const endMs = wf.endTime ? new Date(wf.endTime).getTime() : now;
              const leftPct = Math.max(0, ((startMs - start) / SPAN) * 100);
              const widthPct = Math.max(2, ((Math.min(endMs, now) - Math.max(startMs, start)) / SPAN) * 100);
              const status = String(wf.status || '').toLowerCase();
              const tone = status === 'running' ? 'var(--cyan)'
                         : status === 'completed' ? 'var(--emerald)'
                         : status === 'failed' ? 'var(--red)'
                         : 'var(--text-3)';
              return (
                <button
                  key={wf.id}
                  className="ribbon-bar"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    borderColor: tone,
                    background: `linear-gradient(90deg, ${tone}28, ${tone}10)`,
                    boxShadow: wf._alive ? `0 0 12px ${tone}55, inset 0 0 8px ${tone}22` : 'none',
                  }}
                  onClick={() => { onSelectWorkflow?.(wf.id); onJumpToDelegation?.(); }}
                  title={`${wf.id} · ${wf.intent || wf.target}`}
                >
                  <span className="ribbon-bar-id" style={{ color: tone }}>{wf.id?.slice(-6)}</span>
                  <span className="ribbon-bar-label">{wf.intent || wf.target || ''}</span>
                  {wf._alive && wf.steps && (
                    <span className="ribbon-bar-prog" style={{
                      width: `${(wf.steps.completed / Math.max(wf.steps.total, 1)) * 100}%`,
                      background: tone,
                    }} />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HeaderSparkline — small line of event rate
// ─────────────────────────────────────────────────────────────
function HeaderSparkline({ width = 110, height = 24, color = '#22d3ee' }) {
  const { stream } = useData();
  const [series, setSeries] = useS_c([]);

  // rebuild series each tick from events timestamped within window
  useE_c(() => {
    const t = setInterval(() => {
      const now = Date.now();
      const WINDOW = 30000; // 30s
      const BINS = 20;
      const bin = WINDOW / BINS;
      const counts = Array(BINS).fill(0);
      for (const ev of stream.events) {
        const time = ev._time?.getTime?.() || (ev._time ? new Date(ev._time).getTime() : 0);
        if (!time) continue;
        const age = now - time;
        if (age < 0 || age > WINDOW) continue;
        const idx = Math.min(BINS - 1, Math.floor((WINDOW - age) / bin));
        counts[idx]++;
      }
      setSeries(counts);
    }, 800);
    return () => clearInterval(t);
  }, [stream.events]);

  const max = Math.max(1, ...series);
  const step = width / Math.max(1, series.length - 1);
  const points = series.map((v, i) => `${i * step},${height - (v / max) * height}`).join(' ');

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {series.length > 1 && (
        <>
          <polygon
            points={`0,${height} ${points} ${width},${height}`}
            fill="url(#sparkFill)"
          />
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth={1.3}
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          />
          <circle cx={width} cy={height - (series[series.length - 1] / max) * height} r={2.5} fill={color}
            style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
        </>
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// useFloorActivity — derive per-floor activity pulses from SSE events
// returns map: { floorId → { intensity 0..1, lastEventAt } }
// ─────────────────────────────────────────────────────────────
function useFloorActivity() {
  const { stream, agents, floors } = useData();
  const [pulses, setPulses] = useS_c({});

  useE_c(() => {
    if (stream.events.length === 0) return;
    const newest = stream.events[0];
    const t = newest._time?.getTime?.() || Date.now();
    // map event to floor via agent name lookup
    const agentName = newest.agentName || newest.name || newest.from;
    if (!agentName) return;
    const agent = agents.find(a => a.name === agentName);
    if (!agent) return;
    setPulses(prev => ({
      ...prev,
      [agent.floor]: { intensity: 1, lastEventAt: t },
    }));
  }, [stream.events.length, agents]);

  // decay
  useE_c(() => {
    const t = setInterval(() => {
      setPulses(prev => {
        const next = {};
        const now = Date.now();
        for (const [floorId, info] of Object.entries(prev)) {
          const age = now - info.lastEventAt;
          if (age > 4000) continue;
          next[floorId] = { ...info, intensity: Math.max(0, 1 - age / 4000) };
        }
        return next;
      });
    }, 250);
    return () => clearInterval(t);
  }, []);

  return pulses;
}

Object.assign(window, { WorkflowRibbon, HeaderSparkline, useFloorActivity });
