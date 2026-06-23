'use client';

import React from 'react';
import type { ServiceHealth } from '../hooks/useMissionData';

interface ServiceHealthGridProps {
  services: ServiceHealth[];
}

export function ServiceHealthGrid({ services }: ServiceHealthGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {services.map((svc) => {
        const isOnline = svc.status === 'online';
        const isDegraded = svc.status === 'degraded';
        const color = isOnline ? '#22c55e' : isDegraded ? '#f59e0b' : svc.optional ? '#64748b' : '#ef4444';
        return (
          <div
            key={svc.name}
            className="relative rounded-lg border border-white/10 bg-white/[0.03] p-3 hover:border-white/20 transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
              />
              <span className="text-[10px] uppercase tracking-wider text-white/60 font-mono truncate">
                {svc.name}
              </span>
            </div>
            <div className="text-xs text-white/40 font-mono">:{svc.port}</div>
            {svc.optional && (
              <div className="mt-1 text-[9px] uppercase tracking-wider text-white/25 font-mono">optional</div>
            )}
            {svc.latency !== undefined && (
              <div className="text-[10px] text-white/30 font-mono mt-1">{svc.latency}ms</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
