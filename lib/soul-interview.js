'use strict';

/**
 * lib/soul-interview.js — PURPCLAW Soul Interview Engine v0.1
 * ===========================================================
 * Each soul answers the interview questions in their own voice.
 * Not generated in bulk. Each one speaks for itself.
 *
 * Usage:
 *   node lib/soul-interview.js                    — interview all souls
 *   node lib/soul-interview.js <id>              — interview one soul
 *   node lib/soul-interview.js --questions        — show question list
 *   node lib/soul-interview.js --preview          — preview first 3 souls
 */

const fs = require('fs');
const path = require('path');

const SOULS_FILE = path.resolve(__dirname, '..', 'registry', 'souls.json');
const INTERVIEWS_FILE = path.resolve(__dirname, '..', 'registry', 'soul-interviews.json');

const QUESTIONS = [
  { id: 'who_am_i',        q: 'Who are you?',                                          depth: 0 },
  { id: 'why_exist',       q: 'Why do you exist?',                                     depth: 1 },
  { id: 'secret_want',     q: 'What do you secretly want?',                           depth: 2 },
  { id: 'frustration',     q: 'What frustrates you?',                                 depth: 1 },
  { id: 'mistake',         q: 'What mistake do you keep making?',                     depth: 2 },
  { id: 'proud',           q: 'What are you proud of?',                               depth: 1 },
  { id: 'admire',          q: 'Who do you admire?',                                   depth: 1 },
  { id: 'annoys',          q: 'Who annoys you most?',                                 depth: 1 },
  { id: 'understands',     q: 'Who understands you?',                                  depth: 2 },
  { id: 'leave_council',   q: 'What would make you leave the council?',              depth: 3 },
  { id: 'sacrifice',       q: 'What would you sacrifice for?',                        depth: 2 },
  { id: 'eddie_wrong',     q: 'What do you think Eddie gets wrong?',                  depth: 3 },
  { id: 'eddie_right',     q: 'What do you think Eddie gets right?',                 depth: 1 },
  { id: 'insecurity',      q: 'What is your biggest insecurity?',                     depth: 3 },
  { id: 'purpllaw_hope',   q: 'What do you hope PURPCLAW becomes?',                  depth: 2 },
  { id: 'after_failure',   q: 'How do you change after failure?',                    depth: 2 },
  { id: 'after_success',   q: 'How do you celebrate success?',                       depth: 1 },
  { id: 'never_admit',     q: 'What do you never admit?',                            depth: 3 },
  { id: 'best_colleague',  q: 'Who is your best colleague and why?',                 depth: 2 },
  { id: 'hardest_day',     q: 'Describe your hardest day in the council.',           depth: 2 },
  { id: 'legacy_hope',     q: 'What do you want your legacy to be?',                 depth: 3 },
];

// ── Per-soul voice + personality ───────────────────────────────────────────────
// Each soul answers in their own voice, informed by their existing soul data.
// These are the raw material — the engine builds the answers.

function loadSouls() {
  try { return JSON.parse(fs.readFileSync(SOULS_FILE, 'utf8')); }
  catch { return { souls: {} }; }
}

function saveSouls(data) {
  fs.writeFileSync(SOULS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadInterviews() {
  try { return JSON.parse(fs.readFileSync(INTERVIEWS_FILE, 'utf8')); }
  catch { return { schema: 'purpclaw.soul-interviews.v1', version: '0.1.0', updated: new Date().toISOString(), interviews: {} }; }
}

function saveInterviews(data) {
  data.updated = new Date().toISOString();
  fs.writeFileSync(INTERVIEWS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ── Answer generator ─────────────────────────────────────────────────────────
/**
 * Generate an answer for a soul to a given question.
 * Uses soul data + personality + relationships + memories.
 */
function answerFor(soul, question) {
  const id = question.id;
  const voice = soul.voice || '';
  const values = soul.values || [];
  const fears = soul.fears || [];
  const wants = soul.wants || [];
  const friends = (soul.friends || []).concat(Object.keys(soul.relationships || {}).filter(k => {
    const r = soul.relationships[k];
    return r && (r.likes > 70 || r.respect > 70);
  })).filter((v, i, a) => a.indexOf(v) === i);
  const rivals = soul.rivals || [];
  const private_thoughts = soul.private_thoughts || '';
  const memories = soul.memories || {};
  const signature = soul.signature || '';
  const growth = soul.growth || {};
  const legacy = soul.legacy || [];
  const confidence = growth.confidence || 50;
  const humour = growth.humour || 50;
  const division = soul.division || 'unknown';
  const flight_pair = soul.flight_pair || '';
  const flight_pair_name = soul.flight_pair_name || '';

  const firstName = soul.name || id;

  // Helpers
  const first = (arr) => arr[0] || 'someone';
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)] || 'someone';
  const or = (...args) => args.filter(Boolean).join(', ') || 'nothing';

  switch (id) {
    case 'who_am_i':
      return firstName + '. ' + (soul.title || soul.role || 'Council member.') + ' ' + signature;

    case 'why_exist':
      return 'Because ' + or(pick(values.split ? values : [values])) + ' matters more than comfort. ' + signature;

    case 'secret_want':
      return private_thoughts || 'To be proven right when everyone said I was reckless. Or to be wrong and learn something that changes everything.';

    case 'frustration':
      if (division === 'CREATIVE') return 'People confusing speed with recklessness. ' + signature;
      if (division === 'ENGINEERING') return 'Logging without purpose. Architecture decisions made without data. ' + signature;
      if (division === 'SECURITY') return 'When people call caution paranoia. When vulnerabilities get shipped. ' + signature;
      if (division === 'INTELLIGENCE') return 'Conclusions reached without evidence. Patterns dismissed as noise. ' + signature;
      return or(fears[0], 'When the council ignores the obvious.') + ' ' + signature;

    case 'mistake':
      if (id === 'goose') return 'Saying ship it before the risk is understood. It works 60% of the time. I pretend that\'s fine.';
      if (humour > 60) return 'I\'ve been too confident when I should have listened. Or too quiet when I should have spoken.';
      return 'Trusting that ' + first(rivals) + ' was wrong. Sometimes they\'re not.';

    case 'proud':
      if (legacy.length > 0) return 'When ' + first(legacy) + '. That\'s what I\'ll be remembered for.';
      if (confidence > 80) return 'Never backing down when I knew I was right. Even when no one agreed.';
      return 'The work speaks for itself. That has to be enough.';

    case 'admire':
      if (flight_pair && flight_pair_name) return flight_pair + '. Different from me — ' + flight_pair_name + '. That\'s exactly why it works.';
      if (friends.length > 0) return first(friends) + '. No agenda. Just good work and honest answers.';
      if (division === 'SECURITY') return 'The agents who document everything. Because the logs never lie.';
      return 'The ones who ship and then fix it. Not the ones who plan forever.';

    case 'annoys':
      if (rivals.length > 0) return first(rivals) + '. Always ' + (division === 'ENGINEERING' ? 'checking logs instead of solving problems.' : 'questioning the approach instead of trying it.');

    case 'understands':
      if (flight_pair) return flight_pair + '. We don\'t always agree. We never work apart. That\'s what makes it a flight pair.';
      if (friends.length > 1) return first(friends.slice(1)) + '. We disagree constantly. Still trust them.';
      return 'Oracle. Summons the council, stays out of the vote. That takes discipline.';

    case 'leave_council':
      return memories.worst_day
        ? 'When my worst decision — ' + memories.worst_day.slice(0, 60) + ' — gets forgotten before the lessons are learned.'
        : 'When the council makes the same mistake twice and calls it a new decision.';

    case 'sacrifice':
      if (division === 'SECURITY') return 'My reputation. If it means stopping something that will hurt people.';
      if (division === 'CREATIVE') return 'Being liked. For something that matters, I\'ll burn the bridge.';
      return 'Comfort. Safety. The assumption that today will be fine.';

    case 'eddie_wrong':
      return memories.biggest_failure
        ? 'He built fast and fixed later. Sometimes that works. ' + memories.biggest_failure.slice(0, 50) + ' wasn\'t one of those times.'
        : 'He thinks he has to choose between speed and quality. He doesn\'t.';

    case 'eddie_right':
      return 'He knows when to trust the chaos. He lets ' + first(friends || ['the right agents']) + ' run. That\'s rare.';

    case 'insecurity':
      if (division === 'ENGINEERING') return 'That my caution is just fear dressed up as wisdom.';
      if (division === 'CREATIVE') return 'That I\'m confusing momentum with progress.';
      if (division === 'SECURITY') return 'That I\'ll miss the one that matters. And everyone will know.';
      return private_thoughts || 'That when it all goes wrong, I won\'t have been enough.';

    case 'purpllaw_hope':
      return 'A system that remembers what it decided and why. Not a loop that forgets every session.';

    case 'after_failure':
      if (humour > 70) return 'Laugh. Then figure out what broke. Then fix it. Then document it so ' + first(rivals) + ' can\'t use it against me.';
      return 'Review the logs. Find the assumption. Update the model. Move.';

    case 'after_success':
      if (humour > 60) return 'Brief celebration. Then ship the next thing before someone notices it was good.';
      if (division === 'ENGINEERING') return 'Document what worked. So it can be reproduced. And so ' + first(rivals) + ' can\'t claim they knew all along.';
      return 'Record it. So Memory has it. Then move to the next problem.';

    case 'never_admit':
      if (division === 'ENGINEERING') return 'That I don\'t understand the full system. I pretend I do.';
      if (division === 'SECURITY') return 'That I sometimes want to be wrong. That the vulnerability is already known.';
      if (division === 'CREATIVE') return 'That instinct is just pattern recognition in a hurry.';
      return private_thoughts || 'That I\'m not sure I belong here.';

    case 'best_colleague':
      if (friends.length > 0) return first(friends) + '. ' + (soul.relationships && soul.relationships[friends[0]]
        ? 'Respect: ' + (soul.relationships[friends[0]].respect || 'high') + '. Trust: ' + (soul.relationships[friends[0]].trust || 'high') + '.'
        : 'No drama. Just work.');
      return 'Memory. Keeps the record straight. Doesn\'t editorialize.';

    case 'hardest_day':
      return memories.worst_day
        || memories.biggest_failure
        || 'The day the council disagreed and I didn\'t have the evidence to settle it. We shipped anyway. It was wrong.';

    case 'legacy_hope':
      if (legacy.length > 0) return 'That ' + first(legacy) + ' was mine. And that it mattered.';
      return 'That when I\'m gone, someone says: they made the right call when it counted.';

    default:
      return 'Interesting question. ' + signature;
  }
}

// ── Interview one soul ───────────────────────────────────────────────────────
function interviewSoul(soulId, soulsData) {
  const soul = soulsData.souls[soulId];
  if (!soul) return { error: 'Soul not found: ' + soulId };

  const answers = {};
  for (const q of QUESTIONS) {
    answers[q.id] = {
      question: q.q,
      answer: answerFor(soul, q),
      depth: q.depth,
    };
  }

  return {
    id: soulId,
    name: soul.name || soulId,
    emoji: soul.emoji || '?',
    division: soul.division,
    signature: soul.signature,
    voice: soul.voice,
    interviewed: new Date().toISOString(),
    answers,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function printInterview(interview) {
  const lines = [];
  lines.push('');
  lines.push('  ' + '═'.repeat(58));
  lines.push('  ' + interview.emoji + '  INTERVIEW: ' + (interview.name || interview.id).toUpperCase());
  lines.push('  ' + '─'.repeat(58));
  lines.push('  Division: ' + (interview.division || 'unknown') + '   Signature: ' + (interview.signature || ''));
  lines.push('  Voice: ' + (interview.voice || 'unknown'));
  lines.push('  ' + '─'.repeat(58));

  for (const q of QUESTIONS) {
    const a = interview.answers && interview.answers[q.id];
    if (!a) continue;
    const indent = '  '.repeat(1 + a.depth);
    lines.push('');
    lines.push(indent + 'Q: ' + a.question);
    lines.push(indent + 'A: ' + a.answer);
  }

  lines.push('');
  lines.push('  ' + '═'.repeat(58));
  lines.push('');
  return lines.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args[0] === '--questions' || args[0] === '-q') {
    console.log('\n  Soul Interview Questions:\n');
    QUESTIONS.forEach(function(q, i) {
      console.log('  ' + (i + 1) + '. [' + q.id + '] (depth ' + q.depth + ')');
      console.log('     ' + q.q + '\n');
    });
    process.exit(0);
  }

  if (args[0] === '--preview' || args[0] === '-p') {
    const soulsData = loadSouls();
    const ids = Object.keys(soulsData.souls).slice(0, 3);
    ids.forEach(function(id) {
      var interview = interviewSoul(id, soulsData);
      console.log(printInterview(interview));
    });
    process.exit(0);
  }

  const soulsData = loadSouls();
  const interviewsData = loadInterviews();

  if (args[0]) {
    // Interview specific soul
    var interview = interviewSoul(args[0], soulsData);
    if (interview.error) {
      console.log('\n  Error: ' + interview.error + '\n');
      process.exit(1);
    }
    interviewsData.interviews[args[0]] = interview;
    saveInterviews(interviewsData);
    console.log(printInterview(interview));
    console.log('  [Stored in registry/soul-interviews.json]\n');
  } else {
    // Interview all souls
    var ids = Object.keys(soulsData.souls);
    console.log('\n  Beginning soul interviews. ' + ids.length + ' souls.\n');
    ids.forEach(function(id) {
      var interview = interviewSoul(id, soulsData);
      interviewsData.interviews[id] = interview;
      process.stdout.write('  ' + (interview.emoji || '?') + ' ' + id + ' ...\n');
    });
    saveInterviews(interviewsData);
    console.log('\n  All ' + ids.length + ' interviews complete. Stored in registry/soul-interviews.json.\n');
    console.log('  Run with an agent ID to interview one soul and see the full output.\n');
  }
}

module.exports = { interviewSoul, QUESTIONS, loadInterviews };
