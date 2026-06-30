import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'agent_work', 'benchmark', 'history.jsonl');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ ok: false, error: 'history.jsonl not found', cycles: [] }, { status: 200 });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const cycles = lines.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);

    // Sort newest first (last line = most recent)
    cycles.reverse();

    return NextResponse.json({ ok: true, cycles, count: cycles.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), cycles: [] }, { status: 200 });
  }
}
