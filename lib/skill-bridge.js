'use strict';
/**
 * lib/skill-bridge.js — Bridges Hermes skills into PurpClaw's tool registry.
 * Scans ~/.hermes/ for skills, makes them available as PurpClaw tools.
 */
const fs = require('fs');
const path = require('path');
const { execSafe } = require('./child-registry');

const HERMES_SKILL_DIRS = [
  path.join(process.env.HOME || process.env.USERPROFILE || 'C:\\Users\\Admin', 'AppData', 'Local', 'hermes', 'hermes-agent', 'skills'),
  path.join(process.env.HOME || process.env.USERPROFILE || 'C:\\Users\\Admin', 'AppData', 'Local', 'hermes', 'skills'),
  path.join(process.env.HOME || process.env.USERPROFILE || 'C:\\Users\\Admin', 'AppData', 'Local', 'hermes', 'hermes-agent', 'optional-skills'),
];

const PURPCLAW_SKILLS_DIR = path.join(__dirname, '..', 'skills');

/**
 * Find all Hermes skill directories, returning { category, name, path, hasScript, scripts[] }
 */
function scanHermesSkills() {
  const skills = [];
  for (const base of HERMES_SKILL_DIRS) {
    if (!fs.existsSync(base)) continue;
    for (const cat of fs.readdirSync(base)) {
      const catPath = path.join(base, cat);
      if (!fs.statSync(catPath).isDirectory()) continue;
      // Skills are subdirectories OR the category itself if it has a SKILL.md
      const entries = fs.readdirSync(catPath);
      const hasSkillMd = entries.includes('SKILL.md');
      if (hasSkillMd) {
        // Category IS a skill (flat structure in user skills)
        const info = scanSingleSkill(catPath);
        if (info) skills.push(info);
      } else {
        // Skills are subdirectories
        for (const entry of entries) {
          const skillPath = path.join(catPath, entry);
          if (!fs.statSync(skillPath).isDirectory()) continue;
          const info = scanSingleSkill(skillPath);
          if (info) skills.push(info);
        }
      }
    }
  }
  return skills;
}

function scanSingleSkill(dir) {
  const skillMd = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) return null;
  
  let name = path.basename(dir);
  let description = '';
  const scripts = [];
  
  try {
    const content = fs.readFileSync(skillMd, 'utf8');
    const descMatch = content.match(/description:\s*"([^"]+)"/);
    if (descMatch) description = descMatch[1];
  } catch {}
  
  // Find executable scripts
  for (const f of fs.readdirSync(dir)) {
    const fpath = path.join(dir, f);
    if (fs.statSync(fpath).isDirectory()) {
      // Check subdirs for scripts
      for (const sub of fs.readdirSync(fpath)) {
        if (sub.endsWith('.js') || sub.endsWith('.py') || sub.endsWith('.sh')) {
          scripts.push(path.join(f, sub));
        }
      }
    } else if (f.endsWith('.js') || f.endsWith('.py') || f.endsWith('.sh')) {
      scripts.push(f);
    }
  }
  
  return { name, path: dir, description, hasScript: scripts.length > 0, scripts };
}

/**
 * Copy a Hermes skill's prompt files into PurpClaw's skills directory
 */
function installSkillPrompt(skill) {
  const targetDir = path.join(PURPCLAW_SKILLS_DIR, skill.name);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  
  // Copy SKILL.md
  const srcMd = path.join(skill.path, 'SKILL.md');
  const dstMd = path.join(targetDir, 'SKILL.md');
  if (fs.existsSync(srcMd)) fs.copyFileSync(srcMd, dstMd);
  
  // Copy reference files
  const srcRefs = path.join(skill.path, 'references');
  const dstRefs = path.join(targetDir, 'references');
  if (fs.existsSync(srcRefs)) {
    if (!fs.existsSync(dstRefs)) fs.mkdirSync(dstRefs, { recursive: true });
    for (const f of fs.readdirSync(srcRefs)) {
      fs.copyFileSync(path.join(srcRefs, f), path.join(dstRefs, f));
    }
  }
  
  return targetDir;
}

module.exports = { scanHermesSkills, installSkillPrompt, HERMES_SKILL_DIRS, PURPCLAW_SKILLS_DIR };
