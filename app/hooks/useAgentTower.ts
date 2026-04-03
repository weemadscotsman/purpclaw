import { useState, useEffect, useCallback, useRef } from 'react';

export interface Agent { id: string; name: string; division: string; status: string; createdAt: string; pid?: number; }
export interface Team { name: string; leader: string; members: string[]; createdAt: string; }
export interface Division { id: string; name: string; active: boolean; }
export interface TowerEvent { type: string; data: unknown; timestamp: string; }
export interface TowerStatus { connected: boolean; uptime?: number; agentCount: number; teamCount: number; }

export interface UseAgentTowerReturn {
  connected: boolean;
  agents: Agent[];
  teams: Team[];
  divisions: Division[];
  towerStatus: TowerStatus;
  events: TowerEvent[];
  spawnAgent: (division: string, agentName?: string) => Promise<Response>;
  spawnTeam: (teamName: string, leader: string, members: string[]) => Promise<Response>;
  killAgent: (agentId: string) => Promise<Response>;
  killTeam: (teamName: string) => Promise<Response>;
}

const MAX_EVENTS = 500;

export function useAgentTower(): UseAgentTowerReturn {
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [towerStatus, setTowerStatus] = useState<TowerStatus>({ connected: false, agentCount: 0, teamCount: 0 });
  const [events, setEvents] = useState<TowerEvent[]>([]);

  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);

  const addEvent = useCallback((type: string, data: unknown) => {
    setEvents(prev => [...prev, { type, data, timestamp: new Date().toISOString() }].slice(-MAX_EVENTS));
  }, []);

  const handleAgentSpawn = useCallback((data: unknown) => {
    const agent = data as Agent;
    setAgents(prev => {
      const existing = prev.findIndex(a => a.id === agent.id);
      if (existing >= 0) {
        return Object.assign([], prev, { [existing]: agent });
      }
      return [...prev, agent];
    });
    setTowerStatus(prev => ({ ...prev, agentCount: prev.agentCount + 1 }));
  }, []);

  const handleAgentKill = useCallback((data: unknown) => {
    const { id } = data as { id: string };
    setAgents(prev => prev.filter(a => a.id !== id));
    setTowerStatus(prev => ({ ...prev, agentCount: Math.max(0, prev.agentCount - 1) }));
  }, []);

  const handleAgentOutput = useCallback((data: unknown) => {
    addEvent('agent_output', data);
  }, [addEvent]);

  const handleTeamCreated = useCallback((data: unknown) => {
    const team = data as Team;
    setTeams(prev => {
      const existing = prev.findIndex(t => t.name === team.name);
      if (existing >= 0) {
        return Object.assign([], prev, { [existing]: team });
      }
      return [...prev, team];
    });
    setTowerStatus(prev => ({ ...prev, teamCount: prev.teamCount + 1 }));
  }, []);

  const handleTeamDisbanded = useCallback((data: unknown) => {
    const { name } = data as { name: string };
    setTeams(prev => prev.filter(t => t.name !== name));
    setTowerStatus(prev => ({ ...prev, teamCount: Math.max(0, prev.teamCount - 1) }));
  }, []);

  const handleDivisionUpdate = useCallback((data: unknown) => {
    const division = data as Division;
    setDivisions(prev => {
      const existing = prev.findIndex(d => d.id === division.id);
      if (existing >= 0) {
        return Object.assign([], prev, { [existing]: division });
      }
      return [...prev, division];
    });
  }, []);

  const connect = useCallback(() => {
    esRef.current?.close();

    const es = new EventSource('http://localhost:7790/tower/stream');
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
      attempts.current = 0;
      setTowerStatus(prev => ({ ...prev, connected: true }));
    };

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string; data: unknown };
        addEvent(msg.type, msg.data);

        switch (msg.type) {
          case 'agent_spawn':
            handleAgentSpawn(msg.data);
            break;
          case 'agent_kill':
            handleAgentKill(msg.data);
            break;
          case 'agent_output':
            handleAgentOutput(msg.data);
            break;
          case 'team_created':
            handleTeamCreated(msg.data);
            break;
          case 'team_disbanded':
            handleTeamDisbanded(msg.data);
            break;
          case 'division_update':
            handleDivisionUpdate(msg.data);
            break;
        }
      } catch {
        console.error('Tower SSE parse error');
      }
    };

    es.onerror = () => {
      setConnected(false);
      setTowerStatus(prev => ({ ...prev, connected: false }));
      es.close();

      if (attempts.current < 10) {
        reconnectRef.current = setTimeout(() => {
          attempts.current++;
          connect();
        }, 1000 * Math.pow(2, attempts.current));
      }
    };
  }, [addEvent, handleAgentSpawn, handleAgentKill, handleAgentOutput, handleTeamCreated, handleTeamDisbanded, handleDivisionUpdate]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
      }
    };
  }, [connect]);

  const spawnAgent = useCallback(async (division: string, agentName?: string): Promise<Response> => {
    const res = await fetch('http://localhost:7780/api/tower/spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ division, name: agentName }),
    });
    if (!res.ok) throw new Error(res.statusText);
    return res;
  }, []);

  const spawnTeam = useCallback(async (teamName: string, leader: string, members: string[]): Promise<Response> => {
    const res = await fetch('http://localhost:7780/api/tower/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName, leader, members }),
    });
    if (!res.ok) throw new Error(res.statusText);
    return res;
  }, []);

  const killAgent = useCallback(async (agentId: string): Promise<Response> => {
    const res = await fetch(`http://localhost:7780/api/tower/agents/${agentId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(res.statusText);
    return res;
  }, []);

  const killTeam = useCallback(async (teamName: string): Promise<Response> => {
    const res = await fetch(`http://localhost:7780/api/tower/team/${encodeURIComponent(teamName)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(res.statusText);
    return res;
  }, []);

  return {
    connected,
    agents,
    teams,
    divisions,
    towerStatus,
    events,
    spawnAgent,
    spawnTeam,
    killAgent,
    killTeam,
  };
}
