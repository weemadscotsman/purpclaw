## 2026-08-20 - Focus States and Labels in InterventionPanel
**Learning:** Found multiple unlabelled interactive elements (icon buttons, inputs without id/htmlFor, and select dropdowns without context) lacking keyboard focus indicators.
**Action:** Always map labels explicitly via id/htmlFor, use aria-label/title for icon-only interactive components, and ensure visible focus styling (focus-visible:ring-*) is present on all custom controls to guarantee screen reader and keyboard accessibility.
