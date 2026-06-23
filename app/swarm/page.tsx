'use client';
// Wrapped in CockpitShell — one shared chrome (UI consolidation).
import { CockpitShell } from '../components/CockpitShell';
import AgentList from '../components/AgentList';

export default function SwarmPage() {
  return (
    <CockpitShell title="Agent Swarm · Live Roster">
      <div className="h-full overflow-y-auto p-4">
        <AgentList />
      </div>
    </CockpitShell>
  );
}
