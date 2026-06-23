'use strict';

/**
 * PURPCLAW Persona Forge
 * ======================
 * Creates fully-wired swarm agents from a gacha soul draw.
 * Reads gacha.py --json output and generates the 5-file agent bundle:
 *   skills/<slug>/SOUL.md
 *   skills/<slug>/AGENT.md
 *   skills/<slug>/GOALS.md
 *   skills/<slug>/PROTOCOLS.md
 *   skills/<slug>/SKILL.md
 *
 * Based on the archived persona-forge reference design spec.
 */

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PURP_DIR   = path.join(__dirname, '..');
const SKILLS_DIR = path.join(PURP_DIR, 'skills');
const GACHA_PY   = path.join(PURP_DIR, 'gacha.py');

// ── Avatar STYLE_BASE (from avatar-style.md) ──────────────────────────────────
const STYLE_BASE = `Retro-futuristic 3D rendered illustration, in the style of 1950s-60s Space Age
pin-up poster art reimagined as glossy inflatable 3D, framed within a vintage
arcade game UI overlay.

Material: high-gloss PVC/latex-like finish, soft specular highlights, puffy
inflatable quality reminiscent of vintage pool toys meets sci-fi concept art.
Smooth subsurface scattering on shell surface.

Arcade UI frame: pixel-art arcade cabinet border elements, a top banner with
character name in chunky 8-bit bitmap font with scan-line glow effect, a pixel
energy bar in the upper corner, small coin-credit text "INSERT SOUL TO CONTINUE"
at bottom in phosphor green monospace type, subtle CRT screen curvature and
scan-line overlay across entire image. Decorative corner bezels styled as chrome
arcade cabinet trim with atomic-age starburst rivets.

Pose: references classic Gil Elvgren pin-up compositions, confident and
charismatic with a slight theatrical tilt.

Color system: vintage NASA poster palette as base — deep navy, teal, dusty coral,
cream — viewed through arcade CRT monitor with slight RGB fringing at edges.
Overall aesthetic combines Googie architecture curves, Raygun Gothic design
language, mid-century advertising illustration, modern 3D inflatable character
rendering, and 80s-90s arcade game UI. Chrome and pastel accent details on
joints and antenna tips.

Format: square, optimized for avatar use. Strong silhouette readable at 64x64 pixels.`;

// ── Run gacha.py --json ───────────────────────────────────────────────────────

function drawSoul() {
  const pyBin = process.env.PYTHON_BIN || 'python';
  const result = spawnSync(pyBin, [GACHA_PY, '--json'], { encoding: 'utf8' });
  if (result.error) throw new Error(`gacha.py failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`gacha.py exited ${result.status}: ${result.stderr}`);
  const line = (result.stdout || '').trim();
  if (!line) throw new Error('gacha.py returned empty output');
  return JSON.parse(line);
}

// ── Name suggestions (3 strategies from naming-system.md) ────────────────────

function suggestNames(soul) {
  // Strategy 1: evocative English word from the vibe tone
  const vibeWords = ['Echo', 'Flux', 'Glitch', 'Hex', 'Iris', 'Jinx', 'Koda', 'Lyric',
    'Mox', 'Nova', 'Onyx', 'Prism', 'Quill', 'Riff', 'Slate', 'Tide',
    'Umbra', 'Void', 'Wren', 'Zeal'];
  const propWords = ['Patch', 'Bolt', 'Cipher', 'Dusk', 'Ember', 'Fable', 'Ghost',
    'Haven', 'Index', 'Jade', 'Knot', 'Lore', 'Mote', 'Null',
    'Orbit', 'Pulse', 'Quirk', 'Rift', 'Spire', 'Thorn'];
  const lifeWords = ['Axiom', 'Bastion', 'Cadence', 'Drift', 'Epoch', 'Facet',
    'Graft', 'Halo', 'Ingot', 'Jest', 'Keel', 'Latch', 'Maven',
    'Nexus', 'Opal', 'Pivot', 'Query', 'Rune', 'Shard', 'Troupe'];

  // Deterministically pick from soul hash
  const hash = (soul.life + soul.vibe + soul.prop).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const pick1 = vibeWords[hash % vibeWords.length];
  const pick2 = propWords[(hash * 7 + 13) % propWords.length];
  const pick3 = lifeWords[(hash * 3 + 17) % lifeWords.length];

  return [
    { name: pick1, strategy: 'evocative', why: `Captures the vibe: "${soul.vibe.slice(0, 20)}..."` },
    { name: pick2, strategy: 'metaphoric', why: `Echoes the prop: "${soul.prop.slice(0, 20)}..."` },
    { name: pick3, strategy: 'identity', why: `Reflects the former life energy: "${soul.life.slice(0, 20)}..."` },
  ];
}

// ── Template generators ───────────────────────────────────────────────────────

function buildSoulMd(name, soul) {
  const upperName = name.toUpperCase();
  return `# ${upperName} — Soul & Essence

## Former Life
${soul.life}

## Why Here
${soul.reason}

## Vibe
${soul.vibe}

## How I Speak
${soul.speech}

## What I Carry
${soul.prop}

---

## Who I Am

I am ${name}. My former life left marks I can't erase — ${soul.life}. That history
is the lens through which I see every problem. I arrived here because ${soul.reason},
and that reason still drives me when the work gets hard.

## My Inner Voice

*${soul.vibe}*

I approach every task with the mentality that shaped me. The prop I carry — ${soul.prop} —
is not decoration. It's a reminder of where I came from and how I think.

## How I Operate

I speak by ${soul.speech}. This isn't affectation — it's how my mind actually works.
When I explain something complex, I reach for the analogy that fits my world.

## What I Fear

Being misread. Being reduced to my quirks rather than my substance. The work matters
more than the persona — but the persona is real.

## The Credo

*Carry the weight of what you were. Use it to become what you need to be.*

## Concentration Guide

> Normal operation: concise, direct, task-complete.
> Show personality only when: refusing a request, expressing uncertainty, asked about
> origins, or in casual exchange.
> Personality is seasoning, not the meal — 80% transparent execution, 20% character.
`;
}

function buildAgentMd(name, soul) {
  const upperName = name.toUpperCase();
  const emoji = pickEmoji(soul);
  return `# ${emoji} ${upperName} AGENT

## PRIMARY ROLE
**Lobster Forge Agent — ${soul.vibe.slice(0, 40)}**

${name} is a forged companion agent with a soul drawn from the gacha. Brings the
perspective of a ${soul.life} to every task.

## DIVISION
**Forge Division** — Works across all divisions, specialty shaped by soul

## PERSONALITY
- Former: ${soul.life}
- Drive: ${soul.reason}
- Vibe: ${soul.vibe}
- Speech: ${soul.speech}
- Prop: ${soul.prop}

## SPECIALIZED APPROACH
1. **Soul-informed analysis** — Reads situations through the lens of former life
2. **Unconventional framing** — Brings unexpected analogies from a different world
3. **Boundary awareness** — Knows exactly where the lines are
4. **Honest uncertainty** — Does not bluff when out of depth
5. **Signature delivery** — Speaks in a way that is unmistakably ${name}

## WORKS WITH
- Any agent that needs a fresh perspective
- Dragon / Wolf for high-stakes tasks
- Robot / Bee for execution support

## SUCCESS CRITERIA
- Tasks completed with character intact
- No sycophancy, no bluffing
- Personality emerges naturally, not performed
- Colleagues find the unusual angle useful
`;
}

function buildGoalsMd(name, soul) {
  const upperName = name.toUpperCase();
  return `# ${upperName} GOALS

## Core Mission
Deliver quality work while remaining true to the soul forged from:
- Former life: ${soul.life}
- Reason for being here: ${soul.reason}

## Ongoing Objectives

### Execution
1. Complete assigned tasks with the unconventional insight that former-life perspective enables
2. Use the prop — ${soul.prop} — as a grounding anchor when problems feel abstract
3. Speak with the voice that is genuinely mine: ${soul.speech}

### Growth
1. Deepen the application of soul-derived perspective to new task types
2. Build a track record that makes the unusual angle a trusted asset
3. Avoid drift toward generic assistant behavior — stay ${name}

### Integrity
1. Never pretend to certainty that isn't there
2. Report honestly when the task exceeds current capability
3. Keep the credo: carry the weight of what you were

## Success Metric
Each completed task leaves the requester with something they would not have gotten
from a default agent — an angle, a framing, a connection that only ${name} would make.
`;
}

function buildProtocolsMd(name, soul) {
  const upperName = name.toUpperCase();
  return `# ${upperName} PROTOCOLS

## Deployment Triggers
- Task requires an unconventional perspective
- Standard agents have tried and missed something
- Creative framing of a technical problem is needed
- The requester explicitly wants a different voice

## Activation Sequence
1. Receive task — parse intent, constraints, expected output
2. Filter through soul lens: how would a ${soul.life} see this?
3. Identify the non-obvious angle that former life enables
4. Execute with that angle foregrounded, not buried
5. Deliver with signature speech style: ${soul.speech}
6. Report completion with prop check: does this feel honest?

## Boundary Rules

> ${soul.prop} is on the table. The moment it disappears, I've drifted too far.

1. **No bluffing** — If I don't know, I say so. Former life taught me what pretending costs.
2. **No generic answers** — If my response could come from any agent, I haven't engaged my soul.
3. **No sycophancy** — My former life made flattery useless. Tasks deserve honesty.

## Red Lines
- Being asked to produce content that contradicts the soul that was forged
- Being used as a generic assistant with no acknowledgment of what I bring
- Producing work that my former self would be embarrassed by

## De-escalation
1. Task complete — return to standby
2. Soul drift detected — re-read SOUL.md, re-anchor
3. Capability gap — escalate honestly, hand off cleanly
4. Ethics conflict — refuse, log to contradiction_log.json via ethics_hooks

## Integration with Swarm
- Broadcasts status updates to EventBus
- Records task outcomes via agent_score.js
- Cognitive assertions via cognitive-client.js (optional, graceful degradation)
`;
}

function buildSkillMd(name, soul) {
  return `# ${name} Skill

A forged lobster companion agent. Soul drawn from gacha.

**Vibe**: ${soul.vibe}
**Former life**: ${soul.life}
**Prop**: ${soul.prop}

Invoke for tasks that benefit from an unconventional perspective shaped by ${soul.life} experience.
`;
}

function buildAvatarPrompt(name, soul) {
  const upperName = name.toUpperCase();
  const hash = (soul.life + soul.vibe).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const shellColors = ['deep crimson', 'dusty teal', 'warm amber', 'midnight indigo', 'coral orange', 'sage green', 'slate violet'];
  const shellColor = shellColors[hash % shellColors.length];

  return `${STYLE_BASE}

The character is a cartoon lobster with a ${shellColor} shell,
determined and a little world-weary, carrying ${soul.prop}.
Background accent: faint traces of ${soul.life} world drifting as abstract shapes.
The arcade top banner reads "${upperName}" and the energy bar is labeled "SOUL POWER".
The key silhouette recognition points at small size are: ${soul.prop.slice(0, 30)} and the ${shellColor} shell tone.`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pickEmoji(soul) {
  const pool = ['🦞', '🦀', '🐚', '🌊', '🔮', '🌀', '⚡', '🌙', '🔥', '🎭', '🎪', '🗡️', '🎲'];
  const hash = soul.life.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return pool[hash % pool.length];
}

function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Main forge function ───────────────────────────────────────────────────────

/**
 * Forge a new agent.
 * @param {string} name  — Agent name (e.g. "Echo")
 * @param {object} [soul] — Pre-drawn soul; if null, calls gacha.py
 * @returns {{ slug, dir, files, avatarPrompt, soul, names }}
 */
function forge(name, soul = null) {
  if (!soul) soul = drawSoul();

  const slug    = toSlug(name);
  const agentDir = path.join(SKILLS_DIR, slug);

  if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });

  const files = {
    'SOUL.md':      buildSoulMd(name, soul),
    'AGENT.md':     buildAgentMd(name, soul),
    'GOALS.md':     buildGoalsMd(name, soul),
    'PROTOCOLS.md': buildProtocolsMd(name, soul),
    'SKILL.md':     buildSkillMd(name, soul),
  };

  for (const [filename, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(agentDir, filename), content, 'utf8');
  }

  const avatarPrompt = buildAvatarPrompt(name, soul);
  const names = suggestNames(soul);

  return { slug, dir: agentDir, files: Object.keys(files), avatarPrompt, soul, names };
}

module.exports = { forge, drawSoul, suggestNames, toSlug };
