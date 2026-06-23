# `app/components/` Agent Notes

This folder owns shared cockpit components. Preserve existing components first; expand them into pages or adapters instead of deleting UI.

## Key Components

| Component | Role |
|---|---|
| `MissionControl.tsx` | Main mission cockpit composition |
| `CommandPanel.tsx` | Chat, job routing, assistant stream, sessions, trace terminal mount |
| `SessionSidebar.tsx` | Saved chats and stack page navigation |
| `TraceTerminal.tsx` | Copyable trace stream viewer |
| `LiveSystemMap.tsx` | 2D system relationships and live service/agent/workflow links |
| `CockpitShell.tsx` | Shared left rail/header/footer shell for full pages |
| `AutonomousHarnessPanel.tsx` | Harness job control and status |
| `AgentTower.tsx`, `AgentStatusBar.tsx` | Agent status/terminal views |

## UI Rules

- Do not delete existing Mission Control panels. If a tab becomes a full page, keep the old panel reachable until the page is verified.
- Live dashboard text must come from hooks/API responses, not static claims.
- Use `/api/trace/*` for trace terminal data and `/api/services` for service truth.
- Keep readability high: cockpit controls and labels should be legible without relying on tiny text.

## Validation

After component changes, build and smoke the affected pages:

```powershell
npm run build
Invoke-WebRequest -UseBasicParsing http://localhost:3030/mission
Invoke-WebRequest -UseBasicParsing http://localhost:3030/system-map
Invoke-WebRequest -UseBasicParsing http://localhost:3030/evolution
```
