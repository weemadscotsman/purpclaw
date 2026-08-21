/**
 * Playwright Agent API Gateway
 * Headless Chromium browser agent for PURPCLAW
 * Actions: navigate, click, type, screenshot, dom, extract, execute, status
 */
import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { checkOperator } from '../_lib/operator-auth';
import { checkRateLimit } from '../_lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
let page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>> | null = null;
let lastUrl: string | null = null;

const SCREENSHOT_PATH = path.join(os.tmpdir(), 'purpclaw-playwright-screenshot.png');

async function getPage() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
  }
  return page!;
}

async function capture(): Promise<string> {
  const p = await getPage();
  await p.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
  return SCREENSHOT_PATH;
}

export async function POST(req: NextRequest) {
  const auth = checkOperator(req);
  if (!auth.ok && 'response' in auth) return auth.response;

  const limited = checkRateLimit(req, 'playwright', 60);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  try {
    if (action === 'navigate') {
      const { url } = body;
      if (!url) return NextResponse.json({ ok: false, error: 'url required' });
      const p = await getPage();
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      lastUrl = url;
      const title = await p.title().catch(() => '');
      return NextResponse.json({ ok: true, url, title });
    }

    if (action === 'screenshot') {
      const sp = await capture();
      const buf = fs.readFileSync(sp);
      return new NextResponse(buf, {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' },
      });
    }

    if (action === 'dom') {
      const p = await getPage();
      const body_html = await p.evaluate(() => document.body?.innerHTML || '').catch(() => '');
      return NextResponse.json({ ok: true, url: p.url(), title: await p.title().catch(() => ''), html: body_html.slice(0, 5000) });
    }

    if (action === 'click') {
      const { selector } = body;
      if (!selector) return NextResponse.json({ ok: false, error: 'selector required' });
      const p = await getPage();
      await p.click(selector, { timeout: 5000 }).catch(() => {});
      return NextResponse.json({ ok: true, url: p.url() });
    }

    if (action === 'type') {
      const { selector, text, pressEnter } = body;
      if (!selector || text === undefined) return NextResponse.json({ ok: false, error: 'selector and text required' });
      const p = await getPage();
      await p.fill(selector, text);
      if (pressEnter) await p.press(selector, 'Enter');
      return NextResponse.json({ ok: true });
    }

    if (action === 'scroll') {
      const { direction = 'down', amount = 500 } = body;
      const p = await getPage();
      const dy = direction === 'up' ? -Math.abs(amount) : amount;
      await p.evaluate((y) => window.scrollBy(0, y), dy);
      return NextResponse.json({ ok: true });
    }

    if (action === 'extract') {
      const { selector } = body;
      const p = await getPage();
      let text = '';
      if (selector) {
        text = (await p.locator(selector).first().textContent().catch(() => '')) ?? '';
      } else {
        text = (await p.locator('body').first().textContent().catch(() => '')) ?? '';
      }
      return NextResponse.json({ ok: true, text: (text || '').slice(0, 2000) });
    }

    if (action === 'execute') {
      const { code } = body;
      if (!code) return NextResponse.json({ ok: false, error: 'code required' });
      const p = await getPage();
      const result = await p.evaluate(code).catch((e: Error) => ({ error: e.message }));
      return NextResponse.json({ ok: true, result });
    }

    if (action === 'status') {
      const p = await getPage();
      return NextResponse.json({
        ok: true,
        browser_alive: browser?.isConnected() || false,
        current_url: p?.url() || null,
        last_url: lastUrl,
      });
    }

    return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = checkOperator(req);
  if (!auth.ok && 'response' in auth) return auth.response;

  const limited = checkRateLimit(req, 'playwright_get', 60);
  if (limited) return limited;

  try {
    const sp = await capture();
    const buf = fs.readFileSync(sp);
    return new NextResponse(buf, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' },
    });
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }
}
