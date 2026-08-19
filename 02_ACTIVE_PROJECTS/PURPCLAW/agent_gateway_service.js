'use strict';
/**
 * agent_gateway_service.js — launches the A2A Agent Gateway as a standalone
 * service (PM2: purpclaw-a2a). The server class (lib/agent-gateway-server.js)
 * was in the tree but nothing started it after the build replacement dropped
 * its ecosystem entry. This is the thin, honest launcher: canonical port,
 * loopback bind, clean shutdown.
 *
 * Port comes from the canonical registry (lib/runtime/ports.js A2A_GATEWAY),
 * never a literal — contract §10 (ports from one registry). Override with
 * PURPCLAW_A2A_GATEWAY_PORT.
 */
const { PORTS } = require('./lib/runtime/ports');
const { AgentGatewayServer } = require('./lib/agent-gateway-server');

const host = process.env.PURPCLAW_A2A_HOST || '127.0.0.1';
const port = PORTS.A2A_GATEWAY;

const server = new AgentGatewayServer({ host, port });

server.listen()
  .then(addr => {
    console.log(`[a2a-gateway] listening on http://${addr.address}:${addr.port}`);
    console.log(`[a2a-gateway] agent-card: http://${addr.address}:${addr.port}/.well-known/agent-card.json`);
  })
  .catch(err => {
    console.error(`[a2a-gateway] failed to start: ${err.message}`);
    process.exit(1);
  });

function shutdown(sig) {
  console.log(`[a2a-gateway] ${sig} — shutting down`);
  try { server.server?.close(); } catch {}
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
