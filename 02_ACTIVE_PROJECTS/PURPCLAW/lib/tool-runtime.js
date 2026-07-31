'use strict';

const { EventEmitter } = require('events');
const path = require('path');
const TOOLS = require('./tools');
const GOVERNANCE = require('./governance');
const PERMISSIONS = require('./permission-manager');
const SCHEMA = require('./schema-validator');
const GUARDRAILS = require('./guardrail-manager');
const CHECKPOINTS = require('./checkpoint-manager');
// S1 — path security guardrail (always-on, blocks writes to system dirs,
// .ssh, .aws, .gnupg, .kube, .docker, and paths outside the project root
// unless operator-initiated). Eddie's #1 audit ask.
const PATH_SECURITY = require('./path-security');

const ROOT = path.resolve(__dirname, '..');
const CHECKPOINTED_TOOLS = new Set(['write', 'edit', 'delete']);

function mutationPaths(name, args = {}) {
  if (!CHECKPOINTED_TOOLS.has(name)) return [];
  const target = args.path || args.file;
  return target ? [target] : [];
}

function normalizeToolSet(registry, value) {
  if (!value) return null;
  const values = Array.isArray(value) ? value : [...value];
  return new Set(values.map(tool => {
    const name = typeof tool === 'string' ? tool : tool?.name;
    return registry._resolve ? registry._resolve(name) : name;
  }).filter(Boolean));
}

class ToolRuntime extends EventEmitter {
  constructor(options = {}) {
    super();
    this.registry = options.registry || TOOLS;
    this.approvalCallback = options.approvalCallback || null;
    this.permissionProfile = options.permissionProfile || 'standard';
    this.approvalCache = options.approvalCache || new Map();
    this.inputGuardrails = options.inputGuardrails || [];
    this.outputGuardrails = options.outputGuardrails || [];
    this.allowedTools = normalizeToolSet(this.registry, options.allowedTools);
    this.disallowedTools = normalizeToolSet(this.registry, options.disallowedTools);
  }

  catalog() {
    return this.registry.list()
      .filter(tool => this.isToolInScope(tool.name))
      .map(tool => ({ ...tool, available: true }));
  }

  isToolInScope(name) {
    const resolved = this.registry._resolve ? this.registry._resolve(name) : name;
    if (this.disallowedTools?.has(resolved)) return false;
    return !this.allowedTools || this.allowedTools.has(resolved);
  }

  async invoke(name, args = {}, context = {}) {
    const plugins = require('./plugin-manager'); plugins.load();
    if (context.signal?.aborted) return { ok: false, error: 'tool execution interrupted', code: 'INTERRUPTED' };
    if (!this.isToolInScope(name)) {
      return { ok: false, error: `${name} is outside this runtime's tool scope`, code: 'TOOL_SCOPE_DENIED' };
    }
    if (!this.registry.has(name)) return { ok: false, error: `unknown or unavailable tool: ${name}`, code: 'TOOL_UNAVAILABLE' };
    const callId = context.callId || `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const definition=this.registry.list().find(tool=>tool.name===name)||{};
    const inputSchema=definition.inputSchema||definition.input_schema;
    if(inputSchema){
      const checked=SCHEMA.validate(args,inputSchema);
      if(!checked.ok){
        // The validator reports JSONPath ("$.agent: required") because that is
        // correct for structured-output validation. But this string goes
        // straight to a model as a tool error, and models copy it literally:
        // observed a real agent answering with {"$.agent":null,"$.task":null}
        // and then looping ten turns against the same schema. Present plain
        // field names and state the required set explicitly so the retry has
        // something correct to copy.
        const plain=checked.errors.map(e=>String(e).replace(/^\$\.?/,'')||'(root)');
        const required=Array.isArray(inputSchema.required)?inputSchema.required:[];
        const hint=required.length?` Required fields: ${required.join(', ')}. Pass a JSON object using exactly these key names.`:'';
        const failure={ok:false,error:`invalid arguments for ${name}: ${plain.join('; ')}.${hint}`,code:'TOOL_ARGUMENT_VALIDATION',errors:checked.errors,retryable:true};
        this.emit('tool.validation.failed',{call_id:callId,tool:name,stage:'input',...failure});
        return failure;
      }
    }
    const inputGuard=await GUARDRAILS.runParallel(args,context.inputGuardrails||this.inputGuardrails,{...context,tool:name,stage:'input'});
    if(!inputGuard.ok){const failure={ok:false,error:`tool input guardrail tripped: ${inputGuard.reason}`,code:'TOOL_GUARDRAIL_TRIPPED',tripwire:inputGuard.tripwire,retryable:true};this.emit('tool.guardrail.tripped',{call_id:callId,tool:name,stage:'input',...inputGuard});return failure;}
    // S1 — always-on path security guardrail. Runs after schema/guardrail
    // check, before permission/governance. Hard-blocks writes to system
    // dirs and credential paths. Eddie audit ask 2026-07-17.
    const pathCheck = PATH_SECURITY.check(args, { ...context, tool: name });
    if (!pathCheck.ok) {
      const failure = { ok: false, error: pathCheck.reason, code: 'PATH_SECURITY_BLOCKED', retryable: false };
      this.emit('path.security.blocked', { call_id: callId, tool: name, reason: pathCheck.reason });
      return failure;
    }
    const pre = await plugins.emitMutable('pre_tool_call', { name, args, context, callId });
    if (pre.blocked) return { ok: false, error: pre.reason || `blocked by plugin hook: ${name}`, code: 'PLUGIN_BLOCKED' };
    args=pre.context.args||args;context=pre.context.context||context;
    const command = `${name} ${JSON.stringify(args)}`;
    const permission = PERMISSIONS.evaluate(context.permissionProfile || this.permissionProfile, name);
    if (permission.action === 'deny') return { ok: false, error: `${name} is denied by permission profile ${permission.profile}`, code: 'PERMISSION_DENIED' };
    const governance = GOVERNANCE.checkWorkflow(ROOT, command, {}, {
      approvalId: context.approvalId,
      operatorInitiated: context.operatorInitiated === true,
    });
    const cacheKey = `${context.sessionId || 'global'}:${name}`;
    const cached = this.approvalCache.get(cacheKey) === 'allow';
    const permissionAllows = permission.action === 'allow';
    const needsApproval = !cached && !permissionAllows && (permission.action === 'ask' || !governance.allowed);
    if (needsApproval) {
      const request = GOVERNANCE.requestApproval(ROOT, context.sessionId || callId, command, {}, governance);
      this.emit('approval.request', { request_id: request.id, call_id: callId, tool: name, arguments: args, risks: governance.risks });
      const callback = context.approvalCallback || this.approvalCallback;
      const choice = callback ? await callback({ ...request, callId, tool: name, arguments: args, risks: governance.risks }) : 'deny';
      if (!['once', 'session', 'always', 'approve', 'approved'].includes(String(choice).toLowerCase())) {
        GOVERNANCE.setApprovalStatus(ROOT, request.id, 'denied');
        return { ok: false, error: `approval denied for ${name}`, code: 'APPROVAL_DENIED', approvalId: request.id };
      }
      GOVERNANCE.setApprovalStatus(ROOT, request.id, 'approved');
      if (['session','always'].includes(String(choice).toLowerCase())) this.approvalCache.set(cacheKey,'allow');
    }

    let checkpoint = null;
    const paths = context.checkpoint === false ? [] : mutationPaths(name, args);
    if (paths.length) {
      const checkpointManager = await CHECKPOINTS;
      const created = await checkpointManager.createCheckpoint(
        context.cwd || ROOT,
        `tool ${name}: ${paths.join(', ')}`,
      );
      if (created) {
        checkpoint = { ...created, id: created.checkpointId };
        this.emit('checkpoint.created', { call_id: callId, tool: name, checkpoint_id: checkpoint.id, paths });
      }
    }

    this.emit('tool.start', { call_id: callId, tool: name, arguments: args, checkpoint_id: checkpoint?.id });
    const invocation = this.registry.invoke(name, args, context);
    const result = context.signal
      ? await Promise.race([invocation, new Promise(resolve => context.signal.addEventListener('abort', () => resolve({ ok: false, error: 'tool execution interrupted', code: 'INTERRUPTED' }), { once: true }))])
      : await invocation;
    const outputSchema=definition.outputSchema||definition.output_schema;
    if(outputSchema){const checked=SCHEMA.validate(result,outputSchema);if(!checked.ok){const failure={ok:false,error:`invalid result from ${name}: ${checked.errors.join('; ')}`,code:'TOOL_RESULT_VALIDATION',errors:checked.errors,retryable:true};this.emit('tool.validation.failed',{call_id:callId,tool:name,stage:'output',...failure});return failure;}}
    const outputGuard=await GUARDRAILS.runParallel(result,context.outputGuardrails||this.outputGuardrails,{...context,tool:name,stage:'output'});
    if(!outputGuard.ok){const failure={ok:false,error:`tool output guardrail tripped: ${outputGuard.reason}`,code:'TOOL_GUARDRAIL_TRIPPED',tripwire:outputGuard.tripwire,retryable:true};this.emit('tool.guardrail.tripped',{call_id:callId,tool:name,stage:'output',...outputGuard});return failure;}
    if (checkpoint && result && typeof result === 'object') result.checkpoint_id = checkpoint.id;
    this.emit('tool.complete', { call_id: callId, tool: name, ok: result.ok !== false, result, checkpoint_id: checkpoint?.id });
    await plugins.emit('post_tool_call', { name, args, context, callId, result });
    return result;
  }
}

module.exports = { ToolRuntime, mutationPaths, CHECKPOINTED_TOOLS };
