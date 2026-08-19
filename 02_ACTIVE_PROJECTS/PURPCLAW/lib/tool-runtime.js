'use strict';

const { EventEmitter } = require('events');
const path = require('path');
const TOOLS = require('./tools');
const GOVERNANCE = require('./governance');
const PERMISSIONS = require('./permission-manager');
const SCHEMA = require('./schema-validator');
const GUARDRAILS = require('./guardrail-manager');
const CHECKPOINTS = require('./checkpoint-manager');
// S1 â€” path security guardrail (always-on, blocks writes to system dirs,
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
    // S1 â€” always-on path security guardrail. Runs after schema/guardrail
    // check, before permission/governance. Hard-blocks writes to system
    // dirs and credential paths. Eddie audit ask 2026-07-17.
    const pathCheck = PATH_SECURITY.check(args, { ...context, tool: name });
    if (!pathCheck.ok) {
      const failure = { ok: false, error: pathCheck.reason, code: 'PATH_SECURITY_BLOCKED', retryable: false };
      this.emit('path.security.blocked', { call_id: callId, tool: name, reason: pathCheck.reason });
      return failure;
    }
    // S2 — steering capsule enforcement (Phase 3). A capsule on the context
    // is executable law: applyToAction decides, the prompt never does.
    if (context.steeringCapsule) {
      const STEER = require('./steering-middleware');
      const denial = STEER.gateTool(context.steeringCapsule, name, args);
      if (denial) {
        this.emit('steering.denied', { call_id: callId, tool: name, capsule_id: denial.capsuleId, reason: denial.error });
        return denial;
      }
    }
    // S14 — device-control consent gate (SPEC-014). Device-class tools map
    // to capabilities with consent tiers: BLOCKED → hard deny; ASK_EACH →
    // operator-initiated only; SESSION/ALWAYS → pass to the normal ladder.
    const DEVICE_CAPABILITY = {
      clipboard_read: 'clipboard', clipboard_write: 'clipboard',
      window_list: 'screen', notify: 'notifications', local_tts_generate: 'audio',
    };
    if (DEVICE_CAPABILITY[name]) {
      let DC = null;
      try { DC = require('./device-control'); } catch { /* optional */ }
      if (DC) {
        // This runtime executes on the local machine — consent is recorded
        // against the 'local' device identity (SPEC-014 consent whitelist).
        const consent = DC.check('local', DEVICE_CAPABILITY[name]);
        if (!consent.allowed) {
          const operatorAsked = context.operatorInitiated === true;
          if (consent.tier === 'BLOCKED' || (consent.tier === 'ASK_EACH' && !operatorAsked)) {
            const failure = { ok: false, error: `device capability '${DEVICE_CAPABILITY[name]}' not consented (${consent.tier})${consent.reason ? ': ' + consent.reason : ''}`, code: 'DEVICE_CONSENT_DENIED', retryable: false };
            this.emit('device.consent.denied', { call_id: callId, tool: name, capability: DEVICE_CAPABILITY[name], tier: consent.tier });
            return failure;
          }
        }
      }
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
    // Operator-initiated + defer (trusted profile) is the Grok Bot analog of
    // "the user asked, auto-review allows". Without a listener, waitForApproval
    // deadlocked for 60s then denied. Still ask when profile says ask, or when
    // a non-operator / untrusted path hits governance.
    const operatorDefer = context.operatorInitiated === true && permission.action === 'defer';
    const needsApproval = !cached && !permissionAllows && !operatorDefer && (permission.action === 'ask' || !governance.allowed);
    if (needsApproval) {
      // S6 — approval triage: learn from operator history. 3+ prior denials of
      // the same (tool, args) pattern auto-block; 3+ prior approvals of a
      // non-destructive pattern auto-pass; everything else escalates as before.
      // This never weakens the HIGH_STAKES/destructive escalation path.
      let triageVerdict = null;
      let TRIAGE = null;
      try { TRIAGE = require('./approval-triage'); } catch { /* optional */ }
      if (TRIAGE) {
        try {
          triageVerdict = TRIAGE.triage({ tool: name, arguments: args, sessionId: context.sessionId, risks: governance.risks });
          if (triageVerdict.decision === 'auto_denied') {
            TRIAGE.record({ tool: name, arguments: args, sessionId: context.sessionId, decision: 'denied', reason: triageVerdict.reason });
            this.emit('approval.triage', { call_id: callId, tool: name, verdict: triageVerdict });
            return { ok: false, error: `approval auto-denied: ${triageVerdict.reason}`, code: 'APPROVAL_AUTO_DENIED', approvalId: null };
          }
          if (triageVerdict.decision === 'auto_approved') {
            TRIAGE.record({ tool: name, arguments: args, sessionId: context.sessionId, decision: 'approved', reason: triageVerdict.reason });
            this.emit('approval.triage', { call_id: callId, tool: name, verdict: triageVerdict });
          }
        } catch { /* triage is an optimisation, never a bypass — on error, escalate */ }
      }

      if (!triageVerdict || triageVerdict.decision !== 'auto_approved') {
        const request = GOVERNANCE.requestApproval(ROOT, context.sessionId || callId, command, {}, governance);
        this.emit('approval.request', { request_id: request.id, call_id: callId, tool: name, arguments: args, risks: governance.risks });
        const callback = context.approvalCallback || this.approvalCallback;
        // S13 — remote approval transport: with no local callback, a context
        // may opt into the durable queue resolvable from ANY surface
        // (CLI/TUI/Web/Desktop/Mobile via /api/approvals). Explicit opt-in
        // only — headless paths keep their existing instant-deny behaviour.
        let choice;
        if (callback) {
          choice = await callback({ ...request, callId, tool: name, arguments: args, risks: governance.risks });
        } else if (context.remoteApprovals === true) {
          const REMOTE = require('./remote-approvals');
          const queued = REMOTE.queue({ tool: name, args, context: { callId, sessionId: context.sessionId, risks: governance.risks, approvalId: request.id }, ttlSeconds: context.remoteApprovalTtl || 300 });
          this.emit('approval.queued', { request_id: request.id, remote_request_id: queued.requestId, call_id: callId, tool: name, expiresAt: queued.expiresAt });
          const verdict = await REMOTE.wait(queued.requestId, { timeoutMs: (context.remoteApprovalTtl || 300) * 1000 });
          choice = verdict.decision === 'approved' ? 'approve' : 'deny';
          if (TRIAGE) { try { TRIAGE.record({ tool: name, arguments: args, sessionId: context.sessionId, decision: verdict.decision === 'approved' ? 'approved' : 'denied', reason: 'remote approval' }); } catch {} }
        } else {
          choice = 'deny';
        }
        if (!['once', 'session', 'always', 'approve', 'approved'].includes(String(choice).toLowerCase())) {
          GOVERNANCE.setApprovalStatus(ROOT, request.id, 'denied');
          return { ok: false, error: `approval denied for ${name}`, code: 'APPROVAL_DENIED', approvalId: request.id };
        }
        GOVERNANCE.setApprovalStatus(ROOT, request.id, 'approved');
        if (['session','always'].includes(String(choice).toLowerCase())) this.approvalCache.set(cacheKey,'allow');
      }
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

