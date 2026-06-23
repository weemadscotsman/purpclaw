---
name: monetization-pipeline
description: Connect Ted's built products to real money. Find monetizable assets in the god folder, wire up payment infrastructure, and deploy live selling pages. Activated when building, deploying, or pitching anything that should make money.
origin: "session-20260519-operation-100"
---

# Monetization Pipeline

## When This Skill Fires

- Building or deploying anything that should be sellable (SaaS, digital product, service, template, tool)
- User asks to "make money", "sell", "monetize", or "get this live"
- A product is deployed but has no payment link
- Reviewing the god folder for "what can I sell right now"

## Ted's Core Pattern (Critical)

**He builds. Products go live. Payment never gets connected.**

Every major project has this anatomy:
1. ✅ Fully functional product deployed to Netlify
2. ✅ Professional landing page with pricing
3. ❌ Buy button links to `#` or `alert('configure stripe')`
4. ❌ Crypto addresses on page but no notification system
5. ❌ Email-to-buy form with no Stripe/PayPal follow-up

The product is built. The cash register is missing.

**Before declaring victory on ANY product deployment, the payment layer MUST be connected.**

## Monetizable Assets on This Machine

### High Priority (can sell TODAY)

| Asset | Location | Price Signal | Action |
|-------|----------|--------------|--------|
| GhostLink Pro | E:/god folder/02_ACTIVE_PROJECTS/ghostlink-pro | $100 lifetime | LIVE at https://dainty-jalebi-b8bbdb.netlify.app — binary 4.2MB at ghostlink-pro/target/release/ghostlink-pro.exe |
| K-Pop AI Studios service | E:/god folder/02_ACTIVE_PROJECTS/cann-ai-music-sale | $99 one-time | Deploy to Netlify + connect Stripe |
| AI Venting Machine | god/02_ACTIVE_PROJECTS/ai-venting-machine | $9-49 | Gumroad or Stripe |
| Deep-Live-Cam | E:/deeplive/Deep-Live-Cam-main | $29-99 | Package + sell |
| 67 MP3 audio files | god folder root | $5-19 each | Bundle as sample pack |

- **GhostLink Pro payment server has live Stripe key** — Located at `E:/god folder/02_ACTIVE_PROJECTS/ghostlink-pro/payment-server/`. The `STRIPE_SECRET_KEY` is present in `.env`. Test it: `curl -H "Authorization: Bearer {key}" https://api.stripe.com/v1/balance`. If live, can be used for card payments — CORS whitelist may need updating to allow your server's origin.
- **Tron wallet balance check**: `https://api.trongrid.io/v1/accounts/{address}` returns `{"success":false,"error":"A valid account address is required.","statusCode":400}`. The address is valid Base58-check TRON format. This API error means the address has zero on-chain history (new wallet, never received funds, not in TronGrid's indexed range). Don't trust for confirming incoming payments — you won't see them via this endpoint. Workaround: use `https://api.trongrid.io/walletsolidity/getbalance` POST endpoint with `{"address":"...hex..."}` — convert Base58 to hex first, or use a block explorer API instead.
- **GhostLink Pro binary is 4.2MB, fully built** — `E:/god folder/02_ACTIVE_PROJECTS/ghostlink-pro/target/release/ghostlink-pro.exe`. Sellable immediately at $100 one-time for lifetime license. Binary is downloadable from a static server once payment address is confirmed.

### Confirmed Wallet Addresses (May 2026)

```
USDT TRC20: TLREQThH8cwEXCXtNHQq2QZSi8NHFwo8wG4  ← CONFIRMED onchain, use this one
```

Note: Previous `TXqwGpk4KpWN83QK2p7V8b6PQ1U7xKfJ4v` address in the skill is DEPRECATED. Always use `TLREQThH8cwEXCXtNHQq2QZSi8NHFwo8wG4` for TRON/USDT payments to Ted's accounts.

### API Keys Available (use for paid services)

```
OPENROUTER_API_KEY: sk-or-... YOUR_OPENROUTER_KEY_HERE
SONAUTO_API_KEY: sk-sona-... (music generation)
```

## Payment Infrastructure Options

### Stripe (fastest — takes 2 min)
1. Go to stripe.com → create account → Payment Links
2. Create a payment link for each product/price
3. Copy the `https://buy.stripe.com/...` URL
4. I update the buy button href and redeploy

### PayPal.me (fastest alternative)
1. Create PayPal.me/YourName
2. Share the link — I embed it in the page

### Gumroad (good for digital products)
1. Create gumroad.com product page
2. Embed the product link
3. Gumroad handles delivery automatically

### Crypto (already on pages — needs notification system)
- Addresses are embedded
- Needs a way to know when payment arrives
- For small amounts: self-verified (buyer emails TXID to ted@kpopsai.com)
- Add a "email your TXID" step on the page

## The Rule

**Every product deployment ends with ONE of:**
1. Stripe Payment Link embedded + buy button working, OR
2. PayPal.me link embedded + buy button working, OR  
3. Gumroad product page linked, OR
4. Crypto address + clear "email TXID to ted@kpopsai.com" instructions

If none of the above is done, the product is NOT live for monetization purposes.

## Quick-Start Payment Page Template

For any new product, include this section in the deployed HTML:

```html
<div class="payment-section" id="crypto">
  <h2>💰 Get Instant Access</h2>
  
  <!-- Stripe -->
  <a href="YOUR_STRIPE_PAYMENT_LINK_HERE" class="buy-btn" target="_blank">
    🛒 BUY NOW — $XX
  </a>
  <p style="color:#555;font-size:0.8em;margin-top:8px">Card, Apple Pay, Google Pay accepted</p>
  
  <!-- Crypto fallback -->
  <div style="margin-top:30px;padding:20px;background:#111;border-radius:8px">
    <p style="color:#888;font-size:0.85em">Or pay with crypto — email your TXID to ted@kpopsai.com</p>
    <div class="addr">USDT (TRC20): TXqwGpk4KpWN83QK2p7V8b6PQ1U7xKfJ4v</div>
  </div>
</div>
```

Replace `YOUR_STRIPE_PAYMENT_LINK_HERE` before deploying. If not yet available, use a placeholder comment and set a reminder to fill it in immediately after creating the Stripe link.

## Sonauto Music Monetization (untapped)

Ted has `SONAUTO_API_KEY` — can generate AI music tracks. Strategy:
1. Generate high-quality instrumental tracks
2. Package as "AI Music Pack — $19"
3. Sell via Stripe link on a landing page
4. Deliver via download link in confirmation email

This is the most immediate monetization path with existing tools.

## Netlify Deploy Pattern (CRITICAL)

This is how to deploy a static sale page to Ted's Netlify account fast.

### Step 1: Create netlify.toml in the project folder

```toml
[build]
  command = ""
  publish = "."

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Empty `command` skips the default Hugo build. Netlify serves files from `publish` dir directly.

### Step 2: Deploy via CLI

```bash
cd /path/to/project-folder
netlify deploy --dir=. --prod --no-build
```

`--no-build` skips build entirely. Works for static HTML + JS + CSS only projects.
Result: random URL like `https://dainty-jalebi-b8bbdb.netlify.app` (Ted's account already has 20+ sites).

### Step 3: Check deploy worked

```bash
curl -sI "https://SITE-URL.netlify.app/" | head -3
# Expect: HTTP/1.1 200 OK
```

### Key findings from May 2026 session:
- **Netlify token**: stored at `C:/Users/Admin/AppData/Roaming/netlify/Config/config.json` under `users.{userId}.auth.token`. Ted is logged in — CLI deploys work without extra auth.
- **Anonymous deploys**: `--allow-anonymous` flag does NOT exist on `netlify deploy` command.
- **Netlify API direct deploy**: `POST /api/v1/sites/{id}/deploys` creates deploy in `new` state, but file upload requires state `upload`. The CLI handles this automatically — prefer CLI over raw API for file deploys.
- **Static hosting blocks .exe files**: Netlify will not serve `.exe` files from static hosting. GhostLink binary must be served from a local Node.js server (port 3457+).
- **Existing sites**: Run `netlify sites:list --json` to see all deployed sites. You can deploy to any existing site by linking first.
- **New site on deploy**: If not linked, `netlify deploy --prod` auto-creates a new random-named site. Fine for sale pages.

### Tunnel options (when Netlify deploy isn't fast enough)

```bash
# localtunnel — no auth, works immediately
lt -p 3457 --subdomain mysale  # gives https://mysale.loca.lt
```

Note: localtunnel is unreliable — URLs return 503 after a few minutes. Use as last resort.

## Verification Checklist

Before any deployment is considered complete:
- [ ] Buy button href points to a REAL payment URL (not `#`)
- [ ] Tested that clicking buy opens the payment page
- [ ] Crypto addresses are correct (double-check onchain)
- [ ] Email address for manual crypto confirmation is visible
- [ ] Price is clear and prominent

---

**See also:** `references/project-inventory.md` — live inventory of sale-ready projects, confirmed crypto addresses, and deployment URLs as of May 2026.