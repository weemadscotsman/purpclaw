import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ledgerPath = path.join(process.cwd(), 'agent_work', 'llm-ledger.jsonl');
    if (!fs.existsSync(ledgerPath)) {
      return NextResponse.json({
        success: true,
        summary: {
          totalCalls: 0,
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          totalTokens: 0,
          totalCost: 0
        },
        recent: []
      });
    }

    const raw = fs.readFileSync(ledgerPath, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);

    let totalCalls = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let totalCost = 0;
    const recent: any[] = [];

    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        totalCalls++;
        totalPromptTokens += entry.prompt_tokens || 0;
        totalCompletionTokens += entry.completion_tokens || 0;
        totalTokens += entry.total_tokens || 0;
        totalCost += entry.estimatedCost || 0;

        if (recent.length < 50) {
          recent.push(entry);
        }
      } catch {}
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalCalls,
        totalPromptTokens,
        totalCompletionTokens,
        totalTokens,
        totalCost: parseFloat(totalCost.toFixed(4))
      },
      recent
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
