'use client';

// UI consolidation: /mission now renders the Control Room (CommandPanel)
// inside the ONE canonical shell (CockpitShell) — same labeled sidebar as
// every other page. Previously this used MissionControl, a second full shell
// with its own icon rail, which is what made the app feel like multiple UIs.
// Every dashboard/panel destination lives in the CockpitShell sidebar routes.
import { CockpitShell } from '../components/CockpitShell';
import { CommandPanel } from '../components/CommandPanel';
import { useMissionData } from '../hooks/useMissionData';

export default function MissionPage() {
  const data = useMissionData();
  return (
    <CockpitShell title="Mission Control · Command Room" hideRail>
      <CommandPanel data={data} />
    </CockpitShell>
  );
}
