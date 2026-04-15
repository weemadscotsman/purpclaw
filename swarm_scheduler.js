/**
 * PURPCLAW SWARM SCHEDULER v1.0
 * ===============================
 * Reads cognitive_tasks.json, parses agent assignments, and executes
 * agent spawns through companion_swarm.js with proper delays and coordination.
 *
 * Usage: node swarm_scheduler.js [--daemon] [--task T1] [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Config
const PURP_DIR = path.join(__dirname);
const TASKS_FILE = path.join(PURP_DIR, 'cognitive_tasks.json');
const COMPANION_SWARM_PATH = path.join(PURP_DIR, 'companion_swarm.js');
const CONTROL_API_URL = 'http://localhost:7780';

// Load companion swarm
let companionSwarm;
try {
  companionSwarm = require(COMPANION_SWARM_PATH);
} catch(e) {
  console.error('[SCHEDULER] Failed to load companion_swarm.js:', e.message);
  process.exit(1);
}

// Load Agent Tower registry for agent info
let AGENT_REGISTRY = {};
try {
  const AgentTower = require('./agent_tower.js');
  AGENT_REGISTRY = AgentTower.AGENT_TOWER?.registry || {};
} catch(e) {
  console.error('[SCHEDULER] Failed to load agent_tower.js:', e.message);
}

// Helper to check if agent exists and get info
function getAgentInfo(agentKey) {
  return AGENT_REGISTRY[agentKey?.toLowerCase()] || null;
}

function agentExists(agentKey) {
  return getAgentInfo(agentKey) !== null;
}

// Agent name aliases (notes may say "Wolf" but agent key is "wolf")
const AGENT_ALIASES = {
  'dragon': 'dragon', 'wolf': 'wolf', 'spider': 'spider', 'raven': 'raven',
  'snake': 'snake', 'bee': 'bee', 'octopus': 'octopus', 'rabbit': 'rabbit',
  'axolotl': 'axolotl', 'robot': 'robot', 'ghost': 'ghost', 'owl': 'owl',
  'turtle': 'turtle', 'guardian': 'guardian', 'bunny': 'bunny', 'void': 'void',
  'chonk': 'chonk', 'penguin': 'penguin', 'goose': 'goose', 'cactus': 'cactus',
  'duck': 'duck', 'mushroom': 'mushroom', 'gorilla': 'gorilla', 'hawk': 'hawk',
  'kraken': 'kraken', 'lemur': 'lemur', 'moth': 'moth', 'panda': 'panda',
  'shark': 'shark', 'phoenix': 'phoenix', 'mantis': 'mantis', 'parrot': 'parrot',
  'fox': 'fox', 'elephant': 'elephant', 'void': 'void', 'crow': 'crow',
  'robot': 'robot', 'axolotl': 'axolotl', 'rabbit': 'rabbit',
  // Aliases
  'pack leader': 'wolf', 'intel specialist': 'spider', 'signals analyst': 'raven',
  'primary access': 'snake', 'chief architect': 'dragon', 'edge case hunter': 'octopus',
  'defensive programmer': 'rabbit', 'refactoring optimist': 'axolotl',
  'precision engineer': 'robot', 'quality guardian': 'ghost', 'security auditor': 'owl',
  'quality engineer': 'turtle', 'real-time monitor': 'guardian', 'quick reaction': 'bunny',
  'pack leader': 'wolf',
};

// Active scheduled tasks
const scheduledTasks = new Map();
const activeAgents = new Map();
let isRunning = false;
let statusInterval = null;

/**
 * Parse agent mentions from text (notes or title)
 * e.g., "Dragon to lead with ROYAL AUTHORITY" → ['dragon']
 * e.g., "Wolf to coordinate: Spider to verify, Owl to audit" → ['wolf', 'spider', 'owl']
 * e.g., "RABBIT - Edge Case Defense" → ['rabbit']
 */
function parseAgentsFromText(text) {
  if (!text) return [];

  const found = new Set();
  const textLower = text.toLowerCase();

  // Check for agent aliases (in lowercase)
  for (const [alias, agentKey] of Object.entries(AGENT_ALIASES)) {
    const regex = new RegExp(`\\b${alias.toLowerCase()}\\b`);
    if (regex.test(textLower)) {
      found.add(agentKey);
    }
  }

  // Check for capitalized agent names: "RABBIT", "DRAGON", "OCTOPUS"
  // Handle possessive: "DRAGON's" -> "DRAGON"
  const cleaned = text.replace(/'s\b/g, ' ').replace(/[^\w\s]/g, ' ');
  const words = cleaned.split(/\s+/);

  for (const word of words) {
    const key = word.toLowerCase();
    if (agentExists(key)) {
      found.add(key);
    }
  }

  // Also check title-case patterns like "RABBIT - Edge Case"
  const titleMentions = text.match(/[A-Z]{3,}/g) || [];
  for (const name of titleMentions) {
    const key = name.toLowerCase();
    if (agentExists(key)) {
      found.add(key);
    }
  }

  return Array.from(found);
}

/**
 * Parse agent mentions from task notes + title
 */
function parseAgentsFromTask(task) {
  const fromNotes = parseAgentsFromText(task.notes || '');
  const fromTitle = parseAgentsFromText(task.title || '');

  // Combine and deduplicate
  const combined = [...fromNotes, ...fromTitle];
  return [...new Set(combined)];
}

/**
 * Parse delay from task notes
 * e.g., "Task #2 (60s delay)" or "Schedule in 3600 seconds"
 */
function parseDelayFromNotes(notes) {
  if (!notes) return 0;

  // Match patterns like "(60s delay)", "60 second", "3600s", "1 hour"
  const patterns = [
    /(\d+)\s*s\s*(?:delay|seconds?)/i,
    /(\d+)\s*m\s*(?:delay|minutes?)/i,
    /(\d+)\s*h\s*(?:delay|hours?)/i,
    /Task\s+#\d+\s*\((\d+)s/i,
    /schedule[ds]?\s*(?:in\s*)?(\d+)\s*(?:s|seconds?|m|minutes?)/i,
  ];

  for (const pattern of patterns) {
    const match = notes.match(pattern);
    if (match) {
      const value = parseInt(match[1], 10);
      if (pattern.source.includes('m')) return value * 60 * 1000;
      if (pattern.source.includes('h')) return value * 60 * 60 * 1000;
      return value * 1000; // seconds
    }
  }

  return 0;
}

/**
 * Broadcast event to Control API
 */
function broadcastToControlAPI(event) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      type: 'swarm_scheduler',
      timestamp: new Date().toISOString(),
      ...event
    });

    const req = http.request({
      hostname: 'localhost',
      port: 7780,
      path: '/api/bridge-event',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });
}

/**
 * Update cognitive_tasks.json status
 */
function updateTaskStatus(taskId, status, result = null) {
  try {
    const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    if (tasks.tasks[taskId]) {
      tasks.tasks[taskId].status = status;
      if (result) tasks.tasks[taskId].result = result;
      tasks.tasks[taskId].updated = new Date().toISOString();
      fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
    }
  } catch(e) {
    console.error(`[SCHEDULER] Failed to update task ${taskId}:`, e.message);
  }
}

/**
 * Execute a single agent task
 */
async function executeAgentTask(taskId, agentKey, taskDescription, notes) {
  const agentInfo = getAgentInfo(agentKey);
  if (!agentInfo) {
    console.error(`[SCHEDULER] Unknown agent: ${agentKey}`);
    return null;
  }

  console.log(`[SCHEDULER] 🐛 Spawning ${agentInfo.emoji} ${agentInfo.name} for task ${taskId}`);
  console.log(`[SCHEDULER]   Task: ${taskDescription}`);

  try {
    // Build task prompt from notes
    const fullPrompt = `Task: ${taskDescription}\n\nDetails: ${notes || 'No additional details'}`;

    // Spawn via Agent Tower
    const result = await AgentTower.spawnAgent(agentKey, fullPrompt);

    activeAgents.set(`${taskId}-${agentKey}`, {
      taskId,
      agentKey,
      result,
      startTime: new Date().toISOString()
    });

    // Broadcast spawn
    await broadcastToControlAPI({
      event: 'agent_spawned',
      taskId,
      agent: agentKey,
      emoji: agentInfo.emoji,
      name: agentInfo.name,
      task: taskDescription
    });

    updateTaskStatus(taskId, 'running');

    return result;
  } catch(e) {
    console.error(`[SCHEDULER] Failed to spawn ${agentKey}:`, e.message);
    updateTaskStatus(taskId, 'failed');
    return null;
  }
}

/**
 * Parse and execute coordination chain from notes
 * e.g., "Wolf to coordinate: Spider to verify, Owl to audit, Raven to analyze"
 * Returns array of {agent, subtask} objects
 */
function parseCoordinationChain(notes) {
  if (!notes) return [];

  // Look for "X to [verb]" patterns
  const chain = [];
  const segments = notes.split(/[,;]/);

  for (const segment of segments) {
    const match = segment.match(/([A-Za-z]+)\s+to\s+(\w+(?:\s+\w+){0,3})/);
    if (match) {
      const [, agentName, action] = match;
      const agentKey = agentName.toLowerCase();
      if (agentExists(agentKey)) {
        chain.push({
          agent: agentKey,
          action: action.trim(),
          raw: segment.trim()
        });
      }
    }
  }

  return chain;
}

/**
 * Execute a scheduled task
 */
async function executeScheduledTask(task) {
  const { id, title, notes, delay } = task;

  if (delay > 0) {
    console.log(`[SCHEDULER] ⏳ Task ${id} scheduled for ${delay/1000}s from now`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  console.log(`[SCHEDULER] 🚀 Executing task ${id}: ${title}`);

  // Parse agents from notes + title
  const agents = parseAgentsFromTask(task);

  if (agents.length === 0) {
    console.log(`[SCHEDULER] ⚠️  No agents found in task ${id} notes`);
    updateTaskStatus(id, 'completed', 'No agents parsed from notes');
    return;
  }

  // Check for coordination chain (Wolf coordinating multiple agents)
  const chain = parseCoordinationChain(notes);

  if (chain.length > 1) {
    // Sequential coordination chain
    console.log(`[SCHEDULER] 🔗 Coordination chain detected: ${chain.map(c => c.agent).join(' → ')}`);

    for (const step of chain) {
      const agentInfo = getAgentInfo(step.agent);
      console.log(`[SCHEDULER]   → ${agentInfo.emoji} ${agentInfo.name}: ${step.action}`);

      await executeAgentTask(id, step.agent, step.action, notes);

      // Small delay between chain steps
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } else {
    // Parallel execution for multiple agents
    console.log(`[SCHEDULER] 🎯 Agents parsed: ${agents.join(', ')}`);

    await Promise.all(agents.map(agentKey =>
      executeAgentTask(id, agentKey, title, notes)
    ));
  }

  console.log(`[SCHEDULER] ✅ Task ${id} dispatched`);
}

/**
 * Load and validate tasks from cognitive_tasks.json
 */
function loadTasks() {
  if (!fs.existsSync(TASKS_FILE)) {
    console.log('[SCHEDULER] No cognitive_tasks.json found, nothing to schedule');
    return [];
  }

  try {
    const data = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    const tasks = Object.values(data.tasks || {})
      .filter(t => t.status === 'active')
      .map(t => ({
        id: t.id,
        title: t.title,
        notes: t.notes || '',
        status: t.status,
        delay: parseDelayFromNotes(t.notes),
        created: t.created
      }));

    console.log(`[SCHEDULER] 📋 Loaded ${tasks.length} active tasks`);
    return tasks;
  } catch(e) {
    console.error('[SCHEDULER] Failed to load tasks:', e.message);
    return [];
  }
}

/**
 * Status reporter
 */
function reportStatus() {
  const taskList = Array.from(scheduledTasks.values()).map(t => ({
    id: t.id,
    title: t.title,
    status: t.status,
    agents: t.agents
  }));

  const agentList = Array.from(activeAgents.values()).map(a => ({
    taskId: a.taskId,
    agent: a.agentKey,
    startTime: a.startTime
  }));

  console.log('\n=== SWARM SCHEDULER STATUS ===');
  console.log(`Scheduled tasks: ${scheduledTasks.size}`);
  console.log(`Active agents: ${activeAgents.size}`);
  console.log('==============================\n');

  return { tasks: taskList, agents: agentList };
}

/**
 * Main scheduler loop
 */
async function runScheduler(options = {}) {
  const { daemon = false, taskId = null, dryRun = false } = options;

  console.log('===========================================');
  console.log('   PURPCLAW SWARM SCHEDULER v1.0');
  console.log('===========================================');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : daemon ? 'DAEMON' : 'ONCE'}`);
  console.log(`Tasks file: ${TASKS_FILE}`);
  console.log('');

  isRunning = true;

  // Load tasks
  let tasks = loadTasks();

  if (taskId) {
    tasks = tasks.filter(t => t.id === taskId);
    if (tasks.length === 0) {
      console.log(`[SCHEDULER] Task ${taskId} not found or not active`);
      return;
    }
  }

  if (dryRun) {
    console.log('[SCHEDULER] 🔍 DRY RUN - Would execute:\n');
    for (const task of tasks) {
      const agents = parseAgentsFromTask(task);
      const delay = parseDelayFromNotes(task.notes);
      console.log(`  ${task.id}: ${task.title}`);
      console.log(`    Agents: ${agents.length > 0 ? agents.join(', ') : 'NONE DETECTED'}`);
      console.log(`    Delay: ${delay > 0 ? `${delay/1000}s` : 'immediate'}`);
      console.log(`    Notes: ${task.notes.substring(0, 100)}...`);
      console.log('');
    }
    return;
  }

  let watchInterval;
  // Execute tasks
  if (daemon) {
    console.log('[SCHEDULER] 🔄 Running in DAEMON mode - watching for new tasks');
    statusInterval = setInterval(reportStatus, 30000);

    // Initial execution
    for (const task of tasks) {
      scheduledTasks.set(task.id, { ...task, status: 'pending' });
      executeScheduledTask(task).catch(console.error);
    }

    // Watch for file changes (re-poll every 10s)
    watchInterval = setInterval(async () => {
      const newTasks = loadTasks().filter(t => !scheduledTasks.has(t.id));
      for (const task of newTasks) {
        console.log(`[SCHEDULER] 📣 New task detected: ${task.id}`);
        scheduledTasks.set(task.id, { ...task, status: 'pending' });
        executeScheduledTask(task).catch(console.error);
      }
    }, 10000);

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n[SCHEDULER] Shutting down...');
      clearInterval(watchInterval);
      clearInterval(statusInterval);
      isRunning = false;
      process.exit(0);
    });

  } else {
    // Single run
    for (const task of tasks) {
      scheduledTasks.set(task.id, { ...task, status: 'pending' });
      await executeScheduledTask(task);
    }
    console.log('[SCHEDULER] All tasks dispatched, exiting');
  }
}

// CLI
const args = process.argv.slice(2);
const options = {
  daemon: args.includes('--daemon'),
  taskId: args.find(a => a.startsWith('--task='))?.split('=')[1] || null,
  dryRun: args.includes('--dry-run')
};

runScheduler(options).catch(e => {
  console.error('[SCHEDULER] Fatal error:', e);
  process.exit(1);
});
