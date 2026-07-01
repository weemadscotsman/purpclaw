import { redirect } from 'next/navigation';

// UI consolidation: /inline was the legacy v8.3.0 inline Mission Control — a
// THIRD full UI shell (its own services/agents/events dashboard). The app now
// has one canonical shell (CockpitShell), so this redirects to /mission rather
// than presenting a competing UI. Its DivisionActivityPanel can be re-added as
// a CockpitShell page if that view is still wanted.
export default function InlineRedirect() {
  redirect('/mission');
}
