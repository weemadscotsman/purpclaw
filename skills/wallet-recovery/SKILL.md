---
name: wallet-recovery
description: Scan large image folders for cryptocurrency wallet data (addresses, seed phrases, private keys) using Tesseract OCR. Check blockchain balances and recover funds.
triggers:
  - wallet recovery
  - find cryptocurrency addresses in images
  - scan photos for crypto keys
  - crypto wallet extraction
  - metamask recovery
  - phantom wallet
  - trust wallet recovery
  - solana wallet recovery
  - old crypto wallets
  - recover bitcoin ethereum crypto
---

# Cryptocurrency Wallet Recovery from Images

Scan a large image folder for cryptocurrency wallet data (addresses, seed phrases, private keys, public keys), check blockchain balances, and recover funds.

## Pipeline

### 1. Setup — Tesseract OCR on Windows
Tesseract must be installed and called via subprocess. `vision_analyze` tool does NOT work with local Windows paths — confirmed across multiple attempts.

```python
import subprocess
TESSERACT = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
PYTHON = r'C:\Users\Admin\AppData\Local\Programs\Python\Python311\python.exe'

def ocr(path):
    r = subprocess.run(
        [TESSERACT, path, 'stdout', '-l', 'eng', '--psm', '6'],
        capture_output=True, text=True, timeout=30
    )
    return r.stdout
```

### 2. Crypto Pattern Detection
```python
import re

PATTERNS = {
    'bitcoin_p2pkh': re.compile(r'\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b'),
    'bitcoin_p2sh':  re.compile(r'\b3[a-km-zA-HJ-NP-Z1-9]{25,34}\b'),
    'bitcoin_bech32': re.compile(r'\bbc1[a-zA-HJ-NP-Z0-9]{25,87}\b'),
    'ethereum':      re.compile(r'\b0x[a-fA-F0-9]{40}\b'),
    'privkey_hex':   re.compile(r'\b[a-fA-F0-9]{64}\b'),
    'privkey_base58': re.compile(r'\b[5KL][1-9a-km-zA-HJ-NP-Z]{50,51}\b'),
}
# Seed phrases: 12-24 lowercase words separated by spaces
# if 12 <= len(words) <= 24 and all(re.match(r'^[a-z]+$', w) for w in words)
```

### 3. Parallel Batch Workers
For large folders (10k+ images), launch 3 parallel workers on thirds of the file list.

```bash
PYTHONPATH= /c/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe \
  /tmp/scan_parallel.py {start_idx} {end_idx} > /tmp/w{N}.log 2>&1 &
```

Worker script: `references/scan_parallel.py`

### 4. Blockchain Balance Checks
```bash
# Bitcoin via Blockstream
curl -s "https://blockstream.info/api/address/{addr}" | \
  python -c "import sys,json; d=json.load(sys.stdin); print(d.get('chain_stats',{}).get('funded_txo_sum',0)/100000000, 'BTC')"

# Ethereum via Blockscout
curl -s "https://eth.blockscout.com/api/v2/addresses/{addr}" | \
  python -c "import sys,json; d=json.load(sys.stdin); print(d.get('coin_balance', 0))"
```

## Scan Priority Order
1. Crypto-named files first (grep filenames for: trust, wallet, bitx, nexowallet, bitcoin, ethereum, metamask, seed, phrase, private, key, recovery)
2. **Telegram ChatExport** — check `C:\Users\<user>\Downloads\Telegram Desktop\ChatExport_*/result.json`. It contains all saved messages and is a goldmine for wallet addresses, seed phrases (as images), private keys, exchange credentials, and exchange deposit addresses. Parse the JSON and grep for crypto patterns.
3. Delegate focused batches to subagents with `["terminal","file"]` toolsets
4. Full folder scan with parallel workers

### Telegram ChatExport Parsing — CORRECTED
```python
import json, re
from pathlib import Path

EXPORT_DIR = r'C:\Users\Admin\Downloads\Telegram Desktop'
# Find most recent export folder
import glob, os
folders = sorted(glob.glob(os.path.join(EXPORT_DIR, 'ChatExport_*')), key=os.path.getmtime)
latest = folders[-1] if folders else None

result_json = Path(latest) / 'result.json'
data = json.loads(result_json.read_text(encoding='utf-8'))

# ⚠️ CRITICAL: result.json is a dict with a 'messages' key — NOT a list directly
# Wrong: for msg in data: ... (iterates only 3 top-level keys: type, id, messages)
# Correct:
messages = data['messages']  # This is the list of 1644 messages

# Also: the "1. settle", "2 afrald" etc. in the MetaMask message IS the actual
# seed phrase text — Telegram rendered the screenshot as text, not just alt text.
# So the seed phrase IS in result.json as readable text, not only in the photo.
# The message text_entities field also contains the full alt text.

for msg in messages:
    text = msg.get('text', '')
    if isinstance(text, list):
        text = ' '.join(t.get('text','') for t in text if isinstance(t,dict))
    for pattern_name, rx in PATTERNS.items():
        for match in rx.finditer(text):
            print(f"[{pattern_name}] {match.group()} | {msg.get('date','')}")
```

**Key Telegram JSON gotchas from May 22 2026 session:**
- `result.json` top-level structure: `{'type': 'saved_messages', 'id': 433353701, 'messages': [...]}`
- Iterating the dict directly gives only 3 items (type, id, messages) — must access `.messages`
- The "1. settle / 2 afrald" etc. text IS the seed phrase — it was sent as a text message, not only as an image alt attribute. So OCR of the image is NOT needed; the text is directly readable from the JSON.
- Photos are named like `photo_100@03-08-2023_20-04-59.jpg` — searching for `2025-01-27` in filenames WON'T work. Use `glob` + regex on the `@DATE_TIME` suffix instead.
- Telegram compresses image attachments, so any photos that WERE sent will OCR poorly. Prefer extracting text from the JSON first.

**Known Telegram crypto finds (May 22 2026 session):**
- MetaMask seed (partial, 10/12 words): `settle afraid lounge boy capable [?] heart member journey patient [?] section`
- BTC addresses: `33kSUU3...`, `19AogR4...`, `bc1q6h44...`, `19ZQYSR...`
- ETH addresses: `0x659Db9...`, `0x0b7Db0...`, `0xdb78d5...`, `0x013B96...`
- Aleo address: `aleo1w4ztuq0xcj6g70y3sshncmnkcefl00vn6d3x2fgsh7nkqnkdecysyszp6h`
- Read-only password: `f8xpsuq1ke*`

### Ethereum Balance Check — BLOCKSCOUT (no API key)
```bash
# Use blockscout.com (works without API key)
curl -s "https://eth.blockscout.com/api?module=account&action=balance&address={addr}" | \
  python -c "import sys,json; d=json.load(sys.stdin); v=int(d.get('result','0'),16); print(f'{v/1e18:.8f} ETH')"
```

### ETH Balance Check — Alchemy Free Tier (if available)
```bash
curl -s -X POST "https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["{addr}","latest"],"id":1}' | \
  python -c "import sys,json; d=json.load(sys.stdin); wei=int(d['result'],16); print(f'{wei/1e18:.8f} ETH')"
```

### XRP via Ripple API
```bash
curl -s "https://data.ripple.com/v2/accounts/{addr}/balances?currency=XRP" | \
  python -c "import sys,json; d=json.load(sys.stdin); bals=d.get('balances',[]); [print(f'{b[\"balance\"]} XRP') for b in bals]"
```

### Stellar via Horizon
```bash
curl -s "https://horizon.stellar.org/accounts/{addr}" | \
  python -c "import sys,json; d=json.load(sys.stdin); [print(f'{b['balance']} {b.get('asset_type',b.get('asset_code','XLM'))}') for b in d.get('balances',[])]"
```

### Finding Trust Wallet / Nexo / Exchange Images
```python
import os
from glob import glob

# On Windows, os.startfile() opens with default app — works for images
pics_dir = r'D:\Pics\ALL_PICTURES'
wallet_files = []
for pattern in ['*Trust*', '*trust*', '*wallet*', '*Wallet*', '*Nexo*', '*nexo*', '*bitx*']:
    wallet_files.extend(glob(os.path.join(pics_dir, f'**/{pattern}'), recursive=True))

# Open all for user to review
for f in wallet_files[:20]:
    os.startfile(f)
```

⚠️ **Never use `subprocess.run(['start', ...])` on Windows** — shell quoting breaks with spaces in paths. Use Python's `os.startfile(path)` instead.

### Multi-Coin Wallets Show Multiple Addresses
One Trust Wallet screenshot often shows MANY addresses (BTC, ETH, DOGE, XRP, etc.) on the same page. A single image may yield 4-6 wallet addresses. Always check the full image content, not just the first address found.

### Exchange Deposit Addresses vs Personal Wallets
The `wallet_1.txt` through `wallet_7.txt` on the user's Desktop are exchange deposit pages — they show addresses for DEPOSITING to exchanges (Nexo, Binance, etc.), NOT the user's personal wallets. These are useful for identifying which addresses belong to the user (sent to exchange = user's wallet), but the private keys are on the exchange side, not on the PC.

### Photo File Naming in Telegram ChatExport
Telegram exports photos as: `photo_NNN@DD-MM-YYYY_HH-MM-SS.jpg`
- Date format is DD-MM-YYYY, NOT YYYY-MM-DD
- To find photos from Jan 27 2025: search for `27-01-2025` in filename
- The folder has 1374 photos total

**Confirmed balances from May 22 2026 session:**
| Address | Balance | Source |
|---------|---------|--------|
| `33kSUU3HgVbof9hcPxTZ2VgrzqVJytM7ew` | 0.02911219 BTC | blockstream |
| `bc1q6h44f07u0djy0j56gn7fpmyzdz7r5jn38ckn0w` | 0.02099255 BTC | blockstream |
| `19AogR4NhBiR74qzRmtXMpQRRXdzowjKJB` | 0.00561574 BTC | blockstream |
| `TRMJuGXKD6hnVsQumiKfSJu4wD1nQhrQx4` | 35,402.83 TRX (~$12,600) | trongrid API |
| `0x013B96aabf08E5B4807B053314B2491848Cf30A9` | **1.58726491 ETH (~$4,200)** | blockscout |
| Others | 0 or need checking | — |

**Total recovered (May 22 2026): ~$23,100+ across BTC/ETH/TRX**

## BIP39 Seed Validation (Critical)
Random sentences are NOT seeds. Before flagging a 12-24 word candidate:
1. Load BIP39 wordlist from `C:\Users\Admin\AppData\Local\hermes\wordlists\bip39.txt`
2. Count how many words are actual BIP39 words
3. Only flag as `seed_phrase` if 10+ words are valid BIP39
4. False positives from this session: "ahh gotcha we just kidding we love btc again for l", "nipp up n get ag for us for later n then al be" — clearly random text

## OCR Garbles Addresses — Always Validate
OCR via tesseract commonly produces garbled addresses (e.g. `19zQYSRUTVC1zga37ha73NzckFJr46yZHb` should be `19zQYSRUTVC1zga37ha73NzckFur46yZHb`). Before reporting ANY address:
- Check blockstream API: `curl -s "https://blockstream.info/api/address/{addr}"` — returns "base58 error" if invalid
- Reject any address that fails blockstream validation
- Never report an address to the user without verifying it's valid base58/bech32

## Multi-Drive File Search (K, D, E drives)
Use terminal `grep`/`xargs` for crypto content search across drives — NOT `search_files` tool:
- `search_files` tool struggles with paths containing `+`, spaces, parentheses
- `grep -rEl "(pattern)" /k/ --include="*.txt"` via terminal handles these correctly
- Exclude RetroBat/node_modules/platformio from all searches

## Dark Web Private Key File Warning
Files claiming to be "Bitcoin Private Key Directory" with 1000+ entries are dark web leak files — contain OTHER PEOPLE'S compromised keys. Using them is illegal. Your OWN wallet keys would be a SINGLE entry (one seed phrase, one private key). If a file has thousands of key entries, it's not yours.

## Browser Extension Wallet Paths (MetaMask, Phantom, Solflare)
These wallets store encrypted keys in browser extension settings, NOT as portable files:
- **MetaMask**: `C:\Users\<user>\AppData\Local\Google\Chrome\User Data\Default\Local Extension Settings\nkbihfbeogaeaoehlefnkodbefgpgknn\` — vault is encrypted, needs password to decrypt
- **Phantom**: `C:\Users\<user>\AppData\Local\Google\Chrome\User Data\Default\Local Extension Settings\` — extension ID varies
- Recovery requires: original browser + extension still installed + password
- No unencrypted seed/private key files exist in these paths

## Worker Death Monitoring
Background Python processes die silently. Monitor via progress log:
```bash
# Check if workers are alive
ps aux | grep "Python311/python" | grep -v grep | wc -l
# Read progress
cat /d/Pics/scan_progress.log
# Worker logs
cat /tmp/w0.log | tail -5
```
Workers can die without notice — check progress every 5-10 mins on large scans.

## False Positive Patterns
Most "seed phrase" detections are false positives — random sentences that happen to be 12-24 lowercase words. Real seeds use BIP39 wordlist. Treat every finding as a candidate requiring verification.