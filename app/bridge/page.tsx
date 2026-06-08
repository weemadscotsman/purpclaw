'use client';

import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with the bridge panel
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
    <div className="h-screen bg-zinc-950 text-zinc-100">
      <BridgePanel />
    </div>
  );
}
