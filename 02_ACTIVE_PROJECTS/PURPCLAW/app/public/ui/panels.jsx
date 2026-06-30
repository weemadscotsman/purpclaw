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
      <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: 0, background: 'currentColor', boxShadow: '0 0 6px currentColor', marginRight: 6, verticalAlign: 'middle' }} />
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

      {/* service mesh */}
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">infrastructure</span>
            <span className="panel-title">Service Mesh</span>
          </div>
          <span className="mono tiny" style={{ color: 'var(--emerald)' }}>{onlineSvc}/{services.length} online</span>
        </div>
        <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {services.map(svc => {
            const tone = svc.status === 'online' ? 'var(--emerald)' : svc.status === 'degraded' ? 'var(--amber)' : 'var(--red)';
            return (
              <div key={svc.key} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 8px', background: 'var(--panel-2)',
                border: '1px solid var(--line-soft)', borderRadius: 0,
                fontFamily: 'var(--font-mono)', fontSize: 10,
                opacity: svc.status === 'offline' ? 0.55 : 1,
              }}>
                <div className="row" style={{ minWidth: 0 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 0, background: tone, boxShadow: `0 0 6px ${tone}` }} />
                  <span style={{ color: 'var(--text-2)' }}>{svc.name}</span>
                </div>
                <div className="row muted">
                  <span>:{svc.port}</span>
                  <span style={{ color: tone }}>{svc.latency != null ? `${svc.latency}ms` : 'down'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
                borderRadius: 0,
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
      borderRadius: 0, opacity: dim ? 0.65 : 1,
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
      borderRadius: 0,
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
        <div style={{ marginTop: 4, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 0, overflow: 'hidden' }}>
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
      <div style={{ padding: 14, background: 'var(--panel-2)', borderRadius: 0, border: '1px solid var(--line)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>intent</div>
        <div style={{ color: 'var(--text)', fontSize: 14, lineHeight: 1.5 }}>{wf.intent || wf.target || '(no intent)'}</div>
        {wf.target && wf.target !== wf.intent && (
          <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>target: {wf.target}</div>
        )}
      </div>

      {/* delegation summary */}
      {delegation && (
        <div style={{
          padding: 12, borderRadius: 0,
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
                padding: 8, background: 'var(--panel-2)', border: '1px solid var(--line-soft)', borderRadius: 0,
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
                  borderRadius: 0,
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
        <div style={{ padding: 12, background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 0}}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--emerald)', marginBottom: 6 }}>result</div>
          <div style={{ color: 'var(--text-2)', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{wf.result}</div>
        </div>
      )}
      {wf.error && (
        <div style={{ padding: 12, background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 0}}>
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
      borderRadius: 0,
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
                borderRadius: 0,
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
                borderRadius: 0,
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
                  borderRadius: 0,
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
                borderRadius: 0,
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
                      flex: 1, padding: '8px 14px', borderRadius: 0,
                      background: 'rgba(16, 185, 129, 0.12)', border: '1px solid var(--emerald)',
                      color: 'var(--emerald)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em',
                    }}>APPROVE</button>
                  <button
                    onClick={() => approveAmendment(a.id, 'reject')}
                    style={{
                      flex: 1, padding: '8px 14px', borderRadius: 0,
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
            <span className="panel-tag">policy</span>
            <span className="panel-title">Active gates</span>
          </div>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!gatekeeper.connected ? <EmptyState icon="⚖" title="gatekeeper offline" />
            : policies.length === 0 ? <EmptyState icon="◌" title="no policies returned" hint="gatekeeper /api/status didn't include a 'policies' or 'gates' array." />
            : policies.map((g, i) => (
              <div key={g.name || i} style={{
                padding: '8px 10px',
                background: 'var(--panel-2)',
                border: '1px solid var(--line-soft)',
                borderRadius: 0,
                display: 'grid', gridTemplateColumns: '1fr auto auto',
                gap: 10, alignItems: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 10,
              }}>
                <span style={{ color: 'var(--text)' }}>{g.name || g.id || JSON.stringify(g).slice(0,40)}</span>
                <span className="muted">{g.mode || '—'}</span>
                {g.hits != null && <span style={{ color: 'var(--cyan)' }}>{g.hits}×</span>}
              </div>
            ))}
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
      const d = await tryProxy(7885, '/pool/stats');
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
            {poolOnline ? `pool:7885 online · ${poolEvents.length} events` : 'pool offline'}
          </span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {!poolOnline ? <EmptyState icon="◉" title="pool service offline" hint="start the pool on :7885 to track who's querying what." />
            : poolEvents.length === 0 ? <EmptyState icon="◌" title="no pool queries observed" hint="agents query the pool when they need a skill or context. send a job to trigger one." />
            : poolEvents.map(ev => (
              <div key={ev.id} style={{
                padding: '8px 12px',
                background: 'var(--panel-2)',
                border: '1px solid var(--line-soft)',
                borderRadius: 0,
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
                padding: 12, borderRadius: 0,
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
// Cognitive tab — REAL (best-effort, depends on cognitive service)
// ─────────────────────────────────────────────────────────────
function CognitiveTab() {
  const { services, stream } = useData();
  // cognitive = any of: modal(7785), diagnostics(7786), rules(7787), autodream(7895)
  const cogSvc = services.find(s => ['modal', 'diagnostics', 'rules', 'autodream'].includes(s.key) && s.status === 'online');
  const cogOnline = !!cogSvc;

  // autodream has the richest status endpoint
  const [state, setState] = useS_p(null);
  useE_p(() => {
    let cancelled = false;
    async function tick() {
      const d = await tryProxy(7895, '/dream/status');
      if (!cancelled && d) { setState(d); return; }
      // fallback to modal logic state
      const m = await tryProxy(7785, '/health');
      if (!cancelled && m) setState(m);
    }
    tick();
    const t = setInterval(tick, 3500);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const reasoningEvents = stream.events.filter(ev => {
    const t = String(ev.type || ev.topic || '').toLowerCase();
    return t.includes('reasoning') || t.includes('cognitive') || t.includes('memory');
  });

  return (
    <div className="tab-pane" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">reasoning loop</span>
            <span className="panel-title">Cognitive Stream</span>
          </div>
          <span className="mono tiny" style={{ color: cogOnline ? 'var(--emerald)' : 'var(--red)' }}>
            {cogOnline ? `${cogSvc.name}:${cogSvc.port} online` : 'cognitive offline'}
          </span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {!cogOnline ? <EmptyState icon="⌬" title="cognitive service offline" hint="start a cognitive service (autodream :7895, modal :7785, diagnostics :7786, rules :7787 — all optional)." />
            : reasoningEvents.length === 0 ? <EmptyState icon="◌" title="no reasoning events" />
            : reasoningEvents.slice(0, 40).map(ev => (
              <div key={ev._id} className={`event ${eventTone(ev)}`}>
                <span className="event-time">{formatTs(ev._time)}</span>
                <span className="event-src">{ev.topic || ev.type}</span>
                <span className="event-msg">{eventLabel(ev)}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <div className="panel-h-l">
            <span className="panel-tag">memory matrix</span>
            <span className="panel-title">State</span>
          </div>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!state ? <EmptyState icon="⌬" title="no state" hint="cognitive /state endpoint not responding." />
            : (
              <pre style={{
                margin: 0, padding: 14, background: 'var(--panel-2)', borderRadius: 0,
                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-2)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                maxHeight: 460, overflow: 'auto',
              }}>{JSON.stringify(state, null, 2)}</pre>
            )}
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
                padding: '4px 10px', borderRadius: 0,
                background: filter === f ? 'rgba(34, 211, 238, 0.15)' : 'var(--panel-2)',
                border: `1px solid ${filter === f ? 'var(--cyan)' : 'var(--line-soft)'}`,
                color: filter === f ? 'var(--cyan)' : 'var(--text-3)',
                fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
              }}>{f}</button>
            ))}
            <span style={{ width: 1, height: 16, background: 'var(--line)' }} />
            {['all', 'api', 'tower', 'bus', 'orch'].map(s => (
              <button key={s} onClick={() => setSrc(s)} style={{
                padding: '4px 10px', borderRadius: 0,
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
                borderRadius: 0,
                background: 'radial-gradient(circle, rgba(168, 85, 247, 0.2), transparent 70%)',
                position: 'relative',
              }}>
                <span style={{ textShadow: '0 0 30px var(--purple)' }}>{mochiEmoji(m)}</span>
                <div style={{
                  position: 'absolute', bottom: 20,
                  fontFamily: 'var(--font-mono)', fontSize: 14,
                  color: 'var(--purple)', textShadow: '0 0 8px var(--purple)',
                }}>{`(${m.eye || '·'}${m.verb || 'ω'}${m.eye || '·'})`}</div>
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
                <div style={{ marginTop: 8, padding: 12, background: 'var(--panel-2)', borderRadius: 0, fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.6 }}>
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

Object.assign(window, {
  OverviewTab, DelegationTab, WorkflowsTab, MessagesTab,
  GatekeeperTab, PoolTab, CognitiveTab, EventsTab, MochiTab,
});
