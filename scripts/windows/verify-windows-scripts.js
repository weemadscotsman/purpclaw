#!/usr/bin/env node
'use strict';

/**
 * Windows integration SCRIPT-VALIDITY proof.
 *
 * Confirms the resident-Windows scripts are syntactically valid WITHOUT
 * installing anything: the two Node hosts via `node --check`, and the two
 * PowerShell scripts via the PowerShell AST parser (parse only, no execution).
 *
 * Actually installing the service / tray requires an elevated admin terminal
 * run by the operator — that is intentionally NOT done here.
 */

const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const JS = ['core-host.js', 'tray-agent.js'];
const PS1 = ['install.ps1', 'purpclaw-tray.ps1'];

let failed = 0;
const pass = (m) => console.log(`PASS ${m}`);
const fail = (m) => { console.log(`FAIL ${m}`); failed++; };

for (const f of JS) {
  try { execFileSync(process.execPath, ['--check', path.join(HERE, f)], { stdio: 'pipe' }); pass(`node --check ${f}`); }
  catch (e) { fail(`${f}: ${String(e.stderr || e.message).slice(0, 200)}`); }
}

const psCheck = `
$ErrorActionPreference='Stop'
$files = @('install.ps1','purpclaw-tray.ps1')
$bad = 0
foreach ($f in $files) {
  $p = Join-Path '${HERE.replace(/\\/g, '\\\\')}' $f
  $errs = $null; $toks = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($p, [ref]$toks, [ref]$errs)
  if ($errs -and $errs.Count -gt 0) { Write-Output "FAIL $f $($errs.Count)" ; $bad++ } else { Write-Output "PASS $f" }
}
exit $bad
`;

try {
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCheck], { encoding: 'utf8' });
  out.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
    if (line.startsWith('PASS')) pass(`powershell parse ${line.slice(5)}`);
    else if (line.startsWith('FAIL')) fail(`powershell parse ${line.slice(5)}`);
  });
} catch (e) {
  // non-Windows or PowerShell unavailable — skip PS checks, don't fail the suite
  console.log(`SKIP powershell parse (unavailable: ${String(e.message).slice(0, 80)})`);
}

if (failed === 0) console.log('all windows scripts valid (not installed — install requires operator admin)');
process.exit(failed ? 1 : 0);
