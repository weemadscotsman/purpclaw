/* data-hooks.js — REAL data only.
 * Connects to PURPCLAW backend:
 *   :7780 unified_api      /api/health, /api/status, /api/stream (SSE), /api/chat
 *   :7782 eventbus         /state, /events/* (SSE)
 *   :7783 state_store      /health
 *   :7784 orchestrator     /api/pipeline, /api/orchestrate, /api/workflow/:id, /api/events (SSE)
 *   :7790 agent_tower      /tower/status, /tower/stream (SSE), /api/spawn
 *   :7791 gatekeeper       /api/status, /api/amend-patch
 *   :7786 metrics          /diagnose, /vote
 *   :7787 pool             /health, /query
 *   :7788 cognitive        /health
 *
 * Strategy: try Next.js /api/* aggregators first (same-origin, no CORS),
 * fall back to direct localhost:* (requires CORS on backend, which PURPCLAW already has).
 * When neither responds, components render empty state.
 */

const { useState: useS, useEffect: useE, useRef: useR, useCallback: useCB, useMemo: useM, createContext, useContext } = React;

// ─────────────────────────────────────────────────────────────
// division metadata (client-side only — backend gives us the string)
// ─────────────────────────────────────────────────────────────
const DIVISIONS = {
  INTELLIGENCE:   { name: 'Intelligence',   color: '#22d3ee', icon: '◇' },
  ENGINEERING:    { name: 'Engineering',    color: '#8b5cf6', icon: '⚙' },
  SECURITY:       { name: 'Security',       color: '#f43f5e', icon: '⌂' },
  OPERATIONS:     { name: 'Operations',     color: '#fbbf24', icon: '⚡' },
  MEDIA_OPS:      { name: 'Media Ops',      color: '#ec4899', icon: '◈' },
  MANAGEMENT:     { name: 'Management',     color: '#facc15', icon: '◎' },
  SCIENCE:        { name: 'Science',        color: '#06b6d4', icon: '⌬' },
  CREATIVE:       { name: 'Creative',       color: '#f472b6', icon: '✦' },
  LOBBY:          { name: 'Lobby',          color: '#67e8f9', icon: '⌬' },
  INFRASTRUCTURE: { name: 'Infrastructure', color: '#a3a300', icon: '⊞' },
  UNKNOWN:        { name: 'Unknown',        color: '#7b7fa3', icon: '?' },
};
function divMeta(d) {
  if (!d) return DIVISIONS.UNKNOWN;
  const up = String(d).toUpperCase().replace(/[\s-]/g, '_');
  return DIVISIONS[up] || { ...DIVISIONS.UNKNOWN, name: String(d), id: up };
}

// floor visual ordering — top to bottom of the tower
const FLOOR_ORDER = [
  'INTELLIGENCE', 'CREATIVE', 'SCIENCE', 'MEDIA_OPS',
  'ENGINEERING', 'SECURITY', 'OPERATIONS', 'MANAGEMENT',
  'INFRASTRUCTURE', 'LOBBY',
];

// ─────────────────────────────────────────────────────────────
// fetch helpers
// ─────────────────────────────────────────────────────────────
function withTimeout(ms) {
  try { return AbortSignal.timeout(ms); } catch { return undefined; }
}

async function tryFetchJson(url, timeoutMs = 2500) {
  try {
    const r = await fetch(url, { signal: withTimeout(timeoutMs) });
    if (!r.ok) return null;
    const j = await r.json();
    return j;
  } catch { return null; }
}

async function tryProxy(port, path, timeoutMs = 2500) {
  // try Next.js proxy first
  const proxyUrl = `/api/service-proxy?port=${port}&path=${encodeURIComponent(path)}`;
  const p = await tryFetchJson(proxyUrl, timeoutMs);
  if (p) return p.data ?? p;
  // direct (requires CORS on backend)
  const d = await tryFetchJson(`http://localhost:${port}${path}`, timeoutMs);
  return d ? (d.data ?? d) : null;
}

// ─────────────────────────────────────────────────────────────
// useMissionData — aggregator
// ─────────────────────────────────────────────────────────────
function useMissionData(intervalMs = 4000) {
  const [state, setState] = useS({ data: null, loading: true, connected: false, lastTick: null });

  useE(() => {
    let cancelled = false;
    let timer;

    async function tick() {
      // try Next.js aggregator first
      const agg = await tryFetchJson('/api/mission-data', 3500);
      if (cancelled) return;
      if (agg && (agg.api || agg.tower)) {
        setState({ data: agg, loading: false, connected: true, lastTick: Date.now() });
        return;
      }
      // fall back to direct probes
      const [api, tower, bus, pipeline] = await Promise.all([
        tryProxy(7780, '/api/status'),
        tryProxy(7790, '/tower/status'),
        tryProxy(7782, '/state'),
        tryProxy(7784, '/api/pipeline'),
      ]);
      if (cancelled) return;
      const connected = !!(api || tower || bus || pipeline);
      setState({
        data: connected ? {
          api: api || null,
          tower: tower || { activeAgents: [], registeredAgents: [], teams: [] },
          eventBus: { recentEvents: bus?.recentEvents || [] },
          pipeline: pipeline || null,
        } : null,
        loading: false,
        connected,
        lastTick: Date.now(),
      });
    }

    tick();
    timer = setInterval(tick, intervalMs);
    return () => { cancelled = true; clearInterval(timer); };
  }, [intervalMs]);

  return state;
}

// ─────────────────────────────────────────────────────────────
// useStreamEvents — multi-SSE union (api + tower + bus + orch)
// ─────────────────────────────────────────────────────────────
function useStreamEvents(maxKeep = 500) {
  const [events, setEvents] = useS([]);
  const [status, setStatus] = useS({ api: false, tower: false, bus: false, orch: false });

  useE(() => {
    const sources = [];
    function add(payload, source) {
      setEvents(prev => [{
        ...payload,
        _id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        _source: source,
        _time: new Date(),
      }, ...prev].slice(0, maxKeep));
    }
    function connect(url, source) {
      let es;
      try {
        es = new EventSource(url);
        es.onopen = () => setStatus(s => ({ ...s, [source]: true }));
        es.onmessage = (e) => {
          try { add(JSON.parse(e.data), source); }
          catch { add({ raw: e.data?.slice?.(0, 200) }, source); }
        };
        es.onerror = () => setStatus(s => ({ ...s, [source]: false }));
        sources.push(es);
      } catch {}
    }
    connect('http://localhost:7780/api/stream',  'api');
    connect('http://localhost:7790/tower/stream','tower');
    connect('http://localhost:7782/events/*',    'bus');
    connect('http://localhost:7784/api/events',  'orch');
    return () => sources.forEach(es => { try { es.close(); } catch {} });
  }, [maxKeep]);

  return { events, status };
}

// ─────────────────────────────────────────────────────────────
// individual probes
// ─────────────────────────────────────────────────────────────
function useMochi(intervalMs = 8000) {
  const [s, setS_] = useS({ data: null, connected: false });
  useE(() => {
    let cancelled = false;
    async function tick() {
      const a = await tryFetchJson('/api/mochi', 3000);
      if (cancelled) return;
      if (a && a.name) { setS_({ data: a, connected: true }); return; }
      setS_({ data: null, connected: false });
    }
    tick();
    const t = setInterval(tick, intervalMs);
    return () => { cancelled = true; clearInterval(t); };
  }, [intervalMs]);
  return s;
}

function useGatekeeper(intervalMs = 4000) {
  const [s, setS_] = useS({ data: null, connected: false });
  useE(() => {
    let cancelled = false;
    async function tick() {
      const a = await tryFetchJson('/api/gatekeeper-status', 3000);
      if (cancelled) return;
      if (a && !a.error) { setS_({ data: a, connected: true }); return; }
      const d = await tryProxy(7791, '/api/status');
      if (cancelled) return;
      setS_({ data: d, connected: !!d });
    }
    tick();
    const t = setInterval(tick, intervalMs);
    return () => { cancelled = true; clearInterval(t); };
  }, [intervalMs]);
  return s;
}

function useEventTimeline(opts = {}) {
  const { topics = 'agent,swarm,tool,orchestrator', limit = 200, intervalMs = 3000 } = opts;
  const [s, setS_] = useS({ events: [], connected: false });
  useE(() => {
    let cancelled = false;
    async function tick() {
      const a = await tryFetchJson(`/api/event-timeline?topics=${topics}&limit=${limit}`, 3000);
      if (cancelled) return;
      if (a && a.events) { setS_({ events: a.events, connected: true }); return; }
      const d = await tryProxy(7782, '/state');
      if (cancelled) return;
      if (d) {
        const events = (d.recentEvents || []).slice(-limit).reverse().map(e => ({
          id: e.id || `${e.ts}`,
          ts: e.ts, topic: e.topic, type: e.type,
          agentId: e.agentId, agentName: e.agentName,
          message: e.message, data: e,
        }));
        setS_({ events, connected: true });
      } else {
        setS_({ events: [], connected: false });
      }
    }
    tick();
    const t = setInterval(tick, intervalMs);
    return () => { cancelled = true; clearInterval(t); };
  }, [topics, limit, intervalMs]);
  return s;
}

// known services to health-check (ports match service_registry.js)
const SERVICE_LIST = [
  { name: 'unified_api',   port: 7780, path: '/api/health',     key: 'api' },
  { name: 'agent_tower',   port: 7790, path: '/tower/status',   key: 'tower' },
  { name: 'eventbus',      port: 7782, path: '/health',         key: 'eventbus' },
  { name: 'state_store',   port: 7783, path: '/health',         key: 'state' },
  { name: 'orchestrator',  port: 7784, path: '/api/health',     key: 'orchestrator' },
  { name: 'gatekeeper',    port: 7791, path: '/health',         key: 'gatekeeper' },
  { name: 'pool',          port: 7885, path: '/health',         key: 'pool',        optional: true },
  { name: 'metrics',       port: 7890, path: '/health',         key: 'metrics',     optional: true },
  { name: 'modal_logic',   port: 7785, path: '/health',         key: 'modal',       optional: true },
  { name: 'diagnostics',   port: 7786, path: '/health',         key: 'diagnostics', optional: true },
  { name: 'rules_engine',  port: 7787, path: '/health',         key: 'rules',       optional: true },
  { name: 'autodream',     port: 7895, path: '/health',         key: 'autodream',   optional: true },
  { name: 'voice_coord',   port: 7781, path: '/health',         key: 'voice',       optional: true },
];

function useServices(intervalMs = 4000) {
  const [services, setServices] = useS(SERVICE_LIST.map(s => ({ ...s, status: 'checking', latency: null })));
  useE(() => {
    let cancelled = false;
    async function check() {
      const results = await Promise.all(SERVICE_LIST.map(async cfg => {
        const start = Date.now();
        const proxyOk = await tryFetchJson(`/api/service-proxy?port=${cfg.port}&path=${encodeURIComponent(cfg.path)}`, 2000);
        if (proxyOk) {
          const latency = Date.now() - start;
          return { ...cfg, status: latency > 800 ? 'degraded' : 'online', latency };
        }
        // direct
        const direct = await tryFetchJson(`http://localhost:${cfg.port}${cfg.path}`, 2000);
        if (direct) {
          const latency = Date.now() - start;
          return { ...cfg, status: latency > 800 ? 'degraded' : 'online', latency };
        }
        return { ...cfg, status: 'offline', latency: null };
      }));
      if (!cancelled) setServices(results);
    }
    check();
    const t = setInterval(check, intervalMs);
    return () => { cancelled = true; clearInterval(t); };
  }, [intervalMs]);
  return services;
}

// ─────────────────────────────────────────────────────────────
// build floors from real agents
// ─────────────────────────────────────────────────────────────
function buildFloors(activeAgents, registeredAgents) {
  // dedupe registered overlapping with active by name
  const allAgents = [
    ...activeAgents,
    ...registeredAgents.filter(r => !activeAgents.find(a => a.name === r.name)),
  ];

  // group by division
  const byDiv = new Map();
  allAgents.forEach(a => {
    const divKey = String(a.division || 'UNKNOWN').toUpperCase().replace(/[\s-]/g, '_');
    if (!byDiv.has(divKey)) byDiv.set(divKey, { div: divKey, agents: [], working: 0 });
    const entry = byDiv.get(divKey);
    entry.agents.push(a);
    if (a.status === 'working') entry.working++;
  });

  const floors = [];
  let level = 1;
  // lobby always at bottom
  floors.push({ id: 'lobby', level: level++, div: 'LOBBY', agents: 0, working: 0, divisionAgents: [] });
  // infrastructure always present
  const infra = byDiv.get('INFRASTRUCTURE');
  floors.push({
    id: 'infrastructure', level: level++, div: 'INFRASTRUCTURE',
    agents: infra?.agents.length || 0,
    working: infra?.working || 0,
    divisionAgents: infra?.agents || [],
  });
  // ordered divisions
  for (const divKey of FLOOR_ORDER) {
    if (divKey === 'LOBBY' || divKey === 'INFRASTRUCTURE') continue;
    const entry = byDiv.get(divKey);
    if (!entry || entry.agents.length === 0) continue;
    floors.push({
      id: `f-${divKey.toLowerCase()}`,
      level: level++,
      div: divKey,
      agents: entry.agents.length,
      working: entry.working,
      divisionAgents: entry.agents,
    });
  }
  // any extra divisions not in the order list
  for (const [divKey, entry] of byDiv.entries()) {
    if (FLOOR_ORDER.includes(divKey)) continue;
    if (entry.agents.length === 0) continue;
    floors.push({
      id: `f-${divKey.toLowerCase()}`,
      level: level++,
      div: divKey,
      agents: entry.agents.length,
      working: entry.working,
      divisionAgents: entry.agents,
    });
  }
  // sort top-down (highest level first)
  return floors.slice().reverse();
}

// ─────────────────────────────────────────────────────────────
// DataContext
// ─────────────────────────────────────────────────────────────
const DataContext = createContext(null);

function DataProvider({ children }) {
  const mission       = useMissionData();
  const stream        = useStreamEvents();
  const mochi         = useMochi();
  const gatekeeper    = useGatekeeper();
  const eventTimeline = useEventTimeline();
  const services      = useServices();

  const tower    = mission.data?.tower || { activeAgents: [], registeredAgents: [], teams: [] };
  const pipeline = mission.data?.pipeline;

  const floors = useM(
    () => buildFloors(tower.activeAgents || [], tower.registeredAgents || []),
    [tower.activeAgents, tower.registeredAgents]
  );

  // map agents (active+registered) into the shape skyscraper expects
  const agents = useM(() => {
    const out = [];
    (tower.activeAgents || []).forEach(a => out.push({
      id: a.id || `${a.name}-${a.pid || ''}`,
      name: a.name,
      emoji: a.emoji || '◉',
      floor: floors.find(f => f.div === String(a.division || '').toUpperCase().replace(/[\s-]/g, '_'))?.id || 'lobby',
      division: String(a.division || 'UNKNOWN').toUpperCase().replace(/[\s-]/g, '_'),
      status: a.status || 'working',
      task: a.task || '',
      pid: a.pid,
      startTime: a.startTime,
    }));
    (tower.registeredAgents || []).forEach(r => {
      if (out.find(a => a.name === r.name)) return;
      out.push({
        id: `reg-${r.name}`,
        name: r.name,
        emoji: r.emoji || '◉',
        floor: floors.find(f => f.div === String(r.division || '').toUpperCase().replace(/[\s-]/g, '_'))?.id || 'lobby',
        division: String(r.division || 'UNKNOWN').toUpperCase().replace(/[\s-]/g, '_'),
        status: 'idle',
        task: '',
        tier: r.tier,
      });
    });
    return out;
  }, [tower.activeAgents, tower.registeredAgents, floors]);

  const connections = {
    mission: mission.connected,
    api:     stream.status.api,
    tower:   stream.status.tower,
    bus:     stream.status.bus,
    orch:    stream.status.orch,
  };

  const anyConnected = mission.connected || stream.status.api || stream.status.tower
                       || stream.status.bus || stream.status.orch || services.some(s => s.status === 'online');

  const value = {
    mission, stream, mochi, gatekeeper, eventTimeline, services,
    tower, pipeline, floors, agents, connections, anyConnected,
  };

  return React.createElement(DataContext.Provider, { value }, children);
}

function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be inside <DataProvider>');
  return ctx;
}

Object.assign(window, {
  DataProvider, useData, DIVISIONS, divMeta, FLOOR_ORDER,
  buildFloors, tryProxy, tryFetchJson,
});
