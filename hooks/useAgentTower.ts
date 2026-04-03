import { useState, useEffect, useCallback, useRef } from 'react';

const TOWER_BASE_URL = 'http://localhost:7790';
const SSE_URL = `${TOWER_BASE_URL}/tower/stream`;
const STATUS_URL = `${TOWER_BASE_URL}/tower/status`;
const POLL_INTERVAL = 5000;

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  division: string;
  role: string;
  tier: number;
  status: string;
  task: string;
  teamId: string | null;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  leader: string;
  members: string[];
  status: string;
  priority: string;
  createdAt: string;
}

export interface TowerStatus {
  uptime: number;
  agentCount: number;
  teamCount: number;
  divisions?: Record<string, {
    id: string;
    color: string;
    tier: number;
    agents: string[];
    activeCount: number;
    idleCount: number;
    totalAgents: number;
  }>;
  teams?: Team[];
  activeAgents?: Agent[];
}

interface SSEMessage {
  type: string;
  [key: string]: unknown;
}

export function useAgentTower() {
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [towerStatus, setTowerStatus] = useState<TowerStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(STATUS_URL);
      if (res.ok) {
        const data = await res.json();
        setTowerStatus(data);
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }, []);

  const handleSSEMessage = useCallback((message: SSEMessage) => {
    switch (message.type) {
      case 'connected':
        setConnected(true);
        break;

      case 'agent_spawned':
        setAgents(prev => {
          if (prev.some(a => a.id === message.agentId)) {
            return prev;
          }
          return [...prev, {
            id: message.agentId as string,
            name: message.name as string,
            emoji: (message.emoji as string) || '🤖',
            division: message.division as string,
            role: (message.role as string) || 'Agent',
            tier: (message.tier as number) || 1,
            status: 'active',
            task: (message.task as string) || '',
            teamId: (message.teamId as string) || null,
            createdAt: new Date().toISOString(),
          }];
        });
        break;

      case 'agent_killed':
        setAgents(prev => prev.filter(a => a.id !== message.agentId));
        break;

      case 'team_spawned':
        setTeams(prev => {
          if (prev.some(t => t.id === message.teamId)) {
            return prev;
          }
          return [...prev, {
            id: message.teamId as string,
            name: message.name as string,
            leader: message.leader as string,
            members: (message.members as string[]) || [],
            status: 'active',
            priority: (message.priority as string) || 'normal',
            createdAt: new Date().toISOString(),
          }];
        });
        break;

      case 'team_killed':
        setTeams(prev => prev.filter(t => t.id !== message.teamId));
        break;

      case 'api_connected':
      case 'ball_connected':
        break;

      default:
        break;
    }
  }, []);

  useEffect(() => {
    const connectSSE = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource(SSE_URL);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const message: SSEMessage = JSON.parse(event.data);
          handleSSEMessage(message);
        } catch {
        }
      };

      eventSource.onerror = () => {
        setConnected(false);
        eventSource.close();
        setTimeout(connectSSE, POLL_INTERVAL);
      };
    };

    connectSSE();
    fetchStatus();

    pollIntervalRef.current = setInterval(fetchStatus, POLL_INTERVAL);

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [fetchStatus, handleSSEMessage]);

  const spawnAgent = useCallback(async (division: string, agentName: string): Promise<void> => {
    try {
      const res = await fetch(`${TOWER_BASE_URL}/api/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName, task: `Task for ${agentName} in ${division}` }),
      });
      if (!res.ok) {
        throw new Error(`Failed to spawn agent: ${res.statusText}`);
      }
    } catch (error) {
      console.error('spawnAgent error:', error);
      throw error;
    }
  }, []);

  const spawnTeam = useCallback(async (teamName: string, leader: string, members: string[]): Promise<void> => {
    try {
      const res = await fetch(`${TOWER_BASE_URL}/api/team/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: teamName, leader, members, task: `Team task for ${teamName}` }),
      });
      if (!res.ok) {
        throw new Error(`Failed to spawn team: ${res.statusText}`);
      }
    } catch (error) {
      console.error('spawnTeam error:', error);
      throw error;
    }
  }, []);

  const killAgent = useCallback(async (agentId: string): Promise<void> => {
    try {
      const res = await fetch(`${TOWER_BASE_URL}/api/agents/${encodeURIComponent(agentId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error(`Failed to kill agent: ${res.statusText}`);
      }
    } catch (error) {
      console.error('killAgent error:', error);
      throw error;
    }
  }, []);

  const killTeam = useCallback(async (teamId: string): Promise<void> => {
    try {
      const res = await fetch(`${TOWER_BASE_URL}/api/teams/${encodeURIComponent(teamId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error(`Failed to kill team: ${res.statusText}`);
      }
    } catch (error) {
      console.error('killTeam error:', error);
      throw error;
    }
  }, []);

  return {
    connected,
    agents,
    teams,
    towerStatus,
    loading,
    spawnAgent,
    spawnTeam,
    killAgent,
    killTeam,
  };
}
