import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { checkOperator } from '../_lib/operator-auth';
import { checkRateLimit } from '../_lib/rate-limit';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Uploads land under agent_work/uploads — which is inside the god-folder tree that
// every spawned agent mounts via --add-dir, so chat/swarm/group-chat/agents can all
// read them by absolute path. Returns the path; never inlines huge binaries.
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB per file
const TEXT_EXT = new Set(['.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx', '.py', '.css', '.html', '.csv', '.yml', '.yaml', '.sql', '.sh', '.log', '.xml', '.toml', '.ini', '.env']);

function uploadsDir() {
  const dir = path.join(process.cwd(), 'agent_work', 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeName(name: string) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

function stampPrefix() {
  // No Date.now() randomness issues here — server runtime, fine.
  return `${Date.now().toString(36)}`;
}

export async function POST(req: NextRequest) {
  const auth = checkOperator(req);
  if (!auth.ok && 'response' in auth) return auth.response;

  const limited = checkRateLimit(req, 'upload', 20);
  if (limited) return limited;

  try {
    const form = await req.formData();
    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ ok: false, error: 'no files' }, { status: 400 });

    const dir = uploadsDir();
    const saved = [];
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        saved.push({ name: file.name, ok: false, error: `too large (${(file.size / 1048576).toFixed(1)}MB > 50MB)` });
        continue;
      }
      const ext = path.extname(file.name).toLowerCase();
      const fname = `${stampPrefix()}-${safeName(file.name)}`;
      const abs = path.join(dir, fname);
      const buf = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(abs, buf);
      const isText = TEXT_EXT.has(ext) || file.type.startsWith('text/');
      let preview = '';
      if (isText) {
        try { preview = buf.toString('utf8').slice(0, 4000); } catch {}
      }
      saved.push({
        name: file.name,
        ok: true,
        path: abs,
        size: file.size,
        kind: isText ? 'text' : (file.type || ext || 'binary'),
        preview, // first 4k for text — lets agents see content without re-reading small files
      });
    }
    return NextResponse.json({ ok: true, dir, files: saved });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'upload failed' }, { status: 500 });
  }
}

// List recent uploads so the UI / agents can discover what was shared.
export async function GET() {
  try {
    const dir = uploadsDir();
    const entries = fs.readdirSync(dir)
      .map(name => {
        const abs = path.join(dir, name);
        const st = fs.statSync(abs);
        return { name, path: abs, size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 50);
    return NextResponse.json({ ok: true, dir, files: entries });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'list failed' }, { status: 500 });
  }
}
