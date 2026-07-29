'use strict';

const path = require('path');
const os   = require('os');
const fs   = require('fs');

// TDO: record skill commands for other agents
// Direct write to harness_lessons.jsonl — no circular require issues
function tdoRecord(task, success, outputPreview) {
  try {
    const os = require('os');
    const path = require('path');
    // Hardcode project agent_work path for skills.js (same machine, same project)
    const WORK = path.join('E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW', 'agent_work');
    const workFile = path.join(WORK, 'harness_lessons.jsonl');
    const record = {
      timestamp: new Date().toISOString(),
      source: 'purpclaw-cli',
      missionId: `purpclaw-${Date.now()}`,
      task,
      subtaskId: 'skills',
      domain: 'purpclaw',
      agent: 'purpclaw-cli',
      success,
      attempts: 1,
      text: task,
      outputPreview: String(outputPreview || '').slice(0, 500),
    };
    const dir = path.dirname(workFile);
    if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });
    require('fs').appendFileSync(workFile, JSON.stringify(record) + '\n', 'utf8');
  } catch(e) { /* best-effort */ }
}

const { discoverSkills, validate, buildOrder, resolveCapability } = require('../skills-deps');
const { scanSkill: guardScan, scanSkillCached: guardScanCached,
        shouldAllowInstall: guardAllow, formatScanReport: guardReport } = require('../skills-guard');
const {
  SkillsHub, ensureHubDirs, formatSkillMeta, formatUpdateResult,
} = require('../skills-hub');

const C = {
  reset  : '\x1b[0m',
  bold   : '\x1b[1m',
  dim    : '\x1b[2m',
  cyan   : '\x1b[36m',
  green  : '\x1b[32m',
  yellow : '\x1b[33m',
  red    : '\x1b[31m',
  gray   : '\x1b[90m',
};

const isTTY = process.stdout.isTTY;
const col   = (c, s) => isTTY ? c + s + C.reset : s;

const SKILLS_ROOT = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/skills/';

function printHelp() {
  const lines = [
    'purpclaw skills -- Skills dependency management',
    '',
    '  purpclaw skills list                          list all skills',
    '  purpclaw skills list --provides <cap>        skills that provide a capability',
    '  purpclaw skills list --depends <skill>       skills that depend on a skill',
    '  purpclaw skills validate                     validate dependency graph',
    '  purpclaw skills order [skill1 ...]           show build order (topological)',
    '  purpclaw skills find <capability>            find which skill provides a capability',
    '  purpclaw skills dot                          output GraphViz DOT graph',
    '  purpclaw skills --root <dir>                 scan a different skills directory',
    '  purpclaw skills --json                       JSON output',
    '  purpclaw skills --verbose                    show deps/provides per skill',
  ];
  console.log(lines.join('\n'));
}

async function run(args, ctx) {
  const json    = args.indexOf('--json')    >= 0;
  const verbose = args.indexOf('--verbose') >= 0;
  const helpIdx = args.indexOf('--help');
  if (helpIdx >= 0 || args.indexOf('-h') >= 0) {
    printHelp();
    return;
  }

  const rootIdx = args.indexOf('--root');
  const root    = rootIdx >= 0 ? args[rootIdx + 1] : SKILLS_ROOT;
  const raw     = args.filter(function(a) { return !a.startsWith('--'); });
  const sub     = raw[0] || 'list';

  // skills list
  if (sub === 'list' || sub === 'ls') {
    const skills        = discoverSkills(root);
    const provIdx      = args.indexOf('--provides');
    const depIdx       = args.indexOf('--depends');
    const providesFilter = provIdx >= 0 ? args[provIdx + 1] : null;
    const dependsFilter  = depIdx  >= 0 ? args[depIdx  + 1] : null;

    let list = [];
    skills.forEach(function(s, name) {
      if (providesFilter && !s.provides.some(function(p) { return p === providesFilter; })) return;
      if (dependsFilter  && !s.deps.some(function(d)     { return d === dependsFilter;  })) return;
      list.push([name, s]);
    });

    if (json) {
      process.stdout.write(JSON.stringify({
        root  : root,
        count : list.length,
        skills: list.map(function(item) {
          return { name: item[0], deps: item[1].deps, provides: item[1].provides, conflicts: item[1].conflicts };
        })
      }, null, 2) + '\n');
      return;
    }

    console.log('\nSkills registry:  ' + list.length + ' skills  (' + root + ')\n');
    list.sort(function(a, b) { return a[0].localeCompare(b[0]); });
    list.forEach(function(item) {
      var name   = item[0];
      var skill  = item[1];
      var depStr  = skill.deps.length     ? '[' + skill.deps.length + ' deps]'     : '';
      var provStr = skill.provides.length ? '[' + skill.provides.length + ' prov]' : '';
      var cfStr   = skill.conflicts.length? '[' + skill.conflicts.length + ' conf]' : '';
      console.log('  ' + name.padEnd(36) + '  ' + depStr + ' ' + provStr + ' ' + cfStr);
      if (verbose && skill.deps.length) {
        skill.deps.forEach(function(d)     { console.log('    dep:     ' + d); });
      }
      if (verbose && skill.provides.length) {
        skill.provides.forEach(function(p) { console.log('    provides: ' + p); });
      }
    });
    console.log('');
    return;
  }

  // skills validate
  if (sub === 'validate' || sub === 'check') {
    var result = validate(discoverSkills(root));
    if (json) {
      process.stdout.write(JSON.stringify({ ok: result.ok, errors: result.errors, warnings: result.warnings }, null, 2) + '\n');
      return;
    }
    if (result.ok) {
      console.log(col(C.green, 'OK') + '  Graph valid — ' + discoverSkills(root).size + ' skills, no errors');
    } else {
      console.log(col(C.red, 'ERRORS:'));
      result.errors.forEach(function(e) { console.log('  [' + e.type + '] ' + e.skill + ': ' + e.message); });
    }
    if (result.warnings.length) {
      console.log(col(C.yellow, 'WARNINGS:'));
      result.warnings.forEach(function(w) { console.log('  [' + w.type + '] ' + w.skill); });
    }
    return;
  }

  // skills order
  if (sub === 'order' || sub === 'resolve') {
    var skills = discoverSkills(root);
    var wanted = raw.slice(1).filter(function(n) { return n && !n.startsWith('--'); });
    var orderResult = buildOrder(skills, wanted.length ? wanted : null);

    if (json) {
      process.stdout.write(JSON.stringify({ order: orderResult.order, errors: orderResult.errors }, null, 2) + '\n');
      return;
    }
    if (orderResult.errors.length) {
      console.log(col(C.red, 'Errors:'));
      orderResult.errors.forEach(function(e) { console.log('  [' + e.type + '] ' + e.message); });
    }
    console.log('\nBuild order:');
    orderResult.order.forEach(function(name) { console.log('  -> ' + name); });
    console.log('');
    tdoRecord('skills install', true, 'order=' + orderResult.order.length);
    return;
  }

  // skills find
  if (sub === 'find' || sub === 'lookup') {
    var capability = raw[1];
    if (!capability) {
      console.log('usage: purpclaw skills find <capability> [--json]');
      tdoRecord('skills find', false, 'missing capability');
      return 1;
    }
    var sk2   = discoverSkills(root);
    var prov  = resolveCapability(sk2, capability);
    if (json) {
      process.stdout.write(JSON.stringify({ capability: capability, provider: prov }, null, 2) + '\n');
    } else if (prov) {
      console.log(col(C.green, 'OK') + "  Capability '" + capability + "' provided by: " + prov);
    } else {
      console.log(col(C.gray, 'MISSING') + "  No skill provides capability: '" + capability + "'");
    }
    return;
  }

  // skills install <repo> --path <path> [--dest <dir>] [--ref <ref>]
  if (sub === 'install' || sub === 'add' || sub === 'get') {
    const repo = raw[1];
    const pathIdx = args.indexOf('--path');
    const destIdx = args.indexOf('--dest');
    const refIdx = args.indexOf('--ref');
    const nameIdx = args.indexOf('--name');
    const verbose = args.indexOf('--verbose') >= 0;
    const installPath = pathIdx >= 0 ? args[pathIdx + 1] : null;
    const destDir = destIdx >= 0 ? args[destIdx + 1] : path.join(root, '.community');
    const ref = refIdx >= 0 ? args[refIdx + 1] : 'main';
    const skillName = nameIdx >= 0 ? args[nameIdx + 1] : (installPath ? require('path').basename(installPath) : repo);

    if (!repo && !installPath) {
      console.log('Usage: purpclaw skills install <repo> --path <path> [--dest <dir>] [--ref <ref>] [--name <name>] [--verbose]');
      console.log('Example: purpclaw skills install weemadscotsman/purpclaw --path skills/code-review --dest ' + root);
      console.log('Alternative: purpclaw skills install --url <github-tree-url> [--dest <dir>]');
      tdoRecord('skills install', false, 'missing repo/path');
      return 1;
    }

    console.log(col(C.cyan, '→') + ' Installing skill: ' + skillName);
    const scriptPath = path.join(PURP_DIR, 'scripts', 'install-skill-from-github.js');
    if (!fs.existsSync(scriptPath)) {
      console.log(col(C.red, '[X]') + ' install-skill-from-github.js not found at scripts/');
      console.log('  ' + scriptPath);
      return 1;
    }

    const scriptArgs = [];
    if (repo) scriptArgs.push('--repo', repo);
    if (installPath) scriptArgs.push('--path', installPath);
    scriptArgs.push('--dest', destDir);
    scriptArgs.push('--ref', ref);
    if (skillName) scriptArgs.push('--name', skillName);
    if (verbose) scriptArgs.push('--verbose');

    const { spawn } = require('child_process');
    const child = spawn('node', [scriptPath, ...scriptArgs], {
      cwd: PURP_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let out = '', err = '';
    child.stdout.on('data', c => { const s = c.toString(); process.stdout.write(s); out += s; });
    child.stderr.on('data', c => { const s = c.toString(); process.stderr.write(s); err += s; });
    child.on('close', code => {
      if (code === 0) {
        console.log('\n' + col(C.green, '[OK]') + ' Skill installed: ' + skillName);
        tdoRecord('skills install ' + skillName, true, out.slice(0, 200));
      } else {
        console.log('\n' + col(C.red, '[X]') + ' Install failed (exit ' + code + ')');
        tdoRecord('skills install ' + skillName, false, err.slice(0, 200));
      }
    });
    return;
  }

  // skills dot
  if (sub === 'dot') {
    var sk3 = discoverSkills(root);
    console.log('digraph skills {');
    console.log('  rankdir=LR;');
    console.log('  node [shape=box];');
    sk3.forEach(function(skill, name) {
      skill.deps.forEach(function(dep) {
        console.log('  "' + dep + '" -> "' + name + '";');
      });
    });
    console.log('}');
    return;
  }

  // skills guard <name>
  if (sub === 'guard') {
    var skillName = raw[1];
    if (!skillName) {
      // Show help for guard subcommand
      var guardLines = [
        'purpclaw skills guard -- Skills security scanner',
        '',
        '  purpclaw skills guard <name>       scan an installed skill by name',
        '  purpclaw skills guard <name> --force   bypass non-dangerous blocks',
        '  purpclaw skills guard <name> --no-cache  skip scan cache',
        '',
        'Verdict: safe | caution | dangerous',
        '',
        'Trust levels:',
        '  builtin       always allow (ships with Hermes)',
        '  trusted       allow safe/caution; block dangerous',
        '  community     allow safe only; block caution and dangerous',
        '  agent-created always ask',
        '',
      ];
      console.log(guardLines.join('\n'));
      return;
    }

    var skillPath = path.join(root, skillName);
    var source = 'community';
    // Detect source/trust from path
    var absSkillPath = path.resolve(skillPath);
    var relToHome = '';
    try {
      relToHome = path.relative(process.env.HOME || process.env.USERPROFILE || '', absSkillPath).replace(/\\/g, '/');
    } catch (e) {
      relToHome = '';
    }
    if (relToHome.startsWith('.hermes/skills')) {
      source = 'builtin';
    } else if (absSkillPath.replace(/\\/g, '/').startsWith(root.replace(/\\/g, '/'))) {
      source = 'agent-created';
    }

    if (!fs.existsSync(skillPath)) {
      console.log(col(C.red, 'Skill not found: ' + skillName) + ' in ' + root);
      return;
    }

    var force    = raw.indexOf('--force') >= 0 || raw.indexOf('-f') >= 0;
    var noCache  = raw.indexOf('--no-cache') >= 0;

    var result;
    if (noCache) {
      result = guardScan(skillPath, source);
    } else {
      try {
        var cached = guardScanCached(skillPath, source);
        result = cached.result;
      } catch (e) {
        result = guardScan(skillPath, source);
      }
    }

    // Format and print report
    var report = guardReport(result);
    console.log('\n' + report + '\n');

    var verdictColor = result.verdict === 'safe' ? C.green
      : result.verdict === 'caution' ? C.yellow : C.red;
    var verdictLabel = result.verdict.toUpperCase();
    console.log('  Trust level: ' + col(C.cyan, result.trust_level));
    console.log('  Verdict:     ' + col(C.bold + verdictColor, verdictLabel));

    var decision = guardAllow(result, force);
    if (decision.allowed === true) {
      console.log('  ' + col(C.green, '\u2713 ALLOWED') + '  ' + col(C.gray, decision.reason));
    } else if (decision.allowed === null) {
      console.log('  ' + col(C.yellow, '\u26A0 NEEDS CONFIRMATION') + '  ' + decision.reason);
    } else {
      console.log('  ' + col(C.red, '\u2717 BLOCKED') + '  ' + col(C.gray, decision.reason));
    }
    console.log('');
    return;
  }

  // ── Skill usage telemetry subcommands ────────────────────────────────────────

  // skills usage [name]
  if (sub === 'usage') {
    const SkillUsage = (() => {
      try { return require('../skill-usage'); } catch { return null; }
    })();

    if (!SkillUsage) {
      console.log(col(C.red, 'skill-usage module not available'));
      return 1;
    }

    const targetName = raw[1];

    if (targetName) {
      // Show usage for one skill
      const rec = SkillUsage.getUsage(targetName);
      const lastAct = SkillUsage.latestActivityAt(rec);
      const actCnt  = SkillUsage.getActivityCount(rec);
      const prov    = SkillUsage.provenance(targetName);

      console.log('\n  Skill: ' + col(C.cyan + C.bold, targetName));
      console.log('  State: ' + (rec.state === 'active' ? col(C.green, 'active')
        : rec.state === 'stale'  ? col(C.yellow, 'stale')
        : col(C.gray, 'archived')));
      if (rec.pinned) console.log('  ' + col(C.yellow, '[PINNED]'));
      console.log('  Source:    ' + col(C.gray, prov));
      console.log('  Use count: ' + rec.useCount);
      console.log('  View count: ' + rec.viewCount);
      console.log('  Patch count: ' + rec.patchCount);
      console.log('  Last used:   ' + (rec.lastUsedAt    ? rec.lastUsedAt    : col(C.gray, '(never)')));
      console.log('  Last viewed: ' + (rec.lastViewedAt  ? rec.lastViewedAt  : col(C.gray, '(never)')));
      console.log('  Last patched: ' + (rec.lastPatchedAt ? rec.lastPatchedAt : col(C.gray, '(never)')));
      console.log('  Last active:  ' + (lastAct            ? lastAct           : col(C.gray, '(never)')));
      console.log('  Activity #:   ' + actCnt);
      console.log('  Created:      ' + rec.createdAt);
      console.log('');
      tdoRecord('skills usage ' + targetName, true, 'state=' + rec.state + ' uses=' + rec.useCount);
      return;
    }

    // Show all skills usage
    const report = SkillUsage.usageReport();
    console.log('\n  Skill Usage Report  —  ' + report.length + ' skills\n');
    console.log('  ' + ['Name', 'Use', 'View', 'Patch', 'State', 'Last Active'].map(h => h.padEnd(12)).join(''));
    console.log('  ' + '─'.repeat(72));

    for (const row of report) {
      const last = row.lastActivityAt || col(C.gray, '—');
      const stateLabel = row.state === 'active'   ? col(C.green, 'active')
        : row.state === 'stale'  ? col(C.yellow, 'stale')
        : col(C.gray, 'archived');
      const pinnedMark = row.pinned ? col(C.yellow, '*') : ' ';
      console.log(
        '  ' + pinnedMark +
        row.name.padEnd(11).slice(0, 11) + ' ' +
        String(row.useCount).padEnd(12) +
        String(row.viewCount).padEnd(12) +
        String(row.patchCount).padEnd(12) +
        stateLabel.padEnd(12) +
        last
      );
    }
    console.log('');
    tdoRecord('skills usage', true, report.length + ' skills');
    return;
  }

  // skills stale [days=30]
  if (sub === 'stale') {
    const SkillUsage = (() => {
      try { return require('../skill-usage'); } catch { return null; }
    })();

    if (!SkillUsage) {
      console.log(col(C.red, 'skill-usage module not available'));
      tdoRecord('skills stale', false, 'module unavailable');
      return 1;
    }

    const days = parseInt(raw[1] || '30', 10);
    const stale = SkillUsage.listStale(days);

    if (stale.length === 0) {
      console.log('\n  ' + col(C.green, 'No stale skills') + '  (inactive > ' + days + ' days)\n');
      tdoRecord('skills stale', true, '0 stale');
      return;
    }

    console.log('\n  Stale Skills  —  ' + stale.length + ' inactive > ' + days + ' days\n');
    console.log('  ' + ['Name', 'Last Activity', 'State', 'Pinned'].map(h => h.padEnd(16)).join(''));
    console.log('  ' + '─'.repeat(68));

    for (const { name, record } of stale) {
      const last = SkillUsage.latestActivityAt(record) || col(C.gray, '(never)');
      const stateLabel = record.state === 'active' ? col(C.green, 'active')
        : record.state === 'stale'  ? col(C.yellow, 'stale')
        : col(C.gray, 'archived');
      const pinnedMark = record.pinned ? col(C.yellow, 'PINNED') : 'no';
      console.log('  ' + name.padEnd(16).slice(0, 16) + ' ' + last.padEnd(16).slice(0, 16) + ' ' + stateLabel.padEnd(16).slice(0, 16) + ' ' + pinnedMark);
    }
    console.log('');
    tdoRecord('skills stale', true, stale.length + ' stale');
    return;
  }

  // skills archive <name> [--all-stale] [days]
  if (sub === 'archive') {
    const SkillUsage = (() => {
      try { return require('../skill-usage'); } catch { return null; }
    })();

    if (!SkillUsage) {
      console.log(col(C.red, 'skill-usage module not available'));
      return 1;
    }

    const allStale = raw.indexOf('--all-stale') >= 0;
    const target   = allStale ? null : raw[1];
    const days     = parseInt(raw.find(a => /^\d+$/.test(a)) || '90', 10);

    if (!target && !allStale) {
      console.log('\n  purpclaw skills archive <name>  — archive one skill');
      console.log('  purpclaw skills archive --all-stale [days=90] — archive all stale skills');
      console.log('  purpclaw skills archive --list             — list archived skills');
      console.log('  purpclaw skills archive --restore <name>  — restore a skill\n');
      tdoRecord('skills archive', false, 'missing args');
      return;
    }

    // --list
    if (target === '--list' || allStale && raw[1] === '--list') {
      const archived = SkillUsage.listArchived();
      if (!archived.length) {
        console.log('\n  ' + col(C.gray, 'No archived skills.\n'));
        tdoRecord('skills archive --list', true, '0 archived');
        return;
      }
      console.log('\n  Archived Skills  —  ' + archived.length + '\n');
      for (const name of archived) console.log('    ' + col(C.cyan, name));
      console.log('');
      tdoRecord('skills archive --list', true, archived.length + ' archived');
      return;
    }

    // --restore
    if (target === '--restore' || allStale && raw[1] === '--restore') {
      const nameToRestore = allStale ? raw[2] : raw[2];
      if (!nameToRestore) {
        console.log('  usage: purpclaw skills archive --restore <name>\n');
        return;
      }
      const result = SkillUsage.restoreSkill(nameToRestore);
      if (result.ok) {
        console.log('  ' + col(C.green, 'Restored') + '  ' + result.message + '\n');
        tdoRecord('skills archive --restore ' + nameToRestore, true, result.message);
      } else {
        console.log('  ' + col(C.red, 'Failed') + '   ' + result.message + '\n');
        tdoRecord('skills archive --restore ' + nameToRestore, false, result.message);
      }
      return;
    }

    // archive one skill
    if (target) {
      const result = SkillUsage.archiveSkill(target);
      if (result.ok) {
        console.log('  ' + col(C.green, 'Archived') + '  ' + result.message + '\n');
        tdoRecord('skills archive ' + target, true, result.message);
      } else {
        console.log('  ' + col(C.red, 'Failed') + '   ' + result.message + '\n');
        tdoRecord('skills archive ' + target, false, result.message);
      }
      return;
    }

    // --all-stale
    if (allStale) {
      const stale = SkillUsage.listStale(days);
      if (!stale.length) {
        console.log('\n  ' + col(C.green, 'No stale skills') + '  (inactive > ' + days + ' days)\n');
        tdoRecord('skills archive --all-stale', true, '0 stale');
        return;
      }
      console.log('\n  Archiving ' + stale.length + ' stale skill(s)...\n');
      let archived = 0, failed = 0;
      for (const { name } of stale) {
        const result = SkillUsage.archiveSkill(name);
        if (result.ok) {
          console.log('  ' + col(C.green, 'Archived') + '  ' + name);
          archived++;
        } else {
          console.log('  ' + col(C.red, 'Skipped') + '   ' + name + ': ' + result.message);
          failed++;
        }
      }
      console.log('\n  Done — archived: ' + archived + ', skipped: ' + failed + '\n');
      tdoRecord('skills archive --all-stale', true, 'archived=' + archived + ' failed=' + failed);
      return;
    }
  }

  // ── purpclaw skills install <name> [source] ────────────────────────────────
  if (sub === 'install') {
    const skillName = raw[1];
    const sourceUrl = raw[2] || null;
    if (!skillName) {
      console.log(col(C.gray, 'Usage: purpclaw skills install <name> [github-url-or-local-path]'));
      console.log(col(C.gray, '  Installs a skill from GitHub or a local directory into skills/'));
      console.log(col(C.gray, '  Hub state is tracked in ~/.purpclaw/skills/.hub/lock.json'));
      tdoRecord('skills install', false, 'missing name');
      return;
    }

    ensureHubDirs();
    const hub = new SkillsHub();
    const src = sourceUrl || skillName; // bare name = search GitHub default taps

    console.log(col(C.cyan, 'Installing') + ` ${skillName} from ${src}...`);

    try {
      const result = await hub.installSkill(skillName, src);
      console.log(col(C.green, '  ✔ Installed') + ` ${result.name}`);
      console.log(col(C.gray, `  Source: ${result.source}`));
      console.log(col(C.gray, `  Path:   ${result.path}`));
      console.log(col(C.green, '\nSkill installed successfully. Pool will index on next boot.'));
      tdoRecord('skills install ' + skillName, true, result.source || 'hub');
    } catch (err) {
      console.log(col(C.red, '  ✘ Install failed') + `: ${err.message}`);
      tdoRecord('skills install ' + skillName, false, err.message);
    }
    return;
  }

  // ── purpclaw skills uninstall <name> ─────────────────────────────────────────
  if (sub === 'uninstall' || sub === 'remove') {
    const skillName = raw[1];
    if (!skillName) {
      console.log(col(C.gray, 'Usage: purpclaw skills uninstall <name>'));
      console.log(col(C.gray, '  Removes a hub-managed skill and its lock entry.'));
      return;
    }

    ensureHubDirs();
    const hub = new SkillsHub();
    const result = hub.uninstallSkill(skillName);

    if (!result.ok) {
      console.log(col(C.red, '  ✘ Failed') + `: ${result.error}`);
      tdoRecord('skills uninstall ' + skillName, false, result.error);
    } else {
      console.log(col(C.green, '  ✔ Uninstalled') + ` '${skillName}' from ${result.path}`);
      console.log(col(C.green, 'Skill removed from hub registry.'));
      tdoRecord('skills uninstall ' + skillName, true, result.path);
    }
    return;
  }

  // ── purpclaw skills check ───────────────────────────────────────────────────
  if (sub === 'check' || sub === 'updates') {
    const targetSkill = raw[1] || null;
    ensureHubDirs();
    const hub = new SkillsHub();

    if (targetSkill) {
      console.log(col(C.cyan, 'Checking updates for') + ` ${targetSkill}...`);
    } else {
      console.log(col(C.cyan, 'Checking all installed skills for updates...'));
    }

    try {
      const results = await hub.checkForUpdates(targetSkill);
      if (!results.length) {
        console.log(col(C.gray, '  No hub-installed skills found.'));
        return;
      }

      let upToDate = 0, needsUpdate = 0, unavailable = 0;
      for (const r of results) {
        if (r.status === 'up_to_date') upToDate++;
        else if (r.status === 'update_available') needsUpdate++;
        else unavailable++;
        console.log(formatUpdateResult(r));
      }
      console.log(col(C.gray, `\n  ${upToDate} up-to-date  ${needsUpdate} update(s)  ${unavailable} unavailable`));
    } catch (err) {
      console.log(col(C.red, 'Check failed') + `: ${err.message}`);
    }
    return;
  }

  // ── purpclaw skills update ─────────────────────────────────────────────────
  if (sub === 'update') {
    const targetSkill = raw[1] || null;
    ensureHubDirs();
    const hub = new SkillsHub();

    console.log(col(C.cyan, 'Checking for updates...'));
    let results;
    try {
      results = await hub.checkForUpdates(targetSkill);
    } catch (err) {
      console.log(col(C.red, 'Update check failed') + `: ${err.message}`);
      return;
    }

    const toUpdate = results.filter(r => r.status === 'update_available');
    if (!toUpdate.length) {
      console.log(col(C.green, '  All skills are up-to-date.'));
      return;
    }

    console.log(col(C.yellow, `  ${toUpdate.length} skill(s) have updates available.`));
    for (const r of toUpdate) {
      console.log(col(C.yellow, '  ↑') + ` ${r.name} — reinstalling...`);
      try {
        const uninstalled = hub.uninstallSkill(r.name);
        if (uninstalled.ok) {
          await hub.installSkill(r.name, r.identifier);
          console.log(col(C.green, '    ✔ Updated') + ` ${r.name}`);
        } else {
          console.log(col(C.red, '    ✘ Update failed') + `: ${uninstalled.error}`);
        }
      } catch (err) {
        console.log(col(C.red, '    ✘ Error') + `: ${err.message}`);
      }
    }
    return;
  }

  // ── purpclaw skills list-available ─────────────────────────────────────────
  if (sub === 'list-available' || sub === 'available' || sub === 'browse') {
    const query = raw.slice(1).join(' ').trim();
    ensureHubDirs();
    const hub = new SkillsHub();

    console.log(col(C.cyan, 'Searching skills hub...') + (query ? ` query="${query}"` : ''));
    try {
      const results = await hub.listAvailable(query, 30);
      if (!results.length) {
        console.log(col(C.gray, '  No results found.'));
        return;
      }
      console.log(col(C.gray, `\n  ${results.length} skill(s) found:\n`));
      results.forEach((meta, i) => console.log(formatSkillMeta(meta, i)));
      console.log('');
    } catch (err) {
      console.log(col(C.red, 'Search failed') + `: ${err.message}`);
    }
    return;
  }

  // fallback: help
  printHelp();
}

module.exports = { run };
