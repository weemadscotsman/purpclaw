import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * /ui — exact match (no trailing slash). Serves the static Agent Tower /
 * Skyscraper UI's index.html directly.
 *
 * Companion to /ui/[...path]/route.ts which handles /ui/anything.
 * Without this parallel route, hitting /ui (no slash) would 404 because
 * the catch-all only fires on /ui/<path>, and bare /ui falls through to
 * the not-found page.
 */

const INDEX_PATH = path.join(process.cwd(), 'app', 'public', 'ui', 'index.html');

export async function GET(request: NextRequest) {
  try {
    const body = fs.readFileSync(INDEX_PATH);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-cache',
      },
    });
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }
}
