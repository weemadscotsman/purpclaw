import { NextResponse } from 'next/server';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Serves the same Sampler engine the CLI/TUI use, so the Web lens renders
// identical live metric series. GET → one sampling pass over config/samplers.yml.
export async function GET() {
  try {
    // eval('require') = the real Node require at runtime, bypassing webpack's
    // bundler so we can load the shared engine from /lib outside the app tree.
    const nodeRequire = eval('require');
    const sampler = nodeRequire(path.join(process.cwd(), 'lib', 'sampler.js'));
    const cfg = sampler.parseConfig(sampler.resolveConfigPath());
    const snapshot = await sampler.sampleAll(cfg);
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'sampler failed' }, { status: 500 });
  }
}
