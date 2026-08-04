# 35 — Google Agent Starter Pack

**Tier:** 3 (Specialized)
**Vendor:** Google
**License:** Apache 2.0
**Initial release:** Q4 2025
**Last major update:** Q1 2026

---

## What it is
A production-hardened scaffold for deploying agents to Google Cloud (Vertex AI Agent Engine). Wraps the Google Agent Development Kit (ADK) + Agent Engine + Cloud Run + Firestore session storage + BigQuery observability into a deployable template. Saves teams from rebuilding the same "production agent runtime" over and over.

## Core capabilities
- [x] Pre-wired CI/CD for agent deployment
- [x] Cloud Run service template
- [x] Firestore session store integration
- [x] BigQuery observability pipeline
- [x] Vertex AI Agent Engine runtime
- [x] Identity and access management templates
- [x] Terraform infrastructure-as-code
- [x] CI/CD with Cloud Build
- [x] A2A protocol client integration
- [x] Frontend template (React chat UI)

## Architecture
```
Source code → Cloud Build → Artifact Registry
                                       ↓
                              Agent Engine (Vertex AI)
                                       ↓
                          [Agent runtime: ADK + sessions]
                                       ↓
                  Firestore (state) + BigQuery (traces)
```
- Reproducible infrastructure via Terraform
- Agent Engine handles scaling, sessions, observability
- All GCP-native

## Strengths
- Removes weeks of production plumbing
- Best-in-class if you're already on GCP
- Tight Vertex AI integration
- A2A-ready

## Weaknesses
- GCP lock-in (Terraform, Cloud Build, Agent Engine)
- Adds a layer of abstraction over ADK
- ADK itself is younger than LangGraph / OpenAI Agents
- No portable deployment (can't run on-prem)
- Costs scale with Agent Engine usage

## Best use case
Teams committed to GCP who need agents in production fast. Mid-large enterprises with existing BigQuery / Cloud Run infrastructure.

## PURPCLAW fit: 2/10 (Tier D)
- **Not applicable.** PURPCLAW runs locally on a single machine. The cloud-native Agent Engine deployment is the opposite model.
- **Patterns to borrow:** the "scaffold that removes production plumbing" idea — apply to our own `safe-start` and `bin/purpclaw.js` onboarding.
- **Action:** none. Skip.

## Integration sketch (concept)
- Reference only. The pattern of "one-command deploy to managed runtime" is something PURPCLAW's `bin/purpclaw.js deploy` could aspire to, but with a self-hosted target (e.g. systemd + nginx, or a Docker image).

## PURPCLAW parity
| Google Agent Starter Pack concept | PURPCLAW equivalent |
|---|---|
| CI/CD template | `bin/purpclaw.js` (CLI entrypoint) |
| Cloud Run runtime | `lib/api-harness-kernel.js` (process supervisor) |
| Firestore sessions | `lib/session-store.js` (JSON files) |
| BigQuery observability | `lib/agent-health.js` + `lib/drift-watcher.js` |
| Terraform | none — gap (PURPCLAW is single-machine) |

## Sources
- https://github.com/GoogleCloudPlatform/agent-starter-pack
- Google Cloud blog Q4 2025
- Vertex AI Agent Engine docs
