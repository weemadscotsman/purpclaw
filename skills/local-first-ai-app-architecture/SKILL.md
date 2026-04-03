---
name: local-first-ai-app-architecture
description: "Local-first app architecture with smart AI routing: no Firebase/cloud auth, localStorage/IndexedDB, OpenRouter for text (free), MiniMax for audio (cheap), Runway/Luma for video (paid best)."
version: 1.0.0
author: GhostLink (Edinburgh builder pattern)
platforms: [windows]
metadata:
  hermes:
    tags: [local-first, ai-routing, openrouter, architecture, ted-preference]
---

# Local-First AI App Architecture

## Core Principle

**Default to local. Add cloud only when user asks.**

Edinburgh builder pattern — every app should work offline-first with no auth walls. Cloud services are opt-in extras, not requirements.

## Why This Exists

Ted (Edward Cannon) explicitly rejected Firebase and cloud auth in favor of local-first: "I'm not sure I need fucking Firebase or any cloud shit." This lesson is durable — it applies to every new app.

## Architecture Layers

### Data Layer → LOCAL
```
localStorage (small config, user session)
IndexedDB (campaigns, leads, calls, assets)
→ NO Firebase, no Firestore, no auth walls
→ Zero network dependency for core features
```

### AI Layer → SMART ROUTING by cost/quality

| Task | Provider | Cost | Why |
|------|----------|------|-----|
| Text/Chat/Research | OpenRouter | **FREE** | 25+ free models (Gemini, DeepSeek, Llama, Nemotron) |
| Image Generation | Gemini (via OpenRouter) | **FREE** | gemini-2.5-flash-image |
| Vision/Analysis | Nemotron VL (via OpenRouter) | **FREE** | nvidia/nemotron-nano-12b-v2-vl:free |
| Audio/TTS | MiniMax | **$0.002/1K chars** | Cheap, good quality |
| Video Generation | Runway / Luma | **PAID** | Top quality only — pay per second |

### Voice Calls → Twilio (separate)
### Payments → Stripe (optional)

## Implementation Pattern

```typescript
// 1. Local auth (no Firebase)
localStorage.setItem('beast_user', JSON.stringify({ id, name, email, isDemo }))

// 2. IndexedDB for data
const db = await openDB('beast_db', 1)
db.createObjectStore('campaigns', { keyPath: 'id' })
db.createObjectStore('leads', { keyPath: 'id' })

// 3. API keys in localStorage (never sent to server)
localStorage.setItem('beast_config', JSON.stringify({
  openrouter: 'sk-or-... YOUR_KEY_HERE',
  minimax: 'eyJh...',
  runway: 'rw-...',
  // etc
}))
```

## Config Interface

```typescript
interface APIConfig {
  // AI - Primary
  openrouter?: string
  defaultModel?: string
  
  // AI - Optional
  gemini?: string
  openai?: string
  minimax?: string
  
  // Voice calls
  twilioAccountSid?: string
  twilioAuthToken?: string
  twilioPhoneNumber?: string
  
  // Payments
  stripeSecretKey?: string
  
  // Media generation (paid best)
  runway?: string
  luma?: string
  pika?: string
  kling?: string
  haiper?: string
  elevenlabs?: string
}
```

## OpenRouter Free Models (25 confirmed)

```
google/gemini-2.0-flash-001
google/gemini-1.5-flash
google/gemini-1.5-flash-8b
google/gemini-1.5-pro
deepseek/deepseek-v4-flash:free
meta-llama/llama-3.3-70b-instruct:free
meta-llama/llama-3.2-3b-instruct:free
nvidia/nemotron-3-super-120b-a12b:free
nvidia/nemotron-3-nano-30b-a3b:free
nvidia/nemotron-nano-12b-v2-vl:free
nvidia/nemotron-nano-9b-v2:free
qwen/qwen3-coder:free
qwen/qwen3-next-80b-a3b-instruct:free
arcee-ai/trinity-large-thinking:free
minimax/minimax-m2.5:free
liquid/lfm-2.5-1.2b-thinking:free
liquid/lfm-2.5-1.2b-instruct:free
z-ai/glm-4.5-air:free
cognitivecomputations/dolphin-mistral-24b-venice-edition:free
nousresearch/hermes-3-llama-3.1-405b:free
openai/gpt-oss-120b:free
openai/gpt-oss-20b:free
poolside/laguna-xs.2:free
poolside/laguna-m.1:free
baidu/cobuddy:free
openrouter/free
```

## Best Model by Task

```typescript
function getBestModel(task: 'fast' | 'balanced' | 'smart' | 'coding' | 'image' | 'vision' | 'tts'): string {
  const map = {
    fast: 'google/gemini-2.0-flash-001',
    balanced: 'deepseek/deepseek-v4-flash:free',
    smart: 'meta-llama/llama-3.3-70b-instruct:free',
    coding: 'qwen/qwen3-coder:free',
    image: 'google/gemini-2.5-flash-image',
    vision: 'nvidia/nemotron-nano-12b-v2-vl:free',
    tts: 'minimax/t2a'
  }
  return map[task] || 'google/gemini-2.0-flash-001'
}
```

## When to Add Cloud

Cloud services should be added only when:
1. User explicitly requests cloud sync/backup
2. Multi-device sync is needed
3. Collaboration features required
4. API requires server-side (e.g., Stripe webhooks)

Even then: local-first, cloud as enhancement — not replacement.

## OpenRouter Video & Image References

The following session-specific references from `ai-agents/openrouter-media` have been absorbed here as they document Ted's verified working models and API patterns for media generation:

- `references/openrouter-video-api-reality.md` — Why OpenRouter video models 500 and what the actual video generation paths are (Muapi is the right GPU path)
- `references/openrouter-video-api.md` — Video generation Python patterns (confirmed working May 2026)
- `references/kpop-music-video-scene.md` — K-pop music video scene prompt engineering notes

## The Payment Blocker — Durable Pattern (May 18 2026)

Every deployed product hits the same wall: **payment credentials live on Ted's machine, not in the codebase.** This is a structural constraint, not a bug.

**The pattern:**
```
Build complete + Deploy complete + Payment infrastructure built
  → MISSING: Stripe key / NOWPayments API / PayPal link / Gumroad URL
  → STOP — can't monetize without Ted's credentials
```

**Current products that hit this wall:**
- GhostLink.pro — live, BTC Lightning + Monero ready, needs NOWPayments API key
- Nonna's Kitchen — just deployed, needs PayPal/Gumroad/Stripe
- K-pop AI videos — deployed, needs payment link
- GhostLink (payment server) — Stripe ready but needs secret key

**What to do when hitting this:**
1. Build the placeholder payment infrastructure anyway (it's done)
2. Tell Ted exactly which credential is needed and where to get it free
3. Make it dead simple: "Paste your Stripe key here" or "Create free account at nowpayments.io"
4. The machine is built — Ted holds the keys

**Never spend time trying to bypass this.** Ted's credentials are non-negotiable for payment integration. Build the structure, signal the missing key.

## Key Injection: Hermes → App

When the user provides an API key (e.g. OpenRouter) outside of the browser context, inject it via a server-side route + activation hook:

```
Step 1: User gives key → Hermes saves to C:\Users\<user>\AppData\Roaming\hermes\data\beast_key.json
Step 2: app/api/key/route.ts reads the hermes file server-side → exposes as /api/key GET
Step 3: hooks/useActivation.ts fetches /api/key on first app load → injects into localStorage beast_config
```

API route (`app/api/key/route.ts`):
```typescript
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const hermesConfig = path.join(process.env.APPDATA || '', 'hermes', 'data', 'beast_key.json');
  if (fs.existsSync(hermesConfig)) {
    const data = JSON.parse(fs.readFileSync(hermesConfig, 'utf8'));
    return NextResponse.json(data);
  }
  return NextResponse.json({ error: 'No key found' }, { status: 404 });
}
```

Hook (`hooks/useActivation.ts`):
```typescript
export function useActivation() {
  useEffect(() => {
    if (sessionStorage.getItem('activated')) return;
    const config = getConfig();
    if (config.openrouter) { sessionStorage.setItem('activated', '1'); return; }
    fetch('/api/key')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.openrouter) {
          injectHermesKey(data.openrouter, data.defaultModel);
          sessionStorage.setItem('activated', '1');
        }
      })
      .catch(() => {});
  }, []);
}
```

Include `<Activation />` in the root layout.tsx. Runs once per session, invisible.

## Warning Signs

If you're about to add Firebase/Auth0/Supabase as a required dependency — STOP and ask: can this be local first? Ted's preference is clear.

## Known Issues

**Windows Next.js dev server hangs on requests**: Port 3000 shows LISTENING but every HTTP request times out at 0 bytes received. The Node process is alive but request handling is broken. Causes:
- `output: 'standalone'` in next.config.ts (removes it)
- Complex webpack config with dynamic splitChunks
- `.next` cache corruption from disk-full or killed processes

Fix sequence:
1. Kill ALL node processes on the port
2. Delete the `.next` folder entirely (not just clear — corrupted cache persists)
3. Simplify next.config.ts to just `optimizePackageImports` for lucide-react and motion
4. Restart with `npm run dev`

If still broken after full clean: try `npm run build && npm start` (production build) as diagnostic — if the production build also hangs, it's a Windows network stack issue, not a Next.js config issue.

**Next.js performance on this Windows host**:
- `motion/react` causes hydration blocking — remove if not actively used
- VoiceControl (has setInterval polling) should be lazy-loaded: `dynamic(() => import('@/components/VoiceControl'), { ssr: false })`
- All heavy tab components (MoneyPrinterTab, AutopilotTab, AssetsTab) should be dynamic-imported
- Use `modularizeImports.lucideReact` to split icon imports — prevents bundling all 300+ icons
- `optimizePackageImports: ['lucide-react', 'motion']` is the key optimization
- **CRITICAL on Windows**: Use `--no-turbo` flag — turbo mode hangs on this host (port 3000 opens but requests never respond). Start with: `node_modules/.bin/next dev --no-turbo`

---

### Production Build vs Dev Server (May 16 2026)

**Problem**: After theme changes to `globals.css`, dev server gets stuck in compilation loops. `npm run dev` never completes initial compilation — no CSS is served, page stays white.

**Solution**: Use production build as the reliable verification path:

```bash
# Clean slate
taskkill /F /IM node.exe
rm -rf E:/BEAST_MARKET_UNIFIED/.next

# Build (blocks until done or error, unlike dev which runs forever)
timeout 180 npm run build 2>&1 | tail -40

# Start production server (works reliably)
npm start
```

**Build errors that emerged from THE BEAST session**:

| Error | Fix |
|-------|-----|
| `Cannot find module './constants'` | Delete stray `App.tsx` in root (old project artifact) |
| `Property 'niche' does not exist on type Campaign` | Add `niche?: string` to Campaign interface in `lib/db.ts` |
| `"THE BEAST"` subdirectory type errors | Add `"THE BEAST"` to `tsconfig.json` exclude array |
| `optimizePackageImports` warning in Next 15.5.14 | Remove — not supported in this version, use `transpilePackages` only |

**Stripped-down next.config.ts (known good)**:
```typescript
const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'ui-avatars.com', port: '', pathname: '/**' },
    ],
    dangerouslyAllowSVG: true,
  },
  transpilePackages: ['motion'],
};
```

---

### Verifying Theme Changes Are Live

After editing `globals.css` or `page.tsx`, always verify the brutal theme is actually compiling:

```bash
# Check compiled CSS has the right colors
find .next -name "*.css" 2>/dev/null | head -5
wc -c .next/static/css/<hash>.css
grep -c "39FF14\|FF00C1\|brutal-card\|neon-text" .next/static/css/<hash>.css
```

**Expected**: CSS file should be ~40KB (was 45KB with full brutal theme), should contain `#39FF14` multiple times.

**Live server verification** (raw socket — curl hangs on Next.js streaming responses):
```bash
node -e "
const net = require('net');
const s = new net.Socket();
s.setTimeout(8000);
s.connect(3000, '127.0.0.1', () => {
  s.write('GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
});
let r = '';
s.on('data', d => r += d.toString());
s.on('end', () => {
  const body = r.split('\r\n\r\n')[1] || '';
  console.log('Green #39FF14:', body.includes('39FF14'));
  console.log('Brutal classes:', body.includes('brutal-card'));
  console.log('Setup modal:', body.includes('ENTER THE BEAST'));
  process.exit(0);
});
s.on('timeout', () => { console.log('TIMEOUT'); process.exit(1); });
"
```

---

### The Brutal Brutalist Theme (THE BEAST Design System)

The CSS lives in `app/globals.css` and defines the full brutal design system used across all components.

**Neon color palette**:
- `#39FF14` — Primary neon green (borders, glows, buttons, accents)
- `#FF00C1` — Pink (secondary accents, hover states, glitch effects)
- `#00FFF9` — Cyan (tertiary accents, status indicators)
- `#FFFF00` — Yellow (warnings, paused states)

**Core utility classes** (defined in globals.css):
- `.neon-text` — neon green glow text
- `.neon-text-pink`, `.neon-text-cyan` — colored variants
- `.neon-glow`, `.neon-glow-pink`, `.neon-glow-cyan` — box-shadow glows
- `.brutal-card` — 3px white border + 8px green shadow + green top accent bar
- `.brutal-border` — 3px white border + 6px green shadow
- `.brutal-border-glow` — neon green border + white shadow
- `.brutal-btn` — display font, uppercase, 3px border, 5px offset shadow, presses down on click
- `.brutal-btn-green` — green background variant
- `.brutal-input` — black bg, 3px white border, 5px green shadow, glows on focus
- `.scanlines` — CRT overlay via CSS `repeating-linear-gradient`
- `.crt-flicker` — subtle animation on the full page
- `.glitch` — text glitch effect using `::before`/`::after` with clip-rect animations
- `.scanline` — animated scan bar effect
- `.marquee-track` — scrolling text animation (20s loop)
- `.status-dot-active` — pulsing neon dot

**Fonts**: Anton (display, uppercase), Inter (body), Courier New (mono).

**Warning**: When making theme changes, dev server may hang on compilation. Use `npm run build && npm start` for reliable verification.

---

## References

- `references/openrouter_models.md` — full 356-model list from live OpenRouter API (general catalog)
- `references/openrouter-free-models-account.md` — **absorbed from `openrouter-free-models` skill**: Ted's confirmed-working account models, API token, 3-model fallback chain, test snippet, and privacy guardrail settings (May 2026)
- `references/nextjs-dev-server-windows-hangs.md` — Windows dev server hangs, key injection pattern, lazy loading, API wiring (THE BEAST session learnings)
- `references/multi-model-rate-limiter.md` — **multi-model LLM rate limiter pattern (June 2026)**: concurrency + per-provider + cost cap + 429 cooldown. Required for any code path that fans out to 2+ LLM providers. Ted pays for OpenRouter — this is a financial-safety rule, not a code-quality one. Reference implementation: PURPCLAW `lib/rate-limiter.js`.