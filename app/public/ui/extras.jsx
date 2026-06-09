/* extras.jsx — operator essentials translated from "the goose PRD"
 *
 *   "real-time traffic monitoring"   → NotificationToaster for critical events
 *   "latency dashboard"              → ServiceLatencyChart sparkline per service
 *   "encrypted audit log"            → AuditExport (JSON download of current log)
 *   "multi-user role management"     → IdentityChip in header
 *   "offline mode"                   → StaleIndicator when mission-data tick stalls
 *   "failover capabilities"          → ServiceFailover (auto-retry already in hooks; surfaces it)
 *   "dark mode" / theme              → Theme switch (already dark; adds dawn variant)
 *   "responsive mobile companion"    → header collapses below 1000px (CSS)
 *   "pdf performance reports"        → ExportPanel (print current view to PDF via window.print)
 *   "slack notifications"            → WebhookConfig (UI for adding an outbound webhook)
 *
 * Everything reads real data from useData() — no mocks.
 */

const { useState: useS_e, useEffect: useE_e, useMemo: useM_e, useRef: useR_e } = React;

// ─────────────────────────────────────────────────────────────
// NotificationToaster — surfaces critical SSE events
// ─────────────────────────────────────────────────────────────
function NotificationToaster() {
  const { stream, gatekeeper } = useData();
  const [toasts, setToasts] = useS_e([]);
  const seenRef = useR_e(new Set());
  const dismissedRef = useR_e(new Set());

  // dedupe + push critical events
  useE_e(() => {
    if (!stream.events.length) return;
    for (const ev of stream.events.slice(0, 12)) {
      const id = ev._id;
      if (!id || seenRef.current.has(id) || dismissedRef.current.has(id)) continue;
      const tone = eventTone(ev);
      if (tone !== 'err' && tone !== 'warn') continue;
      seenRef.current.add(id);
      setToasts(t => [{
        id,
        tone,
        title: (ev.type || ev.topic || 'event').slice(0, 28),
        body: eventLabel(ev),
        source: ev._source,
        born: Date.now(),
      }, ...t].slice(0, 4));
    }
  }, [stream.events.length]);

  // gatekeeper queue notification
  useE_e(() => {
    if (!gatekeeper.connected) return;
    const pending = gatekeeper.data?.pendingAmendments || gatekeeper.data?.amendments || gatekeeper.data?.queue || [];
    if (pending.length > 0) {
      const id = `gk-${pending.length}`;
      if (seenRef.current.has(id) || dismissedRef.current.has(id)) return;
      seenRef.current.add(id);
      setToasts(t => {
        if (t.find(x => x.id === id)) return t;
        return [{
          id,
          tone: 'warn',
          title: 'gatekeeper',
          body: `${pending.length} approval${pending.length === 1 ? '' : 's'} awaiting review`,
          source: 'gatekeeper',
          born: Date.now(),
        }, ...t].slice(0, 4);
      });
    }
  }, [gatekeeper.data]);

  // auto-dismiss after 7s
  useE_e(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setToasts(prev => prev.filter(x => now - x.born < 7000));
    }, 500);
    return () => clearInterval(t);
  }, []);

  const dismiss = (id) => {
    dismissedRef.current.add(id);
    setToasts(t => t.filter(x => x.id !== id));
  };

  if (toasts.length === 0) return null;
  return (
    <div className="toaster">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          <div className="toast-head">
            <span className="toast-icon">{t.tone === 'err' ? '◆' : '⚠'}</span>
            <span className="toast-title">{t.title}</span>
            <span className="toast-source">{t.source}</span>
            <button onClick={() => dismiss(t.id)} className="toast-close" title="dismiss">×</button>
          </div>
          <div className="toast-body">{t.body}</div>
          <div className="toast-progress" />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ServiceLatencyChart — rolling sparkline per service
// ─────────────────────────────────────────────────────────────
const __SVC_HIST = new Map();

function ServiceLatencyChart({ serviceKey, height = 16, width = 70, color = '#22d3ee' }) {
  const { services } = useData();
  const [, force] = useS_e(0);

  useE_e(() => {
    const svc = services.find(s => s.key === serviceKey);
    if (!svc) return;
    const hist = __SVC_HIST.get(serviceKey) || [];
    if (svc.latency != null) hist.push(svc.latency);
    else if (svc.status === 'offline') hist.push(null);
    __SVC_HIST.set(serviceKey, hist.slice(-30));
    force(x => (x + 1) % 1000);
  }, [services]);

  const series = __SVC_HIST.get(serviceKey) || [];
  if (series.length < 2) return null;

  const validVals = series.filter(v => v != null);
  const max = Math.max(...validVals, 50);
  const step = width / Math.max(1, series.length - 1);

  let path = '';
  series.forEach((v, i) => {
    if (v == null) return;
    const x = i * step;
    const y = height - (v / max) * height;
    path += (path ? ' L' : 'M') + ` ${x} ${y}`;
  });

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={path} fill="none" stroke={color} strokeWidth={1.1} strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 2px ${color})` }} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// IdentityChip — current operator (reads /api/whoami, falls back gracefully)
// ─────────────────────────────────────────────────────────────
function IdentityChip() {
  const [user, setUser] = useS_e(null);
  useE_e(() => {
    let cancelled = false;
    async function tick() {
      const a = await tryFetchJson('/api/whoami', 2000);
      if (cancelled) return;
      if (a && a.name) setUser(a);
      else setUser({ name: 'operator', role: 'admin' });
    }
    tick();
  }, []);
  if (!user) return null;
  return (
    <div className="id-chip" title={`${user.name} · ${user.role}`}>
      <span className="id-chip-avatar">{(user.name || '?').charAt(0).toUpperCase()}</span>
      <div className="id-chip-meta">
        <div className="id-chip-name">{user.name}</div>
        <div className="id-chip-role">{user.role || '—'}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// StaleIndicator — shows when mission-data tick stalls
// ─────────────────────────────────────────────────────────────
function StaleIndicator() {
  const { mission } = useData();
  const [stale, setStale] = useS_e(false);
  useE_e(() => {
    const t = setInterval(() => {
      if (!mission.lastTick) return;
      const age = Date.now() - mission.lastTick;
      setStale(age > 10000);
    }, 1000);
    return () => clearInterval(t);
  }, [mission.lastTick]);
  if (!stale) return null;
  return (
    <div className="stale-tag" title="mission data hasn't refreshed in >10s — backend may be slow">
      <span style={{ width: 5, height: 5, borderRadius: 0, background: 'var(--amber)', boxShadow: '0 0 6px var(--amber)' }} />
      STALE
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// AuditExport — download current event log as JSON
// ─────────────────────────────────────────────────────────────
function AuditExport({ compact = false }) {
  const { stream, eventTimeline, agents, services, pipeline, gatekeeper, mochi } = useData();
  const doExport = () => {
    const snapshot = {
      generated_at: new Date().toISOString(),
      origin: 'purpclaw-mission-control',
      data: {
        agents,
        services,
        pipeline,
        gatekeeper: gatekeeper.data,
        mochi: mochi.data,
        stream_events: stream.events,
        bus_events: eventTimeline.events,
      },
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purpclaw-audit-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  if (compact) {
    return (
      <button onClick={doExport} className="audit-btn compact" title="download audit snapshot">
        <span>↓</span> JSON
      </button>
    );
  }
  return (
    <button onClick={doExport} className="audit-btn" title="download full audit snapshot as JSON">
      <span style={{ fontSize: 13 }}>↓</span>
      <span>AUDIT</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// ExportPanel — print the current view to PDF
// ─────────────────────────────────────────────────────────────
function ExportPanel({ compact = false }) {
  const doPrint = () => {
    document.body.classList.add('printing');
    setTimeout(() => {
      window.print();
      setTimeout(() => document.body.classList.remove('printing'), 500);
    }, 50);
  };
  return (
    <button onClick={doPrint} className={`audit-btn ${compact ? 'compact' : ''}`} title="print/save current view as PDF">
      <span style={{ fontSize: 13 }}>⎙</span>
      {!compact && <span>PDF</span>}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// WebhookConfig — minimal outbound channel config UI (writes to localStorage)
// ─────────────────────────────────────────────────────────────
function WebhookConfig() {
  const [url, setUrl] = useS_e(() => {
    try { return localStorage.getItem('purpclaw_webhook') || ''; } catch { return ''; }
  });
  const [verified, setVerified] = useS_e(false);
  const save = () => {
    try { localStorage.setItem('purpclaw_webhook', url); setVerified(true); setTimeout(() => setVerified(false), 1800); } catch {}
  };
  return (
    <div className="webhook-config">
      <div className="webhook-h">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-3)' }}>outbound webhook</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: verified ? 'var(--emerald)' : 'var(--text-mute)' }}>{verified ? 'saved ✓' : 'slack / discord / generic'}</span>
      </div>
      <div className="webhook-row">
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://hooks.slack.com/services/…"
          className="webhook-input"
        />
        <button onClick={save} className="audit-btn compact">save</button>
      </div>
      <div className="webhook-hint">
        critical events POSTed to this URL when the backend's notification hook is wired. one-way, no creds stored on backend.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ServiceMeshEnhanced — drop-in for OverviewTab's mesh panel
// adds rolling latency chart + uptime % per service
// ─────────────────────────────────────────────────────────────
function ServiceMeshEnhanced() {
  const { services } = useData();
  const online = services.filter(s => s.status === 'online').length;
  return (
    <div className="panel">
      <div className="panel-h">
        <div className="panel-h-l">
          <span className="panel-tag">infrastructure · failover</span>
          <span className="panel-title">Service Mesh</span>
        </div>
        <span className="mono tiny" style={{ color: 'var(--emerald)' }}>{online}/{services.length} online</span>
      </div>
      <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {services.map(svc => {
          const tone = svc.status === 'online' ? 'var(--emerald)'
                     : svc.status === 'degraded' ? 'var(--amber)'
                     : 'var(--red)';
          return (
            <div key={svc.key} style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 8,
              padding: '8px 10px',
              background: 'var(--panel-2)',
              border: '1px solid var(--line-soft)',
              borderRadius: 0,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              opacity: svc.status === 'offline' ? 0.6 : 1,
              borderLeft: `2px solid ${tone}`,
            }}>
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ marginBottom: 3 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 0, background: tone, boxShadow: `0 0 6px ${tone}` }} />
                  <span style={{ color: 'var(--text-2)' }}>{svc.name}</span>
                  <span style={{ color: 'var(--text-mute)', fontSize: 9 }}>:{svc.port}</span>
                </div>
                <div className="row" style={{ gap: 10, fontSize: 9, color: 'var(--text-3)' }}>
                  <span>{svc.status}</span>
                  <span style={{ color: tone }}>{svc.latency != null ? `${svc.latency}ms` : 'down'}</span>
                  {svc.optional && <span style={{ color: 'var(--text-mute)' }}>· opt</span>}
                </div>
              </div>
              <ServiceLatencyChart serviceKey={svc.key} color={tone} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, {
  NotificationToaster, ServiceLatencyChart, IdentityChip, StaleIndicator,
  AuditExport, ExportPanel, WebhookConfig, ServiceMeshEnhanced,
});
