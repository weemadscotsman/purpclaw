'use strict';
/**
 * P0-B — permission enforcement convergence.
 *
 *   node tests/contract/p0b-permission-enforcement.test.js
 *
 * Gate: CLI, HTTP and MCP converge on one ToolRuntime path; bypasses removed;
 * denials auditable; malformed requests fail closed.
 *
 * Mostly source-level assertions, deliberately. The defect class here is
 * "claims operator authority it does not have" and "returns a denial through
 * the success envelope" — both invisible at runtime unless you already have a
 * live denial to observe, which is the very thing that let them survive. The
 * behavioural half (fail-closed, deny-is-not-ok) is exercised against a real
 * ToolRuntime.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = r => fs.readFileSync(path.join(ROOT, r), 'utf8');

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message.split('\n')[0]}`); }
};
const checkAsync = async (name, fn) => {
  try { await fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message.split('\n')[0]}`); }
};

console.log('P0-B permission enforcement\n');

// Strip comments before scanning: this file's own fixes are documented in prose
// that contains the very strings being searched for.
const decomment = s => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

// ── 1. No surface may claim operator authority on a remote caller's behalf ──
const REMOTE_SURFACES = ['unified_api.js', 'lib/mcp-server.js'];
for (const f of REMOTE_SURFACES) {
  check(`${f}: does not hardcode operatorInitiated:true`, () => {
    const src = decomment(read(f));
    const hits = [...src.matchAll(/operatorInitiated\s*:\s*true/g)];
    assert.strictEqual(hits.length, 0,
      `${hits.length} occurrence(s). A remote HTTP/MCP caller is not the operator; `
      + 'tool-runtime.js passes this to GOVERNANCE.checkWorkflow where it auto-approves.');
  });
}

// ── 2. Every tool dispatch goes through ToolRuntime ─────────────────────────
check('unified_api.js dispatches tools only via ToolRuntime', () => {
  const src = decomment(read('unified_api.js'));
  assert.ok(/getToolRuntime\(\)\.invoke\(/.test(src), 'no ToolRuntime.invoke call found');
  // The pre-P0-B bypass shape: calling the raw registry directly.
  assert.ok(!/(?<!ToolRuntime\(\)\.)\bTOOLS\.invoke\(/.test(src),
    'raw TOOLS.invoke() bypasses the permission engine');
});
check('lib/mcp-server.js has no raw shell path', () => {
  const src = decomment(read('lib/mcp-server.js'));
  assert.ok(!/execSync\(|child_process/.test(src),
    'raw shell execution present — MCP must route through ToolRuntime');
  assert.ok(/TOOL_RUNTIME\.invoke\(/.test(src), 'no ToolRuntime.invoke call found');
});

// ── 3. A denial must not be representable as success ────────────────────────
check('unified_api.js returns denials as errors, not ok()', () => {
  const src = decomment(read('unified_api.js'));
  assert.ok(!/ok\(\s*[`'"]ToolRuntime denied/.test(src),
    'denial returned through ok() — callers cannot distinguish refused from succeeded');
  assert.ok(/function denied\(/.test(src), 'no denied() helper defined');
  assert.ok(/isError:\s*true/.test(src), 'denial envelope does not set isError');
});
check('lib/mcp-server.js marks denials isError', () => {
  const src = decomment(read('lib/mcp-server.js'));
  assert.ok(/isError:\s*true/.test(src), 'MCP denial does not set isError');
});

// ── 4. Denials are auditable ────────────────────────────────────────────────
check('denials are written to the proof ledger', () => {
  for (const f of REMOTE_SURFACES) {
    const src = decomment(read(f));
    assert.ok(/proof-ledger/.test(src), `${f} does not reference the proof ledger`);
    assert.ok(/tool\.denied/.test(src), `${f} does not record a tool.denied event`);
  }
});
check('proof-ledger exposes the record API the surfaces call', () => {
  const ledger = require(path.join(ROOT, 'lib', 'proof-ledger.js'));
  assert.strictEqual(typeof ledger.record, 'function', 'proof-ledger.record is not a function');
});

// ── 5. Behavioural: fail closed ─────────────────────────────────────────────
const { ToolRuntime } = require(path.join(ROOT, 'lib', 'tool-runtime.js'));

(async () => {
  const rt = new ToolRuntime({ permissionProfile: 'standard' });

  await checkAsync('unknown tool fails closed', async () => {
    const r = await rt.invoke('definitely_not_a_real_tool_' + Date.now(), {});
    assert.strictEqual(r.ok, false, 'unknown tool did not fail');
    assert.ok(r.code, 'failure carries no machine code');
  });

  await checkAsync('malformed arguments fail closed with a machine code', async () => {
    // A tool that exists, called with arguments that cannot satisfy its schema.
    const r = await rt.invoke('read', { notAPath: 12345 });
    assert.strictEqual(r.ok, false, 'malformed arguments were accepted');
    assert.ok(/VALIDATION|SCHEMA|ARGUMENT|DENIED|UNAVAILABLE/i.test(r.code || ''),
      `unexpected code: ${r.code}`);
  });

  await checkAsync('out-of-scope tool is refused by scope, not executed', async () => {
    const scoped = new ToolRuntime({ permissionProfile: 'standard', allowedTools: ['read'] });
    const r = await scoped.invoke('bash', { command: 'echo nope' });
    assert.strictEqual(r.ok, false, 'a tool outside the allowed set executed');
    assert.strictEqual(r.code, 'TOOL_SCOPE_DENIED', `unexpected code: ${r.code}`);
  });

  await checkAsync('a denial never carries a success shape', async () => {
    const scoped = new ToolRuntime({ permissionProfile: 'standard', allowedTools: ['read'] });
    const r = await scoped.invoke('bash', { command: 'echo nope' });
    assert.notStrictEqual(r.ok, true);
    assert.ok(r.error, 'denial carries no reason');
  });

  console.log(`\n${failures ? `P0-B FAILED (${failures})` : 'P0-B PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
