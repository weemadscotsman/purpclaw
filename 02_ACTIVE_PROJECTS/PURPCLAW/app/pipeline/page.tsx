'use client';
// Wrapped in CockpitShell — one shared chrome (UI consolidation).
import { CockpitShell } from '../components/CockpitShell';
import LogFeed from '../components/LogFeed';

export default function PipelinePage() {
  return (
    <CockpitShell title="Task Log · Live Stream of Runs">
      <div className="h-full overflow-y-auto p-4">
        <LogFeed />
      </div>
    </CockpitShell>
  );
}
