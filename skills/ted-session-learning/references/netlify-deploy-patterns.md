# Netlify Deploy Patterns (tested May 18 2026)

## Prerequisites
- `netlify` CLI installed: `/c/Users/Admin/AppData/Roaming/npm/netlify`
- Ted is authenticated as `weemadscotsman38@gmail.com` on his Netlify account
- No `netlify.toml` needed for static pages — Netlify auto-detects

## Build + Deploy (for projects with npm build steps)
```bash
cd /path/to/project
netlify deploy --dir=dist --prod
```
Netlify runs `npm run build` automatically from package.json scripts.

## Deploy Static Only (no build step) — USE THIS FOR DONATE PAGES
```bash
cd /path/to/project
netlify deploy --no-build --prod
```
The `--no-build` flag skips build command and deploys files directly.

## Create new site (no prior linking)
Netlify auto-creates a new site when running deploy without a linked project:
```
Auto-creating a new project (team: weemadscotsman38’s team)...
Creating new site with random name
```

## Key flags
- `--dir=<folder>` — which folder to deploy
- `--prod` — deploy to production URL (not just draft)
- `--no-build` — skip build step for static sites

## Project structures that work
- Vite builds → `dist/` folder → `netlify deploy --dir=dist --prod`
- Plain HTML → root folder → `netlify deploy --dir=. --no-build --prod`
- Next.js → `.next/` → configure netlify.toml to point there

## Failures encountered
- `netlify.toml` with `command = "hugo"` caused failure on plain HTML repos — remove netlify.toml for static HTML deploys
- Build timeout at 90s — use `--no-build` to skip build step entirely
- Netlify tries to run a build by default — always check if your project needs a build step before deploying

## Example: Deploy Nonna's Kitchen
```bash
cd '/e/god folder/02_ACTIVE_PROJECTS/ai apps  pre builds'
npm install  # first time only
npx vite build  # build the dist folder
netlify deploy --dir=dist --prod  # deploy
```

## Example: Deploy crypto donate page (static HTML)
```bash
cd '/e/god folder/02_ACTIVE_PROJECTS/crypto-donate-page'
netlify deploy --no-build --prod  # no build step needed
```

## Verify deployment
Check draft URL first, then promote to production with `--prod` flag.
Deploy logs: `https://app.netlify.com/projects/{site-name}/deploys`