import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Known configuration keys the onboarding can read/set ─────────────────────
// secret:true → value is never returned raw, only a masked hint + a `set` boolean.
type KeySpec = {
  key: string;
  label: string;
  group: 'core' | 'providers' | 'tools' | 'optional';
  secret: boolean;
  help: string;
  placeholder?: string;
  options?: string[]; // for enumerated values (e.g. LLM_PROVIDER)
};

const KEY_CATALOG: KeySpec[] = [
  { key: 'LLM_PROVIDER', label: 'Primary LLM provider', group: 'core', secret: false,
    help: 'Which model your harness calls first. Change anytime.',
    options: ['minimax', 'anthropic', 'gemini', 'openai', 'kimi', 'groq', 'deepseek', 'openrouter', 'ollama', 'custom'] },
  { key: 'LLM_API_KEY', label: 'Primary LLM API key', group: 'core', secret: true,
    help: 'API key for the provider above. Pasted keys are auto-sanitised.' },
  { key: 'LLM_MODEL', label: 'Model name', group: 'core', secret: false,
    help: 'e.g. MiniMax-M2.7, claude-opus-4-8, gpt-4o.', placeholder: 'MiniMax-M2.7' },
  { key: 'OPENROUTER_API_KEY', label: 'OpenRouter key (research room)', group: 'providers', secret: true,
    help: 'Powers the free-model Group Chat / Research lenses.' },
  { key: 'ANTHROPIC_API_KEY', label: 'Anthropic key', group: 'providers', secret: true, help: 'Optional provider-native alias.' },
  { key: 'GEMINI_API_KEY', label: 'Gemini key', group: 'providers', secret: true, help: 'Optional provider-native alias.' },
  { key: 'KIMI_API_KEY', label: 'Kimi / Moonshot key', group: 'providers', secret: true, help: 'Optional subagent coordination provider.' },
  { key: 'MINIMAX_API_KEY', label: 'MiniMax key', group: 'providers', secret: true, help: 'Reserved for explicit main-agent work by default.' },
  { key: 'GITHUB_TOKEN', label: 'GitHub token (code tools)', group: 'tools', secret: true,
    help: 'Read access is enough for read-only repo/PR/issue commands.' },
  { key: 'XIAOZHI_MCP_URL', label: 'Xiaozhi MCP URL', group: 'optional', secret: true, help: 'Optional — for the AI ball.' },
];

function envPath() {
  return path.join(process.cwd(), '.env');
}

function readEnv(): Record<string, string> {
  try {
    const body = fs.readFileSync(envPath(), 'utf8');
    const out: Record<string, string> = {};
    for (const line of body.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2];
    }
    return out;
  } catch {
    return {};
  }
}

// Mirrors lib/secret-redactor.js maskForDisplay — never reveal a full secret.
function mask(v: string): string {
  if (!v) return '';
  const s = v.trim();
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} chars)`;
}

// Mirrors lib/secret-redactor.js sanitizeApiKey: strip wrap chars, collapse
// whitespace, drop accidental doubled paste. Returns cleaned value + notes.
function sanitize(raw: string): { value: string; notes: string[] } {
  const notes: string[] = [];
  let v = String(raw ?? '');
  const before = v;
  v = v.trim();
  if (/^["'`]|["'`]$/.test(v)) { v = v.replace(/^["'`]+|["'`]+$/g, ''); notes.push('removed wrapping quotes'); }
  if (/\s/.test(v)) { v = v.replace(/\s+/g, ''); notes.push('removed internal whitespace'); }
  // doubled-paste: exact first-half === second-half
  if (v.length % 2 === 0) {
    const half = v.slice(0, v.length / 2);
    if (half && half === v.slice(v.length / 2)) { v = half; notes.push('collapsed doubled paste'); }
  }
  if (before !== v && notes.length === 0) notes.push('trimmed');
  return { value: v, notes };
}

function upsertEnvKey(body: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  if (re.test(body)) return body.replace(re, line);
  const sep = body.length && !body.endsWith('\n') ? '\n' : '';
  return `${body}${sep}${line}\n`;
}

export async function GET() {
  const env = readEnv();
  const keys = KEY_CATALOG.map(spec => {
    const raw = env[spec.key] || process.env[spec.key] || '';
    const isPlaceholder = /YOUR_.*_HERE/i.test(raw);
    const set = Boolean(raw) && !isPlaceholder;
    return {
      key: spec.key,
      label: spec.label,
      group: spec.group,
      secret: spec.secret,
      help: spec.help,
      placeholder: spec.placeholder,
      options: spec.options,
      set,
      display: spec.secret ? (set ? mask(raw) : '') : (set ? raw : ''),
    };
  });
  const provider = env['LLM_PROVIDER'] || process.env.LLM_PROVIDER || '';
  const hasPrimary = keys.find(k => k.key === 'LLM_API_KEY')?.set || false;
  return NextResponse.json({
    ok: true,
    envExists: fs.existsSync(envPath()),
    provider,
    ready: Boolean(provider) && hasPrimary,
    keys,
  });
}

export async function POST(req: NextRequest) {
  let payload: { key?: string; value?: string };
  try { payload = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }
  const { key, value } = payload;
  const spec = KEY_CATALOG.find(k => k.key === key);
  if (!spec) return NextResponse.json({ ok: false, error: `unknown key: ${key}` }, { status: 400 });
  if (typeof value !== 'string') return NextResponse.json({ ok: false, error: 'value required' }, { status: 400 });

  const { value: clean, notes } = spec.secret ? sanitize(value) : { value: value.trim(), notes: [] };
  if (spec.options && clean && !spec.options.includes(clean)) {
    return NextResponse.json({ ok: false, error: `value must be one of: ${spec.options.join(', ')}` }, { status: 400 });
  }

  try {
    const p = envPath();
    const body = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    fs.writeFileSync(p, upsertEnvKey(body, key!, clean), 'utf8');
    // Reflect into the running process so live status checks update immediately.
    process.env[key!] = clean;
    return NextResponse.json({
      ok: true,
      key,
      set: Boolean(clean),
      display: spec.secret ? mask(clean) : clean,
      notes, // e.g. "collapsed doubled paste" — never the value itself
      restartHint: 'Saved to .env. Restart affected services (purpclaw safe-start) to pick it up everywhere.',
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'write failed' }, { status: 500 });
  }
}
