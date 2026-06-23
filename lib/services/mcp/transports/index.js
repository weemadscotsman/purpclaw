'use strict';
/**
 * lib/services/mcp/transports/index.js
 *
 * Transport factory — re-exports all transports so callers can do:
 *   const { transports } = require('../services/mcp');
 *   const handler = transports.streamableHttp().createStreamableHttpHandler(server, opts);
 */

module.exports = {
  streamableHttp: () => require('./streamable-http'),
  sse:            () => require('./sse'),
  stdio:          () => require('./stdio'),
};
