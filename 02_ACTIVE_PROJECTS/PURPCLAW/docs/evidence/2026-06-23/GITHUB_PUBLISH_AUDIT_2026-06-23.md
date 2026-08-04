# GitHub Publish Audit - 2026-06-23

## Source

- Live project folder: `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW`
- Existing Git root detected from inside PURPCLAW: `E:\god folder`
- Existing parent remote: `https://github.com/weemadscotsman/zamp.git`

The parent Git root contains unrelated projects and is not safe to push as the
PURPCLAW repository.

## Export Candidate

- Export path: `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW_GITHUB_EXPORT_20260623`
- Initial export commit: `3895b26 Initial PURPCLAW source export`
- Current export head after fixes: `9154290 Record publish validation`
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

## Remote Publish Result

GitHub CLI (`gh`) is not installed on this machine, and the available GitHub
connector does not expose repository delete/create operations.

However, normal Git push authentication was available. The clean export was
pushed to:

- `weemadscotsman/purpclaw` branch `main`
- `weemadscotsman/purpclaw` branch `master`

The old `master` branch content was replaced with the clean export using an
explicit `--force-with-lease` against the previously observed remote commit.

Remote `main` and `master` now point at the same PURPCLAW source snapshot.

## Validation

- `npm run docs:check` passed: 73 API routes, 21 page routes, 26 registry services.
- `npm run build` passed.
- Remaining build warning: `lib/system-manifest.js` uses dynamic require through `app/api/registry/route.ts`.
