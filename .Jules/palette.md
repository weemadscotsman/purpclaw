
## 2024-08-23 - Accessible Icon-Only Buttons
**Learning:** Found a pattern of icon-only buttons (like the `×` to remove attachments or the `+` for the launcher menu) in the composer lacking screen reader accessibility and clear keyboard focus indicators.
**Action:** Always wrap inner symbols/text in `<span aria-hidden="true">` to prevent redundant/confusing announcements, add a descriptive `aria-label` to the `<button>`, and ensure keyboard navigation works cleanly by adding `focus-visible:outline-none focus-visible:ring-2` to the button classes.
