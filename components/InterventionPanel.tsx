'use client';

import { useState, useEffect, useCallback } from 'react';

const API = 'http://localhost:7780/api';

interface Division {
  name: string;
  agentCount: number;
  activeAgents: number;
  priority: 'low' | 'normal' | 'high' | 'critical';
  cpuUsage: number;
  memoryUsage: number;
  agents?: { id: string; name: string | null; status: string; currentTask?: string }[];
}

interface ControlEvent {
  type: string;
  division?: string;
  action?: string;
  value?: any;
  timestamp: string;
  from?: string;
  to?: string;
  count?: number;
  signal?: string;
}

const DIVISIONS: Division[] = [
  { name: 'Engineering', agentCount: 8, activeAgents: 6, priority: 'high', cpuUsage: 45, memoryUsage: 62 },
  { name: 'Security', agentCount: 3, activeAgents: 3, priority: 'critical', cpuUsage: 78, memoryUsage: 41 },
  { name: 'Media Ops', agentCount: 6, activeAgents: 5, priority: 'normal', cpuUsage: 34, memoryUsage: 55 },
  { name: 'Research', agentCount: 4, activeAgents: 4, priority: 'normal', cpuUsage: 23, memoryUsage: 38 },
  { name: 'Data Mining', agentCount: 7, activeAgents: 7, priority: 'low', cpuUsage: 89, memoryUsage: 71 },
  { name: 'Design', agentCount: 5, activeAgents: 4, priority: 'low', cpuUsage: 12, memoryUsage: 29 },
  { name: 'Management', agentCount: 3, activeAgents: 3, priority: 'high', cpuUsage: 5, memoryUsage: 8 },
  { name: 'Infrastructure', agentCount: 2, activeAgents: 2, priority: 'critical', cpuUsage: 67, memoryUsage: 83 },
  { name: 'Lobby', agentCount: 1, activeAgents: 1, priority: 'normal', cpuUsage: 1, memoryUsage: 2 },
];

const PRIORITY_COLORS = {
  low: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
  normal: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  high: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  critical: 'bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse',
};

const AGENT_EMOJIS: Record<string, string> = {
  bee: '🐝', ghost: '👻', dragon: '🐉', octopus: '🐙', robot: '🤖', mushroom: '🍄',
  chonk: '😺', owl: '🦉', cactus: '🌵', penguin: '🐧', goose: '🪿', turtle: '🐢',
  axolotl: '🥒', rabbit: '🐰', void: '🌀', crow: '🐦‍⬛', mantis: '🦗', phoenix: '🔥',
  spider: '🕷️', guardian: '🛡️', wolf: '🐺', fox: '🦊', elephant: '🐘', shark: '🦈',
  parrot: '🦜', numbers: '🔢', scientist: '🔬', kraken: '🦑', gorilla: '🦍', jellyfish: '🪼',
  lemur: '🦝', hawk: '🦅', snake: '🐍', panda: '🐼', moth: '🪰', karne: '🎭',
  claw: '🦞', duck: '🦆',
};

const AGENT_COLORS: Record<string, string> = {
  bee: 'text-yellow-400', ghost: 'text-gray-400', dragon: 'text-red-400',
  octopus: 'text-purple-400', robot: 'text-blue-400', mushroom: 'text-green-400',
  chonk: 'text-orange-400', owl: 'text-indigo-400', cactus: 'text-lime-400',
  penguin: 'text-cyan-400', goose: 'text-red-500', turtle: 'text-emerald-400',
  axolotl: 'text-pink-400', rabbit: 'text-amber-400', void: 'text-violet-400',
  crow: 'text-gray-300', mantis: 'text-green-500', phoenix: 'text-orange-500',
  spider: 'text-zinc-400', guardian: 'text-blue-300', wolf: 'text-zinc-300',
  fox: 'text-amber-300', elephant: 'text-gray-300', shark: 'text-slate-400',
  parrot: 'text-green-300', numbers: 'text-blue-400', scientist: 'text-purple-300',
  kraken: 'text-red-400', gorilla: 'text-zinc-400', jellyfish: 'text-cyan-300',
  lemur: 'text-amber-300', hawk: 'text-yellow-300', snake: 'text-green-400',
  panda: 'text-gray-300', moth: 'text-orange-300', karne: 'text-pink-300',
  claw: 'text-red-300', duck: 'text-yellow-400',
};

export default function InterventionPanel() {
  const [divisions, setDivisions] = useState<Division[]>(DIVISIONS);
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null);
  const [controlLog, setControlLog] = useState<ControlEvent[]>([]);
  const [action, setAction] = useState<string>('throttle');
  const [value, setValue] = useState<number>(50);
  const [reallocateFrom, setReallocateFrom] = useState<string>('');
  const [reallocateTo, setReallocateTo] = useState<string>('');
  const [reallocateCount, setReallocateCount] = useState<number>(1);
  const [loading, setLoading] = useState(false);

  const fetchControlLog = useCallback(async () => {
    try {
      const res = await fetch(`${API}/logs?limit=50`);
      if (res.ok) {
        const logs = await res.json();
        const controlEvents = logs.filter((l: any) => 
          l.type === 'division_control' || 
          l.type === 'reallocate' || 
          l.type === 'gesture' ||
          l.type === 'interrupt' ||
          l.type === 'ball_broadcast'
        );
        setControlLog(controlEvents.slice(0, 20));
      }
    } catch(e) {}
  }, []);

  useEffect(() => {
    fetchControlLog();
    const interval = setInterval(fetchControlLog, 3000);
    return () => clearInterval(interval);
  }, [fetchControlLog]);

  // Poll /api/pipeline for real division data every 10s
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const fetchPipeline = () => {
      fetch(`${API}/pipeline`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.divisions?.list) {
            setDivisions(data.divisions.list.map((d: any) => ({
              name: d.name,
              agentCount: d.agentCount,
              activeAgents: d.activeAgents,
              priority: 'normal' as const,
              cpuUsage: d.cpuUsage,
              memoryUsage: d.memoryUsage,
              agents: d.agents,
            })));
          }
        })
        .catch(() => {});
      timeout = setTimeout(fetchPipeline, 10000);
    };
    fetchPipeline();
    return () => clearTimeout(timeout);
  }, []);

  const handleDivisionControl = async () => {
    if (!selectedDivision) return;
    setLoading(true);
    try {
      await fetch(`${API}/division/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, division: selectedDivision, value }),
      });
      fetchControlLog();
    } catch(e) {}
    setLoading(false);
  };

  const handleReallocate = async () => {
    if (!reallocateFrom || !reallocateTo || !reallocateCount) return;
    setLoading(true);
    try {
      await fetch(`${API}/reallocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: reallocateFrom, to: reallocateTo, count: reallocateCount }),
      });
      fetchControlLog();
    } catch(e) {}
    setLoading(false);
  };

  const handleInterrupt = async (agentId: string, signal: string) => {
    try {
      await fetch(`${API}/interrupt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, signal }),
      });
      fetchControlLog();
    } catch(e) {}
  };

  const handleBallBroadcast = async () => {
    try {
      await fetch(`${API}/ball/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: `${selectedDivision || 'System'}: ${action} @ ${value}%`,
          division: selectedDivision,
          agents: divisions.find(d => d.name === selectedDivision)?.activeAgents 
        }),
      });
      fetchControlLog();
    } catch(e) {}
  };

  const totalAgents = divisions.reduce((sum, d) => sum + d.agentCount, 0);
  const totalActive = divisions.reduce((sum, d) => sum + d.activeAgents, 0);
  const avgLoad = Math.round(divisions.reduce((sum, d) => sum + d.cpuUsage, 0) / divisions.length);

  return (
    <div className="space-y-6">
      {/* HEADER STATS */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[#18181b] border border-white/[0.06] rounded-xl p-4">
          <div className="text-2xl font-bold text-cyan-400">{totalAgents}</div>
          <div className="text-xs text-zinc-500">Total Agents</div>
        </div>
        <div className="bg-[#18181b] border border-white/[0.06] rounded-xl p-4">
          <div className="text-2xl font-bold text-emerald-400">{totalActive}</div>
          <div className="text-xs text-zinc-500">Active Now</div>
        </div>
        <div className="bg-[#18181b] border border-white/[0.06] rounded-xl p-4">
          <div className="text-2xl font-bold text-amber-400">{avgLoad}%</div>
          <div className="text-xs text-zinc-500">Avg System Load</div>
        </div>
        <div className="bg-[#18181b] border border-white/[0.06] rounded-xl p-4">
          <div className="text-2xl font-bold text-rose-400">{divisions.filter(d => d.priority === 'critical').length}</div>
          <div className="text-xs text-zinc-500">Critical Divisions</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* DIVISION MAP */}
        <div>
          <h3 className="text-sm font-bold text-zinc-500 mb-3 uppercase tracking-wider">Division Map — Click to Select</h3>
          <div className="space-y-2">
            {divisions.map(div => (
              <button
                key={div.name}
                onClick={() => setSelectedDivision(div.name === selectedDivision ? null : div.name)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  selectedDivision === div.name
                    ? 'bg-cyan-950/50 border-cyan-500/50 shadow-[0_0_12px_rgba(34,211,238,0.1)]'
                    : 'bg-[#18181b] border-white/[0.06] hover:border-white/[0.12]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-zinc-200">{div.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-[#09090b] border border-white/[0.06] px-2 py-0.5 rounded">
                      <span className="text-emerald-400">{div.activeAgents}</span>
                      <span className="text-zinc-600">/</span>
                      <span className="text-zinc-400">{div.agentCount}</span>
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${PRIORITY_COLORS[div.priority]}`}>
                      {div.priority}
                    </span>
                  </div>
                </div>
                <div className="mt-2 h-1 bg-[#09090b] rounded overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 transition-all"
                    style={{ width: `${div.cpuUsage}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-zinc-600 mt-1">
                  <span>CPU: {div.cpuUsage}%</span>
                  <span>MEM: {div.memoryUsage}%</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* CONTROL PANEL */}
        <div>
          <h3 className="text-sm font-bold text-zinc-500 mb-3 uppercase tracking-wider">Control Panel</h3>
          
          {selectedDivision ? (
            <div className="bg-[#18181b] border border-cyan-500/20 rounded-xl p-4 space-y-4">
              <div className="text-center font-bold text-cyan-400 text-lg">
                {selectedDivision.toUpperCase()}
              </div>

              {/* Actions */}
              <div>
                <label className="block text-xs text-zinc-500 mb-2">ACTION</label>
                <div className="grid grid-cols-2 gap-2">
                  {['throttle', 'boost', 'redirect', 'escalate'].map(a => (
                    <button
                      key={a}
                      onClick={() => setAction(a)}
                      className={`py-2 rounded-lg text-sm font-bold uppercase transition-all ${
                        action === a ? 'bg-cyan-600 text-white shadow-cyan-900/30' : 'bg-[#09090b] border border-white/[0.08] text-zinc-400 hover:text-zinc-200 hover:border-white/[0.15]'
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              {/* Value slider */}
              <div>
                <label htmlFor="value-slider" className="block text-xs text-zinc-500 mb-2">VALUE: {value}%</label>
                <input
                  id="value-slider"
                  type="range"
                  min="0"
                  max="100"
                  value={value}
                  onChange={e => setValue(parseInt(e.target.value))}
                  className="w-full accent-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded"
                />
              </div>

              {/* Execute */}
              <button
                onClick={handleDivisionControl}
                disabled={loading}
                className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 py-3 rounded-lg font-bold shadow-lg shadow-cyan-900/20 transition-all"
              >
                {loading ? 'EXECUTING...' : `EXECUTE ${action.toUpperCase()} ON ${selectedDivision.toUpperCase()}`}
              </button>

              <button
                onClick={handleBallBroadcast}
                className="w-full bg-blue-600 hover:bg-blue-500 py-2 rounded-lg text-sm font-bold transition-all"
              >
                BROADCAST TO BALL DISPLAY
              </button>

              {/* Quick interrupts */}
              <div>
                <label className="block text-xs text-zinc-500 mb-2">QUICK INTERRUPT</label>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => handleInterrupt(selectedDivision, 'pause')} className="bg-amber-600 hover:bg-amber-500 py-1 rounded-lg text-xs font-bold transition-all">PAUSE</button>
                  <button onClick={() => handleInterrupt(selectedDivision, 'resume')} className="bg-emerald-600 hover:bg-emerald-500 py-1 rounded-lg text-xs font-bold transition-all">RESUME</button>
                  <button onClick={() => handleInterrupt(selectedDivision, 'kill')} className="bg-rose-600 hover:bg-rose-500 py-1 rounded-lg text-xs font-bold transition-all">KILL ALL</button>
                </div>
              </div>

              {/* Agents in this division */}
              {(divisions.find(d => d.name === selectedDivision)?.agents || []).length > 0 && (
                <div>
                  <label className="block text-xs text-zinc-500 mb-2">AGENTS IN DIVISION</label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {divisions.find(d => d.name === selectedDivision)?.agents?.map(agent => {
                      const emoji = agent.name ? AGENT_EMOJIS[agent.name.toLowerCase()] || '🤖' : '❓';
                      const color = agent.name ? AGENT_COLORS[agent.name.toLowerCase()] || 'text-zinc-400' : 'text-zinc-500';
                      return (
                        <div key={agent.id} className="flex items-center justify-between bg-[#09090b] border border-white/[0.06] rounded-lg px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{emoji}</span>
                            <span className={`text-xs font-bold ${color}`}>{agent.name || 'unnamed'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              agent.status === 'working' ? 'bg-emerald-500/20 text-emerald-400' :
                              agent.status === 'idle' ? 'bg-zinc-500/20 text-zinc-400' :
                              'bg-amber-500/20 text-amber-400'
                            }`}>{agent.status}</span>
                            <button
                              onClick={() => handleInterrupt(agent.id, 'kill')}
                              className="text-xs text-rose-500 hover:text-rose-400 ml-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500 rounded px-1"
                              aria-label={`Kill agent ${agent.name || 'unnamed'}`}
                              title="Kill agent"
                            >✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[#18181b] border border-white/[0.06] rounded-xl p-8 text-center text-zinc-600">
              Select a division from the map to control it
            </div>
          )}

          {/* REALLOCATE */}
          <div className="mt-4 bg-[#18181b] border border-white/[0.06] rounded-xl p-4">
            <h4 className="text-sm font-bold text-zinc-500 mb-3">REALLOCATE AGENTS</h4>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <select
                value={reallocateFrom}
                onChange={e => setReallocateFrom(e.target.value)}
                aria-label="Source division for reallocation"
                className="bg-[#09090b] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus:border-cyan-500/50"
              >
                <option value="">FROM</option>
                {divisions.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
              </select>
              <select
                value={reallocateTo}
                onChange={e => setReallocateTo(e.target.value)}
                aria-label="Target division for reallocation"
                className="bg-[#09090b] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus:border-cyan-500/50"
              >
                <option value="">TO</option>
                {divisions.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
              </select>
              <input
                type="number"
                min="1"
                value={reallocateCount}
                onChange={e => setReallocateCount(parseInt(e.target.value) || 1)}
                aria-label="Number of agents to reallocate"
                className="bg-[#09090b] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus:border-cyan-500/50"
              />
            </div>
            <button
              onClick={handleReallocate}
              disabled={!reallocateFrom || !reallocateTo || loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2 rounded-lg text-sm font-bold shadow-lg shadow-emerald-900/20 transition-all"
            >
              MOVE {reallocateCount} AGENT{reallocateCount > 1 ? 'S' : ''}
            </button>
          </div>
        </div>
      </div>

      {/* CONTROL LOG */}
      <div>
        <h3 className="text-sm font-bold text-zinc-500 mb-3">CONTROL LOG</h3>
        <div className="bg-[#09090b] border border-white/[0.06] rounded-xl p-4 h-48 overflow-y-auto">
          {controlLog.length === 0 && (
            <div className="text-center text-zinc-600 py-8">No control events yet</div>
          )}
          {controlLog.map((evt, i) => (
            <div key={i} className="text-xs py-1 border-b border-white/[0.04]">
              <span className="text-zinc-600">[{new Date(evt.timestamp).toLocaleTimeString()}]</span>{' '}
              <span className={
                evt.type === 'division_control' ? 'text-cyan-400' :
                evt.type === 'reallocate' ? 'text-blue-400' :
                evt.type === 'gesture' ? 'text-amber-400' :
                evt.type === 'interrupt' ? 'text-rose-400' :
                'text-emerald-400'
              }>
                {evt.type}
              </span>
              {evt.division && <span className="text-zinc-300"> — {evt.division}</span>}
              {evt.action && <span className="text-zinc-400"> ({evt.action} @ {evt.value}%)</span>}
              {evt.from && <span className="text-zinc-400"> {evt.from} → {evt.to} ({evt.count})</span>}
              {evt.signal && <span className="text-zinc-400"> [{evt.signal}]</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
