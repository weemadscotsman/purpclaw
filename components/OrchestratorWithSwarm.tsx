import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Terminal, Send, Bot, CheckCircle2, CircleDashed, AlertCircle, Server, LayoutTemplate, MessageSquare, Network, Database, Activity, ShieldAlert, ShieldCheck, Zap, GitMerge, ListChecks, RefreshCw, Users, ArrowRightLeft, Target, Radio } from 'lucide-react';
import { ReactFlow, Controls, Background, MarkerType, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSwarmControl, SwarmDivision, SwarmPriority } from './useSwarmControl';

type AgentStatus = 'idle' | 'working' | 'error' | 'offline';

interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  cpu: number;
  memory: number;
  responseTime: number;
}

interface LogEntry {
  id: string;
  agent: string;
  message: string;
  timestamp: Date;
  type: 'info' | 'action' | 'success' | 'error' | 'lead' | 'audit' | 'swarm';
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'reviewing';
  assignedTo?: string;
  dependencies: string[];
  retries: number;
  maxRetries: number;
}

interface LoopState {
  session_id: string;
  loop_number: number;
  max_loops: number;
  failed_stages: string[];
  artifacts: Record<string, any>;
  next_action: string;
}

const DEFAULT_AGENTS: Agent[] = [
  { id: 'a1', name: 'PURPCLAW', role: 'Puppet Master (tmux/xdotool)', status: 'idle', cpu: 12, memory: 45, responseTime: 120 },
  { id: 'a2', name: 'DeepSeek 3.1', role: 'Reasoning / Review', status: 'idle', cpu: 5, memory: 30, responseTime: 250 },
  { id: 'a3', name: 'Minimax 2.76', role: 'Fast Generation / Fixes', status: 'idle', cpu: 8, memory: 35, responseTime: 300 },
  { id: 'a4', name: 'Kimi Code K2.5', role: 'Code Execution', status: 'idle', cpu: 4, memory: 25, responseTime: 180 },
  { id: 'a5', name: 'Gemini 3.1 Pro', role: 'Multimodal / Analysis', status: 'idle', cpu: 6, memory: 28, responseTime: 220 },
  { id: 'a6', name: 'Kilo Code', role: 'Heavy Orchestration (Minimax 2.7)', status: 'idle', cpu: 7, memory: 32, responseTime: 210 },
];

export function OrchestratorDashboardWithSwarm() {
  const [activeTab, setActiveTab] = useState<'chat' | 'framework' | 'terminals' | 'state' | 'health' | 'swarm'>('chat');
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [agents, setAgents] = useState<Agent[]>(DEFAULT_AGENTS);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: '1', agent: 'System', message: 'PURPCLAW Delegation Pipeline initialized. Layer 0 Orchestrator online.', timestamp: new Date(), type: 'info' },
    { id: '2', agent: 'PURPCLAW', message: 'Awaiting command. Ready to enforce the Think → Build → Judge loop.', timestamp: new Date(), type: 'lead' },
    { id: '3', agent: 'Swarm Control', message: 'Swarm control system connected. Dashboard is now intervention-capable.', timestamp: new Date(), type: 'swarm' }
  ]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [terminalOutputs, setTerminalOutputs] = useState<Record<string, string[]>>({});
  const [escalation, setEscalation] = useState<{ agent: string, message: string, resolve: (action: string) => void } | null>(null);

  const [loopState, setLoopState] = useState<LoopState>({
    session_id: 'idle',
    loop_number: 0,
    max_loops: 5,
    failed_stages: [],
    artifacts: {},
    next_action: 'awaiting_input'
  });

  const [guardStatus, setGuardStatus] = useState<Record<string, { active: boolean; triggered: boolean; detail: string }>>({
    convergence: { active: false, triggered: false, detail: 'Semantic hash: type+severity' },
    escalation: { active: false, triggered: false, detail: 'Priority cascade: crit>reg>conv>fat>conf' },
    fatigue: { active: false, triggered: false, detail: '0/50 calls (integration: +10 overflow)' },
    tiebreaker: { active: false, triggered: false, detail: 'Gemini fallback when confidence < 0.85' },
  });

  // Swarm control integration
  const {
    isConnected: swarmConnected,
    isLoading: swarmLoading,
    lastResult: swarmResult,
    swarmStatus,
    getStatus: getSwarmStatus,
    reallocateAgents,
    setPriority,
    handleAgentClick,
    handleVoiceCommand,
    syncAgentStatus,
    DIVISION_MAPPING
  } = useSwarmControl();

  const logsEndRef = useRef<HTMLDivElement>(null);
  const terminalRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Simulate Agent Health Metrics
  useEffect(() => {
    const interval = setInterval(() => {
      setAgents(prev => prev.map(agent => ({
        ...agent,
        cpu: agent.status === 'working' ? Math.min(100, agent.cpu + (Math.random() * 30 - 5)) : Math.max(1, agent.cpu - 5),
        memory: agent.status === 'working' ? Math.min(100, agent.memory + (Math.random() * 15 - 2)) : Math.max(10, agent.memory - 2),
        responseTime: Math.max(50, agent.responseTime + (Math.random() * 40 - 20))
      })));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Sync agent status with swarm control periodically
  useEffect(() => {
    const syncInterval = setInterval(() => {
      if (swarmConnected) {
        syncAgentStatus(agents);
      }
    }, 10000);

    return () => clearInterval(syncInterval);
  }, [swarmConnected, agents, syncAgentStatus]);

  const addLog = useCallback((agent: string, message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { id: Math.random().toString(), agent, message, timestamp: new Date(), type }]);
  }, []);

  const appendTerminalOutput = useCallback((agentId: string, line: string) => {
    setTerminalOutputs(prev => {
      const current = prev[agentId] || [];
      const updated = [...current, `[${new Date().toLocaleTimeString()}] ${line}`].slice(-50);
      return { ...prev, [agentId]: updated };
    });
    setTimeout(() => {
      const ref = terminalRefs.current[agentId];
      if (ref) ref.scrollTop = ref.scrollHeight;
    }, 50);
  }, []);

  const updateAgentStatus = useCallback((agentId: string, status: AgentStatus) => {
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, status } : a));
  }, []);

  const updateState = useCallback((updates: Partial<LoopState>) => {
    setLoopState(prev => ({ ...prev, ...updates }));
  }, []);

  // Handle agent click with swarm control integration
  const handleAgentCardClick = useCallback(async (agent: Agent) => {
    addLog('Swarm Control', `Clicking ${agent.name} to open control panel`, 'swarm');

    const result = await handleAgentClick(agent.name);

    if (result.success) {
      addLog('Swarm Control', result.message, 'success');
      appendTerminalOutput('a1', `> swarm_control: ${result.message}`);
    } else {
      addLog('Swarm Control', `Failed: ${result.error}`, 'error');
      appendTerminalOutput('a1', `> swarm_control ERROR: ${result.error}`);
    }
  }, [addLog, handleAgentClick, appendTerminalOutput]);

  // Handle voice command through swarm control
  const handleVoiceCommandInput = useCallback(async (command: string) => {
    addLog('Voice Command', `Processing: "${command}"`, 'swarm');
    appendTerminalOutput('a1', `> voice_command: "${command}"`);

    const result = await handleVoiceCommand(command);

    if (result.success) {
      addLog('Swarm Control', `Voice command executed: ${result.message}`, 'success');
      appendTerminalOutput('a1', `> swarm_control: ${result.message}`);
    } else {
      addLog('Swarm Control', `Voice command failed: ${result.error}`, 'error');
      appendTerminalOutput('a1', `> swarm_control ERROR: ${result.error}`);
    }

    return result;
  }, [addLog, handleVoiceCommand, appendTerminalOutput]);

  // Manual swarm control actions
  const handleManualReallocation = useCallback(async () => {
    const fromDivision = 'Media Ops' as SwarmDivision;
    const toDivision = 'Security' as SwarmDivision;
    const count = 2;

    addLog('Swarm Control', `Manual reallocation: ${count} agents from ${fromDivision} to ${toDivision}`, 'action');
    appendTerminalOutput('a1', `> swarm_control reallocate ${count} from ${fromDivision} to ${toDivision}`);

    const result = await reallocateAgents(fromDivision, toDivision, count);

    if (result.success) {
      addLog('Swarm Control', result.message, 'success');
    } else {
      addLog('Swarm Control', `Failed: ${result.error}`, 'error');
    }
  }, [addLog, reallocateAgents, appendTerminalOutput]);

  const handleManualPriorityChange = useCallback(async (division: SwarmDivision, priority: SwarmPriority) => {
    addLog('Swarm Control', `Setting ${division} priority to ${priority}`, 'action');
    appendTerminalOutput('a1', `> swarm_control set_priority ${division} ${priority}`);

    const result = await setPriority(division, priority);

    if (result.success) {
      addLog('Swarm Control', result.message, 'success');
    } else {
      addLog('Swarm Control', `Failed: ${result.error}`, 'error');
    }
  }, [addLog, setPriority, appendTerminalOutput]);

  const handleSimulateWorkflow = async (request: string) => {
    setIsProcessing(true);
    const sessionId = `sess_${Math.floor(Math.random() * 10000)}`;
    updateState({ session_id: sessionId, loop_number: 1, next_action: 'SPAWN: Architect', artifacts: {} });

    // LAYER 0: Orchestrator receives command
    addLog('PURPCLAW', `Command received: "${request}"`, 'action');
    appendTerminalOutput('a1', `> Parsing command... identifying target terminal`);
    updateAgentStatus('a1', 'working');
    await new Promise(r => setTimeout(r, 1000));

    // ROUTE TO KILO CODE (Planner)
    addLog('PURPCLAW', 'Routing to Kilo Code for task decomposition via tmux', 'lead');
    appendTerminalOutput('a1', `> tmux send-keys -t kilo "Break this down: ${request}" Enter`);
    updateAgentStatus('a6', 'working');
    appendTerminalOutput('a6', `> Ingesting user request... generating task list`);
    await new Promise(r => setTimeout(r, 1500));

    const newTasks: Task[] = [
      { id: 't1', title: 'Core Server Setup', description: 'Initialize Express/Node server', status: 'pending', dependencies: [], retries: 0, maxRetries: 3 },
      { id: 't2', title: 'Database Models', description: 'Define Prisma schemas', status: 'pending', dependencies: ['t1'], retries: 0, maxRetries: 3 },
    ];
    setTasks(newTasks);
    appendTerminalOutput('a1', `> tmux capture-pane -t kilo -p -S -50`);
    updateState({ artifacts: { ...loopState.artifacts, task_list_v1: '2 core tasks identified.' }, next_action: 'EXECUTE: task_list' });
    updateAgentStatus('a6', 'idle');
    await new Promise(r => setTimeout(r, 1000));

    // EXECUTION LOOP
    addLog('PURPCLAW', 'Entering Terminal-to-Terminal Execution Loop.', 'lead');

    for (const task of newTasks) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'running' } : t));

      // KIMI CODE (Coder)
      updateAgentStatus('a4', 'working');
      addLog('PURPCLAW', `Delegating [${task.id}] to Kimi Code`, 'action');
      appendTerminalOutput('a1', `> tmux send-keys -t kimi "Write code for: ${task.title}" Enter`);
      appendTerminalOutput('a4', `> Generating raw code for ${task.id}...`);
      await new Promise(r => setTimeout(r, 1500));
      appendTerminalOutput('a1', `> tmux capture-pane -t kimi -p -S -50`);
      updateAgentStatus('a4', 'idle');

      // DEEPSEEK (Reviewer)
      updateAgentStatus('a2', 'working');
      addLog('PURPCLAW', `Routing [${task.id}] to DeepSeek for security review`, 'audit');
      appendTerminalOutput('a1', `> tmux send-keys -t deepseek "Review this code for security issues" Enter`);
      appendTerminalOutput('a2', `> Analyzing code structure and vulnerabilities...`);
      await new Promise(r => setTimeout(r, 1500));

      // Simulate Escalation on Task 2
      if (task.id === 't2') {
        appendTerminalOutput('a2', `> ERROR: Memory leak detected in schema relations.`);
        appendTerminalOutput('a1', `> tmux capture-pane -t deepseek -p -S -50`);
        updateAgentStatus('a2', 'error');
        addLog('PURPCLAW', `DeepSeek flagged a memory leak (confidence: 0.72). Routing to Gemini for tie-break...`, 'error');

        // TIE-BREAKER: Gemini consulted
        setGuardStatus(prev => ({ ...prev, tiebreaker: { active: true, triggered: true, detail: 'DeepSeek confidence 0.72 < 0.85 — consulting Gemini' } }));
        updateAgentStatus('a5', 'working');
        appendTerminalOutput('a1', `> tmux send-keys -t gemini "Review code for tie-break" Enter`);
        appendTerminalOutput('a5', `> Tie-breaker review initiated...`);
        addLog('Gemini 3.1 Pro', `⚖️ TIE-BREAKER: Reviewing code independently...`, 'audit');
        await new Promise(r => setTimeout(r, 1500));
        appendTerminalOutput('a5', `> CONFIRMED: Memory leak is real. Both reviewers agree.`);
        addLog('PURPCLAW', `⚖️ TIE-BREAK CONFIRMED: Both reviewers agree. Routing to Minimax for fix.`, 'lead');
        updateAgentStatus('a5', 'idle');
        setGuardStatus(prev => ({ ...prev, tiebreaker: { active: false, triggered: true, detail: 'Last: confirmed failure (consensus)' } }));

        // MINIMAX (Fixer)
        updateAgentStatus('a3', 'working');
        appendTerminalOutput('a1', `> tmux send-keys -t minimax "Fix the memory leak in this code" Enter`);
        appendTerminalOutput('a3', `> Refactoring schema to resolve leak...`);
        setGuardStatus(prev => ({ ...prev, convergence: { active: true, triggered: false, detail: 'Tracking: memory:high — watching for repeat' } }));
        await new Promise(r => setTimeout(r, 1500));
        appendTerminalOutput('a1', `> tmux capture-pane -t minimax -p -S -50`);
        updateAgentStatus('a3', 'idle');
        updateAgentStatus('a2', 'idle');
        setGuardStatus(prev => ({ ...prev, convergence: { active: false, triggered: false, detail: 'Semantic hash: type+severity' } }));
      } else {
        appendTerminalOutput('a2', `> Review passed. No issues found.`);
        appendTerminalOutput('a1', `> tmux capture-pane -t deepseek -p -S -50`);
        updateAgentStatus('a2', 'idle');
      }

      // Task completion
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'completed' } : t));
      addLog('PURPCLAW', `[${task.id}] completed successfully`, 'success');
      await new Promise(r => setTimeout(r, 500));
    }

    // Workflow completion
    updateState({ loop_number: loopState.loop_number + 1, next_action: 'AWAIT: next command' });
    addLog('PURPCLAW', 'Workflow complete. All tasks executed.', 'lead');
    updateAgentStatus('a1', 'idle');
    setIsProcessing(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    handleSimulateWorkflow(input);
    setInput('');
  };

  // Render agent cards with click handlers
  const renderAgentCards = () => {
    return agents.map(agent => {
      const isLead = agent.name === 'PURPCLAW';
      const isWorking = agent.status === 'working';
      const isError = agent.status === 'error';

      return (
        <div
          key={agent.id}
          className={`bg-[#050505] border ${isLead ? 'border-purple-500/30' : isError ? 'border-red-500/50' : isWorking ? 'border-green-500/30' : 'border-gray-800'} rounded-lg flex flex-col overflow-hidden font-mono text-[10px] sm:text-xs h-[32vh] shadow-lg cursor-pointer hover:border-blue-500/50 transition-colors`}
          onClick={() => handleAgentCardClick(agent)}
        >
          <div className="flex items-center justify-between p-3 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isError ? 'bg-red-500' : isWorking ? 'bg-green-500' : 'bg-gray-500'}`} />
              <span className="font-bold text-white">{agent.name}</span>
            </div>
            <div className="flex items-center gap-1">
              {isLead && <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded">LEAD</span>}
              <span className={`px-1.5 py-0.5 text-xs rounded ${
                agent.status === 'working' ? 'bg-green-500/20 text-green-400' :
                agent.status === 'error' ? 'bg-red-500/20 text-red-400' :
                'bg-gray-800 text-gray-400'
              }`}>
                {agent.status.toUpperCase()}
              </span>
            </div>
          </div>

          <div className="flex-1 p-3 space-y-2">
            <div className="text-gray-400">{agent.role}</div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">CPU</span>
                <div className="flex items-center gap-2">
                  <span className="text-white">{agent.cpu.toFixed(1)}%</span>
                  <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${agent.cpu > 80 ? 'bg-red-500' : agent.cpu > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(100, agent.cpu)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-500">Memory</span>
                <div className="flex items-center gap-2">
                  <span className="text-white">{agent.memory.toFixed(1)}%</span>
                  <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${agent.memory > 80 ? 'bg-red-500' : agent.memory > 60 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                      style={{ width: `${Math.min(100, agent.memory)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-500">Response</span>
                <span className={`${agent.responseTime > 300 ? 'text-red-400' : agent.responseTime > 200 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {agent.responseTime}ms
                </span>
              </div>
            </div>
          </div>

          <div className="p-3 border-t border-gray-800 bg-black/50">
            <div className="text-xs text-gray-500">Click to control division</div>
          </div>
        </div>
      );
    });
  };

  // Render swarm control panel
  const renderSwarmControlPanel = () => {
    return (
      <div className="flex-1 flex flex-col p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-white mb-2">Swarm Control Panel</h2>
          <p className="text-gray-400 text-sm">Direct control over agent allocation and priorities</p>
          <div className="flex items-center gap-2 mt-2">
            <div className={`w-2 h-2 rounded-full ${swarmConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-400">
              {swarmConnected ? 'Connected to swarm control' : 'Disconnected'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Status Panel */}
          <div className="bg-[#0f0f0f] border border-gray-800 rounded-xl p-4">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Activity size={20} /> Swarm Status
            </h3>
            {swarmStatus ? (
              <div className="space-y-3">
                {swarmStatus.divisions.map(division => (
                  <div key={division.name} className="p-3 bg-[#111] rounded-lg border border-gray-800">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-gray-200">{division.name}</span>
                      <span className={`px-2 py-1 rounded text-xs ${
                        division.priority === 'critical' ? 'bg-red-500/20 text-red-400' :
                        division.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                        division.priority === 'normal' ? 'bg-green-500/20 text-green-400' :
                        'bg-gray-800 text-gray-400'
                      }`}>
                        {division.priority}
                      </span>
                    </div>
                    <div className="text-sm text-gray-400">
                      <div>Agents: {division.agentCount} ({division.activeAgents} active)</div>
                      <div>CPU: {division.cpuUsage}% | Memory: {division.memoryUsage}%</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">Loading swarm status...</p>
            )}
          </div>

          {/* Control Panel */}
          <div className="bg-[#0f0f0f] border border-gray-800 rounded-xl p-4">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <ArrowRightLeft size={20} /> Quick Controls
            </h3>
            <div className="space-y-3">
              <button
                onClick={handleManualReallocation}
                className="w-full p-3 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Users size={16} /> Shift 2 agents: Media Ops → Security
              </button>

              <button
                onClick={() => handleManualPriorityChange('Engineering', 'high')}
                className="w-full p-3 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Target size={16} /> Set Engineering to HIGH priority
              </button>

              <button
                onClick={getSwarmStatus}
                className="w-full p-3 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw size={16} /> Refresh Status
              </button>
            </div>

            {/* Voice Command Input */}
            <div className="mt-6 pt-4 border-t border-gray-800">
              <h4 className="text-md font-semibold text-white mb-3 flex items-center gap-2">
                <Radio size={18} /> Voice Command
              </h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type voice command (e.g., 'Shift 3 agents from Research to Engineering')"
                  className="flex-1 bg-[#111] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                      handleVoiceCommandInput(e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                />
                <button
                  onClick={() => {
                    const input = document.querySelector('input[placeholder*="voice command"]') as HTMLInputElement;
                    if (input?.value.trim()) {
                      handleVoiceCommandInput(input.value);
                      input.value = '';
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render logs with swarm type support
  const renderLogs = () => {
    return logs.map(log => (
      <div key={log.id} className="flex items-start gap-2 py-1.5 border-b border-gray-800/50">
        <span className="text-gray-500 text-xs w-16 shrink-0">
          {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className={`font-bold shrink-0 w-36 truncate ${
          log.type === 'lead' ? 'text-orange-400' :
          log.type === 'audit' ? 'text-purple-400' :
          log.type === 'swarm' ? 'text-blue-400' :
          log.agent === 'System' ? 'text-gray-500' : 'text-purple-400'
        }`}>
          {log.agent}:
        </span>
        <span className={`${
          log.type === 'error' ? 'text-red-400 bg-red-500/10 px-2 rounded' :
          log.type === 'success' ? 'text-green-400' :
          log.type === 'action' ? 'text-purple-300' :
          log.type === 'lead' ? 'text-orange-200' :
          log.type === 'audit' ? 'text-purple-200' :
          log.type === 'swarm' ? 'text-blue-300' :
          'text-gray-300'
        }`}>
          {log.message}
        </span>
      </div>
    ));
  };

  return (
    <div className="min-h-screen bg-black text-white font-mono">
      {/* Header */}
      <header className="border-b border-gray-800 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
              <Bot size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold">PURPCLAW Orchestrator v7.0</h1>
              <p className="text-gray-400 text-sm">Layer 0 — Swarm Control Enabled</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${swarmConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm">{swarmConnected ? 'SWARM CONTROL ACTIVE' : 'SWARM OFFLINE'}</span>
            </div>
            <button
              onClick={getSwarmStatus}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm flex items-center gap-2"
            >
              <RefreshCw size={14} /> Sync
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 border-r border-gray-800 p-4 space-y-1">
          <button onClick={() => setActiveTab('chat')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${activeTab === 'chat' ? 'bg-blue-500/10 text-blue-400 shadow-[inset_2px_0_0_#3b82f6]' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}`}>
            <MessageSquare size={16} /> Chat Interface
          </button>
          <button onClick={() => setActiveTab('framework')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${activeTab === 'framework' ? 'bg-blue-500/10 text-blue-400 shadow-[inset_2px_0_0_#3b82f6]' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}`}>
            <LayoutTemplate size={16} /> Framework
          </button>
          <button onClick={() => setActiveTab('terminals')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${activeTab === 'terminals' ? 'bg-blue-500/10 text-blue-400 shadow-[inset_2px_0_0_#3b82f6]' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}`}>
            <Terminal size={16} /> Terminals
          </button>
          <button onClick={() => setActiveTab('state')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${activeTab === 'state' ? 'bg-blue-500/10 text-blue-400 shadow-[inset_2px_0_0_#3b82f6]' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}`}>
            <Database size={16} /> State
          </button>
          <button onClick={() => setActiveTab('health')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${activeTab === 'health' ? 'bg-blue-500/10 text-blue-400 shadow-[inset_2px_0_0_#3b82f6]' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}`}>
            <Activity size={16} /> Health
          </button>
          <button onClick={() => setActiveTab('swarm')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${activeTab === 'swarm' ? 'bg-blue-500/10 text-blue-400 shadow-[inset_2px_0_0_#3b82f6]' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}`}>
            <Users size={16} /> Swarm Control
          </button>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col">
          {activeTab === 'swarm' ? (
            renderSwarmControlPanel()
          ) : activeTab === 'chat' ? (
            <div className="flex-1 flex flex-col">
              {/* Agent Grid */}
              <div className="p-6 border-b border-gray-800">
                <h2 className="text-xl font-semibold mb-4">Agent Swarm</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {renderAgentCards()}
                </div>
              </div>

              {/* Command Input */}
              <div className="p-6 border-b border-gray-800">
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Enter command for the swarm..."
                    className="flex-1 bg-[#111] border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                    disabled={isProcessing}
                  />
                  <button
                    type="submit"
                    disabled={isProcessing || !input.trim()}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 rounded-lg font-medium flex items-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <CircleDashed size={18} className="animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        Execute
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Logs Panel */}
              <div className="flex-1 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">System Logs</h2>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400">Total: {logs.length}</span>
                    <button
                      onClick={() => setLogs([])}
                      className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-4 h-64 overflow-y-auto">
                  {renderLogs()}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-12">
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Server size={24} className="text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Tab Under Construction</h3>
                <p className="text-gray-400">This tab is not yet implemented in the swarm control version.</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Footer Status */}
      <footer className="border-t border-gray-800 p-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span>Bridge: Connected</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Swarm: {swarmConnected ? 'Active' : 'Offline'}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <span>Loop: {loopState.loop_number}/{loopState.max_loops}</span>
            </div>
          </div>
          <div className="text-gray-500">
            {swarmStatus ? `${swarmStatus.totalAgents} total agents, ${swarmStatus.activeAgents} active` : 'Loading swarm status...'}
          </div>
        </div>
      </footer>
    </div>
  );
}
