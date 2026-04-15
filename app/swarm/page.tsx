'use client';
/**
 * PURPCLAW Swarm Monitor Panel
 * Monitor 3 - DELL Middle
 */
import AgentList from '../components/AgentList';

export default function SwarmPage() {
  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="mb-4 pb-2 border-b border-white/10">
        <h1 className="text-sm font-bold tracking-[0.3em] text-cyan-400">SWARM MONITOR</h1>
        <p className="text-[10px] text-white/30">Monitor 3 - DELL Middle</p>
      </div>
      <AgentList view="grid" />
    </div>
  );
}
