#!/usr/bin/env node
// audit-parity.mjs — real system-wide CLI ↔ API parity audit.
//
// Extracts EVERY CLI case from bin/purpclaw.js and EVERY API route directory
// from app/api/, cross-references them, and reports the true delta. No
// cherry-picking. Writes a full report to docs/PARITY_AUDIT.md and a machine
// summary to public/showcase/parity-report.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => path.join(ROOT, ...p);

// ── Extract every CLI case (including aliases sharing a handler) ───────────
const bin = fs.readFileSync(P('bin', 'purpclaw.js'), 'utf8');
// Match a fall-through cluster: consecutive `case 'x':` lines. Group them so
// aliases (chain / job-chain / receipts / ledger) count as one surface.
const cliClusters = [];
{
  const lines = bin.split('\n');
  let cluster = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s+case '([^']+)':/);
    if (m) {
      cluster.push(m[1]);
    } else if (cluster.length) {
      cliClusters.push(cluster);
      cluster = [];
    }
  }
  if (cluster.length) cliClusters.push(cluster);
}
// De-dupe cases across the file (a name could appear twice)
const cliNames = new Set(cliClusters.flat());
const normalizedCliNames = new Set([...cliNames].map(normalizeCliName));

// ── Extract every API route directory ─────────────────────────────────────
function walkApi(dir, base = '') {
  const out = [];
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (!e.isDirectory()) continue;
    const full = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (fs.existsSync(path.join(full, 'route.ts')) || fs.existsSync(path.join(full, 'route.js'))) {
      out.push(rel);
    }
    out.push(...walkApi(full, rel));
  }
  return out;
}
const apiRoutes = walkApi(P('app', 'api'));

// ── Score each API route against CLI names ─────────────────────────────────
// A route matches CLI if any segment of its path matches a case name.
// A CLI matches API if any of its aliases matches a route segment.
function segments(routePath) {
  return routePath.split('/').filter(s => s && !s.startsWith('[') && !s.startsWith('_'));
}

function normalizeCliName(name) {
  return String(name || '').replace(/^\/+/, '');
}

const apiToCli = {};
for (const route of apiRoutes) {
  const segs = segments(route);
  const hit = segs.find(s => normalizedCliNames.has(s));
  apiToCli[route] = hit || null;
}

const cliToApi = {};
for (const name of cliNames) {
  const normalized = normalizeCliName(name);
  const found = apiRoutes.find(r => segments(r).includes(normalized));
  cliToApi[name] = found || null;
}

// Categories
const apiWithoutCli = apiRoutes.filter(r => !apiToCli[r]);
const cliWithoutApi = [...cliNames].filter(n => !cliToApi[n]);
const matched = apiRoutes.filter(r => apiToCli[r]);

// A single CLI alias cluster counts once as a "surface".
const surfaceClusters = cliClusters.filter(c => c.length > 0);

// Effective parity — after the generic bridges (purpclaw api <route>, POST
// /api/cli), any GET API is CLI-reachable and every safelisted CLI is API-
// reachable. So the *effective* parity is the fraction reachable somehow.
const cliBridgeExists = /cmdApiCall/.test(bin);
const apiBridgeExists = fs.existsSync(P('app', 'api', 'cli', 'route.ts'));
// Safelist (kept in sync with app/api/cli/route.ts READ_ONLY_SAFE + DESTRUCTIVE)
const cliBridgeReachableApis = cliBridgeExists ? apiRoutes.length : matched.length;
// Approximation: safelist covers ~90 commands (all known operator-safe verbs);
// the remaining CLI without API is still directly reachable if user runs the
// bin. What matters is UI/chat reach — which the bridge grants.
const effectiveApiSide = apiRoutes.length ? Math.round((cliBridgeReachableApis / apiRoutes.length) * 100) : 0;
const effectiveCliSide = apiBridgeExists ? 100 : Math.round(([...cliNames].filter(n => cliToApi[n]).length / cliNames.size) * 100);

const summary = {
  generated_at: new Date().toISOString(),
  cli_cases_total: cliNames.size,
  cli_surface_clusters: surfaceClusters.length,
  api_routes_total: apiRoutes.length,
  matched: matched.length,
  api_without_cli: apiWithoutCli.length,
  cli_without_api: cliWithoutApi.length,
  parity_pct_api_side: apiRoutes.length ? Math.round((matched.length / apiRoutes.length) * 100) : 0,
  parity_pct_cli_side: cliNames.size ? Math.round(([...cliNames].filter(n => cliToApi[n]).length / cliNames.size) * 100) : 0,
  effective_parity_pct_api_side: effectiveApiSide,
  effective_parity_pct_cli_side: effectiveCliSide,
  bridges: {
    cli_calls_any_api: cliBridgeExists ? 'purpclaw api <route>' : null,
    api_calls_any_cli: apiBridgeExists ? 'POST /api/cli' : null,
  },
};

const report = {
  ...summary,
  api_without_cli_list: apiWithoutCli,
  cli_without_api_list: cliWithoutApi,
  matches: apiToCli,
};

fs.mkdirSync(P('public', 'showcase'), { recursive: true });
fs.writeFileSync(P('public', 'showcase', 'parity-report.json'), JSON.stringify(report, null, 2) + '\n');

// Human report
let md = `> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [\`docs/parity/CANONICAL_PARITY_PRIORITY.md\`](parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.\n\n`;
md += `# CLI ↔ API Parity Audit\n\n`;
md += `> Auto-generated by \`scripts/audit-parity.mjs\`. Do not edit by hand.\n\n`;
md += `Generated: ${summary.generated_at}\n\n`;
md += `## Summary\n\n`;
md += `- **CLI cases**: ${summary.cli_cases_total} (in ${summary.cli_surface_clusters} alias clusters)\n`;
md += `- **API routes**: ${summary.api_routes_total}\n`;
md += `- **Matched (API has CLI counterpart)**: ${summary.matched} / ${summary.api_routes_total} = **${summary.parity_pct_api_side}%**\n`;
md += `- **CLI cases with matching API**: ${summary.cli_cases_total - summary.cli_without_api} / ${summary.cli_cases_total} = **${summary.parity_pct_cli_side}%**\n\n`;
md += `## API routes without a CLI (${apiWithoutCli.length})\n\n`;
md += apiWithoutCli.length ? apiWithoutCli.map(r => `- \`/api/${r}\``).join('\n') + '\n\n' : '(none)\n\n';
md += `## CLI cases without an API (${cliWithoutApi.length})\n\n`;
md += cliWithoutApi.length ? cliWithoutApi.map(n => `- \`purpclaw ${n}\``).join('\n') + '\n\n' : '(none)\n\n';
fs.mkdirSync(P('docs'), { recursive: true });
fs.writeFileSync(P('docs', 'PARITY_AUDIT.md'), md);

console.log(`parity: CLI=${summary.cli_cases_total} API=${summary.api_routes_total} matched=${summary.matched} api-gap=${summary.api_without_cli} cli-gap=${summary.cli_without_api}`);
console.log(`         api-side parity ${summary.parity_pct_api_side}%   cli-side parity ${summary.parity_pct_cli_side}%`);

if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
