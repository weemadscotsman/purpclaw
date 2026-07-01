import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// Steering evidence: scan steering/ directory
// No editor — filesystem evidence only.

export async function GET() {
  try {
    const steeringDir = path.join(process.cwd(), 'steering');
    if (!fs.existsSync(steeringDir)) {
      return NextResponse.json({ ok: false, error: 'steering dir not found', directives: [] }, { status: 200 });
    }

    const entries = fs.readdirSync(steeringDir, { withFileTypes: true });
    const files: Array<{ name: string; type: string; mtime: string }> = [];

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name === 'steering') {
        // Scan nested steering/
        const nested = path.join(steeringDir, 'steering');
        try {
          const nestedEntries = fs.readdirSync(nested, { withFileTypes: true });
          for (const ne of nestedEntries) {
            if (ne.isFile()) {
              const fullPath = path.join(nested, ne.name);
              const stats = fs.statSync(fullPath);
              files.push({ name: `steering/${ne.name}`, type: 'steering', mtime: stats.mtime.toISOString() });
            }
          }
        } catch { /* skip */ }
      } else if (entry.isFile()) {
        const fullPath = path.join(steeringDir, entry.name);
        const stats = fs.statSync(fullPath);
        files.push({ name: entry.name, type: 'steering', mtime: stats.mtime.toISOString() });
      }
    }

    files.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());

    return NextResponse.json({ ok: true, directives: files });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), directives: [] }, { status: 200 });
  }
}
