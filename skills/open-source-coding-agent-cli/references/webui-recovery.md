# WebUI Recovery — 6-Step Recipe

## When the dashboard shows white-page-black-text, no dark mode, no animations

This happens when external agents (Gemini/Antigravity tasks) run `npm run build` (production)
concurrently with `next dev`, corrupting `.next/` cache and appending garbage to CSS files.

## Step-by-step recovery

```bash
# 1. Revert corrupted source files
cd "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW"
git checkout -- app/globals.css app/page.tsx \
  app/hooks/useAgentEvents.ts \
  app/components/DivisionActivityPanel.tsx

# 2. Find and kill zombie process holding port 3000
netstat -ano | grep :3000 | grep LISTENING
# Note the PID in the last column, then:
taskkill //PID <pid> //F

# 3. Delete the pm2 process entry
pm2 delete purpclaw-nextjs

# 4. Wipe the corrupted .next cache
rm -rf .next

# 5. Restart Next.js in dev mode
pm2 start ecosystem.config.js --only purpclaw-nextjs

# 6. Wait 15-30s for first compile, then verify
sleep 20
curl -s http://localhost:3000 | grep -c 'class="dark"'
# Must return >0 — confirms dark mode CSS loaded
```

## Verification checklist

- [ ] `:3000` returns 200
- [ ] HTML contains `class="dark"` (dark mode active)
- [ ] Google Fonts (Inter, JetBrains Mono) loading
- [ ] `bg-black` class present (CRT dark theme)
- [ ] ENTHEA at `/enthea.html` returns 200
- [ ] Mission page at `/mission` returns 200
- [ ] Mochi page at `/mochi` returns 200
- [ ] API at `:7780/api/health` returns 200

## Root cause

`npm run build` (production Next.js build) outputs to `.next/` — the same directory
`next dev` uses. Running both concurrently corrupts the CSS pipeline. `.next` is a cache,
not sacred scripture. Treat it as disposable.

## Prevention

- Never run `npm run build` while `next dev` is running
- PM2 should only run `next dev -p 3000`, not `next start`
- If you need a production build, stop the dev server first
