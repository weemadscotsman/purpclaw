'use client';

import dynamic from 'next/dynamic';

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
    <div className="h-screen bg-zinc-950 text-zinc-100">
      <BridgePanel />
    </div>
  );
}
