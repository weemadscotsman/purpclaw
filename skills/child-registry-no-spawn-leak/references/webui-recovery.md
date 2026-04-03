# WebUI Recovery — External Agent CSS Corruption (2026-06-06)

## Root cause
A Gemini/Antigravity background task ran `npm run build` concurrently with `next dev`, corrupting `.next/` and appending 144 lines of garbage to `app/globals.css`. Result: white-page-black-text, no dark mode, no animations, no Mochi.

## Repeatable 6-step recovery

1. **Revert touched source files:**
   `git checkout -- app/globals.css app/page.tsx app/hooks/useAgentEvents.ts app/components/DivisionActivityPanel.tsx`

2. **Kill zombie port holders:**
   `netstat -ano | grep :3000 | grep LISTENING` → note PID
   `taskkill //PID <pid> //F`

3. **Delete pm2 process entry:**
   `pm2 delete purpclaw-nextjs`

4. **Wipe .next cache:**
   `rm -rf .next`

5. **Restart Next.js:**
   `pm2 start ecosystem.config.js --only purpclaw-nextjs`

6. **Wait for compile (15-30s first boot) then verify:**
   `curl :3000 | grep -c "class=\"dark\""` must return >0

## Key lesson

Never run `npm run build` over active Next dev state and trust `.next` like sacred scripture. `.next` is a bin bag with opinions. Treat it as disposable.
