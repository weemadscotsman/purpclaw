## 2024-05-25 - [Missing ARIA labels on Icon-only Buttons]
**Learning:** Icon-only buttons (such as Share, Play, and Close/Kill) throughout the application's components lack `aria-label` and `title` attributes. This presents a critical accessibility barrier for screen reader users and reduces clarity for sighted users who benefit from tooltips.
**Action:** Always ensure that any icon-only button includes descriptive `aria-label` and `title` attributes (and consider `aria-hidden="true"` on the SVG/icon itself) to provide context.
