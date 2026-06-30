import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const researchDir = path.join(process.cwd(), 'research');
    if (!fs.existsSync(researchDir)) {
      return NextResponse.json({ ok: false, error: 'research dir not found', files: [] }, { status: 200 });
    }

    const entries = fs.readdirSync(researchDir, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile())
      .map(e => {
        const fullPath = path.join(researchDir, e.name);
        const stats = fs.statSync(fullPath);
        return {
          name: e.name,
          size: stats.size,
          mtime: stats.mtime.toISOString(),
          mtimeMs: stats.mtimeMs,
        };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    // If research_dir is a directory, recurse
    const subDirs = entries.filter(e => e.isDirectory());
    const subFiles: Record<string, typeof files> = {};
    for (const subDir of subDirs) {
      const subPath = path.join(researchDir, subDir.name);
      try {
        const subEntries = fs.readdirSync(subPath, { withFileTypes: true });
        subFiles[subDir.name] = subEntries
          .filter(e => e.isFile())
          .map(e => {
            const fullPath = path.join(subPath, e.name);
            const stats = fs.statSync(fullPath);
            return {
              name: e.name,
              size: stats.size,
              mtime: stats.mtime.toISOString(),
              mtimeMs: stats.mtimeMs,
            };
          })
          .sort((a, b) => b.mtimeMs - a.mtimeMs);
      } catch {
        subFiles[subDir.name] = [];
      }
    }

    return NextResponse.json({ ok: true, files, subFiles, totalFiles: files.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), files: [] }, { status: 200 });
  }
}
