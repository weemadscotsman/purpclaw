# Big Boss Command Set (`/bigboss`)

Meta-layer slash commands for full stack control from the chat. 14 subcommands in `lib/commands/bigboss.js`, wired into `lib/commands/ask.js` as the `/bigboss` slash command.

## Subcommands

| command | API/runtime | implementation |
|---|---|---|
| `status` | PM2 | `execSafe(node, [pm2_script, 'list'])` |
| `heal` | PM2 | restart errored/stopped services |
| `agents list` | filesystem | `fs.readdirSync` skills/ dirs, parse AGENT.md for division |
| `agents spawn <name> <task>` | :7780 | `POST /api/agents/spawn` |
| `agents kill <name>` | :7780 | `POST /api/agents/kill` |
| `swarm <goal>` | :7780 | `POST /api/chat/swarm` |
| `tools list` | in-process | `TOOLS.list()` from lib/tools |
| `tools run <name> <json>` | in-process | `TOOLS.invoke(name, args)` |
| `memory recall <query>` | :7880 | `GET /api/memory/search` |
| `memory ingest <text>` | :7880 | `POST /api/memory/ingest` |
| `diagnose` | :7786 | `GET /api/diagnostics/run` |
| `evolve` | :7780 | `POST /api/kernel/jobs` (queues ratchet tick) |
| `voice speak <text>` | local | `execSafe(python, [kokoro_tts, text])` |
| `voice listen <sec>` | :7896 | `POST /api/stt/transcribe` |
| `vision capture` | :7889 | `POST /api/vision/capture` |
| `jobs list / retry` | :7780 | `GET/POST /api/kernel/jobs` |

## Windows PM2 path resolution

`.cmd` files need `shell:true` which is security-hostile. Instead, use `node + script`:
```js
const PM2 = { node: 'node', script: 'pm2' }; // or full paths on Windows
execSafe(PM2.node, [PM2.script, 'list'], { timeoutMs: 8000, windowsHide: true });
```

## Wiring into slash commands

```js
// In lib/commands/ask.js SLASH_COMMANDS:
'/bigboss': { run: async (args, ctx) => {
  const bb = require('../commands/bigboss');
  const [cmd, ...rest] = args.trim().split(/\s+/);
  return await bb.run(cmd || 'help', rest.join(' '));
}}
```

All subcommands return strings that display in the chat. The `ctx` carries session state (provider, model, history, _tokens).