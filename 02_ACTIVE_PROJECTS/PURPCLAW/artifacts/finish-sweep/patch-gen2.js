const fs = require('fs');
const G = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/artifacts/finish-sweep/gen-registry.js';
let g = fs.readFileSync(G, 'utf8');

const marker = "weather: ['workspace', 'Operational weather report', 1],\n  completion: ['workspace', 'Emit shell completion script (bash/zsh/powershell)', 0],";
if (!g.includes(marker)) { console.error('marker missing'); process.exit(1); }

const additions = `
  // ── Second wiring batch (2026-08-18): emptying the command-module graveyard ──
  awaken: ['lifecycle', 'Wake ritual: boot stack into work / watch mode', 0],
  'apply-diff': ['dev', 'Parse and apply a unified diff (stdin or file)', 0],
  buddy: ['workspace', 'Buddy pairing surface', 0],
  business: ['workspace', 'Business operations + Twilio surface', 1],
  capabilities: ['systems', 'Capability report (built vs running vs integrated)', 1],
  crew: ['agents', 'Crew roster + model-per-agent routing preview', 1],
  deploy: ['dev', 'One-command VPS deployment via Docker', 0],
  app: ['workspace', 'WebUI desktop launcher status/control', 1],
  drift: ['systems', 'Drift watcher: config vs reality, optional --fix', 1],
  eval: ['training', 'Run an eval dataset through the stack', 1],
  feedback: ['training', 'Personal model feedback submit/status/list', 1],
  grow: ['agents', 'Grow the agent pool / skills garden', 1],
  harness: ['agents', 'Autonomous productivity harness control', 1],
  harvest: ['research', 'Data harvester: crawl, fingerprint, classify, index', 1],
  'init-project': ['dev', 'Scaffold a new project from templates', 0],
  intelligence: ['systems', 'Full intelligence report (health + capability)', 1],
  liveforge: ['agents', 'Liveforge run control', 1],
  marketplace: ['tools', 'Skill/agent package marketplace', 1],
  mycelium: ['cognition', 'Mycelium knowledge-network queries', 1],
  open: ['workspace', 'Explicit UI launcher (web, tui, mission)', 0],
  oracle: ['governance', 'Oracle forecast for decisions', 1],
  permissions: ['governance', 'Interactive permissions manager', 0],
  plugin: ['tools', 'Plugin list/enable/disable (Codex parity)', 1],
  remotion: ['dev', 'Remotion video stack control surface', 1],
  repomap: ['dev', 'Repository map generator', 1],
  personas: ['agents', 'Tower swarm vs disk persona audit', 1],
  sandbox: ['governance', 'Sandbox lifecycle management (Docker/local)', 1],
  schedule: ['systems', 'PurpClaw-native cron scheduling', 1],
  spinebus: ['cognition', 'Spine bus state + queries', 1],
  thringlets: ['agents', 'Thringlet colony lens + interaction', 1],
  watch: ['dev', 'File system watcher CLI', 1],
  worktree: ['dev', 'Git worktree management', 1],`;

g = g.replace(marker, marker + additions);
fs.writeFileSync(G, g);
console.log('generator updated with 31 second-batch commands');
