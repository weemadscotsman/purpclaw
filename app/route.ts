import { NextRequest, NextResponse } from 'next/server';

// / → permanent redirect to /ui (the Agent Tower / Skyscraper UI).
// The v8.3.0 inline Mission Control moved to /inline.
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/ui', request.url), { status: 307 });
}
