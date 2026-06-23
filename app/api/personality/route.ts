import { NextRequest, NextResponse } from 'next/server';
// R5 fix: personality POST mutates the warding state (intensity, presets,
// anti-derailment). Without auth, anyone on the LAN could dial the
// spookiness to "absurd" or disable task-derailment prevention.
import { checkOperator } from '../_lib/operator-auth';
import { checkRateLimit } from '../_lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// /api/personality — read & summarise the user's current warding state.
//   GET  → resolved state, microcopy table, agent summary, available presets
//   POST → set the master intensity (or apply a named preset)
//   GET ?kind=healthy&domain=chat&agent=Mochi → return a single microcopy
//
// Spooky is skin, not steering. Restricted domains return the CLEAN
// version regardless of dial, unless the user has explicitly disabled
// prevent_task_derailment. The same gate runs on every entry point.

function loadPersonality() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../../lib/runtime/settings-registry.js');
  } catch (e) {
    return null;
  }
}

function loadPersonalityEngine() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../../lib/personality.js');
  } catch (e) {
    return null;
  }
}

function resolveFromRegistry() {
  const reg = loadPersonality();
  const out = {
    preset: 'clean',
    spooky_warding: 'off',
    allow_terminal_flavour: true,
    allow_mochi_dialogue: true,
    allow_release_scrolls: false,
    allow_debug_flavour: false,
    prevent_task_derailment: true,
  };
  if (!reg) return out;
  // The registry's `get()` returns either the raw value OR a SettingItem
  // descriptor depending on how it's called. Normalize to .value.
  const pick = (key: string, fallback: any) => {
    try {
      const v = reg.get(key);
      if (v == null) return fallback;
      if (typeof v === 'object' && 'value' in v) return (v as any).value ?? fallback;
      return v;
    } catch { return fallback; }
  };
  out.preset = pick('personality.preset', out.preset);
  out.spooky_warding = pick('personality.spooky_warding', out.spooky_warding);
  out.allow_terminal_flavour = pick('personality.allow_terminal_flavour', out.allow_terminal_flavour);
  out.allow_mochi_dialogue = pick('personality.allow_mochi_dialogue', out.allow_mochi_dialogue);
  out.allow_release_scrolls = pick('personality.allow_release_scrolls', out.allow_release_scrolls);
  out.allow_debug_flavour = pick('personality.allow_debug_flavour', out.allow_debug_flavour);
  out.prevent_task_derailment = pick('personality.prevent_task_derailment', out.prevent_task_derailment);
  return out;
}

export async function GET(req: NextRequest) {
  const engine = loadPersonalityEngine();
  if (!engine) {
    return NextResponse.json({ ok: false, error: 'personality_engine_unavailable' }, { status: 503 });
  }
  const url = new URL(req.url);
  const personality = resolveFromRegistry();

  // Per-call microcopy resolver — e.g. ?kind=healthy&channel=mochi&agent=Mochi
  // OR ?kind=mochi&agent=Mochi (Mochi has its own pool, not MICROCOPY)
  const kind = url.searchParams.get('kind');
  if (kind) {
    const opts = {
      personality,
      domain: url.searchParams.get('domain') || undefined,
      channel: url.searchParams.get('channel') || undefined,
      agent: url.searchParams.get('agent') || undefined,
    };
    const allowed = engine.isAllowed(personality, opts);
    let text: string;
    if (kind === 'mochi') {
      text = engine.mochiLine(opts);
    } else {
      text = engine.microcopy(kind, opts);
    }
    return NextResponse.json({
      ok: true,
      kind,
      text,
      gated: !allowed.allowed,
      gate_reason: allowed.allowed ? null : allowed.reason,
      resolved_level: engine.agentLevel(opts.agent || '', personality),
    });
  }

  // Bulk summary — used by the PersonalityDial in Settings
  return NextResponse.json({
    ok: true,
    personality,
    presets: ['clean', 'goblin', 'spooky', 'sovereign', 'crt-ritual', 'mochi-soft'],
    intensities: ['off', 'low', 'medium', 'high', 'ceremonial'],
    agent_summary: engine.summary(personality),
    pools: {
      // ship just the first item from each pool so the UI can preview
      preview: {
        healthy: engine.microcopy('healthy', { personality, channel: 'terminal' }),
        serviceDown: engine.microcopy('serviceDown', { personality, channel: 'terminal' }),
        ttsOnline: engine.microcopy('ttsOnline', { personality, channel: 'terminal' }),
        spawnSuccess: engine.microcopy('spawnSuccess', { personality, channel: 'terminal' }),
        benchmarkPassed: engine.microcopy('benchmarkPassed', { personality, channel: 'terminal' }),
        ollamaReady: engine.microcopy('ollamaReady', { personality, channel: 'terminal' }),
        mochi: engine.mochiLine({ personality }),
      },
    },
    restrictions: {
      restricted_domains: Array.from(engine.RESTRICTED_DOMAINS),
      note: 'Legal/medical/finance/debug auto-suppress even at high intensity unless prevent_task_derailment is turned off.',
    },
  });
}

export async function POST(req: NextRequest) {
  // R5 fix: personality POST mutates the warding state. Without auth,
  // anyone on the LAN could disable task-derailment prevention or
  // dial spookiness to "absurd".
  const auth = checkOperator(req);
  if (!auth.ok) return auth.response;
  const limitado = checkRateLimit(req, 'personality', 30);
  if (limitado) return limitado;
  const reg = loadPersonality();
  if (!reg) {
    return NextResponse.json({ ok: false, error: 'settings_unavailable' }, { status: 503 });
  }
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const results: any[] = [];
  if (body?.preset && typeof body.preset === 'string') {
    const r = reg.applyPreset(body.preset);
    results.push({ kind: 'preset', ...r });
  }
  if (body?.intensity) {
    const r = reg.set('personality.spooky_warding', body.intensity);
    results.push({ kind: 'intensity', ...r });
  }
  if (body?.key && body?.value !== undefined) {
    const r = reg.set(body.key, body.value);
    results.push({ kind: 'set', ...r });
  }
  return NextResponse.json({ ok: true, results });
}
