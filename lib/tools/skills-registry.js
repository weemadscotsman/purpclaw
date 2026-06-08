'use strict';
/**
 * lib/tools/skills-registry.js — Bulk registration of all Hermes skills
 * as native PurpClaw tools. Scans skills/ directory, registers every skill
 * that has executable code, and loads prompt-only skills as references.
 *
 * Production-grade behavior:
 *   - Skills that declare required optional deps (e.g. torch, transformers)
 *     and find those deps missing register as: "Skill unavailable: missing
 *     package X. Install: pip install -r requirements.skills.<group>.txt"
 *   - The tool still gets registered, but its execute() returns the
 *     guidance message instead of crashing on ImportError.
 *   - The skill is marked as "degraded" in its metadata so health checks
 *     can report on it.
 */
const fs = require('fs');
const path = require('path');
const { execSafe } = require('../child-registry');

const SKILLS_DIR = path.join(__dirname, '..', '..', 'skills');
const REQUIREMENTS_GROUPS = {
  ml: 'requirements.skills.ml.txt',
  media: 'requirements.skills.media.txt',
  crypto: 'requirements.skills.crypto.txt',
  web: 'requirements.skills.web.txt',
};

/**
 * Register all executable skills into a tool registry.
 * @param {object} registry — the registry object with a .register() method
 */
function registerAllSkills(registry) {
  const skills = scanSkills();
  let count = 0;
  let degraded = 0;

  for (const skill of skills) {
    if (!skill.hasScript) continue;

    // Probe for missing optional deps
    const missing = probeMissingDeps(skill);
    skill.missingDeps = missing;
    skill.degraded = missing.length > 0;

    let description = skill.description || `Execute the ${skill.name} skill`;
    if (skill.degraded) {
      description += ` [DEGRADED: missing ${missing.join(', ')}]`;
    }

    const inputSchema = {
      type: 'object',
      properties: {
        args: { type: 'string', description: 'Arguments to pass to the skill executor (optional)' },
      },
    };

    registry.register({
      name: `skill_${skill.name.replace(/[^a-zA-Z0-9_]/g, '_')}`,
      description: description.substring(0, 300),
      inputSchema,
      execute: async (args) => {
        if (skill.degraded) {
          // Graceful: return guidance, don't crash
          return {
            ok: false,
            degraded: true,
            error: `Skill unavailable: missing package ${skill.missingDeps.join(', ')}`,
            install: `Install: pip install ${skill.missingDeps.join(' ')}`,
            requirements: skill.requirements,
            skill: skill.name,
          };
        }
        return executeSkill(skill, args);
      },
    });
    count++;
    if (skill.degraded) degraded++;
  }

  return { registered: count, degraded, total: skills.length };
}

/**
 * Extract the "requires:" field from SKILL.md frontmatter.
 * Format: requires: [torch, transformers]
 *      or: requires: { ml: [torch, transformers], media: [kokoro] }
 */
function extractRequirements(skillMd) {
  if (!fs.existsSync(skillMd)) return null;
  try {
    const content = fs.readFileSync(skillMd, 'utf8');
    // Match: requires: [package1, package2]
    const listMatch = content.match(/^requires:\s*\[([^\]]+)\]/m);
    if (listMatch) {
      return {
        ml: listMatch[1].split(',').map(s => s.trim()).filter(Boolean),
      };
    }
    // Match: requires: { ml: [torch], media: [kokoro] }
    const mapMatch = content.match(/^requires:\s*\{([\s\S]+?)\}/m);
    if (mapMatch) {
      const result = {};
      const body = mapMatch[1];
      const fieldMatches = body.matchAll(/(\w+):\s*\[([^\]]+)\]/g);
      for (const m of fieldMatches) {
        result[m[1]] = m[2].split(',').map(s => s.trim()).filter(Boolean);
      }
      return Object.keys(result).length > 0 ? result : null;
    }
  } catch {}
  return null;
}

/**
 * Probe which declared deps are missing.
 * Returns array of missing package names (e.g. ['torch', 'transformers']).
 */
function probeMissingDeps(skill) {
  if (!skill.requirements) return [];
  const missing = [];
  for (const [, packages] of Object.entries(skill.requirements)) {
    for (const pkg of packages) {
      if (!isImportable(pkg)) {
        missing.push(pkg);
      }
    }
  }
  return missing;
}

/**
 * Check if a Python package is importable. Cache results.
 */
const _importCache = new Map();
function isImportable(pkgName) {
  if (_importCache.has(pkgName)) return _importCache.get(pkgName);
  try {
    // Try `python -c "import X"` first
    const py = process.env.PYTHON_BIN || 'python';
    const r = require('child_process').spawnSync(
      py, ['-c', `import ${pkgName}`],
      { stdio: 'ignore', timeout: 5000, windowsHide: true }
    );
    const ok = r.status === 0;
    _importCache.set(pkgName, ok);
    return ok;
  } catch {
    _importCache.set(pkgName, false);
    return false;
  }
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
    const requirements = extractRequirements(skillMd);

    if (fs.existsSync(skillMd)) {
      try {
        const content = fs.readFileSync(skillMd, 'utf8');
        const m = content.match(/description:\s*"([^"]+)"/);
        if (m) description = m[1];
      } catch {}
    }

    const scripts = [];
    findScripts(skillPath, scripts);

    if (scripts.length > 0) {
      skills.push({
        name, description, path: skillPath,
        hasScript: true, scripts, requirements,
      });
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
  const script = findBestScript(skill.scripts);
  if (!script) return { ok: false, error: `No executable script found for ${skill.name}` };

  try {
    const ext = path.extname(script);
    let command = null, cmdArgs = null;

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
  const mainNames = ['main', 'index', 'run', 'app', 'server', 'cli', 'start', '__main__'];
  for (const s of scripts) {
    const base = path.basename(s, path.extname(s));
    if (mainNames.includes(base)) return s;
  }
  for (const s of scripts) {
    const rel = path.relative(path.dirname(path.dirname(s)), s);
    if (!rel.includes(path.sep)) return s;
  }
  return scripts[0];
}

/**
 * Health summary for the doctor scorecard.
 */
function getSkillHealth() {
  const skills = scanSkills();
  const withReqs = skills.filter(s => s.requirements);
  const degraded = withReqs.filter(s => probeMissingDeps(s).length > 0);
  return {
    total: skills.length,
    with_requirements_declared: withReqs.length,
    degraded_count: degraded.length,
    degraded: degraded.map(s => ({
      name: s.name,
      missing: probeMissingDeps(s),
    })),
  };
}

module.exports = {
  registerAllSkills, scanSkills, executeSkill, getSkillHealth,
  extractRequirements, probeMissingDeps, isImportable,
};
