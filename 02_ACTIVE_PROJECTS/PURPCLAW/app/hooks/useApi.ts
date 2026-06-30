import { useState, useEffect, useCallback, useRef } from 'react';

export interface Agent {
  id: string;
  name: string;
  status: string;
  createdAt?: string;
  pid?: number;
  division?: string;
  currentTask?: string;
  startTime?: string;
}
export interface LogEntry { id: string; timestamp: string; level: 'info' | 'warn' | 'error' | 'debug'; message: string; source?: string; }
export interface PipelineStatus { running: boolean; currentStep?: string; progress?: number; }
export interface Division { id: string; name: string; active: boolean; }
export interface Settings { autoReconnect: boolean; logLevel: string; maxLogs: number; theme?: string; activeBackend?: string; aiBackends?: AIBackend[]; }

export interface AIBackend {
  id: string;
  name: string;
  provider: string;
  apiKey: string;
  endpoint: string;
  model: string;
  contextWindow: number;
  supportsStreaming: boolean;
  supportsFunctionCalling: boolean;
  enabled: boolean;
}

interface ServerEvent {
  type: 'log' | 'agent_update' | 'status' | 'pipeline' | 'division_update' | 'connected' | 'error';
  data: unknown;
}

export function useApi() {
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [status, setStatus] = useState<PipelineStatus>({ running: false });
  const [pipeline, setPipeline] = useState<unknown>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [settings, setSettings] = useState<Settings>({ autoReconnect: true, logLevel: 'info', maxLogs: 1000, theme: 'dark' });

  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);

  const proxyUrl = useCallback((port: number, path: string, soft = false) => {
    return `/api/service-proxy?port=${port}&path=${encodeURIComponent(path)}${soft ? '&soft=1' : ''}`;
  }, []);

  const unwrapProxy = (payload: any) => payload?.data ?? payload;

  const refreshTowerSnapshot = useCallback(async () => {
    const res = await fetch(proxyUrl(7790, '/tower/status', true), { cache: 'no-store' });
    if (!res.ok) return;
    const tower = unwrapProxy(await res.json());
    const activeAgents = Array.isArray(tower?.activeAgents) ? tower.activeAgents : [];
    const mappedAgents: Agent[] = activeAgents.map((a: any) => ({
      id: String(a.id || a.name),
      name: String(a.name || a.id || 'agent'),
      status: String(a.status || 'working'),
      pid: a.pid,
      division: a.division || 'Unassigned',
      currentTask: a.task || a.currentTask || '',
      startTime: a.startTime || a.createdAt || new Date().toISOString(),
    }));
    setAgents(mappedAgents);
    const divisionRows = Object.entries(tower?.divisions || {}).map(([id, d]: [string, any]) => ({
      id,
      name: d?.name || id,
      active: Number(d?.activeCount || 0) > 0,
    }));
    setDivisions(divisionRows);
    setStatus({
      running: mappedAgents.length > 0,
      currentStep: mappedAgents.length ? `${mappedAgents.length} active tower agent(s)` : 'idle',
      progress: mappedAgents.length ? 50 : 0,
    });
  }, [proxyUrl]);

  const connect = useCallback(() => {
    esRef.current?.close();
    const es = new EventSource('/api/logs/stream');
    esRef.current = es;

    es.onopen = () => { setConnected(true); attempts.current = 0; };
    es.onmessage = (event) => {
      try {
        const msg: ServerEvent = JSON.parse(event.data);
        switch (msg.type) {
          case 'log': setLogs(prev => [...prev, msg.data as LogEntry].slice(-settings.maxLogs)); break;
          case 'agent_update': setAgents(prev => { const a = msg.data as Agent; const i = prev.findIndex(x => x.id === a.id); return i >= 0 ? Object.assign([], prev, { [i]: a }) : [...prev, a]; }); break;
          case 'status': setStatus(msg.data as PipelineStatus); break;
          case 'pipeline': setPipeline(msg.data); break;
          case 'division_update': setDivisions(prev => { const d = msg.data as Division; const i = prev.findIndex(x => x.id === d.id); return i >= 0 ? Object.assign([], prev, { [i]: d }) : [...prev, d]; }); break;
          case 'connected': setConnected(true); break;
          case 'error': console.error('SSE:', msg.data); break;
        }
      } catch { console.error('Parse error'); }
    };
    es.onerror = () => {
      setConnected(false);
      es.close();
      if (settings.autoReconnect && attempts.current < 10) {
        reconnectRef.current = setTimeout(() => { attempts.current++; connect(); }, 1000 * Math.pow(2, attempts.current));
      }
    };
  }, [settings.autoReconnect, settings.maxLogs]);

  useEffect(() => {
    connect();
    refreshTowerSnapshot().catch(() => {});
    const poll = setInterval(() => refreshTowerSnapshot().catch(() => {}), 5000);
    return () => {
      clearInterval(poll);
      esRef.current?.close();
      reconnectRef.current && clearTimeout(reconnectRef.current);
    };
  }, [connect, refreshTowerSnapshot]);

  const apiFetch = useCallback((path: string, options?: RequestInit) => {
    return fetch(proxyUrl(7780, `/api${path}`, false), options);
  }, [proxyUrl]);

  const executeTool = useCallback(async (tool: string, args?: Record<string, unknown>) => {
    const res = await apiFetch('/execute-tool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool, args }) });
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }, [apiFetch]);

  const spawnAgent = useCallback(async (name: string, instructions?: string) => {
    const res = await fetch(proxyUrl(7790, '/api/spawn', false), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentName: name, task: instructions || `Manual spawn: ${name}` }),
    });
    if (!res.ok) throw new Error(res.statusText);
    await refreshTowerSnapshot().catch(() => {});
    return res.json();
  }, [proxyUrl, refreshTowerSnapshot]);

  const killAgent = useCallback(async (agentId: string) => {
    const res = await fetch(proxyUrl(7790, `/api/agents/${encodeURIComponent(agentId)}`, false), { method: 'DELETE' });
    if (!res.ok) throw new Error(res.statusText);
    await refreshTowerSnapshot().catch(() => {});
    return res.json();
  }, [proxyUrl, refreshTowerSnapshot]);

  const getAgents = useCallback(async () => {
    await refreshTowerSnapshot();
    return agents;
  }, [agents, refreshTowerSnapshot]);

  const getLogs = useCallback(async (filter?: string) => {
    const url = filter ? `/logs?filter=${encodeURIComponent(filter)}` : '/logs';
    const res = await apiFetch(url);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    setLogs(data);
    return data;
  }, [apiFetch]);

  const getStatus = useCallback(async () => {
    const res = await apiFetch('/status');
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    setStatus(data);
    return data;
  }, [apiFetch]);

  const getPipeline = useCallback(async () => {
    const res = await apiFetch('/pipeline');
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    setPipeline(data);
    return data;
  }, [apiFetch]);

  const getDivisions = useCallback(async () => {
    const res = await apiFetch('/divisions');
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    setDivisions(data);
    return data;
  }, [apiFetch]);

  const getSettings = useCallback(async () => {
    const res = await apiFetch('/settings');
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    setSettings(data);
    return data;
  }, [apiFetch]);

  const updateSettings = useCallback(async (newSettings: Partial<Settings>) => {
    const res = await apiFetch('/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSettings) });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    setSettings(prev => ({ ...prev, ...data }));
    return data;
  }, [apiFetch]);

  const getBackends = useCallback(async () => {
    const res = await apiFetch('/backends');
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }, [apiFetch]);

  const addBackend = useCallback(async (backend: AIBackend) => {
    const res = await apiFetch('/backends', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backend }) });
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }, [apiFetch]);

  const deleteBackend = useCallback(async (backendId: string) => {
    const res = await apiFetch(`/backends/${encodeURIComponent(backendId)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }, [apiFetch]);

  const switchBackend = useCallback(async (backendId: string) => {
    const res = await apiFetch('/backends/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backendId }) });
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }, [apiFetch]);

  const testBackend = useCallback(async (backendId?: string) => {
    const res = await apiFetch('/backends/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backendId }) });
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }, [apiFetch]);

  const sendCommand = useCallback(async (command: string) => {
    const res = await apiFetch('/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }) });
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }, [apiFetch]);

  const getSystemStats = useCallback(async () => {
    const res = await apiFetch('/system/stats');
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }, [apiFetch]);

  const getPipelineStatus = useCallback(async () => {
    const res = await apiFetch('/pipeline/status');
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }, [apiFetch]);

  return { connected, logs, agents, status, pipeline, divisions, settings, executeTool, spawnAgent, killAgent, getAgents, getLogs, getStatus, getPipeline, getDivisions, getSettings, updateSettings, getBackends, addBackend, deleteBackend, switchBackend, testBackend, sendCommand, getSystemStats, getPipelineStatus };
}
