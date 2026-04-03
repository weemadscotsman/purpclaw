# Next.js Debugging Patterns (Windows)

## THE BEAST Project — Session Learnings

### Key Injection: Hermes → Next.js App

User gave OpenRouter key `sk-or-... YOUR_KEY_HERE` (confirmed valid).

Pattern for injecting server-side API key into browser localStorage:

1. **Hermes saves key** → `C:\Users\Admin\AppData\Roaming\hermes\data\beast_key.json`
   ```
   { "openrouter": "sk-or-v1-...", "defaultModel": "google/gemini-2.0-flash-001" }
   ```

2. **Next.js API route reads hermes file** (`app/api/key/route.ts`):
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

3. **Activation hook runs in browser** (`hooks/useActivation.ts`):
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

4. **Include in layout**: `<Activation />` (invisible, runs once per session)

Note: Cannot use `fs`/`path` in `lib/config.ts` — that's client-side only. The API route handles server-side file access.

---

### Windows Next.js Dev Server Hangs (Port 3000 LISTENING but requests timeout)

**Symptom**: `netstat` shows port 3000 LISTENING. `curl localhost:3000` hangs at 0 bytes received forever.

**Diagnostic approach**:
1. `netstat -ano | findstr ":3000"` — confirm port is actually listening
2. `powershell Get-Process -Id <PID>` — check if Node.js process is alive and using reasonable RAM
3. `curl -v localhost:3000` — shows connection established but timeout at 0 bytes

**Known causes and fixes**:

| Cause | Fix |
|-------|-----|
| `output: 'standalone'` in next.config.ts | Remove it |
| Complex webpack splitChunks config | Strip back to minimal next.config.ts |
| `.next` cache corruption from disk-full | Delete `.next` folder entirely |
| Stale node processes on port | `taskkill /F /IM node.exe` then restart |
| `motion/react` blocking hydration | Remove from imports if unused |
| VoiceControl setInterval polling during SSR | Lazy-load: `dynamic(() => import(...), { ssr: false })` |

**Stripped-down next.config.ts that works**:
```typescript
import type {NextConfig} from 'next';
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
  optimizePackageImports: ['lucide-react', 'motion'],
};
export default nextConfig;
```

**Kill and clean restart sequence**:
```bash
# Kill everything on port 3000
taskkill /F /IM node.exe

# Delete corrupted .next cache
rm -rf "/e/BEAST_MARKET_UNIFIED/.next"

# IMPORTANT: Use --no-turbo on Windows (turbo mode hangs on this host)
cd /e/BEAST_MARKET_UNIFIED && node_modules/.bin/next dev --no-turbo

# Or use npm run dev if next.config.ts is clean and .next is deleted
```

**The `--no-turbo` flag discovery (May 16 2026)**:
- Symptom: Port 3000 LISTENING but every HTTP request times out at 0 bytes
- `netstat -ano | findstr ":3000"` shows `0.0.0.0:3000 LISTENING <PID>`
- `powershell Get-Process -Id <PID>` shows Node.js alive, ~720MB RAM
- `curl -v localhost:3000` → connection established → hangs forever → 0 bytes
- Node.js TCP socket connected but never responded → completely silent hang
- Tried: remove `output: 'standalone'`, delete `.next`, simplify webpack config — all failed
- **FIX**: `node_modules/.bin/next dev --no-turbo` — turbo mode was the culprit
- After `--no-turbo`: curl returns full HTML in under 1 second

**Why turbo mode hangs on this Windows host**:
Next.js 15 turbo mode (Rust-based file watcher + bundler) has a bug on this specific Windows machine. The Node.js process starts, port opens, but the turbo daemon never actually starts accepting connections. Using the legacy webpack dev server (--no-turbo) works perfectly.

**If still broken after full clean**: Try production build as diagnostic:
```bash
npm run build && npm start
```
If production build also hangs → Windows network stack issue, not Next.js config.

---

### Performance: Lazy Loading Heavy Components

**Problem**: Page loads taking 6+ seconds due to large component bundles blocking hydration.

**Solution**: Use Next.js `dynamic()` for code splitting:

```typescript
// In page.tsx
import dynamic from 'next/dynamic'

// Heavy component with polling interval — don't block initial render
const VoiceControl = dynamic(() => import('@/components/VoiceControl'), {
  ssr: false,
  loading: () => <div className="animate-pulse"><Bot className="w-6 h-6"/></div>,
})

// Heavy tabs — only load when tab is activated
const MoneyPrinterTab = dynamic(() => import('./tabs/MoneyPrinterTab'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin"/></div>,
})
```

**Tab lazy loading in campaign page.tsx**:
```typescript
const tabs = {
  'arbitrage': dynamic(() => import('./tabs/MoneyPrinterTab'), { ssr: false }),
  'autopilot': dynamic(() => import('./tabs/AutopilotTab'), { ssr: false }),
  'strategy': dynamic(() => import('./tabs/StrategyTab'), { ssr: false }),
  // etc
}
// In render:
{activeTab === 'arbitrage' && <MoneyPrinterTab ... />}
```

---

### API Wiring: OpenRouter in Next.js

**lib/openrouter.ts** (already built, 195 lines):
- `chat(messages, model?)` — calls OpenRouter `/chat/completions`
- `getBestModel(task)` — returns correct free model by task type
- 25 confirmed free models available

**lib/media.ts** (already built, 11,123 bytes):
- `generateSpeech()` — MiniMax (primary), ElevenLabs/OpenAI (fallback)
- `generateImage()` — DALL-E 3 (primary), MiniMax (fallback)
- `generateVideoRunway/Luma/Kling/Pika()` — paid video APIs with polling

**Wired tabs** (via subagent work):
- StrategyTab → openrouter.ts chat()
- ResearchTab → openrouter.ts chat()
- ContentTab → generateImage + OpenRouter
- QuickCopyTab → OpenRouter + MiniMax TTS
- AutopilotTab → simplified, partial wiring
- MoneyPrinterTab → fully wired (18KB, largest)

**Firebase references removed** from all tabs. All AI calls now route through real APIs.

---

### Config Structure

`lib/config.ts` — localStorage-backed, no server-side dependencies:
```typescript
interface APIConfig {
  openrouter?: string      // Primary AI
  defaultModel?: string
  minimax?: string         // TTS
  openai?: string          // DALL-E images
  runway?: string          // Video
  luma?: string            // Video
  pika?: string            // Video
  kling?: string           // Video
  elevenlabs?: string      // TTS premium
  twilioAccountSid?: string
  twilioAuthToken?: string
  stripeSecretKey?: string
}

export function getConfig(): APIConfig { ... }
export function saveConfig(config: APIConfig): void { ... }
export function injectHermesKey(openrouter: string, defaultModel?: string) { ... }
```