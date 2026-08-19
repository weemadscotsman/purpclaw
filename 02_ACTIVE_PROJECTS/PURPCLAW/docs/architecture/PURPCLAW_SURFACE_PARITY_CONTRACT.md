Understood. I should have put these into the architecture immediately instead of dangling them like bait. Here they are as part of the actual spec.

1. CROSS-SURFACE PARITY CONTRACT

The rule is:

CLI, TUI, Web UI, Desktop App and Mobile App are five first-class presentations of one PURPCLAW.

They do not own separate state.
They do not own separate business logic.
They do not own separate agents.
They do not own separate conversations.
They do not own separate tool implementations.
They do not own separate mission systems.

They are clients.

PURPCLAW Runtime is the product.

The parity contract should be a real canonical contract, not just a design principle.

Call it:

purpclaw.surface-parity.v1

Every user-facing capability gets one canonical capability ID.

Examples:

session.open
session.resume
session.close

chat.send
chat.stream
chat.stop

mission.create
mission.open
mission.list
mission.pause
mission.resume
mission.cancel

process.inspect
process.pause
process.resume
process.cancel
process.retry

agent.list
agent.inspect
agent.invoke
agent.chat

skill.list
skill.inspect
skill.invoke

tool.list
tool.inspect
tool.invoke

provider.list
provider.configure
provider.test

model.list
model.select
model.test

memory.search
memory.inspect
memory.store
memory.forget

artifact.list
artifact.inspect
artifact.open
artifact.export

approval.list
approval.resolve

council.open
council.vote

studio.open
studio.session

voice.start
voice.stop

vision.capture
vision.inspect

system.health
system.services
system.logs

recovery.inspect
recovery.resume

settings.read
settings.update

Those IDs are product capabilities.

The UI implementation is irrelevant to their identity.

The parity registry then records for every capability:

capability_id
canonical API operation
required permission
required service
required provider/model capabilities
required hardware
CLI support
TUI support
Web support
Desktop support
Mobile support
presentation mode
offline capability
streaming capability
remote capability
restriction reason
fallback behaviour
test reference

A capability can have one of these surface states:

FULL

The surface exposes the complete capability.

VIEW_ONLY

The surface can inspect it but cannot mutate it.

REMOTE_ONLY

Available only when connected to the host runtime.

HOST_ONLY

Requires physical access to the host.

HARDWARE_DEPENDENT

Requires hardware available to that device.

UNSUPPORTED_BY_DESIGN

Deliberately unavailable with a documented reason.

Anything simply missing is a release defect.

That distinction matters.

For example, mobile might legitimately have:

filesystem.host.open = HOST_ONLY

But mobile should still be able to inspect the Artifact that came from that file.

Likewise:

vision.capture

could use the phone camera on Mobile and the webcam on Desktop.

Same capability ID.

Different hardware adapter.

Same process model.

Same resulting artifact/event.

PARITY INVARIANT 1

The same canonical object ID must mean the same thing everywhere.

mission_123 is mission_123 on CLI, TUI, Web, Desktop and Mobile.

process_456 is the same process.

approval_789 is the same approval.

artifact_abc is the same artifact.

No surface-local replacement IDs.

PARITY INVARIANT 2

State mutations happen in PURPCLAW Runtime.

Never inside the presentation layer.

The flow is always:

Surface
→ PURPCLAW Client SDK
→ PURPCLAW Gateway
→ Canonical Runtime
→ Event Spine
→ updated state
→ all connected surfaces

PARITY INVARIANT 3

All surfaces receive the same event vocabulary.

For example:

MissionCreated
ProcessStarted
AgentInvoked
ToolStarted
ToolCompleted
MemoryWritten
ApprovalRequested
ApprovalResolved
ArtifactCreated
ProcessFailed
ProcessRecovered
MissionCompleted

CLI may print one line.

TUI may update a panel.

Web may animate a card.

Desktop may send a native notification.

Mobile may generate a push notification.

Same event underneath.

PARITY INVARIANT 4

Every interface gets the same capability availability truth.

If Vision is unavailable because the service is down:

CLI says unavailable.

TUI says unavailable.

Web says unavailable.

Desktop says unavailable.

Mobile says unavailable for host vision, but may advertise device-camera vision if that adapter is available.

No interface gets to lie because its cached menu was built three weeks ago.

PARITY INVARIANT 5

Headline numbers come from registries.

Never from UI source.

Agent count.
Soul count.
Skill count.
Tool count.
Provider count.
Model count.
Service count.
Mission count.
Process count.

All queried from the runtime.

PARITY INVARIANT 6

Sessions are portable between surfaces.

A canonical session record contains:

session_id
user_id
started_at
current_mission
current_process
active_agent
conversation
working_context
connected_surfaces
connected_devices
last_activity
state

Each connection additionally has:

surface_id
surface_type
device_id
connection_id
permissions
last_seen

So one session can have:

CLI attached.
Web attached.
Mobile attached.

simultaneously.

PARITY INVARIANT 7

Conversation continuity belongs to the session, not the interface.

Start chatting in CLI.

Open Desktop.

The conversation is already there.

Send another message from Desktop.

CLI receives it.

Open Mobile an hour later.

Same thread.

No export/import nonsense between PURPCLAW clients.

PARITY INVARIANT 8

Mission continuity works identically.

Create mission in Web.

Inspect from CLI.

Approve from phone.

Watch process graph in TUI.

Open artifact in Desktop.

All operating on the same MissionRuntime.

PARITY INVARIANT 9

Errors have canonical identities.

Runtime errors use something like:

error_code
message
component
process_id
correlation_id
recoverable
retryable
user_action
details

Interfaces may render the error differently.

They may not invent different interpretations.

PARITY INVARIANT 10

Permissions are runtime-controlled.

A button disappearing is not security.

The mobile app, Web UI and CLI all submit the operation.

Gatekeeper decides whether it is allowed.

PARITY INVARIANT 11

Approvals are universal.

An ApprovalRequested generated because an agent wants to perform a dangerous action can be approved from any authorised first-class surface.

Approval from mobile resolves the same approval object waiting inside the CLI session.

PARITY INVARIANT 12

All clients use one generated Client SDK.

Conceptually:

@purpclaw/client

That SDK contains:

Runtime connection
Authentication
Sessions
Chat
Missions
Processes
Agents
Souls
Skills
Tools
Providers
Models
Memory
Artifacts
Approvals
Council
Studio
Voice
Vision
System health
Recovery
Settings
Event subscriptions

CLI uses it.

TUI uses it.

Web uses it.

Desktop uses it.

Mobile uses it.

No separate hand-written API layer per application.

PARITY INVARIANT 13

The Client SDK is generated from canonical contracts and API definitions wherever practical.

That gives us one compile-time vocabulary across the product.

If Mission changes, every surface knows.

If Process changes, every surface knows.

If Approval changes, every surface knows.

PARITY INVARIANT 14

Each surface is allowed to optimise presentation.

CLI:

Fastest.
Keyboard-first.
Scriptable.
Pipeable where appropriate.
Good for automation.

TUI:

Dense realtime operations console.
Keyboard-first.
Mission/process/agent dashboards.

Web:

Rich visual Mission Control.
Remote browser access.
Charts, timelines, graphs and inspection.

Desktop:

Web-level richness plus native filesystem, notification, camera, microphone and OS integration.

Mobile:

Remote command centre.
Chat.
Monitoring.
Approvals.
Mission control.
Notifications.
Camera/mic capabilities.
Emergency stop/control.

They are different interfaces.

They are not different products.

PARITY INVARIANT 15

Every release runs the Surface Parity Test Suite.

The exact same scenario is driven through all five clients.

Example test:

Create Mission M from CLI.

Assert M appears in TUI.

Assert M appears in Web.

Assert M appears in Desktop.

Assert M appears on Mobile.

Invoke agent from TUI.

Assert same Process ID everywhere.

Invoke tool from Web.

Assert same tool execution event everywhere.

Request approval.

Approve from Mobile.

Assert CLI sees resolution.

Generate artifact.

Open from Desktop.

Search memory from CLI.

Restart runtime.

Reconnect all surfaces.

Assert Mission, Process, Artifact, Approval and Memory state survives.

That becomes a hard release gate.

2. ONE-RUNTIME PACKAGING AND LAUNCH ARCHITECTURE

The installation should physically contain several programs, but logically expose one PURPCLAW.

Think of it like this:

PURPCLAW Launcher

controls

PURPCLAW Runtime

which controls

everything else.

The launcher is the executable installed as:

purpclaw

It should be a tiny, extremely reliable native/bootstrap executable.

Its job is not AI.

Its job is:

find installation
find PURPCLAW_HOME
read bootstrap config
locate runtime
check runtime health
start runtime if absent
recover runtime if unhealthy
attach requested client
perform update/repair/bootstrap operations

It should have as few dependencies as possible.

The launcher must survive even when the main runtime is broken.

Otherwise:

purpclaw doctor

would need the broken thing it is supposed to diagnose, which would be beautifully useless.

PACKAGE LAYOUT

Conceptually:

PURPCLAW/
bin/
purpclaw
purpclaw-runtime

runtime/
core application
service supervisor
canonical gateway
event spine
process runtime
mission runtime
workflow runtime
tool runtime
memory runtime
security runtime
recovery runtime

services/
service implementations

contracts/
canonical schemas

registries/
generated default registries

client/
canonical Client SDK

ui/
cli/
tui/
web/
desktop/
mobile-protocol-assets/

runtimes/
node/
python/

migrations/

assets/

defaults/

licenses/

Then outside the replaceable application installation:

PURPCLAW_HOME/
config/
secrets/
data/
memory/
models/
artifacts/
projects/
sessions/
runtime/
logs/
cache/
backups/
receipts/

Application code and user brain/state never live in the same lifecycle.

Upgrade application:

safe.

Delete cache:

safe.

Delete user memory accidentally:

absolutely fucking not.

THE ONE BACKGROUND RUNTIME

The main daemon becomes something conceptually called:

purpclaw-runtime

Only one may own a PURPCLAW_HOME.

It creates a runtime lock containing:

runtime_id
pid
version
started_at
host
API endpoint
event endpoint
health endpoint

A second launcher sees that lock.

It verifies the process.

If healthy:

attach.

It does not launch another runtime.

If lock exists but process is dead:

clean stale lock.
recover.
start runtime.

If process exists but wrong version:

perform compatibility handling.

THE RUNTIME ITSELF OWNS THE SERVICE SUPERVISOR

The service topology becomes:

purpclaw-runtime
|

* event spine
* configuration
* secrets interface
* state
* security/gatekeeper
* ToolRuntime
* ProcessRuntime
* WorkflowRuntime
* MissionRuntime
* Memory
* Agent organisation
* Client Gateway
  |
* supervised child services

The current 26-service catalogue sits underneath the supervisor.

The verified core profile is the normal boot requirement.

Optional services remain dormant until demanded.

STARTUP PHASE 0

User executes:

purpclaw

Launcher resolves installation.

Launcher resolves PURPCLAW_HOME.

Launcher verifies that installation metadata is readable.

STARTUP PHASE 1

Launcher looks for runtime.

If runtime healthy:

skip directly to client attach.

This is the normal fast path.

STARTUP PHASE 2

If absent:

start purpclaw-runtime.

Runtime takes the exclusive installation lock.

STARTUP PHASE 3

Runtime loads:

version
configuration
secret references
installed-system manifest
registries
migration state

STARTUP PHASE 4

Runtime checks for unclean previous shutdown.

If found:

load recovery state.

Do not silently execute recoverable dangerous processes.

Mark them appropriately.

STARTUP PHASE 5

Start foundational runtime systems:

Event Spine.
State.
Audit.
Security.
Recovery.
ProcessRuntime.

STARTUP PHASE 6

Start verified CORE_PROFILE services in dependency order.

Do not launch 26 processes because the product happens to know about 26 services.

Only required core services start.

Health checks determine readiness.

STARTUP PHASE 7

Load:

divisions
agents
souls
agent/soul mappings
skills
tools
providers
models

STARTUP PHASE 8

Start:

MemoryRuntime.
WorkflowRuntime.
MissionRuntime.
ToolRuntime integration.
MCP connections that should remain resident.

Optional MCP can also be demand-driven later.

STARTUP PHASE 9

Gateway becomes READY.

At this point the launcher can attach a client.

The gateway exposes one local endpoint.

Prefer IPC/local sockets where practical for local clients.

For example:

Windows named pipe

\.\pipe\purpclaw

Unix domain socket

$PURPCLAW_HOME/runtime/purpclaw.sock

HTTP/WebSocket may run behind the Gateway for browser/remote clients.

Local applications should not need arbitrary service ports.

THE SERVICE PORTS BECOME INTERNAL

This is important.

Voice can internally use 7781.

Vision can internally use 7788.

Gatekeeper can internally use 7791.

Cowork can internally use 7793.

But clients do not need to know that.

Client:

gateway.voice.start()

Gateway routes to the correct backend.

That lets us change service topology later without breaking every UI.

CLI LAUNCH

User:

purpclaw

Equivalent internal behaviour:

ensure-runtime
open CLI
attach session

The CLI is part of the foreground launcher process or starts as a lightweight client.

Closing it detaches the surface.

It does not necessarily kill the runtime.

TUI LAUNCH

User:

purpclaw tui

Launcher ensures runtime.

Starts TUI client.

TUI calls the same Client SDK.

Same session can be resumed.

WEB LAUNCH

User:

purpclaw web

Launcher ensures runtime.

Runtime ensures the Web frontend endpoint is available.

Browser opens something like:

localhost:<gateway>/app

The browser communicates with Gateway.

Not internal services.

DESKTOP LAUNCH

Clicking the PURPCLAW desktop icon should be semantically identical to:

purpclaw app

The desktop shell asks the launcher/bootstrap layer to ensure the runtime.

Then attaches.

It never starts its own backend.

If CLI already has PURPCLAW running:

Desktop appears instantly.

MOBILE LAUNCH

Mobile is remote, so it cannot locally invoke the host launcher.

Instead its pairing record contains a trusted runtime identity.

Mobile:

find paired runtime
authenticate device
negotiate protocol
attach session

It still uses the same Client SDK contract.

A mobile-specific transport adapter can tunnel that SDK over HTTPS/WebSocket.

SINGLE-INSTANCE RULE

One PURPCLAW_HOME equals one authoritative runtime.

You may have:

three terminals
TUI
two browser tabs
desktop app
phone
tablet

all connected simultaneously.

Still one runtime.

FIRST BOOT IS DIFFERENT

If launcher finds:

installation_state != COMPLETE

then:

purpclaw

starts bootstrap instead of normal chat.

First boot owns setup for the entire installation.

Not “CLI setup.”

PURPCLAW setup.

It configures the runtime that all future clients use.

Therefore when setup finishes:

CLI ready.
TUI ready.
Web ready.
Desktop ready.
Mobile pairing ready.

No separate Web setup wizard later.

No separate desktop provider configuration later.

No second mobile account configuration pretending it has another brain.

ONE SETTINGS STORE

Change default model from Mobile.

Runtime stores it.

CLI immediately sees new default.

Change voice preference in Desktop.

Runtime stores it.

Web sees it.

Disable a dangerous tool in CLI.

It disappears everywhere.

ONE NOTIFICATION SYSTEM

Runtime owns Notification records/events.

Surfaces subscribe according to preferences.

CLI:

terminal message.

TUI:

banner.

Web:

toast.

Desktop:

native OS notification.

Mobile:

push.

ONE CONNECTION STATUS

Each client shows two different things:

Runtime health.

Surface connection health.

That distinction prevents nonsense like:

“PURPCLAW is offline”

when only the browser lost its WebSocket for two seconds.

ONE VERSION NEGOTIATION SYSTEM

Clients send:

client_type
client_version
protocol_version

Runtime responds with compatibility information.

Desktop installed with runtime always normally matches.

Browser assets served by runtime inherently match.

CLI/TUI installed together match.

Mobile may lag because app stores enjoy bureaucracy.

So Mobile declares supported protocol range.

If runtime has moved beyond it, Mobile gives a clean upgrade-required message rather than failing halfway through a mission.

BACKGROUND POLICY

Default installation should support:

START_ON_DEMAND

Typing purpclaw starts the runtime.

Closing the last surface leaves the runtime alive for a configurable idle period if missions or background processes are active.

If nothing is active, runtime may sleep according to user policy.

Other modes:

ALWAYS_ON

Useful for phone access, automation, Telegram and scheduled jobs.

SESSION_ONLY

Runtime stops when last local client disconnects and no processes require persistence.

The important bit:

The user chooses product behaviour.

Services do not each invent their own lifetime.

CAPABILITY WAKE

Suppose user says:

“Use my camera and tell me what’s on the desk.”

Runtime resolves required capabilities.

Vision requires Vision service.

Potentially YOLO.

Supervisor wakes them.

Health verifies.

Process runs.

When idle timeout passes:

Supervisor sleeps them.

Same for:

STT.
TTS.
Avatar.
Cowork.
Telegram.
Research.
Heavy local model workers.

ONE SHUTDOWN

purpclaw shutdown

means:

stop accepting new jobs
resolve active-job policy
checkpoint resumable processes
flush memory
flush event queues
flush audit
finish artifact hashes
persist sessions
emit SessionEnd
stop optional services
stop core services
release runtime lock
exit

Closing a UI means:

detach this surface

not:

murder the organisation.

ONE DOCTOR

purpclaw doctor

must operate primarily through bootstrap-level diagnostics so it works even if the main daemon does not.

It checks:

installation integrity
runtime binary
config
permissions
storage
ports
runtime lock
service dependencies
provider configuration
secrets availability
datastores
memory
models
MCP
UI assets
client versions

ONE UPDATE PIPELINE

purpclaw update

Launcher performs it.

Runtime coordinates graceful stop.

Updater installs a signed package.

Runs migrations.

Boots new runtime.

Performs health tests.

If successful:

commit.

If unsuccessful:

rollback.

CLI, TUI, Web and Desktop therefore update as one versioned product.

Mobile remains separately distributed but protocol-versioned against it.

THE RELEASE PACKAGE SHOULD ULTIMATELY FEEL LIKE THIS

Download PURPCLAW.

Install.

Open terminal.

Type:

purpclaw

First boot configures the machine and starts the organisation.

From then on the user can freely move between:

purpclaw

purpclaw tui

purpclaw web

purpclaw app

and their paired PURPCLAW Mobile application.

There is no “CLI PURPCLAW,” “Web PURPCLAW,” “Desktop PURPCLAW” and “Mobile PURPCLAW.”

There is only PURPCLAW.

The rest are windows.

That architectural rule should become a release blocker because it prevents nearly every kind of drift already uncovered during discovery: duplicated counts, duplicated workflows, private configuration, hard-coded ports, competing mission models and frontend/backend disagreement.

One runtime.
One truth.
One session universe.
One organisation.
Five first-class surfaces.
One command at the root of the whole bloody circus:

purpclaw

Continue exploring:

* Define the canonical capability registry schema
* Specify the unified event and session contracts
