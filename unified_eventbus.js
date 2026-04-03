/**
 * PURPCLAW UNIFIED EVENT BUS v1.0
 * Central pub/sub server for cross-system communication
 * 
 * Port: 7782
 * 
 * Topics:
 *   - agent.* (spawned, completed, failed, message)
 *   - system.* (health, error, startup, shutdown)
 *   - voice.* (command, response)
 *   - tool.* (called, result)
 *   - swarm.* (task_assigned, task_done, delegation)
 * 
 * API:
 *   GET  /events/:topic     - SSE stream for topic pattern
 *   POST /publish           - Publish an event
 *   GET  /state             - Get current state snapshot
 *   GET  /health            - Health check
 */

const http = require('http');
const url = require('url');

const EVENTBUS_PORT = 7782;
const MAX_EVENTS = 1000;

const state = {
  events: [],
  subscriptions: new Map(),
  clientCount: 0,
  startTime: new Date().toISOString()
};

const TOPIC_PATTERNS = [
  'agent.spawned',
  'agent.completed', 
  'agent.failed',
  'agent.message',
  'agent.killed',
  'team.spawned',
  'team.completed',
  'team.disbanded',
  'system.startup',
  'system.shutdown',
  'system.error',
  'system.health',
  'voice.command',
  'voice.response',
  'tool.called',
  'tool.result',
  'swarm.task.assigned',
  'swarm.task.done',
  'swarm.delegation'
];

function log(msg) {
  const ts = new Date().toISOString().split('T')[1].slice(0, -1);
  console.log(`[EVENTBUS] ${ts} | ${msg}`);
}

function addEvent(event) {
  const fullEvent = {
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  };
  
  state.events.push(fullEvent);
  if (state.events.length > MAX_EVENTS) {
    state.events = state.events.slice(-MAX_EVENTS);
  }
  
  broadcastToSubscribers(fullEvent);
  return fullEvent;
}

function broadcastToSubscribers(event) {
  const eventTopic = event.topic || event.type;
  
  for (const [clientId, subscription] of state.subscriptions) {
    if (matchesTopic(eventTopic, subscription.pattern)) {
      try {
        subscription.response.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch (e) {
        log(`Broadcast error to ${clientId}: ${e.message}`);
      }
    }
  }
}

function matchesTopic(eventTopic, pattern) {
  if (pattern === '*' || pattern === '*.*') return true;
  
  const eventParts = eventTopic.split('.');
  const patternParts = pattern.split('.');
  
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === '*') continue;
    if (patternParts[i] !== eventParts[i]) return false;
  }
  return true;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function setupServer() {
  const server = http.createServer(async (req, res) => {
    const pathname = url.parse(req.url).pathname;
    const method = req.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    try {
      // GET /health
      if (pathname === '/health' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), eventCount: state.events.length, subscriberCount: state.subscriptions.size, clientCount: state.clientCount }));
        return;
      }

      // GET /state
      if (pathname === '/state' && method === 'GET') {
        sendJson(res, 200, {
          eventCount: state.events.length,
          subscriberCount: state.subscriptions.size,
          clientCount: state.clientCount,
          topics: TOPIC_PATTERNS,
          startTime: state.startTime,
          recentEvents: state.events.slice(-50)
        });
        return;
      }

      // GET /events/:topic (SSE)
      if (pathname.startsWith('/events/') && method === 'GET') {
        const pattern = pathname.slice('/events/'.length);
        const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        
        log(`SSE client connected: ${clientId} pattern=${pattern}`);
        state.clientCount++;

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });

        const subscription = { pattern, response: res, clientId };
        state.subscriptions.set(clientId, subscription);

        res.on('close', () => {
          log(`SSE client disconnected: ${clientId}`);
          state.subscriptions.delete(clientId);
          state.clientCount--;
        });

        res.write(`: connected\n\n`);
        
        const recentEvents = state.events.filter(e => matchesTopic(e.topic || e.type, pattern));
        for (const event of recentEvents.slice(-20)) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        return;
      }

      // POST /publish
      if (pathname === '/publish' && method === 'POST') {
        const body = await parseBody(req);
        
        if (!body.topic && !body.type) {
          return sendJson(res, 400, { error: 'Missing topic or type' });
        }

        const event = addEvent(body);
        log(`Published: ${body.topic || body.type}`);
        sendJson(res, 200, { ok: true, event });
        return;
      }

      // GET /topics
      if (pathname === '/topics' && method === 'GET') {
        sendJson(res, 200, { topics: TOPIC_PATTERNS });
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (e) {
      log(`Error: ${e.message}`);
      sendJson(res, 500, { error: e.message });
    }
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      log(`Port ${EVENTBUS_PORT} in use - another eventbus may be running`);
    } else {
      log(`Server error: ${e.message}`);
    }
  });

  return server;
}

function publish(topic, data = {}) {
  return addEvent({ topic, ...data });
}

let server = null;

function startServer() {
  if (server) return server;
  server = setupServer();
  server.listen(EVENTBUS_PORT, () => {
    log(`═══════════════════════════════════════════════`);
    log(`PURPCLAW Unified Event Bus`);
    log(`═══════════════════════════════════════════════`);
    log(`Port: ${EVENTBUS_PORT}`);
    log(`Topics: ${TOPIC_PATTERNS.length} defined`);
    log(`═══════════════════════════════════════════════`);
    log(`Ready for subscriptions and publishing`);
    
    publish('system.startup', { service: 'eventbus', port: EVENTBUS_PORT });
  });
  return server;
}

if (require.main === module) {
  startServer();
  
  process.on('SIGINT', () => {
    log('Shutting down...');
    publish('system.shutdown', { service: 'eventbus' });
    setTimeout(() => process.exit(0), 500);
  });
}

module.exports = { startServer, publish, addEvent, TOPIC_PATTERNS };
