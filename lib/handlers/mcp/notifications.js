'use strict';
/**
 * lib/handlers/mcp/notifications.js — Notification dispatch.
 *
 * Notifications are JSON-RPC 2.0 messages that have no `id`, so
 * they don't get a response. MCP uses them for:
 *
 *   - server → client: tools/list_changed, resources/list_changed,
 *     resources/updated, prompts/list_changed, progress, message
 *   - client → server: initialized, cancelled, progress, message,
 *     roots/list_changed
 *
 * This module centralizes how those notifications are built and
 * dispatched so transports don't reinvent the framing.
 *
 * 🌵 CACTUS — every helper is one-liner; the heavy lifting is in the
 * transport's outbound channel.
 */

const { notification } = require('../../services/mcp/jsonrpc');

// ── server → client ─────────────────────────────────────────────────────

const serverToClient = {
  toolsListChanged:      () => notification('notifications/tools/list_changed', {}),
  resourcesListChanged:  () => notification('notifications/resources/list_changed', {}),
  promptsListChanged:    () => notification('notifications/prompts/list_changed', {}),
  resourceUpdated:       (uri) => notification('notifications/resources/updated', { uri }),
  rootsListChanged:      () => notification('notifications/roots/list_changed', {}),
  progress:              (progressToken, progress, extra = {}) =>
    notification('notifications/progress', { progressToken, progress, ...extra }),
  logMessage:            (level, data, logger) =>
    notification('notifications/message', { level, data, logger }),
};

// ── client → server ─────────────────────────────────────────────────────

const clientToServer = {
  initialized:     () => notification('notifications/initialized', {}),
  cancelled:       (requestId, reason) => notification('notifications/cancelled', { requestId, reason }),
  progress:        (progressToken, progress, extra = {}) =>
    notification('notifications/progress', { progressToken, progress, ...extra }),
  logMessage:      (level, data, logger) =>
    notification('notifications/message', { level, data, logger }),
  rootsListChanged:() => notification('notifications/roots/list_changed', {}),
};

/**
 * Broadcast a server-to-client notification to every ready session.
 * Returns the number of sessions the notification was delivered to.
 *
 * @param {object} server - McpServer
 * @param {string} kind   - one of: toolsListChanged | resourcesListChanged | promptsListChanged | resourceUpdated | rootsListChanged | progress | logMessage
 * @param {...any} args   - forwarded to the builder
 */
function broadcast(server, kind, ...args) {
  const builder = serverToClient[kind];
  if (!builder) throw new Error(`unknown notification kind: ${kind}`);
  const msg = builder(...args);
  return server.broadcast(msg);
}

/**
 * Send a notification to a single session. Returns true if the
 * session's transport accepted the message.
 */
function sendToSession(session, kind, ...args) {
  const builder = serverToClient[kind];
  if (!builder) throw new Error(`unknown notification kind: ${kind}`);
  return session.notify(builder(...args).method, builder(...args).params);
}

module.exports = {
  serverToClient,
  clientToServer,
  broadcast,
  sendToSession,
};
