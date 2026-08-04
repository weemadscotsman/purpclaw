# PURPCLAW UI Duplicate Purge Map

## Merge these surfaces

| Current surface | Final location |
|---|---|
| Mission Sections permanent panel | MissionDrawer > Navigation |
| Chats / Sessions permanent panel | MissionDrawer > Sessions |
| Stack Pages permanent panel | MissionDrawer > Stack Pages |
| Mochi / outputs floating block | MissionDrawer > Mochi / Outputs |
| Raw signal page duplicate logs | Canonical route + TraceTerminal source |
| Separate chat panels | ControlRoomChat only |
| Repeated status cards | TopStatusBar + compact route summary |
| Alternate theme wrappers | Shared PURPCLAW theme provider |

## Delete or archive

Delete if:
- component is not routed
- duplicate of canonical page
- demo-only
- hardcoded fake data
- alternate UI shell
- duplicate theme system

Archive if:
- useful reference
- not active runtime
- experimental only
- not production ready

## Keep

Keep only if:
- wired into canonical route registry
- uses shared theme
- uses shared shell
- does not duplicate another surface
- has real data binding or clear fallback state
