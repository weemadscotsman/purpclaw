# `config/` Agent Notes

`config/` stores operator-facing static config. Runtime ports and PM2 service definitions live elsewhere.

## Ownership

- Use `service_registry.js`, `ecosystem.config.js`, and `lib/runtime/ports.js` for service identity and port truth.
- Use `model_registry.json`, `agent_routing_matrix.js`, and provider modules for model/provider routing.
- Do not hardcode service or route names here unless a runtime reader consumes this folder.

## Rules

- Config docs must distinguish desired state from live state.
- Secrets belong in environment variables, never committed config.
- Any new config key needs a reader and a validation path.
