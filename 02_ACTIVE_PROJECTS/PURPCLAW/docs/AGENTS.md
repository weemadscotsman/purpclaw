# Documentation Working Rules

Last updated: 2026-07-16.

For documentation tasks, read `AGENT.md`, this file, `docs/INDEX.md`, and the
relevant current source or registry before editing.

## Rules

- Running code and probes outrank documentation.
- Use `public/showcase/truth-manifest.json` for generated counts.
- Run `npm run docs:sync` instead of hand-editing generated route/service/catalog rows.
- Preserve dated audits and historical evidence; classify them rather than rewriting
  their original observations as current facts.
- Keep translations and imported reference packs unchanged unless the task explicitly
  requests translation or vendor/reference maintenance.
- Separate registered, executable, proof-backed, configured, PM2-defined, and healthy.
- Never publish credentials, private operator data, or machine-specific secrets.

Validate with `npm run docs:check` and `npm run truth:check`.
