## 2026-09-27 - Add ARIA Labels and Focus Rings to Action Buttons
**Learning:** When using lucide-react icons inside buttons, always add `aria-hidden="true"` to the icon to prevent screen readers from reading decorative icons redundantly. Also, use `focus-visible:ring-2 focus-visible:outline-none` rather than just `outline-none` to ensure keyboard navigation focus state is visible.
**Action:** Add `aria-hidden="true"` to inner SVG/icons within buttons and provide explicit `aria-label` alongside proper focus-visible styles on the parent button element.
