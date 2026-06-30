import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// /api/llm-config — the actual configured LLM provider + model.
// Read from the .env via the settings registry. This is what the chat
// panel + PROVIDER ROUTER + bottom-bar CONTEXT call to discover the
// configured provider when /api/settings is offline or the registry is
// missing the keys the data hook expects.
export async function GET(_req: NextRequest) {
  try {
    const reg = require('../../../lib/runtime/settings-registry.js');
    const pick = (k: string, fallback: any) => {
      try {
        const v = reg.get(k);
        if (v == null) return fallback;
        if (typeof v === 'object' && 'value' in v) return (v as any).value ?? fallback;
        return v;
      } catch { return fallback; }
    };
    return NextResponse.json({
      ok: true,
      provider: pick('core.provider', pick('LLM_PROVIDER', null)) || 'minimax',
      model: pick('core.model', pick('LLM_MODEL', null)) || 'MiniMax-M2.7',
      swarmProvider: pick('core.swarmProvider', null) || 'deepseek',
      swarmModel: pick('core.swarmModel', null) || 'deepseek-v4-pro',
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message, provider: 'minimax', model: 'MiniMax-M2.7' });
  }
}
