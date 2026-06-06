# Vendored from PVX_BLOCKCHAIN

> Original Thringlet sources copied verbatim from
> `E:/god folder/PVX_BLOCKCHAIN/` as a reference / migration backup.
>
> **These files are NOT imported or executed by PURPCLAW.**
> They exist purely so the canonical AI blueprint travels WITH PURPCLAW
> if the pvx project is moved, renamed, or deleted.

## What lives here

| File | Source path in pvx | Purpose |
|------|--------------------|---------|
| `thringlet.ts` | `client/src/lib/thringlet.ts` | Core `Thringlet` + `ThringletManager` class (TS, browser/localStorage) |
| `thringlet-registry.ts` | `client/src/data/thringlet-registry.ts` | Original archetype registry (Vexel, Chrona, …) |
| `use-thringlet-personality.ts` | `client/src/hooks/use-thringlet-personality.ts` | React hook for personality interaction |
| `ThringletsPage.tsx` | `client/src/pages/ThringletsPage.tsx` | React page — colony view |
| `ThringletTerminal.tsx` | `client/src/pages/ThringletTerminal.tsx` | React page — terminal interaction |
| `thringlet-routes.ts` | `server/routes/thringlet.ts` | Express router mounted at `/api/thringlet/*` |
| `thringlet-service.ts` | `server/services/thringlet.ts` | Server-side emotion engine (4-axis joy/fear/trust/surprise) |
| `thringletController.ts` | `server/controllers/thringletController.ts` | HTTP handlers wiring router → service |
| `thringletDao.ts` | `server/database/thringletDao.ts` | DB access layer |
| `thringlet-storage.ts` | `server/storage/thringlet-storage.ts` | Storage abstraction |
| `thringlet-data.seed.json` | `data/thringlet-data.json` | Seed colony (Nebula etc) |
| `thringlet_fossil_record.md` | `thringlet_fossil_record.md` | Canonical lore doc |

## What PURPCLAW actually uses

The native, blockchain-stripped port lives one directory up:

- `lib/thringlets/engine.js`     — `Thringlet` + `ThringletColony` (vanilla JS, file persistence)
- `lib/thringlets/archetypes.js` — clean archetype registry (no wallet fields)
- `lib/thringlets/storage.js`    — JSON-file persistence with optional State Store mirror

Nothing in PURPCLAW `require()`s anything from this `_vendor-from-pvx/` folder.

## If you want to port more (later)

- React `ThringletsPage` / `ThringletTerminal` could become the `Thringlets` tab in
  Mission Control — they'd need rewiring from the pvx React Query setup to PURPCLAW's
  `data-hooks.js` pattern.
- The 4-axis emotion engine in `thringlet-service.ts` could replace the simpler
  single-axis emotion in `engine.js` if richer state is wanted.
