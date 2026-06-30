import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/awaken/start
 *
 * Starts an AWAKEN run by spawning the CLI.
 * Body: { mode: 'watch' | 'work' | 'monster' | 'ritual' }
 *
 * Does NOT wait for the run to finish — spawns and returns immediately.
 * Clients should poll /api/awaken/status for updates.
 */

const MODES = ['watch', 'work', 'monster', 'ritual'];

export async function POST(req: NextRequest) {
  let body: { mode?: string } = {};
  try { body = await req.json(); } catch {}

  if (!MODES.includes(body.mode)) {
    return Response.json({ ok: false, error: `Invalid mode '${body.mode}'. Must be one of: ${MODES.join(', ')}` }, { status: 400 });
  }

  const mode = body.mode;
  const spawnCmd = (cmd: string, args: string[]) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { spawn } = require('child_process');
    const cwd = process.cwd();
    spawn(cmd, args, { cwd, detached: true, stdio: 'ignore' }).unref();
  };

  // Detect OS and run appropriately
  const isWin = process.platform === 'win32';
  const purpclaw = isWin ? 'node' : 'node';
  const purpclawArgs = ['bin/purpclaw.js', 'awaken', '--mode', mode];
  const binPath = `${process.cwd()}/bin/purpclaw.js`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { spawn } = require('child_process');
    const child = spawn('node', [`bin/purpclaw.js`, 'awaken', '--mode', mode], {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    return Response.json({ ok: true, mode, message: `AWAKEN ${mode} started. Poll /api/awaken/status for updates.` });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
