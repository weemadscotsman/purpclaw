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
 *
 * Skill usage telemetry:
 *   - bumpUse  — called when a skill is actively executed
 *   - bumpView — called when a skill is loaded as a reference/prompt
 *   - bumpPatch — called by skill editing tools (lib/skill-patch.js etc.)
 */
const fs = require('fs');
const path = require('path');
const { execSafe } = require('../child-registry');

// Skill usage telemetry (lazy-loaded to avoid circular deps)
let _skillUsage = null;
function skillUsage() {
  if (!_skillUsage) {
    try { _skillUsage = require('../skill-usage'); } catch { _skillUsage = null; }
  }
  return _skillUsage;
}

const PROJECT_SKILLS_DIR = path.join(process.cwd(), 'skills');
const SKILLS_DIR = fs.existsSync(PROJECT_SKILLS_DIR)
  ? PROJECT_SKILLS_DIR
  : path.join(__dirname, '..', '..', 'skills');
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
    // Probe for missing optional deps
    const missing = probeMissingDeps(skill);
    skill.missingDeps = missing;
    skill.degraded = missing.length > 0;

    let description = skill.description || (skill.hasScript
      ? `Execute the ${skill.name} skill`
      : `Reference the ${skill.name} skill instructions`);
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
        // ── Skill telemetry: bumpUse on active execution ──────────────────
        const su = skillUsage();
        if (su) { try { su.bumpUse(skill.name); } catch {} }

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
        if (!skill.hasScript) {
          // Reference-only skill — bumpView
          if (su) { try { su.bumpView(skill.name); } catch {} }
          return referenceSkill(skill);
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

// Collect every skill directory under SKILLS_DIR. A directory IS a skill if it
// contains a SKILL.md; we then stop descending (a skill's internals are not
// sub-skills). Top-level script-only dirs (no SKILL.md) are still treated as
// skills for backwards-compat. This recursion means skills grouped into
// category subfolders are no longer invisible to the runtime.
function collectSkillDirs(dir, out, depth = 0) {
  if (depth > 4) return;
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (entry.startsWith('_') || entry.startsWith('.')) continue;
    if (entry === 'node_modules' || entry === '__pycache__') continue;
    const p = path.join(dir, entry);
    let st; try { st = fs.statSync(p); } catch { continue; }
    if (!st.isDirectory()) continue;
    if (fs.existsSync(path.join(p, 'SKILL.md'))) {
      out.push(p);                 // it's a skill — do not descend into it
    } else if (depth === 0) {
      out.push(p);                 // top-level script-only skill (legacy behavior)
      collectSkillDirs(p, out, depth + 1); // but still look deeper for nested skills
    } else {
      collectSkillDirs(p, out, depth + 1); // category subfolder — keep walking
    }
  }
}

// Extract the `description:` field from SKILL.md frontmatter. Handles all three
// YAML styles seen in the corpus: double-quoted, plain unquoted single-line, and
// block scalars (`>` / `|`) that fold across multiple indented lines.
function extractDescription(content) {
  const quoted = content.match(/^\s*description:\s*"([^"]+)"/m);
  if (quoted) return quoted[1].trim();

  // Block scalar: description: > (or |) followed by indented continuation lines.
  const block = content.match(/^\s*description:\s*[>|][-+]?\s*\n([\s\S]*?)(?=^\S|\n\s*\n|^\s*\w+:)/m);
  if (block) {
    return block[1].split('\n').map(l => l.trim()).filter(Boolean).join(' ').trim();
  }

  // Plain unquoted single line.
  const plain = content.match(/^\s*description:\s*([^\n>|"][^\n]*)/m);
  if (plain) return plain[1].trim();

  return '';
}

function scanSkills() {
  const skills = [];
  if (!fs.existsSync(SKILLS_DIR)) return skills;

  const skillDirs = [];
  collectSkillDirs(SKILLS_DIR, skillDirs);
  const seen = new Set();

  for (const skillPath of skillDirs) {
    const entry = path.basename(skillPath);
    if (seen.has(entry)) continue;   // first wins; guards against name collisions
    seen.add(entry);

    const skillMd = path.join(skillPath, 'SKILL.md');
    let description = '';
    let name = entry;
    const requirements = extractRequirements(skillMd);

    let instructions = '';
    if (fs.existsSync(skillMd)) {
      try {
        const content = fs.readFileSync(skillMd, 'utf8');
        instructions = content;
        if (/purpclaw_active:\s*false/i.test(content) || /legacy_only:\s*true/i.test(content)) {
          continue;
        }
        description = extractDescription(content);
      } catch {}
    }

    const scripts = [];
    findScripts(skillPath, scripts);

    if (fs.existsSync(skillMd) || scripts.length > 0) {
      skills.push({
        name, description, path: skillPath,
        hasScript: scripts.length > 0, scripts, requirements, instructions,
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

function referenceSkill(skill) {
  return {
    ok: true,
    reference: true,
    skill: skill.name,
    description: skill.description || '',
    content: String(skill.instructions || '').substring(0, 12000),
    message: 'Prompt/reference skill loaded. Use this SKILL.md content as the execution instructions for the requested task.',
  };
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
