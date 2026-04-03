'use client';
/**
 * PURPCLAW Agent Tower Panel
 * Monitor 2 - ASUS Left
 */
import AgentTower from '../components/AgentTower';

export default function AgentsPage() {
  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="mb-4 pb-2 border-b border-white/10">
        <h1 className="text-sm font-bold tracking-[0.3em] text-purple-400">AGENT TOWER</h1>
        <p className="text-[10px] text-white/30">Monitor 2 - ASUS Left</p>
      </div>
      <AgentTower />
    </div>
  );
}
