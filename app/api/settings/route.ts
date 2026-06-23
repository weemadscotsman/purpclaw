import { NextRequest, NextResponse } from 'next/server';
import { checkOperator } from '../_lib/operator-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The Settings OS API — one door for every knob in the stack.
//   GET  /api/settings                 → all settings (grouped)
//   GET  /api/settings?q=spend         → search
//   GET  /api/settings?category=safety → filter by category
//   GET  /api/settings?modified=1      → only changed-from-default
//   GET  /api/settings?export=1        → shareable export (no secrets)
//   POST /api/settings { key, value }  → set one
//   POST /api/settings { preset }      → apply a preset
//   POST /api/settings { import: {…} } → bulk import
// Secrets are never returned raw — only { set, hint }.

// eslint-disable-next-line @typescript-eslint/no-var-requires
function registry() {
  // Static relative require — webpack bundles the CJS module into the prod
  // build (an absolute process.cwd() path 500s at runtime under next start).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../lib/runtime/settings-registry.js');
}

export async function GET(req: NextRequest) {
  try {
    const reg = registry();
    const url = new URL(req.url);
    const q = url.searchParams.get('q');
    const category = url.searchParams.get('category');
    const modified = url.searchParams.get('modified') === '1';
    const doExport = url.searchParams.get('export') === '1';

    if (doExport) return NextResponse.json({ ok: true, export: reg.exportAll() });

    let settings = q ? reg.search(q) : reg.list({ category: category || undefined, modified });

    // Group by category for the UI.
    const grouped: Record<string, unknown[]> = {};
    for (const s of settings) {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push(s);
    }

    return NextResponse.json({
      ok: true,
      count: settings.length,
      categories: reg.categories(),
      presets: Object.keys(reg.PRESETS),
      settings: grouped,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // B3: settings mutate runtime behavior incl. computerUse.mode — guard it.
    const auth = checkOperator(req);
    if (!auth.ok) return auth.response;
    const reg = registry();
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });

    if (body.preset) {
      return NextResponse.json(reg.applyPreset(body.preset));
    }
    if (body.import && typeof body.import === 'object') {
      return NextResponse.json({ ok: true, results: reg.importAll(body.import) });
    }
    if (body.key !== undefined) {
      const r = reg.set(body.key, body.value);
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    return NextResponse.json({ ok: false, error: 'provide { key, value } or { preset } or { import }' }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
