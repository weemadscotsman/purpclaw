# PURPCLAW Agent Loop Implementation Notes

## What was built (2026-05-29)

```
lib/agent-session.js      — session manager (createSession, startMission, trackFile, gitStatus)
lib/agent-loop.js        — text-mode agent loop: INSPECT→PLAN→ACT→VERIFY→REPORT
lib/agent-tools-file.js  — file tools: readFile, writeFile, patchFile, globFiles, grepFiles, runBash
purpclaw.js              — `run "mission"` and `agent` REPL commands
```

## Key problems solved

1. **MiniMax tool_calls fail (error 2013)**: MiniMax API doesn't track `tool_call_id` across request/response cycles. Solution: TEXT MODE — model outputs `BASH: \`...\``, harness parses + executes, results fed back as user messages.

2. **Command parser needed multiple formats**: 
   - `BASH: \`command\`` — backtick with prefix
   - `\`command\`` — bare backtick  
   - `BASH: command` — no backticks (greedy)
   - `READ:`, `GLOB:`, `GREP:` — structured commands

3. **Write verification**: bash echo redirects (`> file`) succeed even if file isn't written. Added explicit file existence check after any write command.

4. **No external deps**: Used native Node.js `https` module instead of axios.

## Command to test
```bash
cd E:/god\\ folder/02_ACTIVE_PROJECTS/PURPCLAW
node purpclaw.js run "show git status"
```

## MiniMax API key location
```
.env has: LLM_API_KEY=<actual_key>
NOT: MINIMAX_API_KEY (that's a different key)
```

## System prompt key lines
```
OUTPUT COMMANDS on their own lines.
Available: BASH: `command`, READ: path, GLOB: pattern
When complete, output:
## What Changed
[changes]
## What Remains
[follow-ups]
```

## Completion detection
```javascript
function isComplete(text) {
  const lower = text.toLowerCase();
  return lower.includes('## what changed') ||
         lower.includes('mission complete') ||
         lower.includes('done');
}
```