'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface ServiceHealth {
  name: string;
  port: number;
  status: 'online' | 'degraded' | 'offline' | 'checking';
  latency?: number;
  uptime?: number;
  details?: Record<string, any>;
  key?: string;
  optional?: boolean;
  note?: string;
}

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  division: string;
  role: string;
  tier: number;
  status: 'idle' | 'working' | 'completed' | 'error';
  task?: string;
  startTime?: string;
  teamId?: string;
  pid?: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  ts: number;          // real epoch ms (for age/activity calculations)
  type: string;
  source: string;
  message: string;
  agentId?: string;
  agentName?: string;
  emoji?: string;
}

export interface Workflow {
  id: string;
  intent: string;
  target: string;
  status: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  steps?: { total: number; completed: number };
  plan?: { order: number; stage: string; operation: string; leader?: string | null; members?: string[]; candidates?: string[] }[];
  trace?: { stage: string; status: string; detail: string; timestamp: string; agentName?: string; agentId?: string; teamId?: string }[];
  route?: Record<string, any> | null;
  delegation?: Record<string, any> | null;
  result?: string;
  error?: string | null;
}

export interface PipelineStatus {
  active: Workflow[];
  completed: Workflow[];
  queue: { depth: number; items: any[] };
  metrics: {
    total: number;
    completed: number;
    failed: number;
    avgResponseTime: number;
  };
}

export interface DiagnosticData {
  findings: any[];
  voteTally: Record<string, number> | null;
  leadingCause: string | null;
}

export interface AgentScoresData {
  meta?: { totalTasksRecorded?: number; lastUpdated?: string };
  leaderboard?: any[];
  intentSummaries?: any[];
  recommendations?: any[];
}

export interface LLMLedgerData {
  totalCalls: number;
  totalTokens: number;
  totalCost: number;
}

export interface HarnessBenchmarkData {
  summary?: {
    totalGoals?: number;
    passedGoals?: number;
    completionRate?: number;
    passAt1Rate?: number;
    passAt3Rate?: number;
    retries?: number;
    memoryLessons?: number;
    agentScoreRecords?: number;
  };
  trend?: Record<string, number> | null;
  latest?: any;
  history?: any[];
}

export interface ApiKernelJob {
  id: string;
  goal: string;
  state: string;
  route: string;
  mode?: string;
  createdAt?: number;
  startedAt?: number;
  finishedAt?: number;
  linkedMissionId?: string | null;
  repoPath?: string | null;
  omnicodeIntake?: Record<string, any> | null;
  researchRun?: {
    ok?: boolean;
    mode?: string;
    query?: string;
    depth?: number;
    requestedModelCount?: number;
    freeModelCount?: number;
    memberCount?: number;
    successCount?: number;
    sourceCount?: number;
    sources?: Array<{ url?: string; ok?: boolean; error?: string | null }>;
    members?: Array<{ model?: string; name?: string; status?: string; error?: string | null; startedAt?: string; completedAt?: string }>;
    synthesisError?: string | null;
    createdAt?: string;
  };
  finalReport?: string;
  error?: string;
  classification?: Record<string, any>;
  contract?: Record<string, any>;
  eventCount?: number;
}

export interface RivalBenchmarkData {
  summary?: {
    generatedAt?: string;
    target?: string;
    source?: string;
    totals?: Record<string, number>;
    nextCriticalLanes?: string[];
  };
  lanes?: Array<{
    id: string;
    label: string;
    odysseus: string;
    purpclaw: string;
    status: 'ahead' | 'behind' | 'contested' | string;
    priority: number;
    winCondition: string;
    nextMoves: string[];
  }>;
}

export interface OmniCodeStatusData {
  ok?: boolean;
  mode?: string;
  contractVersion?: string;
  repoPath?: string;
  platformRoot?: string;
  capabilities?: Record<string, any>;
  gates?: {
    zeroUnknownFiles?: boolean;
    destructiveRepairAllowed?: boolean;
    reason?: string;
  };
  proof?: {
    available?: boolean;
    indexedFiles?: number | null;
    symbols?: number | null;
    edges?: number | null;
    blindspots?: number | null;
    filesAccounted?: number | null;
    unknownFiles?: number | null;
    blockingRepairGaps?: number | null;
    sourceCoveragePercent?: number | null;
    reductionDisplay?: string | null;
    benchmarkPath?: string;
  };
}

export interface DelegationStatusData {
  ok?: boolean;
  updatedAt?: string;
  boardUpdatedAt?: string;
  goal?: string;
  sharedTruth?: Record<string, any>;
  lanes?: Array<{
    id: string;
    name: string;
    owner: string;
    status: string;
    crossConfirmOwner?: string;
  }>;
  missions?: Array<{
    id: string;
    title: string;
    owner: string;
    status: 'waiting' | 'result-posted' | string;
    resultFile: string;
    bytes: number;
    updatedAt?: string | null;
  }>;
  waiting?: number;
  posted?: number;
}

export interface LlmStatusData {
  ok?: boolean;
  apiFirst?: boolean;
  provider?: {
    provider?: string;
    model?: string;
    baseUrl?: string;
    hasKey?: boolean;
  };
  swarm?: {
    provider?: string;
    model?: string;
    baseUrl?: string;
    hasKey?: boolean;
  };
  fallback?: {
    enabled?: boolean;
    provider?: string;
    model?: string;
    baseUrl?: string;
  };
  minimax?: {
    reserved?: boolean;
    activeWorkOverride?: boolean;
    allowedScopes?: string[];
  };
  local?: {
    provider?: string | null;
    online?: boolean;
    modelAvailable?: boolean;
    models?: string[];
    error?: string | null;
  };
  routing?: Record<string, string>;
}

export interface ResearchStatusData {
  ok?: boolean;
  provider?: string;
  baseUrl?: string;
  hasKey?: boolean;
  keySource?: string | null;
  groupFallback?: string;
  mode?: string;
  active?: number;
  latest?: ApiKernelJob | null;
  jobs?: ApiKernelJob[];
}

export interface MissionData {
  services: ServiceHealth[];
  agents: Agent[];
  logs: LogEntry[];
  pipeline: PipelineStatus | null;
  diagnostics: DiagnosticData | null;
  agentScores: AgentScoresData | null;
  llmLedger: LLMLedgerData | null;
  harnessBenchmarks: HarnessBenchmarkData | null;
  kernelJobs: ApiKernelJob[];
  rivalBenchmark: RivalBenchmarkData | null;
  omnicodeStatus: OmniCodeStatusData | null;
  delegationStatus: DelegationStatusData | null;
  llmStatus: LlmStatusData | null;
  researchStatus: ResearchStatusData | null;
  evolutionStatus: { enabled: boolean; tickCount: number; running: boolean; lastTick: any; recentTicks: any[] } | null;
  towerConnected: boolean;
  apiConnected: boolean;
  eventBusConnected: boolean;
  orchestratorConnected: boolean;
  fetchedAt: number;   // epoch ms of the last successful service poll (real, not faked)
  source: string;      // where the data came from
}

// Mirrors service_registry.js. Keep these two files in sync — this is the
// client-side view; the server is the source of truth. All 30 PM2 services
// are listed so the UI's "X/Y services live" count matches reality (not a
// 5/5 hand-picked subset). `optional` is set for services the operator
// considers opt-in (voice, vision, ui); backoff on health-probe failure is
// longer for them so a missing optional service doesn't spam the wire.
const SERVICE_CONFIG = [
  // ── Core (15) — the stable baseline ─────────────────────────────────────
  { name: 'Event Bus',           port: 7782, path: '/health',         key: 'eventbus',         optional: false, note: 'pub/sub bus for runtime events' },
  { name: 'State Store',         port: 7783, path: '/health',         key: 'state',            optional: false, note: 'durable key/value state' },
  { name: 'Unified API',         port: 7780, path: '/api/health',     key: 'api',              optional: false, note: 'gateway: chat, kernel jobs, mission control' },
  { name: 'Agent Tower',         port: 7790, path: '/tower/status',   key: 'tower',            optional: false, note: 'agent runtime — spawn/observe/kill' },
  { name: 'Orchestrator',        port: 7784, path: '/api/health',     key: 'orchestrator',     optional: false, note: 'workflow engine' },
  { name: 'Gatekeeper',          port: 7791, path: '/health',         key: 'gatekeeper',       optional: false, note: 'safety gate for risky ops' },
  { name: 'Metrics Aggregator',  port: 7890, path: '/health',         key: 'metrics',          optional: false, note: 'service health + per-host stats' },
  { name: 'Knowledge Pool',      port: 7885, path: '/health',         key: 'pool',             optional: true, note: '44-entry routing table' },
  { name: 'Context Bus',         port: 7881, path: '/health',         key: 'context',          optional: false, note: 'inter-service context handoff' },
  { name: 'Swarm Coordinator',   port: 7898, path: '/health',         key: 'coordinator',      optional: true, note: 'multi-agent swarm mission dispatcher' },
  { name: 'Mission Control UI',  port: 3000, path: '/',               key: 'nextjs',           optional: true,  note: 'the Next.js frontend itself' },
  { name: 'Harness',             port: 7798, path: '/health',         key: 'harness',          optional: true,  note: 'autonomous plan→execute→judge→synthesize' },
  { name: 'Thringlet Bridge',    port: 7799, path: '/health',         key: 'thringlet-bridge', optional: true,  note: 'runtime→emotion translator; feeds pvx :5000' },
  { name: 'No Spaghett',         port: 7797, path: '/api/health',     key: 'no-spaghett',      optional: true,  note: 'codebase spaghetti analyzer / refactor' },
  // ── Voice (3) ────────────────────────────────────────────────────────────
  { name: 'Voice Coordinator',   port: 7781, path: '/health',         key: 'voice',            optional: true, note: 'voice/text command router' },
  { name: 'Voice Bridge',        port: 7792, path: '/health',         key: 'bridge',           optional: true, note: 'browser voice socket bridge' },
  { name: 'Speech To Text',      port: 7896, path: '/health',         key: 'stt',              optional: true, note: 'local microphone transcription (whisper)' },
  // ── Cognitive (1 spine, 6 engines) ────────────────────────────────────────
  { name: 'Cognitive Spine',      port: 7880, path: '/cognitive/health', key: 'cognitive',       optional: true, note: 'memory+rules+modal+neuro+diagnostics+autodream' },
  { name: 'Reasoning Loop',      port: 7892, path: '/health',         key: 'reasoning',        optional: true,  note: 'proactive heartbeat tick' },
  // ── Vision (2) ────────────────────────────────────────────────────────────
  { name: 'Vision Monitor',      port: 7889, path: '/health',         key: 'vision',           optional: true,  note: 'screen/camera monitor' },
  { name: 'YOLO Service',        port: 7779, path: '/health',         key: 'yolo',             optional: true,  note: 'object detection' },
  // ── Companions (1) ────────────────────────────────────────────────────────
  { name: 'Companion Chorus',    port: -1,    path: '/health',         key: 'chorus',           optional: true,  note: 'companion reaction bridge (no health port)' },
  // ── Avatar (1) ────────────────────────────────────────────────────────────
  { name: 'Avatar Bridge',       port: 7777, path: '/health',         key: 'avatar',           optional: true,  note: 'physical avatar control' },
  { name: 'Thringlet Bridge',    port: 7799, path: '/health',         key: 'thringlet',        optional: true,  note: 'runtime→emotion translator' },
  { name: 'Harness Service',     port: 7798, path: '/health',         key: 'harness',          optional: true,  note: 'productivity harness executor' },
  // ── Terminal (1) ──────────────────────────────────────────────────────────
  { name: 'Terminal Fly',        port: -1,    path: '/health',         key: 'fly',              optional: true,  note: 'terminal-fly (no health port)' },
];

function proxyUrl(port: number, path: string, soft = false) {
  return `/api/service-proxy?port=${port}&path=${encodeURIComponent(path)}${soft ? '&soft=1' : ''}`;
}

function browserServiceUrl(port: number, path: string) {
  if (typeof window === 'undefined') return `http://127.0.0.1:${port}${path}`;
  const host = window.location.hostname || '127.0.0.1';
  return `${window.location.protocol}//${host}:${port}${path}`;
}

function serviceReachable(status?: ServiceHealth['status']) {
  return status === 'online' || status === 'degraded';
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function formatTime() {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function useMissionData(): MissionData {
  const [services, setServices] = useState<ServiceHealth[]>(SERVICE_CONFIG.map(s => ({ ...s, status: 'checking' })));
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticData | null>(null);
  const [agentScores, setAgentScores] = useState<AgentScoresData | null>(null);
  const [llmLedger, setLlmLedger] = useState<LLMLedgerData | null>(null);
  const [harnessBenchmarks, setHarnessBenchmarks] = useState<HarnessBenchmarkData | null>(null);
  const [kernelJobs, setKernelJobs] = useState<ApiKernelJob[]>([]);
  const [rivalBenchmark, setRivalBenchmark] = useState<RivalBenchmarkData | null>(null);
  const [omnicodeStatus, setOmnicodeStatus] = useState<OmniCodeStatusData | null>(null);
  const [delegationStatus, setDelegationStatus] = useState<DelegationStatusData | null>(null);
  const [llmStatus, setLlmStatus] = useState<LlmStatusData | null>(null);
  const [researchStatus, setResearchStatus] = useState<ResearchStatusData | null>(null);
  const [evolutionStatus, setEvolutionStatus] = useState<MissionData['evolutionStatus']>(null);
  const [towerConnected, setTowerConnected] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [eventBusConnected, setEventBusConnected] = useState(false);
  const [orchestratorConnected, setOrchestratorConnected] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(0); // real last-poll timestamp

  const towerEsRef = useRef<EventSource | null>(null);
  const apiEsRef = useRef<EventSource | null>(null);
  const busEsRef = useRef<EventSource | null>(null);
  const orchEsRef = useRef<EventSource | null>(null);
  const serviceFailuresRef = useRef<Record<string, number>>({});
  const serviceRetryAfterRef = useRef<Record<string, number>>({});
  const diagFailureRef = useRef(0);
  const apiServiceOnline = serviceReachable(services.find(service => service.key === 'api')?.status);
  const towerServiceOnline = serviceReachable(services.find(service => service.key === 'tower')?.status);
  const eventBusServiceOnline = serviceReachable(services.find(service => service.key === 'eventbus')?.status);
  const orchestratorServiceOnline = serviceReachable(services.find(service => service.key === 'orchestrator')?.status);

  const addLog = useCallback((log: Omit<LogEntry, 'id' | 'timestamp' | 'ts'>) => {
    setLogs(prev => [{
      id: generateId(),
      timestamp: formatTime(),
      ts: Date.now(),
      ...log,
    }, ...prev.slice(0, 499)]);
  }, []);

  // Poll LLM routing and local fallback status
  useEffect(() => {
    const fetchLlmStatus = async () => {
      try {
        const res = await fetch(proxyUrl(7780, '/api/llm/status'), { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return;
        const raw = await res.json();
        const data = raw.data ?? raw;
        if (data.ok !== false) setLlmStatus(data);
      } catch {}
    };
    fetchLlmStatus();
    const interval = setInterval(fetchLlmStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Poll Deep Research room status
  useEffect(() => {
    const fetchResearchStatus = async () => {
      try {
        const res = await fetch(proxyUrl(7780, '/api/research/status'), { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return;
        const raw = await res.json();
        const data = raw.data ?? raw;
        if (data.ok !== false) setResearchStatus(data);
      } catch {}
    };
    fetchResearchStatus();
    const interval = setInterval(fetchResearchStatus, 20000);
    return () => clearInterval(interval);
  }, []);

  // Poll self-evolution loop status
  useEffect(() => {
    const fetchEvolution = async () => {
      try {
        const res = await fetch(proxyUrl(7780, '/api/evolution/status'), { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return;
        const raw = await res.json();
        const data = raw.data ?? raw;
        if (data.ok !== false) setEvolutionStatus(data);
      } catch {}
    };
    fetchEvolution();
    const interval = setInterval(fetchEvolution, 60000);
    return () => clearInterval(interval);
  }, []);

  // Poll Claude/Codex delegation status
  useEffect(() => {
    const fetchDelegationStatus = async () => {
      try {
        const res = await fetch(proxyUrl(7780, '/api/delegation/status'), { signal: AbortSignal.timeout(2500) });
        if (!res.ok) return;
        const raw = await res.json();
        const data = raw.data ?? raw;
        if (data.ok !== false) setDelegationStatus(data);
      } catch {}
    };
    fetchDelegationStatus();
    const interval = setInterval(fetchDelegationStatus, 20000);
    return () => clearInterval(interval);
  }, []);

  // Poll OmniCode bridge status
  useEffect(() => {
    const fetchOmnicodeStatus = async () => {
      try {
        const res = await fetch(proxyUrl(7780, '/api/omnicode/status'), { signal: AbortSignal.timeout(2500) });
        if (!res.ok) return;
        const raw = await res.json();
        const data = raw.data ?? raw;
        if (data.ok !== false) setOmnicodeStatus(data);
      } catch {}
    };
    fetchOmnicodeStatus();
    const interval = setInterval(fetchOmnicodeStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Poll Odysseus benchmark target
  useEffect(() => {
    const fetchRivalBenchmark = async () => {
      try {
        const res = await fetch(proxyUrl(7780, '/api/benchmark/odysseus'), { signal: AbortSignal.timeout(2500) });
        if (!res.ok) return;
        const raw = await res.json();
        const data = raw.data ?? raw;
        if (data.ok !== false) setRivalBenchmark(data);
      } catch {}
    };
    fetchRivalBenchmark();
    const interval = setInterval(fetchRivalBenchmark, 45000);
    return () => clearInterval(interval);
  }, []);

  // Poll recursive learning signals
  useEffect(() => {
    const fetchLearningSignals = async () => {
      try {
        const [scoreRes, ledgerRes] = await Promise.all([
          fetch('/api/agent-scores', { signal: AbortSignal.timeout(2500) }),
          fetch('/api/llm-ledger', { signal: AbortSignal.timeout(2500) }),
        ]);
        if (scoreRes.ok) {
          const scores = await scoreRes.json();
          setAgentScores(scores);
        }
        if (ledgerRes.ok) {
          const ledger = await ledgerRes.json();
          setLlmLedger(ledger.summary || null);
        }
      } catch {}
    };
    fetchLearningSignals();
    const interval = setInterval(fetchLearningSignals, 30000);
    return () => clearInterval(interval);
  }, []);

  // Poll self-improvement benchmark signals
  useEffect(() => {
    const fetchBenchmarks = async () => {
      try {
        const res = await fetch('/api/harness-benchmarks', { signal: AbortSignal.timeout(2500) });
        if (res.ok) setHarnessBenchmarks(await res.json());
      } catch {}
    };
    fetchBenchmarks();
    const interval = setInterval(fetchBenchmarks, 45000);
    return () => clearInterval(interval);
  }, []);

  // Poll canonical API harness kernel jobs
  useEffect(() => {
    const fetchKernelJobs = async () => {
      try {
        const res = await fetch(proxyUrl(7780, '/api/kernel/jobs?limit=20'), { signal: AbortSignal.timeout(2500) });
        if (!res.ok) return;
        const raw = await res.json();
        const data = raw.data ?? raw;
        setKernelJobs(Array.isArray(data.jobs) ? data.jobs : []);
      } catch {}
    };
    fetchKernelJobs();
    const interval = setInterval(fetchKernelJobs, 10000);
    return () => clearInterval(interval);
  }, []);

  // Health checks
  useEffect(() => {
    const checkServices = async () => {
      const now = Date.now();
      const results = await Promise.all(
        SERVICE_CONFIG.map(async (cfg) => {
          const failureCount = serviceFailuresRef.current[cfg.key] || 0;
          const fastRecover = ['voice-coordinator', 'voice-bridge', 'stt'].includes(cfg.key);
          const maxBackoffMs = fastRecover ? 5000 : 60000;
          const backoffMs = cfg.optional ? Math.min(maxBackoffMs, failureCount * 3000) : 0;
          const retryAfter = serviceRetryAfterRef.current[cfg.key] || 0;
          if (backoffMs > 0 && now < retryAfter) {
            return {
              ...cfg,
              status: 'offline' as const,
              details: { mode: cfg.optional ? 'optional-disabled-or-config-needed' : 'offline', note: cfg.note },
            };
          }
          const start = Date.now();
          try {
            const url = proxyUrl(cfg.port, cfg.path, true);
            const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
            const latency = Date.now() - start;
            let details: any = {};
            try {
              const raw = await res.json();
              details = raw.data ?? raw;
            } catch {}
            let status: ServiceHealth['status'] = 'online';
            if (latency > 800) status = 'degraded';
            if (!res.ok) status = 'offline';
            serviceFailuresRef.current[cfg.key] = res.ok ? 0 : failureCount + 1;
            serviceRetryAfterRef.current[cfg.key] = res.ok ? 0 : Date.now() + Math.min(maxBackoffMs, (failureCount + 1) * 3000);
            return { ...cfg, status, latency, details };
          } catch {
            const nextFailureCount = failureCount + 1;
            serviceFailuresRef.current[cfg.key] = nextFailureCount;
            serviceRetryAfterRef.current[cfg.key] = Date.now() + Math.min(maxBackoffMs, nextFailureCount * 3000);
            return {
              ...cfg,
              status: 'offline' as const,
              details: { mode: cfg.optional ? 'optional-disabled-or-config-needed' : 'offline', note: cfg.note },
            };
          }
        })
      );
      setServices(results);
      setFetchedAt(Date.now());
    };

    checkServices();
    const interval = setInterval(checkServices, 10000);
    return () => clearInterval(interval);
  }, []);

  // Tower SSE
  useEffect(() => {
    if (!towerServiceOnline) {
      towerEsRef.current?.close();
      setTowerConnected(false);
      return;
    }
    const connect = () => {
      towerEsRef.current?.close();
      const es = new EventSource(browserServiceUrl(7790, '/tower/stream'));
      towerEsRef.current = es;
      es.onopen = () => setTowerConnected(true);
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          const type = data.type;
          if (type === 'agent_spawned') {
            setAgents(prev => {
              const exists = prev.find(a => a.id === data.agentId);
              if (exists) return prev;
              return [{ id: data.agentId, name: data.name, emoji: data.emoji, division: data.division, role: data.role, tier: 1, status: 'working', task: data.task, startTime: new Date().toISOString(), teamId: data.teamId }, ...prev];
            });
            addLog({ type: 'agent', source: 'TOWER', message: `${data.emoji} ${data.name} spawned`, agentId: data.agentId, agentName: data.name, emoji: data.emoji });
          } else if (type === 'agent_complete' || type === 'agent_completed') {
            setAgents(prev => prev.map(a => a.id === data.agentId ? { ...a, status: data.code === 0 ? 'completed' : 'error' } : a));
            addLog({ type: 'system', source: 'TOWER', message: `${data.emoji || ''} ${data.agentName} completed (code ${data.code ?? '?'})`, agentId: data.agentId, agentName: data.agentName });
          } else if (type === 'agent_output') {
            addLog({ type: 'info', source: data.agentName || 'AGENT', message: data.output?.substring(0, 120) || '', agentId: data.agentId, agentName: data.agentName, emoji: data.emoji });
          } else if (type === 'agent_killed') {
            setAgents(prev => prev.filter(a => a.id !== data.agentId));
            addLog({ type: 'error', source: 'TOWER', message: `${data.emoji} ${data.name} killed`, agentId: data.agentId, agentName: data.name });
          } else if (type === 'team_spawned') {
            addLog({ type: 'system', source: 'TOWER', message: `Team spawned: ${data.leader} leading ${data.members?.join(', ')}` });
          }
        } catch {}
      };
      es.onerror = () => { setTowerConnected(false); es.close(); };
    };
    connect();
    return () => towerEsRef.current?.close();
  }, [addLog, towerServiceOnline]);

  // API SSE
  useEffect(() => {
    if (!apiServiceOnline) {
      apiEsRef.current?.close();
      setApiConnected(false);
      return;
    }
    const connect = () => {
      apiEsRef.current?.close();
      const es = new EventSource(browserServiceUrl(7780, '/api/stream'));
      apiEsRef.current = es;
      es.onopen = () => setApiConnected(true);
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'api_harness_event') {
            addLog({ type: 'kernel', source: 'KERNEL', message: `${data.jobId}: ${data.event?.type || 'event'} ${data.event?.message || ''}`.substring(0, 160) });
          } else if (data.type === 'api_harness_job_finished') {
            addLog({ type: 'kernel', source: 'KERNEL', message: `${data.jobId} finished as ${data.state}` });
          } else if (data.type === 'chat_delegated_to_kernel') {
            addLog({ type: 'kernel', source: 'CHAT', message: `delegated to kernel ${data.jobId}` });
          } else if (data.type === 'swarm_spawn' || data.type === 'command_sent' || data.type === 'bridge_event') {
            addLog({ type: 'info', source: 'API', message: JSON.stringify(data).substring(0, 120) });
          }
        } catch {}
      };
      es.onerror = () => { setApiConnected(false); es.close(); };
    };
    connect();
    return () => apiEsRef.current?.close();
  }, [addLog, apiServiceOnline]);

  // EventBus SSE
  useEffect(() => {
    if (!eventBusServiceOnline) {
      busEsRef.current?.close();
      setEventBusConnected(false);
      return;
    }
    const connect = () => {
      busEsRef.current?.close();
      const es = new EventSource(browserServiceUrl(7782, '/events/*'));
      busEsRef.current = es;
      es.onopen = () => setEventBusConnected(true);
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          const topic = data.topic || '';
          if (topic.includes('agent') || topic.includes('orchestrator')) {
            addLog({ type: 'system', source: 'BUS', message: topic + (data.agentName ? ` | ${data.agentName}` : '') });
          }
        } catch {}
      };
      es.onerror = () => { setEventBusConnected(false); es.close(); };
    };
    connect();
    return () => busEsRef.current?.close();
  }, [addLog, eventBusServiceOnline]);

  // Orchestrator SSE
  useEffect(() => {
    if (!orchestratorServiceOnline) {
      orchEsRef.current?.close();
      setOrchestratorConnected(false);
      return;
    }
    const connect = () => {
      orchEsRef.current?.close();
      const es = new EventSource(browserServiceUrl(7784, '/api/events'));
      orchEsRef.current = es;
      es.onopen = () => setOrchestratorConnected(true);
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          const topic = data.topic || '';
          const eventType = data.type || '';

          // Handle real-time workflow events from orchestrator
          if (topic.startsWith('orchestrator.workflow.') || eventType.startsWith('workflow.')) {
            const workflowEvent = data.type ? data : data;
            const wfId = workflowEvent.workflowId || workflowEvent.id;
            const wfIntent = workflowEvent.intent || 'general';
            const wfTarget = workflowEvent.target || workflowEvent.command || '';
            const wfStatus = topic.includes('.completed') ? 'completed' :
                             topic.includes('.failed') ? 'failed' :
                             topic.includes('.started') ? 'running' : workflowEvent.status || 'running';
            const wfDuration = workflowEvent.duration || 0;

            setPipeline(prev => {
              const active = prev?.active ? [...prev.active] : [];
              const completed = prev?.completed ? [...prev.completed] : [];
              const queue = prev?.queue || { depth: 0, items: [] };

              if (wfStatus === 'running' && wfId) {
                // Add to active if not already there
                if (!active.find(w => w.id === wfId)) {
                  active.push({
                    id: wfId,
                    intent: wfIntent,
                    target: typeof wfTarget === 'string' ? wfTarget : JSON.stringify(wfTarget),
                    status: wfStatus,
                    startTime: workflowEvent.timestamp || new Date().toISOString(),
                    steps: workflowEvent.steps || { total: 0, completed: 0 }
                  });
                }
              } else if ((wfStatus === 'completed' || wfStatus === 'failed') && wfId) {
                // Move from active to completed
                const idx = active.findIndex(w => w.id === wfId);
                if (idx !== -1) {
                  const [wf] = active.splice(idx, 1);
                  wf.status = wfStatus;
                  wf.endTime = new Date().toISOString();
                  wf.duration = wfDuration;
                  completed.unshift(wf);
                }
              }

              return {
                ...prev!,
                active,
                completed: completed.slice(0, 50),
                metrics: {
                  total: (prev?.metrics?.total || 0) + (wfStatus === 'running' ? 1 : 0),
                  completed: (prev?.metrics?.completed || 0) + (wfStatus === 'completed' ? 1 : 0),
                  failed: (prev?.metrics?.failed || 0) + (wfStatus === 'failed' ? 1 : 0),
                  avgResponseTime: prev?.metrics?.avgResponseTime ?? 0
                }
              };
            });
          }

          // Handle orchestrator agent spawned/completed events for agent list
          if (topic === 'orchestrator.agent.spawned' || topic === 'agent.spawned') {
            const agentData = data;
            setAgents(prev => {
              const exists = prev.find(a => a.id === agentData.agentId);
              if (exists) return prev;
              return [{
                id: agentData.agentId || agentData.id,
                name: agentData.agentName || agentData.name || 'Unknown',
                emoji: agentData.emoji || '◈',
                division: agentData.division || 'ENGINEERING',
                role: agentData.role || 'agent',
                tier: 1,
                status: 'working',
                task: agentData.task || ''
              }, ...prev];
            });
          }
        } catch {}
      };
      es.onerror = () => { setOrchestratorConnected(false); es.close(); };
    };
    connect();
    return () => orchEsRef.current?.close();
  }, [addLog, orchestratorServiceOnline]);

  // Poll tower status
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch(proxyUrl(7790, '/tower/status', true));
        if (res.ok) {
          const raw = await res.json();
          const data = raw.data ?? raw;
          const active = data.activeAgents || [];
          const registered = data.registeredAgents || [];
          setAgents(prev => {
            const map = new Map(prev.map(a => [a.id, a]));
            for (const a of active) {
              if (map.has(a.id)) map.set(a.id, { ...map.get(a.id)!, ...a });
              else map.set(a.id, { ...a, status: a.status || 'working' });
            }
            // Add registered idle agents
            for (const r of registered) {
              const hasActive = Array.from(map.values()).some(a => a.name === r.name && a.status === 'working');
              if (!hasActive) {
                map.set(`reg-${r.name}`, { id: `reg-${r.name}`, name: r.name, emoji: r.emoji, division: r.division, role: r.role, tier: r.tier, status: 'idle' });
              }
            }
            return Array.from(map.values());
          });
        }
      } catch {}
    };
    fetchAgents();
    const interval = setInterval(fetchAgents, 10000);
    return () => clearInterval(interval);
  }, []);

  // Poll pipeline
  useEffect(() => {
    const fetchPipeline = async () => {
      try {
        const res = await fetch(proxyUrl(7784, '/api/pipeline', true));
        if (res.ok) {
          const raw = await res.json();
          const data = raw.data ?? raw;
          setPipeline(data);
        }
      } catch {}
    };
    fetchPipeline();
    const interval = setInterval(fetchPipeline, 10000);
    return () => clearInterval(interval);
  }, []);

  // Poll diagnostics
  useEffect(() => {
    setDiagnostics({
      findings: [{
        severity: 'INFO',
        description: 'Autonomous Diagnostics is available as an on-demand cognitive lens; default mission runtime avoids noisy offline polling.',
        confidence: 100,
        agent: 'mission-control',
      }],
      voteTally: {},
      leadingCause: 'on-demand',
    });
    return;

    const fetchDiagnostics = async () => {
      if (diagFailureRef.current >= 2) {
        setDiagnostics({
          findings: [{
            severity: 'INFO',
            description: 'Autonomous Diagnostics service is offline or not started on :7786',
            confidence: 100,
            agent: 'mission-control',
          }],
          voteTally: {},
          leadingCause: 'diagnostics-offline',
        });
        return;
      }
      try {
        const [diagRes, voteRes] = await Promise.all([
          fetch(proxyUrl(7786, '/diagnose'), { signal: AbortSignal.timeout(4000) }),
          fetch(proxyUrl(7786, '/vote'), { signal: AbortSignal.timeout(2000) }),
        ]);
        if (diagRes.ok) {
          const diagProxy = await diagRes.json();
          const voteProxy = voteRes.ok ? await voteRes.json() : { data: { tally: {}, leading: null } };
          const diagData = diagProxy.data ?? diagProxy;
          const voteData = voteProxy.data ?? voteProxy;
          const allFindings: any[] = [];
          if (diagData.results) {
            Object.entries(diagData.results).forEach(([agent, findings]: [string, any]) => {
              findings.forEach((f: any) => allFindings.push({ ...f, agent }));
            });
          }
          setDiagnostics({
            findings: allFindings,
            voteTally: voteData.tally || {},
            leadingCause: voteData.leading || null,
          });
          diagFailureRef.current = 0;
        }
      } catch {
        diagFailureRef.current += 1;
      }
    };
    fetchDiagnostics();
    const interval = setInterval(fetchDiagnostics, 6000);
    return () => clearInterval(interval);
  }, []);

  return {
    services,
    agents,
    logs,
    pipeline,
    diagnostics,
    agentScores,
    llmLedger,
    harnessBenchmarks,
    kernelJobs,
    rivalBenchmark,
    omnicodeStatus,
    delegationStatus,
    llmStatus,
    researchStatus,
    evolutionStatus,
    towerConnected,
    apiConnected,
    eventBusConnected,
    orchestratorConnected,
    fetchedAt,
    source: 'unified_api',
  };
}
