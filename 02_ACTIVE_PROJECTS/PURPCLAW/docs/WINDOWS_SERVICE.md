# PurpClaw on Windows

PurpClaw uses two processes because Windows services run in Session 0 and
cannot reliably access the logged-in desktop, microphone, notifications, mouse,
keyboard, or speakers.

- **PurpClaw Core service** starts the API, orchestrator, agents, harness, and
  Web UI at boot.
- **PurpClaw Tray** starts at user logon and owns voice input/output,
  notifications, screenshots, and approved computer-use actions.

Both text and microphone commands use the same voice gateway and orchestrator.
The Web UI, CLI, TUI, and tray therefore create the same workflow records.

Runtime process limits, Python supervision, and telemetry are documented in
`docs/RUNTIME_SAFETY.md`.

## Check readiness

```powershell
npm run windows:check
```

## Install

Run an elevated PowerShell terminal:

```powershell
npm run windows:install
```

The installer creates the `PurpClawCore` automatic service and a
`PurpClaw Tray` scheduled task for the current interactive user.

## Safety defaults

Computer use starts disabled. Observe mode can inspect windows and screenshots.
Assist mode requires explicit approval before mouse or keyboard input.
External email, SMS, calls, bookings, purchases, credit, and account actions
also require explicit confirmation and produce an audit event.

## Remove

```powershell
npm run windows:uninstall
```
