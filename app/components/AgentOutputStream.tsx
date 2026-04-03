'use client';

import { useRef, useEffect } from 'react';

interface AgentOutputStreamProps {
  agents: Array<{
    id: string;
    name: string;
    emoji: string;
    status: string;
    outputs: string[];
  }>;
  maxLines?: number;
}

export function AgentOutputStream({ agents, maxLines = 100 }: AgentOutputStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeAgents = agents.filter(a => a.status === 'working' || a.outputs.length > 0).slice(0, 20);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [agents]);

  if (activeAgents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/20 text-xs gap-2">
        <span className="text-2xl opacity-50">◈</span>
        <span>No active agent streams</span>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
      {activeAgents.map(agent => {
        const recentOutputs = agent.outputs.slice(-maxLines);
        const isWorking = agent.status === 'working';
        return (
          <div key={agent.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{agent.emoji}</span>
                <span className="text-sm font-medium text-white/90">{agent.name}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">{agent.id.slice(-6)}</span>
              </div>
              <div className="flex items-center gap-2">
                {isWorking && (
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[9px] text-emerald-400">LIVE</span>
                  </div>
                )}
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                  agent.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                  agent.status === 'error' ? 'bg-rose-500/10 text-rose-400' :
                  'bg-amber-500/10 text-amber-400'
                }`}>
                  {agent.status}
                </span>
              </div>
            </div>
            <div className="space-y-0.5 font-mono text-[10px] text-white/60 max-h-32 overflow-y-auto bg-black/20 rounded p-2">
              {recentOutputs.length === 0 ? (
                <span className="text-white/20 italic">Waiting for output...</span>
              ) : (
                recentOutputs.map((line, i) => (
                  <div key={i} className="truncate hover:text-white/80 transition-colors">
                    <span className="text-white/20 mr-2">{String(i + 1).padStart(3, '0')}</span>
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
