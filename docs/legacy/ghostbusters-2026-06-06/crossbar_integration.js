/**
 * PURPCLAW CROSSBAR INTEGRATION v1.0
 * ==================================
 * Service-to-service RPC, event publishing, and state sync library
 * 
 * Provides:
 * - EventBus client for pub/sub
 * - State Store client for shared state
 * - RPC helpers for cross-service communication
 * - Graceful degradation when services are unavailable
 */

const http = require('http');
const https = require('https');

const EVENTBUS_PORT = 7782;
const STATE_PORT = 7783;

class EventBusClient {
  constructor(host = 'localhost', port = EVENTBUS_PORT) {
    this.host = host;
    this.port = port;
    this.connected = false;
    this.pendingSubscriptions = [];
  }

  publish(topic, data = {}) {
    return new Promise((resolve) => {
      const payload = JSON.stringify({ topic, ...data, _source: 'crossbar' });
      const req = http.request({
        hostname: this.host,
        port: this.port,
        path: '/publish',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 2000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ ok: res.statusCode === 200, data: JSON.parse(body) });
          } catch (e) {
            resolve({ ok: res.statusCode === 200 });
          }
        });
      });
      req.on('error', (e) => {
        resolve({ ok: false, error: e.message });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'timeout' });
      });
      req.write(payload);
      req.end();
    });
  }

  async healthCheck() {
    return new Promise((resolve) => {
      const req = http.get(`http://${this.host}:${this.port}/health`, { timeout: 2000 }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ ok: true, data: JSON.parse(body) });
          } catch (e) {
            resolve({ ok: true });
          }
        });
      });
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    });
  }

  isAvailable() {
    return this.healthCheck().then(r => r.ok).catch(() => false);
  }
}

class StateClient {
  constructor(host = 'localhost', port = STATE_PORT) {
    this.host = host;
    this.port = port;
  }

  async get(namespace, key) {
    return new Promise((resolve) => {
      let path = '/state';
      if (namespace) {
        path += `/${namespace}`;
        if (key) path += `/${key}`;
      }
      const req = http.get(`http://${this.host}:${this.port}${path}`, { timeout: 2000 }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ ok: res.statusCode === 200, data: JSON.parse(body) });
          } catch (e) {
            resolve({ ok: res.statusCode === 200, data: body });
          }
        });
      });
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    });
  }

  async set(namespace, key, value) {
    return new Promise((resolve) => {
      const body = JSON.stringify(value);
      let path = `/state/${namespace}`;
      if (key) path += `/${key}`;
      
      const req = http.request({
        hostname: this.host,
        port: this.port,
        path,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 2000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ ok: res.statusCode === 200, data: JSON.parse(data) });
          } catch (e) {
            resolve({ ok: res.statusCode === 200 });
          }
        });
      });
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
      req.write(body);
      req.end();
    });
  }

  async updateAgent(agentId, agentData) {
    return this.set('agents', agentId, agentData);
  }

  async getAgents() {
    return this.get('agents');
  }

  async healthCheck() {
    return new Promise((resolve) => {
      const req = http.get(`http://${this.host}:${this.port}/health`, { timeout: 2000 }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ ok: true, data: JSON.parse(body) });
          } catch (e) {
            resolve({ ok: true });
          }
        });
      });
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    });
  }
}

class Crossbar {
  constructor() {
    this.eventBus = new EventBusClient();
    this.state = new StateClient();
    this.degraded = false;
  }

  async init() {
    const [ebHealth, stateHealth] = await Promise.all([
      this.eventBus.healthCheck(),
      this.state.healthCheck()
    ]);

    this.degraded = !ebHealth.ok || !stateHealth.ok;

    return {
      eventBus: ebHealth.ok,
      state: stateHealth.ok,
      degraded: this.degraded
    };
  }

  async publish(topic, data = {}) {
    try {
      return await this.eventBus.publish(topic, data);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async setState(namespace, key, value) {
    try {
      return await this.state.set(namespace, key, value);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async getState(namespace, key) {
    try {
      return await this.state.get(namespace, key);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async updateAgentState(agentId, agentData) {
    return this.state.updateAgent(agentId, agentData);
  }

  publishAgentSpawned(agentId, name, division, role, task) {
    return this.publish('agent.spawned', { agentId, name, division, role, task });
  }

  publishAgentCompleted(agentId, name, division, role, task) {
    return this.publish('agent.completed', { agentId, name, division, role, task });
  }

  publishToolCalled(toolName, args) {
    return this.publish('tool.called', { toolName, args });
  }

  publishToolResult(toolName, result, duration) {
    return this.publish('tool.result', { toolName, result, duration });
  }

  publishSystemHealth(services) {
    return this.publish('system.health', { services, timestamp: new Date().toISOString() });
  }
}

const crossbar = new Crossbar();

module.exports = {
  Crossbar,
  EventBusClient,
  StateClient,
  crossbar,
  EVENTBUS_PORT,
  STATE_PORT
};
