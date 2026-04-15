'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';

// ============ TYPES ============
interface ServiceHealth {
  name: string;
  port: number;
  path: string;
  status: 'online' | 'degraded' | 'offline' | 'checking';
  latency?: number;
  uptime?: number;
  details?: Record<string, any>;
  eventsPerSec?: number;
  memory?: { heapUsed: string; heapTotal: string };
}

interface Division {
  id: string;
  name: string;
  color: string;
  tier: number;
  agents: string[];
  activeCount: number;
  idleCount: number;
  totalAgents: number;
}

interface RegisteredAgent {
  name: string;
  emoji: string;
  division: string;
  role: string;
  tier: number;
  status: 'idle' | 'active' | 'error';
}

interface ActiveAgent {
  id: string;
  name: string;
  emoji: string;
  division: string;
  role: string;
  tier: number;
  status: 'working' | 'completed' | 'error' | 'idle';
  task: string;
  pid?: number;
  startTime: string;
}

interface TowerStatus {
  tower: { version: string; uptime: number; totalRegistered: number; totalActive: number; totalTeams: number };
  tiers: Record<string, { level: number; name: string; color: string }>;
  divisions: Record<string, Division>;
  teams: any[];
  activeAgents: ActiveAgent[];
  registeredAgents: RegisteredAgent[];
}

interface LogEntry {
  id: number;
  time: string;
  type: 'event' | 'command' | 'response' | 'error' | 'agent' | 'system' | 'chorus';
  source: string;
  message: string;
  metadata?: Record<string, any>;
}

interface ChorusLine {
  id: string;
  time: string;
  companion: string;
  emoji: string;
  message: string;
}

// ============ SERVICE CONFIG ============
const SERVICE_CONFIG = [
  { name: 'API Gateway', port: 7780, path: '/api/health', key: 'purpclaw-api' },
  { name: 'Neural Tower', port: 7790, path: '/tower/status', key: 'purpclaw-tower' },
  { name: 'Voice Matrix', port: 7781, path: '/health', key: 'purpclaw-voice' },
  { name: 'Bridge Nexus', port: 7779, path: '/health', key: 'purpclaw-bridge' },
  { name: 'Event Bus', port: 7782, path: '/health', key: 'purpclaw-eventbus' },
  { name: 'State Core', port: 7783, path: '/health', key: 'purpclaw-state' },
  { name: 'Orchestrator', port: 7784, path: '/health', key: 'purpclaw-orchestrator' },
  { name: 'Gatekeeper', port: 7791, path: '/health', key: 'purpclaw-gatekeeper' },
  { name: 'Web Interface', port: 3000, path: '/', key: 'purpclaw-nextjs' },
  { name: 'Companion Chorus', port: 7785, path: '/health', key: 'purpclaw-chorus' },
];

// ============ UTILITY ============
function formatUptime(seconds: number): string {
  if (!seconds) return '--';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTime(date = new Date()): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ============ MAIN COMPONENT ============
export default function MissionControl() {
  // Core state
  const [services, setServices] = useState<ServiceHealth[]>(SERVICE_CONFIG.map(s => ({ ...s, status: 'checking' })));
  const [towerStatus, setTowerStatus] = useState<TowerStatus | null>(null);
  const [activeAgents, setActiveAgents] = useState<ActiveAgent[]>([]);
  const [registeredAgents, setRegisteredAgents] = useState<RegisteredAgent[]>([]);
  const [divisions, setDivisions] = useState<Record<string, Division>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chorus, setChorus] = useState<ChorusLine[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<ActiveAgent | RegisteredAgent | null>(null);
  const [command, setCommand] = useState('');
  const [metrics, setMetrics] = useState({ eventsPerSec: 0, memory: '0MB', teams: 0 });

  const logIdRef = useRef(0);

  const addLog = useCallback((type: LogEntry['type'], source: string, message: string, metadata?: Record<string, any>) => {
    setLogs(prev => [{
      id: logIdRef.current++,
      time: formatTime(),
      type,
      source,
      message,
      metadata,
    }, ...prev.slice(0, 499)]);
  }, []);

  const addChorus = useCallback((companion: string, emoji: string, message: string) => {
    setChorus(prev => [{
      id: Date.now().toString() + Math.random().toString(36).substring(2),
      time: formatTime(),
      companion,
      emoji,
      message,
    }, ...prev.slice(0, 99)]);
  }, []);

  // ============ SSE: Tower Stream ============
  useEffect(() => {
    let es: EventSource | null = null;
    let retryCount = 0;

    const connect = () => {
      try {
        es = new EventSource('http://localhost:7790/tower/stream');

        es.onopen = () => {
          setSseConnected(true);
          retryCount = 0;
          addLog('system', 'SSE', 'Tower stream connected');
        };

        es.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            const data = msg.data || msg;
            const eventType = msg.type || data.type;

            if (eventType === 'agent_spawned' || eventType === 'agent_spawn') {
              addLog('agent', 'TOWER', `${data.name || data.agentName} spawned (PID ${data.pid || 'N/A'})`, data);
              refreshTower();
            } else if (eventType === 'agent_complete') {
              addLog('agent', 'TOWER', `${data.agentName} completed (code ${data.code})`, data);
              refreshTower();
            } else if (eventType === 'agent_output') {
              const text = (data.output || '').toString().trim();
              if (text) addLog('event', data.agentName || 'AGENT', text.substring(0, 200), data);
            } else if (eventType === 'agent_error') {
              addLog('error', data.agentName || 'AGENT', data.output || 'Agent error', data);
            } else if (eventType === 'broadcast' && data.topic?.includes('chorus')) {
              // Chorus events via EventBus bridge may come here
            }
          } catch {}
        };

        es.onerror = () => {
          setSseConnected(false);
          es?.close();
          retryCount++;
          if (retryCount < 10) {
            setTimeout(connect, Math.min(2000 * retryCount, 10000));
          }
        };
      } catch {}
    };

    connect();
    return () => es?.close();
  }, [addLog]);

  // ============ SSE: EventBus (for chorus + system events) ============
  useEffect(() => {
    let es: EventSource | null = null;
    let retryCount = 0;

    const connect = () => {
      try {
        es = new EventSource('http://localhost:7782/stream');

        es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.topic?.includes('chorus') || data.topic?.includes('companion')) {
              const msg = data.message || data.payload || data;
              const companion = msg.companion || msg.name || 'Companion';
              const emoji = msg.emoji || '🎭';
              const text = msg.response || msg.message || msg.text || JSON.stringify(msg);
              if (text && text !== '[object Object]') {
                addChorus(companion, emoji, text.toString().substring(0, 300));
                addLog('chorus', companion, text.toString().substring(0, 200), data);
              }
            } else if (data.topic?.includes('agent')) {
              addLog('event', 'EVENTBUS', `${data.topic}`, data);
            }
          } catch {}
        };

        es.onerror = () => {
          es?.close();
          retryCount++;
          if (retryCount < 5) setTimeout(connect, 3000 * retryCount);
        };
      } catch {}
    };

    connect();
    return () => es?.close();
  }, [addLog, addChorus]);

  // ============ Polling ============
  const refreshTower = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:7790/tower/status', { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data: TowerStatus = await res.json();
        setTowerStatus(data);
        setDivisions(data.divisions || {});
        setActiveAgents(data.activeAgents || []);
        setRegisteredAgents(data.registeredAgents || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const checkServices = async () => {
      const results = await Promise.all(
        SERVICE_CONFIG.map(async (cfg) => {
          const start = Date.now();
          try {
            const url = `http://localhost:${cfg.port}${cfg.path}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
            const latency = Date.now() - start;
            let details: any = {};
            try { details = await res.json(); } catch {}

            let status: ServiceHealth['status'] = 'online';
            if (latency > 1000) status = 'degraded';
            if (!res.ok) status = 'offline';

            return {
              name: cfg.name,
              port: cfg.port,
              path: cfg.path,
              status,
              latency,
              uptime: details.uptime,
              details,
              eventsPerSec: details.eventCount ? details.eventCount / (details.uptime || 1) * 1000 : undefined,
              memory: details.memory,
            } as ServiceHealth;
          } catch {
            return { name: cfg.name, port: cfg.port, path: cfg.path, status: 'offline' } as ServiceHealth;
          }
        })
      );
      setServices(results);
    };

    const fetchMetrics = async () => {
      try {
        const [eventRes, stateRes] = await Promise.all([
          fetch('http://localhost:7782/health', { signal: AbortSignal.timeout(2000) }),
          fetch('http://localhost:7783/health', { signal: AbortSignal.timeout(2000) }),
        ]);

        let eps = 0;
        if (eventRes.ok) {
          const eventData = await eventRes.json();
          eps = eventData.eventCount ? eventData.eventCount / (eventData.uptime || 1) * 1000 : 0;
        }

        let mem = '0MB';
        let teams = 0;
        if (stateRes.ok) {
          const stateData = await stateRes.json();
          mem = stateData.memory?.heapUsed || '0MB';
          teams = stateData.teamCount || 0;
        }

        setMetrics({ eventsPerSec: eps, memory: mem, teams });
      } catch {}
    };

    refreshTower();
    checkServices();
    fetchMetrics();

    const interval = setInterval(() => {
      refreshTower();
      checkServices();
      fetchMetrics();
    }, 3000);

    return () => clearInterval(interval);
  }, [refreshTower]);

  // ============ COMMANDS ============
  const sendCommand = useCallback(async () => {
    if (!command.trim()) return;
    const text = command;
    setCommand('');
    addLog('command', 'USER', text);

    try {
      const res = await fetch('http://localhost:7780/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: text }),
      });
      const data = await res.json();
      addLog('response', 'API', JSON.stringify(data).substring(0, 200), data);
    } catch (e: any) {
      addLog('error', 'NET', e.message);
    }
  }, [command, addLog]);

  const spawnAgent = useCallback(async (agentName: string) => {
    addLog('agent', 'SPAWN', `Spawning ${agentName}...`);
    try {
      const res = await fetch('http://localhost:7790/api/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName, task: `Manual spawn: ${agentName}` }),
      });
      if (res.ok) {
        const data = await res.json();
        addLog('agent', 'SPAWN', `${agentName} spawned: ${data.agent?.id}`, data);
      } else {
        addLog('error', 'SPAWN', `Failed to spawn ${agentName}: ${res.status}`);
      }
    } catch (e: any) {
      addLog('error', 'SPAWN', e.message);
    }
    setTimeout(refreshTower, 500);
  }, [addLog, refreshTower]);

  // ============ DERIVED STATE ============
  const healthyCount = services.filter(s => s.status === 'online').length;
  const totalEvents = useMemo(() => services.find(s => s.port === 7782)?.details?.eventCount || 0, [services]);
  const totalSubscribers = useMemo(() => services.find(s => s.port === 7782)?.details?.subscriberCount || 0, [services]);

  const divisionList = useMemo(() => Object.values(divisions).sort((a, b) => a.tier - b.tier), [divisions]);

  const filteredAgents = useMemo(() => {
    if (!selectedDivision) return registeredAgents;
    return registeredAgents.filter(a => a.division === selectedDivision);
  }, [registeredAgents, selectedDivision]);

  // ============ RENDER HELPERS ============
  const statusDot = (status: string, size = 'w-2 h-2') => {
    const color = status === 'online' || status === 'healthy' || status === 'working' ? '#34d399' :
                  status === 'degraded' || status === 'idle' ? '#fbbf24' : '#f87171';
    const glow = status === 'online' || status === 'healthy' || status === 'working' ? 'rgba(52,211,153,0.5)' :
                 status === 'degraded' ? 'rgba(251,191,36,0.4)' : 'rgba(248,113,113,0.4)';
    return (
      <div className={`${size} rounded-full`} style={{ backgroundColor: color, boxShadow: `0 0 8px ${glow}` }} />
    );
  };

  return (
    <div className="min-h-screen w-full bg-[#050508] text-white overflow-hidden" style={{ fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace" }}>
      {/* Background grid */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* HEADER */}
      <header className="relative z-50 flex items-center justify-between px-5 py-3 border-b border-white/5 bg-black/80 backdrop-blur-xl">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 12px rgba(52,211,153,0.6)' }} />
              <div className="absolute inset-0 rounded-full animate-ping opacity-50 bg-emerald-400" />
            </div>
            <span className="text-sm font-bold tracking-[0.25em] text-white/90">PURPCLAW</span>
          </div>
          <span className="text-[10px] text-white/20 tracking-widest">MISSION CONTROL INTERFACE</span>
          <span className="text-[10px] text-white/10">v8.3.0</span>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-5 text-[10px]">
            <div className="flex items-center gap-2">
              <span className="text-white/30">SERVICES</span>
              <span className="text-emerald-400 font-medium">{healthyCount}/{services.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/30">AGENTS</span>
              <span className="text-purple-400 font-medium">{activeAgents.length}/{registeredAgents.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/30">EVENTS</span>
              <span className="text-cyan-400 font-medium">{totalEvents.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/30">TEAMS</span>
              <span className="text-amber-400 font-medium">{metrics.teams}</span>
            </div>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${sseConnected ? 'bg-cyan-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-[10px] text-white/40 tracking-widest">{sseConnected ? 'LIVE' : 'RECONNECTING'}</span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <span className="text-[10px] text-white/20">{formatTime()}</span>
        </div>
      </header>

      {/* MAIN GRID */}
      <main className="relative z-10 h-[calc(100vh-56px)] p-4 grid grid-cols-12 gap-4 overflow-hidden">

        {/* LEFT COLUMN: Divisions + Agent Registry */}
        <div className="col-span-3 flex flex-col gap-3 h-full overflow-hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-white/30">Divisions</h2>
            <span className="text-[10px] text-white/20">{divisionList.length} total</span>
          </div>

          <div className="flex-1 rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {divisionList.map(div => {
                const isSelected = selectedDivision === div.id;
                return (
                  <button
                    key={div.id}
                    onClick={() => setSelectedDivision(isSelected ? null : div.id)}
                    className={`w-full text-left rounded-lg p-2 transition-all border ${isSelected ? 'bg-white/5 border-white/10' : 'border-transparent hover:bg-white/[0.02]'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: div.color, boxShadow: `0 0 6px ${div.color}` }} />
                        <span className="text-xs font-medium text-white/80">{div.id}</span>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">T{div.tier}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-white/30">{div.totalAgents} agents</span>
                      <span className={div.activeCount > 0 ? 'text-emerald-400' : 'text-white/20'}>
                        {div.activeCount > 0 ? `${div.activeCount} active` : 'idle'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between mt-1">
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-white/30">
              {selectedDivision ? `${selectedDivision} Agents` : 'All Agents'}
            </h2>
            <span className="text-[10px] text-white/20">{filteredAgents.length}</span>
          </div>

          <div className="flex-1 rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredAgents.map(agent => {
                const live = activeAgents.find(a => a.name === agent.name);
                const isActive = !!live;
                return (
                  <button
                    key={agent.name}
                    onClick={() => setSelectedAgent(live || agent)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-all group text-left"
                  >
                    <span className="text-base">{agent.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-white/70 truncate">{agent.name}</div>
                      <div className="text-[9px] text-white/20 truncate">{agent.role}</div>
                    </div>
                    <div className="shrink-0">
                      {statusDot(isActive ? live?.status || 'working' : 'idle')}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: Active Agents + Service Health + Command */}
        <div className="col-span-6 flex flex-col gap-3 h-full overflow-hidden">
          {/* Metrics Bar */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="text-[9px] uppercase tracking-wider text-white/30 mb-1">Events/sec</div>
              <div className="text-xl font-light text-cyan-400">{metrics.eventsPerSec.toFixed(1)}</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="text-[9px] uppercase tracking-wider text-white/30 mb-1">Active Agents</div>
              <div className="text-xl font-light text-purple-400">{activeAgents.length}</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="text-[9px] uppercase tracking-wider text-white/30 mb-1">Subscribers</div>
              <div className="text-xl font-light text-amber-400">{totalSubscribers}</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="text-[9px] uppercase tracking-wider text-white/30 mb-1">Heap Memory</div>
              <div className="text-xl font-light text-emerald-400">{metrics.memory}</div>
            </div>
          </div>

          {/* Active Agents */}
          <div className="flex-1 rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden flex flex-col min-h-0">
            <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-[10px] uppercase tracking-[0.25em] text-white/30">Active Operations</h2>
              <span className="text-[10px] text-white/20">{activeAgents.length} running</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {activeAgents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-white/20 text-xs gap-2">
                  <span className="text-2xl opacity-50">◈</span>
                  <span>No active operations</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {activeAgents.map(agent => (
                    <div key={agent.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 hover:border-white/10 transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{agent.emoji}</span>
                          <span className="text-sm font-medium text-white/90">{agent.name}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">{agent.division}</span>
                        </div>
                        {statusDot(agent.status)}
                      </div>
                      <div className="text-[10px] text-white/40 truncate mb-1">{agent.task || 'No task'}</div>
                      <div className="flex items-center justify-between text-[9px] text-white/20">
                        <span>PID {agent.pid || 'N/A'}</span>
                        <span>{formatUptime((Date.now() - new Date(agent.startTime).getTime()) / 1000)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Service Health */}
          <div className="h-48 rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-[10px] uppercase tracking-[0.25em] text-white/30">System Services</h2>
              <span className="text-[10px] text-white/20">{healthyCount}/{services.length} healthy</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <div className="grid grid-cols-2 gap-2">
                {services.map(svc => (
                  <div key={svc.name} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.03] transition-all">
                    {statusDot(svc.status)}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-white/70 truncate">{svc.name}</div>
                      <div className="text-[9px] text-white/20">:{svc.port}</div>
                    </div>
                    {svc.latency !== undefined && (
                      <div className="text-[10px] text-white/30 w-12 text-right">{svc.latency}ms</div>
                    )}
                    <div className="text-[9px] font-medium uppercase px-1.5 py-0.5 rounded"
                      style={{
                        color: svc.status === 'online' ? '#34d399' : svc.status === 'degraded' ? '#fbbf24' : '#f87171',
                        backgroundColor: svc.status === 'online' ? 'rgba(52,211,153,0.1)' : svc.status === 'degraded' ? 'rgba(251,191,36,0.1)' : 'rgba(248,113,113,0.1)',
                      }}
                    >
                      {svc.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Command Input */}
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <div className="flex items-center gap-3">
              <span className="text-emerald-400 font-bold">❯</span>
              <input
                type="text"
                value={command}
                onChange={e => setCommand(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendCommand()}
                placeholder="Broadcast command to swarm..."
                className="flex-1 bg-transparent text-sm text-white/80 focus:outline-none placeholder:text-white/20"
              />
              <button
                onClick={sendCommand}
                className="px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Chorus + Logs */}
        <div className="col-span-3 flex flex-col gap-3 h-full overflow-hidden">
          {/* Chorus Feed */}
          <div className="flex-1 rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden flex flex-col min-h-0">
            <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-[10px] uppercase tracking-[0.25em] text-white/30">Companion Chorus</h2>
              <span className="text-[10px] text-white/20">{chorus.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {chorus.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-white/20 text-xs gap-2">
                  <span className="text-2xl opacity-50">🎭</span>
                  <span>Chorus quiet...</span>
                </div>
              ) : (
                chorus.map(line => (
                  <div key={line.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{line.emoji}</span>
                      <span className="text-[10px] font-medium text-white/60">{line.companion}</span>
                      <span className="text-[9px] text-white/20 ml-auto">{line.time}</span>
                    </div>
                    <div className="text-[11px] text-white/80 leading-snug">{line.message}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Event Log */}
          <div className="flex-1 rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden flex flex-col min-h-0">
            <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-[10px] uppercase tracking-[0.25em] text-white/30">Event Stream</h2>
              <button onClick={() => setLogs([])} className="text-[10px] text-white/20 hover:text-white/40">Clear</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <div className="space-y-0.5">
                {logs.map(log => {
                  const typeColors: Record<string, string> = {
                    event: '#38bdf8',
                    command: '#f472b6',
                    response: '#34d399',
                    error: '#f87171',
                    agent: '#fbbf24',
                    system: '#a78bfa',
                    chorus: '#e879f9',
                  };
                  const color = typeColors[log.type] || '#6b7280';
                  return (
                    <div key={log.id} className="flex items-start gap-2 px-2 py-1 rounded hover:bg-white/[0.02]">
                      <span className="text-[9px] text-white/20 font-mono shrink-0 w-14">{log.time}</span>
                      <span className="text-[9px] font-medium uppercase tracking-wider shrink-0 w-12" style={{ color }}>{log.type}</span>
                      <span className="text-[9px] text-white/30 shrink-0 w-16 truncate">{log.source}</span>
                      <span className="text-[10px] text-white/60 font-mono flex-1 truncate">{log.message}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
