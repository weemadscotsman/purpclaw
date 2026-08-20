'use strict';
/**
 * lib/browser-session.js — ONE browser that PurpClaw owns and keeps alive.
 *
 * The old tools drove two unrelated browsers: `browser_open` shelled out to
 * `start <url>`, which hands the URL to the operator's default browser in a
 * separate process PurpClaw has no handle on, while `browser_screenshot`
 * launched a throwaway headless Chromium, navigated it, captured, and closed
 * it. So the agent could never see, click, or play the tab it had just opened,
 * and every screenshot demanded a URL because there was no current page to
 * speak of.
 *
 * The CLI (packages/tools/browser.js) already assumed the right model —
 * open / get_content / screenshot / click / type / tabs against a persistent
 * session — but four of those tools were never implemented. This is that
 * session.
 *
 * Deliberate choices:
 *   headed          — the operator must SEE the browser. A headless window that
 *                     "opened YouTube" is indistinguishable from doing nothing.
 *   persistent ctx  — keeps cookies and logins, so the operator's YouTube,
 *                     GitHub and mail sessions are already signed in.
 *   autoplay        — media starts without a synthetic click, because "play
 *                     this video" should actually play it.
 *   lazy launch     — nothing starts until a browser tool is first called.
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const DATA = process.env.PURPCLAW_DATA || path.join(ROOT, '.purpclaw');
const PROFILE_DIR = path.join(DATA, 'browser-profile');
const SHOT_DIR = path.join(DATA, 'screenshots');

let ctx = null;       // persistent BrowserContext
let launching = null; // in-flight launch, so concurrent calls share one browser
let active = null;    // the tab every tool acts on — set by open()/newTab, NOT guessed

function playwright() {
  // playwright first (ships browsers), playwright-core as fallback.
  try { return require('playwright'); } catch {}
  try { return require('playwright-core'); } catch {}
  return null;
}

async function launch() {
  const pw = playwright();
  if (!pw) {
    throw new Error('playwright is not installed — run: npm i playwright && npx playwright install chromium');
  }
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const c = await pw.chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: null,                       // real window, operator-resizable
    args: [
      // "Play this" must actually play. Without this Chromium blocks audible
      // media until a real user gesture, which the agent cannot produce.
      '--autoplay-policy=no-user-gesture-required',
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  c.on('close', () => { ctx = null; });
  return c;
}

/** The live context, launching it once if needed. */
async function context() {
  if (ctx) return ctx;
  if (!launching) {
    launching = launch()
      .then(c => { ctx = c; return c; })
      .finally(() => { launching = null; });
  }
  return launching;
}

/**
 * The ACTIVE page — the one every tool acts on. Tracked explicitly rather than
 * guessed as "the last tab", because a persistent profile carries leftover tabs
 * (the cockpit, a previous session) and "last" jumps between them, so open()
 * would navigate one tab while observe() read another.
 */
async function page() {
  const c = await context();
  if (active && !active.isClosed()) return active;
  const pages = c.pages().filter(p => !p.isClosed());
  active = pages.length ? pages[pages.length - 1] : await c.newPage();
  return active;
}

async function open(url, { newTab = false } = {}) {
  if (!url) throw new Error('url required');
  const target = /^[a-z]+:\/\//i.test(url) ? url : 'https://' + url;
  const c = await context();
  const p = newTab ? await c.newPage() : await page();
  active = p;   // this is now the tab every subsequent tool acts on
  // 'commit' rather than 'load': a heavy page (YouTube) can keep loading for
  // many seconds, and reporting success only after full load made the tool look
  // hung when the page was already visible and usable.
  await p.goto(target, { waitUntil: 'commit', timeout: 45000 });
  await p.bringToFront();
  return { url: p.url(), title: await p.title().catch(() => '') };
}

async function getContent({ maxLength = 5000 } = {}) {
  const p = await page();
  const text = await p.evaluate(() => {
    const el = document.querySelector('main, article') || document.body;
    return el ? el.innerText : '';
  }).catch(() => '');
  return { url: p.url(), title: await p.title().catch(() => ''), content: String(text).slice(0, maxLength) };
}

async function screenshot({ path: out = null, fullPage = false } = {}) {
  const p = await page();
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  // Screenshots the CURRENT page. The old tool required a url because it had
  // no page to capture — it built a new browser every time.
  const file = out || path.join(SHOT_DIR, `shot-${Date.now()}.png`);
  await p.screenshot({ path: file, fullPage });
  return { path: file, url: p.url() };
}

/** Click by visible text first, then CSS — the CLI passes either. */
async function click(target) {
  if (!target) throw new Error('target required');
  const p = await page();
  const byText = p.getByText(target, { exact: false }).first();
  try {
    await byText.click({ timeout: 4000 });
    return { clicked: target, by: 'text', url: p.url() };
  } catch {}
  await p.click(target, { timeout: 4000 });
  return { clicked: target, by: 'selector', url: p.url() };
}

async function type(text, { submit = false, selector = null } = {}) {
  if (text == null) throw new Error('text required');
  const p = await page();
  if (selector) await p.fill(selector, String(text));
  else {
    const box = p.locator('input:visible, textarea:visible, [contenteditable=true]:visible').first();
    await box.click({ timeout: 5000 });
    await box.fill(String(text));
  }
  if (submit) await p.keyboard.press('Enter');
  return { typed: String(text).slice(0, 120), submitted: !!submit, url: p.url() };
}

async function tabs() {
  if (!ctx) return { running: false, tabs: [] };
  const ps = ctx.pages().filter(p => !p.isClosed());
  return {
    running: true,
    tabs: await Promise.all(ps.map(async (p, i) => ({
      index: i, url: p.url(), title: await p.title().catch(() => ''),
    }))),
  };
}

/** Escape hatch for page control the named tools do not cover. */
async function evaluate(expression) {
  if (!expression) throw new Error('expression required');
  const p = await page();
  const code = String(expression);
  // The model passes BOTH forms: a bare expression ("document.title") and a
  // statement body ("const v=document.querySelector('video'); v.play();").
  // Wrapping only as `return (code)` breaks the statement form, which sent the
  // model into a retry loop. Try expression form, then fall back to running the
  // code as an async function body.
  let value;
  try {
    value = await p.evaluate(`(async()=>{ return (${code}); })()`);
  } catch (e1) {
    try {
      value = await p.evaluate(`(async()=>{ ${code} })()`);
    } catch (e2) {
      throw new Error(e2.message);
    }
  }
  return { url: p.url(), value };
}

/** Start media on the page — the point of "play this video". */
async function play() {
  const p = await page();
  const result = await p.evaluate(async () => {
    const m = document.querySelector('video, audio');
    if (!m) return { played: false, reason: 'no media element on page' };
    try { await m.play(); } catch (e) { return { played: false, reason: e.message }; }
    return { played: !m.paused, currentTime: m.currentTime, duration: m.duration || null };
  });
  return { url: p.url(), ...result };
}

/**
 * Observe the current page — structured machine-readable state.
 * Returns url, title, interactive elements, focused element, tabs, and media state.
 * Designed so the caller can verify target-state without image interpretation.
 */
async function observe() {
  const p = await page();
  const c = await context();
  // Let an in-flight SPA navigation settle so evaluate() doesn't hit a
  // destroyed execution context. Best-effort — never block observe on it.
  await p.waitForLoadState('domcontentloaded', { timeout: 2500 }).catch(() => {});

  // ── Page elements ───────────────────────────────────────────────
  const elements = await p.evaluate(() => {
    const els = [];
    // Links and buttons (most actionable first)
    for (const el of document.querySelectorAll('a, button, [role="button"], input, textarea, select')) {
      if (!el.offsetHeight && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && el.tagName !== 'SELECT') continue;
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role') || '';
      const text = (el.innerText || el.value || '').trim().slice(0, 80);
      const href = el.href || '';
      const placeholder = el.placeholder || '';
      const rect = el.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0;
      els.push({
        tag,
        role,
        id: el.id || null,
        className: el.className.slice(0, 60),
        text,
        href: href.slice(0, 120),
        placeholder,
        visible,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
      });
    }
    return els;
  }).catch(() => []);

  // ── Focused element ───────────────────────────────────────────────
  const focused = await p.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      className: el.className.slice(0, 60),
      value: (el.value || '').slice(0, 80),
      placeholder: el.placeholder || '',
    };
  }).catch(() => null);

  // ── Media state ──────────────────────────────────────────────────
  const media = await p.evaluate(() => {
    const m = document.querySelector('video, audio');
    if (!m) return { present: false };
    return {
      present: true,
      playing: !m.paused && !m.ended,
      paused: m.paused,
      muted: m.muted,
      currentTime: Math.round(m.currentTime || 0),
      duration: Math.round(m.duration) || null,
      volume: Math.round((m.volume || 0) * 100),
      src: (m.src || '').slice(0, 120),
    };
  }).catch(() => ({ present: false, error: 'could not evaluate media element' }));

  // ── Tabs ────────────────────────────────────────────────────────
  const tabList = c.pages().filter(pg => !pg.isClosed());
  const tabs = await Promise.all(tabList.map(async (pg, i) => ({
    index: i,
    url: pg.url(),
    title: await pg.title().catch(() => ''),
    active: pg === p,
  }))).catch(() => []);

  // url()/title() can throw while the page is mid-navigation (SPA route change
  // on YouTube). observe() is the model's VERIFY step, so it must always return
  // something usable rather than becoming an ok:false the model reacts to by
  // thrashing.
  let url = '', title = '';
  try { url = p.url(); } catch {}
  try { title = await p.title(); } catch {}
  return { url, title, elements, focused, media, tabs, timestamp: new Date().toISOString() };
}

async function close() {
  if (!ctx) return { closed: false };
  try { await ctx.close(); } catch {}
  ctx = null;
  return { closed: true };
}

module.exports = { open, getContent, screenshot, click, type, tabs, evaluate, play, observe, close, context, page,
                   PROFILE_DIR, SHOT_DIR };
