'use strict';

const { EventEmitter } = require('events');

const DEFAULT_ALLOWED_TOOLS = Object.freeze([
  'read', 'grep', 'code-search', 'discover', 'find', 'ls', 'tree',
  'repo.map', 'memory_recall', 'mcp.resources', 'mcp.read_resource',
]);

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

class DelegationManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.tasks = new Map();
    this.maxConcurrent = positiveInteger(options.maxConcurrent, 3);
    this.maxDepth = positiveInteger(options.maxDepth, 1);
    this.baseDepth = Math.max(0, Number(options.baseDepth) || 0);
  }

  runningCount() {
    return [...this.tasks.values()].filter(task => task.status === 'running').length;
  }

  start(params = {}) {
    const depth = positiveInteger(params.depth, this.baseDepth + 1);
    const maxConcurrent = positiveInteger(params.max_concurrent, this.maxConcurrent);
    const maxDepth = positiveInteger(params.max_depth, this.maxDepth);
    if (depth > maxDepth) {
      const error = new Error(`subagent depth ${depth} exceeds limit ${maxDepth}`);
      error.code = 'SUBAGENT_DEPTH_LIMIT';
      throw error;
    }
    if (this.runningCount() >= maxConcurrent) {
      const error = new Error(`subagent concurrency limit reached (${maxConcurrent})`);
      error.code = 'SUBAGENT_CONCURRENCY_LIMIT';
      throw error;
    }

    const id = `subagent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const controller = new AbortController();
    const allowedTools = [...new Set(params.allowed_tools || params.tools || DEFAULT_ALLOWED_TOOLS)];
    const task = {
      id,
      status: 'running',
      goal: String(params.goal || params.prompt || ''),
      parentSessionId: params.parent_session_id || null,
      depth,
      allowedTools,
      createdAt: new Date().toISOString(),
      controller,
      result: null,
      error: null,
    };
    if (!task.goal) throw new Error('delegation goal is required');
    this.tasks.set(id, task);
    this.emit('started', this.public(task));
    task.promise = this.run(task, { ...params, maxDepth });
    return this.public(task);
  }

  async run(task, params) {
    try {
      const { AgentGateway } = require('./agent-gateway');
      const gateway = this.options.gatewayFactory
        ? this.options.gatewayFactory(params)
        : new AgentGateway({
          provider: params.provider || this.options.provider,
          model: params.model || this.options.model,
          cwd: params.cwd || this.options.cwd,
          profile: params.profile || this.options.profile,
          delegation: {
            maxConcurrent: positiveInteger(params.max_concurrent, this.maxConcurrent),
            maxDepth: params.maxDepth,
            baseDepth: task.depth,
          },
        });
      task.gateway = gateway;
      const result = await gateway.submit({
        prompt: task.goal,
        max_turns: params.max_turns || 10,
        platform: 'subagent',
        operator_initiated: false,
        permission_profile: {
          name: `subagent:${task.id}`,
          allow: task.allowedTools,
          deny: ['*'],
        },
      });
      task.status = 'completed';
      task.result = result;
      task.completedAt = new Date().toISOString();
      this.emit('completed', this.public(task));
      return result;
    } catch (error) {
      task.status = task.controller.signal.aborted ? 'interrupted' : 'failed';
      task.error = error.message;
      task.completedAt = new Date().toISOString();
      this.emit(task.status, this.public(task));
      return null;
    }
  }

  interrupt(id) {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`subagent not found: ${id}`);
    task.controller.abort();
    if (task.gateway?.activeSessionId) task.gateway.interrupt(task.gateway.activeSessionId);
    task.status = 'interrupted';
    this.emit('interrupted', this.public(task));
    return this.public(task);
  }

  get(id) {
    const task = this.tasks.get(id);
    return task ? this.public(task) : null;
  }

  list() {
    return [...this.tasks.values()].map(task => this.public(task));
  }

  public(task) {
    return {
      id: task.id,
      status: task.status,
      goal: task.goal,
      parentSessionId: task.parentSessionId,
      depth: task.depth,
      allowedTools: task.allowedTools,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      result: task.result,
      error: task.error,
    };
  }
}

module.exports = { DelegationManager, DEFAULT_ALLOWED_TOOLS };
