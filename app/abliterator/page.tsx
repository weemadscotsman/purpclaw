'use client';
// Salvaged from the dead MissionControl shell into its own canonical route so
// the "Abliterator" nav item links to the real AbliteratorPanel (live
// /api/obliteratus data) instead of the Tower-floor /skyscraper page.
import { CockpitShell } from '../components/CockpitShell';
import { AbliteratorPanel } from '../components/AbliteratorPanel';

export default function AbliteratorPage() {
  return (
    <CockpitShell title="Abliterator · Redact, Purge & Forget">
      <div className="h-full min-h-0 overflow-y-auto p-4">
        <AbliteratorPanel />
      </div>
    </CockpitShell>
  );
}
