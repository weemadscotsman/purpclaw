import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/api-mega-list — HTTP endpoint exposing the API Mega List catalog.
 *
 * The agent uses these directly via lib/api-mega-list.js; this HTTP
 * endpoint is for the UI.
 *
 * GET endpoints:
 *   /api/api-mega-list              →  summary
 *   ?mode=categories                →  { categories: [...] }
 *   ?mode=search&q=...&limit=...    →  { results: [...] }
 *   ?mode=category&slug=ai&limit=N  →  { results: [...] }
 *   ?mode=api&category=ai&name=...   →  { api: {...} }
 *
 * POST  /api/api-mega-list  with { category, name, args } invokes an API.
 */
export async function GET(request: NextRequest) {
  let api;
  try {
    // app/api/api-mega-list/route.ts → up 3 = project root → lib/api-mega-list
    api = require('../../../lib/api-mega-list');
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `Failed to load api-mega-list: ${e.message}` }, { status: 500 });
  }

  const mode = request.nextUrl.searchParams.get('mode') || 'summary';

  if (mode === 'categories') {
    return NextResponse.json({ ok: true, ...api.getSummary() });
  }
  if (mode === 'search') {
    const q = request.nextUrl.searchParams.get('q') || '';
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20');
    const hits = api.search(q, Math.min(200, limit));
    return NextResponse.json({ ok: true, query: q, count: hits.length, results: hits });
  }
  if (mode === 'category') {
    const slug = request.nextUrl.searchParams.get('slug') || '';
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100');
    const apis = api.getByCategory(slug);
    return NextResponse.json({ ok: true, category: slug, total: apis.length, count: Math.min(limit, apis.length), results: apis.slice(0, limit) });
  }
  if (mode === 'api') {
    const category = request.nextUrl.searchParams.get('category') || '';
    const name = request.nextUrl.searchParams.get('name') || '';
    const result = api.getApi(category, name);
    return NextResponse.json({ ok: !!result, api: result });
  }
  if (mode === 'assignments') {
    const division = request.nextUrl.searchParams.get('division');
    const agent = request.nextUrl.searchParams.get('agent');
    if (division) {
      const slugs = api.getCategoriesForDivision(division);
      const categories = (slugs || []).map((s: string) => ({ slug: s, ...api.getAssignmentForCategory(s) }));
      return NextResponse.json({ ok: true, division, count: categories.length, categories });
    }
    if (agent) {
      const slugs = api.getCategoriesForAgent(agent);
      const categories = (slugs || []).map((s: string) => ({ slug: s, ...api.getAssignmentForCategory(s) }));
      return NextResponse.json({ ok: true, agent, count: categories.length, categories });
    }
    return NextResponse.json({ ok: true, assignments: api.getAssignments() });
  }
  return NextResponse.json({ ok: true, ...api.getSummary() });
}

export async function POST(request: NextRequest) {
  let api;
  try {
    api = require('../../../lib/api-mega-list');
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
  const body = await request.json().catch(() => ({}));
  const result = await api.callApi(body.category, body.name, body.args || {});
  return NextResponse.json(result);
}
