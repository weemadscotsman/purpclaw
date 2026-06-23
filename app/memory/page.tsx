'use client';

import { CockpitShell } from '../components/CockpitShell';
import { CognitivePanel } from '../components/CognitivePanel';

export default function MemoryPage() {
  return (
    <CockpitShell title="Memory & Cognition">
      <div className="h-full min-h-0 overflow-y-auto p-4">
        <CognitivePanel />
      </div>
    </CockpitShell>
  );
}
