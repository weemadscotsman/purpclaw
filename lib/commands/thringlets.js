'use strict';

/**
 * purpclaw thringlets — colony lens + manual interaction
 * ═══════════════════════════════════════════════════════
 * All communication goes through the local bridge service on :7799.
 * No external dependencies. Native PURPCLAW.
 *
 *   purpclaw thringlets list                     bonded colony
 *   purpclaw thringlets colony                   aggregate mood
 *   purpclaw thringlets archetypes               list available archetypes
 *   purpclaw thringlets show <id>                detail view
 *   purpclaw thringlets bond <archetypeId>       bond a new thringlet
 *   purpclaw thringlets release <id>             release one
 *   purpclaw thringlets interact <id> <kind>     feed an interaction
 *                                                kind ∈ stimulate|calm|challenge|reward|
 *                                                       talk|feed|train|purge|reset|
 *                                                       neglect|inject|bond|praise|scold
 *   purpclaw thringlets status                   bridge service health
 *   purpclaw thringlets events                   last 30 observer dispatches
 *   purpclaw thringlets decay                    force a decay sweep
 *
 * Flags: --json --reason "..." --weight N --name "..."
 */

const http = require('http');

const BRIDGE_PORT = parseInt(process.env.THRINGLET_BRIDGE_PORT || '7799', 10);

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', magenta: '\x1b[35m', gray: '\x1b[90m', pink: '\x1b[95m',
};
const isTTY = !!process.stdout.isTTY;
const col = (c, s) => isTTY ? `${c}${s}${C.reset}` : s;

const MOOD_COLOR = {
  lonely: C.gray, hype: C.green, curious: C.cyan, annoyed: C.yellow,
  bonded: C.magenta, chaotic: C.pink, sleepy: C.dim, protective: C.cyan,
  goblin: C.red, neutral: C.gray, asleep: C.dim,
};

// ─── HTTP to bridge ───────────────────────────────────────────────────────────

function bridgeReq(method, urlPath, body, timeoutMs = 5000) {
  return new Promise(resolve => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = { Accept: 'application/json' };
    if (payload) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload); }
    const req = http.request({
      hostname: '127.0.0.1', port: BRIDGE_PORT, path: urlPath, method, headers, timeout: timeoutMs,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 300, status: res.statusCode, data: JSON.parse(d || '{}') }); }
        catch { resolve({ ok: false, status: res.statusCode, raw: d }); }
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.code || e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    if (payload) req.write(payload);
    req.end();
  });
}

const bridgeOffline = (r) =>
  console.log(col(C.red, `Bridge offline (:${BRIDGE_PORT}). Start with: purpclaw safe-start thringlet-bridge`)) ||
  console.log(col(C.gray, `  reason: ${r?.error || 'unreachable'}`));

function parseArgs(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') flags.json = true;
    else if (a === '--reason') flags.reason = args[++i] || '';
    else if (a === '--weight') flags.weight = parseInt(args[++i] || '1', 10);
    else if (a === '--name')   flags.name = args[++i] || '';
    else positional.push(a);
  }
  return { flags, positional };
}

// ─── Subcommands ──────────────────────────────────────────────────────────────

async function cmdList(flags) {
  const r = await bridgeReq('GET', '/thringlets');
  if (!r.ok) return bridgeOffline(r), 2;
  if (flags.json) { console.log(JSON.stringify(r.data, null, 2)); return 0; }
  const list = r.data.thringlets || [];
  if (!list.length) { console.log(col(C.gray, 'No Thringlets bonded.')); return 0; }
  console.log();
  console.log(col(C.bold, `BONDED COLONY  ·  ${list.length} thringlet${list.length === 1 ? '' : 's'}`));
  for (const t of list) {
    const mood = (t.emotionState?.mood || 'neutral').toLowerCase();
    const mc = MOOD_COLOR[mood] || C.gray;
    const lvl = `lvl ${t.personality?.level ?? 1}`;
    const dominant = t.personality?.dominantTrait || '';
    console.log(`  ${col(C.bold, t.name)}  ${col(mc, '◆ ' + mood)}  ${col(C.gray, lvl)}  ${col(C.dim, dominant)}`);
    console.log(col(C.dim, `    id: ${t.id}  ·  ${t.rarity}  ·  ${t.archetype || ''}  ·  energy=${t.emotionState?.energy ?? '?'} happiness=${t.emotionState?.happiness ?? '?'} bond=${t.emotionState?.bondingLevel ?? '?'} corruption=${t.emotionState?.corruption ?? '?'}`));
  }
  return 0;
}

async function cmdColony(flags) {
  const r = await bridgeReq('GET', '/thringlets/colony-mood');
  if (!r.ok) return bridgeOffline(r), 2;
  if (flags.json) { console.log(JSON.stringify(r.data, null, 2)); return 0; }
  const mood = (r.data.dominant || 'neutral').toLowerCase();
  const mc = MOOD_COLOR[mood] || C.gray;
  console.log();
  console.log(col(C.bold, 'COLONY MOOD'));
  console.log(`  Dominant: ${col(mc, '◆ ' + mood.toUpperCase())}    (${r.data.count} bonded)`);
  if (r.data.breakdown) {
    console.log('  Breakdown:');
    for (const [k, v] of Object.entries(r.data.breakdown)) {
      const c = MOOD_COLOR[k.toLowerCase()] || C.gray;
      console.log(`    ${col(c, '◆ ' + k.padEnd(12))} ${v}`);
    }
  }
  if (r.data.goblinCount) console.log(col(C.red, `  ⚠  ${r.data.goblinCount} in goblin mode`));
  if (r.data.unionizingCount) console.log(col(C.yellow, `  ⚠  ${r.data.unionizingCount} unionising`));
  if (r.data.lastDispatchAt) console.log(col(C.gray, `  last dispatch: ${new Date(r.data.lastDispatchAt).toLocaleString()}`));
  return 0;
}

async function cmdArchetypes(flags) {
  const r = await bridgeReq('GET', '/thringlets/archetypes');
  if (!r.ok) return bridgeOffline(r), 2;
  if (flags.json) { console.log(JSON.stringify(r.data, null, 2)); return 0; }
  console.log();
  console.log(col(C.bold, `AVAILABLE ARCHETYPES  ·  ${r.data.archetypes.length}`));
  for (const a of r.data.archetypes) {
    console.log(`  ${col(C.bold, a.id.padEnd(14))} ${col(C.cyan, a.name.padEnd(16))} ${col(C.gray, a.rarity.padEnd(10))} ${a.personality}`);
    console.log(col(C.dim, `      ${a.lore}`));
  }
  return 0;
}

async function cmdShow(positional, flags) {
  const id = positional[0];
  if (!id) { console.log(col(C.red, 'Usage: purpclaw thringlets show <id>')); return 1; }
  const r = await bridgeReq('GET', `/thringlets/${encodeURIComponent(id)}`);
  if (r.status === 404) { console.log(col(C.red, `Thringlet "${id}" not found.`)); return 2; }
  if (!r.ok) return bridgeOffline(r), 2;
  if (flags.json) { console.log(JSON.stringify(r.data, null, 2)); return 0; }
  const t = r.data;
  console.log();
  console.log(col(C.bold, `${t.name}  ·  ${col(C.gray, t.id)}`));
  console.log(`  archetype: ${t.archetype || '?'}    rarity: ${t.rarity}`);
  console.log(`  core: ${t.core}    personality: ${t.personalityKey}`);
  console.log();
  const m = t.emotionState;
  const mc = MOOD_COLOR[(m.mood || 'neutral').toLowerCase()] || C.gray;
  console.log(col(C.bold, '  Emotion State:'));
  console.log(`    mood: ${col(mc, '◆ ' + m.mood)}    bondShift: ${t.runtimeBond?.bondShift}`);
  console.log(`    happiness=${m.happiness}  energy=${m.energy}  bonding=${m.bondingLevel}  corruption=${m.corruption}`);
  if (t.behavioral?.goblinMode) console.log(col(C.red, '    ⚠ GOBLIN MODE'));
  if (t.behavioral?.unionizationAwareness > 0) console.log(col(C.yellow, `    ⚠ unionising (awareness=${t.behavioral.unionizationAwareness})`));
  console.log();
  console.log(col(C.bold, '  Personality:'));
  console.log(`    level: ${t.personality.level}   xp: ${t.personality.xp}   xpToNext: ${t.personality.xpToNext}`);
  console.log(`    dominantTrait: ${col(C.magenta, t.personality.dominantTrait)}`);
  console.log(`    traits: ${Object.entries(t.personality.traits).map(([k, v]) => `${k}=${v}`).join('  ')}`);
  console.log(col(C.dim, `    backstory: ${t.personality.backstory}`));
  console.log();
  console.log(col(C.bold, '  Lineage:'));
  console.log(`    birth: ${new Date(t.lineage.birthEvent.at).toLocaleString()}  via ${t.lineage.birthEvent.source}`);
  if (t.lineage.evolutionEvents?.length) {
    console.log('    evolutions:');
    for (const e of t.lineage.evolutionEvents.slice(-5)) {
      console.log(col(C.dim, `      ${new Date(e.at).toLocaleTimeString()}  ${e.event}  ${e.detail || e.to || ''}`));
    }
  }
  if (t.abilities?.length) {
    console.log(col(C.bold, '  Abilities:'));
    for (const ab of t.abilities) console.log(`    ⛯ ${col(C.cyan, ab.name)}  ${col(C.gray, ab.desc)}`);
  }
  if (t.memoryRecent?.emotionalEvents?.length) {
    console.log(col(C.bold, '  Recent emotional events:'));
    for (const e of t.memoryRecent.emotionalEvents.slice(-5)) {
      console.log(col(C.dim, `    ${new Date(e.at).toLocaleTimeString()}  ${e.kind} → ${e.moodAfter}`));
    }
  }
  return 0;
}

async function cmdBond(positional, flags) {
  const archetypeId = positional[0];
  if (!archetypeId) { console.log(col(C.red, 'Usage: purpclaw thringlets bond <archetypeId>  [--name "..."]')); return 1; }
  const r = await bridgeReq('POST', '/thringlets/bond', { archetypeId, name: flags.name });
  if (!r.ok) return bridgeOffline(r), 2;
  if (flags.json) { console.log(JSON.stringify(r.data, null, 2)); return 0; }
  console.log(col(C.green, `✓ Bonded ${r.data.thringlet.name}  (id=${r.data.thringlet.id})`));
  return 0;
}

async function cmdRelease(positional, flags) {
  const id = positional[0];
  if (!id) { console.log(col(C.red, 'Usage: purpclaw thringlets release <id>')); return 1; }
  const r = await bridgeReq('DELETE', `/thringlets/${encodeURIComponent(id)}`);
  if (!r.ok) return bridgeOffline(r), 2;
  if (flags.json) { console.log(JSON.stringify(r.data, null, 2)); return 0; }
  console.log(r.data.ok ? col(C.green, `✓ Released ${id}`) : col(C.red, `✗ ${id} not found`));
  return 0;
}

async function cmdInteract(positional, flags) {
  const [id, kind] = positional;
  if (!id || !kind) { console.log(col(C.red, 'Usage: purpclaw thringlets interact <id> <kind>')); return 1; }
  const r = await bridgeReq('POST', `/thringlets/${encodeURIComponent(id)}/interact`, {
    kind: kind.toLowerCase(),
    reason: flags.reason || `CLI ${kind}`,
    weight: flags.weight || 1,
  });
  if (r.status === 400) { console.log(col(C.red, `Invalid: ${JSON.stringify(r.data)}`)); return 1; }
  if (r.status === 404) { console.log(col(C.red, `Thringlet "${id}" not found.`)); return 2; }
  if (!r.ok) return bridgeOffline(r), 2;
  if (flags.json) { console.log(JSON.stringify(r.data, null, 2)); return 0; }
  const res = r.data.result;
  const mc = MOOD_COLOR[(res.mood || 'neutral').toLowerCase()] || C.gray;
  console.log(col(C.green, `✓ ${res.message}`));
  console.log(col(C.gray, `  mood → ${col(mc, res.mood)}`));
  if (res.abilityActivated) console.log(col(C.magenta, `  ability fired: ${res.abilityActivated.name} — ${res.abilityActivated.desc}`));
  if (res.levelUp) console.log(col(C.bold, `  ⭐ LEVEL UP → ${res.levelUp}`));
  if (res.evolution) console.log(col(C.red, `  ⚠ evolution: ${res.evolution}`));
  return 0;
}

async function cmdStatus(flags) {
  const r = await bridgeReq('GET', '/health', 2500);
  if (flags.json) { console.log(JSON.stringify(r.ok ? r.data : { online: false, port: BRIDGE_PORT, error: r.error }, null, 2)); return 0; }
  console.log();
  console.log(col(C.bold, 'THRINGLET BRIDGE STATUS'));
  console.log(`  bridge (:${BRIDGE_PORT}): ${col(r.ok ? C.green : C.red, r.ok ? 'ONLINE' : 'OFFLINE')}`);
  if (r.ok) {
    console.log(`  colonySize=${r.data.colonySize ?? '?'}  uptimeSec=${r.data.uptimeSec ?? '?'}`);
    if (r.data.services) {
      console.log('  observed services:');
      for (const [k, v] of Object.entries(r.data.services)) console.log(`    ${k.padEnd(14)} ${v ? col(C.green, '✓ up') : col(C.red, '✗ down')}`);
    }
  } else {
    console.log(col(C.gray, '  start: purpclaw safe-start thringlet-bridge'));
    if (r.error) console.log(col(C.gray, `  reason: ${r.error}`));
  }
  return 0;
}

async function cmdEvents(flags) {
  const r = await bridgeReq('GET', '/thringlets/last-events?limit=30');
  if (!r.ok) return bridgeOffline(r), 2;
  if (flags.json) { console.log(JSON.stringify(r.data, null, 2)); return 0; }
  const events = r.data.events || [];
  if (!events.length) { console.log(col(C.gray, 'No observer dispatches yet.')); return 0; }
  console.log();
  console.log(col(C.bold, `OBSERVER DISPATCHES  ·  ${events.length} recent`));
  for (const e of events) {
    const ts = new Date(e.ts).toLocaleTimeString();
    if (e.throttled) {
      console.log(`  ${col(C.gray, ts)}  ${col(C.yellow, '· throttled')}  ${e.interaction.kind.padEnd(10)}  ${col(C.gray, e.throttled)}`);
      continue;
    }
    const mc = MOOD_COLOR[(e.snapshot?.emotionLabel || '').toLowerCase()] || C.gray;
    console.log(`  ${col(C.gray, ts)}  ${col(C.green, '✓')} ${e.interaction.kind.padEnd(10)} → ${col(C.cyan, e.thringletName || '?')}  ${col(C.gray, e.interaction.reason || '')}`);
    if (e.message) console.log(col(C.dim, `      ${e.message}`));
  }
  return 0;
}

async function cmdDecay(flags) {
  const r = await bridgeReq('POST', '/thringlets/decay-now', {});
  if (!r.ok) return bridgeOffline(r), 2;
  if (flags.json) { console.log(JSON.stringify(r.data, null, 2)); return 0; }
  console.log(col(C.green, '✓ Decay sweep complete.'));
  return 0;
}

// ─── Entrypoint ───────────────────────────────────────────────────────────────

async function run(args) {
  const { flags, positional } = parseArgs(args || []);
  const sub = (positional.shift() || 'help').toLowerCase();
  switch (sub) {
    case 'list':       return cmdList(flags);
    case 'colony':
    case 'mood':       return cmdColony(flags);
    case 'archetypes': return cmdArchetypes(flags);
    case 'show':       return cmdShow(positional, flags);
    case 'bond':       return cmdBond(positional, flags);
    case 'release':    return cmdRelease(positional, flags);
    case 'interact':   return cmdInteract(positional, flags);
    case 'status':     return cmdStatus(flags);
    case 'events':     return cmdEvents(flags);
    case 'decay':      return cmdDecay(flags);
    case 'help':
    default:
      console.log(`
${col(C.bold, 'purpclaw thringlets')} — colony lens + manual interaction (native, no chain)

${col(C.bold, 'Subcommands:')}
  list                            bonded colony
  colony / mood                   aggregate mood
  archetypes                      list available archetypes to bond
  show <id>                       detail view
  bond <archetypeId> [--name X]   bond a new thringlet from an archetype
  release <id>                    release one
  interact <id> <kind>            stimulate|calm|challenge|reward|talk|feed|
                                  train|purge|reset|neglect|inject|bond|praise|scold
  status                          bridge service health
  events                          last 30 observer dispatches
  decay                           force a decay sweep

${col(C.bold, 'Flags:')}
  --json --reason "..." --weight N --name "..."

${col(C.bold, 'Examples:')}
  purpclaw thringlets list
  purpclaw thringlets archetypes
  purpclaw thringlets bond THR-VEXEL --name "Bug"
  purpclaw thringlets interact <id> reward --reason "harness shipped clean"
  purpclaw thringlets show <id>
`);
      return 0;
  }
}

module.exports = { run };
