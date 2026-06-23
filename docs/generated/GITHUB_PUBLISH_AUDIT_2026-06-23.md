# GitHub Publish Audit - 2026-06-23

## Source

- Live project folder: `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW`
- Existing Git root detected from inside PURPCLAW: `E:\god folder`
- Existing parent remote: `https://github.com/weemadscotsman/zamp.git`

The parent Git root contains unrelated projects and is not safe to push as the
PURPCLAW repository.

## Export Candidate

- Export path: `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW_GITHUB_EXPORT_20260623`
- Export commit: `3895b26 Initial PURPCLAW source export`
- Branch: `main`
- Git pack size: `14.42 MiB`
- Exported files: `3403`

## Excluded From Export

- `.env`, `.env.*` except `.env.example`
- `node_modules`
- `.next`
- build outputs and TypeScript cache files
- logs and runtime temp state
- memory archives
- local uploads and user data
- local model files
- donor/archive/runtime state folders
- `apis for agents`
- cached pocket guide audio
- one-off smoke/runtime output files

## Security Fix

A live Netlify credential reference was found at:

- `skills/autonomous-revenue/references/netlify-credentials-ted.md`

The file was redacted in the source tree and export. The previous token should
be treated as exposed and rotated before publishing publicly.

## GitHub Repositories Checked

- `weemadscotsman/zamp` exists, public, admin access available through connector.
- `weemadscotsman/purpclaw` exists, public, admin access available through connector.

## Blocker

GitHub CLI (`gh`) is not installed on this machine, and the available GitHub
connector does not expose repository delete/create operations. Remote deletion
or full repository replacement is therefore blocked until one of these happens:

- install and authenticate `gh`, then run the publish flow from the export repo;
- manually delete/recreate or empty the target GitHub repo;
- provide another authenticated GitHub remote method.

## Recommended Next Command Path

After confirming the target repo and installing/authenticating `gh`:

```powershell
cd "E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW_GITHUB_EXPORT_20260623"
git remote add origin https://github.com/weemadscotsman/purpclaw.git
git push -u origin main --force-with-lease
```

Only use `--force-with-lease` after confirming the existing remote history can
be replaced.
