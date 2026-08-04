# Security Policy

> Version source: `package.json` · Updated: 2026-08-04 · Status: CURRENT

Security fixes target the active package release and supported default branch. Archived snapshots are unsupported unless a maintainer explicitly accepts them.

## Report a Vulnerability

Do not open a public issue containing an exploit, credential, private path, personal data or reproduction artifact with secrets. Use GitHub's private security-advisory flow for `weemadscotsman/purpclaw`. Include affected commit or package version, impact, minimal reproduction and suggested mitigation when available.

## Runtime Safety Model

- External network binding is opt-in; operator surfaces default to loopback.
- Mutating routes and tools require operator authentication and policy evaluation.
- CLI, HTTP and MCP must converge on canonical ToolRuntime permission enforcement.
- Raw shell execution must not bypass caller identity, policy, decision or audit context.
- Direct file mutations may receive checkpoints; shell mutations are not guaranteed reversible.
- Delegated children use restricted tools by default, but this is not an OS sandbox.
- Concurrent write-capable agents require registered temporary isolation and explicit path ownership.
- Secrets belong in `.env` or approved secret stores, never docs, prompts, logs, registries, screenshots or commits.
- Provider-routing evidence must not expose credentials.
- Optional computer-control, messaging, voice and evolution lanes stay disabled until configured and reviewed.

Current code, policy tests, probes and proof evidence outrank prose.
