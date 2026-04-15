'use client';

import React from 'react';
import { useApi } from '../hooks/useApi';

interface Agent {
  id: string;
  division: string;
  status: string;
  currentTask: string;
  startTime: string;
}

const DIVISIONS = ['AI Research', 'Security', 'Engineering', 'Operations', 'Analytics'];

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500',
  idle: 'bg-yellow-500',
  busy: 'bg-blue-500',
  error: 'bg-red-500',
  offline: 'bg-gray-500',
};

function getUptime(startTime: string): string {
  const start = new Date(startTime).getTime();
  const now = Date.now();
  const diff = Math.floor((now - start) / 1000);
  
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  return `${Math.floor(diff / 86400)}d ${Math.floor((diff % 86400) / 3600)}h`;
}

function AgentCard({ agent, onKill }: { agent: Agent; onKill: (id: string) => void }) {
  const statusColor = STATUS_COLORS[agent.status.toLowerCase()] || 'bg-gray-500';
  const uptime = getUptime(agent.startTime);
  
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${statusColor} animate-pulse`} />
          <div>
            <h3 className="font-mono text-sm font-semibold text-white">{agent.id}</h3>
            <p className="text-xs text-gray-400">{agent.division}</p>
          </div>
        </div>
        <span className="text-xs text-gray-500 font-mono">{uptime}</span>
      </div>
      
      <div className="space-y-2">
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wide">Task</span>
          <p className="text-sm text-gray-200 truncate">{agent.currentTask || 'No active task'}</p>
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t border-gray-700">
          <span className={`text-xs px-2 py-1 rounded ${
            agent.status.toLowerCase() === 'active' ? 'bg-green-500/20 text-green-400' :
            agent.status.toLowerCase() === 'error' ? 'bg-red-500/20 text-red-400' :
            'bg-gray-700 text-gray-400'
          }`}>
            {agent.status}
          </span>
          
          <button
            onClick={() => onKill(agent.id)}
            className="text-xs px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors font-mono"
          >
            Kill
          </button>
        </div>
      </div>
    </div>
  );
}

function DivisionSection({ 
  division, 
  agents, 
  onKill 
}: { 
  division: string; 
  agents: Agent[]; 
  onKill: (id: string) => void;
}) {
  if (agents.length === 0) return null;
  
  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-white">{division}</h2>
        <span className="text-sm text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
          {agents.length} agent{agents.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} onKill={onKill} />
        ))}
      </div>
    </section>
  );
}

function SpawnForm({ 
  divisions, 
  onSpawn 
}: { 
  divisions: string[]; 
  onSpawn: (division: string, config?: object) => void;
}) {
  const [selectedDivision, setSelectedDivision] = React.useState(divisions[0] || '');
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDivision) {
      onSpawn(selectedDivision);
      setSelectedDivision(divisions[0] || '');
      setIsExpanded(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Spawn New Agent</h2>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      
      <div className="flex gap-3">
        <select
          value={selectedDivision}
          onChange={(e) => setSelectedDivision(e.target.value)}
          className="flex-1 bg-gray-900 text-white text-sm rounded px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none"
        >
          {divisions.map((div) => (
            <option key={div} value={div}>{div}</option>
          ))}
        </select>
        
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
        >
          Spawn Agent
        </button>
      </div>
      
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <p className="text-xs text-gray-500">Additional configuration options coming soon...</p>
        </div>
      )}
    </form>
  );
}

function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
      connected 
        ? 'bg-green-500/20 text-green-400' 
        : 'bg-red-500/20 text-red-400'
    }`}>
      <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`} />
      {connected ? 'Connected' : 'Disconnected'}
    </div>
  );
}

export export default function AgentList() {
  const { agents, divisions, spawnAgent, killAgent, connected } = useApi();
  
  const agentsByDivision = React.useMemo(() => {
    const grouped: Record<string, Agent[]> = {};
    
    (agents as unknown as Agent[]).forEach((agent) => {
      const division = (agent as any).division || 'Unassigned';
      if (!grouped[division]) {
        grouped[division] = [];
      }
      grouped[division].push(agent);
    });
    
    return grouped;
  }, [agents]);
  
  const availableDivisions = React.useMemo(() => {
    const divisionNames = divisions.map(d => d.name);
    const allDivisions = [...new Set([...divisionNames, ...DIVISIONS])];
    return allDivisions.length > 0 ? allDivisions : DIVISIONS;
  }, [divisions]);
  
  const handleKillAgent = (agentId: string) => {
    if (window.confirm(`Are you sure you want to kill agent ${agentId}?`)) {
      killAgent(agentId);
    }
  };
  
  const handleSpawnAgent = (division: string, config?: object) => {
    spawnAgent(division, config ? JSON.stringify(config) : undefined);
  };
  
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Agent Control Center</h1>
          <p className="text-sm text-gray-400">
            {(agents as unknown as Agent[]).length} total agent{(agents as unknown as Agent[]).length !== 1 ? 's' : ''}
          </p>
        </div>
        <ConnectionStatus connected={connected} />
      </div>
      
      <SpawnForm divisions={availableDivisions} onSpawn={handleSpawnAgent} />
      
      <div className="space-y-6">
        {availableDivisions.map((division) => (
          <DivisionSection
            key={division}
            division={division}
            agents={agentsByDivision[division] || []}
            onKill={handleKillAgent}
          />
        ))}
        
        {agentsByDivision['Unassigned'] && (
          <DivisionSection
            division="Unassigned"
            agents={agentsByDivision['Unassigned']}
            onKill={handleKillAgent}
          />
        )}
      </div>
      
      {(!agents || (agents as unknown as Agent[]).length === 0) && (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">🤖</div>
          <h3 className="text-lg font-medium text-white mb-2">No Agents Active</h3>
          <p className="text-sm text-gray-400">Spawn a new agent to get started</p>
        </div>
      )}
    </div>
  );
}
