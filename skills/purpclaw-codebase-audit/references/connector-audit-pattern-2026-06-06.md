# Connector Audit Pattern — 2026-06-06

## The triple-config check

Every PURPCLAW service must be registered in ALL THREE of these to be fully visible:

| Config | Purpose |
|---|---|
| `ecosystem.config.js` | PM2 process definition — without this, the service won't boot |
| `service_registry.js` | CLI/API service discovery — without this, `purpclaw status` and safe-start can't find it |
| `app/hooks/useMissionData.ts` | WebUI SERVICE_CONFIG — without this, the dashboard shows it as "offline" or missing |

A service missing from any one is invisible to that surface. Always fix by adding to all three.

## Port/split-brain detection

When two services disagree on which port something lives on:

1. Read the **client** config: `lib/*-client.js` or the relevant wrapper
2. Read the **server** config: `ecosystem.config.js` (PM2 args/ports)
3. Read the **WebUI** config: `app/hooks/useMissionData.ts` SERVICE_CONFIG
4. Read the **wiring guide**: any `WIRING_GUIDE.md` in the UI folder
5. Test with `curl`: hit the actual endpoint and compare response with expectations

## Route path mismatch detection

When a client calls a route that doesn't exist on the server:

1. Find the client's HTTP call: grep for `fetch(`, `http.get(`, `http.request(` in the client file
2. Find the server's route handler: grep for `path ===`, `pathname.match(`, `url.pathname` in the server file
3. Compare the two and fix whichever is wrong

## Known pattern: the state check

For `POST /state/set` → 404:
- Client sends: `POST /state/set` with body `{ key, value, ttl }`
- Server expects: `PUT /state/:namespace/:key` with body `{ key, value, ttl }`
- Fix: Add `POST /state/set` compatibility shim to `unified_state.js`, OR fix the client to use `PUT`

## The three deadliest assumptions

1. "grep shows 0 references = dead" — False. Dynamic requires, runtime registrations, config-driven loading, and reverse proxies won't appear in grep results.
2. "folder name tells me what it is" — False. `disabled-commands` contained empty directories. `accuracy_fish` was a wired claim extractor. `NEW MASTER UI` was the secondary theme.
3. "no imports = unused" — False. HTML files, configs consumed at runtime, SSH-invoked scripts — none show up in import searches.

## References from the big cleanup (2026-06-06)

See `full-cleanup-2026-06-06.md` for the complete folder-by-folder audit of everything in the PURPCLAW root.
