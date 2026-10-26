## 2024-05-14 - Accessible TraceTerminal Buttons
**Learning:** Icon-only buttons used for debugging and terminal trace controls (like in `TraceTerminal`) lack screen-reader accessible names, relying only on visual icons or native `title` attributes (which are not consistently announced).
**Action:** Always add `aria-label` attributes to icon-only buttons, especially in debugging/developer-facing UI components where users might rely on screen readers.
