import { NextResponse } from 'next/server';
import { getColonyMood } from '@/lib/spaghetti/thringlet-impact';

export const runtime = 'nodejs';

export async function GET() {
  const thringlets = await getColonyMood();
  return NextResponse.json({
    status: 'ok',
    service: 'no-spaghett',
    version: '0.1.0',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    thringletBridge: {
      url: process.env.THRINGLET_BRIDGE_URL || 'http://127.0.0.1:7799',
      online: thringlets.online,
      colonyMood: thringlets.mood || null,
      error: thringlets.error,
    },
    endpoints: {
      analyzePath: 'POST /api/analyze-path',
      analyzeGit: 'POST /api/analyze-git',
      refactor: 'POST /api/refactor',
      health: 'GET /api/health',
    },
    uptimeSeconds: Math.round(process.uptime()),
  });
}
