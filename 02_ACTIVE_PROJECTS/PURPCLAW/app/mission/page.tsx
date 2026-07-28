'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MissionControl } from '../components/MissionControl';
import { DawnControlRoom } from '../ui-shells/03-purple-dawn/DawnControlRoom';
import { getSavedSkin } from '../ui-shells/03-purple-dawn/SkinToggle';
import { useMissionData } from '../hooks/useMissionData';
import { isMissionTab } from '../lib/route-registry';

// Renders inside CockpitShell — no nested shell.
// UI CONSOLIDATION (2026-07-03): /mission?tab=<id> deep-links straight into a
// drawer section, so every canonical registry route is URL-addressable.
// PURPLE DAWN (2026-07-04): /mission?ui=dawn renders the Claude Design skin
// (DawnControlRoom) instead of the classic MissionControl. Opt-in — the
// default surface is untouched, so a skin bug can never brick the cockpit.
function MissionPageInner() {
  const data = useMissionData();
  const params = useSearchParams();
  const ui = params.get('ui');

  // Durable skin preference: ?ui= wins, else the saved Settings choice.
  // Read localStorage after mount to avoid an SSR/client mismatch.
  const [savedSkin, setSavedSkin] = useState<'classic' | 'dawn'>('classic');
  useEffect(() => { setSavedSkin(getSavedSkin()); }, []);
  const skin = ui === 'dawn' ? 'dawn' : ui === 'classic' ? 'classic' : savedSkin;

  if (skin === 'dawn') return <DawnControlRoom data={data} />;

  const tabParam = params.get('tab');
  const initialTab = isMissionTab(tabParam) ? tabParam : null;
  return <MissionControl data={data} initialTab={initialTab} />;
}

export default function MissionPage() {
  // useSearchParams requires a Suspense boundary in Next 15.
  return (
    <Suspense fallback={null}>
      <MissionPageInner />
    </Suspense>
  );
}
