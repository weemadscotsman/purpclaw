# The Don't-Rebuild Rule

Eddie (2026-06-06): *"reember do not re invent wheels again its already msotly build chdeck b4 building motrre shite"*

## The rule
Before ANY code change, modification, or "fix" to the PurpClaw stack:

1. **CHECK if it already exists.** Use `ls`, `grep`, `find`, `file`, `curl`, or OmniCode.
2. **Verify the current state.** `curl -I`, `pm2 list`, `netstat -ano | grep :PORT`.
3. **Find the real problem.** The user says "UI broken" → backend is usually offline, not CSS.

## What NOT to do
- Do NOT delete `.next/` — most dashboard issues are port/zombie problems, not cache corruption
- Do NOT rebuild NextJS from scratch when a simple `pm2 restart` would work
- Do NOT rewrite Mochi with emoji — the real sprite engine exists at `lib/mochi-sprites.js` (18 species, 3 anim frames)
- Do NOT create new tools when existing ones already do the job
- Do NOT rebuild the face engine — `generateFace()`, `moodToFace()`, `voiceFace()` all exist in `lib/mochi-sprites.js`

## Route confusion trap
The homepage (`:3000/`) is a stripped-down agent grid (DivisionActivityPanel). The real dashboard with ALL tabs, ENTHEA backdrop, Abliterator, and full MissionControl is at `:3000/mission` (2725 lines). Check BOTH before concluding anything is broken.

## Specific incidents (2026-06-06)
1. Deleted `.next` repeatedly → broke NextJS dev server → took hours to recover
2. Rewrote Mochi TUI with emoji → Eddie: "the mochi still is just fucing pulling random faces" → the real sprite engine was already built
3. Tried to add face engine to mochi page → broke NextJS import resolution → had to revert
4. Nuked dashboard thinking it was broken → it was at `/mission` not `/`

## The fix pattern
When user reports an issue:
1. `curl` the endpoint first
2. Check PM2 process status
3. Check port bindings
4. Read the relevant source file BEFORE editing
5. Only THEN make changes — and make minimal changes
