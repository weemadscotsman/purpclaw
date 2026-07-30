'use strict';

const { EventEmitter } = require('events');
const SESSIONS = require('./session-repository');
const { runAgentRouted } = require('./agent-router');
const PROVIDERS = require('./provider-registry');
const { ToolRuntime } = require('./tool-runtime');
const PROFILES = require('./profile-manager');
const GOALS = require('./goal-manager');
const CHECKPOINTS = require('./checkpoint-manager');
const PLUGINS = require('./plugin-manager');
const { DelegationManager } = require('./delegation-manager');
const CRON = require('./cron-manager');
const MCP = require('./mcp');
const MESSAGING = require('./messaging-registry');
const ATTACHMENTS = require('./attachment-manager');
const ARTIFACTS = require('./artifact-manager');
const LEDGER = require('./event-ledger');
const REPO_MAP = require('./repo-map');
const VERIFY = require('./verification-runner');
const WORKFLOWS = require('./workflow-manager');
const GUARDRAILS = require('./guardrail-manager');
const SCHEMA = require('./schema-validator');
const TRACES = require('./trace-manager');
const EVALS = require('./eval-manager');
const OUTPUT = require('./output-contract');
const TEAMS = require('./team-manager');
const RUN_CONTEXT = require('./run-context');
const { UsageTracker } = require('./usage-limits');
const INDEXES = require('./index-manager');
const RETRIEVAL = require('./retrieval-engine');
const PIPELINES = require('./component-pipeline');
const PROGRAMS = require('./program-optimizer');
const COMPONENT_AGENTS = require('./agent-component');
const SCOPED_STATE = require('./session-state-service');
const INSTRUCTIONS = require('./instruction-resolver');
const INVOCATIONS = require('./invocation-manager');
const GRAPHS = require('./graph-runtime');
const TASKS = require('./task-manager');
const TELEMETRY = require('./telemetry-manager');
const SKILL_REGISTRY = require('./skill-registry');
const STORE = require('./namespace-store');

const METHODS = Object.freeze([
  'prompt.submit', 'session.create', 'session.list', 'session.activate',
  'session.close', 'session.history', 'session.status', 'session.title',
  'session.interrupt', 'session.resume', 'session.search', 'session.branch', 'session.compress',
  'session.checkpoint', 'session.rollback', 'profile.list', 'profile.create',
  'profile.activate', 'goal.set', 'goal.status', 'goal.update', 'goal.subgoal',
  'goal.run',
  'delegation.start', 'delegation.status', 'delegation.list', 'subagent.interrupt',
  'cron.add', 'cron.list', 'cron.remove', 'cron.run',
  'skills.list', 'skills.get', 'skills.resource', 'agents.list', 'messaging.list', 'messaging.sessions',
  'mcp.list', 'mcp.tools', 'mcp.resources', 'mcp.prompts', 'mcp.read_resource', 'mcp.get_prompt', 'mcp.reload',
  'attachment.register', 'attachment.list', 'attachment.get',
  'artifact.publish', 'artifact.list', 'artifact.get',
  'artifact.version', 'artifact.versions', 'artifact.latest', 'state.get', 'state.set', 'state.apply', 'state.snapshot',
  'event.list', 'event.replay', 'repo.map',
  'recipe.list', 'recipe.get', 'recipe.run',
  'verification.run',
  'runtime.list', 'runtime.execute',
  'workflow.run', 'workflow.resume', 'workflow.fork', 'workflow.get', 'workflow.list', 'workflow.history',
  'graph.run', 'graph.resume', 'graph.fork', 'graph.get', 'graph.list', 'graph.history',
  'team.create', 'team.run', 'team.replay', 'team.train', 'team.get', 'team.list', 'team.stop', 'team.export', 'team.import',
  'index.create', 'index.list', 'index.add', 'index.query', 'index.remove', 'retrieval.query', 'pipeline.list', 'pipeline.run',
  'program.compile', 'program.predict', 'program.get', 'program.list', 'program.inspect',
  'agent.create', 'agent.run', 'agent.handoff', 'agent.get', 'agent.list', 'agent.export', 'agent.import',
  'invocation.start', 'invocation.get', 'invocation.list', 'invocation.events', 'invocation.cancel', 'invocation.resume',
  'task.create', 'task.run', 'task.get', 'task.list',
  'store.put', 'store.get', 'store.list', 'store.search', 'store.remove',
  'trace.list', 'trace.get', 'trace.export', 'telemetry.export', 'eval.run', 'eval.get', 'eval.list', 'schema.validate', 'guardrail.run',
  'plugin.list', 'plugin.enable', 'plugin.disable', 'command.dispatch',
  'approval.respond', 'commands.catalog', 'gateway.capabilities',
  'permission.list',
]);

class AgentGateway extends EventEmitter {
  constructor(options = {}) {
    super();
    const runtime = PROVIDERS.resolveRuntime({ provider: options.provider, model: options.model, baseUrl: options.baseUrl, apiKey: options.apiKey });
    this.provider = runtime.provider;
    this.model = runtime.model;
    this.runtime = runtime;
    this.runner = options.runner || runAgentRouted;
    this.cwd = options.cwd || process.cwd();
    this.profile = options.profile || PROFILES.active();
    this.sessions = new Map();
    this.activeSessionId = null;
    this.pendingApprovals = new Map();
    this.approvalCache = new Map();
    this.delegation = new DelegationManager({
      provider: this.provider,
      model: this.model,
      cwd: this.cwd,
      profile: this.profile,
      ...(options.delegation || {}),
    });
    this.delegation.on('completed',task=>PLUGINS.emit('subagent_stop',{task,status:'completed'}));this.delegation.on('failed',task=>PLUGINS.emit('subagent_stop',{task,status:'failed'}));this.delegation.on('interrupted',task=>PLUGINS.emit('subagent_stop',{task,status:'interrupted'}));
    this.on('error', () => {});
    for (const event of this.capabilities().events) this.on(event, payload => { try { LEDGER.append(event, payload || {}); } catch {} });
    PLUGINS.load();
    PIPELINES.register('purpclaw.index.retrieve',{inputSchema:{type:'object',required:['index','query'],properties:{index:{type:'string'},query:{type:'string'},top_k:{type:'integer'}}},outputSchema:{type:'object',required:['items'],properties:{items:{type:'array'}}},run:async input=>({items:INDEXES.query(input.index,input.query,{top_k:input.top_k})})});
    PIPELINES.register('purpclaw.agent.run',{inputSchema:{type:'object',required:['agent','input'],properties:{agent:{type:'string'},input:{}}},outputSchema:{type:'object',required:['message'],properties:{message:{type:'string'},output:{}}},run:async input=>{const result=await COMPONENT_AGENTS.run(this,input.agent,input.input);return{message:result.message,output:result.output};}});
  }

  capabilities() {
    return {
      protocol: 'purpclaw-agent-gateway',
      version: 1,
      methods: METHODS,
      events: [
        'message.delta', 'message.complete', 'tool.start', 'tool.complete',
        'artifact.created',
        'goal.judged', 'goal.continue', 'goal.waiting', 'goal.complete',
        'recipe.started', 'recipe.step.started', 'recipe.step.completed', 'recipe.completed',
        'verification.started', 'verification.completed',
        'workflow.started', 'workflow.node.started', 'workflow.node.completed', 'workflow.node.failed', 'workflow.interrupted', 'workflow.completed',
        'graph.stream',
        'team.started', 'team.speaker.selected', 'team.message', 'team.completed', 'team.failed',
        'trace.started', 'trace.completed', 'guardrail.tripped', 'message.retry', 'eval.completed',
        'approval.request',
        'session.created', 'session.activated', 'session.closed',
        'session.interrupted', 'agent.status', 'error',
      ],
      provider: this.provider,
      model: this.model,
      api_mode: this.runtime.apiMode,
      profile: this.profile,
    };
  }

  createSession(params = {}) {
    const session = SESSIONS.createSession(params.title || 'PURPCLAW chat', params.provider || this.provider, params.model || this.model, { profile: params.profile || this.profile, source: params.source || 'cli' });
    const state = { ...session, messages: session.messages || [], status: 'idle', abort: null };
    this.sessions.set(session.id, state);
    this.activeSessionId = session.id;
    this.emit('session.created', { session_id: session.id, title: session.title });
    PLUGINS.emit('on_session_start', { session_id: session.id, model: this.model, platform: params.source || 'cli' });
    return this.publicState(state);
  }

  loadSession(id) {
    if (this.sessions.has(id)) return this.sessions.get(id);
    const saved = SESSIONS.loadSession(id);
    if (!saved) throw this.rpcError(-32004, `session not found: ${id}`);
    const state = { ...saved, messages: saved.messages || [], status: 'idle', abort: null };
    this.sessions.set(id, state);
    return state;
  }

  publicState(state) {
    return {
      id: state.id,
      title: state.title,
      status: state.status,
      message_count: state.messages.length,
      provider: state.provider || this.provider,
      model: state.model || this.model,
    };
  }

  persist(state) {
    SESSIONS.saveSession(state.id, state.messages, {
      title: state.title,
      provider: state.provider || this.provider,
      model: state.model || this.model,
    });
  }

  async submit(params = {}) {
    const requestStarted=Date.now();TELEMETRY.increment('purpclaw.agent.requests',1,{platform:params.platform||'cli'});
    const prompt = String(params.prompt || '').trim();
    const attachmentInputs = Array.isArray(params.attachments) ? params.attachments : [];
    if (!prompt && !attachmentInputs.length) throw this.rpcError(-32602, 'prompt or attachment is required');
    const state = params.session_id ? this.loadSession(params.session_id)
      : (this.activeSessionId ? this.loadSession(this.activeSessionId) : (this.createSession(params), this.loadSession(this.activeSessionId)));
    if (state.status === 'running') throw this.rpcError(-32009, 'session already running');

    const abort = new AbortController();
    const attachments = ATTACHMENTS.resolve(attachmentInputs, state.id);
    const attachmentPrompt = ATTACHMENTS.prompt(prompt || 'Inspect the attached files and report the relevant findings.', attachments);
    const codingIntent = /\b(code|repo|repository|file|function|class|module|build|test|lint|typecheck|bug|fix|implement|refactor|website|app|cli|api|database|typescript|javascript|python|rust|go)\b/i.test(prompt);
    const repoMap = params.repo_map === true || (params.repo_map !== false && codingIntent)
      ? REPO_MAP.build(params.cwd || this.cwd, { maxChars: params.repo_map_chars || 8000, query: prompt }) : null;
    const dependencies=await RUN_CONTEXT.create({values:params.dependencies,providers:params.dependency_providers,schema:params.dependency_schema,sessionId:state.id,persist:params.persist_dependencies});
    const stateContext={sessionId:state.id,appId:params.app_id||'purpclaw',userId:params.user_id||params.user||'default',dependencies};
    const injectedInstructions=params.instructions?await INSTRUCTIONS.resolve(params.instructions,stateContext):'',basePrompt=repoMap?.files ? `${repoMap.text}\n\n${attachmentPrompt}` : attachmentPrompt;
    let executionPrompt=injectedInstructions?`${injectedInstructions}\n\n${basePrompt}`:basePrompt;
    const rendered=await PLUGINS.emitMutable('prompt_render',{session_id:state.id,prompt:executionPrompt,platform:params.platform||'cli'});if(rendered.blocked)throw new Error(rendered.reason);executionPrompt=rendered.context.prompt;
    const activeGoal = GOALS.active(state.profile || this.profile);
    if (activeGoal?.status === 'active') GOALS.increment(activeGoal.id);
    const permissionProfile = params.permission_profile || this.profile?.permissionProfile || (params.operator_initiated === false ? 'autonomous' : 'trusted');
    const toolRuntime = new ToolRuntime({ approvalCallback: request => this.waitForApproval(request, abort.signal), permissionProfile, approvalCache: this.approvalCache, inputGuardrails: params.tool_input_guardrails, outputGuardrails: params.tool_output_guardrails, allowedTools: params.allowed_tools || null, disallowedTools: params.disallowed_tools || null });
    toolRuntime.on('approval.request', event => this.emit('approval.request', { session_id: state.id, ...event }));
    state.abort = abort;
    state.status = 'running';
    state.messages.push({ role: 'user', content: prompt, status: 'running', ...(attachments.length ? { attachments } : {}), ts: new Date().toISOString() });
    this.persist(state);
    this.emit('agent.status', { session_id: state.id, status: 'thinking' });
    await PLUGINS.emit('pre_llm_call', { session_id: state.id, prompt, model: state.model || this.model, platform: params.platform || 'cli' });
    await PLUGINS.emit('user_prompt_submit',{session_id:state.id,prompt,platform:params.platform||'cli'});

    const inputGuardrail = await GUARDRAILS.runParallel(prompt, params.input_guardrails || [], { session: state });
    if (!inputGuardrail.ok) {
      state.messages[state.messages.length - 1].status = 'failed'; state.status = 'failed'; this.persist(state);
      this.emit('guardrail.tripped', { session_id: state.id, stage: 'input', ...inputGuardrail }); throw this.rpcError(-32012, `input guardrail tripped: ${inputGuardrail.reason}`);
    }
    const traceId = params.trace_id || TRACES.startTrace('prompt.submit', { session_id: state.id, provider: state.provider || this.provider, model: state.model || this.model });
    const rootSpan = TRACES.startSpan(traceId, 'agent.turn', { kind: 'agent', input: prompt, sensitive: params.trace_sensitive === false });
    this.emit('trace.started', { trace_id: traceId, session_id: state.id });
    let answer = '';
    let turns = 0;
    const usageTracker=new UsageTracker(params.usage_limits||{});
    try {
      const consume = async (agentPrompt, history) => {
        let output = '', usedTurns = 0, consumeError=null;
        usageTracker.request(agentPrompt,history);
        const modelSpan=TRACES.startSpan(traceId,'model.generate',{parentId:rootSpan,kind:'client',input:{prompt:agentPrompt,history_length:history.length},sensitive:params.trace_sensitive===false,metadata:{provider:state.provider||this.provider,model:state.model||this.model}}),toolSpans=new Map();
        try{for await (const event of this.runner({
          prompt: agentPrompt, history, provider: state.provider || this.provider, model: state.model || this.model, autoRoute: false,
          opts: { maxTurns: params.max_turns || 10, cwd: params.cwd || this.cwd, platform: params.platform || 'cli', sessionId: state.id, noSpine: params.no_spine !== false, signal: abort.signal, toolRuntime, goal: activeGoal, nativeTools: params.native_tools !== false, permissionProfile, dependencies, operatorInitiated: params.operator_initiated === true || (params.platform || 'cli') === 'cli' },
        })) {
          if (abort.signal.aborted) throw this.rpcError(-32800, 'request interrupted');
          if (event.type === 'token') { usageTracker.output(event.content||''); output += event.content || ''; this.emit('message.delta', { session_id: state.id, delta: event.content || '' }); }
          else if (event.type === 'tool-call') { usageTracker.tool(); const span=TRACES.startSpan(traceId,`tool.${event.tool}`,{parentId:modelSpan,kind:'internal',input:event.args,sensitive:params.trace_sensitive===false});const queue=toolSpans.get(event.tool)||[];queue.push(span);toolSpans.set(event.tool,queue);this.emit('tool.start', { session_id: state.id, tool: event.tool, arguments: event.args }); }
          else if (event.type === 'tool-result') { const queue=toolSpans.get(event.tool)||[],span=queue.shift();if(span)TRACES.endSpan(span,{output:event.content,error:event.error,sensitive:params.trace_sensitive===false});this.emit('tool.complete', { session_id: state.id, tool: event.tool, ok: event.ok !== false, result: event.content, error: event.error }); for (const artifact of ARTIFACTS.discover(event.content, { sessionId: state.id, cwd: params.cwd || this.cwd, sourceTool: event.tool })) this.emit('artifact.created', artifact); }
          else if (event.type === 'turn') usedTurns = event.turn;
          else if (event.type === 'error') throw new Error(event.error || 'agent error');
          else if (event.type === 'done') { output = event.totalContent || output; usedTurns = event.turns || usedTurns; }
        }}catch(error){consumeError=error;throw error;}finally{for(const queue of toolSpans.values())for(const span of queue)TRACES.endSpan(span,{error:'tool call ended without result'});TRACES.endSpan(modelSpan,consumeError?{error:consumeError.message}:{output:{answer:output,turns:usedTurns},sensitive:params.trace_sensitive===false});}
        return { answer: output, turns: usedTurns };
      };
      ({ answer, turns } = await consume(executionPrompt, state.messages.slice(0, -1)));
      let structuredOutput;
      if (params.output_schema || params.output_guardrails?.length) {
        const validationSpan=TRACES.startSpan(traceId,'guardrail.output',{parentId:rootSpan,kind:'internal',input:answer,sensitive:params.trace_sensitive===false});let contracted;try{contracted=await OUTPUT.enforce(answer,async(retryPrompt,detail)=>{
          const retryHistory=[...state.messages.slice(0,-1),{role:'user',content:executionPrompt},{role:'assistant',content:detail.previous}];
          const retry=await consume(retryPrompt,retryHistory);turns+=retry.turns;return retry.answer;
        },{schema:params.output_schema,guardrails:params.output_guardrails,retries:params.output_retries,onRetry:event=>{this.emit('message.retry',{session_id:state.id,...event});if(event.kind==='guardrail')this.emit('guardrail.tripped',{session_id:state.id,stage:'output',reason:event.reason,retry:true});}},{session:state});TRACES.endSpan(validationSpan,{output:{attempts:contracted.attempts}});}catch(error){TRACES.endSpan(validationSpan,{error:error.message});throw error;}
        answer=contracted.answer;structuredOutput=contracted.output;
      }
      let verification = null;
      if (params.verify === true || params.verification_commands) {
        this.emit('verification.started', { session_id: state.id, commands: params.verification_commands || null });
        verification = await VERIFY.run(params.cwd || this.cwd, { commands: params.verification_commands, timeoutMs: params.verification_timeout_ms });
        let repairs = params.auto_repair === false ? 0 : Math.max(0, Math.min(Number(params.repair_attempts ?? 1), 5));
        while (!verification.ok && repairs-- > 0) {
          const repairPrompt = VERIFY.failurePrompt(verification);
          const repairHistory = [...state.messages.slice(0, -1), { role: 'user', content: executionPrompt }, { role: 'assistant', content: answer }];
          const repair = await consume(repairPrompt, repairHistory); answer = `${answer}\n\n${repair.answer}`.trim(); turns += repair.turns;
          verification = await VERIFY.run(params.cwd || this.cwd, { commands: params.verification_commands, timeoutMs: params.verification_timeout_ms });
        }
        this.emit('verification.completed', { session_id: state.id, ...verification });
        if (!verification.ok) throw new Error(`post-edit verification failed: ${verification.results.map(result => `${result.command} (${result.code})`).join(', ')}`);
      }
      state.messages[state.messages.length - 1].status = 'complete';
      state.messages.push({ role: 'assistant', content: answer, status: 'complete', ts: new Date().toISOString() });
      state.status = 'idle';
      this.persist(state);
      const result = { session_id: state.id, message: answer, turns, usage: usageTracker.usage, trace_id: traceId, ...(structuredOutput !== undefined ? { output: structuredOutput } : {}), ...(verification ? { verification } : {}) };
      TELEMETRY.histogram('purpclaw.agent.duration_ms',Date.now()-requestStarted,{provider:state.provider||this.provider,model:state.model||this.model,status:'complete'});TELEMETRY.log('info','agent request completed',{session_id:state.id,turns},{traceId});
      TRACES.endSpan(rootSpan, { output: result, sensitive: params.trace_sensitive === false }); TRACES.endTrace(traceId); this.emit('trace.completed', { trace_id: traceId, session_id: state.id, status: 'complete' });
      this.emit('message.complete', result);
      await PLUGINS.emit('post_llm_call', { session_id: state.id, user_message: prompt, assistant_response: answer, conversation_history: state.messages, model: state.model || this.model, platform: params.platform || 'cli' });
      await PLUGINS.emit('stop',{session_id:state.id,status:'complete',response:answer});
      return result;
    } catch (error) {
      TELEMETRY.increment('purpclaw.agent.errors',1,{code:error.code||'ERROR'});TELEMETRY.histogram('purpclaw.agent.duration_ms',Date.now()-requestStarted,{status:'error'});TELEMETRY.log('error',error.message,{session_id:state.id,code:error.code||null},{traceId});
      TRACES.endSpan(rootSpan, { error: error.message }); TRACES.endTrace(traceId, 'error', { error: error.message }); this.emit('trace.completed', { trace_id: traceId, session_id: state.id, status: 'error' });
      state.messages[state.messages.length - 1].status = 'failed';
      const failedAt = new Date().toISOString();
      const recovery = {
        failedPrompt: prompt,
        error: error.message,
        turnsCompleted: turns,
        nextAction: 'Inspect the persisted tool/error history, correct the cause, retry from this same session, and verify the requested outcome.',
      };
      state.messages.push({
        role: 'assistant',
        content: `Execution failed: ${error.message}\n\nRecovery plan: ${recovery.nextAction}`,
        status: 'failed', error: error.message, recovery, ts: failedAt,
      });
      state.status = abort.signal.aborted ? 'interrupted' : 'failed';
      this.persist(state);
      this.emit('error', { session_id: state.id, error: error.message, status: state.status, recovery });
      await PLUGINS.emit('stop',{session_id:state.id,status:state.status,error:error.message,recovery});
      throw error;
    } finally {
      state.abort = null;
    }
  }

  interrupt(id) {
    const state = this.loadSession(id || this.activeSessionId);
    if (state.abort) state.abort.abort();
    state.status = 'interrupted';
    this.emit('session.interrupted', { session_id: state.id });
    return this.publicState(state);
  }

  waitForApproval(request, signal) {
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.pendingApprovals.delete(request.id); resolve('timeout'); }, 60_000);
      timer.unref?.();
      this.pendingApprovals.set(request.id, choice => { clearTimeout(timer); this.pendingApprovals.delete(request.id); resolve(choice); });
      signal?.addEventListener('abort', () => { clearTimeout(timer); this.pendingApprovals.delete(request.id); resolve('deny'); }, { once: true });
    });
  }

  async dispatch(method, params = {}) {
    switch (method) {
      case 'gateway.capabilities': return this.capabilities();
      case 'permission.list': return require('./permission-manager').list();
      case 'prompt.submit': return this.submit(params);
      case 'session.create': return this.createSession(params);
      case 'session.resume': {
        const state = this.loadSession(params.session_id || this.activeSessionId);
        const failure = [...state.messages].reverse().find(message => message.status === 'failed');
        const prompt = params.prompt || (failure?.recovery
          ? `Resume the failed task. Original request: ${failure.recovery.failedPrompt}\nFailure: ${failure.recovery.error}\nRequired next action: ${failure.recovery.nextAction}`
          : 'Resume this conversation from its persisted history and complete the latest unfinished task. Verify the outcome before reporting completion.');
        return this.submit({ ...params, prompt, session_id: state.id });
      }
      case 'session.list': return SESSIONS.listSessions(params.limit || 50);
      case 'session.search': return SESSIONS.searchSessions(params.query || '', { limit: params.limit });
      case 'session.branch': return SESSIONS.branchSession(params.session_id || this.activeSessionId, { title: params.title, through: params.through });
      case 'session.compress': {
        const { ContextEngine } = require('./context-engine');
        const state = this.loadSession(params.session_id || this.activeSessionId);
        await PLUGINS.emit('pre_compact',{session_id:state.id,message_count:state.messages.length});const result = new ContextEngine({ protectFirst: params.protect_first, protectLast: params.protect_last }).compress(state.messages, { summary: params.summary });
        if (result.compressed) { state.messages = result.messages; this.persist(state); }
        return { session_id: state.id, ...result };
      }
      case 'session.checkpoint': return CHECKPOINTS.create(params.paths || [], { sessionId: params.session_id || this.activeSessionId, label: params.label });
      case 'session.rollback': return CHECKPOINTS.rollback(params.checkpoint_id);
      case 'profile.list': return PROFILES.list();
      case 'profile.create': return PROFILES.create(params.name, params.config || {});
      case 'profile.activate': { const profile = PROFILES.activate(params.name); this.profile = profile.name; return profile; }
      case 'goal.set': return GOALS.set(params.profile || this.profile, params.objective, params.contract || {});
      case 'goal.status': return GOALS.active(params.profile || this.profile);
      case 'goal.update': { const goal = GOALS.active(params.profile || this.profile); if (!goal) throw this.rpcError(-32004, 'no active goal'); return GOALS.update(goal.id, params.patch || {}); }
      case 'goal.subgoal': { const goal = GOALS.active(params.profile || this.profile); if (!goal) throw this.rpcError(-32004, 'no active goal'); return GOALS.addSubgoal(goal.id, params.text); }
      case 'goal.run': return require('./goal-controller').run(this, params);
      case 'plugin.list': return PLUGINS.list();
      case 'plugin.enable': PLUGINS.enable(params.name); return { name: params.name, enabled: true, restart_required: true };
      case 'plugin.disable': PLUGINS.disable(params.name); return { name: params.name, enabled: false, restart_required: true };
      case 'command.dispatch': return PLUGINS.runCommand(params.command, params.args || [], { gateway: this, sessionId: params.session_id || this.activeSessionId });
      case 'delegation.start': { await PLUGINS.emit('subagent_start',{params});const result=await this.delegation.start({ ...params, parent_session_id: params.parent_session_id || this.activeSessionId, provider: this.provider, model: this.model, cwd: this.cwd, profile: this.profile });await PLUGINS.emit('notification',{type:'subagent.started',result});return result; }
      case 'delegation.status': return this.delegation.get(params.id);
      case 'delegation.list': return this.delegation.list();
      case 'subagent.interrupt': { const result=this.delegation.interrupt(params.id);await PLUGINS.emit('subagent_stop',{id:params.id,result});return result; }
      case 'cron.add': return CRON.add({ ...params, profile: params.profile || this.profile });
      case 'cron.list': return CRON.list(params.profile || this.profile);
      case 'cron.remove': return { removed: CRON.remove(params.id) };
      case 'cron.run': return CRON.run(params.id, { provider: this.provider, model: this.model, cwd: this.cwd, maxTurns: params.max_turns, deliver: params.deliver });
      case 'skills.list': return SKILL_REGISTRY.discover(params.cwd||this.cwd).map(({name,description,version,path})=>({name,description,version,path}));
      case 'skills.get': return SKILL_REGISTRY.load(params.name,params.cwd||this.cwd);
      case 'skills.resource': return SKILL_REGISTRY.resource(params.name,params.path,params.cwd||this.cwd);
      case 'agents.list': { try { const tower=require('../agent_tower'); return Object.keys(tower.registry||{}).map(name=>({name,status:'registered'})); } catch { return []; } }
      case 'messaging.list': return MESSAGING.list();
      case 'messaging.sessions': return require('./messaging-runtime').listBindings(params.platform);
      case 'mcp.list': return MCP.status();
      case 'mcp.tools': return MCP.listTools();
      case 'mcp.resources': return MCP.listResources(params.server);
      case 'mcp.prompts': return MCP.listPrompts(params.server);
      case 'mcp.read_resource': return MCP.readResource(params.server, params.uri);
      case 'mcp.get_prompt': return MCP.getPrompt(params.server, params.name, params.arguments || {});
      case 'mcp.reload': return MCP.reload({ servers: params.servers });
      case 'attachment.register': return ATTACHMENTS.register({ ...params, sessionId: params.session_id || this.activeSessionId });
      case 'attachment.list': return ATTACHMENTS.list(params.session_id, params.limit);
      case 'attachment.get': return ATTACHMENTS.get(params.id);
      case 'artifact.publish': return ARTIFACTS.register({ ...params, sessionId: params.session_id || this.activeSessionId });
      case 'artifact.list': return ARTIFACTS.list(params.session_id, params.limit);
      case 'artifact.get': return ARTIFACTS.get(params.id);
      case 'artifact.version': return ARTIFACTS.version(params.session_id||this.activeSessionId,params.name,params.version);
      case 'artifact.versions': return ARTIFACTS.versions(params.session_id||this.activeSessionId,params.name);
      case 'artifact.latest': return ARTIFACTS.latest(params.session_id||this.activeSessionId,params.name);
      case 'state.get': return {value:SCOPED_STATE.get(params.key,{sessionId:params.session_id||this.activeSessionId,appId:params.app_id,userId:params.user_id})};
      case 'state.set': return SCOPED_STATE.set(params.key,params.value,{sessionId:params.session_id||this.activeSessionId,appId:params.app_id,userId:params.user_id});
      case 'state.apply': return SCOPED_STATE.apply(params.delta,{sessionId:params.session_id||this.activeSessionId,appId:params.app_id,userId:params.user_id});
      case 'state.snapshot': return SCOPED_STATE.snapshot({sessionId:params.session_id||this.activeSessionId,appId:params.app_id,userId:params.user_id});
      case 'event.list': return LEDGER.list({ sessionId: params.session_id, after: params.after, limit: params.limit, types: params.types });
      case 'event.replay': { const events=[];const result=LEDGER.replay(params.session_id,event=>events.push(event),params);return{...result,events}; }
      case 'repo.map': return REPO_MAP.build(params.cwd || this.cwd, { maxChars: params.max_chars, maxFiles: params.max_files });
      case 'recipe.list': return require('./recipe-manager').list(params.cwd || this.cwd);
      case 'recipe.get': return require('./recipe-manager').load(params.recipe, params.cwd || this.cwd);
      case 'recipe.run': return require('./recipe-manager').run(this, params.recipe, params);
      case 'verification.run': return VERIFY.run(params.cwd || this.cwd, { commands: params.commands, timeoutMs: params.timeout_ms });
      case 'runtime.list': return require('./execution-runtime').list();
      case 'runtime.execute': {
        const runtime = require('./execution-runtime');
        const registry = { has: name => name === 'runtime.execute', list: () => [], invoke: (_name, args) => runtime.execute(args) };
        const tools = new ToolRuntime({ registry, permissionProfile: params.permission_profile || 'standard', approvalCache: this.approvalCache, approvalCallback: request => this.waitForApproval(request) });
        tools.on('approval.request', event => this.emit('approval.request', { session_id: params.session_id || this.activeSessionId, ...event }));
        return tools.invoke('runtime.execute', params, { sessionId: params.session_id || this.activeSessionId, operatorInitiated: params.operator_initiated === true });
      }
      case 'schema.validate': return SCHEMA.parseAndValidate(params.value, params.schema || {});
      case 'guardrail.run': return GUARDRAILS.run(params.value, params.guardrails || [], params.context || {});
      case 'trace.list': return TRACES.list(params.limit);
      case 'trace.get': return TRACES.get(params.trace_id);
      case 'trace.export': return TRACES.exportOTLP(params.trace_id,{endpoint:params.endpoint,headers:params.headers,serviceName:params.service_name});
      case 'telemetry.export': return TELEMETRY.exportOTLP({endpoint:params.endpoint,headers:params.headers,serviceName:params.service_name});
      case 'eval.run': { const result = await EVALS.run(this, params); this.emit('eval.completed', result); return result; }
      case 'eval.get': return EVALS.get(params.eval_id);
      case 'eval.list': return EVALS.list(params.limit);
      case 'workflow.list': return WORKFLOWS.list(params.limit);
      case 'workflow.get': return WORKFLOWS.get(params.run_id);
      case 'workflow.history': return WORKFLOWS.history(params.run_id);
      case 'workflow.run': return this.runWorkflow(params.workflow || params.spec, params);
      case 'workflow.resume': return this.resumeWorkflow(params.run_id, params);
      case 'workflow.fork': return this.forkWorkflow(params.run_id, params.checkpoint_id, params);
      case 'graph.run': return GRAPHS.run(params.graph,params.input,this.graphAdapter(params),{maxSupersteps:params.max_supersteps,streamModes:params.stream_modes,onStream:event=>this.emit('graph.stream',event)});
      case 'graph.resume': return GRAPHS.resume(params.run_id,params.resume_value,this.graphAdapter(params),{maxSupersteps:params.max_supersteps,streamModes:params.stream_modes,onStream:event=>this.emit('graph.stream',event)});
      case 'graph.fork': return GRAPHS.fork(params.run_id,params.checkpoint_id,params.input,this.graphAdapter(params),{maxSupersteps:params.max_supersteps,streamModes:params.stream_modes,onStream:event=>this.emit('graph.stream',event)});
      case 'graph.get': return GRAPHS.get(params.run_id);
      case 'graph.list': return GRAPHS.list(params.limit);
      case 'graph.history': return GRAPHS.history(params.run_id);
      case 'team.create': return TEAMS.create(params.config || params);
      case 'team.get': return TEAMS.get(params.team_id);
      case 'team.list': return TEAMS.list(params.limit);
      case 'team.stop': return TEAMS.stop(params.team_id);
      case 'team.export': return TEAMS.exportState(params.team_id);
      case 'team.import': return TEAMS.importState(params.state);
      case 'team.run': return TEAMS.run(params.team_id,params.task,this.teamAdapter(params),{restart:params.restart,maxTurns:params.max_turns,onEvent:event=>this.emit(event.type,event)});
      case 'team.replay': return TEAMS.replay(params.team_id,params.from_turn,this.teamAdapter(params),{maxTurns:params.max_turns,onEvent:event=>this.emit(event.type,event)});
      case 'team.train': return TEAMS.train(params.team_id,params.examples,this.teamAdapter(params),{maxTurns:params.max_turns});
      case 'index.create': return INDEXES.create(params.name,params.type,params.config);
      case 'index.list': return INDEXES.list();
      case 'index.add': return INDEXES.add(params.index,params.documents||[]);
      case 'index.query': return INDEXES.query(params.index,params.query,params);
      case 'index.remove': return {removed:INDEXES.remove(params.index)};
      case 'retrieval.query': return RETRIEVAL.queryEngine(params.retriever||params.index,params.query,params);
      case 'pipeline.list': return PIPELINES.list();
      case 'pipeline.run': return PIPELINES.run(params.pipeline,params.input||{});
      case 'program.compile': return PROGRAMS.compile(this,{...params,cwd:params.cwd||this.cwd});
      case 'program.predict': return PROGRAMS.predict(this,params.program||params.program_id,params.input,params);
      case 'program.get': return PROGRAMS.load(params.program_id||params.file);
      case 'program.list': return PROGRAMS.list(params.limit);
      case 'program.inspect': return PROGRAMS.inspect(params.program_id,params.limit);
      case 'agent.create': return COMPONENT_AGENTS.create(params.definition||params);
      case 'agent.run': return COMPONENT_AGENTS.run(this,params.agent,params.input,params);
      case 'agent.handoff': return COMPONENT_AGENTS.handoff(this,params.from,params.target,params.input,params);
      case 'agent.get': return COMPONENT_AGENTS.get(params.agent);
      case 'agent.list': return COMPONENT_AGENTS.list();
      case 'agent.export': return COMPONENT_AGENTS.exportState(params.agent);
      case 'agent.import': return COMPONENT_AGENTS.importState(params.state);
      case 'invocation.start': return INVOCATIONS.start(this,params);
      case 'invocation.get': return INVOCATIONS.get(params.invocation_id);
      case 'invocation.list': return INVOCATIONS.list(params.limit);
      case 'invocation.events': return INVOCATIONS.events(params.invocation_id,params.after,params.limit);
      case 'invocation.cancel': return INVOCATIONS.cancel(params.invocation_id,this);
      case 'invocation.resume': return INVOCATIONS.resume(this,params.invocation_id,params);
      case 'task.create': return TASKS.create(params.definition||params);
      case 'task.run': return TASKS.run(this,params.task_id,params.input||{});
      case 'task.get': return TASKS.get(params.task_id);
      case 'task.list': return TASKS.list();
      case 'store.put': return STORE.put(params.namespace,params.key,params.value);
      case 'store.get': return STORE.get(params.namespace,params.key);
      case 'store.list': return STORE.list(params.namespace,params);
      case 'store.search': return STORE.search(params.namespace,params.query,params);
      case 'store.remove': return {removed:STORE.remove(params.namespace,params.key)};
      case 'approval.respond': {
        const resolve = this.pendingApprovals.get(params.request_id);
        if (!resolve) throw this.rpcError(-32004, `approval request not found: ${params.request_id}`);
        resolve(params.choice || 'deny');
        return { request_id: params.request_id, choice: params.choice || 'deny' };
      }
      case 'session.activate': {
        const state = this.loadSession(params.session_id);
        this.activeSessionId = state.id;
        this.emit('session.activated', { session_id: state.id });
        return this.publicState(state);
      }
      case 'session.history': return this.loadSession(params.session_id || this.activeSessionId).messages;
      case 'session.status': return this.publicState(this.loadSession(params.session_id || this.activeSessionId));
      case 'session.title': {
        const state = this.loadSession(params.session_id || this.activeSessionId);
        state.title = String(params.title || '').trim() || state.title;
        this.persist(state);
        return this.publicState(state);
      }
      case 'session.close': {
        const state = this.loadSession(params.session_id || this.activeSessionId);
        if (state.abort) state.abort.abort();
        state.status = 'closed';
        SESSIONS.closeSession(state.id, params.reason || 'closed');
        this.emit('session.closed', { session_id: state.id });
        await PLUGINS.emit('session_end',{session_id:state.id,reason:params.reason||'closed'});
        return this.publicState(state);
      }
      case 'session.interrupt': return this.interrupt(params.session_id);
      case 'commands.catalog': return { commands: ['/help', '/new', '/resume', '/history', '/status', '/compact', '/model', '/tools', '/quit'], plugins: PLUGINS.commandCatalog() };
      default: throw this.rpcError(-32601, `method not found: ${method}`);
    }
  }

  workflowAdapter(params = {}) {
    return {
      prompt: async (input, node, run) => {
        if(node.agent&&COMPONENT_AGENTS.get(node.agent)){const delegated=await COMPONENT_AGENTS.run(this,node.agent,input,{new_session:node.new_session});return delegated.output??delegated.message;}
        const result = await this.submit({ ...params, prompt: typeof input === 'string' ? input : JSON.stringify(input), session_id: node.new_session ? undefined : (run.context.session_id || params.session_id), platform: 'workflow', operator_initiated: false });
        run.context.session_id = result.session_id; return result.message;
      },
      tool: async (name, args, node, run) => {
        const runtime = new ToolRuntime({ permissionProfile: params.permission_profile || 'autonomous', approvalCache: this.approvalCache, approvalCallback: request => this.waitForApproval(request) });
        runtime.on('approval.request', event => this.emit('approval.request', { session_id: run.context.session_id || params.session_id, ...event }));
        return runtime.invoke(name, args, { sessionId: run.context.session_id || params.session_id, operatorInitiated: params.operator_initiated === true });
      },
      handoff: async (target, input, node, run) => {
        const span=params._workflowTrace?TRACES.startSpan(params._workflowTrace,`handoff.${target}`,{parentId:params._workflowRoot,kind:'internal',input,sensitive:params.trace_sensitive===false,metadata:{target}}):null;
        const filtered = node.input_filter ? GUARDRAILS.run(input, node.input_filter, { target, run }) : { ok: true };
        if (!filtered.ok) {if(span)TRACES.endSpan(span,{error:filtered.reason});throw new Error(`handoff guardrail tripped: ${filtered.reason}`);}
        try{const result=await this.workflowAdapter(params).prompt(input, { ...node, agent: target }, run);if(span)TRACES.endSpan(span,{output:result,sensitive:params.trace_sensitive===false});return result;}catch(error){if(span)TRACES.endSpan(span,{error:error.message});throw error;}
      },
    };
  }

  graphAdapter(params={}) {
    const adapter = this.workflowAdapter(params);
    const resolve = (value, state) => typeof value === 'string' && value.startsWith('$') ? value.slice(1).split('.').reduce((o, k) => o?.[k], state) : value;
    return {
      execute: async (node, state, context) => {
        if (node.type === 'store.put') return STORE.put(resolve(node.namespace, state), resolve(node.key, state), resolve(node.value, state));
        if (node.type === 'store.get') return STORE.get(resolve(node.namespace, state), resolve(node.key, state));
        if (node.type === 'store.search') return STORE.search(resolve(node.namespace, state), resolve(node.query, state), node.options || {});
        
        if (node.type === 'subgraph') {
          const spec = node.graph;
          const isInherited = node.mode === 'inherited';
          
          const subRunId = GRAPHS.getSubgraph(context.run_id, node.id);
          
          let res;
          if (subRunId && context.resume_value !== undefined) {
            res = await GRAPHS.resume(subRunId, context.resume_value, this.graphAdapter(params), params);
          } else {
            let subState = {};
            if (isInherited) {
              subState = state;
            } else {
              if (node.input_map) {
                for (const [subKey, parentKey] of Object.entries(node.input_map)) {
                  subState[subKey] = state[parentKey];
                }
              } else {
                subState = node.input || {};
              }
            }
            res = await GRAPHS.run(spec, subState, this.graphAdapter(params), params);
          }
          
          GRAPHS.setSubgraph(context.run_id, node.id, res.run_id);
          
          if (res.status === 'failed') {
            throw new Error(`Subgraph ${node.id} failed: ${res.error}`);
          }
          if (res.status === 'interrupted') {
            return { interrupt: true, reason: res.state.__interrupt.reason };
          }
          
          if (isInherited) {
            return { updates: res.state };
          } else {
            const updates = {};
            if (node.output_map) {
              for (const [parentKey, subKey] of Object.entries(node.output_map)) {
                updates[parentKey] = res.state[subKey];
              }
            } else {
              updates[node.output || node.id] = res.state;
            }
            return { updates };
          }
        }
        
        const run = { runId: context.run_id, spec: params.graph || { nodes: [] }, context: { ...state, ...(context.resume_value !== undefined ? { __resume_value: context.resume_value } : {}) } };
        return WORKFLOWS.executeNode(node, run, adapter, params);
      }
    };
  }

  teamAdapter(params={}) {
    return {
      respond:async(participant,context)=>{if(participant.agent&&COMPONENT_AGENTS.get(participant.agent)){const component=await COMPONENT_AGENTS.run(this,participant.agent,{task:context.task,transcript:context.history},{session_id:context.state.session_id,user_id:params.user_id,app_id:params.app_id});return{content:component.message,state:{session_id:component.session_id}};}const transcript=context.history.slice(-20).map(item=>`${item.source}: ${item.content}`).join('\n'),prompt=`Role: ${participant.name}\n${participant.instructions||participant.goal||''}\n\nTeam task: ${context.task||''}\n\nShared transcript:\n${transcript}\n\nRespond as ${participant.name}. If transferring control, include the exact marker HANDOFF:<participant>.`;let sessionId=context.state.session_id;if(!sessionId)sessionId=this.createSession({title:`Team ${context.team.name}: ${participant.name}`,source:'team'}).id;const result=await this.submit({prompt,session_id:sessionId,platform:'team',operator_initiated:false,model:participant.model,permission_profile:participant.permission_profile||params.permission_profile});const handoff=result.message.match(/HANDOFF:\s*([\w.-]+)/i)?.[1]||null;return{content:result.message,handoff,state:{session_id:result.session_id}};},
      select:async(config,state)=>{if(!config.manager)return config.participants[state.turn%config.participants.length].name;let sessionId=state.managerSessionId;if(!sessionId)sessionId=this.createSession({title:`Team manager: ${config.name}`,source:'team'}).id;const choices=config.participants.map(item=>item.name),result=await this.submit({prompt:`You manage team ${config.name}. Choose exactly one next participant from ${choices.join(', ')}.\nTranscript:\n${state.history.slice(-20).map(item=>`${item.source}: ${item.content}`).join('\n')}`,session_id:sessionId,platform:'team-manager',operator_initiated:false,output_schema:{type:'object',required:['participant'],properties:{participant:{type:'string',enum:choices}},additionalProperties:false},output_retries:2,permission_profile:'autonomous'});state.managerSessionId=result.session_id;return result.output.participant;},
    };
  }

  async runWorkflow(spec, params = {}) {
    const traceId=TRACES.startTrace('workflow.run',{name:spec?.name||spec}),root=TRACES.startSpan(traceId,'workflow',{kind:'internal',input:params.input});const traced={...params,_workflowTrace:traceId,_workflowRoot:root};try{const result=await WORKFLOWS.run(spec,this.workflowAdapter(traced),{cwd:params.cwd||this.cwd,input:params.input,maxSteps:params.max_steps,onEvent:event=>this.emit(event.type,event)});TRACES.endSpan(root,{output:result});TRACES.endTrace(traceId);return{...result,trace_id:traceId};}catch(error){TRACES.endSpan(root,{error:error.message});TRACES.endTrace(traceId,'error');throw error;}
  }

  async resumeWorkflow(runId, params = {}) {
    return WORKFLOWS.resume(runId, this.workflowAdapter(params), { input: params.input, resumeValue: params.resume_value, maxSteps: params.max_steps, onEvent: event => this.emit(event.type, event) });
  }

  async forkWorkflow(runId, checkpointId, params = {}) {
    return WORKFLOWS.fork(runId, checkpointId, this.workflowAdapter(params), { input: params.input, from_node: params.from_node, maxSteps: params.max_steps, onEvent: event => this.emit(event.type, event) });
  }

  async handle(request) {
    const id = request && request.id;
    if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      return { jsonrpc: '2.0', id: id ?? null, error: { code: -32600, message: 'invalid request' } };
    }
    try {
      return { jsonrpc: '2.0', id: id ?? null, result: await this.dispatch(request.method, request.params || {}) };
    } catch (error) {
      return { jsonrpc: '2.0', id: id ?? null, error: { code: error.code || -32603, message: error.message || String(error) } };
    }
  }

  rpcError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }
}

module.exports = { AgentGateway, METHODS };
