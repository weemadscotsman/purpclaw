# Ted Cannon — Crypto Wallets (Updated May 19 2026)

## MAJOR UPDATE: The $10-12K Wallet Find

**May 19 2026:** Wallet `TRMJuGXKD6hnVsQumiKfSJu4wD1nQhrQx4` confirmed active on Tron blockchain with ~35,402 TRX (~$10-12K at current prices).

This wallet was discovered by:
1. Mining Ted's E:\Telegram XLSX invoice files (invoice-wallet-mining.py pattern)
2. Cross-referencing with trongrid.io API → real balance confirmed
3. Ted: "i do so much i cant remember bro" — he doesn't know how he set this up

**Problem:** No seed phrase found anywhere. No TronLink/Trust Wallet installed. Access path unknown.

**Recovery options (in priority order):**
1. Phone TronLink/Trust Wallet — same address imported?
2. Paper seed phrase written down?
3. Chrome extension (TronLink) — NOT found in Chrome localStorage
4. Exchange login — did he buy TRX on Binance/Kraken and withdraw here?

## Critical Distinction — Deposit Addresses vs Private Wallets

**Desktop wallet_1.txt through wallet_7.txt = EXCHANGE DEPOSIT ADDRESSES**
- These are ZB.com and Nexo account numbers, NOT private keys
- "ZB @", "B@d + i @" = exchange branding on deposit pages
- Without exchange login, COMPLETELY USELESS
- Examples: GCWPECWTFLMUYWCYYODMB7J (Stellar), DFSigJZVY... (Dogecoin), etc.

**Real private wallets have seed phrases (12-24 words) and control actual funds.**
- Ted's TRMJuGX... IS a private wallet — confirmed active with real money
- But has no seed phrase on PC

## Source
Extracted from ZB.com exchange screenshots via Tesseract OCR:
`/e/god folder/02_ACTIVE_PROJECTS/crypto wallets screenshiots/photo_1-7_2026-03-27*.jpg`
OCR binary: `/c/Program Files/Tesseract-OCR/tesseract`

## All Wallet Addresses

| Coin | Network | Address | Status |
|------|---------|---------|--------|
| TRX | Tron | `TRMJuGXKD6hnVsQumiKfSJu4wD1nQhrQx4` | **CONFIRMED ACTIVE — ~35K TRX** |
| Stellar | XLM | `GCWPECWTFLMUYWCYYODMB7J` | Exchange deposit (ZB.com) |
| Dogecoin | DOGE | `DFSigJZVYei17TUGAKUEdADEgMusNtuNMkz` | Exchange deposit |
| XRP | Ripple | `rpAi9Sifuq8s8gUSZPY4m6KQ5vh4efyWH2` | Tag: 1012394, exchange deposit |
| Tether | Tron | `TLREQThH8cwEXCXtNHQq2QZSi8NHFwo8wG4` | **DEAD — 404 on TronGrid** |
| Bitcoin | BSC | `0xdb78d5C856E0deAB4a422622c21b89B9cdD632b8` | BSC address, NOT Bitcoin mainnet |
| Bitcoin | BTC | `bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh` | Unverified |

## Exchange
ZB.com — Ted uses ZB.com for crypto trading. Wallets on Desktop are deposit addresses from this exchange.

## Donate Page Pattern (ZERO credentials needed)
For any of Ted's projects needing monetization without API keys:
1. Build static HTML with QR codes: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&bgcolor=1a1a1a&color=ffffff&data={wallet_uri}`
2. Wallet URI formats:
   - BTC: `bitcoin:{address}`
   - XRP: `XRP:{address}?dt={tag}`
   - XLM: `{address}`
   - DOGE: `DOGE:{address}`
   - USDT: `TRON:{address}`
3. Deploy: `netlify deploy --no-build --prod`

## Live Deployments
- Crypto donate page: `resplendent-starburst-ce28c5.netlify.app`
- Nonna's Kitchen: `storied-sfogliatella-d54225.netlify.app`
- GhostLink.pro: `ghostlink.pro` (Stripe + crypto accepted)

## On-Chain Query (Always Get Live Price First)
```bash
# Get current TRX price
curl -s "https://api.binance.com/api/v3/ticker/price?symbol=TRXUSDT"

# Query TRMJuGX balance
curl -s "https://api.trongrid.io/v1/accounts/TRMJuGXKD6hnVsQumiKfSJu4wD1nQhrQx4" | python -c "
import json,sys
d=json.load(sys.stdin)
bal=d.get('data',[{}])[0].get('balance',0)
print(f'Balance: {bal/1e6:.2f} TRX')
"
```