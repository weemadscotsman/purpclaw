# PURPCLAW UI Agent Rules

Use this as a standing order for Codex or any coding agent.

## Hard rules

1. No new page without checking existing routes.
2. No new shell.
3. No new nav system.
4. No new theme system.
5. No duplicate terminal.
6. No duplicate chat.
7. No duplicate session panel.
8. No duplicate stack page panel.
9. No fake data cards.
10. No permanent side clutter.

## Required workflow

Before editing:
- inspect existing route registry
- inspect Mission shell
- inspect drawer/nav components
- inspect theme provider
- inspect chat component
- inspect trace terminal component

During editing:
- merge into existing shell
- reuse shared components
- add only one canonical route if needed
- delete or archive duplicates

After editing:
- build
- check 1536x710 viewport
- check 1920x1080 viewport
- report duplicates removed
- report files changed
