import React from 'react';
import type { MissionData } from '../../hooks/useMissionData';

// Stub — Purple Dawn skin shell. Full implementation pending.
export function DawnControlRoom({ data }: { data: MissionData }) {
  return (
    <div className="p-8 text-center">
      <p className="text-fuchsia-400 font-mono text-sm uppercase tracking-widest mb-2">
        Purple Dawn
      </p>
      <p className="text-white/40 text-xs">
        Skin loading...
      </p>
    </div>
  );
}
