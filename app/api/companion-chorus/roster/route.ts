import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';

// Companion Chorus roster — reads from ~/.companion-chorus/companions.json
// This is a terminal Node.js app, not a web service. This route exposes its
// state as a web-visible panel in /mochi.

export async function GET() {
  try {
    const configDir = path.join(os.homedir(), '.companion-chorus');
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
