'use client';
// Wrapped in CockpitShell so the whole app shares ONE chrome (was a bare
// standalone monitor page — part of the UI consolidation onto one shell).

import AgentTower from '../components/AgentTower';

export default function AgentsPage() {
  return (
    <>
      <div className="h-full overflow-y-auto p-4">
        <AgentTower />
      </div>
    </>
  );
}
