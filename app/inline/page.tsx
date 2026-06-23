import { redirect } from 'next/navigation';

// UI consolidation: /inline was the legacy v8.3.0 inline Mission Control — a
// THIRD full UI shell (its own services/agents/events dashboard). Memory now
// has one canonical CockpitShell page at /memory, so this route redirects
// there instead of presenting a competing UI.
export default function InlineRedirect() {
  redirect('/memory');
}
