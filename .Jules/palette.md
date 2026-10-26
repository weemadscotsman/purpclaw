## 2026-08-24 - [Accessibility] Improve screen reader and keyboard support in TranscriptViewer
**Learning:** When using Lucide icons inside interactive elements like buttons, it is important to add `aria-hidden="true"` to the icon to prevent redundant screen reader announcements, and combine it with `aria-label` on the button for clarity. Also, Tailwind's `focus-visible` utility is crucial for keyboard navigation.
**Action:** Always add `aria-hidden="true"` to decorative inner icons, and ensure buttons have an explicit `aria-label` and `focus-visible` styling.
