'use strict';

/**
 * lib/soul-registry.js — PURPCLAW Soul Registry Engine v0.1
 * ==========================================================
 * Canonical source of truth for agent identities, values, relationships,
 * and meeting dynamics. Every agent that exists in the soul registry has
 * a voice, a purpose, fears, wants, and a history.
 *
 * Usage:
 *   node lib/soul-registry.js              — list all souls
 *   node lib/soul-registry.js <id>         — show one soul
 *   node lib/soul-registry.js summon <q>  — convene a council for a problem
 *
 * API:
 *   const { SoulRegistry } = require('./lib/soul-registry');
 *   const sr = new SoulRegistry();
 *   sr.list();           // all souls
 *   sr.get(id);          // one soul
 *   sr.summon(problem);  // convene council for a problem
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOULS_FILE = path.join(ROOT, 'registry', 'souls.json');

function reqSafe(p) { try { return require(p); } catch (_) { return null; } }

class SoulRegistry {
  constructor(soulsFile = SOULS_FILE) {
    this._file = soulsFile;
    this._cache = null;
    this._loaded = false;
  }

  _load() {
    if (this._loaded) return;
    try {
      const raw = fs.readFileSync(this._file, 'utf8');
      this._cache = JSON.parse(raw);
    } catch (e) {
      this._cache = { schema: null, version: null, total: 0, souls: {} };
    }
    this._loaded = true;
  }

  get souls() {
    this._load();
    return this._cache.souls || {};
  }

  get meta() {
    this._load();
    return {
      schema: this._cache.schema,
      version: this._cache.version,
      total: Object.keys(this.souls).length,
      file: this._file,
    };
  }

  /** List all soul IDs and their titles */
  list() {
    const out = [];
    for (const [id, soul] of Object.entries(this.souls)) {
      out.push({
        id,
        name: soul.name,
        title: soul.title,
        emoji: soul.emoji,
        division: soul.division,
        species: soul.species,
      });
    }
    return out.sort((a, b) => (a.division || '').localeCompare(b.division || ''));
  }

  /** Get one soul by id */
  get(id) {
    return this.souls[id.toLowerCase()] || null;
  }

  /**
   * Convene a council for a given problem statement.
   * Queries soul traits to find the best participants, then selects
   * a chairperson based on meeting type and skill match.
   *
   * Returns: { problem, chair, council: [{id, name, reason, role}], skills_covered }
   */
  summon(problem, opts = {}) {
    const { maxCouncil = 8, chairOverride = null, meetingType = null } = opts;
    const problem_lower = (problem || '').toLowerCase();

    // Score every soul for this problem
    const scored = [];
    for (const [id, soul] of Object.entries(this.souls)) {
      const score = this._scoreSoulForProblem(soul, problem_lower);
      if (score.total > 0) {
        scored.push({ id, soul, ...score });
      }
    }

    // Sort by total score descending
    scored.sort((a, b) => b.total - a.total);

    // ── Flight pairs: if any scored soul is in top N, their counterpart joins ──
    const fpCouncilIds = new Set();
    for (const entry of scored.slice(0, maxCouncil)) {
      const soul = this.get(entry.id);
      const fpId = soul && soul.flight_pair;
      if (fpId) fpCouncilIds.add(fpId);
    }

    // Collect flight pair counterparts (even if they scored 0)
    const fpEntries = [];
    for (const fpId of fpCouncilIds) {
      const alreadyIn = scored.slice(0, maxCouncil).some(e => e.id === fpId);
      if (!alreadyIn) {
        const fpSoul = this.get(fpId);
        if (fpSoul) {
          const baseScore = this._scoreSoulForProblem(fpSoul, problem_lower);
          fpEntries.push({ id: fpId, soul: fpSoul, ...baseScore, _isFlightPair: true });
        }
      }
    }

    // Build full candidate list: top N scored + flight pair counterparts
    // (Flight pairs survive the sort even with 0 score — they got a bonus above)
    const allCandidates = [...scored.slice(0, maxCouncil), ...fpEntries];

    // Re-sort after adding flight pairs (so the best-scoring ones are in final council)
    allCandidates.sort((a, b) => b.total - a.total);

    // Build council from all candidates
    const rawCouncil = allCandidates.slice(0, maxCouncil).map(({ id, soul, total, reasons }) => ({
      id, name: soul.name, emoji: soul.emoji, title: soul.title,
      role: this._roleForSoul(soul, problem_lower, false),
      reason: reasons ? reasons.slice(0, 2).join('; ') : '',
      score: total,
    }));

    // Set flight_pair_activated
    const councilIds = new Set(rawCouncil.map(c => c.id));
    for (const member of rawCouncil) {
      const soul = this.get(member.id);
      const fpId = soul && soul.flight_pair;
      if (fpId && councilIds.has(fpId)) {
        member.flight_pair_activated = fpId;
      }
    }

    const council = rawCouncil;

    // Guard: empty scored list
    if (scored.length === 0) {
      return { problem, chair: null, council: [], skills_covered: [] };
    }

    // Select chair
    let chair;
    if (chairOverride) {
      const override = council.find(c => c.id === chairOverride.toLowerCase());
      chair = override || scored[0];
    } else {
      // Prefer soul whose chairs[] match meeting type keywords in the problem
      const problemKeywords = problem_lower.split(/\s+/).filter(w => w.length > 3);
      const preferred = scored.find(s => {
        if (!s.soul.chairs || !s.soul.chairs.length) return false;
        return s.soul.chairs.some(chair_type => {
          return problemKeywords.some(kw =>
            chair_type.includes(kw) ||
            kw.includes(chair_type) ||
            chair_type.includes(kw.replace(/-/g, '_'))
          );
        });
      });
      chair = preferred || scored[0];
    }

    // Mark the chair in the council with role 'chair'
    const chairMember = council.find(c => c.id === chair.id);
    if (chairMember) chairMember.role = 'chair';

    const skills_covered = this._skillsForCouncil(council);

    return {
      problem,
      chair: { id: chair.id, name: chair.soul.name, emoji: chair.soul.emoji, title: chair.soul.title },
      council: council.map(c => ({
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        title: c.title,
        role: c.role,
        reason: c.reason,
        score: c.score,
        flight_pair_activated: c.flight_pair_activated || null,
      })),
      skills_covered,
      total_candidates: scored.length,
    };
  }

  /** Score a single soul against a problem */
  _scoreSoulForProblem(soul, problem) {
    let total = 0;
    const reasons = [];
    const p = problem;

    const DIVISION_DEFAULT_SKILLS = {
      ENGINEERING: ['architecture', 'coding', 'testing', 'debugging', 'performance', 'refactoring', 'build', 'error', 'service', 'api', 'provider', 'router'],
      SECURITY: ['security', 'vulnerability', 'auth', 'access', 'audit', 'hack', 'breach', 'safe', 'threat'],
      INTELLIGENCE: ['research', 'analysis', 'pattern', 'detection', 'monitoring', 'signal', 'intel', 'alert'],
      SCIENCE: ['experiment', 'ml', 'model', 'data', 'analytics', 'statistics', 'training'],
      CREATIVE: ['creative', 'content', 'writing', 'design', 'ux', 'podcast', 'show', 'format', 'creative', 'brand', 'voice', 'media'],
      MANAGEMENT: ['planning', 'coordination', 'project', 'priority', 'roadmap', 'resource', 'budget', 'strategy'],
      OPERATIONS: ['automation', 'monitoring', 'deployment', 'reliability', 'incident', 'run', 'operate', 'recover'],
      INFRASTRUCTURE: ['performance', 'efficiency', 'monitoring', 'scaling', 'build', 'system'],
      MEDIA_OPS: ['media', 'video', 'audio', 'content', 'podcast', 'show', 'production', 'writing', 'creative', 'brand'],
      STRATEGIC: ['strategy', 'architecture', 'vision', 'direction', 'goal', 'align', 'roadmap'],
    };

    const div = (soul.division || '').toUpperCase();
    const skills = (soul.skills && soul.skills.length > 0)
      ? soul.skills
      : (DIVISION_DEFAULT_SKILLS[div] || []);

    const skillMatches = skills.filter(s => p.includes(s));
    if (skillMatches.length > 0) {
      total += skillMatches.length * 10;
      reasons.push(`skills: ${skillMatches.join(', ')}`);
    }

    const divisionRelevance = {
      engineering: ['provider', 'router', 'build', 'code', 'service', 'api', 'performance', 'refactor', 'architecture', 'debug', 'test', 'ci', 'deploy', 'database', 'backend', 'frontend', 'error', 'optimization'],
      security: ['security', 'vulnerability', 'auth', 'access', 'audit', 'hack', 'breach', 'safe', 'attack', 'threat', 'injection', 'exploit'],
      intelligence: ['analysis', 'research', 'pattern', 'signal', 'intel', 'detect', 'anomaly', 'monitor', 'alert', 'find'],
      science: ['experiment', 'ml', 'model', 'training', 'data', 'metric', 'statistic', 'analytics', 'prediction'],
      creative: ['creative', 'content', 'writing', 'copy', 'brand', 'voice', 'design', 'visual', 'ux', 'ui', 'media'],
      management: ['plan', 'roadmap', 'project', 'coordinate', 'resource', 'budget', 'priority', 'schedule', 'standup', 'agile'],
      operations: ['deploy', 'run', 'operate', 'monitor', 'recover', 'incident', 'automation', 'script', 'job', 'loop'],
      strategic: ['strategy', 'vision', 'roadmap', 'architecture', 'direction', 'goal', 'align'],
    };

    const divKey = div.toLowerCase();
    if (divisionRelevance[divKey]) {
      const divMatches = divisionRelevance[divKey].filter(k => p.includes(k));
      if (divMatches.length > 0) {
        total += divMatches.length * 5;
        reasons.push(`division: ${divMatches.join(', ')}`);
      }
    }

    if (soul.chairs) {
      for (const chair of soul.chairs) {
        if (p.includes(chair.replace(/_/g, ' ')) || p.includes(chair.replace(/-/g, ' '))) {
          total += 15;
          reasons.push(`attendance: ${chair}`);
        }
      }
    }

    if (p.includes('quality') && (soul.values || []).includes('quality')) { total += 5; reasons.push('values: quality'); }
    if (p.includes('speed') && (soul.values || []).includes('speed')) { total += 5; reasons.push('values: speed'); }
    if (p.includes('security') && (soul.values || []).includes('security')) { total += 5; reasons.push('values: security'); }
    if ((p.includes('creative') || p.includes('content') || p.includes('design')) && (soul.values || []).includes('creativity')) { total += 5; reasons.push('values: creativity'); }

    if (p.includes('decide') || p.includes('decision') || p.includes('council') || p.includes('meeting')) { total += 3; }

    if (p.includes('crash') && (soul.fears || []).some(f => f.includes('crash') || f.includes('break'))) { total += 4; }
    if (p.includes('leak') && (soul.fears || []).some(f => f.includes('leak') || f.includes('breach'))) { total += 4; }
    if (p.includes('slow') && (soul.fears || []).some(f => f.includes('slow') || f.includes('waste'))) { total += 4; }

    return { total, reasons };
  }

  _roleForSoul(soul, problem, isChair) {
    // Chair always says chair, regardless of skill match
    if (isChair) return 'chair';
    // Otherwise describe what they bring
    if (soul.chairs) {
      for (const chair_type of soul.chairs) {
        if (problem.includes(chair_type) || chair_type.split('-').some(w => problem.includes(w))) {
          return 'specialist';  // chairs this topic type, but the chair is someone else
        }
      }
    }
    if ((soul.skills || []).some(s => problem.includes(s))) {
      return 'expert';
    }
    if (soul.reports_to) {
      return 'specialist';
    }
    return 'participant';
  }

  _skillsForCouncil(council) {
    const skills = new Set();
    let profiles = {};
    try {
      const cp = require(path.join(ROOT, 'registry', 'council-profiles.json'));
      for (const p of Object.values(cp.profiles || {})) {
        profiles[p.id] = p;
      }
    } catch (_) {}

    for (const member of council) {
      // Prefer council-profile skills (they exist)
      const profile = profiles[member.id];
      if (profile && profile.skills) {
        profile.skills.forEach(s => skills.add(s));
      }
      // Fall back to soul skills
      const soul = this.get(member.id);
      if (soul && soul.skills) {
        soul.skills.forEach(s => skills.add(s));
      }
    }
    return Array.from(skills);
  }

  /** Print a soul as human-readable text */
  describe(id) {
    const soul = this.get(id);
    if (!soul) return `Soul not found: ${id}`;

    const lines = [
      `${soul.emoji} ${soul.name} — ${soul.title}`,
      `   Division: ${soul.division}  |  Species: ${soul.species}  |  Reports to: ${soul.reports_to || '(self)'}`,
      `   Signature: "${soul.signature || '—'}"`,
      `   Voice: ${soul.voice}`,
      ``,
      `Values:  ${(soul.values || []).join(', ')}`,
      `Wants:   ${(soul.wants || []).join(', ')}`,
      `Fears:   ${(soul.fears || []).join(', ')}`,
      `Annoyed: ${(soul.annoyed_by || []).join(', ')}`,
      ``,
      `Skills:  ${(soul.skills || []).join(', ')}`,
      `Chairs:  ${(soul.chairs || []).join(', ')}`,
      ``,
      `Long-term goal: ${soul.long_term_goal}`,
      `Personal goal:  ${soul.personal_goal}`,
      `Dream: ${soul.dream}`,
      ``,
      `Growth: confidence=${soul.growth?.confidence || '?'}  wisdom=${soul.growth?.wisdom || soul.growth?.patience || '?'}  humour=${soul.growth?.humour || '?'}`,
      `History: meetings=${soul.history?.meetings_attended || 0}  decisions=${soul.history?.decisions_made || 0}`,
    ];
    return lines.join('\n');
  }

  loadInterviews() {
    try {
      const p = path.join(ROOT, 'registry', 'soul-interviews.json');
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (_) {
      return { interviews: {} };
    }
  }

  /**
   * Oracle summon text — in-character invocation for each agent.
   * Not "Summoning Hermes." But Oracle referencing history, legacy, or context.
   */
  oracleSummonText(agentId, problem, score, councilResult) {
    const soul = this.get(agentId);
    if (!soul) return agentId + '...';

    const interviewsData = this.loadInterviews();
    const interview = (interviewsData.interviews || {})[agentId];
    const memories = soul.memories || {};
    const legacy = soul.legacy || [];
    const signature = soul.signature || '';
    const name = soul.name || agentId;

    const problem_lower = (problem || '').toLowerCase();
    const sees_risk    = /risk|vulnerable|security|exploit|breach|attack/.test(problem_lower);
    const sees_build   = /build|ship|deploy|create|launch|migrate|rewrite/.test(problem_lower);
    const sees_data    = /data|model|training|learn|feedback|memory/.test(problem_lower);
    const sees_creative = /creative|design|interface|ux|content|write|art/.test(problem_lower);
    const sees_recover = /recover|fix|repair|incident|outage|restore|degrad|broken/.test(problem_lower);
    const sees_audit   = /audit|review|verify|check|test|assess/.test(problem_lower);
    const sees_stuck   = /stuck|blocked|slow|paralysis|decision/.test(problem_lower);

    // Per-agent contextual invocations
    if (agentId === 'smith' && sees_risk) {
      return name + '... ' + signature + ' Your January find. This is similar.';
    }
    if (agentId === 'smith' && sees_audit) {
      return name + '... Your ' + (legacy[0] || 'security record') + '. We need that.';
    }
    if (agentId === 'smith' && sees_build) {
      return name + '... ' + signature + ' Find the holes before we ship.';
    }
    if (agentId === 'goose' && sees_build) {
      return name + '... ' + signature + ' Phoenix believes in you. So do I.';
    }
    if (agentId === 'goose' && sees_stuck) {
      return name + '... Your unconventional approach during the Provider Crisis. It worked.';
    }
    if (agentId === 'neo' && sees_audit) {
      return name + '... ' + signature + ' Your verification record speaks for itself.';
    }
    if (agentId === 'neo' && sees_build) {
      return name + '... ' + signature + ' Catch what the others miss.';
    }
    if (agentId === 'memory' && sees_data) {
      return name + '... ' + (memories.greatest_success || signature) + ' Your records are essential.';
    }
    if (agentId === 'hermes' && sees_recover) {
      return name + '... ' + signature + ' You taught Axolotl to regrow. We need that now.';
    }
    if (agentId === 'hermes' && sees_audit) {
      return name + '... Your ' + (legacy[0] || 'caution') + '. We need that now.';
    }
    if (agentId === 'hermes' && sees_build) {
      return name + '... ' + signature + ' Trace it before we move.';
    }
    if (agentId === 'weatherman' && (sees_risk || sees_recover)) {
      return name + '... ' + (memories.worst_day ? memories.worst_day.slice(0, 60) + '.' : 'Current conditions?');
    }
    if (agentId === 'architect' && sees_build) {
      return name + '... ' + signature + ' ' + (legacy[0] || 'Map the full picture.');
    }
    if (agentId === 'phoenix' && sees_creative) {
      return name + '... ' + signature + ' Burn it down if you have to. Build it better.';
    }
    if (agentId === 'oracle' && sees_stuck) {
      return name + '... ' + signature + ' The pattern suggests we need you.';
    }
    if (agentId === 'duck') {
      return name + '... *the duck watches*';
    }

    // Fallback — Oracle frames their deepest stated concern from the interview
    if (interview?.answers?.secret_want) {
      const want = interview.answers.secret_want.answer;
      // Frame it as Oracle invoking their inner motivation
      return name + '... ' + want;
    }
    if (signature) {
      return name + '... ' + signature;
    }
    return name + '...';
  }

  /**
   * Describe a council result with Oracle's in-character invocation text.
   */
  describeCouncil(result) {
    const problem = result.problem || '';

     // Build Oracle's invocation text for each member
     const oracleInvocation = {};
     for (const member of result.council) {
       oracleInvocation[member.id] = this.oracleSummonText(member.id, problem, member.score || 0, result);
     }

     // Build a map of flight pair partners: memberId → {name, emoji, title}
     // Only includes partners NOT already in the council (out-of-council counterparts)
     const councilIds = new Set(result.council.map(c => c.id));
     const flightPairPartners = {};
     for (const member of result.council) {
       if (!member.flight_pair_activated) continue;
       const partnerId = member.flight_pair_activated;
       if (!councilIds.has(partnerId)) {
         const fpSoul = this.get(partnerId);
         if (fpSoul) {
           flightPairPartners[member.id] = {
             id: partnerId,
             name: fpSoul.name,
             emoji: fpSoul.emoji,
             title: fpSoul.title,
           };
         }
       }
     }

     const lines = [
       ``,
       `🔮 Oracle: The council is convened.`,
       ``,
     ];

     for (const member of result.council) {
       const isChair = member.id === result.chair?.id;
       const oracleText = oracleInvocation[member.id] || member.name + '...';
       const fp = flightPairPartners[member.id];

       if (isChair) {
         // Chair with flight pair partner (who is not already in the council)
         if (fp) {
           lines.push(`  🪑 ${member.name} — ${member.title}`);
           lines.push(`     Chair. 「${oracleText}」`);
           lines.push(`  ${fp.emoji} ${fp.name} — ${fp.title}  ← Flight Pair activated`);
           lines.push(``);
         } else {
           lines.push(`  🪑 ${member.name} — ${member.title}`);
           lines.push(`     Chair. 「${oracleText}」`);
         }
         continue;
       }

       // Flight pair partner (out-of-council counterpart)
       if (fp) {
         lines.push(`  ${member.emoji} ${member.name} — ${member.title}`);
         lines.push(`     「${oracleText}」`);
         lines.push(`  ${fp.emoji} ${fp.name} — ${fp.title}  ← Flight Pair activated`);
         lines.push(``);
         continue;
       }

       lines.push(`  ${member.emoji} ${member.name} (${member.title})`);
       lines.push(`     「${oracleText}」`);
       lines.push(`       Role: ${member.role}  |  Reason: ${member.reason}`);
     }

     lines.push(``);
     lines.push(`Skills covered: ${result.skills_covered.join(', ')}`);
     lines.push(``);
     return lines.join('\n');
   }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const sr = new SoulRegistry();

if (args.length === 0) {
  // List all souls
  const meta = sr.meta;
  console.log(`\n🔮 PURPCLAW Soul Registry v${meta.version || '?'} — ${meta.total} souls\n`);
  const byDiv = {};
  for (const soul of sr.list()) {
    if (!byDiv[soul.division]) byDiv[soul.division] = [];
    byDiv[soul.division].push(soul);
  }
  for (const [div, souls] of Object.entries(byDiv).sort()) {
    console.log(`\n[${div}]`);
    for (const s of souls) {
      console.log(`  ${s.emoji} ${s.id.padEnd(25)} ${s.title}`);
    }
  }
  console.log(`\nTotal: ${meta.total} souls\n`);
} else if (args[0] === 'summon' || args[0] === 'council') {
  const problem = args.slice(1).join(' ') || 'general system question';
  const result = sr.summon(problem);
  console.log(sr.describeCouncil(result));
} else {
  // Show one soul
  const id = args[0];
  const soul = sr.get(id);
  if (!soul) {
    console.error(`Soul not found: ${id}`);
    console.error(`Run 'node lib/soul-registry.js' to list all souls.`);
    process.exit(1);
  }
  console.log(sr.describe(id));
}
}

module.exports = { SoulRegistry };
