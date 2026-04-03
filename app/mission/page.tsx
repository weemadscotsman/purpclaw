'use client';

import { MissionControl } from '../components/MissionControl';
import { useMissionData } from '../hooks/useMissionData';

export default function MissionPage() {
  const data = useMissionData();
  return <MissionControl data={data} />;
}
