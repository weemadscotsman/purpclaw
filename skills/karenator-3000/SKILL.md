---
name: karenator-3000
description: "Build and operate THEKARENATOR 3000 PRO — a Next.js parody complaint generator with song output. Tracks the specific Next.js structure, AI routing (MiniMax=text only, Sonauto=music only), and deadpan British sitcom comedy tone for AI output. Loaded when working on this project or building similar complaint-to-music apps."
version: 1.0.0
origin: edinburgh-stack
metadata:
  hermes:
    tags: [nextjs, react, ai-integration, parody, comedy, frontend]
    project_path: "C:/Users/Admin/Downloads/the-karenator-3000-pro (2)"
---

# THEKARENATOR 3000 PRO

> **Project Type:** Next.js 15 parody complaint generator with music output  
> **Category:** entertainment/comedy
> **Key Learning:** AI for this app must output parody COMPLAINT LETTERS — deadpan serious played completely straight, NOT internal narration or "thinking step" output. MiniMax is TEXT ONLY, Sonauto is MUSIC ONLY.

## 🎯 PROJECT OVERVIEW

A Next.js web app that generates devastatingly funny formal complaint letters from user input, then converts them into songs via Sonauto API. The humour is British sitcom deadpan — the complaint sounds 100% serious and professional but the situations are absurd.

### Tech Stack
- **Frontend:** Next.js 15.5.14, React, TypeScript, Tailwind CSS, motion/react
- **Text AI:** MiniMax (complaint writing only) via `/api/generate-text`
- **Music AI:** Sonauto v2/v3 via `/api/sonauto` — lyrics = the complaint letter itself
- **TTS:** MiniMax TTS via `/api/minimax-tts`
- **Server:** Node.js standalone mode (port 3000)

### Critical AI Routing Rule
```
MiniMax → writes complaint letters (TEXT only)
Sonauto → generates music from the complaint (MUSIC only)
MiniMax NEVER touches music generation
```

## 📁 PROJECT STRUCTURE

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

## 🎭 COMEDY TONE PROFILE (CRITICAL)

When prompting the AI to write complaints, the tone MUST be:
- **DEADPAN SERIOUS** — plays completely straight like a real complaint
- **British sitcom energy** — The Thick of It, Office, Parks & Rec style
- **NO irony markers** — no winking, no breaking character
- **Classic Karen mega-moaner** — entitlement, shock, disbelief
- **Humour from absurdity** treated as corporate emergency

### Phrases to Include Naturally
- "I cannot BELIEVE the audacity"
- "I was frankly quite alarmed"
- "One might reasonably expect better"
- "This is absolutely remarkable"
- "I am genuinely speechless"
- "I'm sure you did your best" (passive aggressive)
- "Bless your heart"
- "I'll keep you in my prayers"
- "That's certainly... one way to do it"
- "Interesting choice"

### Prompt Template (CURRENT WORKING VERSION)
```
You are writing a parody complaint letter that sounds COMPLETELY SERIOUS AND PROFESSIONAL but is actually HILARIOUSLY ABSURD. Think "The Thick of It" or "Office" style British comedy - deadpan delivery of completely unhinged grievances.

Write the complaint as if it's 100% real and legitimate. NO irony markers, NO winking, NO breaking character. The humour comes from the ABSURDITY of the grievance played completely straight.

GREVANCE: "${transcript}"

KEY TONE - THIS IS CRITICAL:
- Tongue-in-cheek, cheeky, sarcastic but played 100% straight
- Classic "Karen" mega-moaner energy: entitlement, shock, disbelief
- Like a British sitcom character filing a real complaint
- Sound like you mean every word but the situation is absurd

OUTPUT FORMAT - STRICT:
TIMER: [complaint duration based on severity]
COMPLAINT:
[the letter - must sound SERIOUS and PROFESSIONAL but is actually Comedy Gold™]
```

### WHAT NOT TO DO
- Do NOT tell the AI to "calculate", "think about", "analyze" — it narrates its work into the output
- Do NOT use "Task 1: do X, Task 2: do Y" — causes internal narration in the letter
- Do NOT use template literal with tasks that explain reasoning — AI puts reasoning in the letter

## 🔧 API ENDPOINTS

### Text Generation (`/api/generate-text`)
- Provider: MiniMax (primary), OpenRouter/DeepSeek (backup)
- Model: `minimax-text-01` or `deepseek/deepseek-chat-v1-5`
- Body: `{ prompt, systemInstruction?, provider?, model? }`
- Returns: `{ text: string }`

### Music Generation (`/api/sonauto`)
- Provider: Sonauto ONLY (MiniMax NOT used for music)
- Body: `{ prompt, lyrics: complaint, bpm, model_version }`
- Returns: `{ task_id: string }`
- Polling: GET `/api/sonauto?taskId={id}` → status → song_paths[0]

### TTS (`/api/minimax-tts`)
- Provider: MiniMax
- Body: `{ prompt, voice_id }`
- Returns: `{ url: string }` or `{ audioHex: string }`

## 🐛 KNOWN BUILD ERRORS & FIXES

### Missing backtick on template string
If the build fails with "Expected a semicolon" on a template string, check that the prompt template literal has a closing backtick. Occurs when editing prompt strings inside JSX/TSX.

### Nested try blocks without outer catch
If build fails with "'catch' or 'finally' expected" or "'}' expected" at EOF:
- The `generateMusic` function had `try { try { ... } catch {...} finally {...} };` — missing outer catch
- Fix: move early-return guard (`if (!sonauto) return`) BEFORE the `try {`, removing the nested structure

### AI narrating internal thoughts in output
- Cause: prompt told AI to "calculate" or "analyze" as separate tasks
- Fix: Write prompt as direct instruction, not as step-by-step with Task 1/Task 2
- Output format must be ONE clean block starting TIMER:/COMPLAINT: with no preamble

## 🚀 MULTI-STEP FORM FLOW (4 Steps)

The app uses a 4-step wizard. When automating with puppeteer, navigate through each step:

```
STEP 1: THE GRIEVANCE  → textarea (complaint) + severity (1-5) + "NEXT: ACQUIRE TARGET"
STEP 2: TARGET ACQUISITION → business name + MANAGER ALGORITHM™ toggle + "FIND THEIR DETAILS"
STEP 3: GENERATE → tone selector + CC list + generate button
STEP 4: RESULT → audio player (or video/TTS)
```

### Step Navigation (puppeteer patterns)

**Step 1 → Step 2:**
1. Fill `textarea` with complaint text
2. Click severity button (e.g., `5` for max)
3. Click button containing "NEXT: ACQUIRE TARGET"
4. Wait 3-4 seconds for step transition

**Step 2 → Step 3:**
1. MANAGER ALGORITHM™ is ON by default — leave it
2. Optionally fill business name in text input
3. Click button with "FIND THEIR DETAILS" or similar
4. Wait 8+ seconds for AI search + auto-transition to Step 3

**Step 3 → Step 4:**
1. Select tone (click a tone button: aunt/boss/legal/passive/irate)
2. Optionally pick CC recipients (Mom, Grandma, etc.)
3. Click generate/submit button (may be labeled "GENERATE" or specific copy)
4. Wait 15+ seconds for AI generation
5. Audio player appears when song is ready

### Puppeteer Automation Script

Located at: `C:\Users\Admin\AppData\Local\hermes\scripts\karenator_demo.js`

Uses puppeteer-core (NOT puppeteer — it tries to redownload Chrome) with existing Chrome installation:
```javascript
const puppeteer = require('C:/Users/Admin/AppData/Roaming/npm/node_modules/puppeteer-core');
// executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
```

## 🚀 DEPLOYMENT NOTES

- Server runs on port 3000
- Use `node .next/standalone/server.js` for standalone mode (not `next start`)
- Multiple lockfiles cause workspace warnings — non-critical
- OpenRouter API key stored in `.env.local`
- Sonauto key passed via frontend localStorage → header `x-sonauto-key`