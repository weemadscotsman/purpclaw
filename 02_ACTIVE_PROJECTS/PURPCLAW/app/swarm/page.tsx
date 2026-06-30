'use client';
// Wrapped in CockpitShell — one shared chrome (UI consolidation).
import AgentList from '../components/AgentList';

export default function SwarmPage() {
  return (
    <>
      <div className="h-full overflow-y-auto p-4">
        <AgentList />
      </div>
    </>
  );
}
