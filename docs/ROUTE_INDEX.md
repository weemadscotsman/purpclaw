# Route Index

Last verified: 2026-06-19

This is the route map for the Next.js cockpit in `app/`.

## UI Pages

| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Root; redirects to `/mission` |
| `/abliterator` | `app/abliterator/page.tsx` | Redact/purge/forget UI |
| `/agents` | `app/agents/page.tsx` | Agent view |
| `/bridge` | `app/bridge/page.tsx` | Bridge UI |
| `/cockpit` | `app/cockpit/page.tsx` | Cockpit view |
| `/dash` | `app/dash/page.tsx` | Dashboard view |
| `/evolution` | `app/evolution/page.tsx` | Self-evolution controls |
| `/frameworks` | `app/frameworks/page.tsx` | AI agent framework landscape and pattern atlas |
| `/inline` | `app/inline/page.tsx` | Inline UI |
| `/memory` | `app/memory/page.tsx` | Memory recall and weave UI |
| `/mission` | `app/mission/page.tsx` | Main Mission Control cockpit |
| `/mission/harness` | `app/mission/harness/page.tsx` | Harness UI |
| `/mochi` | `app/mochi/page.tsx` | Mochi UI |
| `/omni` | `app/omni/page.tsx` | OMNI cockpit |
| `/pipeline` | `app/pipeline/page.tsx` | Pipeline view |
| `/preprompt` | `app/preprompt/page.tsx` | Preprompt editor |
| `/providers` | `app/providers/page.tsx` | Provider UI |
| `/settings` | `app/settings/page.tsx` | Settings UI |
| `/skyscraper` | `app/skyscraper/page.tsx` | Skyscraper UI |
| `/spine` | `app/spine/page.tsx` | Control-plane truth board for pipeline, proof ledger, and output vault |
| `/swarm` | `app/swarm/page.tsx` | Swarm UI |
| `/system-map` | `app/system-map/page.tsx` | Live system map and 3D stack |
| `/ui` | `app/ui/route.ts` | UI route adapter |
| `/ui/[...path]` | `app/ui/[...path]/route.ts` | UI catch-all adapter |

Archived pages under `app/_archive/` are not active navigation targets.

## API Routes

| Route | Methods | Owner/Purpose |
|---|---|---|
| `/api/agent-scores` | GET | Agent score data |
| `/api/api-mega-list` | GET, POST | API list/search adapter |
| `/api/benchmark/odysseus` | GET | Odysseus scorecard adapter |
| `/api/bridge` | GET, POST | Bridge operations |
| `/api/chat` | GET, POST | Main chat route |
| `/api/chat/swarm` | GET, POST | Swarm chat route |
| `/api/computer-use` | GET, POST | Computer-use route, mutating POST is operator-gated |
| `/api/delegation/status` | GET | Delegation board status adapter |
| `/api/discover` | GET, POST | Discovery route |
| `/api/event-timeline` | GET | Event timeline |
| `/api/evolution/status` | GET | Self-evolution status adapter |
| `/api/eventbus/stream` | GET, HEAD | Same-origin EventBus stream adapter |
| `/api/gatekeeper-status` | GET, POST | Gatekeeper status/actions |
| `/api/governance/policy` | GET, POST | Governance policy read/write, mutating POST is operator-gated |
| `/api/harness/start` | POST, OPTIONS | Harness mission start |
| `/api/harness/status` | GET, OPTIONS | Harness status |
| `/api/harness/missions` | GET, OPTIONS | Harness mission list |
| `/api/harness/missions/[id]` | GET, OPTIONS | Harness mission detail |
| `/api/harness/missions/[id]/abort` | POST, OPTIONS | Harness mission abort |
| `/api/harness/missions/[id]/stream` | GET, OPTIONS | Harness mission stream |
| `/api/harness-benchmarks` | GET | Harness benchmark list |
| `/api/heartbeat` | GET | Cockpit heartbeat |
| `/api/host-telemetry` | GET | Host CPU/memory/process telemetry |
| `/api/internal/check` | GET, POST | Internal check route |
| `/api/kernel/jobs` | GET, POST | Kernel job list/create, mutating POST is operator-gated |
| `/api/kernel/jobs/[id]` | GET | Kernel job detail |
| `/api/llm/plan` | POST | LLM planning route |
| `/api/llm-config` | GET | LLM config |
| `/api/llm-ledger` | GET | LLM ledger |
| `/api/llm-status` | GET | LLM/provider status |
| `/api/logs/stream` | GET, HEAD | Same-origin log stream adapter |
| `/api/manifest` | GET | Manifest |
| `/api/mission-data` | GET | Mission cockpit aggregate data |
| `/api/mochi` | GET, POST | Mochi state/actions |
| `/api/mochi-action` | POST | Mochi action route |
| `/api/models` | GET, POST | Model list/config |
| `/api/ollama` | GET, POST | Ollama route, mutating POST is operator-gated |
| `/api/omni/patch/review` | GET | OMNI patch review |
| `/api/omni/providers` | GET | OMNI provider integrity |
| `/api/omni/registry` | GET | OMNI feature registry |
| `/api/omni/scan` | GET | OMNI truth scan |
| `/api/omni/status` | GET | OMNI combined status |
| `/api/omnicode/status` | GET | OmniCode bridge status adapter |
| `/api/orchestrate` | GET, POST | Orchestration route, mutating POST is operator-gated |
| `/api/output` | GET, POST | Output vault proxy for artifacts and approval/archive/register actions |
| `/api/personality` | GET, POST | Personality settings, mutating POST is operator-gated |
| `/api/pipeline` | GET, POST | Pipeline spine proxy for live health, jobs, and start/stop controls |
| `/api/playwright` | GET, POST | Playwright route |
| `/api/preprompt` | GET, POST | Preprompt read/write, mutating POST is operator-gated |
| `/api/proof` | GET | Proof ledger proxy for evidence rows and truth stats |
| `/api/providers` | GET, POST | Provider list/config |
| `/api/registry` | GET | Registry view |
| `/api/research/group` | GET, POST | Group research route |
| `/api/sampler` | GET | Sampler status/data |
| `/api/service-proxy` | GET, POST, PATCH, DELETE, OPTIONS | Service-boundary proxy; do not use for same-origin Next routes |
| `/api/sessions` | GET, POST | Chat session list/save |
| `/api/sessions/[id]` | GET, PATCH, DELETE | Chat session load/rename/delete |
| `/api/services` | GET | Service registry/status |
| `/api/settings` | GET, POST | Settings, mutating POST is operator-gated |
| `/api/setup` | GET, POST | Setup route |
| `/api/skill-amendments` | GET | Skill amendments |
| `/api/thringlets` | GET, OPTIONS | Thringlet list |
| `/api/thringlets/[id]` | GET, OPTIONS | Thringlet detail |
| `/api/thringlets/[id]/interact` | POST, OPTIONS | Thringlet interaction |
| `/api/thringlets/colony-mood` | GET, OPTIONS | Thringlet mood |
| `/api/tower/stream` | GET, HEAD | Same-origin tower stream adapter |
| `/api/trace/recent` | GET, POST | Recent trace events and trace write endpoint |
| `/api/trace/stream` | GET | Live normalized trace stream |
| `/api/upload` | GET, POST | Upload route |
| `/api/voice/chat` | GET, POST | Voice chat route |
| `/api/voice-command` | POST | Voice command route, mutating POST is operator-gated |
| `/api/whoami` | GET, POST | Identity route |
| `/api/stack-whoami` | GET | Full stack identity/capability summary |
| `/api/spine-health` | GET | Cognitive spine health proxy |
| `/api/pulse` | GET | Live stack heartbeat / notifications feed |
| `/api/yo` | GET | Liveness ping |

## Update Rule

Whenever a route is added, removed, renamed, or changes from read-only to
mutating, update this file in the same change.
