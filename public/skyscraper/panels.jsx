/* panels.jsx — all tab content. REAL data only via useData(). */

const { useState: useS_p, useEffect: useE_p, useMemo: useM_p, useRef: useR_p } = React;

// ─────────────────────────────────────────────────────────────
// shared bits
// ─────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, accent, big }) {
  return (
    <div className="metric" style={{ '--accent': accent || 'var(--cyan)' }}>
      <div className="metric-lbl">{label}</div>
      <div className="metric-val" style={{ color: accent || 'var(--cyan)', textShadow: `0 0 10px ${accent || 'var(--cyan)'}55`, fontSize: big ? 30 : 22 }}>
        {value}
      </div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

function StatusPill({ ok, label, sub }) {
  return (
    <span className="pill mono" style={{ color: ok ? 'var(--emerald)' : 'var(--red)' }}>
      <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'currentColor', boxShadow: '0 0 6px currentColor', marginRight: 6, verticalAlign: 'middle' }} />
      {label}{sub && <span style={{ marginLeft: 6, color: 'var(--text-3)' }}>{sub}</span>}
    </span>
  );
}

function formatTs(ts) {
  if (!ts) return '—';
  try {
    const d = typeof ts === 'string' ? new Date(ts) : ts;
    return d.toLocaleTimeString('en-US', { hour12: false });
  } catch { return String(ts).slice(0, 8); }
}

function ageMs(then) {
  if (!then) return 0;
  try { return Date.now() - new Date(then).getTime(); } catch { return 0; }
}
function ageHuman(ms) {
  if (!ms || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms/60000)}m`;
  return `${Math.floor(ms/3600000)}h`;
}

// ─────────────────────────────────────────────────────────────
// Overview tab — REAL
// ─────────────────────────────────────────────────────────────
function OverviewTab() {
  const { mission, agents, services, stream, mochi, anyConnected, pipeline } = useData();
  const onlineSvc = services.filter(s => s.status === 'online').length;
  const working   = agents.filter(a => a.status === 'working').length;
  const errors    = agents.filter(a => a.status === 'error').length;
  const activeWf  = pipeline?.active?.length || 0;
  const compWf    = pipeline?.completed?.length || 0;

  // events-per-second from rolling 10s window
  const [eps, setEps] = useS_p(0);
  const eventTimesRef = useR_p([]);
  useE_p(() => {
    eventTimesRef.current.push(Date.now());
    eventTimesRef.current = eventTimesRef.current.filter(t => Date.now() - t < 10000);
  }, [stream.events.length]);
  useE_p(() => {
    const t = setInterval(() => {
      const w = eventTimesRef.current.filter(t => Date.now() - t < 10000);
      setEps((w.length / 10).toFixed(1));
    }, 500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="tab-pane" style={{ gridTemplateColumns: '1.4fr 1fr', gridTemplateRows: 'auto 1fr 1fr' }}>
      <div className="panel" style={{ gridColumn: 'span 2', minHeight: 140 }}>
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">mission shell</span>
            <span className="panel-title">PURPCLAW · Command Deck</span>
          </div>
          <StatusPill ok={anyConnected} label={anyConnected ? 'OPERATIONAL' : 'OFFLINE'} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, padding: 12 }}>
          <MetricCard label="Services"   value={anyConnected ? `${onlineSvc}/${services.length}` : '—'} sub="real endpoints" accent="var(--emerald)" big />
          <MetricCard label="Working"    value={anyConnected ? working : '—'}    sub={anyConnected ? `${agents.length} total` : ''} accent="var(--cyan)" big />
          <MetricCard label="Workflows"  value={anyConnected ? activeWf : '—'}    sub={anyConnected ? `${compWf} archived` : ''} accent="var(--purple)" big />
          <MetricCard label="Events / s" value={anyConnected ? eps : '—'}         sub="rolling 10s" accent="var(--azure)" big />
          <MetricCard label="Faults"     value={anyConnected ? errors : '—'}      sub="agents in error" accent={errors ? 'var(--red)' : 'var(--emerald)'} big />
          <MetricCard label="Mochi"      value={mochi.connected ? (mochi.data?.mood || 'on') : '—'} sub={mochi.data?.species || 'companion'} accent="var(--pink)" big />
        </div>
      </div>

      {/* recent stream events */}
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">signal rail</span>
            <span className="panel-title">Live stream</span>
          </div>
          <span className="mono tiny" style={{ color: stream.events.length ? 'var(--emerald)' : 'var(--text-3)' }}>
            {stream.events.length} buffered
          </span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {stream.events.length === 0 ? (
            <EmptyState icon="≡" title="no events" hint="SSE streams not connected. start the stack with `purpclaw start`." />
          ) : stream.events.slice(0, 18).map(ev => (
            <div key={ev._id} className={`event ${eventTone(ev)}`}>
              <span className="event-time">{formatTs(ev._time)}</span>
              <span className="event-src">{ev._source}</span>
              <span className="event-msg">{eventLabel(ev)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* service mesh — enhanced with latency sparklines */}
      <ServiceMeshEnhanced />

      {/* active workflows summary */}
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">in flight</span>
            <span className="panel-title">Workflows</span>
          </div>
          <span className="mono tiny muted">{activeWf} active / {compWf} done</span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!pipeline ? (
            <EmptyState icon="◫" title="orchestrator offline" hint="/api/pipeline is not responding. start orchestrator on :7784." />
          ) : (pipeline.active || []).length === 0 && (pipeline.completed || []).length === 0 ? (
            <EmptyState icon="◌" title="no workflows yet" hint="send a command via the chat composer to start one." />
          ) : (
            <>
              {(pipeline.active || []).map(wf => <WorkflowMiniCard key={wf.id} wf={wf} />)}
              {(pipeline.completed || []).slice(0, 4).map(wf => <WorkflowMiniCard key={wf.id} wf={wf} dim />)}
            </>
          )}
        </div>
      </div>

      {/* mochi */}
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">companion</span>
            <span className="panel-title">Mochi</span>
          </div>
          {mochi.connected ? <StatusPill ok label={mochi.data?.mood || 'on'} /> : <StatusPill ok={false} label="OFFLINE" />}
        </div>
        <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14, alignItems: 'center' }}>
          {!mochi.connected || !mochi.data ? (
            <div style={{ gridColumn: 'span 2' }}>
              <EmptyState icon="♥" title="no mochi hatched" hint="run `purpclaw mochi hatch` to give your companion a face." />
            </div>
          ) : (
            <>
              <div style={{
                aspectRatio: '1 / 1',
                border: '1px solid var(--line-2)',
                borderRadius: 12,
                background: 'radial-gradient(circle, rgba(168, 85, 247, 0.2), transparent)',
                display: 'grid', placeItems: 'center', fontSize: 48,
                textShadow: '0 0 20px var(--purple)',
              }}>
                {mochiEmoji(mochi.data)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <KV k="name" v={mochi.data.name} />
                <KV k="species" v={mochi.data.species} />
                <KV k="rarity" v={mochi.data.rarity || 'common'} color="var(--purple)" />
                <KV k="interactions" v={mochi.data.interactions ?? 0} color="var(--cyan)" />
                <KV k="hatched" v={formatTs(mochi.data.hatchedAt)} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function KV({ k, v, color }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span className="mono tiny upper muted">{k}</span>
      <span className="mono" style={{ color: color || 'var(--text)' }}>{v}</span>
    </div>
  );
}

function WorkflowMiniCard({ wf, dim }) {
  const status = String(wf.status || 'unknown').toLowerCase();
  const tone = status === 'running' ? 'var(--cyan)'
             : status === 'completed' ? 'var(--emerald)'
             : status === 'failed' ? 'var(--red)'
             : 'var(--text-3)';
  return (
    <div style={{
      padding: '8px 10px',
      background: 'var(--panel-2)',
      border: `1px solid ${dim ? 'var(--line-soft)' : tone + '40'}`,
      borderRadius: 6, opacity: dim ? 0.65 : 1,
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 8,
    }}>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8, marginBottom: 4 }}>
          <span style={{ color: tone, fontFamily: 'var(--font-mono)', fontSize: 10 }}>{wf.id}</span>
          <span className="mono tiny upper" style={{ color: tone, opacity: 0.8 }}>{status}</span>
        </div>
        <div style={{ color: 'var(--text-2)', fontSize: 11, lineHeight: 1.4 }}>{wf.intent || wf.target || '(no intent)'}</div>
      </div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)' }}>
        {wf.steps ? `${wf.steps.completed}/${wf.steps.total}` : (wf.duration ? `${(wf.duration/1000).toFixed(1)}s` : '—')}
      </div>
    </div>
  );
}

function mochiEmoji(m) {
  const SPECIES_EMOJI = {
    duck: '🦆', goose: '🪿', blob: '🟣', cat: '🐱', dragon: '🐉',
    octopus: '🐙', owl: '🦉', penguin: '🐧', turtle: '🐢', snail: '🐌',
    ghost: '👻', axolotl: '🦎', capybara: '🐹', cactus: '🌵', robot: '🤖',
    rabbit: '🐰', mushroom: '🍄', chonk: '🐻',
  };
  return SPECIES_EMOJI[m?.species] || '◉';
}

function eventTone(ev) {
  const t = String(ev.type || '').toLowerCase();
  if (t.includes('error') || t.includes('failed') || t.includes('killed')) return 'err';
  if (t.includes('warn'))  return 'warn';
  if (t.includes('complete') || t.includes('success') || t.includes('spawned')) return 'ok';
  return 'info';
}

function eventLabel(ev) {
  if (ev.type === 'agent_spawned') return `${ev.emoji || ''} ${ev.name || ev.agentName || 'agent'} spawned${ev.task ? ': ' + String(ev.task).slice(0, 80) : ''}`;
  if (ev.type === 'agent_complete' || ev.type === 'agent_completed') return `${ev.emoji || ''} ${ev.agentName || 'agent'} completed${ev.code != null ? ` · exit ${ev.code}` : ''}`;
  if (ev.type === 'agent_output' || ev.type === 'agent_log') return `${ev.emoji || ''} ${ev.agentName || 'agent'}: ${String(ev.output || ev.message || '').slice(0, 120)}`;
  if (ev.type === 'agent_killed') return `${ev.emoji || ''} ${ev.name || 'agent'} killed`;
  if (ev.type === 'ball_voice_command') return `🎤 "${ev.command || ''}"`;
  if (ev.type === 'ball_auto_spawn') return `⚡ auto-deployed ${ev.agentName || ev.name}`;
  if (ev.topic) return `${ev.topic}${ev.agentName ? ' · ' + ev.agentName : ''}`;
  if (ev.message) return String(ev.message).slice(0, 140);
  if (ev.raw) return ev.raw;
  return String(ev.type || JSON.stringify(ev)).slice(0, 140);
}

// ─────────────────────────────────────────────────────────────
// Delegation tab — REAL real-time flow
// ─────────────────────────────────────────────────────────────
function useWorkflowDetail(workflowId) {
  const [detail, setDetail] = useS_p(null);
  useE_p(() => {
    if (!workflowId) { setDetail(null); return; }
    let cancelled = false;
    async function tick() {
      const d = await tryProxy(7784, `/api/workflow/${encodeURIComponent(workflowId)}`);
      if (!cancelled) setDetail(d || null);
    }
    tick();
    const t = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(t); };
  }, [workflowId]);
  return detail;
}

function DelegationTab() {
  const { pipeline, stream, mission, anyConnected } = useData();
  const [selected, setSelected] = useS_p(null);

  const active    = pipeline?.active || [];
  const completed = pipeline?.completed || [];

  useE_p(() => {
    if (!selected && active.length > 0) setSelected(active[0].id);
  }, [active, selected]);

  const baseWf  = active.find(w => w.id === selected) || completed.find(w => w.id === selected);
  const detail  = useWorkflowDetail(selected);
  const wf      = detail || baseWf;

  // filter stream events to those mentioning this workflow id (best effort)
  const wfEvents = useM_p(() => {
    if (!selected) return [];
    return stream.events.filter(ev => {
      const blob = JSON.stringify(ev).toLowerCase();
      return blob.includes(String(selected).toLowerCase());
    });
  }, [stream.events, selected]);

  return (
    <div className="tab-pane" style={{ gridTemplateColumns: '280px 1fr 340px' }}>
      {/* left: workflow list */}
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">in flight</span>
            <span className="panel-title">Workflows</span>
          </div>
          <span className="pill" style={{ color: active.length ? 'var(--cyan)' : 'var(--text-3)' }}>{active.length}</span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!anyConnected ? (
            <EmptyState icon="◫" title="orchestrator offline" hint="start orchestrator on :7784 to see live workflows." />
          ) : !pipeline ? (
            <EmptyState icon="◌" title="no pipeline data" hint="orchestrator returned no /api/pipeline response yet." />
          ) : active.length === 0 && completed.length === 0 ? (
            <EmptyState icon="◌" title="pipeline empty" hint="send a command via chat composer or `purpclaw run` to seed a workflow." />
          ) : (
            <>
              {active.map(wfi => (
                <WorkflowListRow
                  key={wfi.id}
                  wf={wfi}
                  selected={selected === wfi.id}
                  onSelect={() => setSelected(wfi.id)}
                />
              ))}
              {completed.length > 0 && (
                <div style={{ marginTop: 8, padding: '4px 6px', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                  ─ recently completed ─
                </div>
              )}
              {completed.slice(0, 8).map(wfi => (
                <WorkflowListRow
                  key={wfi.id}
                  wf={wfi}
                  selected={selected === wfi.id}
                  onSelect={() => setSelected(wfi.id)}
                  dim
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* center: trace */}
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">live trace</span>
            <span className="panel-title">{wf ? wf.id : 'no workflow selected'}</span>
          </div>
          {wf && <span className="pill" style={{ color: wf.status === 'running' ? 'var(--cyan)' : wf.status === 'completed' ? 'var(--emerald)' : wf.status === 'failed' ? 'var(--red)' : 'var(--text-3)' }}>{wf.status}</span>}
        </div>
        <div className="panel-body">
          {!wf ? (
            <EmptyState icon="⟶" title="select a workflow" hint="pick one from the left to see its live trace." />
          ) : (
            <WorkflowTrace wf={wf} />
          )}
        </div>
      </div>

      {/* right: live events for this workflow */}
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">live events</span>
            <span className="panel-title">For {selected ? selected.slice(-8) : '—'}</span>
          </div>
          <span className="mono tiny muted">{wfEvents.length}</span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {!selected ? (
            <EmptyState icon="≡" title="—" hint="select a workflow to filter the live stream." />
          ) : wfEvents.length === 0 ? (
            <div style={{ padding: 14, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>
              waiting for events tagged with this workflow id. SSE stream connected, no matches yet.
            </div>
          ) : wfEvents.slice(0, 40).map(ev => (
            <div key={ev._id} className={`event ${eventTone(ev)}`}>
              <span className="event-time">{formatTs(ev._time)}</span>
              <span className="event-src">{ev._source}</span>
              <span className="event-msg">{eventLabel(ev)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkflowListRow({ wf, selected, onSelect, dim }) {
  const status = String(wf.status || '').toLowerCase();
  const tone = status === 'running' ? 'var(--cyan)'
             : status === 'completed' ? 'var(--emerald)'
             : status === 'failed' ? 'var(--red)'
             : 'var(--text-3)';
  return (
    <button onClick={onSelect} style={{
      textAlign: 'left',
      padding: '10px 12px',
      background: selected ? `${tone}12` : 'var(--panel-2)',
      border: `1px solid ${selected ? tone : 'var(--line-soft)'}`,
      borderRadius: 6,
      opacity: dim && !selected ? 0.6 : 1,
      cursor: 'pointer',
      display: 'flex', flexDirection: 'column', gap: 4,
      boxShadow: selected ? `0 0 12px ${tone}30` : 'none',
    }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span style={{ color: tone, fontFamily: 'var(--font-mono)', fontSize: 10 }}>{wf.id}</span>
        <span style={{ color: tone, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{status}</span>
      </div>
      <div style={{ color: 'var(--text-2)', fontSize: 11.5, lineHeight: 1.4 }}>{wf.intent || wf.target || '(no intent)'}</div>
      {wf.steps && (
        <div style={{ marginTop: 4, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            width: `${(wf.steps.completed / Math.max(wf.steps.total, 1)) * 100}%`,
            height: '100%', background: tone, boxShadow: `0 0 6px ${tone}`,
          }} />
        </div>
      )}
    </button>
  );
}

function WorkflowTrace({ wf }) {
  const trace = wf.trace || [];
  const delegation = wf.delegation || null;
  const route = wf.route || null;
  const plan = wf.plan || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* intent header */}
      <div style={{ padding: 14, background: 'var(--panel-2)', borderRadius: 8, border: '1px solid var(--line)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>intent</div>
        <div style={{ color: 'var(--text)', fontSize: 14, lineHeight: 1.5 }}>{wf.intent || wf.target || '(no intent)'}</div>
        {wf.target && wf.target !== wf.intent && (
          <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>target: {wf.target}</div>
        )}
      </div>

      {/* delegation summary */}
      {delegation && (
        <div style={{
          padding: 12, borderRadius: 8,
          background: 'rgba(168, 85, 247, 0.04)',
          border: '1px solid rgba(168, 85, 247, 0.25)',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: 8 }}>delegation</div>
          {delegation.mode === 'team' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="mono tiny upper muted">team led by</span>
                <span style={{ color: 'var(--purple)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{delegation.leader}</span>
              </div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                <span className="mono tiny upper muted">members:</span>
                {(delegation.members || []).map(m => (
                  <span key={m} className="pill mono" style={{ color: 'var(--cyan)', fontSize: 10 }}>{m}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="row" style={{ gap: 8 }}>
              <span className="mono tiny upper muted">solo agent</span>
              <span style={{ color: 'var(--purple)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{delegation.selectedAgent || delegation.agent || '—'}</span>
            </div>
          )}
        </div>
      )}

      {/* plan (if available) */}
      {plan && plan.length > 0 && (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>plan</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(plan.length, 6)}, 1fr)`, gap: 6 }}>
            {plan.map(step => (
              <div key={step.order} style={{
                padding: 8, background: 'var(--panel-2)', border: '1px solid var(--line-soft)', borderRadius: 6,
                fontFamily: 'var(--font-mono)', fontSize: 10,
              }}>
                <div style={{ color: 'var(--cyan)' }}>{String(step.order).padStart(2, '0')} · {step.stage}</div>
                <div style={{ color: 'var(--text-2)', marginTop: 4 }}>{step.operation}</div>
                {step.leader && <div style={{ color: 'var(--purple)', marginTop: 4 }}>↳ {step.leader}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* live trace stream */}
      <div>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)' }}>trace · live</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)' }}>{trace.length} steps</span>
        </div>
        {trace.length === 0 ? (
          <div style={{ padding: 14, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, textAlign: 'center' }}>
            no trace entries yet. the orchestrator emits trace events as the workflow progresses.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {trace.map((step, i) => {
              const stageTone = step.status === 'failed' ? 'var(--red)'
                              : step.status === 'completed' || step.status === 'succeeded' ? 'var(--emerald)'
                              : step.status === 'started' || step.status === 'running' ? 'var(--cyan)'
                              : 'var(--text-3)';
              return (
                <div key={i} style={{
                  display: 'grid',
                  gridTemplateColumns: '64px 110px 130px 1fr',
                  gap: 10,
                  padding: '8px 10px',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line-soft)',
                  borderLeft: `3px solid ${stageTone}`,
                  borderRadius: 6,
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                }}>
                  <span style={{ color: 'var(--text-mute)' }}>{formatTs(step.timestamp)}</span>
                  <span style={{ color: 'var(--cyan)' }}>{step.stage || '—'}</span>
                  <span style={{ color: stageTone }}>{step.status || '—'}</span>
                  <span style={{ color: 'var(--text-2)' }}>
                    {step.agentName && <span style={{ color: 'var(--purple)' }}>{step.agentName} · </span>}
                    {step.detail || '(no detail)'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* result */}
      {wf.result && (
        <div style={{ padding: 12, background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 8 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--emerald)', marginBottom: 6 }}>result</div>
          <div style={{ color: 'var(--text-2)', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{wf.result}</div>
        </div>
      )}
      {wf.error && (
        <div style={{ padding: 12, background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--red)', marginBottom: 6 }}>error</div>
          <div style={{ color: 'var(--text-2)', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{wf.error}</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Workflows tab — REAL
// ─────────────────────────────────────────────────────────────
function WorkflowsTab() {
  const { pipeline, anyConnected } = useData();
  const active    = pipeline?.active    || [];
  const completed = pipeline?.completed || [];

  return (
    <div className="tab-pane" style={{ gridTemplateColumns: '1fr', gridTemplateRows: '1fr 1fr', gap: 10 }}>
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">pipeline</span>
            <span className="panel-title">Active · {active.length}</span>
          </div>
          {pipeline?.metrics && (
            <span className="mono tiny muted">
              total {pipeline.metrics.total || 0} · done {pipeline.metrics.completed || 0} · failed {pipeline.metrics.failed || 0}
            </span>
          )}
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!anyConnected ? <EmptyState icon="◫" title="orchestrator offline" />
            : !pipeline ? <EmptyState icon="◌" title="no pipeline endpoint" />
            : active.length === 0 ? <EmptyState icon="◌" title="nothing active" hint="send a command via chat composer." />
            : active.map(wf => <WorkflowFullCard key={wf.id} wf={wf} />)}
        </div>
      </div>
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">archive</span>
            <span className="panel-title">Recently complete · {completed.length}</span>
          </div>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {completed.length === 0 ? <EmptyState icon="◌" title="no completed workflows yet" />
            : completed.slice(0, 20).map(wf => <WorkflowFullCard key={wf.id} wf={wf} />)}
        </div>
      </div>
    </div>
  );
}

function WorkflowFullCard({ wf }) {
  const status = String(wf.status || '').toLowerCase();
  const tone = status === 'running' ? 'var(--cyan)'
             : status === 'completed' ? 'var(--emerald)'
             : status === 'failed' ? 'var(--red)'
             : 'var(--text-3)';
  const trace = wf.trace || [];
  return (
    <div style={{
      border: '1px solid var(--line)',
      borderRadius: 10,
      padding: 12,
      background: 'var(--panel-2)',
    }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="row">
          <span className="mono" style={{ color: tone, fontSize: 12 }}>{wf.id}</span>
          <span className="pill" style={{ color: tone }}>{status}</span>
        </div>
        <span className="mono tiny muted">{wf.duration ? `${(wf.duration/1000).toFixed(1)}s` : (wf.startTime ? ageHuman(ageMs(wf.startTime)) : '—')}</span>
      </div>
      <div style={{ color: 'var(--text)', fontSize: 13, marginBottom: 12 }}>{wf.intent || wf.target}</div>
      {trace.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(trace.length, 6)}, 1fr)`, gap: 4 }}>
          {trace.slice(0, 6).map((step, i) => {
            const stTone = step.status === 'failed' ? 'var(--red)'
                         : step.status === 'completed' || step.status === 'succeeded' ? 'var(--emerald)'
                         : step.status === 'started' || step.status === 'running' ? 'var(--cyan)'
                         : 'var(--text-3)';
            return (
              <div key={i} style={{
                padding: '6px 8px',
                background: `${stTone}12`,
                border: `1px solid ${stTone}40`,
                borderRadius: 4,
                fontFamily: 'var(--font-mono)', fontSize: 10,
                textAlign: 'center',
              }}>
                <div style={{ color: 'var(--text-3)' }}>{String(i+1).padStart(2,'0')}</div>
                <div style={{ color: stTone, marginTop: 2 }}>{step.stage}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Messages tab — REAL (filtered stream)
// ─────────────────────────────────────────────────────────────
function MessagesTab() {
  const { stream, agents, anyConnected } = useData();
  const messages = stream.events.filter(ev => {
    const t = String(ev.type || '').toLowerCase();
    const topic = String(ev.topic || '').toLowerCase();
    return t.includes('message') || t === 'agent_output' || t === 'agent_log'
        || topic.includes('message') || topic.includes('chat');
  });

  return (
    <div className="tab-pane" style={{ gridTemplateColumns: '1fr 380px' }}>
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">inter-agent</span>
            <span className="panel-title">Message Stream</span>
          </div>
          <span className="mono tiny" style={{ color: messages.length ? 'var(--emerald)' : 'var(--text-3)' }}>{messages.length} buffered</span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {!anyConnected ? <EmptyState icon="✉" title="backend offline" />
            : messages.length === 0 ? <EmptyState icon="✉" title="no inter-agent traffic yet" hint="messages route through eventbus :7782 and tower SSE." />
            : messages.slice(0, 80).map(ev => (
              <div key={ev._id} style={{
                padding: '8px 10px',
                background: 'var(--panel-2)',
                border: '1px solid var(--line-soft)',
                borderLeft: `2px solid var(--cyan)`,
                borderRadius: 6,
                fontFamily: 'var(--font-mono)', fontSize: 10.5,
              }}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                  <div className="row" style={{ gap: 6 }}>
                    {ev.emoji && <span>{ev.emoji}</span>}
                    <span style={{ color: 'var(--cyan)' }}>{ev.agentName || ev.from || ev._source}</span>
                    {ev.to && <><span className="muted">→</span><span style={{ color: 'var(--purple)' }}>{ev.to}</span></>}
                  </div>
                  <span className="muted">{formatTs(ev._time)}</span>
                </div>
                <div style={{ color: 'var(--text-2)' }}>{eventLabel(ev)}</div>
              </div>
            ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">roster</span>
            <span className="panel-title">Agents · {agents.length}</span>
          </div>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {agents.length === 0 ? <EmptyState icon="◉" title="no agents" />
            : agents.slice(0, 60).map(a => {
              const m = divMeta(a.division);
              return (
                <div key={a.id} style={{
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8,
                  padding: '6px 8px',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line-soft)',
                  borderLeft: `2px solid ${m.color}`,
                  borderRadius: 6,
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                }}>
                  <span>{a.emoji}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--text)' }}>{a.name}</div>
                    <div style={{ color: m.color, fontSize: 9 }}>{m.name}</div>
                  </div>
                  <span style={{
                    color: a.status === 'working' ? 'var(--emerald)' : a.status === 'error' ? 'var(--red)' : 'var(--text-3)',
                    textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.16em',
                  }}>{a.status}</span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Gatekeeper tab — REAL
// ─────────────────────────────────────────────────────────────
function GatekeeperTab() {
  const { gatekeeper } = useData();
  const data = gatekeeper.data || {};
  const amendments = data.pendingAmendments || data.amendments || data.queue || [];
  const policies = data.policies || data.gates || [];

  return (
    <div className="tab-pane" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">approvals queue</span>
            <span className="panel-title">Pending</span>
          </div>
          <span className="pill" style={{ color: amendments.length ? 'var(--amber)' : 'var(--emerald)' }}>
            {gatekeeper.connected ? `${amendments.length} waiting` : 'OFFLINE'}
          </span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!gatekeeper.connected ? (
            <EmptyState icon="⚖" title="gatekeeper offline" hint="start gatekeeper on :7791 to surface pending approvals." />
          ) : amendments.length === 0 ? (
            <EmptyState icon="✓" title="no approvals pending" hint="all queued actions have been processed." color="var(--emerald)" />
          ) : amendments.map((a, i) => {
            const risk = String(a.risk || a.severity || 'med').toLowerCase();
            const tone = risk === 'high' ? 'var(--red)' : risk === 'med' || risk === 'medium' ? 'var(--amber)' : 'var(--emerald)';
            return (
              <div key={a.id || i} style={{
                border: `1px solid ${tone}`,
                borderRadius: 10,
                padding: 14,
                background: tone === 'var(--red)' ? 'rgba(239, 68, 68, 0.04)' : tone === 'var(--amber)' ? 'rgba(251, 191, 36, 0.04)' : 'rgba(16, 185, 129, 0.04)',
              }}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <div className="row">
                    <span className="pill mono" style={{ color: tone, borderColor: tone }}>RISK · {risk.toUpperCase()}</span>
                    {a.agent && <span className="mono tiny" style={{ color: 'var(--text-3)' }}>{a.agent}</span>}
                  </div>
                  <span className="mono tiny muted">{formatTs(a.timestamp || a.ts)}</span>
                </div>
                <div style={{ color: 'var(--text)', fontSize: 14, marginBottom: 12, lineHeight: 1.5 }}>
                  {a.description || a.summary || a.action || JSON.stringify(a).slice(0, 200)}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    onClick={() => approveAmendment(a.id, 'approve')}
                    style={{
                      flex: 1, padding: '8px 14px', borderRadius: 6,
                      background: 'rgba(16, 185, 129, 0.12)', border: '1px solid var(--emerald)',
                      color: 'var(--emerald)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em',
                    }}>APPROVE</button>
                  <button
                    onClick={() => approveAmendment(a.id, 'reject')}
                    style={{
                      flex: 1, padding: '8px 14px', borderRadius: 6,
                      background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--red)',
                      color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em',
                    }}>REJECT</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">notifications</span>
            <span className="panel-title">Outbound webhook</span>
          </div>
        </div>
        <div className="panel-body">
          <WebhookConfig />
        </div>
      </div>
    </div>
  );
}

async function approveAmendment(id, action) {
  try {
    await fetch('/api/gatekeeper-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amendmentId: id, action }),
    });
  } catch {}
}

// ─────────────────────────────────────────────────────────────
// Pool tab — REAL
// ─────────────────────────────────────────────────────────────
function PoolTab() {
  const { services, eventTimeline } = useData();
  const poolSvc = services.find(s => s.key === 'pool');
  const poolOnline = poolSvc?.status === 'online';

  // pool stats live query
  const [stats, setStats] = useS_p(null);
  useE_p(() => {
    let cancelled = false;
    async function tick() {
      const d = await tryProxy(7787, '/stats');
      if (!cancelled && d) setStats(d);
    }
    tick();
    const t = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const poolEvents = eventTimeline.events.filter(e => String(e.topic || '').includes('pool'));

  return (
    <div className="tab-pane" style={{ gridTemplateColumns: '1fr 360px' }}>
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">knowledge pool</span>
            <span className="panel-title">Query stream</span>
          </div>
          <span className="mono tiny" style={{ color: poolOnline ? 'var(--emerald)' : 'var(--red)' }}>
            {poolOnline ? `pool:7787 online · ${poolEvents.length} events` : 'pool offline'}
          </span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {!poolOnline ? <EmptyState icon="◉" title="pool service offline" hint="start the pool on :7787 to track who's querying what." />
            : poolEvents.length === 0 ? <EmptyState icon="◌" title="no pool queries observed" hint="agents query the pool when they need a skill or context. send a job to trigger one." />
            : poolEvents.map(ev => (
              <div key={ev.id} style={{
                padding: '8px 12px',
                background: 'var(--panel-2)',
                border: '1px solid var(--line-soft)',
                borderRadius: 6,
                display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: 10,
                fontFamily: 'var(--font-mono)', fontSize: 10.5,
              }}>
                <span className="muted">{formatTs(ev.ts)}</span>
                <span style={{ color: 'var(--cyan)' }}>{ev.agentName || ev.agentId || '—'}</span>
                <span style={{ color: 'var(--text-2)' }}>{ev.message || ev.topic}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">pool stats</span>
            <span className="panel-title">Knowledge map</span>
          </div>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!stats ? <EmptyState icon="◉" title="no stats" hint="pool /stats endpoint not responding." />
            : Object.entries(stats).slice(0, 8).map(([k, v]) => (
              <div key={k} style={{
                padding: 12, borderRadius: 8,
                background: 'var(--panel-2)', border: '1px solid var(--line-soft)',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{k}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, color: 'var(--cyan)', marginTop: 4, textShadow: '0 0 8px var(--cyan)' }}>
                  {typeof v === 'object' ? JSON.stringify(v).slice(0, 30) : String(v)}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CognitiveTab — enhanced: 7 cognitive services + Memory Matrix,
//   Symbolic Rules, Modal Logic, Neuro-Symbolic Bridge,
//   Autonomous Diagnostics, AutoDream (ported from older UI)
// ─────────────────────────────────────────────────────────────
const COG_SVC_LIST = [
  { name: 'Memory Matrix v2',        port: 7880, path: '/health',        key: 'memory' },
  { name: 'Neuro-Symbolic Bridge',   port: 7884, path: '/health',        key: 'bridge' },
  { name: 'Modal Logic Engine',      port: 7785, path: '/health',        key: 'modal'  },
  { name: 'Autonomous Diagnostics',  port: 7786, path: '/diagnose',      key: 'diag'   },
  { name: 'Symbolic Rules Engine',   port: 7787, path: '/health',        key: 'rules'  },
  { name: 'AutoDream Consolidation', port: 7895, path: '/dream/status',  key: 'dream'  },
  { name: 'Vision Monitor',          port: 7889, path: '/health',        key: 'vision' },
];

function CognitiveTab() {
  const [cogHealth, setCogHealth] = useS_p({});
  const [memStats,  setMemStats]  = useS_p(null);
  const [rulesStats,setRulesStats]= useS_p(null);
  const [modalStats,setModalStats]= useS_p(null);
  const [bridgeStats,setBridgeStats]= useS_p(null);
  const [dreamStats,setDreamStats]= useS_p(null);
  const [diagResult,setDiagResult]= useS_p(null);
  const [diagRunning,setDiagRunning]= useS_p(false);
  const [causalDot,setCausalDot]  = useS_p(null);
  const [memQuery,  setMemQuery]  = useS_p('');
  const [memResult, setMemResult] = useS_p(null);
  const [rulesQuery,setRulesQuery]= useS_p('');
  const [rulesResult,setRulesResult]= useS_p(null);
  // poll all cognitive services for health + stats
  useE_p(() => {
    let cancelled = false;
    async function poll() {
      const results = await Promise.all(COG_SVC_LIST.map(async s => {
        const start = Date.now();
        const d = await tryProxy(s.port, s.path, 2000);
        return { key: s.key, status: d ? 'online' : 'offline', latency: d ? Date.now() - start : null };
      }));
      if (!cancelled) { const m = {}; results.forEach(r => { m[r.key] = r; }); setCogHealth(m); }
      const [mem, modal, bridge, dream, rules] = await Promise.all([
        tryProxy(7880, '/stats', 2000), tryProxy(7785, '/status', 2000),
        tryProxy(7884, '/stats', 2000), tryProxy(7895, '/dream/status', 2000),
        tryProxy(7787, '/stats', 2000),
      ]);
      if (!cancelled) {
        if (mem)   setMemStats(mem);
        if (modal) setModalStats(modal);
        if (bridge) setBridgeStats(bridge);
        if (dream) setDreamStats(dream);
        if (rules) setRulesStats(rules);
      }
    }
    poll();
    const t = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const onlineCount = COG_SVC_LIST.filter(s => cogHealth[s.key]?.status === 'online').length;

  const recall = async () => {
    if (!memQuery.trim()) return;
    const r = await tryProxySend(7880, '/recall', { query: memQuery.trim() }, 4000);
    setMemResult(r || { error: 'Memory Matrix offline' });
  };
  const queryRules = async () => {
    if (!rulesQuery.trim()) return;
    const r = await tryProxySend(7787, '/query', { query: rulesQuery.trim() }, 4000);
    setRulesResult(r || { error: 'Rules engine offline' });
  };
  const inferRules = async () => {
    const inferPath = rulesQuery.trim() ? `/infer?query=${encodeURIComponent(rulesQuery.trim())}` : '/infer';
    const r = await tryProxy(7787, inferPath, 4000);
    setRulesResult(r || { error: 'Rules engine offline' });
  };
  const runDiag = async () => {
    setDiagRunning(true);
    const [d, v] = await Promise.all([tryProxy(7786, '/diagnose', 8000), tryProxy(7786, '/vote', 2000)]);
    setDiagResult({ ...(d || {}), votes: v });
    setDiagRunning(false);
  };
  const fetchCausal = async () => {
    const r = await tryProxy(7786, '/causal-graph/dot', 4000);
    setCausalDot(typeof r === 'string' ? r : (r ? JSON.stringify(r, null, 2) : '// Causal graph unavailable'));
  };

  const panelBlock = { padding: 14, borderRadius: 10, background: 'var(--panel-2)', border: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', gap: 10 };
  const inputCog = { flex: 1, padding: '6px 10px', borderRadius: 4, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none' };
  const cogBtn = (c = 'var(--cyan)') => ({ padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', background: `${c === 'var(--cyan)' ? 'rgba(34,211,238,0.08)' : c === 'var(--purple)' ? 'rgba(168,85,247,0.08)' : 'rgba(251,191,36,0.08)'}`, border: `1px solid ${c === 'var(--cyan)' ? 'rgba(34,211,238,0.35)' : c === 'var(--purple)' ? 'rgba(168,85,247,0.35)' : 'rgba(251,191,36,0.35)'}`, color: c });
  const statBox = (color) => ({ textAlign: 'center', padding: '6px 4px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', ...(color !== 'var(--text-2)' ? { border: `1px solid ${color}20` } : {}) });

  return (
    <div className="tab-pane" style={{ gridTemplateColumns: '1fr' }}>
      <div className="panel" style={{ overflow: 'auto' }}>
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">reasoning layer</span>
            <span className="panel-title">Cognitive Services</span>
          </div>
          <span className="mono tiny" style={{ color: onlineCount ? 'var(--emerald)' : 'var(--red)' }}>{onlineCount}/{COG_SVC_LIST.length} online</span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Service health grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 8 }}>
            {COG_SVC_LIST.map(svc => {
              const h = cogHealth[svc.key] || {};
              const tone = h.status === 'online' ? 'var(--emerald)' : h.status === 'offline' ? 'var(--red)' : 'var(--text-3)';
              return (
                <div key={svc.key} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--panel-2)', border: '1px solid var(--line-soft)', borderLeft: `2px solid ${tone}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: tone, boxShadow: h.status === 'online' ? `0 0 6px ${tone}` : 'none', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-2)', fontWeight: 500 }}>{svc.name}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-mute)' }}>:{svc.port}</div>
                  {h.latency != null && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>{h.latency}ms</div>}
                </div>
              );
            })}
          </div>

          {/* 2-col detailed panels */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

            {/* Memory Matrix */}
            <div style={panelBlock}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Memory Matrix v2</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {[['Atoms', memStats?.total_atoms, 'var(--cyan)'], ['Projections', memStats?.temporal_projections, 'var(--cyan)'], ['Branches', memStats?.counterfactual_branches, 'var(--cyan)']].map(([l, v, c]) => (
                  <div key={l} style={statBox(c)}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: c }}>{v ?? '—'}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', color: 'var(--text-3)', marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={memQuery} onChange={e => setMemQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && recall()} placeholder="Recall query..." style={inputCog} />
                <button onClick={recall} style={cogBtn('var(--emerald)')}>Recall</button>
              </div>
              {memResult && <pre style={{ margin: 0, padding: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 110, overflow: 'auto' }}>{JSON.stringify(memResult, null, 2)}</pre>}
            </div>

            {/* Symbolic Rules Engine */}
            <div style={panelBlock}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Symbolic Rules Engine</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {[['Facts', rulesStats?.total_facts, 'var(--purple)'], ['Rules', rulesStats?.total_rules, 'var(--purple)'], ['Derived', rulesStats?.derived_facts, 'var(--purple)']].map(([l, v, c]) => (
                  <div key={l} style={statBox(c)}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: c }}>{v ?? '—'}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', color: 'var(--text-3)', marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={rulesQuery} onChange={e => setRulesQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && queryRules()} placeholder="Datalog query..." style={inputCog} />
                <button onClick={queryRules} style={cogBtn('var(--cyan)')}>Query</button>
                <button onClick={inferRules} style={cogBtn('var(--purple)')}>Infer</button>
              </div>
              {rulesResult && <pre style={{ margin: 0, padding: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 110, overflow: 'auto' }}>{JSON.stringify(rulesResult, null, 2)}</pre>}
            </div>

            {/* Modal Logic Engine */}
            <div style={panelBlock}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Modal Logic Engine</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                {[['Agents','#a855f7',modalStats?.agents],['Worlds','#22d3ee',modalStats?.worlds],['Beliefs','#f472b6',modalStats?.beliefs],['Events','#4ade80',modalStats?.temporal_events]].map(([l, c, v]) => (
                  <div key={l} style={{ textAlign: 'center', padding: '6px 4px', borderRadius: 6, background: `${c}12`, border: `1px solid ${c}30` }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: c }}>{v ?? '—'}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', color: 'var(--text-3)' }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['Epistemic','Temporal','Doxastic','Deontic'].map(t => (
                  <span key={t} style={{ padding: '3px 8px', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 9, background: 'var(--panel-2)', border: '1px solid var(--line-soft)', color: 'var(--text-3)' }}>{t}</span>
                ))}
              </div>
            </div>

            {/* Neuro-Symbolic Bridge */}
            <div style={panelBlock}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Neuro-Symbolic Bridge</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {[['Lifted Facts', bridgeStats?.lifted_facts, 'var(--azure)'], ['Queries', bridgeStats?.queries_served, 'var(--azure)'], ['Entities', bridgeStats?.entities_extracted, 'var(--azure)']].map(([l, v, c]) => (
                  <div key={l} style={statBox(c)}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: c }}>{v ?? '—'}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', color: 'var(--text-3)', marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Autonomous Diagnostics */}
          <div style={panelBlock}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Autonomous Diagnostics</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={runDiag} disabled={diagRunning} style={{ ...cogBtn('var(--amber)'), opacity: diagRunning ? 0.5 : 1 }}>{diagRunning ? 'Running…' : 'Run Diagnosis'}</button>
                <button onClick={fetchCausal} style={{ padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', background: 'var(--panel-2)', border: '1px solid var(--line-soft)', color: 'var(--text-3)' }}>Causal Graph</button>
              </div>
            </div>
            {!diagResult && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>Run diagnosis to see causal analysis and vote tally.</div>}
            {diagResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {diagResult.votes && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Lead: {diagResult.votes.lead || 'none'}</span>
                    {Object.entries(diagResult.votes.tally || {}).map(([k, v]) => (
                      <span key={k} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', padding: '2px 8px', borderRadius: 3, background: 'rgba(34,211,238,0.08)' }}>{k}: {v}</span>
                    ))}
                  </div>
                )}
                {diagResult.results && Object.entries(diagResult.results).map(([agent, findings]) =>
                  Array.isArray(findings) && findings.length > 0 ? (
                    <div key={agent} style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.2em' }}>{agent}</div>
                      {findings.map((f, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-2)', padding: '2px 0' }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: f.severity === 'CRITICAL' || f.severity === 'ERROR' ? 'var(--red)' : f.severity === 'WARNING' ? 'var(--amber)' : 'var(--cyan)' }} />
                          <span style={{ flex: 1 }}>{f.description}</span>
                          {f.confidence != null && <span style={{ color: 'var(--text-mute)' }}>{f.confidence}%</span>}
                        </div>
                      ))}
                    </div>
                  ) : null
                )}
              </div>
            )}
            {causalDot && <pre style={{ margin: 0, padding: 10, background: 'rgba(0,0,0,0.4)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 180, overflow: 'auto', border: '1px solid var(--line-soft)' }}>{causalDot}</pre>}
          </div>

          {/* AutoDream */}
          <div style={panelBlock}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)' }}>AutoDream Consolidation</div>
            {dreamStats ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 8 }}>
                {[['Entries', dreamStats.entryCount,'var(--cyan)'],['Threshold', dreamStats.threshold,'var(--text-2)'],['Cycles', dreamStats.totalCycles,'var(--purple)'],['Merged', dreamStats.entriesMerged,'var(--emerald)'],['Rules Extracted', dreamStats.rulesExtracted,'var(--azure)'],['Needs Consolidation', dreamStats.needsConsolidation ? 'Yes' : 'No', dreamStats.needsConsolidation ? 'var(--amber)' : 'var(--emerald)']].map(([l, v, c]) => (
                  <div key={l} style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 6, background: 'rgba(0,0,0,0.3)' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: c }}>{v ?? '—'}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', color: 'var(--text-3)', lineHeight: 1.3, marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
            ) : <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>AutoDream offline — daemon not running on :7895</div>}
          </div>

        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Events tab — REAL
// ─────────────────────────────────────────────────────────────
function EventsTab() {
  const { stream, eventTimeline } = useData();
  const [filter, setFilter] = useS_p('all');
  const [src, setSrc] = useS_p('all');

  const all = [
    ...stream.events,
    ...eventTimeline.events.map(e => ({ ...e, _id: e.id, _time: e.ts, _source: e.data?.source || 'bus' })),
  ].sort((a, b) => {
    const ta = a._time ? new Date(a._time).getTime() : 0;
    const tb = b._time ? new Date(b._time).getTime() : 0;
    return tb - ta;
  });

  const filtered = all.filter(ev => {
    if (filter !== 'all' && eventTone(ev) !== filter) return false;
    if (src !== 'all' && ev._source !== src) return false;
    return true;
  });

  return (
    <div className="tab-pane" style={{ gridTemplateColumns: '1fr' }}>
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">signal rail</span>
            <span className="panel-title">Live event stream · {all.length}</span>
          </div>
          <div className="row" style={{ gap: 4 }}>
            {['all', 'ok', 'info', 'warn', 'err'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '4px 10px', borderRadius: 4,
                background: filter === f ? 'rgba(34, 211, 238, 0.15)' : 'var(--panel-2)',
                border: `1px solid ${filter === f ? 'var(--cyan)' : 'var(--line-soft)'}`,
                color: filter === f ? 'var(--cyan)' : 'var(--text-3)',
                fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
              }}>{f}</button>
            ))}
            <span style={{ width: 1, height: 16, background: 'var(--line)' }} />
            {['all', 'api', 'tower', 'bus', 'orch'].map(s => (
              <button key={s} onClick={() => setSrc(s)} style={{
                padding: '4px 10px', borderRadius: 4,
                background: src === s ? 'rgba(168, 85, 247, 0.15)' : 'var(--panel-2)',
                border: `1px solid ${src === s ? 'var(--purple)' : 'var(--line-soft)'}`,
                color: src === s ? 'var(--purple)' : 'var(--text-3)',
                fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
              }}>{s}</button>
            ))}
          </div>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {all.length === 0 ? <EmptyState icon="≡" title="no events" hint="SSE streams not connected. start the backend." />
            : filtered.map(ev => (
              <div key={ev._id} className={`event ${eventTone(ev)}`}>
                <span className="event-time">{formatTs(ev._time)}</span>
                <span className="event-src">{ev._source}</span>
                <span className="event-msg">{eventLabel(ev)}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Mochi tab — REAL
// ─────────────────────────────────────────────────────────────
function MochiTab() {
  const { mochi } = useData();
  const m = mochi.data;

  return (
    <div className="tab-pane" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">companion</span>
            <span className="panel-title">{m ? `${m.name} the ${m.species}` : 'Mochi'}</span>
          </div>
          {mochi.connected ? <StatusPill ok label={m?.mood || 'on'} /> : <StatusPill ok={false} label="OFFLINE" />}
        </div>
        <div className="panel-body" style={{ display: 'grid', placeItems: 'center', gap: 20 }}>
          {!mochi.connected || !m ? (
            <EmptyState icon="♥" title="no mochi hatched" hint="run `purpclaw mochi hatch` to give your companion a face." color="var(--purple)" />
          ) : (
            <>
              <div style={{
                width: 240, height: 240,
                display: 'grid', placeItems: 'center',
                fontSize: 96,
                border: '1px solid var(--line-2)',
                borderRadius: 20,
                background: 'radial-gradient(circle, rgba(168, 85, 247, 0.2), transparent 70%)',
                position: 'relative',
              }}>
                <span style={{ textShadow: '0 0 30px var(--purple)' }}>{mochiEmoji(m)}</span>
                <div style={{
                  position: 'absolute', bottom: 20,
                  fontFamily: 'var(--font-mono)', fontSize: 14,
                  color: 'var(--purple)', textShadow: '0 0 8px var(--purple)',
                }}>{`(${m.eye || '·'}${m.verb || 'Ï‰'}${m.eye || '·'})`}</div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">vitals</span>
            <span className="panel-title">Identity</span>
          </div>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!m ? <EmptyState icon="◌" title="—" />
            : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <MetricCard label="species" value={m.species} accent="var(--cyan)" big />
                  <MetricCard label="rarity" value={m.rarity || 'common'} accent="var(--purple)" big />
                  <MetricCard label="interactions" value={m.interactions ?? 0} accent="var(--amber)" />
                  <MetricCard label="mood" value={m.mood || 'curious'} accent="var(--pink)" />
                </div>
                <div style={{ marginTop: 8, padding: 12, background: 'var(--panel-2)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.6 }}>
                  <KV k="eye" v={m.eye || '—'} />
                  <KV k="hat" v={m.hat || '—'} />
                  <KV k="tone" v={m.tone || '—'} />
                  <KV k="verb" v={m.verb || '—'} />
                  <KV k="shiny" v={m.shiny ? '✨ yes' : 'no'} color={m.shiny ? 'var(--amber)' : 'var(--text-3)'} />
                  <KV k="hatched" v={formatTs(m.hatchedAt)} />
                </div>
              </>
            )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// useAgentOutputStream — SSE → per-agent grouped lines
// ─────────────────────────────────────────────────────────────
function useAgentOutputStream({ maxLines = 300 }) {
  const [lines, setLines] = useS_p([]);
  const [isLive, setIsLive] = useS_p(true);
  const isLiveRef = useR_p(true);
  useE_p(() => { isLiveRef.current = isLive; }, [isLive]);

  const { anyConnected } = useData();

  // real SSE — tower + api streams
  useE_p(() => {
    const sources = [];
    function addLine(payload, source) {
      if (!isLiveRef.current) return;
      const type = String(payload.type || payload.topic || '').toLowerCase();
      const text = String(payload.output || payload.message || payload.text || payload.raw || '').trim();
      if (!text) return;
      const line = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        agentEmoji: payload.emoji || payload.agentEmoji || '◉',
        agentName: payload.agentName || payload.name || source,
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + String(new Date().getMilliseconds()).padStart(3, '0'),
        stream: (payload.stream === 'stderr' || type.includes('error') || type.includes('stderr')) ? 'stderr' : 'stdout',
        text: text.slice(0, 300),
      };
      setLines(prev => {
        const next = [...prev, line];
        return next.length > maxLines ? next.slice(next.length - maxLines) : next;
      });
    }
    function connect(url, source) {
      try {
        const es = new EventSource(url);
        es.onmessage = (e) => {
          try { addLine(JSON.parse(e.data), source); }
          catch { addLine({ text: String(e.data).slice(0, 200) }, source); }
        };
        sources.push(es);
      } catch {}
    }
    connect('http://localhost:7780/api/stream', 'api');
    connect('http://localhost:7790/tower/stream', 'tower');
    return () => sources.forEach(es => { try { es.close(); } catch {} });
  }, [maxLines]);

  // demo stream when offline
  useE_p(() => {
    if (anyConnected) return;
    const agents = [
      { emoji: '🐝', name: 'bee' },
      { emoji: '🕷️', name: 'spider' },
      { emoji: '🐺', name: 'wolf' },
      { emoji: '🐉', name: 'dragon' },
    ];
    const msgs = [
      'Compiling module...',
      'Lint check passed ✓',
      'Connecting to event bus',
      'Retrying in 500ms',
      'Payload received',
      'Dispatching task to swarm',
      'Memory matrix updated',
      'Health check OK',
      'Spawning worker thread',
      'Flushing output buffer',
    ];
    const timer = setInterval(() => {
      if (!isLiveRef.current) return;
      const a = agents[Math.floor(Math.random() * agents.length)];
      const line = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        agentEmoji: a.emoji,
        agentName: a.name,
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + String(new Date().getMilliseconds()).padStart(3, '0'),
        stream: Math.random() > 0.87 ? 'stderr' : 'stdout',
        text: msgs[Math.floor(Math.random() * msgs.length)],
      };
      setLines(prev => {
        const next = [...prev, line];
        return next.length > maxLines ? next.slice(next.length - maxLines) : next;
      });
    }, 1100);
    return () => clearInterval(timer);
  }, [anyConnected, maxLines]);

  return { lines, setLines, isLive, setIsLive };
}

// ─────────────────────────────────────────────────────────────
// AgentOutputPanel — the stream viewer
// ─────────────────────────────────────────────────────────────
function AgentOutputPanel({ maxLines = 300 }) {
  const { lines, setLines, isLive, setIsLive } = useAgentOutputStream({ maxLines });
  const [expanded, setExpanded] = useS_p({});
  const containerRef = useR_p(null);
  const bottomRef = useR_p(null);
  const shouldAutoScroll = useR_p(true);

  useE_p(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      shouldAutoScroll.current = (el.scrollHeight - el.scrollTop - el.clientHeight) < 40;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useE_p(() => {
    if (shouldAutoScroll.current && bottomRef.current) {
      const el = containerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [lines.length]);

  // Group oldest→newest per agent, preserving agent order
  const grouped = useM_p(() => {
    const map = new Map();
    lines.forEach(line => {
      const key = `${line.agentEmoji} ${line.agentName}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(line);
    });
    return [...map.entries()];
  }, [lines]);

  const toggleGroup = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="panel-h">
        <div className="panel-h-l">
          <span className="panel-tag">live feed</span>
          <span className="panel-title">Agent Output Stream</span>
          <span style={{
            display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
            background: isLive ? 'var(--emerald)' : 'var(--red)',
            boxShadow: isLive ? '0 0 8px var(--emerald)' : 'none',
            animation: isLive ? 'ribbon-pulse 1.6s ease-in-out infinite' : 'none',
          }} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => setIsLive(v => !v)}
            style={{
              padding: '3px 10px', borderRadius: 4,
              background: isLive ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${isLive ? 'var(--emerald)' : 'var(--red)'}`,
              color: isLive ? 'var(--emerald)' : 'var(--red)',
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
            }}
          >{isLive ? 'LIVE' : 'PAUSED'}</button>
          <button
            onClick={() => setLines([])}
            style={{
              padding: '3px 10px', borderRadius: 4,
              background: 'var(--panel-2)', border: '1px solid var(--line-soft)',
              color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
            }}
          >CLEAR</button>
        </div>
      </div>

      <div ref={containerRef} className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px' }}>
        {lines.length === 0 && (
          <EmptyState icon="⟩_" title="waiting for agent output" hint="connect the backend or wait for the demo stream to populate." />
        )}
        {grouped.map(([agentKey, agentLines]) => {
          const isOpen = expanded[agentKey] !== false;
          const stderrCount = agentLines.filter(l => l.stream === 'stderr').length;
          return (
            <div key={agentKey} style={{ marginBottom: 2 }}>
              <button
                onClick={() => toggleGroup(agentKey)}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 10px', borderRadius: 6,
                  background: 'var(--panel-2)', border: '1px solid var(--line-soft)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{agentLines[0].agentEmoji}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>
                    {agentLines[0].agentName}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)' }}>
                    {agentLines.length} line{agentLines.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {stderrCount > 0 && (
                    <span style={{
                      background: 'rgba(239,68,68,0.15)', color: 'var(--red)',
                      fontFamily: 'var(--font-mono)', fontSize: 9,
                      padding: '1px 6px', borderRadius: 3,
                    }}>{stderrCount} err</span>
                  )}
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)',
                    display: 'inline-block',
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 160ms',
                  }}>▼</span>
                </div>
              </button>

              {isOpen && (
                <div style={{
                  marginTop: 2, paddingLeft: 10,
                  borderLeft: '2px solid var(--line-soft)',
                  display: 'flex', flexDirection: 'column', gap: 1,
                }}>
                  {agentLines.map(line => (
                    <div key={line.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '3px 8px', borderRadius: 4,
                      background: line.stream === 'stderr' ? 'rgba(239,68,68,0.05)' : 'transparent',
                      fontFamily: 'var(--font-mono)', fontSize: 11,
                    }}>
                      <span style={{ flexShrink: 0, color: 'var(--text-mute)', fontSize: 9, paddingTop: 1, whiteSpace: 'nowrap' }}>
                        {line.timestamp}
                      </span>
                      <span style={{
                        flexShrink: 0, fontSize: 9, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.1em', paddingTop: 1,
                        color: line.stream === 'stderr' ? 'var(--red)' : 'var(--cyan)',
                      }}>{line.stream}</span>
                      <span style={{
                        color: line.stream === 'stderr' ? 'rgba(239,68,68,0.9)' : 'var(--text-2)',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-all', flex: 1,
                      }}>{line.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{
        flexShrink: 0, borderTop: '1px solid var(--line-soft)',
        padding: '5px 14px', display: 'flex', justifyContent: 'space-between',
        fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-mute)',
        letterSpacing: '0.16em', textTransform: 'uppercase',
      }}>
        <span>lines: {lines.length}</span>
        <span>max: {maxLines}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// OutputTab — stream viewer + agents roster + quick stats
// (merges bee app mission-control page with existing PURPCLAW UI)
// ─────────────────────────────────────────────────────────────
function OutputTab() {
  const { agents, anyConnected, services } = useData();
  const working  = agents.filter(a => a.status === 'working').length;
  const errors   = agents.filter(a => a.status === 'error').length;
  const onlineSvc = services.filter(s => s.status === 'online').length;
  const latencies = services.filter(s => s.latency != null).map(s => s.latency);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;

  return (
    <div className="tab-pane" style={{ gridTemplateColumns: '1fr 280px' }}>
      <AgentOutputPanel maxLines={300} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Active Agents */}
        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-h">
            <div className="panel-h-l">
              <span className="panel-tag">swarm roster</span>
              <span className="panel-title">Active Agents</span>
            </div>
            <span className="pill" style={{ color: working ? 'var(--emerald)' : 'var(--text-3)' }}>
              {agents.length}
            </span>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {agents.length === 0 ? (
              <EmptyState icon="◉" title="no agents" hint="start the tower to see the live roster." />
            ) : agents.map(a => {
              const m = divMeta(a.division);
              const statusColor = a.status === 'working' ? 'var(--emerald)'
                                : a.status === 'error'   ? 'var(--red)'
                                : a.status === 'idle'    ? 'var(--text-3)'
                                : 'var(--purple)';
              return (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 8, padding: '8px 10px', borderRadius: 6,
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line-soft)',
                  borderLeft: `2px solid ${m.color}`,
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 15 }}>{a.emoji}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                      {a.task && <div style={{ color: 'var(--text-mute)', fontSize: 9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.task}</div>}
                    </div>
                  </div>
                  <span style={{
                    flexShrink: 0, color: statusColor, fontSize: 9,
                    letterSpacing: '0.14em', textTransform: 'uppercase',
                  }}>{a.status}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="panel">
          <div className="panel-h">
            <div className="panel-h-l">
              <span className="panel-tag">snapshot</span>
              <span className="panel-title">Quick Stats</span>
            </div>
          </div>
          <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 10 }}>
            <MetricCard label="Agents"   value={anyConnected ? agents.length : '—'} accent="var(--cyan)" big />
            <MetricCard label="Alerts"   value={anyConnected ? errors : '—'} accent={errors ? 'var(--red)' : 'var(--emerald)'} big />
            <MetricCard label="Services" value={anyConnected ? `${onlineSvc}/${services.length}` : '—'} accent="var(--emerald)" big />
            <MetricCard label="Latency"  value={anyConnected && avgLatency != null ? `${avgLatency}ms` : '—'} accent="var(--pink)" big />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CommandTab — primary command bus (SAMANTHA, 3 modes, agent picker)
// ─────────────────────────────────────────────────────────────
function CommandTab() {
  const { agents, services, connections, anyConnected, tower } = useData();
  const [mode, setMode]             = useS_p('chat');
  const [jobMode, setJobMode]       = useS_p('single');
  const [selAgent, setSelAgent]     = useS_p('');
  const [safeguard, setSafeguard]   = useS_p('Create a plan only. Do not edit files.');
  const [input, setInput]           = useS_p('');
  const [history, setHistory]       = useS_p([{ id: 'init', role: 'assistant', content: 'SAMANTHA online. Voice bridge active. Awaiting command.' }]);
  const [processing, setProcessing] = useS_p(false);
  const [viaOrch, setViaOrch]       = useS_p(false);
  const [apiTarget, setApiTarget]   = useS_p('api');
  const containerRef = useR_p(null);
  const msgId = useR_p(0);

  const towerAgents = [...(tower.activeAgents || []), ...(tower.registeredAgents || [])];

  useE_p(() => {
    if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [history.length]);

  const addMsg = (msg) => {
    const id = `m${++msgId.current}`;
    setHistory(prev => [...prev, { id, ...msg }]);
  };

  const sendCommand = async (overrideText, overrideGuard) => {
    const text = (overrideText !== undefined ? overrideText : input).trim();
    const guard = overrideGuard !== undefined ? overrideGuard : safeguard;
    if (!text || processing) return;
    if (overrideText === undefined) setInput('');
    const full = guard ? `${text}\n${guard}` : text;
    addMsg({ role: 'user', content: text });
    setProcessing(true);
    try {
      let result;
      if (viaOrch) {
        const r = await tryProxySend(7784, '/api/orchestrate', { command: full, source: 'command-panel' }, 10000);
        result = r ? `Workflow ${r.workflowId || '—'} · ${r.status || 'queued'}` : 'Orchestrator offline';
      } else {
        const json = await tryProxySend(7780, '/api/command', { text: full }, 10000);
        result = json?.result || json?.response || (json ? JSON.stringify(json).slice(0, 500) : 'Unified API offline');
      }
      addMsg({ role: 'assistant', content: result });
    } catch (e) {
      addMsg({ role: 'assistant', content: `Error: ${e.message}` });
    } finally {
      setProcessing(false);
    }
  };

  const QUICK = [
    { lbl: 'status',         text: 'Explain current system state. Do not edit.',  guard: 'Create a plan only. Do not edit files.' },
    { lbl: 'dispatch trace', text: 'Show last 3 dispatch traces.',                guard: '' },
    { lbl: 'tower',          text: 'List all tower agents and their status.',      guard: 'Create a plan only. Do not edit files.' },
    { lbl: 'chat',           text: 'Hello!',                                      guard: '' },
  ];

  const connStatus = [
    { lbl: 'API',         ok: connections.api   },
    { lbl: 'Tower',       ok: connections.tower },
    { lbl: 'Orchestrator',ok: connections.orch  },
    { lbl: 'EventBus',    ok: connections.bus   },
  ];

  const inputCss = { flex: 1, padding: '8px 12px', borderRadius: 6, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none' };
  const modeBtn = (m, lbl) => (
    <button key={m} onClick={() => setMode(m)} style={{
      padding: '7px 10px', borderRadius: 6, textAlign: 'left', cursor: 'pointer',
      fontFamily: 'var(--font-mono)', fontSize: 11,
      background: mode === m ? 'rgba(34,211,238,0.08)' : 'var(--panel-2)',
      border: `1px solid ${mode === m ? 'rgba(34,211,238,0.35)' : 'var(--line-soft)'}`,
      color: mode === m ? 'var(--cyan)' : 'var(--text-2)',
    }}>{lbl}</button>
  );

  return (
    <div className="tab-pane" style={{ gridTemplateColumns: '252px 1fr' }}>
      {/* Sidebar */}
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">primary command bus</span>
            <span className="panel-title">Command</span>
          </div>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>Assign one selected tower agent</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[['compact','Compact'],['chat','Chat Stack'],['api','API Command']].map(([m,l]) => modeBtn(m,l))}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>job mode</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {[['allocate','Allocate Job'],['single','Single Agent']].map(([m,l]) => (
                <button key={m} onClick={() => setJobMode(m)} style={{
                  padding: '5px 8px', borderRadius: 4, cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: 9,
                  background: jobMode === m ? 'rgba(168,85,247,0.08)' : 'var(--panel-2)',
                  border: `1px solid ${jobMode === m ? 'rgba(168,85,247,0.35)' : 'var(--line-soft)'}`,
                  color: jobMode === m ? 'var(--purple)' : 'var(--text-3)',
                }}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 2 }}>
              {jobMode === 'single' ? 'Single Agent' : 'Allocate Job'}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-mute)', marginBottom: 6 }}>:7790/api/spawn</div>
            <select value={selAgent} onChange={e => setSelAgent(e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 4, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--line)', color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none' }}>
              <option value="">Select agent</option>
              {towerAgents.map(a => <option key={a.name} value={a.name}>{a.emoji || ''} {a.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>safeguard</div>
            <textarea rows={2} value={safeguard} onChange={e => setSafeguard(e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 4, resize: 'none', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--line)', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 10, outline: 'none', lineHeight: 1.5, boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>quick dispatch</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {QUICK.map((q, i) => (
                <button key={i} onClick={() => sendCommand(q.text, q.guard)} style={{ padding: '6px 10px', borderRadius: 4, textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--panel-2)', border: '1px solid var(--line-soft)', color: 'var(--text-2)' }}>{q.lbl}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="panel-h">
          {mode === 'api' ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {connStatus.map(c => (
                <button key={c.lbl} onClick={() => setApiTarget(c.lbl.toLowerCase())} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, background: apiTarget === c.lbl.toLowerCase() ? 'rgba(34,211,238,0.08)' : 'var(--panel-2)', border: `1px solid ${c.ok ? (apiTarget===c.lbl.toLowerCase()?'var(--cyan)':'rgba(16,185,129,0.3)') : 'var(--line-soft)'}`, color: c.ok ? 'var(--emerald)' : 'var(--text-3)' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.ok ? 'var(--emerald)' : 'var(--red)', boxShadow: c.ok ? '0 0 5px var(--emerald)' : 'none' }} />
                  {c.lbl}
                </button>
              ))}
            </div>
          ) : (
            <div className="panel-h-l">
              <span className="panel-tag">{mode === 'chat' ? 'chat stack' : 'compact'}</span>
              <span className="panel-title">{anyConnected ? 'SAMANTHA · online' : 'backend offline'}</span>
              {anyConnected && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--emerald)', boxShadow: '0 0 8px var(--emerald)', animation: 'ribbon-pulse 1.6s ease-in-out infinite' }} />}
            </div>
          )}
        </div>
        <div ref={containerRef} className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px' }}>
          {history.map(msg => (
            <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-start' }}>
              {msg.role === 'assistant' && (
                <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: 1.4, flexShrink: 0, paddingTop: 10 }}>chat<br />answered</div>
              )}
              <div style={{ maxWidth: '82%', padding: '9px 13px', borderRadius: 8, fontSize: 12, lineHeight: 1.6, fontFamily: msg.role === 'assistant' ? 'var(--font-mono)' : 'var(--font-display)', background: msg.role === 'user' ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${msg.role === 'user' ? 'rgba(34,211,238,0.3)' : 'var(--line-soft)'}`, color: msg.role === 'user' ? 'var(--cyan)' : 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</div>
            </div>
          ))}
          {processing && (
            <div style={{ display: 'flex', gap: 5, paddingLeft: 4 }}>
              {[0,1,2].map(i => <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--cyan)', animation: `ribbon-pulse 1.2s ${i*0.18}s ease-in-out infinite` }} />)}
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0, padding: '10px 14px', borderTop: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCommand(); } }} placeholder="Enter command..." style={inputCss} />
            <button onClick={() => sendCommand()} disabled={processing || !input.trim()} style={{ padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.4)', color: 'var(--cyan)', opacity: (processing || !input.trim()) ? 0.5 : 1 }}>Send</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setViaOrch(v => !v)} style={{ padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', background: viaOrch ? 'rgba(168,85,247,0.12)' : 'var(--panel-2)', border: `1px solid ${viaOrch ? 'rgba(168,85,247,0.4)' : 'var(--line-soft)'}`, color: viaOrch ? 'var(--purple)' : 'var(--text-3)' }}>Route via Orchestrator</button>
            <button onClick={() => setHistory([{ id: 'init', role: 'assistant', content: 'SAMANTHA online. Voice bridge active. Awaiting command.' }])} style={{ padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', background: 'var(--panel-2)', border: '1px solid var(--line-soft)', color: 'var(--text-3)' }}>Clear</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ProjectGraphTab — 3D knowledge graph (services/agents/divisions/workflows)
// ─────────────────────────────────────────────────────────────
function ProjectGraphTab() {
  const { agents, services, pipeline, stream, mochi } = useData();
  const [pointer, setPointer] = useS_p({ x: 0, y: 0 });
  const [selected, setSelected] = useS_p(null);

  const companions = mochi.connected ? 1 : 0;
  const workflows = [...(pipeline?.active || []), ...(pipeline?.completed || []).slice(0, 8)];
  const divisions = [...new Set(agents.map(a => String(a.division || 'UNKNOWN').toUpperCase()))];

  const nodes = useM_p(() => [
    { id: 'core', label: 'PC', kind: 'core', detail: 'mission control root', color: '#22d3ee', x: 0, y: 0, z: 0, size: 80 },
    ...services.map((s, i) => {
      const angle = (Math.PI * 2 * i) / Math.max(services.length, 1);
      return { id: `svc-${s.key}`, label: s.name.split('_')[0], kind: 'service', detail: `:${s.port} · ${s.status}`, color: s.status === 'online' ? '#34d399' : s.status === 'degraded' ? '#fbbf24' : '#fb7185', x: Math.cos(angle) * 200, y: Math.sin(angle) * 80, z: Math.sin(angle) * 120, size: 28 };
    }),
    ...divisions.map((div, i) => {
      const angle = (Math.PI * 2 * i) / Math.max(divisions.length, 1) + 0.4;
      const dm = divMeta(div);
      return { id: `div-${div}`, label: div.slice(0, 4), kind: 'division', detail: `${agents.filter(a => String(a.division||'').toUpperCase() === div).length} agents`, color: dm.color, x: Math.cos(angle) * 290, y: Math.sin(angle) * 120, z: Math.sin(angle * 1.3) * 160, size: 36 };
    }),
    ...agents.slice(0, 40).map((a, i) => {
      const angle = (Math.PI * 2 * i) / Math.max(agents.length, 1);
      const r = 360 + (i % 4) * 22;
      return { id: `ag-${a.name}`, label: a.name.slice(0, 3), kind: 'agent', detail: `${a.division || '?'} · ${a.status}`, color: a.status === 'working' ? '#34d399' : a.status === 'error' ? '#fb7185' : '#38bdf8', x: Math.cos(angle) * r, y: Math.sin(angle * 1.8) * 160 + 90, z: Math.sin(angle) * 210, size: a.status === 'working' ? 20 : 14 };
    }),
    ...workflows.slice(0, 10).map((wf, i) => ({
      id: `wf-${wf.id || i}`, label: (wf.intent || wf.id || '').slice(0, 5), kind: 'workflow',
      detail: wf.status || 'queued', color: wf.status === 'completed' ? '#34d399' : wf.status === 'failed' ? '#fb7185' : '#fbbf24',
      x: -310 + (i % 4) * 105, y: -30 + Math.floor(i / 4) * 60, z: 210 - (i % 5) * 70, size: 18,
    })),
  ], [agents, services, pipeline, divisions]);

  const handleMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPointer({ x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 });
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 10, minHeight: 0 }}>
      <div className="panel" style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: 'crosshair' }} onMouseMove={handleMove} onMouseLeave={() => setPointer({ x: 0, y: 0 })}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(circle at 50% 48%, rgba(34,211,238,0.1), transparent 35%), radial-gradient(circle at 18% 80%, rgba(167,139,250,0.08), transparent 28%)' }} />
        {/* top-left label */}
        <div style={{ position: 'absolute', left: 18, top: 18, zIndex: 10 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--text-mute)', marginBottom: 4 }}>relative mapped knowledge graph</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text)' }}>Project Graph</div>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>
            <span>{agents.length} agents</span><span>{divisions.length} divisions</span><span>{services.length} services</span><span>{workflows.length} workflows</span><span>{stream.events.length} events</span>{companions > 0 && <span>{companions} companions</span>}
          </div>
        </div>
        {/* inspector */}
        <div style={{ position: 'absolute', right: 18, top: 18, zIndex: 10, width: 200, padding: 14, borderRadius: 10, background: 'rgba(4,5,13,0.88)', border: '1px solid var(--line)', backdropFilter: 'blur(12px)' }}>
          {selected ? (
            <>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.24em', textTransform: 'uppercase', color: selected.color, marginBottom: 4 }}>{selected.kind}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>{selected.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-2)', lineHeight: 1.5 }}>{selected.detail}</div>
            </>
          ) : (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>Hover or click graph nodes to inspect project relationships.</div>
          )}
        </div>
        {/* bottom stats */}
        <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', gap: 8 }}>
          {[['agents', agents.length,'#22d3ee'],['services',`${services.filter(s=>s.status==='online').length}/${services.length}`,'#34d399'],['flows',workflows.length,'#a78bfa'],['events',stream.events.length,'#60a5fa'],['companions',companions,'#f472b6']].map(([l,v,c]) => (
            <div key={l} style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(4,5,13,0.82)', border: '1px solid var(--line)', textAlign: 'center', backdropFilter: 'blur(8px)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: c }}>{v}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--text-3)' }}>{l}</div>
            </div>
          ))}
        </div>
        {/* 3D scene */}
        <div style={{ position: 'absolute', inset: 0, perspective: '1100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', transformStyle: 'preserve-3d', transform: `rotateX(${pointer.y * -16}deg) rotateY(${pointer.x * 24}deg)`, transition: 'transform 100ms ease-out', width: 0, height: 0 }}>
            {[0,1,2,3].map(l => (
              <div key={l} style={{ position: 'absolute', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.05)', width: 320 + l * 160, height: 320 + l * 160, transform: `translate(-50%,-50%) translateZ(${-240 + l * 140}px) rotateX(68deg)` }} />
            ))}
            {nodes.map(n => (
              <div key={n.id} onClick={() => setSelected(selected?.id === n.id ? null : n)} title={`${n.kind}: ${n.label} — ${n.detail}`}
                style={{ position: 'absolute', borderRadius: '50%', cursor: 'pointer', width: n.size, height: n.size, transform: `translate3d(${n.x}px,${n.y}px,${n.z}px) translate(-50%,-50%)`, background: n.id === 'core' ? `radial-gradient(circle at 35% 35%, white, ${n.color})` : n.color, border: `2px solid ${n.id === 'core' ? n.color : 'rgba(255,255,255,0.15)'}`, boxShadow: `0 0 ${n.id === 'core' ? 28 : 10}px ${n.color}99`, opacity: 0.9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: n.id === 'core' ? 12 : 7, color: 'white', fontWeight: 700, userSelect: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
              >
                {n.id === 'core' ? 'PC' : n.kind === 'division' ? n.label : ''}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LogsTab — raw log stream with pause + filter
// ─────────────────────────────────────────────────────────────
function LogsTab() {
  const { stream, eventTimeline, anyConnected } = useData();
  const [filter, setFilter]   = useS_p('');
  const [paused, setPaused]   = useS_p(false);
  const [frozen, setFrozen]   = useS_p([]);
  const containerRef = useR_p(null);

  useE_p(() => {
    if (paused) return;
    const all = [
      ...stream.events,
      ...eventTimeline.events.map(e => ({ ...e, _id: e.id, _time: e.ts, _source: e.data?.source || 'bus' })),
    ].sort((a, b) => {
      try { return new Date(b._time).getTime() - new Date(a._time).getTime(); } catch { return 0; }
    });
    setFrozen(all);
  }, [stream.events.length, eventTimeline.events.length, paused]);

  const displayed = frozen.filter(ev => {
    if (!filter) return true;
    return (JSON.stringify(ev) || '').toLowerCase().includes(filter.toLowerCase());
  });

  return (
    <div className="tab-pane" style={{ gridTemplateColumns: '1fr' }}>
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">system logs</span>
            <span className="panel-title">Log Feed · {displayed.length}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="filter…" style={{ padding: '3px 8px', borderRadius: 4, width: 140, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none' }} />
            <button onClick={() => setPaused(p => !p)} style={{ padding: '3px 10px', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', background: paused ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', border: `1px solid ${paused ? 'var(--red)' : 'var(--emerald)'}`, color: paused ? 'var(--red)' : 'var(--emerald)', cursor: 'pointer' }}>{paused ? 'PAUSED' : 'LIVE'}</button>
          </div>
        </div>
        <div ref={containerRef} className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {!anyConnected ? <EmptyState icon="≡" title="backend offline" hint="connect the PURPCLAW stack to see live logs." />
            : displayed.length === 0 ? <EmptyState icon="≡" title="no logs" hint="waiting for events from all SSE streams." />
            : displayed.map((ev, i) => {
              const tone = eventTone(ev);
              const tc = tone === 'err' ? 'var(--red)' : tone === 'warn' ? 'var(--amber)' : tone === 'ok' ? 'var(--emerald)' : 'var(--cyan)';
              return (
                <div key={ev._id || ev.id || i} style={{ display: 'grid', gridTemplateColumns: '64px 80px 1fr', gap: 10, padding: '5px 8px', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 10.5, borderLeft: `2px solid ${tc}` }}>
                  <span style={{ color: 'var(--text-mute)', fontSize: 9 }}>{formatTs(ev._time || ev.ts)}</span>
                  <span style={{ color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 9 }}>{ev._source || ev.source || 'sys'}</span>
                  <span style={{ color: 'var(--text-2)' }}>{eventLabel(ev) || ev.message || ev.type}</span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SwarmTab — live Swarm Coordinator visualization
//   polls :7898 (coordinator) + :7784 (orchestrator)
//   demo mode recreates the GUARDIAN→MUSHROOM→RABBIT flow
// ─────────────────────────────────────────────────────────────
function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const DEMO_TASK = 'build a high-performance REST API for user registration, audit it for security holes, and write Jest tests for it';

const DEMO_AGENTS_TEMPLATE = [
  { name: 'GUARDIAN', emoji: '🛡',  domain: 'security',  color: '#f43f5e', task: 'audit it for security holes',                                      deps: [] },
  { name: 'MUSHROOM', emoji: '🍄',  domain: 'frontend',  color: '#a855f7', task: 'build a high-performance REST API for user registration',           deps: ['GUARDIAN'] },
  { name: 'RABBIT',   emoji: '🐰',  domain: 'testing',   color: '#22d3ee', task: 'write Jest tests for it',                                           deps: ['GUARDIAN', 'MUSHROOM'] },
];

const DEMO_DELIVERABLES = {
  GUARDIAN: '🛡 Security audit complete. Identified XSS/SQLi vectors. Rate-limiter strategy documented. Password hashing schema proposed.',
  MUSHROOM: '🍄 Express controller scaffold in controllers/user.js. Route wiring complete. Transactions layer with data consistency. Security context from GUARDIAN applied.',
  RABBIT:   '🐰 Jest test suite in __tests__/user.test.js. Coverage: register flow, rollback scenarios, hash verification. All gates passing.',
};

const DEMO_SYNTHESIS = `## PRODUCTION-GRADE USER REGISTER REST API MODULE

### 💻 BACKEND IMPLEMENTATION
- Created Express controller handlers in \`controllers/user.js\`
- Wired transaction layers with full data consistency

### 🛡️ SECURITY & HARDENED SHIELDS
- Secure password hashing on user storage models
- Input sanitized against XSS/SQLi patterns
- Rate-limiter middleware preventing brute force

### 🧪 QUALITY GATES & VERIFICATION
- Jest unit test coverage across all flows
- Transaction rollbacks and hashing layers verified
- GATES PASSED (100%)

File modifications: controllers/user.js · routes/user.js · __tests__/user.test.js
Consolidated by: PURPCLAW SWARM COORDINATOR (7898)`;

function SwarmAgentGraph({ agents, phase }) {
  const W = 560, H = 200;
  const nodeW = 130, nodeH = 70, gapX = 80;

  // Layout: left to right by dep order
  const levels = agents.map((a, i) => ({ ...a, x: 30 + i * (nodeW + gapX), y: (H - nodeH) / 2 }));

  const toneOf = (status) =>
    status === 'completed'   ? '#10b981' :
    status === 'dispatching' ? '#22d3ee' :
    status === 'pending'     ? '#4a4d70' : '#ef4444';

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', minHeight: 160 }}>
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="rgba(255,255,255,0.25)" />
        </marker>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Dependency arrows */}
      {levels.map(src =>
        src.deps.map(depName => {
          const dst = levels.find(a => a.name === depName);
          if (!dst) return null;
          const x1 = dst.x + nodeW, y1 = dst.y + nodeH / 2;
          const x2 = src.x,         y2 = src.y + nodeH / 2;
          const done = dst.status === 'completed';
          return (
            <g key={`${src.name}-${depName}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={done ? toneOf('completed') : 'rgba(255,255,255,0.12)'}
                strokeWidth={done ? 2 : 1.5}
                strokeDasharray={done ? '0' : '6 4'}
                markerEnd="url(#arrow)"
                style={{ filter: done ? 'drop-shadow(0 0 4px #10b981)' : 'none', transition: 'stroke 600ms' }}
              />
              {done && (
                <circle r={5} fill="#10b981" style={{ filter: 'drop-shadow(0 0 6px #10b981)' }}>
                  <animateMotion dur="1.2s" repeatCount="indefinite"
                    path={`M${x1},${y1} L${x2},${y2}`} />
                </circle>
              )}
            </g>
          );
        })
      )}

      {/* Agent nodes */}
      {levels.map(a => {
        const tone = toneOf(a.status);
        const pulse = a.status === 'dispatching';
        return (
          <g key={a.name} transform={`translate(${a.x},${a.y})`}>
            {pulse && (
              <rect x={-4} y={-4} width={nodeW + 8} height={nodeH + 8} rx={14}
                fill="none" stroke={tone} strokeWidth={2} opacity={0.5}>
                <animate attributeName="opacity" values="0.5;0.1;0.5" dur="1s" repeatCount="indefinite" />
                <animate attributeName="stroke-width" values="2;6;2" dur="1s" repeatCount="indefinite" />
              </rect>
            )}
            <rect x={0} y={0} width={nodeW} height={nodeH} rx={10}
              fill={`${tone}18`}
              stroke={tone}
              strokeWidth={a.status === 'pending' ? 1 : 1.8}
              style={{ filter: a.status !== 'pending' ? `drop-shadow(0 0 8px ${tone}88)` : 'none', transition: 'all 600ms' }}
            />
            <text x={nodeW / 2} y={24} textAnchor="middle" fontSize={20} style={{ userSelect: 'none' }}>{a.emoji}</text>
            <text x={nodeW / 2} y={42} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="var(--font-mono)" fill={tone} style={{ transition: 'fill 600ms' }}>{a.name}</text>
            <text x={nodeW / 2} y={57} textAnchor="middle" fontSize={9} fontFamily="var(--font-mono)" fill="rgba(255,255,255,0.35)">{a.domain.toUpperCase()}</text>
            <text x={nodeW / 2} y={69} textAnchor="middle" fontSize={8} fontFamily="var(--font-mono)" fill={tone} style={{ transition: 'fill 600ms', letterSpacing: 1 }}>
              {a.status === 'dispatching' ? '● RUNNING' : a.status === 'completed' ? '✓ DONE' : '○ PENDING'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SwarmTab() {
  const { pipeline, anyConnected } = useData();
  const [coordStatus, setCoordStatus] = useS_p(null);
  const [selectedWfId, setSelectedWfId] = useS_p(null);
  const [wfDetail, setWfDetail] = useS_p(null);
  const [demoAgents, setDemoAgents] = useS_p(null);
  const [demoPhase, setDemoPhase] = useS_p('idle');
  const [demoTask, setDemoTask] = useS_p(DEMO_TASK);
  const [synthOutput, setSynthOutput] = useS_p(null);
  const [demoLog, setDemoLog] = useS_p([]);
  const demoRunning = useR_p(false);

  // poll coordinator
  useE_p(() => {
    let cancelled = false;
    async function poll() {
      const standalone = await tryProxy(7898, '/status', 2000);
      const unified = standalone ? null : await tryProxy(7780, '/api/harness/status', 2000);
      const d = standalone ? { ...standalone, _coordLabel: ':7898' } : (unified ? { ...unified, _coordLabel: ':7780 harness' } : null);
      if (!cancelled && d) setCoordStatus(d);
    }
    poll();
    const t = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // auto-select first workflow
  useE_p(() => {
    if (!selectedWfId && pipeline?.active?.length > 0) setSelectedWfId(pipeline.active[0].id);
  }, [pipeline?.active?.length, selectedWfId]);

  // poll selected workflow detail
  useE_p(() => {
    if (!selectedWfId) return;
    let cancelled = false;
    async function poll() {
      const d = await tryProxy(7784, `/api/workflow/${encodeURIComponent(selectedWfId)}`, 2500);
      if (!cancelled && d) setWfDetail(d);
    }
    poll();
    const t = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(t); };
  }, [selectedWfId]);

  const addLog = (msg) => setDemoLog(prev => [...prev.slice(-60), { id: Date.now() + Math.random(), msg, time: new Date().toLocaleTimeString('en-US', { hour12: false }) }]);

  const runDemo = async () => {
    if (demoRunning.current) return;
    demoRunning.current = true;
    setSynthOutput(null);
    setDemoLog([]);
    setDemoPhase('decompose');

    const agents = DEMO_AGENTS_TEMPLATE.map(a => ({ ...a, status: 'pending', deliverable: null }));
    setDemoAgents([...agents]);

    addLog('[INCOMING] "' + demoTask.slice(0, 60) + '…"');
    await _sleep(700);
    addLog('[DECOMPOSING] Scanning task patterns…');
    await _sleep(900);
    addLog('✓ Decomposition successful! ' + agents.length + ' ownership cells.');
    agents.forEach((a, i) => addLog(`  [${i + 1}] ${a.name} ← ${a.domain}: "${a.task.slice(0, 40)}…"`));
    await _sleep(600);

    setDemoPhase('walk');
    addLog('── STAGE 2: WALKING THE COGNITIVE GRAPH ──');

    for (let cycle = 0; cycle < agents.length + 1; cycle++) {
      const ready = agents.find(a => a.status === 'pending' && a.deps.every(d => agents.find(x => x.name === d)?.status === 'completed'));
      if (!ready) break;

      addLog(`[CYCLE ${cycle + 1}] State Matrix:`);
      agents.forEach(a => addLog(`  • ${a.name} [${a.domain}] -> ${a.status.toUpperCase()} (Depends on: ${a.deps.join(', ') || 'NONE'})`));

      ready.status = 'dispatching';
      setDemoAgents([...agents]);
      addLog(`[DISPATCHING] Waking agent ${ready.name} for domain [${ready.domain}]…`);
      addLog(`  Task Slice: "${ready.task}"`);

      if (ready.deps.length > 0) {
        addLog('  [CONTEXT HANDOFF] Forwarding prior deliverables:');
        ready.deps.forEach(d => addLog(`    ↳ Including completed work from: ${d}`));
      }

      await _sleep(2200);

      ready.status = 'completed';
      ready.deliverable = DEMO_DELIVERABLES[ready.name];
      setDemoAgents([...agents]);
      addLog(`  ✓ ${ready.name} Finished! Deliverable written to packet.`);
      await _sleep(600);
    }

    setDemoPhase('synthesis');
    addLog('── STAGE 3: COGNITIVE SYNTHESIS MERGE ──');
    addLog('[SYNTHESIZING] Loading LLM Synthesis module…');
    await _sleep(1800);
    addLog('✓ Synthesis Completed!');
    setSynthOutput(DEMO_SYNTHESIS);
    setDemoPhase('done');
    demoRunning.current = false;
  };

  const allWfs = [...(pipeline?.active || []), ...(pipeline?.completed || []).slice(0, 6)];
  const activeAgents = demoAgents || buildLiveAgents(wfDetail);
  const coordOnline = coordStatus && !coordStatus.error;

  return (
    <div className="tab-pane" style={{ gridTemplateColumns: '220px 1fr 300px' }}>

      {/* LEFT — coordinator status + workflow list */}
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">coordinator</span>
            <span className="panel-title">Swarm</span>
          </div>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: coordOnline ? 'var(--emerald)' : 'var(--text-3)', boxShadow: coordOnline ? '0 0 8px var(--emerald)' : 'none' }} />
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Coordinator status */}
          <div style={{ padding: 10, borderRadius: 8, background: 'var(--panel-2)', border: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)' }}>PURPCLAW COORDINATOR</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: coordOnline ? 'var(--emerald)' : 'var(--text-3)' }}>{coordStatus?._coordLabel || ':7898'} · {coordOnline ? 'online' : 'offline'}</div>
            {coordStatus && coordStatus.activeJobs != null && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)' }}>{coordStatus.activeJobs} active jobs</div>
            )}
          </div>

          {/* Demo controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)' }}>simulation</div>
            <textarea
              value={demoTask}
              onChange={e => setDemoTask(e.target.value)}
              rows={4}
              disabled={demoRunning.current}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, resize: 'none', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--line)', color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontSize: 9, outline: 'none', lineHeight: 1.5, boxSizing: 'border-box' }}
            />
            <button
              onClick={runDemo}
              disabled={demoRunning.current}
              style={{ padding: '8px', borderRadius: 6, cursor: demoRunning.current ? 'default' : 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', background: demoPhase === 'done' ? 'rgba(16,185,129,0.12)' : 'rgba(168,85,247,0.12)', border: `1px solid ${demoPhase === 'done' ? 'rgba(16,185,129,0.4)' : 'rgba(168,85,247,0.4)'}`, color: demoPhase === 'done' ? 'var(--emerald)' : 'var(--purple)', opacity: demoRunning.current ? 0.6 : 1 }}
            >
              {demoRunning.current ? '● RUNNING…' : demoPhase === 'done' ? '↺ RUN AGAIN' : '▶ RUN SIMULATION'}
            </button>
            {demoPhase !== 'idle' && (
              <button onClick={() => { setDemoAgents(null); setDemoPhase('idle'); setSynthOutput(null); setDemoLog([]); demoRunning.current = false; }}
                style={{ padding: '5px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 9, background: 'var(--panel-2)', border: '1px solid var(--line-soft)', color: 'var(--text-3)' }}>
                reset
              </button>
            )}
          </div>

          {/* Live workflows */}
          {allWfs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)' }}>live workflows</div>
              {allWfs.map(wf => {
                const tone = wf.status === 'running' ? 'var(--cyan)' : wf.status === 'completed' ? 'var(--emerald)' : wf.status === 'failed' ? 'var(--red)' : 'var(--text-3)';
                return (
                  <button key={wf.id} onClick={() => { setDemoAgents(null); setSelectedWfId(wf.id); }} style={{ padding: '7px 9px', borderRadius: 6, textAlign: 'left', cursor: 'pointer', background: selectedWfId === wf.id && !demoAgents ? `${tone}10` : 'var(--panel-2)', border: `1px solid ${selectedWfId === wf.id && !demoAgents ? tone : 'var(--line-soft)'}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: tone }}>{wf.id.slice(-10)}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wf.intent || wf.target || '—'}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* CENTER — execution graph */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">execution graph</span>
            <span className="panel-title">
              {demoPhase === 'decompose' ? 'Decomposing…' :
               demoPhase === 'walk'      ? 'Walking Cognitive Graph…' :
               demoPhase === 'synthesis' ? 'Cognitive Synthesis Merge…' :
               demoPhase === 'done'      ? 'Simulation Complete ✓' :
               selectedWfId             ? `Workflow · ${selectedWfId.slice(-10)}` :
               'Swarm Coordinator'}
            </span>
          </div>
          {demoPhase !== 'idle' && (
            <span className="pill" style={{ color: demoPhase === 'done' ? 'var(--emerald)' : 'var(--purple)', animation: demoPhase !== 'done' ? 'ribbon-pulse 1.4s ease-in-out infinite' : 'none' }}>
              {demoPhase === 'done' ? 'COMPLETE' : 'RUNNING'}
            </span>
          )}
        </div>

        {/* Task banner */}
        {(demoPhase !== 'idle' || wfDetail) && (
          <div style={{ flexShrink: 0, padding: '10px 14px', borderBottom: '1px solid var(--line-soft)', background: 'rgba(168,85,247,0.04)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: 4 }}>incoming command</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
              {demoPhase !== 'idle' ? demoTask : (wfDetail?.intent || wfDetail?.target || '—')}
            </div>
          </div>
        )}

        {/* Agent graph */}
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 14px' }}>
          {activeAgents && activeAgents.length > 0 ? (
            <>
              <SwarmAgentGraph agents={activeAgents} phase={demoPhase} />

              {/* Deliverable cards */}
              {activeAgents.filter(a => a.deliverable).map(a => (
                <div key={a.name} style={{ padding: 12, borderRadius: 8, background: `${a.color}08`, border: `1px solid ${a.color}30`, borderLeft: `3px solid ${a.color}` }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: a.color, marginBottom: 6 }}>
                    {a.emoji} {a.name} · deliverable
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{a.deliverable}</div>
                </div>
              ))}

              {/* Synthesis */}
              {synthOutput && (
                <div style={{ padding: 14, borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.3)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--emerald)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--emerald)', boxShadow: '0 0 10px var(--emerald)' }} />
                    FINAL SWARM DELIVERABLE (SYNTHESIZED)
                  </div>
                  <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{synthOutput}</pre>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon="⬡"
              title={demoPhase === 'idle' ? 'ready to coordinate' : 'initializing…'}
              hint="click ▶ Run Simulation to see GUARDIAN → MUSHROOM → RABBIT execute with live dependency gates and context handoffs."
              color="var(--purple)"
            />
          )}
        </div>
      </div>

      {/* RIGHT — cycle matrix + coordinator log */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Cycle state matrix */}
        {activeAgents && (
          <div className="panel">
            <div className="panel-h">
              <div className="panel-h-l">
                <span className="panel-tag">state matrix</span>
                <span className="panel-title">Cycle Status</span>
              </div>
            </div>
            <div className="panel-body" style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activeAgents.map((a, i) => {
                const tone = a.status === 'completed' ? 'var(--emerald)' : a.status === 'dispatching' ? 'var(--cyan)' : 'var(--text-3)';
                return (
                  <div key={a.name} style={{ padding: '8px 10px', borderRadius: 7, background: 'var(--panel-2)', border: `1px solid ${a.status !== 'pending' ? a.color + '40' : 'var(--line-soft)'}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: a.color, fontWeight: 600 }}>{a.emoji} {a.name}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: tone, textTransform: 'uppercase', letterSpacing: '0.14em', animation: a.status === 'dispatching' ? 'ribbon-pulse 1s ease-in-out infinite' : 'none' }}>
                        {a.status}
                      </span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)' }}>
                      Domain: <span style={{ color: 'var(--text-2)' }}>{a.domain}</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)' }}>
                      Depends on: <span style={{ color: 'var(--text-2)' }}>{a.deps.length ? a.deps.join(', ') : 'NONE'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Coordinator log */}
        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-h">
            <div className="panel-h-l">
              <span className="panel-tag">coordinator</span>
              <span className="panel-title">Dispatch Log</span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)' }}>{demoLog.length} lines</span>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '6px 10px' }}>
            {demoLog.length === 0 ? (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', padding: 12, textAlign: 'center', lineHeight: 1.5 }}>
                log appears here during simulation
              </div>
            ) : demoLog.map(l => (
              <div key={l.id} style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 9.5, lineHeight: 1.5 }}>
                <span style={{ color: 'var(--text-mute)', flexShrink: 0 }}>{l.time}</span>
                <span style={{ color: l.msg.startsWith('✓') ? 'var(--emerald)' : l.msg.startsWith('[DISPATCHING]') ? 'var(--cyan)' : l.msg.startsWith('[CONTEXT') ? 'var(--purple)' : l.msg.startsWith('  ↳') ? 'var(--azure)' : l.msg.startsWith('──') ? 'var(--amber)' : 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{l.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildLiveAgents(wf) {
  if (!wf) return null;
  const trace = wf.trace || [];
  const delegation = wf.delegation;
  if (!delegation && trace.length === 0) return null;
  const members = delegation?.mode === 'team'
    ? [delegation.leader, ...(delegation.members || [])]
    : delegation?.selectedAgent ? [delegation.selectedAgent] : [];
  if (members.length === 0) return null;
  return members.map((name, i) => {
    const traceEntry = trace.filter(t => t.agentName === name);
    const lastEntry = traceEntry[traceEntry.length - 1];
    const status = lastEntry?.status === 'completed' || lastEntry?.status === 'succeeded' ? 'completed'
                 : lastEntry?.status === 'started' || lastEntry?.status === 'running' ? 'dispatching'
                 : 'pending';
    return {
      name: name.toUpperCase(),
      emoji: '◉',
      domain: 'agent',
      color: '#22d3ee',
      task: wf.intent || '',
      deps: i > 0 ? [members[i - 1].toUpperCase()] : [],
      status,
      deliverable: status === 'completed' ? (lastEntry?.detail || null) : null,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// HarnessTab — Autonomous Harness (job→plan→delegation→critique→final)
//   wires to /api/harness/* at :7780
// ─────────────────────────────────────────────────────────────
const HARNESS_PRESETS = [
  'Build the end-to-end harness flow: decompose the job, route each slice to the right specialist, verify output, and return one final result.',
  'Audit the app UI and remove duplicate telemetry panels so every tab has a distinct operator purpose.',
  'Add an API endpoint, secure it, update the frontend call, and produce a smoke-test checklist.',
];

const HARNESS_TONE = {
  queued:      '#38bdf8', decomposing: '#22d3ee', running: '#fbbf24',
  synthesizing:'#a855f7', completed:   '#10b981', failed:  '#ef4444',
  aborted:     '#6b7280', pending:     '#6b7280',
};

function HarnessPill({ status }) {
  const c = HARNESS_TONE[status] || '#6b7280';
  return <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', textTransform: 'uppercase', color: c, background: `${c}18`, border: `1px solid ${c}44` }}>{status}</span>;
}

async function harnessApi(path, opts = {}) {
  const res = await fetch(`/api/service-proxy?port=7780&path=${encodeURIComponent(path)}`, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const env = await res.json();
  if (env.status === 'offline' || env.status === 'disabled') throw new Error(env.error || 'Harness offline');
  return env.data ?? env;
}

function HarnessTab() {
  const { anyConnected, agents: towerAgents } = useData();
  const [goal, setGoal]         = useS_p(HARNESS_PRESETS[0]);
  const [execMode, setExecMode] = useS_p('simulate');
  const [busy, setBusy]         = useS_p(false);
  const [err, setErr]           = useS_p(null);
  const [hStatus, setHStatus]   = useS_p(null);
  const [mission, setMission]   = useS_p(null);
  const [selId, setSelId]       = useS_p(null);
  const activeM = mission && ['queued','decomposing','running','synthesizing'].includes(mission.status);

  const refreshStatus = async () => { try { const d = await harnessApi('/api/harness/status'); setHStatus(d); if (!selId && d.missions?.[0]?.missionId) setSelId(d.missions[0].missionId); } catch {} };
  const refreshMission = async (id) => { try { const d = await harnessApi(`/api/harness/missions/${encodeURIComponent(id)}`); setMission(d.mission || d); } catch {} };

  useE_p(() => { refreshStatus(); const t = setInterval(() => { refreshStatus(); if (selId) refreshMission(selId); }, activeM ? 1500 : 5000); return () => clearInterval(t); }, [selId, activeM]);
  useE_p(() => { if (selId) refreshMission(selId); }, [selId]);

  const start = async () => {
    if (!goal.trim() || busy || activeM) return;
    setBusy(true); setErr(null);
    try {
      const d = await harnessApi('/api/harness/start', { method: 'POST', body: JSON.stringify({ task: goal.trim(), intent: 'complex-productivity-harness', options: { source: 'operator-shell', executionMode: execMode } }) });
      const m = d.mission || d; setSelId(m.missionId); setMission(m); await refreshStatus();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const abort = async () => {
    if (!mission || busy || !activeM) return;
    setBusy(true); setErr(null);
    try { await harnessApi(`/api/harness/missions/${encodeURIComponent(mission.missionId)}/abort`, { method: 'POST', body: '{}' }); await refreshMission(mission.missionId); await refreshStatus(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const subtasks = mission?.subtasks || [];
  const missions = hStatus?.missions || [];
  const pBlock = { padding: 14, borderRadius: 10, background: 'var(--panel-2)', border: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', gap: 10 };

  return (
    <div className="tab-pane" style={{ gridTemplateColumns: '1fr 320px' }}>
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">job → plan → delegation → critique → final</span>
            <span className="panel-title">Autonomous Harness</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 8px', borderRadius: 3, background: anyConnected ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${anyConnected ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, color: anyConnected ? 'var(--emerald)' : 'var(--red)' }}>
              API {anyConnected ? 'online' : 'offline'}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 8px', borderRadius: 3, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line-soft)', color: 'var(--text-3)' }}>
              {towerAgents.length} agents visible
            </span>
          </div>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Presets */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {HARNESS_PRESETS.map((p, i) => (
              <button key={i} onClick={() => !activeM && setGoal(p)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 9, cursor: activeM ? 'default' : 'pointer', background: 'var(--panel-2)', border: '1px solid var(--line-soft)', color: 'var(--text-3)', opacity: activeM ? 0.5 : 1, fontFamily: 'var(--font-mono)' }}>{p.slice(0, 52)}…</button>
            ))}
          </div>
          {/* Mode */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[['simulate','Safe Simulation'],['live','Live Tower']].map(([m,l]) => (
              <button key={m} onClick={() => !activeM && setExecMode(m)} style={{ padding: '4px 12px', borderRadius: 4, fontSize: 9, cursor: activeM ? 'default' : 'pointer', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', textTransform: 'uppercase', background: execMode === m ? 'rgba(34,211,238,0.08)' : 'var(--panel-2)', border: `1px solid ${execMode === m ? 'rgba(34,211,238,0.35)' : 'var(--line-soft)'}`, color: execMode === m ? 'var(--cyan)' : 'var(--text-3)', opacity: activeM ? 0.6 : 1 }}>{l}</button>
            ))}
          </div>
          <textarea value={goal} onChange={e => setGoal(e.target.value)} disabled={busy || !!activeM} rows={4} placeholder="Give PURPCLAW a complex job…" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, resize: 'vertical', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none', lineHeight: 1.6, boxSizing: 'border-box', opacity: busy || activeM ? 0.6 : 1 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={start} disabled={busy || !!activeM || !goal.trim()} style={{ padding: '9px 20px', borderRadius: 8, cursor: busy || activeM ? 'default' : 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.35)', color: 'var(--cyan)', opacity: (busy || !!activeM || !goal.trim()) ? 0.4 : 1 }}>{busy ? 'Starting…' : 'Start Harness'}</button>
            <button onClick={abort} disabled={busy || !activeM} style={{ padding: '9px 16px', borderRadius: 8, cursor: !activeM ? 'default' : 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--red)', opacity: (busy || !activeM) ? 0.4 : 1 }}>Abort</button>
            {err && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)' }}>{err}</span>}
          </div>
          {/* Delegation graph */}
          {subtasks.length > 0 && (
            <div style={pBlock}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Delegation Graph</div>
              {subtasks.map(st => {
                const tc = HARNESS_TONE[st.status] || '#6b7280';
                return (
                  <div key={st.id} style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line-soft)', borderLeft: `3px solid ${tc}` }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)' }}>#{st.executionOrder}</span>
                      <HarnessPill status={st.status} />
                      <span style={{ padding: '2px 8px', borderRadius: 3, fontSize: 9, fontFamily: 'var(--font-mono)', background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)', color: 'var(--cyan)' }}>{st.domain}</span>
                      <span style={{ padding: '2px 8px', borderRadius: 3, fontSize: 9, fontFamily: 'var(--font-mono)', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)', color: 'var(--purple)' }}>{st.agent}</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 4 }}>{st.text}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)' }}>depends on: {st.dependsOn?.length ? st.dependsOn.join(', ') : 'none'} · attempts: {st.attempts}</div>
                    {st.output && <pre style={{ margin: '6px 0 0', padding: '6px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.4)', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-2)', whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'auto' }}>{st.output}</pre>}
                  </div>
                );
              })}
            </div>
          )}
          {/* Synthesis */}
          {mission?.synthesis?.summary && (
            <div style={{ padding: 14, borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.3)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--emerald)', marginBottom: 8 }}>Final Synthesis</div>
              <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)', whiteSpace: 'pre-wrap', lineHeight: 1.7, maxHeight: 300, overflow: 'auto' }}>{mission.synthesis.summary}</pre>
              {mission.synthesis.filesModified?.length > 0 && <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>Files: {mission.synthesis.filesModified.join(' · ')}</div>}
            </div>
          )}
          {!mission && !activeM && (
            <div style={{ textAlign: 'center', padding: '24px 0', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', lineHeight: 2 }}>
              Runs inside Unified API on port 7780.<br />task decomposer → Tower dispatch → context packets → synthesis.
            </div>
          )}
        </div>
      </div>
      {/* Sidebar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="panel">
          <div className="panel-h">
            <div className="panel-h-l"><span className="panel-tag">unified status</span><span className="panel-title">Missions</span></div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)' }}>{hStatus?.mode || 'checking'}</span>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[['active', hStatus?.activeMissions ?? 0, 'var(--cyan)'], ['total', hStatus?.missionCount ?? 0, 'var(--text-2)']].map(([l,v,c]) => (
                <div key={l} style={{ padding: 10, borderRadius: 8, background: 'var(--panel-2)', border: '1px solid var(--line-soft)', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: c }}>{v}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', color: 'var(--text-3)', marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>
            {missions.slice().reverse().slice(0, 8).map(item => (
              <button key={item.missionId} onClick={() => setSelId(item.missionId)} style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: selId === item.missionId ? 'rgba(34,211,238,0.06)' : 'var(--panel-2)', border: `1px solid ${selId === item.missionId ? 'rgba(34,211,238,0.3)' : 'var(--line-soft)'}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)' }}>{item.missionId?.slice(-12)}</span>
                  <HarnessPill status={item.status} />
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.task || `${item.subtaskCount || 0} subtasks`}</div>
              </button>
            ))}
            {missions.length === 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', textAlign: 'center', padding: 12 }}>No harness missions yet.</div>}
          </div>
        </div>
        {mission && (
          <div className="panel" style={{ flex: 1 }}>
            <div className="panel-h">
              <div className="panel-h-l"><span className="panel-tag">mission</span><span className="panel-title">{mission.missionId?.slice(-10)}</span></div>
              <HarnessPill status={mission.status} />
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>{mission.task}</div>
              {mission.error && <div style={{ padding: 8, borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)' }}>{mission.error}</div>}
              {subtasks.map(st => {
                const tc = HARNESS_TONE[st.status] || '#6b7280';
                return (
                  <div key={st.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 8px', borderRadius: 4, background: 'var(--panel-2)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-mute)', flexShrink: 0 }}>#{st.executionOrder}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: tc, flexShrink: 0, width: 55 }}>{st.status}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-3)', flexShrink: 0, width: 50, overflow: 'hidden' }}>{st.domain}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// AgentsTab — full agent roster with division filter + edit modal
// ─────────────────────────────────────────────────────────────
function AgentsTab() {
  const { agents, anyConnected } = useData();
  const [filter, setFilter] = useS_p('all');
  const [selected, setSelected] = useS_p(null);
  const divisions = [...new Set(agents.map(a => a.division || 'UNKNOWN'))].filter(Boolean);
  const filtered = filter === 'all' ? agents : agents.filter(a => a.division === filter);

  const sColor = (status) =>
    status === 'working'   ? '#22c55e' :
    status === 'error'     ? '#ef4444' :
    status === 'completed' ? '#a855f7' : '#525252';

  return (
    <div className="tab-pane" style={{ gridTemplateColumns: '1fr' }}>
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l"><span className="panel-tag">swarm roster</span><span className="panel-title">Agent Roster</span></div>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
            {[{v:'all',l:'All'}, ...divisions.map(d => ({v:d, l:d.slice(0,8)}))].map(opt => (
              <button key={opt.v} onClick={() => setFilter(opt.v)} style={{ padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', background: filter === opt.v ? 'rgba(34,211,238,0.1)' : 'transparent', border: `1px solid ${filter === opt.v ? 'rgba(34,211,238,0.35)' : 'transparent'}`, color: filter === opt.v ? 'var(--cyan)' : 'var(--text-3)' }}>{opt.l}</button>
            ))}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-mute)', marginLeft: 6 }}>{filtered.length} agents</span>
          </div>
        </div>
        <div className="panel-body">
          {!anyConnected ? <EmptyState icon="◉" title="tower offline" hint="connect the agent tower on :7790 to see the swarm roster." />
            : filtered.length === 0 ? <EmptyState icon="◌" title="no agents" hint="spawn an agent via the Command tab or `purpclaw run`." />
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                {filtered.map((a, i) => {
                  const m = divMeta(a.division);
                  const sc = sColor(a.status);
                  return (
                    <button key={i} onClick={() => setSelected(a)} style={{ textAlign: 'left', padding: 12, borderRadius: 10, cursor: 'pointer', background: 'var(--panel-2)', border: '1px solid var(--line-soft)', transition: 'border-color 160ms, background 160ms' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = m.color + '55'; e.currentTarget.style.background = m.color + '08'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line-soft)'; e.currentTarget.style.background = 'var(--panel-2)'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 18 }}>{a.emoji}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: m.color, marginTop: 1 }}>{(a.division || 'UNKNOWN').slice(0, 12)}</div>
                        </div>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: sc, boxShadow: `0 0 6px ${sc}` }} />
                      </div>
                      {a.task && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--cyan)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.7 }}>{a.task}</div>}
                    </button>
                  );
                })}
              </div>
            )}
        </div>
      </div>
      {selected && <AgentEditModal agent={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AgentEditModal({ agent, onClose }) {
  const m = divMeta(agent.division);
  const [role, setRole]         = useS_p(agent.role || '');
  const [division, setDivision] = useS_p(agent.division || 'ENGINEERING');
  const [tier, setTier]         = useS_p(agent.tier || 1);
  const [saveStatus, setSaveStatus] = useS_p('');
  const DIVS = ['INTELLIGENCE','ENGINEERING','SECURITY','INFRASTRUCTURE','MEDIA_OPS','MANAGEMENT','SCIENCE','CREATIVE','OPERATIONS'];

  const save = async () => {
    setSaveStatus('saving…');
    try {
      const j = await tryProxySend(7790, `/api/agents/${encodeURIComponent(agent.name)}`, { role, division, tier: Number(tier) }, 8000, 'PATCH');
      setSaveStatus(j ? 'saved ok' : 'tower offline');
    } catch (e) { setSaveStatus(e.message); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(2,4,12,0.75)', backdropFilter: 'blur(8px)' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 520, maxWidth: 'calc(100vw - 32px)', borderRadius: 16, background: '#05080d', border: `1px solid ${m.color}40`, padding: 24, boxShadow: `0 0 60px ${m.color}22` }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, display: 'grid', placeItems: 'center', fontSize: 28, borderRadius: 12, background: `${m.color}15`, border: `1px solid ${m.color}` }}>{agent.emoji}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.28em', textTransform: 'uppercase', color: m.color, marginBottom: 4 }}>agent detail</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--text)' }}>{agent.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>status: {agent.status} · id: {agent.id}</div>
          </div>
          <button onClick={onClose} style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--panel-2)', border: '1px solid var(--line-soft)', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11 }}>Close</button>
        </div>
        {agent.task && <div style={{ padding: 12, borderRadius: 8, background: 'var(--panel-2)', border: '1px solid var(--line-soft)', marginBottom: 16 }}><div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--text-3)', marginBottom: 6 }}>current task</div><div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>{agent.task}</div></div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {[['Role', role, setRole, 'text'], ['Tier', tier, setTier, 'number']].map(([lbl, val, setter, type]) => (
            <label key={lbl} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--text-3)' }}>{lbl}</span>
              <input type={type} value={val} onChange={e => setter(e.target.value)} min={type==='number'?1:undefined} max={type==='number'?3:undefined} style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.5)', border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none' }} />
            </label>
          ))}
          <label style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--text-3)' }}>Division</span>
            <select value={division} onChange={e => setDivision(e.target.value)} style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.5)', border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none' }}>
              {DIVS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: saveStatus.includes('✓') ? 'var(--emerald)' : saveStatus ? 'var(--red)' : 'transparent' }}>{saveStatus || '·'}</span>
          <button onClick={save} style={{ padding: '9px 24px', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.35)', color: 'var(--emerald)' }}>Save Agent</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PipelineTab — diagnostics vote tally + queue + workflows
// ─────────────────────────────────────────────────────────────
function PipelineTab() {
  const { pipeline, anyConnected } = useData();
  const [voteData, setVoteData] = useS_p(null);

  useE_p(() => {
    let cancelled = false;
    async function poll() {
      const d = await tryProxy(7786, '/vote', 2000);
      if (!cancelled && d) setVoteData(d);
    }
    poll();
    const t = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const active    = pipeline?.active || [];
  const completed = pipeline?.completed?.slice(0, 20) || [];
  const queue     = pipeline?.queue?.items || [];
  const pBlock    = { padding: 14, borderRadius: 10, background: 'var(--panel-2)', border: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', gap: 10 };

  return (
    <div className="tab-pane" style={{ gridTemplateColumns: '1fr' }}>
      <div className="panel" style={{ overflow: 'auto' }}>
        <div className="panel-h">
          <div className="panel-h-l"><span className="panel-tag">orchestrator</span><span className="panel-title">Pipeline</span></div>
          <span className="pill" style={{ color: active.length ? 'var(--cyan)' : 'var(--text-3)' }}>{active.length} running</span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Vote tally */}
          {voteData && (
            <div style={pBlock}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Diagnostics Vote Tally</div>
                {voteData.lead && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--amber)' }}>Lead: {voteData.lead}</span>}
              </div>
              {Object.entries(voteData.tally || {}).length > 0 ? (
                Object.entries(voteData.tally || {}).map(([cause, count]) => (
                  <div key={cause} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-2)', width: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{cause}</span>
                    <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: 'var(--cyan)', borderRadius: 3, width: `${Math.min(100, count * 10)}%`, boxShadow: '0 0 6px var(--cyan)' }} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', width: 18, textAlign: 'right', flexShrink: 0 }}>{count}</span>
                  </div>
                ))
              ) : <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', textAlign: 'center', padding: 8 }}>No votes yet</div>}
            </div>
          )}

          {/* Queue */}
          <div style={pBlock}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Orchestrator Queue</div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)' }}>{queue.length} pending</span>
            </div>
            {queue.length === 0 ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', textAlign: 'center', padding: 8 }}>Queue empty</div>
              : queue.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  <span style={{ color: 'var(--text-mute)' }}>#{i + 1}</span>
                  <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: 9, background: item.priority === 0 ? 'rgba(239,68,68,0.15)' : item.priority === 1 ? 'rgba(251,191,36,0.15)' : 'rgba(34,211,238,0.15)', color: item.priority === 0 ? 'var(--red)' : item.priority === 1 ? 'var(--amber)' : 'var(--cyan)', flexShrink: 0 }}>P{item.priority}</span>
                  <span style={{ color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.command}</span>
                </div>
              ))}
          </div>

          {/* Active */}
          <div style={pBlock}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Active Workflows</div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: active.length ? 'var(--cyan)' : 'var(--text-3)' }}>{active.length} running</span>
            </div>
            {active.length === 0 ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', textAlign: 'center', padding: 8 }}>No active workflows</div>
              : active.map(wf => (
                <div key={wf.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', borderLeft: '2px solid var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  <span style={{ color: 'var(--text-mute)', flexShrink: 0, fontSize: 9 }}>{wf.id?.slice(-8)}</span>
                  <span style={{ color: 'var(--cyan)', flexShrink: 0, fontSize: 9, width: 60 }}>{wf.status}</span>
                  <span style={{ color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wf.intent || wf.target}</span>
                  <span style={{ color: 'var(--text-mute)', flexShrink: 0, fontSize: 9 }}>{wf.steps?.completed || 0}/{wf.steps?.total || 0}</span>
                </div>
              ))}
          </div>

          {/* Completed */}
          <div style={pBlock}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Recently Completed</div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)' }}>{completed.length} shown</span>
            </div>
            {completed.length === 0 ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', textAlign: 'center', padding: 8 }}>No completed workflows</div>
              : completed.map(wf => (
                <div key={wf.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', borderLeft: '2px solid var(--emerald)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  <span style={{ color: 'var(--text-mute)', flexShrink: 0, fontSize: 9 }}>{wf.id?.slice(-8)}</span>
                  <span style={{ color: 'var(--emerald)', flexShrink: 0, fontSize: 9, width: 60 }}>{wf.status}</span>
                  <span style={{ color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wf.intent || wf.target}</span>
                  <span style={{ color: 'var(--text-mute)', flexShrink: 0, fontSize: 9 }}>{wf.duration ? `${(wf.duration/1000).toFixed(1)}s` : '—'}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  OverviewTab, DelegationTab, WorkflowsTab, MessagesTab,
  GatekeeperTab, PoolTab, CognitiveTab, EventsTab, MochiTab,
  OutputTab, AgentOutputPanel,
  CommandTab, ProjectGraphTab, LogsTab,
  SwarmTab,
  HarnessTab, AgentsTab, PipelineTab,
  HarnessPill, AgentEditModal,
});

