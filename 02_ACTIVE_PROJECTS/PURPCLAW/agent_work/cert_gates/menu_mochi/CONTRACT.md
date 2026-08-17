# MENU MOCHI CERT GATE — CONTRACT

**Cert ID:** `agent_work/cert_gates/menu_mochi/`
**Date opened:** 2026-08-17
**Slice:** `apps/extensions/menu-mochi/` — Chrome/Edge extension rewrite from `legacy/reintegrate-2026-08-17/mochi/menu_mochi_extension/`
**Status:** open

---

## What this cert certifies

The MenuMochi Chrome extension (a Tamagotchi-style browser pet, manifest v3, MV3 service worker, 12 source files + 4 icons) has been moved to its right home in the monorepo. The co-located marketing toolkit (8 files) moved with it. The structure is intact:

1. **Manifest valid** — `manifest.json` parses, manifest_version=3, name + version present
2. **All manifest-referenced files exist** at the new location
3. **All four icon sizes present** (16/32/48/128 PNG) with sane file sizes
4. **popup.html wires popup.css + popup.js**
5. **background.js** has the full state machine: `chrome.runtime.onInstalled`, `chrome.alarms`, `chrome.tabs.onActivated`, `applyDecay`, `calculateMood`, `DEFAULT_STATE`
6. **content.js** is present and MenuMochi-themed
7. **Marketing toolkit** (hook_bank.csv, strategy.json, config.template.json, campaign_posts.md, posts_6_slide_scripts.json, competitor-research.template.json) all landed
8. **strategy.json** is valid JSON with the right keys
9. **hook_bank.csv** is well-formed (11 lines, header correct)
10. **Legacy `menu_mochi*` subdirs are empty** (no real files left behind)

## What this cert does NOT certify (honest scope)

- **The extension is not loaded in a real browser.** This is a structure cert. Runtime behaviour (state machine transitions, popup interactions, content script execution) requires loading the unpacked extension in Chrome/Edge.
- **Marketing toolkit is not validated for production use.** The hooks/strategy/config templates are reference data; the cert asserts they exist and parse, not that they're SEO-optimised or current.
- **The pet sprites at the root of `legacy/reintegrate-2026-08-17/mochi/` (mochi.js, mochi-sprites.js, mochi.json, PNG sprites) are NOT moved.** They're duplicates of the live pet at `packages/studio/presence/mochi/`. Eddie can delete the legacy copies manually when ready.

## Run

```
python tests/menu_mochi/test_extension.py
```

From project root. 0 failures required for PASS.

## Assertion criteria (10/10 required for PASS)

| # | Assertion | Why it matters |
|---|---|---|
| T01 | manifest.json present, valid JSON, manifest_version=3 | Manifest is the contract with the browser |
| T02 | every manifest reference (popup, background, content, icons) resolves | No broken links |
| T03 | all 4 icon sizes present and >100 bytes | Visual assets are real |
| T04 | popup.html wires popup.css + popup.js | Popup actually works |
| T05 | background.js has the state machine (onInstalled, alarms, tabs, decay, mood) | The engine is intact |
| T06 | content.js is MenuMochi-themed | Content script is the right thing |
| T07 | marketing/ has all 6 required files | Marketing toolkit landed |
| T08 | strategy.json is valid JSON with the right keys | Marketing data is parseable |
| T09 | hook_bank.csv has 11+ lines, header correct | Marketing data is well-formed |
| T10 | legacy menu_mochi* subdirs are empty (marker only) | No files left behind |

## Cert verdict format

`agent_work/cert_gates/menu_mochi/result.json`:
```json
{
  "schema": "purpclaw.cert-gate.menu-mochi.v1",
  "verdict": "PASS",
  "tests_pass": 10,
  "tests_fail": 0,
  "rewrite_origin": "legacy/reintegrate-2026-08-17/mochi/menu_mochi_extension",
  "rewrite_target": "apps/extensions/menu-mochi",
  "parity_impact": "Chrome/Edge browser-extension product now lives in apps/ alongside cli/desktop/web; not a parity gap (extension is PurpClaw-agnostic) but a real product rewrite"
}
```
