import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, Send, Bot, CheckCircle2, CircleDashed, AlertCircle, Server, LayoutTemplate, MessageSquare, Network, Database, Activity, ShieldAlert, ShieldCheck, Zap, GitMerge, ListChecks, RefreshCw } from 'lucide-react';
import { ReactFlow, Controls, Background, MarkerType, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

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
  type: 'info' | 'action' | 'success' | 'error' | 'lead' | 'audit';
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

export function OrchestratorDashboard() {
  const [activeTab, setActiveTab] = useState<'chat' | 'framework' | 'terminals' | 'state' | 'health'>('chat');
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [agents, setAgents] = useState<Agent[]>(DEFAULT_AGENTS);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: '1', agent: 'System', message: 'PURPCLAW Delegation Pipeline initialized. Layer 0 Orchestrator online.', timestamp: new Date(), type: 'info' },
    { id: '2', agent: 'PURPCLAW', message: 'Awaiting command. Ready to enforce the Think → Build → Judge loop.', timestamp: new Date(), type: 'lead' }
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

      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'completed' } : t));
      addLog('PURPCLAW', `Task [${task.id}] integrated cleanly.`, 'success');
    }

    // Update fatigue guard
    setGuardStatus(prev => ({ ...prev, fatigue: { active: true, triggered: false, detail: `${(tasks.length * 3 + 2)}/50 calls used (integration: 60 max)` } }));

    // FINAL GATE
    addLog('PURPCLAW', 'INTEGRATE: merging all final_code into single codebase.', 'lead');
    appendTerminalOutput('a1', `> Running final_inspection(codebase)...`);
    updateState({ next_action: 'FINAL_INSPECTION_GATE' });
    setGuardStatus(prev => ({ ...prev, escalation: { active: true, triggered: false, detail: 'Integration gate: priority cascade armed' } }));
    await new Promise(r => setTimeout(r, 2000));
    
    appendTerminalOutput('a1', `> all_tests_pass() == True`);
    appendTerminalOutput('a1', `> no_security_vulnerabilities() == True`);
    appendTerminalOutput('a1', `> debt_score() == 0`);
    appendTerminalOutput('a1', `> boots_without_error() == True`);
    
    addLog('PURPCLAW', 'FINAL AUDIT PASSES. Outputting clean codebase. EXIT.', 'success');
    updateState({ next_action: 'EXIT_SUCCESS' });
    updateAgentStatus('a1', 'idle');
    setIsProcessing(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    const req = input;
    setInput('');
    handleSimulateWorkflow(req);
  };

  // React Flow Nodes & Edges
  const initialNodes = tasks.map((task, index) => ({
    id: task.id,
    position: { x: 250 * index, y: 100 },
    data: { 
      label: (
        <div className="flex flex-col items-center p-2 w-48">
          <div className="font-bold text-sm mb-1">{task.title}</div>
          <div className={`text-xs px-2 py-1 rounded-full ${
            task.status === 'completed' ? 'bg-green-500/20 text-green-400' :
            task.status === 'failed' ? 'bg-red-500/20 text-red-400' :
            task.status === 'running' ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-800 text-gray-400'
          }`}>
            {task.status.toUpperCase()}
          </div>
        </div>
      )
    },
    style: {
      background: '#111',
      border: `1px solid ${
        task.status === 'completed' ? '#22c55e' :
        task.status === 'failed' ? '#ef4444' :
        task.status === 'running' ? '#3b82f6' : '#333'
      }`,
      borderRadius: '8px',
      color: '#fff',
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }));

  const initialEdges = tasks.flatMap(task => 
    task.dependencies.map(dep => ({
      id: `e-${dep}-${task.id}`,
      source: dep,
      target: task.id,
      animated: task.status === 'running' || task.status === 'pending',
      style: { stroke: task.status === 'completed' ? '#22c55e' : '#555' },
      markerEnd: { type: MarkerType.ArrowClosed, color: task.status === 'completed' ? '#22c55e' : '#555' },
    }))
  );

  return (
    <div className="flex h-screen bg-[#050505] text-gray-300 font-sans overflow-hidden relative">
      
      {/* Escalation Modal (Layer 4) */}
      <AnimatePresence>
        {escalation && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-[#0a0a0a] border border-red-500/50 p-8 rounded-2xl max-w-lg w-full shadow-[0_0_50px_rgba(239,68,68,0.15)]"
            >
              <h3 className="text-red-400 font-bold text-xl mb-3 flex items-center gap-3">
                <ShieldAlert size={24} /> LAYER 4: ESCALATION REQUIRED
              </h3>
              <p className="text-gray-300 mb-8 leading-relaxed text-sm">{escalation.message}</p>
              <div className="flex flex-col gap-3">
                <button onClick={() => escalation.resolve('override')} className="bg-red-500/10 text-red-400 hover:bg-red-500/20 px-4 py-3 rounded-xl border border-red-500/30 font-medium transition-colors flex items-center justify-center gap-2">
                  <Zap size={16} /> Override & Continue
                </button>
                <button onClick={() => escalation.resolve('rewrite')} className="bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 px-4 py-3 rounded-xl border border-purple-500/30 font-medium transition-colors flex items-center justify-center gap-2">
                  <LayoutTemplate size={16} /> Rewrite Spec
                </button>
                <button onClick={() => escalation.resolve('manual')} className="bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 px-4 py-3 rounded-xl border border-gray-700 font-medium transition-colors flex items-center justify-center gap-2">
                  <Terminal size={16} /> Take Over Manually
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <div className="w-64 bg-[#0a0a0a] border-r border-gray-800 flex flex-col z-10">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-white font-bold flex items-center gap-2 text-lg tracking-tight">
            <img src="https://storage.googleapis.com/mako-assets/image-generation/1b918115-4f36-4158-b6d4-83944d187219/1271166373722251322.jpg" alt="PURPCLAW Logo" className="w-6 h-6 rounded border border-purple-500/50" />
            PURPCLAW
          </h1>
          <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider font-semibold">Delegation Pipeline</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <button onClick={() => setActiveTab('chat')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${activeTab === 'chat' ? 'bg-purple-500/10 text-purple-400 shadow-[inset_2px_0_0_#a855f7]' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}`}>
            <MessageSquare size={16} /> Command Input
          </button>
          <button onClick={() => setActiveTab('framework')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${activeTab === 'framework' ? 'bg-purple-500/10 text-purple-400 shadow-[inset_2px_0_0_#a855f7]' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}`}>
            <LayoutTemplate size={16} /> The Constitution
          </button>
          <button onClick={() => setActiveTab('terminals')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${activeTab === 'terminals' ? 'bg-green-500/10 text-green-400 shadow-[inset_2px_0_0_#22c55e]' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}`}>
            <Terminal size={16} /> Agent Pods
          </button>
          <button onClick={() => setActiveTab('state')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${activeTab === 'state' ? 'bg-orange-500/10 text-orange-400 shadow-[inset_2px_0_0_#f97316]' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}`}>
            <Database size={16} /> loop_state.json
          </button>
          <button onClick={() => setActiveTab('health')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${activeTab === 'health' ? 'bg-red-500/10 text-red-400 shadow-[inset_2px_0_0_#ef4444]' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}`}>
            <Activity size={16} /> Pod Health
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative bg-[#0a0a0a] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(37,99,235,0.05),rgba(255,255,255,0))]">
        
        {/* Chat Tab */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col p-6 max-w-5xl mx-auto w-full">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-white mb-2">PURPCLAW Command Center</h2>
              <p className="text-gray-400 text-sm">Input your objective. The Orchestrator will spin up the pods, enforce the loop, and output zero-debt code.</p>
            </div>
            
            <div className="flex-1 bg-[#0f0f0f] border border-gray-800/60 rounded-xl p-5 overflow-y-auto mb-4 font-mono text-sm shadow-inner">
              <AnimatePresence>
                {logs.map((log) => (
                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={log.id} className="mb-3 flex gap-3 leading-relaxed">
                    <span suppressHydrationWarning className="text-gray-600 shrink-0 select-none">[{log.timestamp.toLocaleTimeString()}]</span>
                    <span className={`font-bold shrink-0 w-36 truncate ${
                      log.type === 'lead' ? 'text-orange-400' :
                      log.type === 'audit' ? 'text-purple-400' :
                      log.agent === 'System' ? 'text-gray-500' : 'text-purple-400'
                    }`}>
                      {log.agent}:
                    </span>
                    <span className={`${
                      log.type === 'error' ? 'text-red-400 bg-red-500/10 px-2 rounded' :
                      log.type === 'success' ? 'text-green-400' :
                      log.type === 'action' ? 'text-purple-300' : 
                      log.type === 'lead' ? 'text-orange-200' : 
                      log.type === 'audit' ? 'text-purple-200' : 'text-gray-300'
                    }`}>
                      {log.message}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={logsEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                <Terminal size={18} />
              </div>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isProcessing}
                placeholder="Enter objective to begin the Delegation Pipeline..."
                className="w-full bg-[#0f0f0f] border border-gray-700 rounded-xl pl-12 pr-14 py-4 text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 disabled:opacity-50 transition-all shadow-lg"
              />
              <button 
                type="submit"
                disabled={isProcessing || !input.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg disabled:opacity-50 transition-colors shadow-md"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        )}

        {/* Framework Tab */}
        {activeTab === 'framework' && (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-4xl mx-auto space-y-8">
              <div>
                <h2 className="text-2xl font-semibold text-white mb-2">The Terminal Puppeteer Architecture</h2>
                <p className="text-gray-400 text-sm mb-6">PURPCLAW is not a monolithic orchestrator. It is a terminal-puppeteering swarm. PURPCLAW does not generate code; it types into existing terminal windows where dedicated AI workers are already running in their own CLI environments.</p>
              </div>

              <div className="space-y-4">
                <div className="bg-[#0f0f0f] border border-gray-800 p-6 rounded-xl border-l-4 border-l-purple-500">
                  <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><Network size={20}/> LAYER 0 — THE PUPPET MASTER (PURPCLAW)</h3>
                  <p className="text-sm text-gray-400 mb-3">Reads commands, decides which terminal handles it best, uses <code className="text-purple-400 bg-purple-900/20 px-1 rounded">tmux send-keys</code> to type prompts, and <code className="text-purple-400 bg-purple-900/20 px-1 rounded">tmux capture-pane</code> to read outputs.</p>
                </div>

                <div className="bg-[#0f0f0f] border border-gray-800 p-6 rounded-xl border-l-4 border-l-purple-500">
                  <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><Server size={20}/> LAYER 1 — THE CLI SWARM</h3>
                  <ul className="text-sm text-gray-400 space-y-2 list-disc list-inside">
                    <li><strong className="text-gray-300">DeepSeek 3.1:</strong> Reasoning, long context, security review.</li>
                    <li><strong className="text-gray-300">Minimax 2.76:</strong> Fast generation, creative fixes.</li>
                    <li><strong className="text-gray-300">Kimi Code K2.5:</strong> Code-specific execution tasks.</li>
                    <li><strong className="text-gray-300">Gemini 3.1 Pro:</strong> Multimodal analysis.</li>
                    <li><strong className="text-gray-300">Kilo Code:</strong> Heavy orchestration, task decomposition (running Minimax 2.7).</li>
                  </ul>
                </div>

                <div className="bg-[#0f0f0f] border border-gray-800 p-6 rounded-xl border-l-4 border-l-orange-500">
                  <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><RefreshCw size={20}/> LAYER 2 — THE ROUTING LOOP</h3>
                  <pre className="mt-3 text-xs font-mono text-gray-500 bg-[#111] p-3 rounded border border-gray-800 overflow-x-auto">
{`1. Read your command
2. Decide which AI terminal can handle it best
3. Type into that terminal's window: "PURPCLAW delegates: [task]"
4. Read the terminal's output
5. If output needs refinement → pass to another terminal
6. If output is final → present to you`}
                  </pre>
                </div>

                <div className="bg-[#0f0f0f] border border-gray-800 p-6 rounded-xl border-l-4 border-l-yellow-500">
                  <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><Database size={20}/> LAYER 3 — STATE MANAGEMENT</h3>
                  <p className="text-sm text-gray-400">Agents have no memory. The Orchestrator maintains <code className="text-yellow-400">loop_state.json</code> to track artifacts, failed stages, and next actions.</p>
                </div>

                <div className="bg-[#0f0f0f] border border-gray-800 p-6 rounded-xl border-l-4 border-l-red-500">
                  <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><ShieldAlert size={20}/> LAYER 4 & 5 — ESCALATION & FINAL GATE</h3>
                  <p className="text-sm text-gray-400 mb-2"><strong>Escalation:</strong> If loops {'>'} max_retries, agent freezes and asks human for override.</p>
                  <p className="text-sm text-gray-400"><strong>Final Gate:</strong> <code className="text-red-400">final_inspection(codebase)</code> ensures zero debt, no vulnerabilities, and continuous running before exit.</p>
                </div>

                <div className="bg-[#0f0f0f] border border-gray-800 p-6 rounded-xl border-l-4 border-l-cyan-500">
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><ShieldCheck size={20}/> PROTECTION GRID — 4 Guards</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(guardStatus).map(([key, guard]) => (
                      <div key={key} className={`p-3 rounded-lg border ${
                        guard.triggered ? 'border-red-500/40 bg-red-500/5' :
                        guard.active ? 'border-green-500/40 bg-green-500/5' : 'border-gray-800 bg-[#111]'
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-2 h-2 rounded-full ${
                            guard.triggered ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]' :
                            guard.active ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]' : 'bg-gray-700'
                          }`}></div>
                          <span className="text-xs font-bold uppercase tracking-wider text-gray-300">
                            {key === 'convergence' ? '🔄 Convergence' :
                             key === 'escalation' ? '🚨 Escalation Priority' :
                             key === 'fatigue' ? '⚡ Fatigue Limit' : '⚖️ Tie-Breaker'}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 leading-relaxed">{guard.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Terminals Tab */}
        {activeTab === 'terminals' && (
          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            <div className="flex justify-between items-end mb-4">
              <div>
                <h2 className="text-2xl font-semibold text-white mb-1">Agent Pods (Live Streams)</h2>
                <p className="text-gray-400 text-sm">Real-time stdout/stderr from the isolated agent queues.</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-1 overflow-y-auto pb-2">
              {agents.map((agent) => {
                const isLead = agent.id === 'a1';
                const isWorking = agent.status === 'working';
                const isError = agent.status === 'error';
                const output = terminalOutputs[agent.id] || [];
                
                return (
                  <div key={agent.id} className={`bg-[#050505] border ${isLead ? 'border-purple-500/30' : isError ? 'border-red-500/50' : isWorking ? 'border-green-500/30' : 'border-gray-800'} rounded-lg flex flex-col overflow-hidden font-mono text-[10px] sm:text-xs h-[32vh] shadow-lg`}>
                    <div className={`px-2 py-1.5 border-b flex items-center justify-between ${
                      isLead ? 'border-purple-500/30 bg-purple-500/5' : 
                      isError ? 'border-red-500/50 bg-red-500/10' :
                      isWorking ? 'border-green-500/30 bg-green-500/5' : 'border-gray-800 bg-[#0f0f0f]'
                    }`}>
                      <span className={`${isLead ? 'text-purple-400 font-bold' : isError ? 'text-red-400' : 'text-gray-400'} flex items-center gap-1.5 truncate`}>
                        <Terminal size={12} /> {agent.name}
                      </span>
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        isError ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' :
                        isWorking ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-700'
                      }`}></div>
                    </div>
                    <div 
                      ref={el => { terminalRefs.current[agent.id] = el; }}
                      className="p-2 flex-1 overflow-y-auto text-gray-400 space-y-1 scrollbar-thin scrollbar-thumb-gray-800"
                    >
                      <p className="text-gray-600 truncate opacity-50">$ {isLead ? 'orchestrator-core' : `pod-worker --role "${agent.name.toLowerCase()}"`}</p>
                      {output.length === 0 ? (
                        <p className="text-gray-600 mt-2">Queue empty. Waiting...</p>
                      ) : (
                        output.map((line, i) => (
                          <div key={i} className={`${
                            line.includes('ERROR') ? 'text-red-400' : 
                            line.includes('success') || line.includes('passed') || line.includes('True') ? 'text-green-400' : 
                            line.includes('>') ? 'text-purple-300' : 'text-gray-400'
                          } break-all`}>
                            {line}
                          </div>
                        ))
                      )}
                      {isWorking && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ repeat: Infinity, duration: 0.8, repeatType: "reverse" }} className="w-2 h-3 bg-gray-400 mt-1 inline-block" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* State Graph Tab */}
        {activeTab === 'state' && (
          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            <div className="mb-4">
              <h2 className="text-2xl font-semibold text-white mb-1">State Management (Layer 3)</h2>
              <p className="text-gray-400 text-sm">The Orchestrator&apos;s memory layer. Agents do not remember past loops.</p>
            </div>
            
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
              {/* loop_state.json Viewer */}
              <div className="lg:col-span-1 bg-[#0f0f0f] border border-gray-800 rounded-xl flex flex-col overflow-hidden">
                <div className="p-3 border-b border-gray-800 bg-[#161616] flex items-center gap-2">
                  <Database size={16} className="text-yellow-500"/>
                  <span className="text-sm font-mono text-gray-300">loop_state.json</span>
                </div>
                <div className="p-4 flex-1 overflow-y-auto">
                  <pre className="text-xs font-mono text-gray-400 whitespace-pre-wrap">
                    {JSON.stringify(loopState, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Task DAG */}
              <div className="lg:col-span-2 bg-[#0a0a0a] border border-gray-800 rounded-xl overflow-hidden relative">
                {tasks.length > 0 ? (
                  <ReactFlow 
                    nodes={initialNodes} 
                    edges={initialEdges}
                    fitView
                    className="bg-[#050505]"
                  >
                    <Background color="#333" gap={16} />
                    <Controls className="bg-[#111] border-gray-800 fill-white" />
                  </ReactFlow>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-500 flex-col gap-4">
                    <Network size={48} className="opacity-20" />
                    <p>DAG empty. Awaiting Planner output.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Health Tab */}
        {activeTab === 'health' && (
          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-white mb-1">Agent Pod Health</h2>
              <p className="text-gray-400 text-sm">Real-time metrics for the isolated agent pods.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto pb-4">
              {agents.map(agent => (
                <div key={agent.id} className="bg-[#0f0f0f] border border-gray-800 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className={`font-semibold ${agent.id === 'a1' ? 'text-purple-400' : 'text-gray-200'}`}>{agent.name}</h3>
                      <p className="text-xs text-gray-500">{agent.role}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                      agent.status === 'working' ? 'bg-green-500/20 text-green-400' :
                      agent.status === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-gray-800 text-gray-400'
                    }`}>
                      {agent.status}
                    </span>
                  </div>
                  
                  <div className="space-y-4">
                    {/* CPU */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">CPU Usage</span>
                        <span className={agent.cpu > 80 ? 'text-red-400' : 'text-gray-300'}>{agent.cpu.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <motion.div 
                          className={`h-full ${agent.cpu > 80 ? 'bg-red-500' : 'bg-purple-500'}`}
                          animate={{ width: `${agent.cpu}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                    
                    {/* Memory */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">Memory</span>
                        <span className={agent.memory > 80 ? 'text-red-400' : 'text-gray-300'}>{agent.memory.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <motion.div 
                          className={`h-full ${agent.memory > 80 ? 'bg-red-500' : 'bg-purple-500'}`}
                          animate={{ width: `${agent.memory}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>

                    {/* Response Time */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-800/50">
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Activity size={12} /> Latency
                      </span>
                      <span className={`text-xs font-mono ${agent.responseTime > 250 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {agent.responseTime.toFixed(0)}ms
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
