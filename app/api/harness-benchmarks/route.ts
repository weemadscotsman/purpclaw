import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const RESULTS_DIR = path.join(process.cwd(), 'eval', 'results');
const LATEST_FILE = path.join(RESULTS_DIR, 'harness-benchmark-latest.json');
const LEDGER_FILE = path.join(process.cwd(), 'agent_work', 'harness_benchmark.jsonl');

function readJson(filePath: string, fallback: any) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readHistory() {
  try {
    if (!fs.existsSync(LEDGER_FILE)) return [];
    return fs.readFileSync(LEDGER_FILE, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(-30)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean)
      .reverse();
  } catch {
    return [];
  }
}

export async function GET() {
  const latest = readJson(LATEST_FILE, null);
  const history = readHistory();
  const previous = history[1] || null;
  const latestSummary = latest?.summary || history[0]?.summary || null;
  const previousSummary = previous?.summary || null;

  const trend = latestSummary && previousSummary ? {
    completionRateDelta: Number(((latestSummary.completionRate || 0) - (previousSummary.completionRate || 0)).toFixed(4)),
    passAt1Delta: Number(((latestSummary.passAt1Rate || 0) - (previousSummary.passAt1Rate || 0)).toFixed(4)),
    retryDelta: (latestSummary.retries || 0) - (previousSummary.retries || 0),
    memoryLessonDelta: (latestSummary.memoryLessons || 0) - (previousSummary.memoryLessons || 0),
  } : null;

  return NextResponse.json({
    ok: true,
    latest,
    summary: latestSummary || {
      totalGoals: 0,
      passedGoals: 0,
      completionRate: 0,
      passAt1Rate: 0,
      passAt3Rate: 0,
      retries: 0,
      memoryLessons: 0,
      agentScoreRecords: 0,
    },
    trend,
    history,
    artifacts: {
      latest: fs.existsSync(LATEST_FILE) ? LATEST_FILE : null,
      ledger: fs.existsSync(LEDGER_FILE) ? LEDGER_FILE : null,
    },
  });
}
