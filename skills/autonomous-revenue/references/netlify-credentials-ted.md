# Netlify Credentials — Ted's Account (Updated May 19 2026)

## Auth Token

**Location:** `C:/Users/Admin/AppData/Roaming/netlify/Config/config.json` → `users[].auth.token`
**Token:** `nfc_t64B34VwXjTkzYDZAt8KifZYpBCAgXKub8fd` (Netlify CLI session token, Ted's team account)

## All Live Sites (15 total, all SSL, all 200 OK)

| Site Name | Site ID | URL | Notes |
|---|---|---|---|
| cann-ai-music-studio-28940 | `722363a5-361e-40a1-affd-fe685b8be165` | https://cann-ai-music-studio-28940.netlify.app | **Has payment links** — PayPal $49, $100, USDT |
| magnificent-sunburst-900049 | `e1763a73-3dba-4379-aad8-c1e899c68858` | https://magnificent-sunburst-900049.netlify.app | Fresh, empty — redeploy target |
| zampmediaplayer | `e81becc3-3790-4f9c-af92-ea4f50c80644` | https://zampmediaplayer.netlify.app | Unknown content |
| jovial-sprinkles-53b744 | `0a17a78f-1669-42b9-9d85-faeefd98ccfd` | https://jovial-sprinkles-53b744.netlify.app | Unknown content |
| **theaiguyedinburgh** | `e58df219-53a2-4193-8768-c737d821aab6` | https://theaiguyedinburgh.netlify.app | **Service business** — pricing exists (Repair £50, Upgrade £100, Build £200-400), NO payment links yet |
| **nonnaskitchen** | `8c0bdb35-0e5a-499e-ab39-dad172baef77` | https://nonnaskitchen.netlify.app | Recipe app — needs payment page |
| onlynans | `f900c96d-96aa-4448-a24e-1dace17b47db` | https://onlynans.netlify.app | Adult content |
| **marks-marketing-autopilot** | `d403e922-3abf-437f-b8dd-a8eaef256e59` | https://marks-marketing-autopilot.netlify.app | CANN.ON.AI marketing — service offering (Setup £150, Full £350, Retainer £99/mo) |
| piersmorganrocksarmchairs | `47cfd1bf-8d5c-471a-95e0-970a2f0c93dd` | https://piersmorganrocksarmchairs.netlify.app | Entertainment |
| project-aria | `70d43f5d-465a-4126-8716-0b51b8c7a487` | https://project-aria.netlify.app | AI project management |
| eggbotlunchbuddy | `fe575eb9-a0cf-443f-8868-16b921f3d7f5` | https://eggbotlunchbuddy.netlify.app | AI lunch companion |
| worstwebsiteeverentry | `3ed2239a-7682-4e35-8e9e-2f5dcb722855` | https://worstwebsiteeverentry.netlify.app | Entertainment |
| pixeldynasty | `d50b5f86-bae1-4c2d-8290-af7a5d9112f9` | https://pixeldynasty.netlify.app | Youth tech programme |
| realfakenewz | `217b6602-77e4-4800-8bba-cb996d3b1a27` | https://realfakenewz.netlify.app | Fake news AI |
| eddie-autonomous-builder-v2 | `47696c65-a99e-4298-af4d-06e72a61f746` | — | **404 — DEAD** |

## Payment Credentials

- **PayPal:** `paypal.me/weemadscotsman38/{amount}` (Edward Cannon, weemadscotsman38@hotmail.com)
- **TRC20 (USDT):** `TRMJuGXKD6hnVsQumiKfSJu4wD1nQhrQx4` — confirmed active, ~35K TRX balance

## Quick Deploy via API (no git, no netlify link needed)

```javascript
// Node.js - deploy payment page to any existing site in one call
const https = require('https');
const fs = require('fs');
const token = 'nfc_t64B34VwXjTkzYDZAt8KifZYpBCAgXKub8fd';

function deployHTML(siteId, html) {
  const payload = JSON.stringify({ files: { '/index.html': { content: html } } });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.netlify.com',
      path: '/api/v1/sites/' + siteId + '/deploys',
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { const r = JSON.parse(d); resolve({ id: r.id, state: r.state }); } catch(e) { resolve({ err: d.slice(0,100) }); } });
    });
    req.on('error', e => resolve({ err: e.message }));
    req.write(payload); req.end();
  });
}

// Deploy to theaiguyedinburgh
deployHTML('e58df219-53a2-4193-8768-c737d821aab6', '<h1>Pay £100</h1><a href="https://www.paypal.me/weemadscotsman38/100">Pay Now</a>')
  .then(console.log);
```

## Deploy with Netlify CLI (from clean temp dir, no netlify.toml)

```bash
# Clean deploy — copy index.html to temp dir WITHOUT netlify.toml
mkdir -p /tmp/my-sale && cp index.html /tmp/my-sale/
cd /tmp/my-sale && netlify deploy --prod --dir .

# Deploy to existing site by name
cd /tmp/my-sale && netlify deploy --prod --dir . --site theaiguyedinburgh

# Kill hanging deploy
taskkill //F //PID <pid>
```

**Critical:** `netlify.toml` in deploy dir causes `JSONHTTPError: Not Found`. Always deploy from clean temp dir without it.

## Stale Sites (do not use)

- `ghostlink-pro-sale` — NOT in current sites list, dead
- `cannonaistudios.app` — NOT a Netlify site, custom domain that may point elsewhere
- `eddie-autonomous-builder-v2` — 404, dead