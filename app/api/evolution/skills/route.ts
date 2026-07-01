import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// Skills evidence: scan skills/ directory for amendment proposals
// No editor — filesystem evidence only.

export async function GET() {
  try {
    const skillsDir = path.join(process.cwd(), 'skills');
    if (!fs.existsSync(skillsDir)) {
      return NextResponse.json({ ok: false, error: 'skills dir not found', skills: [] }, { status: 200 });
    }

    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skills = entries
      .filter(e => e.isFile() && (e.name.endsWith('.md') || e.name.endsWith('.json')))
      .map(e => {
        const fullPath = path.join(skillsDir, e.name);
        const stats = fs.statSync(fullPath);
        return { name: e.name, size: stats.size, mtime: stats.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());

    return NextResponse.json({ ok: true, skills, count: skills.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), skills: [] }, { status: 200 });
  }
}
