'use client';

import React from 'react';
import type { MissionData } from '../hooks/useMissionData';
import { SwarmOrchestrationView } from './SwarmOrchestrationView';

export function SwarmPanel({ data }: { data: MissionData }) {
  return (
    <div className="h-full">
      <SwarmOrchestrationView agents={data.agents} />
    </div>
  );
}
