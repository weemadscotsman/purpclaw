# MenuMochi Browser Extension

A nostalgic Tamagotchi-style browser pet that follows the active tab.
Chrome/Edge extension, manifest v3, MV3 service worker.

## Files

- manifest.json \u2014 extension manifest, v3
- ackground.js \u2014 service worker, state machine, decay, tab tracking
- content.js \u2014 content script (runs on all URLs at document_idle)
- popup.html / popup.css / popup.js \u2014 toolbar popup UI
- icons/icon{16,32,48,128}.png \u2014 extension icons
- marketing/ \u2014 co-located social media campaign toolkit (hooks, posts, strategy)

## Install

1. Open chrome://extensions (or edge://extensions).
2. Enable Developer Mode.
3. Click "Load unpacked".
4. Select this directory.

## Why this lives here

pps/ is the home for end-user-facing apps in the PurpClaw monorepo
(pps/cli, pps/desktop, pps/web, pps/companion-chorus).
Browser extensions are end-user apps, so pps/extensions/menu-mochi/
is the right home. Marketing toolkit co-located for one-stop access.

Originally restored from legacy/reintegrate-2026-08-17/mochi/menu_mochi_extension/
on 2026-08-17. Cert gate at gent_work/cert_gates/menu_mochi/.