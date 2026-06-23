'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface AgentLog {
  id: string;
  topic: string;
  message: string;
  timestamp: string;
  level: 'info' | 'error' | 'warn' | 'agent' | 'chorus' | 'system';
  source: string;
  agentId?: string;
  agentName?: string;
}

export interface ChorusEntry {
  id: string;
  timestamp: string;
  companion: string;
  emoji: string;
  message: string;
}

export interface LiveAgentOutput {
  agentId: string;
  agentName: string;
  emoji: string;
  division: string;
  status: 'working' | 'completed' | 'error';
  output: string;
  updatedAt: number;
}

export interface UseAgentEventsReturn {
  logs: AgentLog[];
  chorus: ChorusEntry[];
  liveOutputs: LiveAgentOutput[];
  towerConnected: boolean;
  eventBusConnected: boolean;
}

const MAX_LOGS = 500;
const MAX_CHORUS = 100;
const MAX_LIVE_OUTPUTS = 50;
const RECONNECT_MAX_ATTEMPTS = 10;

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function formatTime() {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function useAgentEvents(): UseAgentEventsReturn {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [chorus, setChorus] = useState<ChorusEntry[]>([]);
  const [liveOutputs, setLiveOutputs] = useState<LiveAgentOutput[]>([]);
  const [towerConnected, setTowerConnected] = useState(false);
  const [eventBusConnected, setEventBusConnected] = useState(false);

  const towerEsRef = useRef<EventSource | null>(null);
  const busEsRef = useRef<EventSource | null>(null);
  const towerRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const towerAttemptsRef = useRef(0);
  const busAttemptsRef = useRef(0);

  const addLog = useCallback((log: Omit<AgentLog, 'id' | 'timestamp'>) => {
    setLogs(prev => [{
      id: generateId(),
      timestamp: formatTime(),
      ...log,
    }, ...prev.slice(0, MAX_LOGS - 1)]);
  }, []);

  const addChorus = useCallback((entry: Omit<ChorusEntry, 'id' | 'timestamp'>) => {
    setChorus(prev => [{
      id: generateId(),
      timestamp: formatTime(),
      ...entry,
    }, ...prev.slice(0, MAX_CHORUS - 1)]);
  }, []);

  const updateLiveOutput = useCallback((update: Omit<LiveAgentOutput, 'updatedAt'>) => {
    setLiveOutputs(prev => {
      const existing = prev.find(o => o.agentId === update.agentId);
      const now = Date.now();
      if (existing) {
        return [
          {
            ...existing,
            ...update,
            output: update.output ? (existing.output ? existing.output + '\n' + update.output : update.output) : existing.output,
            updatedAt: now,
          },
          ...prev.filter(o => o.agentId !== update.agentId),
        ].slice(0, MAX_LIVE_OUTPUTS);
      }
      return [{ ...update, updatedAt: now }, ...prev].slice(0, MAX_LIVE_OUTPUTS);
    });
  }, []);

  const removeLiveOutput = useCallback((agentId: string) => {
    setLiveOutputs(prev => prev.filter(o => o.agentId !== agentId));
  }, []);

  // Tower SSE connection
  const connectTower = useCallback(() => {
    towerEsRef.current?.close();
    try {
      const es = new EventSource('/api/tower/stream');
      towerEsRef.current = es;

      es.onopen = () => {
        setTowerConnected(true);
        towerAttemptsRef.current = 0;
        addLog({ topic: 'system', message: 'Tower stream connected', level: 'system', source: 'SSE' });
      };

      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          const data = msg.data || msg;
          const eventType = msg.type || data.type;

          if (eventType === 'agent_spawned' || eventType === 'agent_spawn') {
            const name = data.name || data.agentName || 'Unknown';
            const id = data.agentId || data.id || name;
            addLog({
              topic: 'agent.spawned',
              message: `${name} spawned (PID ${data.pid || 'N/A'})`,
              level: 'agent',
              source: 'TOWER',
              agentId: id,
              agentName: name,
            });
            updateLiveOutput({
              agentId: id,
              agentName: name,
              emoji: data.emoji || '◈',
              division: data.division || 'Unknown',
              status: 'working',
              output: '',
            });
          } else if (eventType === 'agent_complete' || eventType === 'agent_completed') {
            const name = data.agentName || data.name || 'Unknown';
            const id = data.agentId || data.id || name;
            const code = data.code ?? data.exitCode ?? '?';
            const isError = code !== 0 && code !== '0';
            addLog({
              topic: 'agent.completed',
              message: `${name} completed (code ${code})`,
              level: isError ? 'error' : 'agent',
              source: 'TOWER',
              agentId: id,
              agentName: name,
            });
            updateLiveOutput({
              agentId: id,
              agentName: name,
              emoji: data.emoji || '◈',
              division: data.division || 'Unknown',
              status: isError ? 'error' : 'completed',
              output: data.result || data.output || '',
            });
            // Keep completed/error outputs visible for 30s then auto-remove
            setTimeout(() => removeLiveOutput(id), 30000);
          } else if (eventType === 'agent_output') {
            const name = data.agentName || data.name || 'Unknown';
            const id = data.agentId || data.id || name;
            const text = (data.output || '').toString().trim();
            if (text) {
              addLog({
                topic: 'agent_output',
                message: text.substring(0, 300),
                level: 'info',
                source: name,
                agentId: id,
                agentName: name,
              });
              updateLiveOutput({
                agentId: id,
                agentName: name,
                emoji: data.emoji || '◈',
                division: data.division || 'Unknown',
                status: 'working',
                output: text,
              });
            }
          } else if (eventType === 'agent_error') {
            const name = data.agentName || data.name || 'Unknown';
            const id = data.agentId || data.id || name;
            const text = (data.output || data.error || 'Agent error').toString().trim();
            addLog({
              topic: 'agent_error',
              message: text.substring(0, 300),
              level: 'error',
              source: name,
              agentId: id,
              agentName: name,
            });
            updateLiveOutput({
              agentId: id,
              agentName: name,
              emoji: data.emoji || '◈',
              division: data.division || 'Unknown',
              status: 'error',
              output: text,
            });
          }
        } catch {}
      };

      es.onerror = () => {
        setTowerConnected(false);
        es.close();
        towerAttemptsRef.current++;
        if (towerAttemptsRef.current < RECONNECT_MAX_ATTEMPTS) {
          const delay = Math.min(2000 * towerAttemptsRef.current, 10000);
          towerRetryRef.current = setTimeout(connectTower, delay);
        }
      };
    } catch {}
  }, [addLog, updateLiveOutput, removeLiveOutput]);

  // EventBus SSE connection
  const connectEventBus = useCallback(() => {
    busEsRef.current?.close();
    try {
      const es = new EventSource('/api/eventbus/stream?topic=*');
      busEsRef.current = es;

      es.onopen = () => {
        setEventBusConnected(true);
        busAttemptsRef.current = 0;
      };

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          const topic = data.topic || '';

          if (topic.includes('chorus') || topic.includes('companion')) {
            const msg = data.message || data.payload || data;
            const companion = msg.companion || msg.name || 'Companion';
            const emoji = msg.emoji || '🎭';
            const text = msg.response || msg.message || msg.text || (typeof msg === 'string' ? msg : JSON.stringify(msg));
            if (text && text !== '[object Object]') {
              const cleanText = text.toString().substring(0, 300);
              addChorus({ companion, emoji, message: cleanText });
              addLog({
                topic: 'chorus',
                message: cleanText,
                level: 'chorus',
                source: companion,
              });
            }
          } else if (topic.includes('agent')) {
            addLog({
              topic,
              message: typeof data.message === 'string' ? data.message : JSON.stringify(data).substring(0, 200),
              level: 'info',
              source: 'EVENTBUS',
            });
          }
        } catch {}
      };

      es.onerror = () => {
        setEventBusConnected(false);
        es.close();
        busAttemptsRef.current++;
        if (busAttemptsRef.current < RECONNECT_MAX_ATTEMPTS) {
          const delay = Math.min(3000 * busAttemptsRef.current, 15000);
          busRetryRef.current = setTimeout(connectEventBus, delay);
        }
      };
    } catch {}
  }, [addLog, addChorus]);

  useEffect(() => {
    connectTower();
    connectEventBus();
    return () => {
      towerEsRef.current?.close();
      busEsRef.current?.close();
      if (towerRetryRef.current) clearTimeout(towerRetryRef.current);
      if (busRetryRef.current) clearTimeout(busRetryRef.current);
    };
  }, [connectTower, connectEventBus]);

  return { logs, chorus, liveOutputs, towerConnected, eventBusConnected };
}
