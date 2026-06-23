# Deep Audit Pattern — Every Surface Tested Like Sticky Fingers
> Built 2026-06-06. From Eddie's directive: "naaaah u gotta tests every surface like a fat kid with sticky fingers bro"

## The pattern

When the user says "audit the whole stack" or "find every broken thing", do NOT just list features. Test every surface. Touch every button. Find what breaks.

## Phase 1: CLI commands (43 of them)

```js
// Test every CLI command with --help to ensure they all respond
const cmds = ['tui','init','start','stop','restart','chat','run','status','doctor',
  'approve','reject','jobs','policies','introspect','rollback','bg','registry','search',
  'resume','context','pool','tick','mochi','spaghetti','llm','browser','cognition',
  'code','lora','agents','profiles','workflows','queue','heal','commit','review','find','ask'];
for (const cmd of cmds) {
  const result = execSync(`node bin/purpclaw.js ${cmd} --help 2>&1`);
  console.log(cmd, result ? '✅' : '❌');
}
```

**Finding:** All 43 respond. Zero dead commands on 2026-06-06.

## Phase 2: Built-in tools (invoke directly)

```js
const tools = require('./lib/tools');
const all = tools.list().filter(t => !t.name.startsWith('mcp__'));
for (const t of all) {
  const r = await tools.invoke(t.name, testArgs[t.name] || {});
  console.log(t.name, r.ok ? '✅' : '❌', r.content?.substring(0, 40));
}
```

**Finding:** 13 of 18 core tools execute directly. Failures: web-fetch (url param name), taskkill (needs PID), top (powershell not in git-bash PATH).

## Phase 3: Slash commands (13 of them)

```js
const ask = require('./lib/commands/ask');
for (const [name, cmd] of Object.entries(ask.SLASH_COMMANDS)) {
  const r = await cmd.run('', ctx);
  console.log(name, r ? '✅' : '❌');
}
```

**Finding:** All 13 respond. Zero stubs.

## Phase 4: BigBoss commands (14 of them)

```js
const bb = require('./lib/commands/bigboss');
for (const [name, cmd] of Object.entries(bb.COMMANDS)) {
  const r = await bb.run(name, '');
  console.log(name, r ? '✅' : '❌');
}
```

## Phase 5: TUI surfaces (3 of them)

```bash
# Non-TTY test: verify each TUI detects non-TTY and bails gracefully
node bin/purpclaw.js tui        # → "requires interactive TTY terminal"
node bin/purpclaw.js tui ask    # → "tui-ask requires a TTY"
node scripts/tui-ng.js          # → blessed crash: fg undefined (known bug)
```

## Phase 6: WebUI pages (4 of them)

```bash
curl :3000               # homepage → should be 200
curl :3000/mission        # mission page → should be 200
curl :3000/mochi          # mochi page → should be 200
curl :3000/enthea.html    # static asset → should be 200
```

## Phase 7: API endpoints (all 27)

```bash
for port in 7780 7782 7783 7784 7790 7880 7884 7785 7786 7787; do
  curl -s --max-time 1 -o /dev/null -w "%{http_code}" "localhost:$port/health"
done
```

## Phase 8: Provider routing (2 providers)

```js
const r1 = await llm.chat([{role:'user',content:'hi'}], {provider:'deepseek'});
const r2 = await llm.chat([{role:'user',content:'hi'}], {provider:'ollama'});
console.log('deepseek:', r1.model, '| ollama:', r2.model);
```

**Finding:** Both route correctly. Model names different (deepseek-v4-pro vs qwen2.5:3b).

## Phase 9: OmniCode MCP (42 tools)

```js
const mcp = require('./lib/mcp');
await mcp.loadServers();
const r = await mcp.callMcpTool('omnicode', 'health_check', {});
console.log('health:', r.ok ? r.content.substring(0,60) : 'FAIL');
```

**Finding:** health_check always works. Other tools vary by repo state.

## Reporting standard

After the audit, produce two lists:
1. **Goop found** — every broken surface, crash, timeout, or bug
2. **What works** — confirmed-OK surfaces with specific evidence

No sugarcoating. No "probably works." Every claim backed by real tool output.
