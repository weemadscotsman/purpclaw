'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

const DIVISIONS = [
  { id: 'INTELLIGENCE', name: 'Intelligence', color: '#E74C3C', icon: '🧠' },
  { id: 'ENGINEERING', name: 'Engineering', color: '#3498DB', icon: '🔧' },
  { id: 'SECURITY', name: 'Security', color: '#27AE60', icon: '🔒' },
  { id: 'OPERATIONS', name: 'Operations', color: '#F39C12', icon: '⚡' },
  { id: 'MEDIA_OPS', name: 'Media Ops', color: '#9B59B6', icon: '🎬' },
  { id: 'MANAGEMENT', name: 'Management', color: '#1ABC9C', icon: '📊' },
  { id: 'SCIENCE', name: 'Science', color: '#00BCD4', icon: '🔬' },
  { id: 'CREATIVE', name: 'Creative', color: '#E91E63', icon: '🎨' },
];

interface LogEntry {
  id: string;
  type: 'agent' | 'system' | 'ball' | 'error' | 'success' | 'output';
  source: string;
  emoji?: string;
  message: string;
  timestamp: Date;
}

interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
  division: string;
  status: string;
  task: string;
  pid?: number;
  startTime?: string;
}

interface ServiceInfo {
  name: string;
  port: number;
  status: 'healthy' | 'down' | 'checking';
  latency?: number;
}

interface Metrics {
  cpu: number;
  memory: number;
  gpu: number;
  disk: number;
  network: string;
  uptime: string;
  processes: number;
}

export function AgentTower() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [input, setInput] = useState('');
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ cpu: 0, memory: 0, gpu: 0, disk: 0, network: 'Connected', uptime: '0s', processes: 0 });
  const [sseConnected, setSseConnected] = useState(false);
  const [ballConnected, setBallConnected] = useState(false);
  const [chatMessages, setChatMessages] = useState<{from: string; text: string; time: Date}[]>([]);
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    setLogs(prev => [...prev.slice(-500), { ...entry, id: Date.now().toString() + Math.random().toString(36).substring(2), timestamp: new Date() }]);
  }, []);

  // SSE Connection for real-time events
  useEffect(() => {
    const es = new EventSource('http://localhost:7780/api/stream');
    es.onopen = () => setSseConnected(true);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'agent_output' || data.type === 'agent_log') {
          addLog({ type: 'output', source: data.agentName?.toUpperCase() || 'AGENT', emoji: data.emoji, message: data.output.trim() });
        } else if (data.type === 'agent_spawned' || data.type === 'tower_agent_spawned') {
          addLog({ type: 'success', source: 'TOWER', emoji: data.emoji, message: `🚀 ${data.name?.toUpperCase() || data.agentName} started (PID: ${data.pid || 'N/A'}) - ${data.task || ''}` });
          refreshAgents();
        } else if (data.type === 'agent_complete') {
          addLog({ type: 'success', source: 'TOWER', emoji: data.emoji, message: `✅ ${data.agentName} finished (exit: ${data.code})` });
          refreshAgents();
        } else if (data.type === 'ball_voice_command') {
          addLog({ type: 'ball', source: 'BALL', message: `🎤 "${data.command}"` });
          setChatMessages(prev => [...prev, { from: 'ball', text: data.command, time: new Date() }]);
        } else if (data.type === 'ball_auto_spawn') {
          addLog({ type: 'system', source: 'BALL', message: `⚡ Auto-deployed ${data.agentName}` });
        }
      } catch {}
    };
    es.onerror = () => setSseConnected(false);
    return () => es.close();
  }, [addLog]);

  // System metrics fetcher
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch('http://localhost:7780/api/health');
        if (res.ok) {
          const data = await res.json();
          setMetrics({
            cpu: data.cpuUsage || 0,
            memory: data.memoryUsage || 0,
            gpu: data.gpuUsage || 0,
            disk: data.diskUsage || 0,
            network: data.networkStatus || 'Connected',
            uptime: formatUptime(data.uptime),
            processes: data.processes || 0
          });
          setBallConnected(data.bridgeConnected || false);
        }
      } catch {}
    };

    const checkServices = async () => {
      const serviceList = [
        { name: 'API', port: 7780, path: '/api/health' },
        { name: 'Tower', port: 7790, path: '/tower/status' },
        { name: 'Voice', port: 7881, path: '/health' },
        { name: 'Bridge', port: 8779, path: '/health' },
        { name: 'EventBus', port: 7782, path: '/health' },
        { name: 'State', port: 7783, path: '/health' },
      ];
      const results = await Promise.all(serviceList.map(async (svc) => {
        const start = Date.now();
        try {
          const res = await fetch(`http://localhost:${svc.port}${svc.path}`, { signal: AbortSignal.timeout(2000) });
          return { ...svc, status: res.ok ? 'healthy' : 'down', latency: Date.now() - start } as ServiceInfo;
        } catch { return { ...svc, status: 'down' } as ServiceInfo; }
      }));
      setServices(results);
    };

    fetchMetrics();
    checkServices();
    refreshAgents();
    const interval = setInterval(() => { fetchMetrics(); checkServices(); refreshAgents(); }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const refreshAgents = async () => {
    try {
      const res = await fetch('http://localhost:7790/tower/status');
      if (res.ok) {
        const data = await res.json();
        const agentList: AgentInfo[] = (data.activeAgents || []).map((a: any) => ({
          id: a.id, name: a.name, emoji: a.emoji, division: a.division,
          status: a.status, task: a.task, pid: a.pid, startTime: a.startTime
        }));
        setAgents(agentList);
      }
    } catch {}
  };

  const sendCommand = async () => {
    if (!input.trim()) return;
    const text = input;
    addLog({ type: 'system', source: 'YOU', message: `❯ ${text}` });
    setInput('');
    setChatMessages(prev => [...prev, { from: 'you', text, time: new Date() }]);

    try {
      const res = await fetch('http://localhost:7780/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, spawnAgents: true }),
      });
      if (res.ok) {
        const data = await res.json();
        const spawned = data.responses?.find((r: any) => r.source === 'swarm')?.spawned || 0;
        if (spawned > 0) addLog({ type: 'system', source: 'SYSTEM', message: `📨 Ball received + ${spawned} agents deployed` });
      }
    } catch (e) { addLog({ type: 'error', source: 'ERROR', message: (e as Error).message }); }
  };

  const spawnAgent = async (name: string) => {
    addLog({ type: 'system', source: 'SYSTEM', message: `🚀 Spawning ${name}...` });
    try {
      await fetch('http://localhost:7780/api/tower/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName: name, task: `Manual spawn: ${name}` }),
      });
    } catch (e) { addLog({ type: 'error', source: 'ERROR', message: (e as Error).message }); }
  };

  const formatUptime = (s: number) => {
    if (!s) return '0s';
    if (s < 60) return `${Math.floor(s)}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  };

  const getAgentsByDivision = (divId: string) => agents.filter(a => a.division === divId);
  const healthyCount = services.filter(s => s.status === 'healthy').length;

  return (
    <div className="h-[calc(100vh-40px)] flex flex-col bg-[#0a0a0f] text-white overflow-hidden font-mono">
      {/* TOP STATUS BAR */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#111118] border-b border-gray-800 text-xs">
        <div className="flex items-center gap-4">
          <span className="text-lg font-bold tracking-widest text-white">PURPCLAW</span>
          <span className="text-gray-500">MISSION CONTROL</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            {services.map(s => (
              <div key={s.name} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${s.status === 'healthy' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                <span className="text-gray-400">{s.name}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-cyan-400 animate-pulse' : 'bg-gray-600'}`} />
            <span className="text-gray-400">SSE</span>
            <span className={`w-2 h-2 rounded-full ${ballConnected ? 'bg-purple-400 animate-pulse' : 'bg-gray-600'}`} />
            <span className="text-gray-400">BALL</span>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400">{healthyCount}/{services.length} SERVICES</span>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400">{agents.length} ACTIVE AGENTS</span>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 grid grid-cols-12 gap-0.5 p-0.5 overflow-hidden">
        
        {/* LEFT PANEL - TERMINAL */}
        <div className="col-span-5 flex flex-col bg-[#0d0d12] rounded-lg border border-gray-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-[#1a1a24] border-b border-gray-800">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400">▶</span>
              <span className="font-bold text-cyan-400">TERMINAL</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{agents.length} agents</span>
            </div>
          </div>
          <div ref={terminalRef} className="flex-1 overflow-auto p-2 text-xs leading-relaxed">
            {logs.map(log => (
              <div key={log.id} className={`py-0.5 ${
                log.type === 'error' ? 'text-red-400' :
                log.type === 'success' ? 'text-emerald-400' :
                log.type === 'ball' ? 'text-purple-400' :
                log.type === 'output' ? 'text-cyan-300' : 'text-gray-300'
              }`}>
                <span className="text-gray-600">[{log.timestamp.toLocaleTimeString()}]</span>
                {' '}
                {log.emoji && <span className="mr-1">{log.emoji}</span>}
                <span className="text-yellow-600 font-bold">{log.source}:</span>
                {' '}
                <span className={log.type === 'output' ? 'text-cyan-300' : ''}>{log.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
          <div className="p-2 bg-[#1a1a24] border-t border-gray-800">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold">❯</span>
              <input
                type="text" value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendCommand()}
                placeholder="Command the swarm..."
                className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder-gray-600"
              />
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="col-span-7 flex flex-col gap-0.5 overflow-hidden">
          
          {/* METRICS BAR */}
          <div className="bg-[#0d0d12] rounded-lg border border-gray-800 p-3">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">CPU</span>
                  <span className="text-white font-bold">{metrics.cpu.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${metrics.cpu}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">MEMORY</span>
                  <span className="text-white font-bold">{metrics.memory.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${metrics.memory}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">GPU</span>
                  <span className="text-white font-bold">{metrics.gpu.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${metrics.gpu}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">DISK</span>
                  <span className="text-white font-bold">{metrics.disk.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${metrics.disk}%` }} />
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
              <span>{metrics.processes} processes</span>
              <span className={metrics.network === 'Connected' ? 'text-emerald-400' : 'text-red-400'}>{metrics.network}</span>
              <span>Uptime: {metrics.uptime}</span>
            </div>
          </div>

          {/* DIVISIONS & AGENTS */}
          <div className="flex-1 bg-[#0d0d12] rounded-lg border border-gray-800 overflow-hidden flex">
            {/* Division tabs */}
            <div className="w-44 border-r border-gray-800 p-2 overflow-auto">
              <div className="text-xs font-bold text-gray-500 uppercase mb-2 px-2">Divisions</div>
              {DIVISIONS.map(div => {
                const count = getAgentsByDivision(div.id).length;
                return (
                  <button
                    key={div.id}
                    onClick={() => setSelectedDivision(selectedDivision === div.id ? null : div.id)}
                    className={`w-full flex items-center justify-between p-2 rounded mb-1 transition-colors ${
                      selectedDivision === div.id ? 'bg-gray-800 border border-gray-700' : 'hover:bg-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: div.color }} />
                      <span className="text-gray-300 text-sm">{div.icon}</span>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${count > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-800 text-gray-500'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Agent grid */}
            <div className="flex-1 p-2 overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-gray-300">
                  {selectedDivision ? DIVISIONS.find(d => d.id === selectedDivision)?.name + ' Division' : 'All Agents'}
                </span>
                <span className="text-xs text-gray-500">{agents.length} active</span>
              </div>
              {agents.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">🔮</div>
                  <p className="text-sm">No active agents</p>
                  <p className="text-xs text-gray-600 mt-1">Send a command to deploy agents</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {agents.filter(a => !selectedDivision || a.division === selectedDivision).map(agent => (
                    <div key={agent.id} className="bg-gray-900 rounded-lg p-3 border border-gray-800">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{agent.emoji}</span>
                          <span className="font-bold text-white text-sm">{agent.name}</span>
                        </div>
                        <div className={`w-2 h-2 rounded-full ${agent.status === 'working' ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400'}`} />
                      </div>
                      <div className="text-xs text-gray-400 truncate mb-1">{agent.task || 'Idle'}</div>
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span>{agent.division}</span>
                        {agent.pid && <span>PID: {agent.pid}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* BOTTOM ROW - Chat + Quick Actions */}
          <div className="grid grid-cols-2 gap-0.5">
            {/* Ball Chat */}
            <div className="bg-[#0d0d12] rounded-lg border border-gray-800 overflow-hidden">
              <div className="px-4 py-2 bg-[#1a1a24] border-b border-gray-800 flex items-center gap-2">
                <span className="text-purple-400">🎤</span>
                <span className="font-bold text-purple-400 text-sm">Ball AI Chat</span>
                <div className={`w-2 h-2 rounded-full ml-auto ${ballConnected ? 'bg-purple-400 animate-pulse' : 'bg-gray-600'}`} />
              </div>
              <div className="h-32 overflow-auto p-2 space-y-1">
                {chatMessages.slice(-10).map((msg, i) => (
                  <div key={i} className={`text-xs ${msg.from === 'ball' ? 'text-purple-400' : 'text-gray-300'}`}>
                    <span className="text-gray-600">{msg.from === 'ball' ? '🎤' : '👤'}</span>
                    <span className="ml-1">{msg.text.substring(0, 80)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-[#0d0d12] rounded-lg border border-gray-800 overflow-hidden">
              <div className="px-4 py-2 bg-[#1a1a24] border-b border-gray-800 flex items-center gap-2">
                <span className="text-amber-400">⚡</span>
                <span className="font-bold text-amber-400 text-sm">Quick Deploy</span>
              </div>
              <div className="p-2 grid grid-cols-4 gap-1">
                {['🤖 robot', '🐉 dragon', '👻 ghost', '🔒 security', '🦆 duck', '🐝 bee', '🐺 wolf', '🔬 scientist'].map(cmd => (
                  <button
                    key={cmd}
                    onClick={() => { setInput(cmd.split(' ')[1]); sendCommand(); }}
                    className="px-2 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded text-xs text-gray-300 transition-colors"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgentTower;