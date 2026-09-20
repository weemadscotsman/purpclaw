
## 2024-05-18 - Dynamic Roles and Hidden Decorations in Toast Components
**Learning:** When building accessible Toast notifications in React, using dynamic `role` attributes (`role="alert"` for errors and `role="status"` for success/info) alongside `aria-live` regions (`assertive` vs `polite`) significantly improves screen reader comprehension. Furthermore, adding `aria-hidden="true"` to structural/decorative elements (like type icons or the '✕' on a dismiss button) prevents redundant and confusing screen reader announcements when an `aria-label` is already present on the parent button.
**Action:** Always wrap dynamically generated notifications in appropriate ARIA live regions and meticulously hide decorative structural icons to keep the accessibility tree clean.
