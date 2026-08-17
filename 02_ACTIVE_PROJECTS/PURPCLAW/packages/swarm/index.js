'use strict';

/**
 * @purpclaw/swarm — public entry point
 *
 * Re-exports the dispatcher surface.
 *
 * Parity targets closed by this package:
 *   - Kimi Agent Swarm (300 sub-agents)         — we certify 2-3, lane is open
 *   - Antigravity 2.0 Manager View (5 parallel) — we certify parallel dispatch
 *   - Claude Code Task tool (subagents inline)  — we certify persona-resolved dispatch
 *   - DeepSeek Harness team coordination       — first-cut sub-agent factory
 *   - Hermes Harness                            — JSON output first-class (SwarmReport)
 *   - ChatGPT app custom agents                 — registry-driven, not hardcoded
 *   - Kimi CLI MCP                              — adapter layer (future)
 *
 * See dispatcher.js for honest scope. See agent_work/cert_gates/swarm/CONTRACT.md
 * for the cert contract. The cert is the proof, not this doc.
 */

const dispatcher = require('./dispatcher');

module.exports = {
  dispatch: dispatcher.dispatch,
  resolvePersona: dispatcher.resolvePersona,
  defaultSubAgentFactory: dispatcher.defaultSubAgentFactory,
};
