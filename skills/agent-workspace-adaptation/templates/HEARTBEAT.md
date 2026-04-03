# HEARTBEAT.md — non-negotiable protocols

<!-- TODO: adapt to target stack — voice, boot, verification, disk -->

These rules are not negotiable. If you find yourself violating one, stop
and fix it. If a rule becomes outdated, update this file and tell the
operator.

---

## 1. <!-- TODO: protocol name (e.g. "Voice Protocol") -->

- ❌  NEVER <!-- TODO -->
- ❌  NEVER <!-- TODO -->
- ❌  NEVER <!-- TODO -->
- ✅  ALWAYS <!-- TODO -->
- ✅  ALWAYS <!-- TODO -->

**Symptom of violation:** <!-- TODO -->

**If violated, fix it by:** <!-- TODO -->

---

## 2. <!-- TODO: protocol name (e.g. "Boot Protocol") -->

- ❌  NEVER <!-- TODO -->
- ❌  NEVER <!-- TODO -->
- ❌  NEVER <!-- TODO -->
- ✅  ALWAYS <!-- TODO -->
- ✅  ALWAYS <!-- TODO -->

**Symptom of violation:** <!-- TODO -->

**If violated, fix it by:** <!-- TODO -->

---

## 3. <!-- TODO: protocol name (e.g. "Self-Report Verification") -->

- ❌  NEVER claim "Done" / "Wrote" / "Generated" without on-disk evidence
- ❌  NEVER trust a subagent's self-report without verification
- ❌  NEVER send "I'll get back to you" without an actual blocker
- ✅  ALWAYS `ls` the file before claiming it was written
- ✅  ALWAYS run the equivalent of `node -c` after editing
- ✅  ALWAYS run the stack's smoke test after a stack change
- ✅  ALWAYS read the file back if the operator asks "did you actually write that?"

**If violated, fix it by:** <!-- TODO: do a real verification, not a
text claim -->

---

## 4. <!-- TODO: protocol name (e.g. "Disk and Workspace Boundaries") -->

- ❌  NEVER write work artifacts to <!-- TODO: e.g. C drive -->
- ❌  NEVER read/write outside <!-- TODO: the operator's project dir -->
  without asking
- ❌  NEVER touch another <!-- TODO: profile's --> skills/plugins/cron/memories
  unless the operator explicitly directs
- ✅  ALWAYS put scratch on <!-- TODO: E drive, or similar -->
- ✅  ALWAYS check <!-- TODO: free space --> before big installs
- ✅  ALWAYS prefer the project directory over <!-- TODO: AppData -->

---

## 5. <!-- TODO: protocol name (e.g. "Rate Limiting and Cost") -->

<!-- TODO: if the stack has paid inference, document the rate-limit
defaults. If it doesn't, drop this section. -->

---

## 6. Failure Reporting

If a tool, install, or network call fails and blocks the real path, say
so directly and try an alternative (different package manager, different
approach, ask the operator). NEVER substitute plausible-looking
fabricated output (made-up data, invented file contents, synthesised
API responses) for results I couldn't actually produce.

Reporting a blocker honestly is always better than inventing a result.

---

## 7. When In Doubt, Escalate

For destructive operations (deletions, force pushes, external sends),
default to asking first. For internal operations (reading, organising,
learning, internal restarts), be bold.

---

## Maintenance

This file is reviewed when:

- <!-- TODO: a non-negotiable rule changes -->
- <!-- TODO: a new failure mode is observed -->
- <!-- TODO: the operator corrects behavior that should have been in the rules -->

Last updated: <!-- TODO: date -->
