/**
 * PURPCLAW COMPANION SWARM v3
 * =============================
 * Pure personality file loader for agent prompts.
 * Each agent in skills/{agent}/ has: AGENT.md, SKILL.md, GOALS.md, PROTOCOLS.md
 *
 * NOTE: Agent registry lives in agent_tower.js only.
 * This module is a pure loader — no duplicate AGENTS object.
 */

const path = require('path');
const fs = require('fs');

const SKILLS_DIR = path.join(__dirname, 'skills');

/**
 * Load agent personality files from disk
 */
function loadAgentFiles(agentName) {
  const agentDir = path.join(SKILLS_DIR, agentName);
  const files = {
    AGENT: path.join(agentDir, 'AGENT.md'),
    SKILL: path.join(agentDir, 'SKILL.md'),
    GOALS: path.join(agentDir, 'GOALS.md'),
    PROTOCOLS: path.join(agentDir, 'PROTOCOLS.md'),
  };

  const content = {};
  for (const [key, filePath] of Object.entries(files)) {
    try {
      if (fs.existsSync(filePath)) {
        content[key] = fs.readFileSync(filePath, 'utf8');
      } else {
        content[key] = null;
      }
    } catch(e) {
      content[key] = null;
    }
  }
  return content;
}

/**
 * Build full agent prompt from personality files
 * @param {string} agentName - Agent key name (e.g. 'dragon', 'wolf')
 * @param {string} task - The task to give the agent
 * @param {object} agentInfo - Agent metadata from agent_tower registry (emoji, name, division, role)
 */
function buildAgentPrompt(agentName, task, agentInfo = {}) {
  const files = loadAgentFiles(agentName);

  const emoji = agentInfo.emoji || '🤖';
  const name = agentInfo.name || agentName.toUpperCase();
  const division = agentInfo.division || 'UNKNOWN';
  const role = agentInfo.role || 'Specialist';

  let prompt = `You are ${emoji} ${name} — ${role} on the PURPCLAW swarm.\n`;
  prompt += `Division: ${division}\n\n`;

  if (files.AGENT) {
    prompt += `## ${name} PERSONA\n${files.AGENT}\n\n`;
  }
  if (files.SKILL) {
    prompt += `## SKILLS & PROTOCOLS\n${files.SKILL}\n\n`;
  }
  if (files.GOALS) {
    prompt += `## MISSION & GOALS\n${files.GOALS}\n\n`;
  }
  if (files.PROTOCOLS) {
    prompt += `## DEPLOYMENT RULES\n${files.PROTOCOLS}\n\n`;
  }

  prompt += `## YOUR TASK\n${task}\n\n`;
  prompt += `Remember: You are ${name}. ${emoji}\n`;

  return prompt;
}

/**
 * List all agents that have personality files on disk
 */
function listAgentsWithPersonas() {
  try {
    if (!fs.existsSync(SKILLS_DIR)) return [];
    return fs.readdirSync(SKILLS_DIR).filter(name => {
      const agentDir = path.join(SKILLS_DIR, name);
      return fs.statSync(agentDir).isDirectory();
    });
  } catch(e) {
    return [];
  }
}

/**
 * Check if an agent has personality files
 */
function hasPersonalityFiles(agentName) {
  const agentDir = path.join(SKILLS_DIR, agentName);
  try {
    return fs.existsSync(path.join(agentDir, 'AGENT.md'));
  } catch(e) {
    return false;
  }
}

module.exports = {
  loadAgentFiles,
  buildAgentPrompt,
  listAgentsWithPersonas,
  hasPersonalityFiles,
};
