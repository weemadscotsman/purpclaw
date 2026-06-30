import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/awaken/stop
 *
 * Stops the active AWAKEN run by writing the STOP file.
 */

export async function POST(req: NextRequest) {
  const stopFile = `${process.cwd()}/agent_work/awaken/.STOP`;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('fs').writeFileSync(stopFile, new Date().toISOString(), 'utf8');
    return Response.json({ ok: true, message: 'Stop signal sent.' });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
