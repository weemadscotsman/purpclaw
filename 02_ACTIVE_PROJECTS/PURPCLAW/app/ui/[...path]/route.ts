import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/mission', request.url), { status: 307 });
}
