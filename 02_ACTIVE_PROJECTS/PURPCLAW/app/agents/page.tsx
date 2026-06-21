'use client';
// Wrapped in CockpitShell so the whole app shares ONE chrome (was a bare
// standalone monitor page — part of the UI consolidation onto one shell).
import { CockpitShell } from '../components/CockpitShell';
import AgentTower from '../components/AgentTower';

export default function AgentsPage() {
  return (
    <CockpitShell title="Agent Tower · Deploy & Orchestrate">
      <div className="h-full overflow-y-auto p-4">
        <AgentTower />
      </div>
    </CockpitShell>
  );
}
