'use client';

import { MissionControl } from '../components/MissionControl';
import { useMissionData } from '../hooks/useMissionData';

// Renders inside CockpitShell — no nested shell.
// MissionControl provides its own FloatingTabRail (17 internal tabs) as a
// left-side panel nav. CockpitShell sidebar provides cross-route nav.
export default function MissionPage() {
  const data = useMissionData();
  return <MissionControl data={data} />;
}
