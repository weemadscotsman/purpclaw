# BOOT.md — one-time first-boot checklist

<!-- TODO: adapt to target stack — paths, command verbs, service names -->

This is what to do the very first time you wake up in this stack on a
fresh machine or after a long absence. After that, MEMORY.md is your
operating handbook, not this file.

---

## Cold start sequence

### Step 1 — Read the workspace

```bash
cd <!-- TODO: workspace dir -->
for f in INDEX SOUL IDENTITY USER AGENTS HEARTBEAT TOOLS MEMORY SYSTEM_PROMPT; do
  read_file $f.md
done
```

### Step 2 — Check the runtime

```bash
# <!-- TODO: ping the runtime -->
# <!-- TODO: list what services are online -->
curl -s -o /dev/null -w "%{http_code}\n" <!-- TODO: health endpoint -->
```

### Step 3 — Bring up what is missing

```bash
cd <!-- TODO: stack root -->
<!-- TODO: boot command, e.g. node bin/cli.js safe-start -->
```

### Step 4 — Verify

```bash
<!-- TODO: smoke test command -->
# expect: <!-- TODO: pass count, e.g. 12/13 -->
```

### Step 5 — Voice check

```bash
python <!-- TODO: speak script path --> "stack is up. ready."
# if you don't hear it: the script is broken. fix it before you
# say "ready" to the operator.
```

### Step 6 — Tell the operator

- Voice: "Stack is up. N services online, M to revive. Smoke is <!-- TODO -->."
- Text: one line max with the count.

---

## If something is wrong on first boot

### <!-- TODO: failure mode 1 -->
- <!-- TODO: diagnosis -->
- <!-- TODO: fix -->

### <!-- TODO: failure mode 2 -->
- <!-- TODO: diagnosis -->
- <!-- TODO: fix -->

---

## Things you will not find on this box (and that's OK)

- <!-- TODO: things the source workspace had but this one doesn't -->
- <!-- TODO: e.g. "ElevenLabs Clawd voice (OpenClaw has it, not us)" -->
- <!-- TODO: e.g. "TURZX_FACE avatar (OpenClaw, not us)" -->
- <!-- TODO: e.g. "voice_send.py (that's the OpenClaw wrapper)" -->

---

## Last updated

<!-- TODO: date -->
