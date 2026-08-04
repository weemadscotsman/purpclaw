'use strict';

/**
 * services/runner — Task Execution Runner
 * Stub — implements the execution runner service.
 * TODO: wire to lib/harness/engine.js and Tower :7790 /api/spawn
 */
const { EventEmitter } = require('events');

class TaskRunner extends EventEmitter {
  constructor(opts) {
    super();
    this.purpRoot = opts?.purpRoot || process.env.PURP_DIR;
  }

  async run(task, harness) {
    this.emit('start', { taskId: task.taskId, harness });
    // TODO: wire to actual harness
    return { status: 'skipped', reason: 'services/runner not yet wired to harness-core' };
  }

  async cancel(taskId) {
    this.emit('cancel', { taskId });
  }

  async status(taskId) {
    return { taskId, status: 'unknown' };
  }
}

module.exports = { TaskRunner };
