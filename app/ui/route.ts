import { NextRequest, NextResponse } from 'next/server';

// /ui → permanent redirect to the statically-served Mission Control UI
// Files live in public/new-master-ui/ and Next.js serves them at /new-master-ui/
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/new-master-ui/index.html', request.url), { status: 308 });
}
