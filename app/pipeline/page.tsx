'use client';
/**
 * PURPCLAW Task Pipeline Panel
 * Monitor 4 - ASUS Right
 */
import LogFeed from '../components/LogFeed';

export default function PipelinePage() {
  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="mb-4 pb-2 border-b border-white/10">
        <h1 className="text-sm font-bold tracking-[0.3em] text-emerald-400">TASK PIPELINE</h1>
        <p className="text-[10px] text-white/30">Monitor 4 - ASUS Right</p>
      </div>
      <LogFeed />
    </div>
  );
}
