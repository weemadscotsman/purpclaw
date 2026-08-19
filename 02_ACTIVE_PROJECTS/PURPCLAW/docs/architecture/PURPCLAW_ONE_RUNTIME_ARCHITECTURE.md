Yes. Lock this in as the product architecture:

PURPCLAW is one operating environment with one background runtime and multiple first-class control surfaces.

The surfaces are not separate versions of PURPCLAW.

CLI, TUI, browser Web UI, installed desktop app/WebApp, and mobile app are all clients of the exact same running PURPCLAW.

The canonical entry point is:

purpclaw

That command owns the whole show.

On a brand-new machine, the user installs PURPCLAW once. The installer puts the canonical launcher on PATH and installs the runtime, services, contracts, assets, required language runtimes, configuration machinery and UI clients.

The first time the user types:

purpclaw

the launcher sees that setup has never completed and performs first boot.

It establishes PURPCLAW_HOME, checks hardware, creates writable storage, validates ports, configures secrets, providers and models, migrates datastores, verifies memory, registers agents/souls/skills/tools, starts the event spine and security layer, starts the canonical core service profile, performs health tests, and writes one installed-system manifest.

Then it starts one long-lived background process:

PURPCLAW Runtime

That runtime is the authority.

Not the CLI.
Not Next.js.
Not Electron.
Not the TUI.
Not the phone.
Not some JSON file a component happened to find behind the sofa.

The runtime owns:

configuration
service supervision
agents
souls
skills
tools
providers
models
missions
processes
workflows
memory
events
approvals
artifacts
recovery
security
sessions
health
capability availability

The `purpclaw` executable is the bootstrapper and primary local control command.

Its startup logic becomes:

Find existing PURPCLAW Runtime.

If healthy, attach.

If absent, start it.

If unhealthy, diagnose/recover it.

Wait for core readiness.

Open the requested surface.

That gives us commands conceptually like:

purpclaw

Normal CLI.

purpclaw tui

Attach the full-screen terminal interface.

purpclaw web

Ensure runtime exists, ensure the browser UI server exists, then open it.

purpclaw app

Launch the installed desktop application against the same runtime.

purpclaw mobile pair

Securely pair the mobile application with this same PURPCLAW installation.

But these commands do not start separate brains.

They attach windows to the same brain.

The background architecture should therefore be:

PURPCLAW Launcher
→ PURPCLAW Runtime
→ canonical ServiceSupervisor
→ canonical API/Gateway
→ canonical Event Spine
→ all organisation/runtime systems

Then hanging off that:

CLI
TUI
Web UI
Desktop App
Mobile App

Every surface uses the same canonical API client and the same event stream.

That matters enormously.

If the user creates Mission 417 from the CLI, Mission 417 immediately appears in the TUI, browser, desktop app and phone.

If an agent starts working from the phone, the desktop app sees that Process transition to RUNNING.

If Gatekeeper asks for approval, the approval appears everywhere.

Approve it from the phone and the CLI immediately receives ApprovalResolved.

If an artifact is created, every surface sees the same artifact ID and provenance.

If memory changes, everybody reads the same memory.

If a tool becomes unavailable, every interface reflects the same capability status.

If PURPCLAW has 153 agents today and 154 tomorrow, every surface changes automatically because none of them owns the number.

That is what “identical experience” needs to mean.

Not identical pixels.

The CLI obviously cannot look like a mobile app, and forcing that would be UX lunacy.

They must instead have identical semantics:

same account
same PURPCLAW
same organisation
same missions
same processes
same agents
same souls
same skills
same tools
same providers/models
same memory
same approvals
same artifacts
same notifications
same capability availability
same health truth
same session continuity

Only presentation changes.

So we create one canonical client/view-model layer.

Conceptually:

PURPCLAW Core Contracts
↓
PURPCLAW Runtime API
↓
PURPCLAW Client SDK
↓
CLI / TUI / Web / Desktop / Mobile

The Client SDK becomes extremely important.

The CLI must not hand-code how missions work.

The TUI must not hand-code how agents work.

The browser must not reinvent provider logic.

The mobile app must not invent its own approval system.

They call the same client operations:

client.missions.create()
client.missions.get()
client.processes.list()
client.processes.cancel()
client.agents.list()
client.tools.invoke()
client.memory.search()
client.approvals.resolve()
client.artifacts.get()
client.services.status()

And they subscribe to the same events.

The first boot needs to provision all five surfaces as one product.

After the main setup passes, PURPCLAW should report something like:

PURPCLAW ready.

Runtime                 healthy
CLI                     ready
TUI                     ready
Web                     ready
Desktop                 ready
Mobile pairing          available

Then the user lands directly in the CLI because that is where they invoked it.

The CLI is not a setup utility that vanishes after installation. It remains the canonical local console.

A later normal startup becomes:

User types `purpclaw`.

Launcher checks runtime.

Runtime already alive?
Attach immediately.

Runtime asleep?
Wake it.

Core profile boots.

Configuration loads.

Memory reconnects.

Provider/model route verifies.

MCP reconnects.

Session opens.

SessionStart emits.

CLI appears.

Optional services remain sleeping until needed.

Then imagine the user types inside PURPCLAW:

/web

The browser opens.

Same current session.
Same mission.
Same conversation context.
Same selected agent.

Or:

/tui

The TUI takes over the same session.

Or the user opens the desktop icon directly.

The desktop executable internally performs the exact equivalent of:

purpclaw app

It therefore cannot accidentally start a second PURPCLAW.

Same for a Start Menu shortcut.

Same for macOS application launch.

Same for a Linux desktop launcher.

Every native launcher asks the canonical runtime bootstrapper to ensure PURPCLAW exists, then attaches.

The browser UI must also stop being its own server-side universe.

The finished browser architecture should be:

Browser
→ PURPCLAW Client SDK
→ canonical Gateway
→ PURPCLAW Runtime

No browser component calls :7781 because someone once knew that Voice lived there.

No JSX reads registry JSON directly.

No page starts a subprocess.

No page contains authoritative provider lists.

No page contains the number 153 as product truth.

The desktop app should be essentially a privileged native shell around the same web/client application where sensible, plus native integrations such as notifications, filesystem dialogs, microphone, camera, tray controls and deep links.

It still talks to the same runtime.

The mobile app is the one special case because it may not physically be on the same computer.

It still must not become another PURPCLAW backend.

The phone is a remote client of the user's existing PURPCLAW Runtime.

Pairing establishes:

device identity
encrypted credentials
scoped permissions
runtime address
certificate/trust relationship
revocation capability

Then the phone uses the same canonical API and events over an authenticated transport.

On the same LAN, it can connect locally.

Away from home, PURPCLAW can eventually use an authenticated relay/tunnel.

But the state remains on the user's PURPCLAW host unless a deliberate distributed-runtime feature is introduced later.

This also gives us session handoff.

Example:

Teddy starts in CLI.

Creates a build mission.

Walks away from the PC.

Opens PURPCLAW Mobile.

The same mission is there.

Agent is halfway through implementation.

Phone shows:

Running
Agent: engineering...
Stage: implementation
Tools used: ...
Artifacts: 3
Approval requested

He approves it.

Comes back to PC.

Opens TUI.

Same process has continued.

Nothing was “synced” between five separate apps because there was only ever one underlying state.

That is the key architectural trick.

For first-class parity, every user-facing capability needs a surface capability ID.

For example:

mission.create
mission.monitor
mission.cancel
process.inspect
agent.invoke
agent.chat
tool.invoke
memory.search
artifact.open
approval.resolve
studio.enter
council.open
voice.start
vision.start
system.health
provider.configure

Then we create one surface-parity matrix:

CLI
TUI
WEB
DESKTOP
MOBILE

A release cannot claim full parity while a canonical everyday operation is arbitrarily unavailable on one first-class interface.

Some features can have modality restrictions.

For example:

camera.capture may naturally differ between PC and phone.

filesystem.open_local may be host-only.

But the capability must explicitly declare that restriction.

It cannot simply be missing because nobody remembered to put the button in the mobile build.

First boot should also install the UIs without forcing them all to run.

Installed does not mean running.

At ordinary startup:

PURPCLAW Runtime runs.

CLI runs because the user invoked it.

TUI sleeps.

Web server/UI sleeps unless required.

Desktop UI sleeps.

Mobile is external.

Voice sleeps.

Vision sleeps.

YOLO sleeps.

Avatar sleeps.

Studio extras sleep.

Then everything wakes on demand.

This preserves the feeling that “all PURPCLAW is there” without warming the house by running twenty-six services, a camera model and four interfaces because Teddy wanted to type “hello.”

There should also be exactly one user/session identity system.

A session has one canonical session_id.

Every connected surface has a surface_id/device_id attached to that session.

So the runtime understands:

session
user
device
surface
mission
process
agent

separately.

That allows one conversation to move cleanly between interfaces.

Notifications work the same way.

Runtime generates one notification/event.

Presentation adapters decide:

CLI prints it.

TUI shows a banner.

Web shows a toast.

Desktop creates a native notification.

Mobile sends a notification.

One event.

Five presentations.

Never five subsystems each independently deciding that something happened.

Shutdown follows the same rule.

Closing the browser does not kill PURPCLAW.

Closing the desktop window does not murder active missions.

Exiting the TUI does not terminate agents.

Those close surfaces.

The underlying runtime remains alive according to the user's background-runtime policy.

Explicit:

purpclaw shutdown

means shut down the organisation runtime.

That command performs checkpointing, flushes memory/events/artifacts, pauses or completes work according to policy, stops optional services and gracefully stops core services.

There should also eventually be a tray/menu-bar representation of background runtime state, but even that is merely another surface.

Installation and update also stay unified.

One installer installs the entire product.

One updater updates the entire product.

One version number describes the product.

The mobile app may have its own client build number because app stores are app stores and apparently suffering must be institutionalised, but it declares which PURPCLAW protocol/API versions it supports.

The release proof therefore becomes much stronger.

On a clean machine:

Install PURPCLAW.

Type `purpclaw`.

Complete first boot.

CLI works.

Open TUI.

Same session.

Open Web.

Same session.

Open Desktop.

Same session.

Pair Mobile.

Same session.

Create mission in CLI.

Observe it everywhere.

Invoke agent from TUI.

Observe it everywhere.

Use skill-backed tool from Web.

Observe process/tool events everywhere.

Approve from Mobile.

Observe approval resolution everywhere.

Generate artifact from Desktop.

Open it from CLI/Web.

Write memory.

Restart the entire runtime.

Open any surface.

Memory and mission state survive.

That becomes a mandatory release-gate test.

So the final product model is:

One installation.

One PURPCLAW_HOME.

One configuration truth.

One secrets system.

One runtime.

One ServiceSupervisor.

One organisation.

One memory.

One event spine.

One ProcessRuntime.

One WorkflowRuntime.

One MissionRuntime.

One ToolRuntime.

One API/Gateway.

One Client SDK.

Five first-class interfaces:

CLI.
TUI.
Web.
Desktop.
Mobile.

And one stupidly simple command remains the root of the whole thing:

purpclaw

Everything else is just another window into the same cheerful wee bastard.

Continue exploring:

* Define the cross-surface parity contract
* Specify the one-runtime packaging and launch architecture
