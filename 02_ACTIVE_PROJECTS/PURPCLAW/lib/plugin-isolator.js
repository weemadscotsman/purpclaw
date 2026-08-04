'use strict';
/**
 * lib/plugin-isolator.js — Worker-thread plugin isolation for PURPCLAW.
 *
 * Codex parity: Codex runs plugins in separate processes.
 * This gives each plugin its own V8 isolate via Worker threads.
 *
 * Usage in plugin-manager.js context:
 *   importPlugin: (manifest, root) => isolator.spawn(name, root, manifest)
 *   invokePluginTool: (name, args) => isolator.invoke(name, args)
 *   destroyPlugin: (name) => isolator.terminate(name)
 *
 * Plugin manifest:
 *   { "name": "my-plugin", "main": "index.js", "isolate": true }
 *
 * If "isolate" is false or absent, plugin runs in the main process.
 */

const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');

const WORKER_ENTRY = path.resolve(__dirname, 'plugin-worker.js');

class PluginIsolator {
  constructor() {
    this._workers = new Map();  // name → { worker, ready, pending }
    this._nextId = 1;
  }

  /**
   * Spawn a worker for a plugin.
   * @param {string} name
   * @param {string} root  — plugin root directory
   * @param {object} manifest
   * @returns {Promise<{ok, error?}>}
   */
  spawn(name, root, manifest) {
    if (this._workers.has(name)) {
      return Promise.resolve({ ok: true }); // already running
    }
    return new Promise((resolve) => {
      try {
        const worker = new Worker(WORKER_ENTRY, {
          execArgv: ['--unhandled-rejections=strict'],
        });

        const id = this._nextId++;
        const state = { worker, ready: false, pending: new Map() };
        this._workers.set(name, state);

        worker.on('message', (msg) => {
          if (msg.type === 'ready') {
            // Init the plugin
            const initId = this._nextId++;
            state.pending.set(initId, resolve);
            worker.postMessage({ id: initId, method: 'init', params: { root, manifest } });
            // Handle init response via a one-shot
            const handler = (m) => {
              if (m.id === initId) {
                worker.off('message', handler);
                state.ready = true;
                resolve({ ok: m.ok, error: m.error });
              }
            };
            worker.on('message', handler);
          }

          // Deliver responses to pending calls
          if (msg.id !== undefined && state.pending.has(msg.id)) {
            const cb = state.pending.get(msg.id);
            state.pending.delete(msg.id);
            if (msg.error) {
              cb({ ok: false, error: msg.error });
            } else {
              cb({ ok: true, result: msg.result });
            }
          }
        });

        worker.on('error', (err) => {
          this._workers.delete(name);
          resolve({ ok: false, error: err.message });
        });

        worker.on('exit', (code) => {
          this._workers.delete(name);
        });

      } catch (err) {
        resolve({ ok: false, error: err.message });
      }
    });
  }

  /**
   * Invoke a tool in an isolated plugin.
   * @param {string} pluginName
   * @param {string} toolName
   * @param {object} args
   * @returns {Promise<{ok, result?, error?}>}
   */
  invoke(pluginName, toolName, args) {
    const state = this._workers.get(pluginName);
    if (!state || !state.ready) {
      return Promise.resolve({ ok: false, error: `plugin not running: ${pluginName}` });
    }
    return new Promise((resolve) => {
      const id = this._nextId++;
      state.pending.set(id, resolve);
      state.worker.postMessage({
        id,
        method: 'invoke',
        params: { name: toolName, args },
      });
      // Timeout after 30s
      const timer = setTimeout(() => {
        if (state.pending.has(id)) {
          state.pending.delete(id);
          resolve({ ok: false, error: `tool timeout: ${toolName}` });
        }
      }, 30000);
      // Store timer for cleanup
      const originalCb = resolve;
      state.pending.set(id, (r) => {
        clearTimeout(timer);
        originalCb(r);
      });
    });
  }

  /**
   * Call a built-in method on a plugin worker (ping, listTools, etc.)
   */
  call(pluginName, method, args = {}) {
    const state = this._workers.get(pluginName);
    if (!state || !state.ready) {
      return Promise.resolve({ ok: false, error: `plugin not running: ${pluginName}` });
    }
    return new Promise((resolve) => {
      const id = this._nextId++;
      state.pending.set(id, resolve);
      state.worker.postMessage({ id, method: 'call', params: { name: method, args } });
    });
  }

  /**
   * Terminate a plugin worker.
   */
  terminate(name) {
    const state = this._workers.get(name);
    if (!state) return;
    try { state.worker.terminate(); } catch {}
    this._workers.delete(name);
  }

  /**
   * Terminate all plugin workers.
   */
  terminateAll() {
    for (const name of this._workers.keys()) {
      this.terminate(name);
    }
  }

  /**
   * List running isolated plugins.
   */
  list() {
    return [...this._workers.entries()].map(([name, state]) => ({
      name,
      ready: state.ready,
      pending: state.pending.size,
    }));
  }

  isRunning(name) {
    const s = this._workers.get(name);
    return s && s.ready;
  }
}

// Singleton
const isolator = new PluginIsolator();

module.exports = { PluginIsolator, isolator };
