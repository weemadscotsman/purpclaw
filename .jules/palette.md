
## $(date +%Y-%m-%d) - Accessibility of interactive elements
**Learning:** Decorative icons inside icon-only buttons need to be hidden from screen readers using `aria-hidden="true"`, otherwise they will be read redundantly or confusingly along with the button's explicit `aria-label`. Ensure interactive elements without visible text have proper `aria-label` context.
**Action:** Always check the internals of interactive icon-only elements to add `aria-hidden` to SVG or font-icons and provide a robust `aria-label` on the wrapper component.
