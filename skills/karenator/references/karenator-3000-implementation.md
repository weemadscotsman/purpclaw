# Karenator 3000 — Next.js Implementation Reference

> **Project:** `the-karenator-3000-pro/` at `C:/Users/Admin/Downloads/the-karenator-3000-pro (2)`
> **Absorbed from:** `entertainment/karenator-3000/SKILL.md` — project-specific detail moved to umbrella `ai-agents/karenator`

## Project Structure

```
the-karenator-3000-pro/
├── app/
│   ├── api/
│   │   ├── generate-text/route.ts    # MiniMax text gen
│   │   ├── minimax/route.ts          # MiniMax video (unused for music)
│   │   ├── minimax-music/route.ts   # DO NOT USE for music
│   │   ├── minimax-tts/route.ts     # TTS audio
│   │   ├── sonauto/route.ts         # Music generation ONLY
│   │   └── sonauto/generate/route.ts
│   ├── page.tsx                      # Entry point → <Karenator />
│   └── layout.tsx
├── components/
│   └── Karenator.tsx                 # Main 2900-line client component
├── next.config.ts
└── package.json
```

## 4-Step Wizard Flow

**STEP 1: THE GRIEVANCE** → textarea (complaint) + severity (1-5) + "NEXT: ACQUIRE TARGET"

**STEP 2: TARGET ACQUISITION** → business name + MANAGER ALGORITHM™ toggle + "FIND THEIR DETAILS"

**STEP 3: GENERATE** → tone selector + CC list + generate button

**STEP 4: RESULT** → audio player (or video/TTS)

## Tone Directive (from umbrella — critical reminder)

The complaint must be:
- **DEADPAN SERIOUS** — plays completely straight like a real complaint
- **British sitcom energy** — The Thick of It, Office, Parks & Rec style
- **NO irony markers** — no winking, no breaking character
- **Classic Karen mega-moaner** — entitlement, shock, disbelief

### Phrases to Include Naturally
- "I cannot BELIEVE the audacity"
- "I was frankly quite alarmed"
- "One might reasonably expect better"
- "This is absolutely remarkable"
- "I'm sure you did your best" (passive aggressive)
- "Bless your heart"
- "I'll keep you in my prayers"

### Prompt Template (WORKING VERSION)
```
You are writing a parody complaint letter that sounds COMPLETELY SERIOUS AND PROFESSIONAL but is actually HILARIOUSLY ABSURD. Think "The Thick of It" or "Office" style British comedy - deadpan delivery of completely unhinged grievances.

Write the complaint as if it's 100% real and legitimate. NO irony markers, NO winking, NO breaking character. The humour comes from the ABSURDITY of the grievance played completely straight.

GREVENCE: "${transcript}"

KEY TONE - THIS IS CRITICAL:
- Tongue-in-cheek, cheeky, sarcastic but played 100% straight
- Classic "Karen" mega-moaner energy: entitlement, shock, disbelief
- Like a British sitcom character filing a real complaint

OUTPUT FORMAT - STRICT:
TIMER: [complaint duration based on severity]
COMPLAINT:
[the letter]
```

## Known Build Errors & Fixes

### Missing backtick on template string
Build fails with "Expected a semicolon" on a template string — check prompt template literal has closing backtick.

### Nested try blocks without outer catch
Build fails with "'catch' or 'finally' expected" at EOF. The `generateMusic` function had `try { try { ... } catch {...} };` — missing outer catch. Fix: move early-return guard BEFORE the `try {`.

### AI narrating internal thoughts in output
Cause: prompt told AI to "calculate" or "analyze" as separate tasks. Fix: write prompt as direct instruction, not step-by-step with Task 1/Task 2.

## Puppeteer Automation Script

Located at: `C:\Users\Admin\AppData\Local\hermes\scripts\karenator_demo.js`

Uses puppeteer-core (NOT puppeteer — it tries to redownload Chrome) with existing Chrome installation:
```javascript
const puppeteer = require('C:/Users/Admin/AppData/Roaming/npm/node_modules/puppeteer-core');
// executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
```

## Deployment Notes

- Server runs on port 3000
- Use `node .next/standalone/server.js` for standalone mode (not `next start`)
- OpenRouter API key in `.env.local`
- Sonauto key passed via frontend localStorage → header `x-sonauto-key`