# PURPCLAW UI Canonical Layout

## Verdict

The Mission UI is showing too many surfaces at once: drawer, mission sections, sessions, stack pages, Mochi outputs, chat, composer, and trace terminal. This must collapse into a disciplined shell.

## Canonical layout

| Zone | Purpose | Default state |
|---|---|---|
| TopStatusBar | compact service/agent/event/session state | visible |
| MissionIconRail | icons only, opens drawer | visible |
| MissionDrawer | navigation, sessions, stack pages, Mochi/output | closed |
| MainWorkArea | active route content and chat | dominant |
| TraceTerminalDock | live trace/log stream | docked right or collapsed bottom |
| OptionalBottomRibbon | active job/action status | hidden unless needed |

## One-screen rule

At any time, the viewport should show:

- top bar
- slim rail
- main route content
- one optional docked terminal

Everything else belongs in the drawer, a tab, or a collapsed section.

## Visual priority

Primary:
- active route / chat
- trace terminal when open

Secondary:
- top status
- route header
- compact chips

Hidden until needed:
- sessions
- stack page links
- Mochi/output widgets
- detailed service history
- raw signal logs

## Kill switch

If a feature creates a new page with a different theme, different shell, or separate navigation system, reject it.
