'use client';
// Wrapped in CockpitShell — one shared chrome (UI consolidation).
import dynamic from 'next/dynamic';
import { CockpitShell } from '../components/CockpitShell';

// BridgePanel uses fetch + useState — must be client-only.
const BridgePanel = dynamic(() => import('../components/BridgePanel'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
      Loading PurpClaw Bridge…
    </div>
  ),
});

export default function BridgePage() {
  return (
    <CockpitShell title="GOOP Playground · API Broker & Bridge">
      <div className="h-full min-h-0 overflow-hidden">
        <BridgePanel />
      </div>
    </CockpitShell>
  );
}
