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

interface Agent {
  id: string;
  name: string;
  emoji: string;
  status: 'idle' | 'active' | 'error' | 'spawning';
  division: string;
  tier: number;
  uptime?: number;
  tasks?: number;
  lastActive?: string;
}

interface LogEntry {
  id: number;
  time: string;
  type: 'event' | 'command' | 'response' | 'error' | 'agent' | 'system';
  source: string;
  message: string;
  metadata?: Record<string, any>;
}

interface MetricPoint {
  t: number;
  v: number;
}

interface SwarmNode {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  division: string;
  tier: number;
  status: 'idle' | 'active' | 'error';
}

// ============ SERVICE CONFIG ============
const SERVICE_CONFIG = [
  { name: 'API Gateway', port: 7780, path: '/api/health', key: 'purpclaw-api', icon: '◇' },
  { name: 'Neural Tower', port: 7790, path: '/tower/status', key: 'purpclaw-tower', icon: '◈' },
  { name: 'Voice Matrix', port: 7781, path: '/health', key: 'purpclaw-voice', icon: '◎' },
  { name: 'Bridge Nexus', port: 7779, path: '/health', key: 'purpclaw-bridge', icon: '⬡' },
  { name: 'Event Bus', port: 7782, path: '/health', key: 'purpclaw-eventbus', icon: '⬢' },
  { name: 'State Core', port: 7783, path: '/health', key: 'purpclaw-state', icon: '◉' },
  { name: 'Orchestrator', port: 7784, path: '/health', key: 'purpclaw-orchestrator', icon: '⬟' },
  { name: 'Gatekeeper', port: 7791, path: '/health', key: 'purpclaw-gatekeeper', icon: '◆' },
  { name: 'Web Interface', port: 3000, path: '/', key: 'purpclaw-nextjs', icon: '◇' },
];

// ============ AGENT DEFINITIONS ============
const AGENT_DEFS = [
  // Strategic Division (Tier 3)
  { name: 'dragon', emoji: '🐉', division: 'Strategic', tier: 3 },
  { name: 'wolf', emoji: '🐺', division: 'Strategic', tier: 3 },
  { name: 'snake', emoji: '🐍', division: 'Strategic', tier: 3 },
  { name: 'guardian', emoji: '🛡️', division: 'Strategic', tier: 3 },
  { name: 'scientist', emoji: '🔬', division: 'Strategic', tier: 3 },
  // Operations Division (Tier 2)
  { name: 'owl', emoji: '🦉', division: 'Operations', tier: 2 },
  { name: 'ghost', emoji: '👻', division: 'Operations', tier: 2 },
  { name: 'spider', emoji: '🕷️', division: 'Operations', tier: 2 },
  { name: 'phantom', emoji: '👻', division: 'Operations', tier: 2 },
  { name: 'panther', emoji: '🐆', division: 'Operations', tier: 2 },
  { name: 'fox', emoji: '🦊', division: 'Operations', tier: 2 },
  { name: 'jaguar', emoji: '🐆', division: 'Operations', tier: 2 },
  { name: 'mantis', emoji: '🕸️', division: 'Operations', tier: 2 },
  { name: 'shark', emoji: '🦈', division: 'Operations', tier: 2 },
  { name: 'gorilla', emoji: '🦍', division: 'Operations', tier: 2 },
  { name: 'goose', emoji: '🪿', division: 'Operations', tier: 2 },
  { name: 'parrot', emoji: '🦜', division: 'Operations', tier: 2 },
  { name: 'bunny', emoji: '🐰', division: 'Operations', tier: 2 },
  { name: 'rabbit', emoji: '🐇', division: 'Operations', tier: 2 },
  { name: 'crow', emoji: '🐦', division: 'Operations', tier: 2 },
  { name: 'panda', emoji: '🐼', division: 'Operations', tier: 2 },
  { name: 'elephant', emoji: '🐘', division: 'Operations', tier: 2 },
  // Foundation Division (Tier 1)
  { name: 'robot', emoji: '🤖', division: 'Foundation', tier: 1 },
  { name: 'bee', emoji: '🐝', division: 'Foundation', tier: 1 },
  { name: 'turtle', emoji: '🐢', division: 'Foundation', tier: 1 },
  { name: 'hamster', emoji: '🐹', division: 'Foundation', tier: 1 },
  { name: 'squirrel', emoji: '🐿️', division: 'Foundation', tier: 1 },
  { name: 'duck', emoji: '🦆', division: 'Foundation', tier: 1 },
  { name: 'koala', emoji: '🐨', division: 'Foundation', tier: 1 },
  { name: 'axolotl', emoji: '🦎', division: 'Foundation', tier: 1 },
  { name: 'chonk', emoji: '🐱', division: 'Foundation', tier: 1 },
  { name: 'mushroom', emoji: '🍄', division: 'Foundation', tier: 1 },
  { name: 'octopus', emoji: '🐙', division: 'Foundation', tier: 1 },
  { name: 'karen', emoji: '💁', division: 'Foundation', tier: 1 },
  { name: 'lemur', emoji: '🦝', division: 'Foundation', tier: 1 },
  { name: 'phoenix', emoji: '🔥', division: 'Foundation', tier: 1 },
  { name: 'hawk', emoji: '🦅', division: 'Foundation', tier: 1 },
  { name: 'void', emoji: '⚫', division: 'Foundation', tier: 1 },
  { name: 'cactus', emoji: '🌵', division: 'Foundation', tier: 1 },
  { name: 'penguin', emoji: '🐧', division: 'Foundation', tier: 1 },
];

const DIVISION_COLORS: Record<string, string> = {
  Strategic: '#f472b6',
  Operations: '#a78bfa',
  Foundation: '#38bdf8',
};

const DIVISION_BG: Record<string, string> = {
  Strategic: 'rgba(244,114,182,0.08)',
  Operations: 'rgba(167,139,250,0.08)',
  Foundation: 'rgba(56,189,248,0.08)',
};

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

function formatBytes(str: string): string {
  if (!str) return '--';
  const match = str.match(/(\d+)/);
  if (!match) return str;
  const bytes = parseInt(match[1]);
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)}GB`;
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)}MB`;
  if (bytes > 1e3) return `${(bytes / 1e3).toFixed(0)}KB`;
  return `${bytes}B`;
}

// ============ COMPONENTS ============

// Metric Card Component
function MetricCard({ label, value, sub, color, icon }: { label: string; value: string | number; sub?: string; color: string; icon: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent p-4 group hover:border-white/10 transition-all duration-300">
      <div className="absolute top-0 right-0 w-24 h-24 opacity-5 group-hover:opacity-10 transition-opacity">
        <div className="absolute inset-0" style={{ color }}>{icon}</div>
      </div>
      <div className="relative">
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-1">{label}</div>
        <div className="text-2xl font-light tracking-tight" style={{ color }}>{value}</div>
        {sub && <div className="text-[10px] text-white/20 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

// Service Row Component
function ServiceRow({ svc, onClick }: { svc: ServiceHealth; onClick: () => void }) {
  const statusColor = svc.status === 'online' ? '#34d399' : svc.status === 'degraded' ? '#fbbf24' : svc.status === 'checking' ? '#38bdf8' : '#f87171';
  const statusGlow = svc.status === 'online' ? 'rgba(52,211,153,0.4)' : svc.status === 'degraded' ? 'rgba(251,191,36,0.4)' : 'rgba(248,113,113,0.4)';

  return (
    <button onClick={onClick} className="w-full flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-white/[0.02] transition-all border border-transparent hover:border-white/5 group">
      <div className="relative">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColor, boxShadow: `0 0 12px ${statusGlow}` }} />
        {svc.status === 'checking' && <div className="absolute inset-0 rounded-full animate-ping opacity-50" style={{ backgroundColor: statusColor }} />}
      </div>
      <div className="w-36 text-left">
        <div className="text-sm font-medium text-white/90">{svc.name}</div>
        <div className="text-[10px] text-white/30">:{svc.port}</div>
      </div>
      <div className="flex-1" />
      {svc.uptime !== undefined && (
        <div className="text-[10px] text-white/20 font-mono mr-8">{formatUptime(svc.uptime)}</div>
      )}
      {svc.latency !== undefined && (
        <div className="text-xs font-mono text-white/40 mr-6 w-16 text-right">{svc.latency}ms</div>
      )}
      {svc.eventsPerSec !== undefined && (
        <div className="text-[10px] text-white/30 mr-6 w-20 text-right">{svc.eventsPerSec.toFixed(1)} eps</div>
      )}
      <div className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded" style={{ color: statusColor, backgroundColor: `${statusColor}15` }}>
        {svc.status}
      </div>
    </button>
  );
}

// Agent Node for Swarm Viz
function SwarmAgentNode({ node, onClick }: { node: SwarmNode; onClick: () => void }) {
  const color = node.status === 'active' ? '#34d399' : node.status === 'error' ? '#f87171' : '#6b7280';
  const glow = node.status === 'active' ? 'rgba(52,211,153,0.5)' : 'transparent';
  const size = 28 - node.tier * 4;

  return (
    <button
      onClick={onClick}
      className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200 hover:scale-125 z-10"
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
    >
      <div
        className="rounded-full flex items-center justify-center font-mono text-[10px] border-2 transition-all"
        style={{
          width: size,
          height: size,
          backgroundColor: `${color}20`,
          borderColor: color,
          boxShadow: `0 0 ${node.status === 'active' ? '16px' : '4px'} ${glow}`,
          color,
        }}
      >
        {node.name[0].toUpperCase()}
      </div>
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 text-[8px] text-white/40 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
        {node.name}
      </div>
    </button>
  );
}

// Mini Sparkline Chart
function Sparkline({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return <div style={{ height }} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((v - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height, width: '100%' }}>
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
      <polygon fill={`url(#grad-${color.replace('#', '')})`} points={`0,100 ${points} 100,100`} />
    </svg>
  );
}

// Log Row Component
function LogRow({ log, style }: { log: LogEntry; style?: React.CSSProperties }) {
  const typeColors: Record<string, string> = {
    event: '#38bdf8',
    command: '#f472b6',
    response: '#34d399',
    error: '#f87171',
    agent: '#fbbf24',
    system: '#a78bfa',
  };
  const color = typeColors[log.type] || '#6b7280';

  return (
    <div className="flex items-start gap-3 px-4 py-1.5 hover:bg-white/[0.02] transition-colors" style={style}>
      <span className="text-[10px] text-white/20 font-mono shrink-0 w-20">{log.time}</span>
      <span className="text-[10px] font-medium uppercase tracking-wider shrink-0 w-16" style={{ color }}>{log.type}</span>
      <span className="text-[10px] text-white/30 shrink-0 w-24 truncate">{log.source}</span>
      <span className="text-[11px] text-white/60 font-mono flex-1 truncate">{log.message}</span>
    </div>
  );
}

// Tool Card Component
function ToolCard({ tool, onExecute }: { tool: any; onExecute: () => void }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 hover:border-white/10 transition-all group">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-sm font-medium text-white/90">{tool.name}</div>
          {tool.description && <div className="text-[10px] text-white/30 mt-0.5">{tool.description}</div>}
        </div>
        <button
          onClick={onExecute}
          className="px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border border-white/10 text-white/40 hover:text-white hover:border-white/30 transition-all opacity-0 group-hover:opacity-100"
        >
          Execute
        </button>
      </div>
      {tool.inputSchema && (
        <div className="mt-2 p-2 rounded-md bg-black/20 border border-white/5">
          <div className="text-[9px] text-white/20 mb-1">Parameters</div>
          <div className="font-mono text-[10px] text-white/40 truncate">
            {JSON.stringify(tool.inputSchema).substring(0, 150)}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ MAIN COMPONENT ============
export default function CommandCenter() {
  // State
  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'logs' | 'tools' | 'memory' | 'voice'>('overview');
  const [services, setServices] = useState<ServiceHealth[]>(SERVICE_CONFIG.map(s => ({ ...s, status: 'checking' })));
  const [liveAgents, setLiveAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<string>('all');
  const [logSearch, setLogSearch] = useState('');
  const [tools, setTools] = useState<any[]>([]);
  const [memory, setMemory] = useState<any>({ facts: [], tasks: [], context: {}, namespaces: [] });
  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [executing, setExecuting] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [systemMetrics, setSystemMetrics] = useState({ eventsPerSec: 0, activeAgents: 0, totalTasks: 0, memory: '0MB' });
  const [swarmNodes, setSwarmNodes] = useState<SwarmNode[]>([]);
  const [selectedService, setSelectedService] = useState<ServiceHealth | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

  const logIdRef = useRef(0);
  const metricsHistory = useRef<{ eps: number[] }>({ eps: [] });

  // Add log entry helper
  const addLog = useCallback((type: LogEntry['type'], source: string, message: string, metadata?: Record<string, any>) => {
    setLogs(prev => [{
      id: logIdRef.current++,
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      type,
      source,
      message,
      metadata,
    }, ...prev.slice(0, 999)]);
  }, []);

  // ============ DATA FETCHING ============

  // SSE Connection
  useEffect(() => {
    let es: EventSource;
    let retryCount = 0;

    const connect = () => {
      es = new EventSource('http://localhost:7780/api/stream');

      es.onopen = () => {
        setSseConnected(true);
        retryCount = 0;
        addLog('system', 'SSE', 'Event stream connected');
      };

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          addLog('event', data.source || 'STREAM', JSON.stringify(data).substring(0, 120), data);
        } catch {}
      };

      es.onerror = () => {
        setSseConnected(false);
        es.close();
        retryCount++;
        if (retryCount < 5) {
          setTimeout(connect, Math.min(2000 * retryCount, 10000));
        }
      };
    };

    connect();
    return () => es?.close();
  }, [addLog]);

  // Health checks
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
            try {
              const json = await res.json();
              details = json;
            } catch {}

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

    checkServices();
    const interval = setInterval(checkServices, 3000);
    return () => clearInterval(interval);
  }, []);

  // Agent polling
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch('http://localhost:7790/tower/status');
        if (res.ok) {
          const data = await res.json();
          setLiveAgents(data.agents || []);
        }
      } catch {}
    };

    const fetchSystemMetrics = async () => {
      try {
        const [eventRes, stateRes] = await Promise.all([
          fetch('http://localhost:7782/health'),
          fetch('http://localhost:7783/health'),
        ]);

        if (eventRes.ok) {
          const eventData = await eventRes.json();
          const eps = eventData.eventCount ? eventData.eventCount / (eventData.uptime || 1) * 1000 : 0;
          metricsHistory.current.eps.push(eps);
          if (metricsHistory.current.eps.length > 60) metricsHistory.current.eps.shift();
          setSystemMetrics(prev => ({
            ...prev,
            eventsPerSec: eps,
          }));
        }

        if (stateRes.ok) {
          const stateData = await stateRes.json();
          setSystemMetrics(prev => ({
            ...prev,
            activeAgents: stateData.agentCount || 0,
            totalTasks: stateData.teamCount || 0,
            memory: stateData.memory?.heapUsed || '0MB',
          }));
        }
      } catch {}
    };

    fetchAgents();
    fetchSystemMetrics();
    const interval = setInterval(() => {
      fetchAgents();
      fetchSystemMetrics();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Tools
  useEffect(() => {
    const fetchTools = async () => {
      try {
        const res = await fetch('http://localhost:7780/api/tools');
        if (res.ok) {
          const data = await res.json();
          setTools(data.tools || []);
        }
      } catch {}
    };
    fetchTools();
  }, []);

  // Memory
  useEffect(() => {
    const fetchMemory = async () => {
      try {
        const res = await fetch('http://localhost:7783/api/state');
        if (res.ok) {
          const data = await res.json();
          setMemory(data);
        }
      } catch {}
    };
    fetchMemory();
    const interval = setInterval(fetchMemory, 8000);
    return () => clearInterval(interval);
  }, []);

  // Swarm visualization
  useEffect(() => {
    if (activeTab !== 'agents') return;

    const nodes: SwarmNode[] = AGENT_DEFS.map((def, i) => {
      const live = liveAgents.find(a => a.name === def.name);
      const angle = (i / AGENT_DEFS.length) * 2 * Math.PI;
      const radius = 30 + (3 - def.tier) * 15;
      const cx = 50 + Math.cos(angle) * radius;
      const cy = 50 + Math.sin(angle) * radius;

      return {
        id: def.name,
        name: def.name,
        x: cx + (Math.random() - 0.5) * 8,
        y: cy + (Math.random() - 0.5) * 8,
        vx: 0,
        vy: 0,
        division: def.division,
        tier: def.tier,
        status: live?.status || 'idle',
      };
    });

    // Simple force simulation
    const simulate = () => {
      setSwarmNodes(prev => {
        const next = prev.map(n => ({ ...n, vx: 0, vy: 0 }));

        // Repulsion between nodes
        for (let i = 0; i < next.length; i++) {
          for (let j = i + 1; j < next.length; j++) {
            const dx = next[j].x - next[i].x;
            const dy = next[j].y - next[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = 50 / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            next[i].vx -= fx;
            next[i].vy -= fy;
            next[j].vx += fx;
            next[j].vy += fy;
          }
        }

        // Attraction to center
        next.forEach(n => {
          n.vx += (50 - n.x) * 0.01;
          n.vy += (50 - n.y) * 0.01;
        });

        return next.map(n => ({
          ...n,
          x: Math.max(10, Math.min(90, n.x + n.vx * 0.1)),
          y: Math.max(10, Math.min(90, n.y + n.vy * 0.1)),
        }));
      });
    };

    simulate();
    const interval = setInterval(simulate, 2000);
    return () => clearInterval(interval);
  }, [activeTab, liveAgents]);

  // ============ COMMAND HANDLING ============

  const handleCommand = useCallback(async () => {
    if (!command.trim() || executing) return;
    setExecuting(true);
    setCommandHistory(prev => [command, ...prev.slice(0, 49)]);

    addLog('command', 'USER', command);

    try {
      const res = await fetch('http://localhost:7780/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const data = await res.json();
      addLog('response', 'API', JSON.stringify(data).substring(0, 200), data);
    } catch (e: any) {
      addLog('error', 'NET', e.message);
    }

    setCommand('');
    setExecuting(false);
  }, [command, executing, addLog]);

  const spawnAgent = useCallback(async (agentName: string) => {
    addLog('agent', 'SPAWN', `Spawning agent: ${agentName}`);
    try {
      await fetch('http://localhost:7790/api/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: agentName }),
      });
    } catch (e: any) {
      addLog('error', 'SPAWN', e.message);
    }
  }, [addLog]);

  // ============ FILTERED LOGS ============
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (logFilter !== 'all' && log.type !== logFilter) return false;
      if (logSearch && !log.message.toLowerCase().includes(logSearch.toLowerCase())) return false;
      return true;
    });
  }, [logs, logFilter, logSearch]);

  // ============ DERIVED STATE ============
  const healthyCount = services.filter(s => s.status === 'online').length;
  const totalEvents = useMemo(() => services.find(s => s.port === 7782)?.details?.eventCount || 0, [services]);
  const totalSubscribers = useMemo(() => services.find(s => s.port === 7782)?.details?.subscriberCount || 0, [services]);

  // ============ RENDER ============

  const tabs = [
    { id: 'overview', label: 'OVERVIEW', icon: '◈' },
    { id: 'agents', label: 'AGENTS', icon: '◇' },
    { id: 'logs', label: 'LOGS', icon: '◫' },
    { id: 'tools', label: 'TOOLS', icon: '⬡' },
    { id: 'memory', label: 'MEMORY', icon: '◉' },
    { id: 'voice', label: 'VOICE', icon: '◎' },
  ] as const;

  return (
    <div className="min-h-screen w-full bg-black text-white overflow-hidden" style={{ fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace" }}>
      {/* ============ BACKGROUND GRID ============ */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }} />
      </div>

      {/* ============ HEADER ============ */}
      <header className="relative z-50 flex items-center justify-between px-6 py-3 border-b border-white/5 bg-black/80 backdrop-blur-xl">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 12px rgba(52,211,153,0.6)' }} />
              <div className="absolute inset-0 rounded-full animate-ping opacity-50" style={{ backgroundColor: '#34d399' }} />
            </div>
            <span className="text-sm font-bold tracking-[0.3em] text-white/90">PURPCLAW</span>
          </div>
          <span className="text-[10px] text-white/20 tracking-widest">NEURAL COMMAND INTERFACE</span>
          <span className="text-[10px] text-white/10">v8.2.0</span>
        </div>

        <div className="flex items-center gap-8">
          <div className="flex items-center gap-6 text-[10px]">
            <div className="flex items-center gap-2">
              <span className="text-white/30">SERVICES</span>
              <span className="text-emerald-400 font-medium">{healthyCount}/{services.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/30">AGENTS</span>
              <span className="text-purple-400 font-medium">{liveAgents.length}/{AGENT_DEFS.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/30">EVENTS</span>
              <span className="text-cyan-400 font-medium">{totalEvents.toLocaleString()}</span>
            </div>
          </div>

          <div className="w-px h-4 bg-white/10" />

          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${sseConnected ? 'bg-cyan-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-[10px] text-white/40 tracking-widest">{sseConnected ? 'LIVE' : 'RECONNECTING'}</span>
          </div>

          <div className="w-px h-4 bg-white/10" />

          <span className="text-[10px] text-white/20">
            {new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
          </span>
        </div>
      </header>

      {/* ============ NAVIGATION ============ */}
      <nav className="relative z-40 flex items-center gap-1 px-6 py-2 border-b border-white/5 bg-black/60 backdrop-blur-xl">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-[11px] font-bold tracking-[0.15em] transition-all ${
              activeTab === tab.id
                ? 'bg-white/10 text-white border border-white/10'
                : 'text-white/30 hover:text-white/60 hover:bg-white/[0.02]'
            }`}
          >
            <span className="mr-2 opacity-50">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ============ MAIN CONTENT ============ */}
      <main className="relative z-10 h-[calc(100vh-96px)] overflow-hidden p-6">

        {/* ============ OVERVIEW TAB ============ */}
        {activeTab === 'overview' && (
          <div className="h-full grid grid-cols-12 gap-6">
            {/* Left Column - Service Status */}
            <div className="col-span-8 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] uppercase tracking-[0.3em] text-white/30">Service Architecture</h2>
                <div className="flex items-center gap-4 text-[10px] text-white/30">
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Online</span>
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Degraded</span>
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Offline</span>
                </div>
              </div>

              <div className="flex-1 rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden">
                <div className="h-full overflow-y-auto">
                  {services.map(svc => (
                    <ServiceRow
                      key={svc.name}
                      svc={svc}
                      onClick={() => setSelectedService(selectedService?.name === svc.name ? null : svc)}
                    />
                  ))}
                </div>
              </div>

              {/* Selected Service Details */}
              {selectedService && (
                <div className="rounded-xl border border-white/5 bg-black/40 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-white/80">{selectedService.name}</span>
                    <button onClick={() => setSelectedService(null)} className="text-white/20 hover:text-white/40 text-xs">×</button>
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-[10px]">
                    {Object.entries(selectedService.details || {}).slice(0, 8).map(([k, v]) => (
                      <div key={k}>
                        <div className="text-white/30 uppercase tracking-wider mb-0.5">{k}</div>
                        <div className="text-white/60 font-mono truncate">{typeof v === 'object' ? JSON.stringify(v).substring(0, 50) : String(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Metrics */}
            <div className="col-span-4 flex flex-col gap-4">
              <h2 className="text-[10px] uppercase tracking-[0.3em] text-white/30">System Metrics</h2>

              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="Events/Sec" value={systemMetrics.eventsPerSec.toFixed(1)} sub="event throughput" color="#38bdf8" icon="◎" />
                <MetricCard label="Active Agents" value={liveAgents.length} sub={`of ${AGENT_DEFS.length} total`} color="#a78bfa" icon="◇" />
                <MetricCard label="Subscribers" value={totalSubscribers} sub="event subscriptions" color="#fbbf24" icon="◫" />
                <MetricCard label="Heap Memory" value={formatBytes(systemMetrics.memory)} sub="v8 heap" color="#34d399" icon="◉" />
              </div>

              {/* Event Throughput Chart */}
              <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-3">Event Throughput</div>
                <div className="h-24">
                  <Sparkline data={metricsHistory.current.eps.slice(-30)} color="#38bdf8" height={96} />
                </div>
                <div className="flex justify-between text-[9px] text-white/20 mt-1">
                  <span>-30s</span>
                  <span>now</span>
                </div>
              </div>

              {/* Service Latencies */}
              <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 flex-1">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-3">Response Times</div>
                <div className="space-y-2">
                  {services.filter(s => s.latency !== undefined).slice(0, 6).map(svc => (
                    <div key={svc.name} className="flex items-center gap-3">
                      <span className="text-[10px] text-white/40 w-24 truncate">{svc.name}</span>
                      <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, (svc.latency || 0) / 20)}%`,
                            backgroundColor: (svc.latency || 0) > 500 ? '#fbbf24' : '#34d399',
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-white/30 w-12 text-right">{svc.latency}ms</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============ AGENTS TAB ============ */}
        {activeTab === 'agents' && (
          <div className="h-full grid grid-cols-12 gap-6">
            {/* Swarm Visualization */}
            <div className="col-span-8 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] uppercase tracking-[0.3em] text-white/30">Agent Swarm Topology</h2>
                <div className="flex items-center gap-4 text-[10px]">
                  {Object.entries(DIVISION_COLORS).map(([div, color]) => (
                    <span key={div} className="flex items-center gap-1.5 text-white/40">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      {div}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex-1 relative rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden">
                <div className="absolute inset-0" style={{
                  background: 'radial-gradient(circle at 50% 50%, rgba(167,139,250,0.03) 0%, transparent 60%)',
                }} />

                {swarmNodes.map(node => (
                  <SwarmAgentNode
                    key={node.id}
                    node={node}
                    onClick={() => {
                      const def = AGENT_DEFS.find(a => a.name === node.id);
                      const live = liveAgents.find(a => a.name === node.id);
                      setSelectedAgent({
                        id: node.id,
                        name: node.id,
                        emoji: def?.emoji || '?',
                        status: live?.status || 'idle',
                        division: node.division,
                        tier: node.tier,
                        uptime: live?.uptime,
                        tasks: live?.tasks,
                      });
                    }}
                  />
                ))}

                {/* Center hub */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full border border-white/10 bg-black/60 flex items-center justify-center">
                  <span className="text-lg opacity-40">🧠</span>
                </div>
              </div>
            </div>

            {/* Agent List */}
            <div className="col-span-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] uppercase tracking-[0.3em] text-white/30">Agent Registry</h2>
                <span className="text-[10px] text-white/20">{liveAgents.length} active</span>
              </div>

              <div className="flex-1 rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden flex flex-col">
                <div className="p-3 border-b border-white/5 flex gap-2">
                  {['Strategic', 'Operations', 'Foundation'].map(div => (
                    <button
                      key={div}
                      className="px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all"
                      style={{
                        backgroundColor: DIVISION_BG[div],
                        color: DIVISION_COLORS[div],
                        border: `1px solid ${DIVISION_COLORS[div]}20`,
                      }}
                    >
                      {div} ({AGENT_DEFS.filter(a => a.division === div).length})
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {AGENT_DEFS.map(def => {
                    const live = liveAgents.find(a => a.name === def.name);
                    const isActive = !!live;

                    return (
                      <button
                        key={def.name}
                        onClick={() => spawnAgent(def.name)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-all group"
                      >
                        <span className="text-sm">{def.emoji}</span>
                        <div className="flex-1 text-left">
                          <div className="text-xs text-white/70">{def.name}</div>
                          <div className="text-[9px] text-white/20">{def.division}</div>
                        </div>
                        <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-white/10'}`}
                          style={{ boxShadow: isActive ? '0 0 8px rgba(52,211,153,0.6)' : 'none' }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============ LOGS TAB ============ */}
        {activeTab === 'logs' && (
          <div className="h-full flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] uppercase tracking-[0.3em] text-white/30">Event Stream</h2>
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  value={logSearch}
                  onChange={e => setLogSearch(e.target.value)}
                  placeholder="Search logs..."
                  className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs text-white/60 placeholder:text-white/20 focus:outline-none focus:border-white/20 w-48"
                />
                <div className="flex gap-1">
                  {['all', 'event', 'command', 'error', 'agent', 'system'].map(f => (
                    <button
                      key={f}
                      onClick={() => setLogFilter(f)}
                      className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all ${
                        logFilter === f ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/50'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <button onClick={() => setLogs([])} className="text-[10px] text-white/30 hover:text-white/50 uppercase tracking-wider">Clear</button>
              </div>
            </div>

            <div className="flex-1 rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden flex flex-col">
              <div className="flex-1 overflow-y-auto">
                {filteredLogs.map(log => (
                  <LogRow key={log.id} log={log} />
                ))}
                {filteredLogs.length === 0 && (
                  <div className="flex items-center justify-center h-full text-white/20 text-xs">
                    No events to display
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============ TOOLS TAB ============ */}
        {activeTab === 'tools' && (
          <div className="h-full flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] uppercase tracking-[0.3em] text-white/30">Tool Registry</h2>
              <span className="text-[10px] text-white/20">{tools.length} tools available</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-3 gap-3">
                {tools.map((tool: any, i) => (
                  <ToolCard key={i} tool={tool} onExecute={() => {
                    addLog('command', 'TOOL', `Executing ${tool.name}`);
                    fetch('http://localhost:7780/api/tool/execute', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ tool: tool.name }),
                    }).then(r => r.json()).then(d => addLog('response', 'TOOL', JSON.stringify(d).substring(0, 200))).catch(e => addLog('error', 'TOOL', e.message));
                  }} />
                ))}
              </div>
              {tools.length === 0 && (
                <div className="flex items-center justify-center h-full text-white/20 text-xs">
                  Loading tools...
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ MEMORY TAB ============ */}
        {activeTab === 'memory' && (
          <div className="h-full grid grid-cols-12 gap-6">
            <div className="col-span-8 flex flex-col gap-4">
              <h2 className="text-[10px] uppercase tracking-[0.3em] text-white/30">Knowledge Graph</h2>

              <div className="grid grid-cols-4 gap-3">
                <MetricCard label="Facts" value={memory.facts?.length || 0} sub="stored memories" color="#f472b6" icon="◆" />
                <MetricCard label="Tasks" value={memory.tasks?.length || 0} sub="active items" color="#fbbf24" icon="◫" />
                <MetricCard label="Namespaces" value={memory.namespaces?.length || 0} sub="data domains" color="#a78bfa" icon="◇" />
                <MetricCard label="Teams" value={memory.teamCount || 0} sub="active teams" color="#34d399" icon="⬡" />
              </div>

              <div className="flex-1 rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden">
                <div className="p-4 border-b border-white/5">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/30">Recent Facts</span>
                </div>
                <div className="p-4 overflow-y-auto h-64 space-y-2">
                  {(memory.facts || []).slice(0, 50).map((fact: any, i: number) => (
                    <div key={i} className="text-xs font-mono text-white/50 p-2 rounded bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                      {typeof fact === 'object' ? JSON.stringify(fact).substring(0, 200) : String(fact)}
                    </div>
                  ))}
                  {(!memory.facts || memory.facts.length === 0) && (
                    <div className="text-center text-white/20 text-xs py-8">No facts stored</div>
                  )}
                </div>
              </div>
            </div>

            <div className="col-span-4 flex flex-col gap-4">
              <h2 className="text-[10px] uppercase tracking-[0.3em] text-white/30">Namespaces</h2>

              <div className="flex-1 rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden">
                <div className="p-3 border-b border-white/5">
                  <span className="text-[10px] text-white/30">Active Data Domains</span>
                </div>
                <div className="p-3 space-y-1">
                  {(memory.namespaces || []).map((ns: string) => (
                    <div key={ns} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-white/[0.02] transition-colors">
                      <span className="text-cyan-400 text-xs">◉</span>
                      <span className="text-xs text-white/60">{ns}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-3">Memory Usage</div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-white/40">Heap Used</span>
                    <span className="text-white/60">{memory.memory?.heapUsed || '0MB'}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-white/40">Heap Total</span>
                    <span className="text-white/60">{memory.memory?.heapTotal || '0MB'}</span>
                  </div>
                  <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-purple-400"
                      style={{ width: '45%' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============ VOICE TAB ============ */}
        {activeTab === 'voice' && (
          <div className="h-full flex flex-col items-center justify-center gap-8">
            <div className="text-center">
              <h2 className="text-2xl font-light tracking-[0.3em] text-white/80 mb-2">VOICE COMMAND INTERFACE</h2>
              <p className="text-xs text-white/30">Speak to SAMANTHA or type commands below</p>
            </div>

            {/* Voice Visualization */}
            <div className="relative w-64 h-64 rounded-full border border-white/10 bg-white/[0.02] flex items-center justify-center">
              <div className="absolute inset-4 rounded-full border border-cyan-400/20 animate-pulse" />
              <div className="absolute inset-12 rounded-full border border-purple-400/20 animate-pulse" style={{ animationDelay: '0.5s' }} />
              <div className="absolute inset-20 rounded-full border border-white/10 animate-pulse" style={{ animationDelay: '1s' }} />
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-400/20 to-purple-400/20 border border-white/20 flex items-center justify-center">
                <span className="text-3xl">🎤</span>
              </div>
            </div>

            <div className="w-full max-w-xl">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={command}
                  onChange={e => setCommand(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCommand();
                    if (e.key === 'ArrowUp') {
                      const idx = commandHistory.indexOf(command);
                      if (idx < commandHistory.length - 1) setCommand(commandHistory[idx + 1]);
                    }
                  }}
                  placeholder="Enter command or speak..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-6 py-4 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-all"
                />
                <button
                  onClick={handleCommand}
                  disabled={executing}
                  className="px-8 py-4 rounded-xl bg-white/10 border border-white/10 text-sm font-bold tracking-wider text-white/60 hover:text-white hover:bg-white/20 transition-all disabled:opacity-50"
                >
                  {executing ? 'EXECUTING...' : 'EXECUTE'}
                </button>
              </div>

              {commandHistory.length > 0 && (
                <div className="mt-4 flex gap-2 flex-wrap">
                  {commandHistory.slice(0, 8).map((cmd, i) => (
                    <button
                      key={i}
                      onClick={() => setCommand(cmd)}
                      className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-white/40 hover:text-white/60 hover:border-white/20 transition-all"
                    >
                      {cmd}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="text-[10px] text-white/20">
              Commands: spawn [agent] · status · kill [agent] · deploy [tool] · memory [query]
            </div>
          </div>
        )}
      </main>

      {/* ============ COMMAND BAR ============ */}
      {activeTab !== 'voice' && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/5 bg-black/90 backdrop-blur-xl">
          <div className="flex items-center gap-4 px-6 py-3">
            <span className="text-[10px] font-bold text-purple-400 tracking-[0.2em]">CMD</span>
            <input
              type="text"
              value={command}
              onChange={e => setCommand(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCommand();
                if (e.key === 'ArrowUp') {
                  const idx = commandHistory.indexOf(command);
                  if (idx < commandHistory.length - 1) setCommand(commandHistory[idx + 1]);
                }
              }}
              placeholder="Type command... (spawn, status, kill, deploy)"
              className="flex-1 bg-white/5 border border-white/5 rounded-lg px-4 py-2 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/10 transition-all"
            />
            <button
              onClick={handleCommand}
              disabled={executing}
              className="px-6 py-2 rounded-lg bg-white/10 border border-white/10 text-[10px] font-bold uppercase tracking-wider text-white/60 hover:text-white hover:bg-white/20 transition-all disabled:opacity-50"
            >
              {executing ? 'EXECUTING...' : 'EXEC'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
