'use client';
// Wrapped in CockpitShell — one shared chrome (UI consolidation).
import LogFeed from '../components/LogFeed';

export default function PipelinePage() {
  return (
    <>
      <div className="h-full overflow-y-auto p-4">
        <LogFeed />
      </div>
    </>
  );
}
