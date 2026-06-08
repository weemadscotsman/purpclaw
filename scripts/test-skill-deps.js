'use strict';
/**
 * test-skill-deps.js — Verify graceful handling of missing optional deps.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DIR = path.join(os.tmpdir(), 'skill-deps-' + Date.now());
fs.mkdirSync(TEST_DIR, { recursive: true });

const SKILLS_DIR = path.join(TEST_DIR, 'skills');
fs.mkdirSync(SKILLS_DIR, { recursive: true });

// Three test skills
const skill1 = path.join(SKILLS_DIR, 'test-missing-dep');
fs.mkdirSync(skill1, { recursive: true });
fs.writeFileSync(path.join(skill1, 'SKILL.md'),
  '---\ndescription: "Skill that needs a missing dep"\nrequires: [nonexistent_pkg_xyz_abc]\n---\n# Test\n');
fs.writeFileSync(path.join(skill1, 'main.py'),
  'print("would run if deps were present")\n');

const skill2 = path.join(SKILLS_DIR, 'test-present-dep');
fs.mkdirSync(skill2, { recursive: true });
fs.writeFileSync(path.join(skill2, 'SKILL.md'),
  '---\ndescription: "Skill that needs a present dep"\nrequires: [json]\n---\n# Test\n');
fs.writeFileSync(path.join(skill2, 'main.js'),
  'console.log("script ran ok");\n');

const skill3 = path.join(SKILLS_DIR, 'test-no-deps');
fs.mkdirSync(skill3, { recursive: true });
fs.writeFileSync(path.join(skill3, 'SKILL.md'),
  '---\ndescription: "Skill with no deps declared"\n---\n# Test\n');
fs.writeFileSync(path.join(skill3, 'main.js'),
  'console.log("simple skill");\n');

const PURP_DIR = path.resolve(__dirname, '..');
const REAL_SKILLS = path.join(PURP_DIR, 'skills');
const BACKUP = path.join(PURP_DIR, 'skills.bak.test');

let pass = 0, fail = 0;
function test(name, ok, details = '') {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}: ${details}`); }
}

console.log('\n🧪 Skill missing-dep behavior');
console.log('====================================\n');

(async () => {
  // Defensive cleanup: if a previous failed run left artifacts, clean them
  if (fs.existsSync(BACKUP)) {
    // The backup name conflicts with the real skills path. Move it out of the way.
    const bak2 = path.join(PURP_DIR, 'skills.bak2.' + Date.now());
    fs.renameSync(BACKUP, bak2);
    // Try to restore — if real skills is a symlink, remove it
    if (fs.lstatSync(REAL_SKILLS).isSymbolicLink()) {
      fs.unlinkSync(REAL_SKILLS);
    }
    fs.renameSync(bak2, REAL_SKILLS);
  }
  // Also handle the case where skills is itself a stale symlink
  if (fs.existsSync(REAL_SKILLS) && fs.lstatSync(REAL_SKILLS).isSymbolicLink()) {
    fs.unlinkSync(REAL_SKILLS);
  }

  const SYMLINK_TARGET = path.join(PURP_DIR, 'skills');
  if (fs.existsSync(REAL_SKILLS) && !fs.lstatSync(REAL_SKILLS).isSymbolicLink()) {
    fs.renameSync(REAL_SKILLS, BACKUP);
  }
  try {
    fs.symlinkSync(SKILLS_DIR, SYMLINK_TARGET, 'junction');

    delete require.cache[require.resolve('../lib/tools/skills-registry')];
    const reg = require('../lib/tools/skills-registry');

    // 1. Scans 3 skills
    const skills = reg.scanSkills();
    test('1. Scans 3 test skills', skills.length === 3, `got ${skills.length}`);

    // 2. Parses [pkg1, pkg2] format
    const reqs = reg.extractRequirements(path.join(skill1, 'SKILL.md'));
    test('2. extractRequirements parses [pkg1, pkg2] format',
      reqs && reqs.ml && reqs.ml.includes('nonexistent_pkg_xyz_abc'),
      JSON.stringify(reqs));

    // 3. probeMissingDeps finds the missing one
    const skillWithMissing = skills.find(s => s.name === 'test-missing-dep');
    const missing = reg.probeMissingDeps(skillWithMissing);
    test('3. probeMissingDeps detects nonexistent_pkg_xyz_abc as missing',
      missing.includes('nonexistent_pkg_xyz_abc'),
      JSON.stringify(missing));

    // 4. Empty for present deps
    const skillWithPresent = skills.find(s => s.name === 'test-present-dep');
    const missing2 = reg.probeMissingDeps(skillWithPresent);
    test('4. probeMissingDeps returns [] for present deps',
      missing2.length === 0, JSON.stringify(missing2));

    // 5. registerAllSkills returns the structured result
    const registered = [];
    const mockRegistry = { register: (t) => registered.push(t) };
    const regResult = reg.registerAllSkills(mockRegistry);
    test('5. registerAllSkills returns { registered, degraded, total }',
      regResult && regResult.registered === 3 && regResult.degraded === 1 && regResult.total === 3,
      JSON.stringify(regResult));

    // 6. Degraded tool's description includes missing dep name
    const degradedTool = registered.find(t => t.description.includes('DEGRADED'));
    test('6. Degraded tool description mentions missing dep',
      degradedTool && degradedTool.description.includes('nonexistent_pkg_xyz_abc'),
      degradedTool?.description?.substring(0, 100));

    // 7. Degraded execute() returns graceful guidance
    const result = await degradedTool.execute({});
    test('7. Degraded execute() returns ok:false, error with install guidance',
      result.ok === false && result.degraded === true &&
      result.error.includes('Skill unavailable') &&
      result.install.includes('pip install') &&
      result.install.includes('nonexistent_pkg_xyz_abc'),
      JSON.stringify(result).substring(0, 300));

    // 8. Non-degraded execute() runs the script
    const okTool = registered.find(t => t.name === 'skill_test_present_dep');
    const okResult = await okTool.execute({});
    test('8. Non-degraded tool execute() runs the script',
      okResult.ok === true, JSON.stringify(okResult).substring(0, 200));

    // 9. getSkillHealth reports degraded list
    const health = reg.getSkillHealth();
    test('9. getSkillHealth reports 1 degraded skill',
      health.degraded_count === 1 &&
      health.degraded[0]?.name === 'test-missing-dep' &&
      health.degraded[0]?.missing?.includes('nonexistent_pkg_xyz_abc'),
      JSON.stringify(health));

  } finally {
    if (fs.existsSync(SYMLINK_TARGET)) {
      try { fs.unlinkSync(SYMLINK_TARGET); } catch {}
    }
    if (fs.existsSync(BACKUP)) {
      fs.renameSync(BACKUP, REAL_SKILLS);
    }
  }

  console.log('\n====================================');
  console.log(`Results: ${pass} passed, ${fail} failed`);
  console.log('====================================\n');
  if (fail > 0) process.exit(1);
})();
