# Mochi Unified Bridge — One Pet Across All Surfaces

PURPCLAW's Mochi companion shares state across three surfaces:

| surface | how it connects | state source |
|---|---|---|
| Chrome extension (`mochi/menu_mochi_extension/`) | POST /api/mochi on feed/clean/play/ sleep | `agent_work/mochi.json` |
| TUI (`scripts/tui-ng.js`) | GET /api/mochi on startup + poll | `agent_work/mochi.json` |
| CLI (`lib/mochi.js`, `lib/mochi-statusbar.js`) | read/write `agent_work/mochi.json` directly | `agent_work/mochi.json` |
| WebUI (`app/mochi/page.tsx`) | renders from state | `agent_work/mochi.json` |

## State schema (`agent_work/mochi.json`)

```json
{
  "seed": "1",
  "name": "Asher",
  "species": "dragon",
  "eye": "✦",
  "hat": "tinyduck",
  "rarity": "common",
  "shiny": false,
  "tone": "imperious, occasionally tender",
  "verb": "rumbles",
  "hatchedAt": "2026-05-24T21:59:03.353Z",
  "interactions": 7,
  "mood": "loved",
  "bond": 64,
  "lastFedAt": "...",
  "lastPlayedAt": "...",
  "lastCleanedAt": "...",
  "lastSleptAt": "..."
}
```

## API endpoints (in `unified_api.js`)

```
GET  /api/mochi — returns full state JSON (CORS: *)
POST /api/mochi — merges body into state, auto-increments interactions (CORS: *)
```

**GET implementation**: reads `agent_work/mochi.json`. Falls back to default (axolotl, bond 10) if file missing.

**POST implementation**: parses body via `parseBody(req)`, merges with current state, writes back. Fields not in the body are preserved. `interactions` auto-increments.

**CORS**: `Access-Control-Allow-Origin: *` on both GET and POST so Chrome extension can call without preflight issues.

## Integration patterns

### Chrome extension → API
```js
// content.js or background.js
fetch('http://127.0.0.1:7780/api/mochi', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ feed: new Date().toISOString(), bond: 70 })
});
```

### TUI → API (sync on startup)
```js
// scripts/tui-ng.js
async function syncMochiState() {
  const r = await fetch('http://127.0.0.1:7780/api/mochi', {
    signal: AbortSignal.timeout(2000)
  });
  if (r.ok) {
    const m = await r.json();
    if (m.species) mochiSpecies = m.species;
    if (m.hat) mochiHat = m.hat;
    if (m.mood) setMochiMood(m.mood);
  }
}
```

## Species list (18 total, from `lib/mochi-sprites.js`)

duck, goose, blob, cat, dragon, octopus, owl, penguin, turtle, snail,
ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk

## Eye expression → mood mapping

| eye | mood | behavior |
|---|---|---|
| · | idle | static frame |
| ✦ | happy | static |
| ◉ | thinking | 400ms animation cycle |
| ° | sad | static |
| @ | alert | static |
