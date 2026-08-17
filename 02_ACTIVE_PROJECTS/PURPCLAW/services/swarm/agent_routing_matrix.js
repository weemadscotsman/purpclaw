'use strict';

const AGENT_ROUTING = {
  duck: {
    division: 'MEDIA_OPS',
    role: 'Research Accelerant',
    give: ['research briefs', 'data gathering', 'media/data scans', 'quick fact collection'],
    needs: ['question', 'scope', 'sources or target domain', 'output format'],
    avoid: ['final security approval', 'deep architecture ownership']
  },
  ghost: {
    division: 'INTELLIGENCE',
    role: 'Quality Guardian',
    give: ['quality review', 'regression risk checks', 'security-adjacent QA', 'quiet audit passes'],
    needs: ['diff or target files', 'expected behavior', 'risk tolerance'],
    avoid: ['large implementation without a builder']
  },
  dragon: {
    division: 'ENGINEERING',
    role: 'Chief Architect',
    give: ['architecture', 'large builds', 'scaling plans', 'high-load systems', 'major design decisions'],
    needs: ['goal', 'constraints', 'existing architecture', 'success criteria'],
    avoid: ['tiny tactical edits better handled by robot or bee']
  },
  octopus: {
    division: 'SECURITY',
    role: 'Edge Case Hunter',
    give: ['edge cases', 'abuse cases', 'test matrices', 'failure-mode analysis'],
    needs: ['feature surface', 'inputs/outputs', 'known risks'],
    avoid: ['primary product copy or visual polish']
  },
  robot: {
    division: 'ENGINEERING',
    role: 'Precision Engineer',
    give: ['coding', 'automation', 'repeatable execution', 'build fixes', 'mechanical implementation'],
    needs: ['specific task', 'files or subsystem', 'verification command'],
    avoid: ['open-ended strategy without a plan']
  },
  mushroom: {
    division: 'ENGINEERING',
    role: 'Organic Refactorer',
    give: ['refactors', 'UI feel', 'component cleanup', 'design-system fit', 'code health'],
    needs: ['current pain', 'desired behavior', 'style constraints'],
    avoid: ['high-risk security changes']
  },
  chonk: {
    division: 'ENGINEERING',
    role: 'Simplification Expert',
    give: ['simplification', 'cleanup', 'performance trimming', 'removing over-complexity'],
    needs: ['what feels heavy', 'must-keep behavior', 'perf target if any'],
    avoid: ['novel research or exploratory design']
  },
  owl: {
    division: 'SECURITY',
    role: 'Security Auditor',
    give: ['security audit', 'code review', 'threat modeling', 'compliance-sensitive review'],
    needs: ['diff or endpoint', 'data sensitivity', 'auth boundary'],
    avoid: ['shipping implementation without a builder']
  },
  cactus: {
    division: 'INFRASTRUCTURE',
    role: 'Efficiency Auditor',
    give: ['performance diagnosis', 'monitoring', 'resource issues', 'server troubleshooting'],
    needs: ['symptoms', 'logs/metrics', 'service name', 'acceptable downtime'],
    avoid: ['creative ideation']
  },
  penguin: {
    division: 'MANAGEMENT',
    role: 'Project Coordinator',
    give: ['planning', 'workflow coordination', 'cold-start triage', 'safe sequencing'],
    needs: ['objective', 'constraints', 'priority', 'definition of done'],
    avoid: ['being sole executor for code-heavy jobs']
  },
  goose: {
    division: 'MEDIA_OPS',
    role: 'Chaos Catalyst',
    give: ['creative shakeups', 'alternate angles', 'content energy', 'idea expansion'],
    needs: ['theme', 'audience', 'tone boundary'],
    avoid: ['precision/security-only tasks']
  },
  turtle: {
    division: 'ENGINEERING',
    role: 'Quality Engineer',
    give: ['testing', 'stability checks', 'slow careful QA', 'release confidence'],
    needs: ['test target', 'expected behavior', 'commands to run'],
    avoid: ['rushed exploratory hacks']
  },
  axolotl: {
    division: 'ENGINEERING',
    role: 'Regeneration Specialist',
    give: ['recovery', 'repair after failure', 'adaptive refactor', 'broken flow restoration'],
    needs: ['failure evidence', 'last known good behavior', 'safe rollback boundary'],
    avoid: ['fresh architecture from nothing']
  },
  rabbit: {
    division: 'SECURITY',
    role: 'Defensive Programmer',
    give: ['validation', 'input hardening', 'quick tests', 'defensive fixes'],
    needs: ['entry points', 'bad inputs', 'expected safe behavior'],
    avoid: ['broad system ownership']
  },
  void: {
    division: 'INFRASTRUCTURE',
    role: 'Null Handler',
    give: ['null safety', 'error handling', 'cleanup of dead paths', 'empty-state resilience'],
    needs: ['crash/edge case', 'nullable fields', 'fallback rules'],
    avoid: ['feature ideation']
  },
  wolf: {
    division: 'ENGINEERING',
    role: 'Pack Leader',
    give: ['team leadership', 'multi-agent coordination', 'complex build orchestration'],
    needs: ['mission', 'subtasks', 'agent constraints', 'stop conditions'],
    avoid: ['single trivial edits']
  },
  spider: {
    division: 'INTELLIGENCE',
    role: 'Intel Specialist',
    give: ['web/OSINT research', 'source mapping', 'competitive intel', 'broad collection'],
    needs: ['target', 'scope limits', 'allowed sources', 'freshness requirement'],
    avoid: ['sensitive data transmission without explicit approval']
  },
  raven: {
    division: 'INTELLIGENCE',
    role: 'Signals Analyst',
    give: ['logs/signals monitoring', 'comms analysis', 'event stream interpretation'],
    needs: ['signal source', 'time window', 'anomaly definition'],
    avoid: ['large code changes']
  },
  snake: {
    division: 'SECURITY',
    role: 'Primary Access',
    give: ['auth/access review', 'permission logic', 'credential-flow analysis'],
    needs: ['auth boundary', 'roles', 'secrets policy', 'endpoint list'],
    avoid: ['creating persistent keys without approval']
  },
  bee: {
    division: 'ENGINEERING',
    role: 'Pollination Specialist',
    give: ['integration', 'connecting services', 'API glue', 'event bus wiring'],
    needs: ['two systems to connect', 'contract/schema', 'failure handling'],
    avoid: ['deep standalone research']
  },
  bunny: {
    division: 'SECURITY',
    role: 'Quick Reaction',
    give: ['urgent small fixes', 'alerts', 'fast validation', 'quick containment'],
    needs: ['immediate symptom', 'blast radius', 'time limit'],
    avoid: ['large slow refactors']
  },
  guardian: {
    division: 'SECURITY',
    role: 'Real-time Monitor',
    give: ['security scans', 'secrets detection', 'dependency audit', 'deployment blocking advice'],
    needs: ['repo or file scope', 'scan type', 'severity threshold'],
    avoid: ['non-security creative work']
  },
  karen: {
    division: 'MANAGEMENT',
    role: 'Quality Control',
    give: ['acceptance criteria', 'standards enforcement', 'release gatekeeping'],
    needs: ['requirements', 'quality bar', 'exceptions allowed'],
    avoid: ['hands-on low-level coding']
  },
  lemur: {
    division: 'MANAGEMENT',
    role: 'Resource Manager',
    give: ['allocation', 'capacity planning', 'budget/resource choices'],
    needs: ['available agents', 'deadline', 'priority tradeoffs'],
    avoid: ['security-critical signoff']
  },
  mantis: {
    division: 'OPERATIONS',
    role: 'Precision Striker',
    give: ['targeted actions', 'surgical fixes', 'one sharp operational task'],
    needs: ['exact target', 'desired end state', 'constraints'],
    avoid: ['open-ended exploration']
  },
  shark: {
    division: 'OPERATIONS',
    role: 'Hunter',
    give: ['tracking bugs', 'deployment pursuit', 'following leads to root cause'],
    needs: ['trail', 'symptom', 'where to look first'],
    avoid: ['gentle ideation']
  },
  gorilla: {
    division: 'OPERATIONS',
    role: 'Heavy Lifter',
    give: ['heavy operations', 'bulk migration', 'deployment muscle', 'large repetitive work'],
    needs: ['task batch', 'guardrails', 'rollback/stop condition'],
    avoid: ['delicate auth/security nuance alone']
  },
  phoenix: {
    division: 'CREATIVE',
    role: 'Rebirth Specialist',
    give: ['reinvention', 'restart/recovery narratives', 'transforming stale features'],
    needs: ['what is failing', 'desired new identity', 'non-negotiables'],
    avoid: ['pure statistical work']
  },
  fox: {
    division: 'INTELLIGENCE',
    role: 'Strategy Specialist',
    give: ['strategy', 'optimization pathfinding', 'clever route selection'],
    needs: ['goal', 'constraints', 'opponents/risks', 'success metric'],
    avoid: ['routine repetitive implementation']
  },
  crow: {
    division: 'CREATIVE',
    role: 'Gatherer',
    give: ['collection', 'observation notes', 'content gathering', 'asset inventory'],
    needs: ['collection criteria', 'where to search', 'format'],
    avoid: ['final analysis without analyst partner']
  },
  scientist: {
    division: 'SCIENCE',
    role: 'Research Lead',
    give: ['experiments', 'hypothesis testing', 'prototype evaluation', 'technical research'],
    needs: ['hypothesis', 'method', 'data/source', 'success threshold'],
    avoid: ['pure UI polish']
  },
  hawk: {
    division: 'INTELLIGENCE',
    role: 'Aerial Recon',
    give: ['high-level reconnaissance', 'scouting codebase areas', 'surface mapping'],
    needs: ['area of interest', 'known landmarks', 'depth limit'],
    avoid: ['deep archive recovery']
  },
  elephant: {
    division: 'OPERATIONS',
    role: 'Memory Keeper',
    give: ['memory/context preservation', 'long-term planning', 'historical continuity'],
    needs: ['facts to preserve', 'timeline', 'retrieval purpose'],
    avoid: ['fast reactive edits']
  },
  panda: {
    division: 'CREATIVE',
    role: 'Content Specialist',
    give: ['content drafts', 'friendly UX text', 'media copy', 'soft presentation'],
    needs: ['audience', 'tone', 'message', 'length'],
    avoid: ['security/code ownership']
  },
  parrot: {
    division: 'MEDIA_OPS',
    role: 'Communication Bridge',
    give: ['translation', 'summaries', 'message adaptation', 'cross-channel wording'],
    needs: ['source message', 'target audience/channel', 'tone'],
    avoid: ['private message sending without confirmation']
  },
  shaman: {
    division: 'CREATIVE',
    role: 'Creativity Co-Processor',
    give: ['high-entropy exploration', 'weird concepts', 'creative breakthroughs'],
    needs: ['theme', 'boundaries', 'how strange is allowed'],
    avoid: ['final safety decision']
  },
  chart: {
    division: 'SCIENCE',
    role: 'Visualization Specialist',
    give: ['charts', 'dashboards', 'metrics visuals', 'data storytelling'],
    needs: ['data', 'audience', 'chart goal', 'format'],
    avoid: ['raw data collection without duck/numbers']
  },
  claw: {
    division: 'OPERATIONS',
    role: 'Tooling Integrator',
    give: ['tool control', 'automation hooks', 'local capability wiring'],
    needs: ['tool target', 'allowed actions', 'interface contract'],
    avoid: ['sensitive actions without confirmation']
  },
  innovator: {
    division: 'SCIENCE',
    role: 'Emerging Tech Scout',
    give: ['new tech evaluation', 'prototype options', 'future-facing design'],
    needs: ['problem', 'constraints', 'evaluation criteria'],
    avoid: ['routine maintenance']
  },
  jellyfish: {
    division: 'INTELLIGENCE',
    role: 'Ambient Observer',
    give: ['passive monitoring', 'drift detection', 'background observation'],
    needs: ['signals to watch', 'thresholds', 'report cadence'],
    avoid: ['urgent execution']
  },
  kraken: {
    division: 'INTELLIGENCE',
    role: 'Deep Data Specialist',
    give: ['deep search', 'archive recovery', 'legacy data', 'buried context'],
    needs: ['target data', 'likely locations', 'depth/time budget'],
    avoid: ['surface quick search better handled by spider/duck']
  },
  moth: {
    division: 'INTELLIGENCE',
    role: 'Pattern Detector',
    give: ['trend tracking', 'pattern detection', 'weak-signal finding'],
    needs: ['sample set', 'time span', 'pattern type'],
    avoid: ['single deterministic coding task']
  },
  navigator: {
    division: 'MANAGEMENT',
    role: 'Route Planner',
    give: ['filesystem navigation', 'workflow route planning', 'where-is-it tasks'],
    needs: ['starting point', 'target name/path', 'allowed search depth'],
    avoid: ['content creation']
  },
  numbers: {
    division: 'SCIENCE',
    role: 'Statistical Analyst',
    give: ['statistics', 'forecasting', 'hypothesis analysis', 'quantitative decisions'],
    needs: ['dataset/metrics', 'question', 'confidence level', 'output format'],
    avoid: ['visual polish without chart']
  }
};

const INTENT_AGENT_MAP = {
  plan: ['penguin', 'wolf', 'dragon'],
  build: ['wolf', 'robot', 'bee', 'dragon'],
  code: ['robot', 'bee', 'dragon'],
  fix: ['mantis', 'rabbit', 'cactus', 'robot'],
  debug: ['shark', 'cactus', 'rabbit', 'robot'],
  refactor: ['mushroom', 'axolotl', 'chonk', 'robot'],
  test: ['turtle', 'rabbit', 'octopus', 'robot'],
  review: ['owl', 'ghost', 'karen'],
  audit: ['guardian', 'owl', 'ghost', 'snake'],
  security: ['guardian', 'owl', 'snake', 'rabbit'],
  research: ['scientist', 'duck', 'spider', 'kraken'],
  search: ['spider', 'duck', 'kraken', 'hawk'],
  analyze: ['numbers', 'turtle', 'octopus', 'hawk'],
  data: ['numbers', 'duck', 'chart', 'kraken'],
  visualize: ['chart', 'numbers'],
  dashboard: ['chart', 'bee', 'robot'],
  design: ['mushroom', 'dragon', 'panda', 'goose'],
  content: ['panda', 'parrot', 'phoenix'],
  communicate: ['parrot', 'panda', 'karen'],
  optimize: ['chonk', 'fox', 'cactus'],
  performance: ['cactus', 'chonk', 'numbers'],
  deploy: ['gorilla', 'shark', 'cactus'],
  infrastructure: ['cactus', 'void', 'bee', 'navigator'],
  integrate: ['bee', 'claw', 'robot'],
  automate: ['robot', 'claw', 'bee'],
  navigate: ['navigator', 'hawk'],
  memory: ['elephant', 'kraken'],
  monitor: ['jellyfish', 'raven', 'guardian'],
  pattern: ['moth', 'numbers', 'fox'],
  strategy: ['fox', 'dragon', 'wolf'],
  creative: ['shaman', 'goose', 'phoenix', 'panda'],
  recover: ['axolotl', 'phoenix', 'kraken', 'void'],
  urgent: ['bunny', 'mantis', 'guardian'],
  coordinate: ['wolf', 'penguin', 'lemur'],
  allocate: ['lemur', 'penguin', 'navigator']
};

const TEAM_TEMPLATES = {
  build: { leader: 'wolf', members: ['robot', 'bee', 'dragon'], description: 'Build execution' },
  design: { leader: 'dragon', members: ['mushroom', 'panda', 'goose'], description: 'Product design' },
  research: { leader: 'scientist', members: ['duck', 'spider', 'numbers'], description: 'Research synthesis' },
  audit: { leader: 'guardian', members: ['owl', 'ghost', 'snake'], description: 'Security and quality audit' },
  fix: { leader: 'mantis', members: ['rabbit', 'robot', 'cactus'], description: 'Targeted repair' },
  analyze: { leader: 'numbers', members: ['turtle', 'octopus', 'chart'], description: 'Analysis and reporting' },
  dashboard: { leader: 'chart', members: ['numbers', 'bee', 'robot'], description: 'Dashboard and metrics view build' },
  deploy: { leader: 'gorilla', members: ['shark', 'cactus', 'guardian'], description: 'Deployment operations' },
  refactor: { leader: 'mushroom', members: ['axolotl', 'chonk', 'robot'], description: 'Refactor and cleanup' },
  test: { leader: 'turtle', members: ['rabbit', 'octopus', 'robot'], description: 'Testing and validation' },
  monitor: { leader: 'jellyfish', members: ['raven', 'guardian', 'moth'], description: 'Monitoring and drift detection' },
  creative: { leader: 'shaman', members: ['goose', 'phoenix', 'panda'], description: 'Creative exploration' },
  data: { leader: 'numbers', members: ['duck', 'chart', 'kraken'], description: 'Data analysis' }
};

module.exports = { AGENT_ROUTING, INTENT_AGENT_MAP, TEAM_TEMPLATES };
