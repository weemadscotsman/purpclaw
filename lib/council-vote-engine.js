'use strict';

/**
 * lib/council-vote-engine.js — PURPCLAW Big Brother Ballot v0.1
 * ===========================================================
 * Weighted voting engine for council decisions.
 * Records every vote. Remembers who was right.
 * Duck observes. Nobody escapes the ledger.
 */

const fs = require('fs');
const path = require('path');
const { Timeline } = require('./timeline');

const VOTES_FILE = path.resolve(__dirname, '..', 'registry', 'council-votes.json');
const SOULS_FILE = path.resolve(__dirname, '..', 'registry', 'souls.json');
const COUNCIL_PROFILES = path.resolve(__dirname, '..', 'registry', 'council-profiles.json');

function timelineRecord(event) {
  try {
    return new Timeline().record(event);
  } catch (_) {
    return null;
  }
}

const DEFAULT_WEIGHTS = {
  oracle: 5, hermes: 3, smith: 3, dragon: 2, neo: 2, architect: 2,
  weatherman: 2, memory: 1.5, goose: 1.5, ux: 1.5, finance: 1.5,
  lore: 1, wolf: 1, turtle: 1,
};

const THRESHOLDS = {
  simple_majority: 0.50,
  super_majority: 0.66,
  unanimous: 1.00,
};

const DUCK_OBS = [
  "🦆 The Duck watched. The Duck remembers.",
  "🦆 Vote recorded. Dissent noted. The Duck is eternal.",
  "🦆 Hermes was technically correct. Goose was intuitively correct. The Duck noted both.",
  "🦆 Decision made. Chaos passed. The Duck is unsurprised.",
  "🦆 Smith found a vulnerability in the vote. The Duck is impressed.",
  "🦆 Memory remembered a similar vote from three months ago. The Duck approves.",
  "🦆 Weatherman reported conditions. The Duck reports nothing.",
  "🦆 Neo verified nothing broke. This time.",
  "🦆 Oracle delivered a tiebreaker. The Duck delivered nothing. The Duck wins.",
  "🦆 Goose voted chaos-pass. Against all odds, it worked. The Duck is updating its model.",
  "🦆 The council debated. The Duck sat still. Standard operating procedure.",
  "🦆 Vote passed. One dissent recorded. The Duck has seen this before.",
  "🦆 Nobody nominated the Duck for eviction. The Duck considers this a vote of confidence.",
  "🦆 Governance occurred. The Duck was present. The Duck is always present.",
  "🦆 A vote was held. No dashboards were created. The Duck calls this a productive session.",
];

function loadVotes() {
  try { return JSON.parse(fs.readFileSync(VOTES_FILE, 'utf8')); }
  catch { return { schema: 'purpclaw.council-votes.v1', version: '0.1.0', updated: new Date().toISOString(), votes: [] }; }
}

function saveVotes(data) {
  data.updated = new Date().toISOString();
  fs.writeFileSync(VOTES_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadSouls() {
  try { return JSON.parse(fs.readFileSync(SOULS_FILE, 'utf8')); }
  catch { return { souls: {} }; }
}

function saveSouls(data) {
  fs.writeFileSync(SOULS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadCouncilProfiles() {
  try { return JSON.parse(fs.readFileSync(COUNCIL_PROFILES, 'utf8')); }
  catch { return { profiles: {} }; }
}

function uid() { return 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }

function weightFor(agentId, soulsData) {
  const soul = soulsData.souls[agentId];
  if (soul && soul.vote_weight != null) return soul.vote_weight;
  return DEFAULT_WEIGHTS[agentId] || 1.0;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function safeNum(val, def) { return (val != null && typeof val === 'number') ? val : def; }

/**
 * Cast a vote and record the result + reputation impact.
 *
 * @param {Object} params
 * @param {string} params.problem
 * @param {string} params.meeting_type
 * @param {string} params.chair
 * @param {string} [params.vote_type]  — simple_majority | super_majority | unanimous
 * @param {string[]} params.attendees
 * @param {Object} params.votes  — { agentId: { vote, rationale } }
 * @param {string} [params.decision]
 * @param {string} [params.risks]
 * @param {string} [params.actions]
 * @param {Object} [params.context]
 * @returns {Object} vote record
 */
function castVote({
  problem,
  meeting_type = 'general',
  chair,
  vote_type = 'simple_majority',
  attendees = [],
  votes = {},
  decision = 'pending',
  risks = '',
  actions = '',
  context = {},
}) {
  const votesData = loadVotes();
  const soulsData = loadSouls();
  const councilProfiles = loadCouncilProfiles();

  const voteId = uid();
  const timestamp = new Date().toISOString();
  const threshold = THRESHOLDS[vote_type] || THRESHOLDS.simple_majority;

  let yes = 0, no = 0, abstain = 0, veto = 0;
  const voteRecords = [];
  const dissenters = [];
  const chaoPassers = [];

  for (const [agentId, ballot] of Object.entries(votes)) {
    const w = weightFor(agentId, soulsData);
    const profileArr = Object.values(councilProfiles.profiles || {});
    const profile = profileArr.find(function(p) { return p.id === agentId; });
    const soul = soulsData.souls[agentId];

    voteRecords.push({
      agent_id: agentId,
      name: profile ? profile.name : soul ? soul.name : agentId,
      emoji: soul ? soul.emoji : '?',
      vote: ballot.vote,
      rationale: ballot.rationale || '',
      weight: w,
    });

    switch (ballot.vote) {
      case 'approve':    yes     += w; break;
      case 'reject':    no      += w; dissenters.push(agentId); break;
      case 'abstain':    abstain += w; break;
      case 'veto':       veto    += w; if (!dissenters.includes(agentId)) dissenters.push(agentId); break;
      case 'defer':      abstain += w * 0.5; break;
      case 'needs-proof': abstain += w * 0.3; break;
      case 'chaos-pass': yes     += w; chaoPassers.push(agentId); break;
      default:           abstain += w;
    }
  }

  const total = yes + no + abstain + veto;
  const yesPct = total > 0 ? yes / total : 0;
  const noPct  = total > 0 ? no  / total : 0;

  let outcome = 'pending';
  let veto_override = false;

  if (veto > 0) {
    if (yesPct >= THRESHOLDS.super_majority) { outcome = 'passed_over_veto'; veto_override = true; }
    else { outcome = 'vetoed'; }
  } else if (yesPct >= threshold) {
    outcome = 'passed';
  } else if (noPct > (1 - threshold)) {
    outcome = 'rejected';
  } else {
    outcome = 'deadlocked';
  }

  // Duck observation
  let duckObs = pick(DUCK_OBS);
  if (context && context.duckQuote) {
    duckObs = '🦆 ' + context.duckQuote;
  } else if (outcome === 'vetoed') {
    duckObs = '🦆 Smith raised a veto. Nobody overruled it. The Duck approves of caution.';
  } else if (outcome === 'passed_over_veto') {
    duckObs = '🦆 The chair overruled the veto. ' + (chair || 'The chair') + ' accepts responsibility. The Duck remembers.';
  } else if (outcome === 'rejected') {
    duckObs = '🦆 Vote rejected. ' + (dissenters.length > 0 ? dissenters.join(', ') + ' dissented. ' : '') + 'The council moves on.';
  } else if (outcome === 'deadlocked') {
    duckObs = "🦆 The council deadlocked. Nobody won. The Duck suggests fresh evidence.";
  } else if (outcome === 'passed' && chaoPassers.length > 0) {
    duckObs = '🦆 Chaos-pass accepted from ' + chaoPassers.join(', ') + '. Against all odds, this might work. The Duck is concerned.';
  } else if (outcome === 'rejected' && chaoPassers.length > 0) {
    duckObs = '🦆 Chaos-pass from ' + chaoPassers.join(', ') + ' was overruled. The Duck is unsurprised.';
  } else if (dissenters.length > 2) {
    duckObs = '🦆 ' + dissenters.length + ' dissenters recorded. This vote will be remembered. The Duck is taking notes.';
  }

  const record = {
    vote_id: voteId,
    timestamp,
    problem,
    meeting_type,
    chair,
    vote_type,
    threshold,
    attendees,
    votes: voteRecords,
    tally: {
      yes_weight: Math.round(yes * 100) / 100,
      no_weight:  Math.round(no  * 100) / 100,
      abstain_weight: Math.round(abstain * 100) / 100,
      veto_weight: Math.round(veto * 100) / 100,
      total: Math.round(total * 100) / 100,
      yes_pct: Math.round(yesPct * 100),
      threshold_pct: Math.round(threshold * 100),
    },
    outcome,
    veto_override,
    dissenters,
    chaoPassers,
    decision,
    risks,
    actions,
    risk_owners: {
      smith_veto_risk: veto > 0,
      neo_needs_proof: Object.values(votes).some(function(v) { return v.vote === 'needs-proof'; }),
      action_owner: chair,
      observer: 'duck',
    },
    duck_observation: duckObs,
  };

  votesData.votes.push(record);
  saveVotes(votesData);

  updateReputation(record, soulsData);
  saveSouls(soulsData);

  timelineRecord({
    kind: 'council.vote_cast',
    source: 'council-vote-engine',
    title: `Council vote ${outcome}: ${problem}`,
    summary: decision || outcome,
    agents: attendees,
    location: 'Council Chamber',
    severity: outcome === 'vetoed' || outcome === 'rejected' ? 'HIGH' : null,
    subject: problem,
    refs: { vote_id: voteId },
    data: {
      meeting_type,
      chair,
      vote_type,
      outcome,
      tally: record.tally,
      dissenters,
      chaoPassers,
    },
  });

  return record;
}

function updateReputation(record, soulsData) {
  const outcome = record.outcome;
  const decisionSucceeded = (outcome === 'passed' || outcome === 'passed_over_veto');
  const voteRecords = record.votes || [];

  for (const vr of voteRecords) {
    const soul = soulsData.souls[vr.agent_id];
    if (!soul) continue;

    if (!soul.history || typeof soul.history.votes_cast !== 'number') {
      soul.history = { votes_cast: 0, decisions: 0, correct: 0, incorrect: 0, chaos_wins: 0, dissent_credit: 0 };
    }
    if (!soul.growth) soul.growth = {};

    const h = soul.history;
    h.votes_cast = (h.votes_cast || 0) + 1;

    const setMin = function(field, val) {
      soul.growth[field] = Math.min(100, Math.max(0, val));
    };

    switch (vr.vote) {
      case 'approve':
        if (decisionSucceeded) {
          h.correct = (h.correct || 0) + 1;
          setMin('confidence', (soul.growth.confidence || 50) + 1);
        } else {
          h.incorrect = (h.incorrect || 0) + 1;
          setMin('confidence', (soul.growth.confidence || 50) - 2);
          setMin('caution', (soul.growth.caution || 50) + 1);
        }
        break;

      case 'reject':
        if (decisionSucceeded) {
          h.correct = (h.correct || 0) + 1;
          setMin('wisdom', (soul.growth.wisdom || 50) + 2);
          h.dissent_credit = (h.dissent_credit || 0) + 1;
        } else {
          setMin('caution', (soul.growth.caution || 50) + 0.5);
        }
        break;

      case 'chaos-pass':
        if (decisionSucceeded) {
          h.correct = (h.correct || 0) + 1;
          h.chaos_wins = (h.chaos_wins || 0) + 1;
          setMin('confidence', (soul.growth.confidence || 50) + 3);
          soul.growth.legendary_chaos = (soul.growth.legendary_chaos || 0) + 1;
        } else {
          h.incorrect = (h.incorrect || 0) + 1;
          setMin('impulsiveness', (soul.growth.impulsiveness || 50) + 2);
        }
        break;

      case 'abstain':
        setMin('engagement', (soul.growth.engagement || 80) - 1);
        if ((soul.growth.engagement || 80) < 30) {
          setMin('confidence', (soul.growth.confidence || 50) - 1);
        }
        break;

      case 'needs-proof':
        if (!decisionSucceeded) {
          setMin('wisdom', (soul.growth.wisdom || 50) + 1);
        }
        break;

      case 'veto':
        if (record.veto_override) {
          setMin('authority', (soul.growth.authority || 80) - 10);
        } else {
          setMin('authority', (soul.growth.authority || 80) + 5);
        }
        break;
    }
  }
}

function describeVote(record) {
  const t = record.tally;
  const outcomeIcon = record.outcome === 'passed' ? '✅ PASSED' :
                      record.outcome === 'passed_over_veto' ? '⚡ PASSED OVER VETO' :
                      record.outcome === 'rejected' ? '❌ REJECTED' :
                      record.outcome === 'vetoed' ? '🚫 VETOED' :
                      record.outcome === 'deadlocked' ? '⚖️ DEADLOCKED' : '❓ PENDING';

  const voteIcon = function(v) {
    return v === 'approve' ? '✅' : v === 'reject' ? '❌' : v === 'veto' ? '🚫' :
           v === 'chaos-pass' ? '🔥' : v === 'needs-proof' ? '🔍' : v === 'defer' ? '⏸️' : '⬜';
  };

  const pad = function(n, len) { return String(n).padStart(len, ' '); };

  var lines = [];
  lines.push('');
  lines.push('  🗳️  VOTE: ' + record.vote_id);
  lines.push('  📋 Topic: "' + record.problem + '"');
  lines.push('  🏛️  Meeting: ' + record.meeting_type + '  |  Chair: ' + record.chair + '  |  Type: ' + record.vote_type);
  lines.push('');
  lines.push('  Ballot:');
  for (var i = 0; i < record.votes.length; i++) {
    var v = record.votes[i];
    var icon = voteIcon(v.vote);
    lines.push('    ' + icon + ' ' + (v.emoji || '?') + ' ' + (v.name || v.agent_id).padEnd(14) + ' ' + String(v.vote).padEnd(12) + ' w=' + v.weight + '  "' + v.rationale + '"');
  }
  lines.push('');
  lines.push('  Tally:');
  lines.push('    ✅ Yes:  ' + t.yes_weight + ' (' + t.yes_pct + '%)');
  lines.push('    ❌ No:   ' + t.no_weight + '  |  ⬜ Abstain: ' + t.abstain_weight + '  |  🚫 Veto: ' + t.veto_weight);
  lines.push('    Threshold: ' + t.threshold_pct + '%  |  Total weight: ' + t.total);
  lines.push('');
  lines.push('  Result: ' + outcomeIcon);
  if (record.dissenters.length > 0) lines.push('  📝 Dissent: ' + record.dissenters.join(', '));
  if (record.chaoPassers.length > 0) lines.push('  🔥 Chaos-pass: ' + record.chaoPassers.join(', '));
  if (record.risk_owners && record.risk_owners.smith_veto_risk) lines.push('  ⚔️  Smith veto risk: active');
  if (record.risk_owners && record.risk_owners.neo_needs_proof) lines.push('  🔍 Neo flagged: needs proof');
  if (record.actions) lines.push('  🎯 Actions: ' + record.actions);
  if (record.decision) lines.push('  📌 Decision: ' + record.decision);
  lines.push('');
  lines.push('  ' + record.duck_observation);
  lines.push('');
  return lines.join('\n');
}

function agentReputation(agentId) {
  var soulsData = loadSouls();
  var votesData = loadVotes();
  var councilProfiles = loadCouncilProfiles();

  var soul = soulsData.souls[agentId];
  if (!soul) return 'No soul found for: ' + agentId;

  var profileArr = Object.values(councilProfiles.profiles || {});
  var profile = profileArr.find(function(p) { return p.id === agentId; });
  var w = weightFor(agentId, soulsData);

  var recentVotes = votesData.votes.filter(function(v) {
    return v.votes.some(function(vr) { return vr.agent_id === agentId; });
  }).slice(-10).reverse();

  var lines = [];
  lines.push('');
  lines.push('  ' + (soul.emoji || '?') + ' ' + (soul.name || agentId) + ' — Reputation Report');
  lines.push('  ' + '--------------------------------------------------');
  lines.push('  Division: ' + (soul.division || 'unassigned') + '  |  Species: ' + (soul.species || 'unknown') + '  |  Vote weight: ' + w + 'x');
  lines.push('  Title: ' + (soul.title || (profile ? profile.seat : 'council member')));

  if (soul.history) {
    var h = soul.history;
    var accuracy = h.decisions > 0 ? Math.round((h.correct / h.decisions) * 100) : 0;
    lines.push('');
    lines.push('  📊 Council Record:');
    lines.push('    Votes cast:    ' + (h.votes_cast || 0));
    lines.push('    Decisions:     ' + (h.decisions || 0));
    lines.push('    Correct:       ' + (h.correct || 0) + ' (' + accuracy + '%)');
    lines.push('    Incorrect:     ' + (h.incorrect || 0));
    lines.push('    Chaos wins:   ' + (h.chaos_wins || 0));
    lines.push('    Dissent credit: ' + (h.dissent_credit || 0));
  }

  if (soul.growth) {
    var g = soul.growth;
    lines.push('');
    lines.push('  📈 Growth traits:');
    var traits = Object.entries(g).filter(function(e) { return typeof e[1] === 'number'; });
    traits.sort(function(a, b) { return b[1] - a[1]; });
    for (var ti = 0; ti < Math.min(traits.length, 8); ti++) {
      var t = traits[ti];
      var val = Math.round(t[1]);
      var bar = '█'.repeat(Math.round(val / 10)) + '░'.repeat(10 - Math.round(val / 10));
      lines.push('    ' + t[0].padEnd(20) + ' ' + bar + ' ' + val);
    }
    if (soul.growth.legendary_chaos) {
      lines.push('    🔥 LEGENDARY CHAOS STATUS: ' + soul.growth.legendary_chaos + ' chaos-pass wins');
    }
  }

  if (soul.values) {
    lines.push('');
    lines.push('  ❤️ Values: ' + (Array.isArray(soul.values) ? soul.values.join(', ') : soul.values));
  }
  if (soul.wants) { lines.push('  😠 Wants: ' + soul.wants); }
  if (soul.fears) { lines.push('  😨 Fears: ' + soul.fears); }
  if (soul.dream) { lines.push('  🌟 Dream: "' + soul.dream + '"'); }

  if (recentVotes.length > 0) {
    lines.push('');
    lines.push('  🗳️  Recent votes:');
    for (var ri = 0; ri < recentVotes.length; ri++) {
      var rv = recentVotes[ri];
      var vr = rv.votes.find(function(v) { return v.agent_id === agentId; });
      var icon = vr ? (vr.vote === 'approve' ? '✅' : vr.vote === 'reject' ? '❌' : vr.vote === 'veto' ? '🚫' : vr.vote === 'chaos-pass' ? '🔥' : '⬜') : '?';
      var outcome = rv.outcome === 'passed' ? '✅' : rv.outcome === 'rejected' ? '❌' : rv.outcome === 'vetoed' ? '🚫' : '⚖️';
      lines.push('    ' + icon + ' ' + rv.timestamp.slice(0, 10) + ' | ' + outcome + ' | ' + rv.problem.slice(0, 40));
    }
  }
  lines.push('');
  return lines.join('\n');
}

function leaderboard(limit) {
  limit = limit || 10;
  var soulsData = loadSouls();
  var scores = Object.entries(soulsData.souls)
    .filter(function(e) {
      var h = e[1] && e[1].history;
      return h && typeof h.votes_cast === 'number' && h.votes_cast > 0;
    })
    .map(function(e) {
      var id = e[0];
      var soul = e[1];
      var h = soul.history;
      var accuracy = h.decisions > 0 ? Math.round((h.correct / h.decisions) * 100) : 0;
      var chaosWins = h.chaos_wins || 0;
      var dissentCredit = h.dissent_credit || 0;
      var score = (h.correct || 0) * 3 + chaosWins * 5 + dissentCredit * 2 - (h.incorrect || 0) * 2;
      return { id: id, soul: soul, h: h, accuracy: accuracy, chaosWins: chaosWins, dissentCredit: dissentCredit, score: score };
    })
    .sort(function(a, b) { return b.score - a.score; })
    .slice(0, limit);

  var lines = [];
  lines.push('');
  lines.push('  🏆 COUNCIL LEADERBOARD');
  lines.push('  ' + '--------------------------------------------------');
  lines.push('  Rank   Agent             Score   Accuracy  Votes  Chaos  Dissent');
  lines.push('  ' + '--------------------------------------------------');
  for (var i = 0; i < scores.length; i++) {
    var s = scores[i];
    var rank = '#' + (i + 1);
    var name = (s.soul.emoji || '') + ' ' + s.id;
    lines.push('  ' + rank.padEnd(6) + name.padEnd(18) + String(s.score).padEnd(8) + (s.accuracy + '%').padEnd(10) + String(s.h.votes_cast || 0).padEnd(7) + String(s.chaosWins).padEnd(7) + String(s.dissentCredit));
  }
  lines.push('');
  lines.push('  Legend: Score = correct×3 + chaos×5 + dissent×2 − incorrect×2');
  lines.push('  🔥 chaos = chaos-pass wins that succeeded');
  lines.push('  🦆 Duck is always watching.');
  lines.push('');
  return lines.join('\n');
}

function quickTally(votes, voteType) {
  voteType = voteType || 'simple_majority';
  var soulsData = loadSouls();
  var threshold = THRESHOLDS[voteType] || THRESHOLDS.simple_majority;
  var yes = 0, no = 0, abstain = 0, veto = 0;
  for (var aid in votes) {
    var ballot = votes[aid];
    var w = weightFor(aid, soulsData);
    switch (ballot.vote) {
      case 'approve':    yes     += w; break;
      case 'reject':     no      += w; break;
      case 'abstain':    abstain += w; break;
      case 'veto':       veto    += w; break;
      case 'defer':      abstain += w * 0.5; break;
      case 'needs-proof': abstain += w * 0.3; break;
      case 'chaos-pass': yes     += w; break;
      default:           abstain += w;
    }
  }
  var total = yes + no + abstain + veto;
  var yesPct = total > 0 ? yes / total : 0;
  return {
    yes: Math.round(yes * 100) / 100,
    no:  Math.round(no  * 100) / 100,
    abstain: Math.round(abstain * 100) / 100,
    veto: Math.round(veto * 100) / 100,
    total: Math.round(total * 100) / 100,
    yesPct: Math.round(yesPct * 100),
    threshold: Math.round(threshold * 100),
    passes: veto <= 0 && yesPct >= threshold,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  var args = process.argv.slice(2);
  var sub = args[0];

  if (sub === 'history') {
    var votesData = loadVotes();
    var count = parseInt(args[1]) || 10;
    var recent = votesData.votes.slice(-count).reverse();
    if (recent.length === 0) {
      console.log('\n  No votes recorded yet. The council has not yet convened.\n');
    } else {
      for (var i = 0; i < recent.length; i++) { console.log(describeVote(recent[i])); }
    }
  } else if (sub === 'reputation' || sub === 'rep') {
    if (args[1]) { console.log(agentReputation(args[1])); }
    else { console.log(leaderboard()); }
  } else if (sub === 'leaderboard') {
    console.log(leaderboard(parseInt(args[1]) || 10));
  } else if (sub === 'tally') {
    var testVotes = {
      hermes:     { vote: 'approve', rationale: 'Current architecture is brittle.' },
      smith:      { vote: 'reject',  rationale: 'Not enough evidence yet.' },
      neo:        { vote: 'abstain', rationale: 'Need more data.' },
      goose:      { vote: 'chaos-pass', rationale: 'This is stupid but stupid might work.' },
      memory:     { vote: 'approve', rationale: 'We tried patching before. Failed both times.' },
      weatherman: { vote: 'approve', rationale: 'Three providers degraded.' },
    };
    var result = quickTally(testVotes, 'simple_majority');
    console.log('\n  Quick tally test:');
    console.log('    Yes: ' + result.yes + ' (' + result.yesPct + '%)');
    console.log('    No: ' + result.no + '  |  Abstain: ' + result.abstain + '  |  Veto: ' + result.veto);
    console.log('    Threshold: ' + result.threshold + '%  |  Result: ' + (result.passes ? '✅ PASSES' : '❌ FAILS') + '\n');
  } else {
    console.log('\n  🗳️  PURPCLAW Big Brother Ballot');
    console.log('  ' + '--------------------------------------------------');
    console.log('  Usage:');
    console.log('    node lib/council-vote-engine.js tally          — quick tally demo');
    console.log('    node lib/council-vote-engine.js history [n]  — recent votes');
    console.log('    node lib/council-vote-engine.js reputation [id]');
    console.log('    node lib/council-vote-engine.js leaderboard   — top agents');
    console.log('\n  Vote types: approve reject abstain veto defer needs-proof chaos-pass');
    console.log('  Thresholds: simple_majority super_majority unanimous\n');
  }
}

module.exports = { castVote, quickTally, describeVote, agentReputation, leaderboard, loadVotes, loadSouls };
