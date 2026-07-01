import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Check multiple plausible locations
    const candidates = [
      path.join(process.cwd(), 'rules', 'refusal_weights.json'),
      path.join(process.cwd(), 'lib', 'refusal_weights.json'),
      path.join(process.cwd(), 'rules', 'common', 'refusal_weights.json'),
    ];

    let weights: Record<string, number> | null = null;
    let foundPath = '';

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const content = fs.readFileSync(candidate, 'utf-8');
        try {
          weights = JSON.parse(content);
          foundPath = candidate;
          break;
        } catch {
          // malformed JSON
        }
      }
    }

    if (weights === null) {
      return NextResponse.json(
        { ok: false, error: 'no refusal_weights.json found', pathsChecked: candidates, weights: null },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: true, path: foundPath, weights });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), weights: null }, { status: 200 });
  }
}
