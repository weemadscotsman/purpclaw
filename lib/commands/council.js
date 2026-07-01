'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const COUNCIL_PROFILES_PATH = path.resolve(__dirname, '..', '..', 'registry', 'council-profiles.json');

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function safeRequire(file, fallback = {}) {
  try { return require(file); }
  catch { return fallback; }
}

function compact(value, limit = 140) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
}

function gitStimulus(root) {
  try {
    const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
    const out = execFileSync('git', ['status', '--short'], {
      cwd: gitRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    const lines = out.split(/\r?\n/).filter(Boolean);
    const purp = lines.filter(line => line.includes('02_ACTIVE_PROJECTS/PURPCLAW/'));
    return {
      ok: true,
      git_root: gitRoot,
      total_changes: lines.length,
      purpclaw_changes: purp.length,
      sample: purp.slice(0, 8),
    };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

function loadStudioMemory(root) {
  const studioDir = path.join(root, 'podcast_studio');
  const shared = readJson(path.join(studioDir, 'shared_log.json'), {});
  const recentMessages = Array.isArray(shared.messages) ? shared.messages.slice(-8) : [];
  const episodesDir = path.join(studioDir, 'episodes');
  let recentEpisodes = [];
  try {
    recentEpisodes = fs.readdirSync(episodesDir)
      .filter(name => name.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 3)
      .map(name => {
        const data = readJson(path.join(episodesDir, name), {});
        return {
          file: name,
          topic: data.topic || data.currentTopic || '<unknown>',
          messages: data.messageCount || (Array.isArray(data.messages) ? data.messages.length : 0),
          endedAt: data.endedAt || data.ended_at || null,
        };
      });
  } catch {}

  return {
    current_topic: shared.currentTopic || null,
    episode_status: shared.episodeStatus || 'unknown',
    recent_messages: recentMessages.map(m => ({
      agent: m.agentId || m.agent || 'unknown',
      content: compact(m.content || m.text || ''),
      timestamp: m.timestamp || null,
    })),
    recent_episodes: recentEpisodes,
  };
}

function readCouncilProfiles(root) {
  return readJson(path.join(root, 'registry', 'council-profiles.json'), {
    schema: 'purpclaw.council-profiles.v1',
    defaults: { max_attendees: 8, required_seats: ['memory'], observer_seats: ['oracle'] },
    meeting_types: {},
    profiles: [],
  });
}

function questionTags(question) {
  const text = String(question || '').toLowerCase();
  const tags = new Set();
  const addIf = (tag, pattern) => { if (pattern.test(text)) tags.add(tag); };
  addIf('ui', /\b(ui|screen|component|route|nav|navigation|theme|shell)\b/);
  addIf('architecture', /\b(architecture|router|provider|service|module|subsystem|boundary|rewrite|refactor)\b/);
  addIf('providers', /\b(provider|model|llm|openrouter|minimax|latency)\b/);
  addIf('incident', /\b(broken|down|incident|outage|failing|failure|crash|red alert)\b/);
  addIf('security', /\b(security|threat|permission|secret|attack|risk)\b/);
  addIf('funding', /\b(funding|grant|finance|budget|spend|pricing|commercial|revenue)\b/);
  addIf('creative', /\b(brand|marketing|story|lore|creative|naming|audience)\b/);
  addIf('game', /\b(game|level|player|engine|art|audio|qa|mechanic)\b/);
  addIf('weather', /\b(weather|health|build|drift|status|latency)\b/);
  addIf('review', /\b(review|audit|ready|ship|verify|test)\b/);
  addIf('ceremony', /\b(meeting|planning|prd|ceremony|process)\b/);
  return [...tags];
}

function classifyMeeting(question, workflow, tags, profilesReg) {
  const types = profilesReg.meeting_types || {};
  if (tags.includes('funding')) return { id: 'funding', ...(types.funding || {}) };
  if (tags.includes('game')) return { id: 'game', ...(types.game || {}) };
  if (tags.includes('security') || tags.includes('incident')) return { id: 'security', ...(types.security || {}) };
  if (tags.includes('creative')) return { id: 'creative', ...(types.creative || {}) };
  if (tags.includes('weather')) return { id: 'operations', ...(types.operations || {}) };
  if (workflow && (workflow.id || '').includes('ui-consolidation')) return { id: 'engineering', ...(types.engineering || {}) };
  if (tags.includes('architecture') || tags.includes('providers') || tags.includes('ui')) return { id: 'engineering', ...(types.engineering || {}) };
  return { id: 'engineering', ...(types.engineering || {}) };
}

function profileScore(profile, meeting, tags, question) {
  let score = 0;
  const skills = new Set(profile.skills || []);
  const attendance = new Set(profile.attendance || []);
  const subscriptions = new Set(profile.subscriptions || []);
  const meetingSkills = new Set(meeting.skills || []);
  const meetingAttendance = new Set(meeting.attendance || []);

  if ((meeting.default_attendees || []).includes(profile.id)) score += 100;
  if ((meeting.optional_attendees || []).includes(profile.id)) score += 25;
  if (profile.id === meeting.chair) score += 90;
  if (attendance.has('all')) score += 20;
  for (const tag of tags) {
    if (skills.has(tag)) score += 18;
    if (attendance.has(tag)) score += 18;
    if (subscriptions.has(tag)) score += 22;
  }
  for (const skill of meetingSkills) if (skills.has(skill)) score += 10;
  for (const att of meetingAttendance) if (attendance.has(att)) score += 10;
  if (String(question || '').toLowerCase().includes(profile.id)) score += 50;
  if (profile.personality && profile.personality.confidence) score += Math.min(10, profile.personality.confidence / 10);
  return score;
}

function summonCouncil(question, workflow, weather, git, root) {
  const registry = readCouncilProfiles(root);
  const profiles = registry.profiles || [];
  const tags = questionTags(question);
  if (weather.condition === 'red_alert' || weather.condition === 'storm') tags.push('incident');

  const meeting = classifyMeeting(question, workflow, tags, registry);
  const max = (registry.defaults && registry.defaults.max_attendees) || 8;
  const profileById = new Map(profiles.map(p => [p.id, p]));
  const invited = new Map();
  const invite = (id, reason, invitedBy = 'oracle', score = 0) => {
    const profile = profileById.get(id);
    if (!profile || invited.has(id)) return;
    invited.set(id, { ...profile, reason, invited_by: invitedBy, attendance_mode: 'invited', summon_score: score });
  };

  invite(meeting.chair || 'oracle', 'meeting chair', 'summons', 1000);
  for (const id of meeting.default_attendees || []) invite(id, 'default attendee for meeting type', 'summons', 900);
  for (const id of (registry.defaults && registry.defaults.required_seats) || []) invite(id, 'required institutional seat', 'summons', 850);

  const scored = profiles
    .map(profile => ({ profile, score: profileScore(profile, meeting, tags, question) }))
    .filter(item => item.score >= 25)
    .sort((a, b) => b.score - a.score);
  for (const item of scored) {
    if (invited.size >= max) break;
    invite(item.profile.id, `matched ${meeting.id} council tags (${tags.join(', ') || 'general'})`, 'oracle', item.score);
  }

  const interrupts = [];
  const interrupt = (id, trigger) => {
    const profile = profileById.get(id);
    if (!profile || invited.has(id)) return;
    if (invited.size >= max) {
      if (id !== 'goose') return;
      const removable = [...invited.values()]
        .filter(a => a.id !== (meeting.chair || 'oracle') && a.id !== 'memory')
        .sort((a, b) => (a.summon_score || 0) - (b.summon_score || 0))[0];
      if (!removable || (removable.summon_score || 0) >= 850) return;
      invited.delete(removable.id);
    }
    const entry = { ...profile, reason: trigger, invited_by: 'system-trigger', attendance_mode: 'interrupt', summon_score: 500 };
    invited.set(id, entry);
    interrupts.push({ id, name: profile.name, trigger, priority: profile.interrupt_priority || 3 });
  };

  if (weather.condition === 'red_alert' || weather.condition === 'storm' || tags.includes('weather')) interrupt('weatherman', 'weather changed or operational health is central');
  if (tags.includes('funding')) interrupt('finance', 'funding/spend topic detected');
  if (tags.includes('security') || tags.includes('incident')) interrupt('smith', 'risk/security/incident topic detected');
  if (tags.includes('ceremony') || tags.includes('architecture') || tags.includes('ui')) interrupt('goose', 'friction requested by over-planning/architecture topic');
  if (tags.includes('game')) interrupt('qa', 'game topic requires verification');

  const attendees = [...invited.values()].sort((a, b) => {
    if (a.id === meeting.chair) return -1;
    if (b.id === meeting.chair) return 1;
    return (a.interrupt_priority || 9) - (b.interrupt_priority || 9);
  });

  const chair = attendees.find(a => a.id === meeting.chair) || profileById.get(meeting.chair) || profileById.get('oracle') || attendees[0] || null;
  const oracle = profileById.get('oracle');
  const oracleRole = chair && chair.id === 'oracle' ? 'chair' : 'observer/escalation';
  if (oracle && !attendees.find(a => a.id === 'oracle')) {
    attendees.push({ ...oracle, reason: oracleRole, invited_by: 'governance', attendance_mode: 'observer' });
  }

  return {
    registry_schema: registry.schema,
    meeting_type: meeting.id,
    chair: chair ? { id: chair.id, name: chair.name, seat: chair.seat } : null,
    oracle_role: oracleRole,
    tags,
    attendees,
    interrupts,
  };
}

function pickWorkflow(question, registry) {
  const text = String(question || '').toLowerCase();
  if (/\b(ui|screen|component|route|nav|navigation|theme|shell)\b/.test(text)) return registry.findWorkflow('council.ui-consolidation');
  if (/\b(architecture|router|provider|service|module|subsystem|boundary)\b/.test(text)) return registry.findWorkflow('council.architecture');
  if (/\b(weather|health|build|provider|latency|drift|status)\b/.test(text)) return registry.findWorkflow('council.weather');
  if (/\b(review|audit|risk|should we ship|ready)\b/.test(text)) return registry.findWorkflow('council.review');
  return registry.findWorkflow('council.decide') || registry.findWorkflow('runtime.council');
}

function deriveDecision(question, weather, next, git, workflow) {
  const q = String(question || '').toLowerCase();
  const risks = [];
  if (weather.condition === 'red_alert' || weather.condition === 'storm') risks.push(`system weather is ${weather.condition}`);
  if (git.ok && git.purpclaw_changes > 25) risks.push(`${git.purpclaw_changes} PURPCLAW worktree changes increase merge/review risk`);
  if (next.missing && next.missing.length) risks.push(`missing planning artifacts: ${next.missing.join(', ')}`);

  let decision = 'proceed with a bounded implementation slice';
  let confidence = 0.66;
  let nextCommand = next.next_command || 'purpclaw next';

  if (weather.safe_to_build === false) {
    decision = 'hold feature work and clear operational risk first';
    confidence = 0.78;
    nextCommand = 'purpclaw weather';
  } else if (/\b(rebuild|rewrite|delete|rip|remove whole|start over)\b/.test(q)) {
    decision = 'do not big-bang rebuild; run a consolidation or validation slice first';
    confidence = 0.74;
    nextCommand = workflow && workflow.id === 'council.ui-consolidation'
      ? 'purpclaw workflow council.ui-consolidation'
      : 'purpclaw workflow solution.architecture-validate';
  } else if (/\b(ui|route|component|nav|navigation|theme|shell)\b/.test(q)) {
    decision = 'consolidate the UI surface in inventory-first order';
    confidence = 0.72;
    nextCommand = 'purpclaw workflow council.ui-consolidation';
  } else if (/\b(oracle|weatherman|council|podcast|studio)\b/.test(q)) {
    decision = 'continue wiring the reasoning interface without disturbing the media pipeline';
    confidence = 0.7;
    nextCommand = 'purpclaw workflow council.decide';
  }

  return { decision, confidence, risks, nextCommand };
}

function lineForAttendee(attendee, context) {
  const { question, weather, next, git, memory, derived, summons } = context;
  const id = attendee.id;
  const lastMemory = context.lastMemory;
  const lines = {
    oracle: summons.chair && summons.chair.id === 'oracle'
      ? `Question accepted: "${question}". I am chairing because no specialist chair owns this cleanly.`
      : `I am observing. ${summons.chair ? summons.chair.name : 'The chair'} owns this meeting unless consensus fails.`,
    weatherman: `Current weather is ${weather.condition || 'unknown'}; safe_to_build=${weather.safe_to_build}. ${compact(weather.summary || 'No weather summary available.')}`,
    hermes: `The next-step engine says phase=${next.phase}; missing=${(next.missing || []).join(', ') || 'nothing obvious'}. Logs first, heroics second.`,
    goose: git.ok && git.purpclaw_changes > 25
      ? `Mate, ${git.purpclaw_changes} PURPCLAW changes in the tree and you want a grand gesture? Ship a slice, not a cathedral.`
      : `If this turns into another ceremony parade, I am honking. What is the smallest live move that teaches us something?`,
    openclaude: `The hidden premise is that a cleaner structure is automatically better. Is it reducing uncertainty, or just making us feel tidy?`,
    architect: `I care about the boundary, migration path, and blast radius. Do not move routes before there is a map.`,
    smith: derived.risks.length
      ? `I can break the plan through: ${derived.risks.join('; ')}.`
      : `I do not see a blocker yet, but I would still attack rollback, ownership, and stale assumptions before execution.`,
    neo: `Evidence accepted from weather, workflow registry, git status, and Studio memory. I still want a verification step before sign-off.`,
    memory: `Callback: ${lastMemory}. I will record the rationale once the meeting has an artifact worth keeping.`,
    finance: `If this changes spend, pricing, or grant posture, I need numbers before enthusiasm.`,
    analytics: `Bring me the trend, not the anecdote. What signal would prove this decision worked?`,
    'grant-writer': `If this needs funding, turn the technical claim into evidence a stranger can verify.`,
    brand: `The story has to survive outside the room. What will a user think this is?`,
    marketing: `If nobody understands why it matters, it will not matter how clever the architecture is.`,
    lore: `Continuity matters. Do not rename the world every time the system grows a new limb.`,
    'game-director': `What does the player do, and why do they care? Scope follows that.`,
    art: `The visual language should reveal the product before text explains it.`,
    audio: `If this reaches voice or Studio, the rhythm and recognisable voices are part of the interface.`,
    engine: `The idea is only real if the runtime can carry it.`,
    qa: `I am here to find the broken bit while it is still cheap.`,
  };
  return lines[id] || attendee.default_line || `${attendee.name} is present because ${attendee.reason}.`;
}

function buildCouncilTurns(question, workflow, weather, next, git, memory, derived, summons) {
  const lastMemory = memory.recent_messages[0]
    ? `${memory.recent_messages[0].agent}: ${memory.recent_messages[0].content}`
    : memory.recent_episodes[0]
      ? `recent episode "${memory.recent_episodes[0].topic}"`
      : 'no useful Studio callback yet';

  const turns = [
    {
      seat: summons.chair ? summons.chair.name : 'Oracle',
      role: 'chair',
      line: `Meeting called: ${summons.meeting_type}. Workflow=${workflow ? workflow.id : 'council.decide'}. Attendees=${summons.attendees.map(a => a.name).join(', ')}.`,
    },
    ...summons.attendees.map(attendee => ({
      seat: attendee.name,
      role: attendee.seat || attendee.id,
      attendance_mode: attendee.attendance_mode,
      reason: attendee.reason,
      line: lineForAttendee(attendee, { question, workflow, weather, next, git, memory, derived, summons, lastMemory }),
    })),
    {
      seat: summons.chair ? summons.chair.name : 'Oracle',
      role: 'decision',
      line: `Decision: ${derived.decision}. Next command: ${derived.nextCommand}.`,
    },
  ];
  return turns;
}

function buildActions(summons, derived) {
  const actions = [];
  for (const attendee of summons.attendees) {
    const id = attendee.id;
    if (id === 'hermes') actions.push({ agent: id, action: 'prepare implementation slice and handoff', command: derived.nextCommand });
    else if (id === 'architect') actions.push({ agent: id, action: 'produce migration or boundary map', command: 'purpclaw workflow council.architecture' });
    else if (id === 'smith') actions.push({ agent: id, action: 'attack the plan for failure modes', command: 'purpclaw workflow council.review' });
    else if (id === 'neo' || id === 'qa') actions.push({ agent: id, action: 'define verification evidence and regression checks', command: 'purpclaw workflow solution.test-design' });
    else if (id === 'memory') actions.push({ agent: id, action: 'record rationale when write-memory is enabled', command: null });
    else if (id === 'weatherman') actions.push({ agent: id, action: 'watch weather changes and interrupt on incident', command: 'purpclaw weather' });
    else if (id === 'finance') actions.push({ agent: id, action: 'check budget/spend impact', command: 'purpclaw workflow council.weather' });
    else if (id === 'brand' || id === 'marketing') actions.push({ agent: id, action: 'translate decision into audience-facing rationale', command: null });
  }
  if (!actions.length) actions.push({ agent: summons.chair ? summons.chair.id : 'oracle', action: 'own next command', command: derived.nextCommand });
  return actions;
}

function printReport(report, ctx = {}) {
  const C = ctx.C || {};
  const col = ctx.col || ((_, value) => value);
  const c = (color, value) => col(color, value);
  console.log('');
  console.log(c((C.bold || '') + (C.cyan || ''), 'PURPCLAW COUNCIL SESSION'));
  console.log(`  Question: ${report.question}`);
  console.log(`  Meeting: ${report.summons.meeting_type}`);
  console.log(`  Chair: ${report.summons.chair ? report.summons.chair.name : 'none'}  Oracle: ${report.summons.oracle_role}`);
  console.log(`  Attendees: ${report.summons.attendees.map(a => a.name).join(', ')}`);
  console.log(`  Workflow: ${report.workflow ? report.workflow.id : 'none'}`);
  console.log(`  Decision: ${c(C.green || '', report.decision)}`);
  console.log(`  Confidence: ${report.confidence}`);
  console.log(`  Next command: ${c(C.cyan || '', report.next_command)}`);
  console.log('');
  for (const turn of report.turns) {
    console.log(`${turn.seat} (${turn.role})`);
    console.log(`  ${turn.line}`);
  }
  if (report.risks.length) {
    console.log('');
    console.log('Risks');
    for (const risk of report.risks) console.log(`  - ${risk}`);
  }
  if (report.actions.length) {
    console.log('');
    console.log('Actions');
    for (const action of report.actions) console.log(`  - ${action.agent}: ${action.action}${action.command ? ` (${action.command})` : ''}`);
  }
  console.log('');
}

async function run(args = [], ctx = {}) {
  const root = ctx.PURP_DIR || path.resolve(__dirname, '..', '..');
  const json = args.includes('--json');
  const question = args.filter(a => !a.startsWith('--')).join(' ').trim() || 'What should PURPCLAW do next?';

  const registry = require(path.join(root, 'lib', 'workflow-registry.js'));
  const weatherman = safeRequire(path.join(root, 'lib', 'weatherman.js'), {});
  const workflow = pickWorkflow(question, registry);
  const [weather] = await Promise.all([
    weatherman.report ? weatherman.report() : Promise.resolve({ condition: 'unknown', safe_to_build: null, summary: 'weatherman unavailable' }),
  ]);
  const next = registry.nextStep(question);
  const git = gitStimulus(root);
  const memory = loadStudioMemory(root);
  const summons = summonCouncil(question, workflow, weather, git, root);
  const derived = deriveDecision(question, weather, next, git, workflow);
  const turns = buildCouncilTurns(question, workflow, weather, next, git, memory, derived, summons);
  const actions = buildActions(summons, derived);

  const report = {
    schema: 'purpclaw.council-session.v1',
    generated_at: new Date().toISOString(),
    question,
    workflow,
    summons: {
      registry_schema: summons.registry_schema,
      meeting_type: summons.meeting_type,
      chair: summons.chair,
      oracle_role: summons.oracle_role,
      tags: summons.tags,
      interrupts: summons.interrupts,
      attendees: summons.attendees.map(a => ({
        id: a.id,
        name: a.name,
        seat: a.seat,
        attendance_mode: a.attendance_mode,
        invited_by: a.invited_by,
        reason: a.reason,
        skills: a.skills,
        relationships: a.relationships,
      })),
    },
    decision: derived.decision,
    confidence: derived.confidence,
    next_command: derived.nextCommand,
    risks: derived.risks,
    stimuli: {
      weather: {
        condition: weather.condition,
        safe_to_build: weather.safe_to_build,
        summary: weather.summary,
        warnings: Array.isArray(weather.warnings) ? weather.warnings.slice(0, 8) : [],
      },
      next_step: {
        phase: next.phase,
        complexity: next.complexity,
        missing: next.missing,
        command: next.next_command,
      },
      git,
      studio_memory: memory,
    },
    turns,
    actions,
    execution: {
      mode: 'read_only_terminal_first',
      tts: false,
      telegram: false,
      dashboard: false,
      writes_memory: false,
    },
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }
  printReport(report, ctx);
  return report;
}

module.exports = { run };
