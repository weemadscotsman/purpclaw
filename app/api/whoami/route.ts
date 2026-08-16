import { NextRequest, NextResponse } from 'next/server';
import { checkOperator } from '../_lib/operator-auth';
import { checkRateLimit } from '../_lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const operatorCookie = request.cookies.get('purpclaw_operator')?.value;
  const name = operatorCookie || process.env.PURPCLAW_OPERATOR || process.env.USERNAME || 'Ted';
  const cleanName = String(name).trim();

  return NextResponse.json({
    name: cleanName,
    role: cleanName.toLowerCase() === 'ted' || cleanName.toLowerCase() === 'eddie' ? 'founder' : 'operator',
    station: 'mission-control',
  });
}

export async function POST(request: NextRequest) {
  const auth = checkOperator(request);
  if (!auth.ok) return auth.response;

  const limited = checkRateLimit(request, 'whoami-post', 10);
  if (limited) return limited;

  let body: any = {};
  try { body = await request.json(); } catch {}
  
  const newName = String(body?.name || '').trim();
  if (!newName) {
    return NextResponse.json({ error: 'name-required' }, { status: 400 });
  }

  const response = NextResponse.json({
    success: true,
    name: newName,
    role: newName.toLowerCase() === 'ted' || newName.toLowerCase() === 'eddie' ? 'founder' : 'operator',
  });
  
  // Set cookie for 1 year
  response.cookies.set('purpclaw_operator', newName, { maxAge: 60 * 60 * 24 * 365, path: '/' });
  return response;
}
