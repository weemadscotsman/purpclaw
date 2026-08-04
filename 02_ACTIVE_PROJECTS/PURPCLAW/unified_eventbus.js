'use strict';

/**
 * unified_eventbus.js — PURPCLAW Pub/Sub Event Bus
 * Port: 7782
 *
 * Provides: POST /publish, GET /channels, GET /health
 * In-process pub/sub with HTTP endpoint for cross-process fan-out.
 */

const http = require('http');

const PORT = 7782;
const subscribers = new Map();

function publish(channel, payload) {
  const event = { channel, payload, ts: new Date().toISOString() };
  const handlers = subscribers.get(channel) || [];
  handlers.forEach(fn => { try { fn(event); } catch {} });
  (subscribers.get('*') || []).forEach(fn => { try { fn(event); } catch {} });
}

function subscribe(channel, handler) {
  if (!subscribers.has(channel)) subscribers.set(channel, []);
  subscribers.get(channel).push(handler);
  return () => subscribers.set(channel, (subscribers.get(channel) || []).filter(x => x !== handler));
}

const server = http.createServer((req, res) => {
  const pathname = require('url').parse(req.url).pathname;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    if (pathname === '/publish' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { channel, payload } = JSON.parse(body);
          publish(channel, payload);
          res.end(JSON.stringify({ ok: true, channel }));
        } catch { res.writeHead(400); res.end('{"error":"bad json"}'); }
      });
    } else if (pathname === '/channels' && req.method === 'GET') {
      res.end(JSON.stringify({ channels: [...subscribers.keys()] }));
    } else if (pathname === '/health' && req.method === 'GET') {
      res.end(JSON.stringify({ service: 'eventbus', port: PORT }));
    } else { res.writeHead(404); res.end('{"error":"not found"}'); }
  } catch { res.writeHead(500); res.end('{"error":"server error"}'); }
});

// Bind the port only when run as a service. This file is also imported as a
// library — lib/event-bus.js proxies to it, and lib/usage-governor.js pulls
// that in, which drags the whole agent-gateway chain along. Listening at
// import time meant every process that touched usage-governor tried to bind
// 7782, so the real eventbus lost the race and restart-looped 543 times with
// EADDRINUSE. Importers still get in-process publish/subscribe; for
// cross-process fan-out use lib/events.js, which speaks HTTP to whichever
// process actually owns the port.
if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log('[EVENTBUS] listening on 127.0.0.1:' + PORT);
  });
}

module.exports = { publish, subscribe, server, PORT };
