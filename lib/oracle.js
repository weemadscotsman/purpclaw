#!/usr/bin/env node
'use strict';

/**
 * oracle.js — PURPCLAW foresight / risk strategy (READ-ONLY).
 *
 * Consumes the Weatherman report plus Hivemind traces, Spring verdicts,
 * AntiSkills, registry-audit findings, and the launch ledger, then forecasts
 * likely risks, confidence, evidence, and the next-best action. It advises —
 * it NEVER patches code, merges registries, or quarantines files.
 *
 *   node lib/oracle.js            # human forecast
 *   node lib/oracle.js --json     # machine forecast
 *
 * Output: { forecast, confidence, severity, signals[], forecasts[], duck }
 *   each forecasts[] = { forecast, confidence, evidence[], recommended_next_action, avoid[] }
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
function reqSafe(p) { try { return require(p); } catch (e) { return { __error: e.message }; } }

function gatherSignals(weather) {
  const sig = {};

  // Drift signals (from weather)
  const driftSrc = weather.sources && weather.sources.drift;
  sig.drift = driftSrc && driftSrc.ok ? driftSrc.items : [];

  // Registry audit findings
  const audit = reqSafe(path.join(ROOT, 'lib', 'commands', 'registry-audit.js'));
  try { sig.audit = audit.buildReport ? audit.buildReport(ROOT).findings.filter(f => f.conflict) : []; }
  catch { sig.audit = []; }

  // Hivemind recent failures + antiskills
  const hm = reqSafe(path.join(ROOT, 'lib', 'hivemind'));
  sig.failures = []; sig.antiskills = 0; sig.traces = 0;
  try {
    if (hm.listTraces) {
      const traces = hm.listTraces({ limit: 40 }) || [];
      sig.traces = traces.length;
      sig.failures = traces.filter(t => t && (t.outcome === 'fail' || t.outcome === 'failure' || t.tests_passed === false))
        .map(t => ({ task: (t.task || '').slice(0, 80), outcome: t.outcome }));
    }
    if (hm.loadAntiSkillsForTask) { const a = hm.loadAntiSkillsForTask('') || []; sig.antiskills = a.length; }
  } catch {}

  // Launch ledger presence (does it mark anything critical?)
  sig.ledger_critical = false;
  try {
    const led = fs.readFileSync(path.join(ROOT, 'docs', 'PURPCLAW_MONSTER_LAUNCH_LEDGER.md'), 'utf8');
    sig.ledger_critical = /critical|red[\s-]?alert|blocker|drift/i.test(led);
  } catch {}

  return sig;
}

function buildForecasts(weather, sig) {
  const F = [];

  if (sig.drift.length) {
    const sev = sig.drift.some(d => d.severity === 'medium' || d.severity === 'high');
    F.push({
      forecast: 'Unreconciled drift will likely corrupt Hivemind skill provenance and benchmark claims if left until after more feature work.',
      confidence: sev ? 0.82 : 0.6,
      evidence: [
        ...sig.drift.map(d => `drift:${d.id} — ${d.detail}`),
        ...(sig.ledger_critical ? ['launch ledger flags drift as critical'] : []),
        'skill loader now depends on reliable skill metadata',
      ],
      recommended_next_action: 'run `npm run drift:fix` (auto), then review any needs-review items before new feature work',
      avoid: ['do not merge registries blindly', 'do not quarantine files before audit output is reviewed'],
    });
  }

  const liveweb = (weather.sources && weather.sources.drift && weather.sources.drift.items || []).find(i => i.id === 'liveweb');
  if (liveweb) {
    F.push({
      forecast: 'The running web build is stale; UI/API actions for newly added capabilities will fail until the Next bundle is rebuilt.',
      confidence: 0.75,
      evidence: [liveweb.detail, 'catalog ahead of running process'],
      recommended_next_action: 'rebuild + restart Next: `npm run build && pm2 restart purpclaw-nextjs`',
      avoid: ['do not add more capabilities expecting them live before a rebuild'],
    });
  }

  if (sig.failures.length >= 2) {
    F.push({
      forecast: `Recent repeated failures (${sig.failures.length} in last traces) suggest a recurring failure mode likely to repeat on similar tasks.`,
      confidence: Math.min(0.85, 0.5 + sig.failures.length * 0.05),
      evidence: sig.failures.slice(0, 4).map(f => `failed: ${f.task} (${f.outcome})`),
      recommended_next_action: 'cluster the failures into an AntiSkill so future runs avoid the pattern',
      avoid: ['do not retry the same approach without changing the plan'],
    });
  }

  if (weather.condition === 'red_alert' || weather.condition === 'storm') {
    F.push({
      forecast: 'System is unstable right now; feature work will likely compound instability rather than progress.',
      confidence: 0.7,
      evidence: [`weather=${weather.condition}`, weather.summary],
      recommended_next_action: 'switch to audit/fix mode until weather clears',
      avoid: ['do not start large multi-file builds while red/storm'],
    });
  }

  const blind = (weather.sources && weather.sources.services && weather.sources.services.blind);
  if (blind) {
    F.push({
      forecast: 'Service health is unverifiable from this context, so any claim about live runtime is low-trust until probed from the host.',
      confidence: 0.5,
      evidence: ['weatherman could not reach any health port', 'likely sandboxed/non-host process'],
      recommended_next_action: 'run weather from the host/PM2 context (or `pm2 list`) before trusting service status',
      avoid: ['do not declare services down based on a blind probe'],
    });
  }

  if (!F.length) {
    F.push({
      forecast: 'No elevated risks detected from current signals; conditions favour normal, verified incremental work.',
      confidence: 0.6,
      evidence: ['no drift needing review', `weather=${weather.condition}`, `hivemind traces=${sig.traces}`],
      recommended_next_action: 'proceed with the next planned batch, stamping builds as you go',
      avoid: ['do not skip verification just because weather is clear'],
    });
  }

  F.sort((a, b) => b.confidence - a.confidence);
  return F;
}

async function forecast() {
  const wm = reqSafe(path.join(ROOT, 'lib', 'weatherman.js'));
  let weather;
  try { weather = await wm.report(); }
  catch (e) { weather = { condition: 'unknown', summary: 'weatherman unavailable: ' + e.message, sources: {} }; }
  const sig = gatherSignals(weather);
  const forecasts = buildForecasts(weather, sig);
  const top = forecasts[0];
  const sev = top.confidence >= 0.8 ? 'high' : top.confidence >= 0.6 ? 'medium' : 'low';
  return {
    schema: 'purpclaw.oracle.v1',
    generated_at: new Date().toISOString(),
    weather_condition: weather.condition,
    forecast: top.forecast,
    confidence: top.confidence,
    severity: sev,
    forecasts,
    signals: { drift: sig.drift.length, audit_conflicts: sig.audit.length, recent_failures: sig.failures.length, antiskills: sig.antiskills, traces: sig.traces },
    duck: `🦆🔮 ${top.forecast.slice(0, 90)}${top.forecast.length > 90 ? '…' : ''} (p=${top.confidence})`,
  };
}

function printForecast(r) {
  const C = { yel: '\x1b[33m', grn: '\x1b[32m', red: '\x1b[31m', gray: '\x1b[90m', b: '\x1b[1m', cy: '\x1b[36m', x: '\x1b[0m' };
  console.log(`\n${C.b}${C.cy}PURPCLAW ORACLE — FORECAST${C.x}  ${C.gray}${r.generated_at}${C.x}`);
  console.log(`  weather: ${r.weather_condition}  ·  top confidence: ${r.confidence}  ·  severity: ${r.severity}`);
  r.forecasts.forEach((f, i) => {
    const col = f.confidence >= 0.8 ? C.red : f.confidence >= 0.6 ? C.yel : C.gray;
    console.log(`\n  ${col}${i === 0 ? '▶ ' : '  '}[p=${f.confidence}]${C.x} ${f.forecast}`);
    console.log(`     ${C.gray}evidence:${C.x} ${f.evidence.slice(0, 3).join(' · ')}`);
    console.log(`     ${C.grn}→ next:${C.x} ${f.recommended_next_action}`);
    if (f.avoid && f.avoid.length) console.log(`     ${C.red}✗ avoid:${C.x} ${f.avoid.join('; ')}`);
  });
  console.log(`\n  ${r.duck}\n`);
}

async function main() {
  const json = process.argv.includes('--json');
  const r = await forecast();
  if (json) console.log(JSON.stringify(r, null, 2)); else printForecast(r);
  process.exit(0);
}

if (require.main === module) main();
module.exports = { forecast };
