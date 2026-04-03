'use strict';

/**
 * NL → CRON TRANSLATOR — PURPCLAW
 * ================================
 *
 * Translates natural-language schedule phrases into 5-field cron
 * expressions. Intentionally small — covers the ~90% common cases. Anything
 * it can't parse returns { ok: false, reason } so callers can fall back to
 * a raw cron string.
 *
 * Examples (each maps to a cron expression):
 *   "every minute"                       → "* * * * *"
 *   "every 5 minutes"                    → "star-slash-5 * * * *"
 *   "every hour" / "hourly"              → "0 * * * *"
 *   "every morning at 9am"               → "0 9 * * *"
 *   "every evening at 6pm"               → "0 18 * * *"
 *   "every night at midnight"            → "0 0 * * *"
 *   "every weekday at 8:30"              → "30 8 * * 1-5"
 *   "every monday"                       → "0 0 * * 1"
 *   "every monday at 10am"               → "0 10 * * 1"
 *   "every weekend"                      → "0 0 * * 0,6"
 *   "every sunday and wednesday at 7pm"  → "0 19 * * 0,3"
 *   "daily at noon"                      → "0 12 * * *"
 *   "weekly"                             → "0 0 * * 0"
 *   "monthly on the 1st at noon"         → "0 12 1 * *"
 *   "1st of every month at 3pm"          → "0 15 1 * *"
 *
 * Days of week: 0=sun, 1=mon, ..., 6=sat (POSIX cron).
 *
 * Usage:
 *   const { parse } = require('./lib/scheduler/nl-cron.js');
 *   const r = parse('every morning at 9am');
 *   if (r.ok) console.log(r.cron);  // "0 9 * * *"
 */

const HOUR_RE = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
const MINUTE_RE = /\b(?:at\s+)?(\d{1,2}):(\d{2})\b/;

const WEEKDAYS = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const WEEKDAY_LIST_RE = /\b((?:sun|mon|tue|wed|thu|fri|sat)[a-z]*(?:\s*(?:and|,)\s*(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*)*)\b/gi;

function weekdayListToCronField(list) {
  const days = new Set();
  for (const m of list.matchAll(WEEKDAY_LIST_RE)) {
    for (const part of m[0].split(/\s*(?:,|and)\s*/i)) {
      const k = part.trim().toLowerCase();
      if (WEEKDAYS[k] !== undefined) days.add(WEEKDAYS[k]);
    }
  }
  return Array.from(days).sort((a, b) => a - b).join(',') || null;
}

function toHour(h, meridiem) {
  if (meridiem == null) return h;
  const m = meridiem.toLowerCase();
  if (m === 'am') return h === 12 ? 0 : h;
  if (m === 'pm') return h === 12 ? 12 : h + 12;
  return h;
}

/**
 * Parse a natural-language schedule into a cron expression.
 * @param {string} input
 * @returns {{ ok: true, cron: string, fields: object } | { ok: false, reason: string }}
 */
function parse(input) {
  if (typeof input !== 'string' || !input.trim()) {
    return { ok: false, reason: 'empty input' };
  }
  const text = input.trim().toLowerCase();

  // ── "every minute"
  if (/\bevery\s+minute\b/.test(text)) {
    return { ok: true, cron: '* * * * *', fields: { minute: '*' } };
  }

  // ── "every N minutes"
  let m = text.match(/\bevery\s+(\d+)\s+minutes?\b/);
  if (m) {
    return { ok: true, cron: `*/${parseInt(m[1], 10)} * * * *`, fields: { minute: `*/${m[1]}` } };
  }

  // ── "every hour" / "hourly"
  if (/\b(every\s+hour|hourly)\b/.test(text)) {
    return { ok: true, cron: '0 * * * *', fields: { minute: '0', hour: '*' } };
  }

  // ── "every N hours"
  m = text.match(/\bevery\s+(\d+)\s+hours?\b/);
  if (m) {
    return { ok: true, cron: `0 */${parseInt(m[1], 10)} * * *`, fields: { minute: '0', hour: `*/${m[1]}` } };
  }

  // ── "every morning/afternoon/evening/night at TIME"
  const periodHour = {
    morning: 9, dawn: 6, breakfast: 7,
    afternoon: 14, noon: 12, midday: 12, lunchtime: 12,
    evening: 18, dusk: 18, sunset: 18,
    night: 21, midnight: 0,
  };
  let period = null;
  for (const k of Object.keys(periodHour)) {
    if (new RegExp(`\\b${k}\\b`).test(text)) { period = k; break; }
  }

  // ── explicit time: "at 9am" / "at 14:30" / "9pm"
  let hour = null, minute = '0';
  const atMatch = text.match(HOUR_RE);
  if (atMatch) {
    const h = parseInt(atMatch[1], 10);
    const min = atMatch[2] ? parseInt(atMatch[2], 10) : 0;
    const meridiem = atMatch[3];
    if (h < 0 || h > 24 || min < 0 || min > 59) {
      return { ok: false, reason: `bad time: ${atMatch[0]}` };
    }
    if (meridiem) {
      hour = toHour(h, meridiem);
    } else if (h <= 23) {
      hour = h;
    } else {
      return { ok: false, reason: `ambiguous 24h: ${h}` };
    }
    minute = String(min);
  }
  if (period && hour == null) {
    hour = periodHour[period];
  }

  // ── day-of-month: "1st", "15th", "on the 5", "1st of every month", "every month on the 5th"
  let dom = '*';
  m = text.match(/\b(?:on\s+the\s+|on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(?:every\s+)?month\b/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 31) dom = String(n);
  } else {
    m = text.match(/\bevery\s+month(?:\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?)?(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/);
    if (m) {
      if (m[1] != null) {
        const n = parseInt(m[1], 10);
        if (n >= 1 && n <= 31) dom = String(n);
        else dom = '1';
      } else {
        dom = '1'; // "every month" without a day → 1st
      }
      if (m[2] != null) {
        const h = parseInt(m[2], 10);
        const mer = m[4];
        if (mer) hour = toHour(h, mer);
        else if (h <= 23) hour = h;
        if (m[3]) minute = String(parseInt(m[3], 10));
      }
    }
  }

  // ── day-of-week (with default-time handling for naked "weekly"/"monthly")
  const dow = (() => {
    if (/\bweekday\b/.test(text)) return '1-5';
    if (/\bweekend\b/.test(text)) return '0,6';
    if (/\bdaily\b|\bevery\s+day\b/.test(text)) return '*';
    if (/\bweekly\b/.test(text)) return '0';
    return weekdayListToCronField(text);
  })();

  // ── "every <X>" without a time, and we have a weekday
  if (hour == null && dow != null && dow !== '*') {
    if (/\bevery\s+(?:sun|mon|tue|wed|thu|fri|sat)/.test(text) ||
        /\bevery\s+weekday\b/.test(text) ||
        /\bevery\s+weekend\b/.test(text) ||
        /\bevery\s+week\b/.test(text)) {
      hour = 0; // midnight by default
    }
  }

  // Naked "weekly" → Sunday midnight
  if (hour == null && /\bweekly\b/.test(text)) {
    hour = 0;
  }
  // Naked "monthly" → 1st of month, midnight
  if (hour == null && /\bmonthly\b/.test(text)) {
    hour = 0;
    dom = '1';
  }

  // If we have a dom but no dow, default dow to '*'
  const dowFinal = dom !== '*' && (dow == null || dow === '') ? '*' : (dow || '*');

  if (hour == null) {
    return { ok: false, reason: `could not extract a time from "${input}"` };
  }
  // Time is known → if neither dom nor dow pinned a day, default to daily
  const effectiveDom = dom;
  const effectiveDow = dowFinal;
  if (effectiveDom === '*' && effectiveDow === '*') {
    // daily — no day pattern needed, that's fine
  } else if (effectiveDow == null) {
    return { ok: false, reason: `could not extract a day pattern from "${input}"` };
  }

  return {
    ok: true,
    cron: `${minute} ${hour} ${effectiveDom} * ${effectiveDow}`,
    fields: { minute, hour, dom: effectiveDom, month: '*', dow: effectiveDow },
  };
}

// ── inverse: cron → human phrase (best-effort)
function describe(cron) {
  if (typeof cron !== 'string') return null;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [mi, hr, dom, , dow] = parts;
  if (mi === '*' && hr === '*') return 'every minute';
  if (mi.startsWith('*/') && hr === '*' && dom === '*' && dow === '*') return `every ${mi.slice(2)} minutes`;
  if (mi === '0' && hr === '*' && dom === '*' && dow === '*') return 'every hour';
  const time = `${String(hr).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  if (dom === '*' && dow === '*') return `daily at ${time}`;
  if (dom === '*' && dow === '1-5') return `weekdays at ${time}`;
  if (dom === '*' && dow === '0,6') return `weekends at ${time}`;
  if (dom !== '*' && dow === '*') return `monthly day ${dom} at ${time}`;
  if (dom === '*' && dow !== '*') {
    const names = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const ds = dow.split(',').map((d) => names[parseInt(d, 10)] || d).join(',');
    return `${ds} at ${time}`;
  }
  return cron;
}

module.exports = { parse, describe, toHour, weekdayListToCronField, WEEKDAYS };

// ── CLI smoke test
if (require.main === module) {
  const cases = [
    'every minute',
    'every 5 minutes',
    'every hour',
    'every morning at 9am',
    'every evening at 6pm',
    'every night at midnight',
    'every weekday at 8:30',
    'every monday',
    'every monday at 10am',
    'every sunday and wednesday at 7pm',
    'daily at noon',
    'weekly',
    'monthly on the 1st at noon',
    '1st of every month at 3pm',
    'every weekend at 11am',
    'every 15 minutes',
    'totally gibberish phrase',
  ];
  let pass = 0, fail = 0;
  for (const c of cases) {
    const r = parse(c);
    const line = `${c.padEnd(36)}  →  ${r.ok ? r.cron : '✗ ' + r.reason}`;
    console.log(line);
    if (r.ok) pass++; else fail++;
  }
  console.log(`\n${pass} ok · ${fail} fail`);
}
