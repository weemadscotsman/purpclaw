/**
 * PURPCLAW UNIFIED STATE STORE v1.0
 * Central state store for cross-system communication
 * 
 * Port: 7783
 * 
 * State namespaces:
 *   - agents: { [agentId]: { status, task, division, startTime, ... } }
 *   - teams: { [teamId]: { members, status, task, ... } }
 *   - tools: { recent: [...], stats: {} }
 *   - voice: { lastCommand, lastResponse, session }
 *   - swarm: { activeTasks: [], queue: [] }
 *   - system: { uptime, memory, services: {} }
 * 
 * API:
 *   GET  /state              - Full state
 *   GET  /state/:namespace  - Get namespace
 *   PUT  /state/:namespace/:key - Update key
 *   GET  /state/changes?since=timestamp - Poll for changes
 *   GET  /health             - Health check
 */

const http = require('http');
const url = require('url');

const STATE_PORT = 7783;
const EVENTBUS_PORT = 7782;

// SSE subscribers for state changes
const stateSubscribers = new Map(); // namespace -> Set of response objects
const globalSubscribers = new Set();

const state = {
  agents: {},
  teams: {},
  tools: { recent: [], stats: {} },
  voice: { lastCommand: null, lastResponse: null, session: null },
  swarm: { activeTasks: [], queue: [] },
  system: {
    uptime: Date.now(),
    memory: process.memoryUsage(),
    services: {}
  },
  orchestrator: { workflows: {}, activeWorkflows: 0 },
  _changeLog: [],
  startTime: new Date().toISOString()
};

function log(msg) {
  const ts = new Date().toISOString().split('T')[1].slice(0, -1);
  console.log(`[STATE] ${ts} | ${msg}`);
}

function addChange(type, namespace, key, value) {
  state._changeLog.push({
    timestamp: new Date().toISOString(),
    type,
    namespace,
    key,
    value
  });
  
  if (state._changeLog.length > 1000) {
    state._changeLog = state._changeLog.slice(-1000);
  }
}

function getState(namespace, key) {
  if (!namespace) return state;
  const ns = state[namespace];
  if (!ns) return null;
  if (!key) return ns;
  return ns[key];
}

function setState(namespace, key, value) {
  let changeType = 'update';
  if (!state[namespace]) {
    state[namespace] = {};
    changeType = 'create';
    addChange('create', namespace, null, { [key]: value });
  } else if (key === undefined) {
    state[namespace] = value;
    changeType = 'replace';
    addChange('replace', namespace, null, value);
  } else {
    state[namespace][key] = value;
    addChange('update', namespace, key, value);
  }
  notifySubscribers(changeType, namespace, key, value);
  publishStateToEventBus(changeType, namespace, key, value);
  return true;
}

function deleteState(namespace, key) {
  if (key === undefined) {
    delete state[namespace];
    addChange('delete', namespace, null, null);
  } else {
    delete state[namespace]?.[key];
    addChange('delete', namespace, key, null);
  }
  notifySubscribers('delete', namespace, key);
  return true;
}

function notifySubscribers(type, namespace, key, value) {
  const event = JSON.stringify({
    type,
    namespace,
    key,
    value,
    timestamp: new Date().toISOString()
  });

  // Notify namespace subscribers
  const nsSubs = stateSubscribers.get(namespace);
  if (nsSubs) {
    for (const res of nsSubs) {
      try {
        res.write(`data: ${event}\n\n`);
      } catch (e) {
        nsSubs.delete(res);
      }
    }
  }

  // Notify global subscribers
  for (const res of globalSubscribers) {
    try {
      res.write(`data: ${event}\n\n`);
    } catch (e) {
      globalSubscribers.delete(res);
    }
  }
}

function publishStateToEventBus(type, namespace, key, value) {
  // Publish state changes to EventBus for cross-service coordination
  const payload = JSON.stringify({
    topic: `state.${type}`,
    namespace,
    key,
    value,
    timestamp: new Date().toISOString()
  });

  const req = http.request({
    hostname: 'localhost',
    port: EVENTBUS_PORT,
    path: '/publish',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  }, (res) => {
    // Fire and forget
  });
  req.on('error', () => {});
  req.write(payload);
  req.end();
}

function getChanges(since) {
  if (!since) return state._changeLog;
  const sinceDate = new Date(since);
  return state._changeLog.filter(c => new Date(c.timestamp) > sinceDate);
}

function sendJson(res, status, data) {
  if (res.headersSent) {
    // Headers already sent (e.g., SSE streaming) - cannot send JSON
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function setupServer() {
  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;
    const method = req.method;
    const query = parsed.query;

    if (method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    try {
      // GET /health
      if (pathname === '/health' && method === 'GET') {
        const mem = process.memoryUsage();
        const agentCount = Object.keys(state.agents || {}).length;
        const teamCount = Object.keys(state.teams || {}).length;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), memory: { heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB', heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB' }, namespaces: Object.keys(state), agentCount, teamCount }));
        return;
      }

      // GET /state
      if (pathname === '/state' && method === 'GET') {
        const publicState = { ...state };
        delete publicState._changeLog;
        
        if (query.since) {
          return sendJson(res, 200, {
            changes: getChanges(query.since),
            state: publicState
          });
        }
        
        sendJson(res, 200, publicState);
        return;
      }

      // GET /state/:namespace
      if (pathname.match(/^\/state\/([a-zA-Z_]+)$/) && method === 'GET') {
        const namespace = pathname.match(/^\/state\/([a-zA-Z_]+)$/)[1];
        const data = getState(namespace);
        if (data === null) {
          return sendJson(res, 404, { error: 'Namespace not found' });
        }
        sendJson(res, 200, data);
        return;
      }

      // PUT /state/:namespace/:key
      if (pathname.match(/^\/state\/[a-zA-Z_]+\/.+$/) && method === 'PUT') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const parts = pathname.slice(1).split('/');
            const namespace = parts[1];
            const key = parts.slice(2).join('/');
            const value = JSON.parse(body);
            
            setState(namespace, key, value);
            log(`SET ${namespace}.${key}`);
            sendJson(res, 200, { ok: true, [namespace]: { [key]: value } });
          } catch (e) {
            sendJson(res, 400, { error: e.message });
          }
        });
        return;
      }

      // PUT /state/:namespace (replace entire namespace)
      if (pathname.match(/^\/state\/[a-zA-Z_]+$/) && method === 'PUT') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const namespace = pathname.slice(1).split('/')[1];
            const value = JSON.parse(body);
            setState(namespace, undefined, value);
            log(`REPLACE ${namespace}`);
            sendJson(res, 200, { ok: true, [namespace]: value });
          } catch (e) {
            sendJson(res, 400, { error: e.message });
          }
        });
        return;
      }

      // DELETE /state/:namespace/:key
      if (pathname.match(/^\/state\/[a-zA-Z_]+\/.+$/) && method === 'DELETE') {
        const parts = pathname.slice(1).split('/');
        const namespace = parts[1];
        const key = parts.slice(2).join('/');
        deleteState(namespace, key);
        log(`DELETE ${namespace}.${key}`);
        sendJson(res, 200, { ok: true });
        return;
      }

      // Agent-specific endpoints
      // GET /agents
      if (pathname === '/agents' && method === 'GET') {
        sendJson(res, 200, Object.values(state.agents));
        return;
      }

      // GET /agents/:id
      if (pathname.match(/^\/agents\/[^/]+$/) && method === 'GET') {
        const id = pathname.split('/')[2];
        sendJson(res, 200, state.agents[id] || null);
        return;
      }

      // PUT /agents/:id
      if (pathname.match(/^\/agents\/[^/]+$/) && method === 'PUT') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const id = pathname.split('/')[2];
            const value = JSON.parse(body);
            setState('agents', id, value);
            log(`AGENT UPDATE ${id}: ${JSON.stringify(value).slice(0, 100)}`);
            sendJson(res, 200, { ok: true, agent: value });
          } catch (e) {
            sendJson(res, 400, { error: e.message });
          }
        });
        return;
      }

      // DELETE /agents/:id
      if (pathname.match(/^\/agents\/[^/]+$/) && method === 'DELETE') {
        const id = pathname.split('/')[2];
        deleteState('agents', id);
        log(`AGENT DELETE ${id}`);
        sendJson(res, 200, { ok: true });
        return;
      }

      // SSE subscription: GET /state/subscribe (all changes)
      if (pathname === '/state/subscribe' && method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });
        globalSubscribers.add(res);
        res.write('data: {"type":"subscribed","channel":"global"}\n\n');
        log('New global state subscriber');
        req.on('close', () => {
          globalSubscribers.delete(res);
        });
        return;
      }

      // SSE subscription: GET /state/subscribe/:namespace
      if (pathname.match(/^\/state\/subscribe\/([a-zA-Z_]+)$/) && method === 'GET') {
        const namespace = pathname.match(/^\/state\/subscribe\/([a-zA-Z_]+)$/)[1];
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });
        if (!stateSubscribers.has(namespace)) {
          stateSubscribers.set(namespace, new Set());
        }
        stateSubscribers.get(namespace).add(res);
        res.write(`data: {"type":"subscribed","channel":"${namespace}"}\n\n`);
        log(`New state subscriber for namespace: ${namespace}`);
        req.on('close', () => {
          stateSubscribers.get(namespace)?.delete(res);
        });
        return;
      }

      sendJson(res, 404, { error: 'Not found', path: pathname });
    } catch (e) {
      log(`Error: ${e.message}`);
      sendJson(res, 500, { error: e.message });
    }
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      log(`Port ${STATE_PORT} in use`);
    }
  });

  return server;
}

let server = null;

function startServer() {
  if (server) return server;
  server = setupServer();
  server.listen(STATE_PORT, () => {
    log(`═══════════════════════════════════════════════`);
    log(`PURPCLAW Unified State Store`);
    log(`═══════════════════════════════════════════════`);
    log(`Port: ${STATE_PORT}`);
    log(`Namespaces: agents, teams, tools, voice, swarm, system`);
    log(`═══════════════════════════════════════════════`);
    log(`Ready for state operations`);
  });
  return server;
}

if (require.main === module) {
  startServer();
  
  process.on('SIGINT', () => {
    log('Shutting down...');
    setTimeout(() => process.exit(0), 500);
  });
}

module.exports = { startServer, getState, setState, deleteState, getChanges };
