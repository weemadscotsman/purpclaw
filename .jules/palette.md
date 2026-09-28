## 2025-05-15 - [TraceTerminal Icon Button Accessibility]
**Learning:** Icon-only buttons mapping to actions like pause, auto-scroll, clear in terminal views lack explicit accessibility markers, being invisible to screen-reader users and keyboard navigation. Using focus-visible styles properly is necessary.
**Action:** Always add aria-label and aria-hidden along with focus-visible styling for icon-only action buttons.
