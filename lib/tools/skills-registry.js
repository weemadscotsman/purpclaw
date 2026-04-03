'use strict';
/**
 * lib/tools/skills-registry.js — Bulk registration of all Hermes skills
 * as native PurpClaw tools. Scans skills/ directory, registers every skill
 * that has executable code, and loads prompt-only skills as references.
 */
const fs = require('fs');
const path = require('path');
const { execSafe } = require('../child-registry');

const SKILLS_DIR = path.join(__dirname, '..', '..', 'skills');

/**
 * Register all executable skills into a tool registry.
 * @param {object} registry — the registry object with a .register() method
 */
function registerAllSkills(registry) {
  const skills = scanSkills();
  let count = 0;

  for (const skill of skills) {
    if (!skill.hasScript) continue;
    
    // Read SKILL.md for description
    let description = skill.description || `Execute the ${skill.name} skill`;
    
    // Build input schema from script needs
    const inputSchema = {
      type: 'object',
      properties: {
        args: { type: 'string', description: 'Arguments to pass to the skill executor (optional)' },
      },
    };

    registry.register({
      name: `skill_${skill.name.replace(/[^a-zA-Z0-9_]/g, '_')}`,
      description: description.substring(0, 200),
      inputSchema,
      execute: async (args) => {
        return executeSkill(skill, args);
      },
    });
    count++;
  }
  
  return count;
}

function scanSkills() {
  const skills = [];
  if (!fs.existsSync(SKILLS_DIR)) return skills;
  
  for (const entry of fs.readdirSync(SKILLS_DIR)) {
    const skillPath = path.join(SKILLS_DIR, entry);
    if (!fs.statSync(skillPath).isDirectory()) continue;
    
    const skillMd = path.join(skillPath, 'SKILL.md');
    let description = '';
    let name = entry;
    
    // Find description from SKILL.md
    if (fs.existsSync(skillMd)) {
      try {
        const content = fs.readFileSync(skillMd, 'utf8');
        const m = content.match(/description:\s*"([^"]+)"/);
        if (m) description = m[1];
      } catch {}
    }
    
    // Find executable scripts
    const scripts = [];
    findScripts(skillPath, scripts);
    
    if (scripts.length > 0) {
      skills.push({ name, description, path: skillPath, hasScript: true, scripts });
    }
  }
  
  return skills;
}

function findScripts(dir, results, depth = 0) {
  if (depth > 3) return;
  try {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        if (entry !== 'node_modules' && entry !== '__pycache__' && entry !== '.git') {
          findScripts(full, results, depth + 1);
        }
      } else if (entry.endsWith('.js') || entry.endsWith('.py') || entry.endsWith('.sh')) {
        results.push(full);
      }
    }
  } catch {}
}

async function executeSkill(skill, args) {
  // Find the best script to run
  const script = findBestScript(skill.scripts);
  if (!script) return { ok: false, error: `No executable script found for ${skill.name}` };
  
  try {
    const ext = path.extname(script);
    let command, cmdArgs;
    
    if (ext === '.py') {
      command = process.env.PYTHON_BIN || 'python';
      cmdArgs = [script];
    } else if (ext === '.js') {
      command = process.execPath;
      cmdArgs = [script];
    } else if (ext === '.sh') {
      command = 'bash';
      cmdArgs = [script];
    } else {
      return { ok: false, error: `Unknown script type: ${ext}` };
    }
    
    // Pass any user args
    if (args && args.args) {
      cmdArgs.push(...args.args.split(' ').filter(Boolean));
    }
    
    const result = await execSafe(command, cmdArgs, { timeoutMs: 30000 });
    return {
      ok: result.ok,
      stdout: result.stdout?.substring(0, 5000),
      stderr: result.stderr?.substring(0, 1000),
      exitCode: result.code,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function findBestScript(scripts) {
  // Prefer main scripts over utility scripts
  const mainNames = ['main', 'index', 'run', 'app', 'server', 'cli', 'start', '__main__'];
  for (const s of scripts) {
    const base = path.basename(s, path.extname(s));
    if (mainNames.includes(base)) return s;
  }
  // Fall back to the first script in the root (not in scripts/ subdir)
  for (const s of scripts) {
    const rel = path.relative(path.dirname(path.dirname(s)), s);
    if (!rel.includes(path.sep)) return s;
  }
  return scripts[0];
}

module.exports = { registerAllSkills, scanSkills, executeSkill };
