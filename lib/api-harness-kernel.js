'use strict';

/**
 * PURPCLAW API Harness Kernel
 * ---------------------------
 * Canonical API-facing job intake for model/tool/agent work.
 *
 * This is intentionally a facade, not a second executor. It gives Unified API,
 * MCP tools, UI, and future clients one stable contract while routing execution
 * to the existing PURPCLAW harness engine.
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const { createHarness } = require('./harness/engine');
const {
  classifyJob,
  createJobContract,
} = require('./job-contract');
const governance = require('./governance');
let omnicodeBridge = null;
try { omnicodeBridge = require('./omnicode-bridge'); } catch {}
let deepResearchGroup = null;
try { deepResearchGroup = require('./deep-research-group'); } catch {}

const PURP_ROOT = path.resolve(__dirname, '..');
const ARCHIVE_DIR = path.join(PURP_ROOT, 'agent_work', 'api_harness');
const MAX_EVENTS = 400;
const MAX_ARCHIVE = 80;

function now() {
  return Date.now();
}

function iso(ts = now()) {
  return new Date(ts).toISOString();
}

function makeId() {
  return `apih_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function compactGoal(input) {
  return String(input?.goal || input?.task || input?.query || '').trim();
}

function safeInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function isDestructiveRepoGoal(goal) {
  const text = String(goal || '').toLowerCase();
  return /\b(delete|remove|wipe|purge|reset|rename|move|migrate|drop|destroy|prune|cleanup|clean up|refactor)\b/.test(text);
}

function ensureArchiveDir() {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
}

function mapEngineState(state) {
  if (state === 'done') return 'completed';
  if (state === 'failed') return 'failed';
  if (state === 'stopped') return 'stopped';
  return state || 'running';
}

function publicSnapshot(job) {
  if (!job) return null;
  return {
    id: job.id,
    goal: job.goal,
    state: job.state,
    route: job.route,
    mode: job.mode,
    dryRun: Boolean(job.dryRun),
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    durationMs: job.finishedAt && job.startedAt ? job.finishedAt - job.startedAt : null,
    classification: job.classification,
    contract: job.contract,
    repoPath: job.request?.repoPath || null,
    omnicodeIntake: job.request?.omnicodeIntake || null,
    engineJobId: job.engineJobId,
    linkedMissionId: job.linkedMissionId,
    plan: job.plan || [],
    finalReport: job.finalReport,
    researchRun: job.researchRun,
    governance: job.governance,
    approvalRequest: job.approvalRequest,
    error: job.error,
    eventCount: job.events?.length || 0,
    events: job.events || [],
  };
}

class ApiHarnessKernel extends EventEmitter {
  constructor(options = {}) {
    super();
    this.rootDir = options.rootDir || PURP_ROOT;
    this.swarmCoordinator = options.swarmCoordinator || null;
    this.active = new Map();
    this.archive = new Map();
    this.loaded = false;
  }

  loadArchive() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      ensureArchiveDir();
      const files = fs.readdirSync(ARCHIVE_DIR)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, MAX_ARCHIVE);
      for (const file of files) {
        try {
          const job = JSON.parse(fs.readFileSync(path.join(ARCHIVE_DIR, file), 'utf8'));
          if (job?.id) this.archive.set(job.id, job);
        } catch {}
      }
    } catch {}
  }

  listJobs(limit = 40) {
    this.loadArchive();
    const rows = [
      ...Array.from(this.active.values()),
      ...Array.from(this.archive.values()).filter(j => !this.active.has(j.id)),
    ];
    return rows
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, safeInt(limit, 40, 1, 200))
      .map(publicSnapshot);
  }

  getJob(id) {
    this.loadArchive();
    return publicSnapshot(this.active.get(id) || this.archive.get(id) || null);
  }

  createJob(input = {}) {
    const goal = compactGoal(input);
    if (!goal) throw new Error('api harness requires goal, task, or query');

    const classification = classifyJob(goal);
    const contract = createJobContract(goal, { raw: goal }, {
      source: 'api-harness-kernel',
      client: input.client || input.source || 'unified-api',
    });
    const dryRun = Boolean(input.dryRun || input.dry_run || input.planOnly || input.plan_only);
    const requestedRoute = String(input.route || input.executionRoute || '').trim();
    const route = dryRun
      ? 'contract-preview'
      : requestedRoute === 'swarm-coordinator' || requestedRoute === 'swarm'
        ? 'swarm-coordinator'
        : requestedRoute === 'deep-research-group' || requestedRoute === 'research-group'
          ? 'deep-research-group'
        : 'harness-engine';
    const id = makeId();

    const repoPath = input.repoPath || input.repo || input.repository || null;
    const omnicodeIntake = repoPath && omnicodeBridge
      ? omnicodeBridge.buildRepoIntake({ repoPath, goal }, { rootDir: this.rootDir })
      : null;

    const job = {
      id,
      goal,
      state: 'queued',
      route,
      mode: input.mode || (dryRun ? 'plan' : 'execute'),
      dryRun,
      createdAt: now(),
      classification,
      contract: {
        type: contract.type,
        routeIntent: contract.routeIntent,
        risk: contract.risk,
        preferredAgents: contract.preferredAgents,
        gates: contract.gates,
      },
      request: {
        source: input.source || input.client || 'unified-api',
        tags: Array.isArray(input.tags) ? input.tags.slice(0, 12) : [],
        repoPath,
        omnicodeIntake,
        researchOptions: route === 'deep-research-group' ? {
          query: input.query || goal,
          depth: input.depth,
          focus_areas: input.focus_areas,
          focusAreas: input.focusAreas,
          model_count: input.model_count,
          modelLimit: input.modelLimit,
          selectedModels: input.selectedModels,
          synthesisModel: input.synthesisModel || input.synthesis_model,
          concurrency: input.concurrency,
          memberMaxTokens: input.memberMaxTokens,
          synthesisMaxTokens: input.synthesisMaxTokens,
        } : null,
      },
      options: {
        maxIterations: safeInt(input.maxIterations ?? input.max_iter, 30, 1, 80),
        maxRetriesPerSubtask: safeInt(input.maxRetriesPerSubtask ?? input.retries, 2, 0, 10),
      },
      events: [],
      plan: [],
    };

    const gov = governance.checkWorkflow(this.rootDir, goal, contract, {
      approvalId: input.approvalId || input.approval_id,
    });
    job.governance = gov;
    if (!gov.allowed) {
      const approval = governance.requestApproval(this.rootDir, id, goal, contract, gov);
      job.approvalRequest = approval;
      job.state = 'waiting_approval';
      job.route = 'governance-hold';
      job.finishedAt = now();
      job.finalReport = [
        '# API Harness Waiting For Approval',
        '',
        `Goal: ${goal}`,
        `Risks: ${(gov.risks || []).join(', ') || 'unknown'}`,
        `Approval: ${approval.id}`,
        '',
        'Read-only and diagnostic work can continue automatically. This workflow is paused before execution by governance.checkWorkflow().',
      ].join('\n');
      this.addEvent(job, 'waiting_approval', 'governance', `approval required: ${approval.id}`, { governance: gov, approval });
      this.persist(job);
      this.archive.set(id, job);
      return publicSnapshot(job);
    }

    this.active.set(id, job);
    this.addEvent(job, 'accepted', 'kernel', `accepted via ${route}`);
    this.persist(job);
    if (route === 'swarm-coordinator') {
      this.runJob(job, input).catch(error => this.failJob(job, error));
    } else {
      setImmediate(() => this.runJob(job, input).catch(error => this.failJob(job, error)));
    }
    return publicSnapshot(job);
  }

  stopJob(id) {
    const job = this.active.get(id);
    if (!job) return { ok: false, error: 'job_not_active' };
    try {
      if (job.engine?.stop) job.engine.stop();
      job.state = 'stopping';
      this.addEvent(job, 'stop_requested', 'kernel', 'operator requested stop');
      this.persist(job);
      return { ok: true, jobId: id, state: job.state };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async runJob(job) {
    job.startedAt = now();
    job.state = 'running';
    this.addEvent(job, 'started', 'kernel', job.dryRun ? 'contract preview' : job.route);
    this.persist(job);

    const intake = job.request?.omnicodeIntake;
    if (
      job.request?.repoPath &&
      intake &&
      intake.destructiveRepairAllowed === false &&
      isDestructiveRepoGoal(job.goal)
    ) {
      job.state = 'blocked';
      job.finishedAt = now();
      job.finalReport = [
        '# API Harness Blocked By OmniCode Repair Governor',
        '',
        `Goal: ${job.goal}`,
        `Repo: ${job.request.repoPath}`,
        `Reason: ${intake.repairGovernor?.reason || 'repair governor blocked destructive repo work'}`,
        `Unknown files: ${intake.proofPayload?.unknownFiles ?? 'unknown'}`,
        `Blocking repair gaps: ${intake.proofPayload?.blockingRepairGaps ?? 'unknown'}`,
        '',
        'The job was not delegated to swarm. Run a non-destructive audit/planning job or clear the OmniCode repair gaps first.',
      ].join('\n');
      this.addEvent(job, 'blocked', 'omnicode-repair-governor', intake.repairGovernor?.reason || 'destructive repo job blocked', { intake });
      this.finishJob(job);
      return job;
    }

    if (job.dryRun) {
      job.plan = [
        {
          index: 0,
          state: 'planned',
          description: job.goal,
          routeIntent: job.contract.routeIntent,
          preferredAgents: job.contract.preferredAgents || [],
          gates: job.contract.gates || [],
        },
      ];
      job.finalReport = [
        '# API Harness Contract Preview',
        '',
        `Goal: ${job.goal}`,
        `Route intent: ${job.contract.routeIntent || 'general'}`,
        `Preferred agents: ${(job.contract.preferredAgents || []).join(', ') || 'default tower routing'}`,
        `Verification gates: ${(job.contract.gates || []).join(', ') || 'none'}`,
      ].join('\n');
      job.state = 'completed';
      job.finishedAt = now();
      this.addEvent(job, 'completed', 'kernel', 'contract preview generated');
      this.finishJob(job);
      return job;
    }

    if (job.route === 'deep-research-group') {
      if (!deepResearchGroup || typeof deepResearchGroup.runGroupResearch !== 'function') {
        throw new Error('deep research group unavailable for kernel route');
      }
      const opts = job.request?.researchOptions || {};
      this.addEvent(job, 'research_sources_started', 'deep-research-group', 'collecting source pack');
      const run = await deepResearchGroup.runGroupResearch({
        ...opts,
        query: opts.query || job.goal,
      });
      job.researchRun = {
        ok: run.ok,
        mode: run.mode,
        query: run.query,
        depth: run.depth,
        requestedModelCount: run.requestedModelCount,
        freeModelCount: run.freeModelCount,
        memberCount: run.memberCount,
        successCount: run.successCount,
        sourceCount: run.sources?.pages?.length || 0,
        sources: (run.sources?.pages || []).map(page => ({
          url: page.url,
          ok: !page.error,
          error: page.error || null,
        })),
        members: (run.members || []).map(member => ({
          model: member.model,
          name: member.name,
          status: member.status,
          error: member.error || null,
          startedAt: member.startedAt,
          completedAt: member.completedAt,
        })),
        synthesisError: run.synthesisError || null,
        createdAt: run.createdAt,
      };
      job.finalReport = deepResearchGroup.formatReport(run);
      job.state = run.ok ? 'completed' : 'failed';
      job.finishedAt = now();
      this.addEvent(
        job,
        run.ok ? 'research_group_complete' : 'research_group_failed',
        'deep-research-group',
        `${run.successCount}/${run.memberCount} models answered`,
        job.researchRun
      );
      this.finishJob(job);
      return job;
    }

    if (job.route === 'swarm-coordinator') {
      const coord = this.swarmCoordinator;
      if (!coord) throw new Error('swarm coordinator unavailable for kernel route');
      const missionId = `${job.id}-mission`;
      job.linkedMissionId = missionId;
      job.state = 'delegated';
      this.addEvent(job, 'delegated', 'swarm-coordinator', missionId);
      this.persist(job);

      // Use coordinateMission (awaited) so we get real results back
      const coordinateFn = typeof coord.coordinateMission === 'function'
        ? coord.coordinateMission.bind(coord)
        : typeof coord.startMission === 'function'
          ? coord.startMission.bind(coord)
          : null;
      if (!coordinateFn) throw new Error('swarm coordinator missing coordinateMission/startMission');

      const mission = await coordinateFn(missionId, job.goal, {
        workflowId: job.id,
        intent: job.contract.routeIntent || 'api-harness-flow',
        memoryContext: '',
        source: job.request.source,
        repoPath: job.request.repoPath,
      });

      const synthesis = mission.synthesis?.summary || mission.result || '';
      const subtaskOutputs = (mission.subtasks || [])
        .filter(s => s.status === 'completed' && s.output)
        .map(s => `### ${s.agent} (${s.domain})\n${s.output}`)
        .join('\n\n');
      const failedSubtasks = (mission.subtasks || [])
        .filter(s => s.status === 'failed')
        .map(s => ({
          id: s.id,
          agent: s.agent,
          domain: s.domain,
          error: s.error || null,
          validation: s.validation || null,
        }));
      const completedCount = (mission.subtasks || []).filter(s => s.status === 'completed').length;
      const subtaskCount = mission.subtasks?.length || 0;
      const isMissionFailed = mission.status === 'failed' || failedSubtasks.length > 0;
      const missionHeadline = isMissionFailed
        ? `Mission failed - ${failedSubtasks.length}/${subtaskCount} subtasks failed, ${completedCount}/${subtaskCount} completed`
        : `Mission completed - ${completedCount}/${subtaskCount} subtasks`;
      const failureReport = failedSubtasks.length
        ? [
            '## Failed Lanes',
            '',
            ...failedSubtasks.map(s => [
              `- ${s.agent} (${s.domain})`,
              `  Error: ${s.error || 'unknown'}`,
              s.validation?.reason ? `  Validation: ${s.validation.reason}` : null,
              Array.isArray(s.validation?.missingFiles) && s.validation.missingFiles.length
                ? `  Missing file citations: ${s.validation.missingFiles.slice(0, 8).join(', ')}`
                : null,
            ].filter(Boolean).join('\n')),
          ].join('\n')
        : '';

      job.linkedMission = {
        missionId: mission.missionId || missionId,
        status: mission.status,
        subtaskCount: mission.subtasks?.length || 0,
        completedSubtasks: (mission.subtasks || []).filter(s => s.status === 'completed').length,
        failedSubtasks: failedSubtasks.length,
        failures: failedSubtasks,
        agentsUsed: [...new Set((mission.subtasks || []).map(s => s.agent))],
        metrics: mission.metrics || {},
      };
      job.finalReport = [
        synthesis || `Mission completed — ${job.linkedMission.completedSubtasks}/${job.linkedMission.subtaskCount} subtasks`,
        subtaskOutputs ? `\n\n---\n\n${subtaskOutputs}` : '',
      ].join('').trim();
      job.finalReport = [
        synthesis || missionHeadline,
        failureReport ? `\n\n${failureReport}` : '',
        subtaskOutputs ? `\n\n---\n\n${subtaskOutputs}` : '',
      ].join('').trim();
      job.state = isMissionFailed ? 'failed' : 'completed';
      job.finishedAt = now();
      this.addEvent(job, job.state === 'completed' ? 'completed' : 'failed', 'swarm-coordinator',
        `${job.linkedMission.completedSubtasks}/${job.linkedMission.subtaskCount} subtasks`);
      this.finishJob(job);
      return job;
    }

    const engine = createHarness({
      rootDir: this.rootDir,
      maxIterations: job.options.maxIterations,
      maxRetriesPerSubtask: job.options.maxRetriesPerSubtask,
    });
    job.engine = engine;

    engine.on('start', engineJob => {
      job.engineJobId = engineJob.id;
      this.addEvent(job, 'engine_started', 'harness-engine', engineJob.id);
      this.persist(job);
    });
    engine.on('trace', entry => {
      this.addEvent(job, entry.event || 'trace', entry.stage || 'harness-engine', entry.summary || '', entry);
    });
    engine.on('log', entry => {
      this.addEvent(job, `log_${entry.level || 'info'}`, 'harness-engine', entry.message || '', entry);
    });
    engine.on('state', engineJob => {
      job.state = mapEngineState(engineJob.state);
      job.plan = (engineJob.plan || []).map(s => ({
        id: s.id,
        index: s.index,
        state: s.state,
        verdict: s.verdict,
        description: s.description,
        dispatchedTo: s.dispatchedTo,
        verdictReason: s.verdictReason,
      }));
      this.persist(job);
    });

    const final = await engine.run(job.goal);
    job.state = mapEngineState(final.state);
    job.plan = final.plan || job.plan;
    job.finalReport = final.finalReport;
    job.engineJobId = final.id || job.engineJobId;
    job.finishedAt = final.finishedAt || now();
    job.persisted = final.persisted;
    delete job.engine;
    this.addEvent(job, 'completed', 'harness-engine', `engine finished as ${final.state}`);
    this.finishJob(job);
    return job;
  }

  failJob(job, error) {
    job.state = 'failed';
    job.error = error?.message || String(error);
    job.finishedAt = now();
    delete job.engine;
    this.addEvent(job, 'failed', 'kernel', job.error);
    this.finishJob(job);
  }

  finishJob(job) {
    this.persist(job);
    this.active.delete(job.id);
    this.archive.set(job.id, job);
    this.emit('job', publicSnapshot(job));
    // Self-training hook: every finished job is a training trajectory.
    // The buffer is best-effort and never throws — a disk failure here
    // does not break the runtime. Disabled by setting
    // PURPCLAW_TRAINING_DISABLED=1 in .env.
    try {
      const { TrainingBuffer } = require('./training-buffer');
      if (!this._trainingBuffer) this._trainingBuffer = new TrainingBuffer();
      this._trainingBuffer.record(job, { source: 'api-harness-kernel' });
    } catch (e) { /* swallow — training must not break runtime */ }
  }

  addEvent(job, type, stage, message, detail) {
    const event = {
      at: now(),
      iso: iso(),
      type,
      stage,
      message,
      detail,
    };
    job.events.push(event);
    if (job.events.length > MAX_EVENTS) job.events.shift();
    this.emit('event', { jobId: job.id, event, job: publicSnapshot(job) });
  }

  persist(job) {
    try {
      ensureArchiveDir();
      const filePath = path.join(ARCHIVE_DIR, `${job.id}.json`);
      const clean = { ...job };
      delete clean.engine;
      fs.writeFileSync(filePath, JSON.stringify(clean, null, 2));
      job.kernelPersisted = { path: filePath };
    } catch (error) {
      job.kernelPersisted = { error: error.message };
    }
  }
}

let singleton = null;

function createApiHarnessKernel(options = {}) {
  return new ApiHarnessKernel(options);
}

function getApiHarnessKernel(options = {}) {
  if (!singleton) singleton = createApiHarnessKernel(options);
  return singleton;
}

module.exports = {
  ApiHarnessKernel,
  createApiHarnessKernel,
  getApiHarnessKernel,
  publicSnapshot,
};
