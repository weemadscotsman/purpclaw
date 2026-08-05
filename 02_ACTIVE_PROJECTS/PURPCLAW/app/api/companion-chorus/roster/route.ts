import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// Companion Chorus roster — reads <project>/.companion-chorus/companions.json.
//
// This used path.join(os.homedir(), '.companion-chorus'). Two problems: PURPCLAW
// state belongs inside the project, and that homedir literal is statically
// resolvable, so @vercel/nft followed it during `next build`, walked the user
// profile and died on `C:\Users\Admin\Application Data` — a legacy junction
// that loops and denies access. Resolving from the project root fixes the
// storage location and the build together.

export async function GET() {
  try {
    const configDir = path.join(process.cwd(), '.companion-chorus');
    const companionsFile = path.join(configDir, 'companions.json');

    if (!fs.existsSync(companionsFile)) {
      return NextResponse.json({
        ok: false,
        error: 'companions.json not found',
        companions: [],
        path: companionsFile,
        hint: 'Run: node companion-chorus/main.js',
      });
    }

    const content = fs.readFileSync(companionsFile, 'utf-8');
    const companions = JSON.parse(content);

    return NextResponse.json({
      ok: true,
      companions,
      count: companions.length,
      source: companionsFile,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: String(e),
      companions: [],
    });
  }
}
