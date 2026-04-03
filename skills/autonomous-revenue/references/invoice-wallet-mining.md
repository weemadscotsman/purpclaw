# Invoice Wallet Mining — E:\Telegram XLSX → Crypto Addresses

## What This Does
Scans E:\Telegram for XLSX invoice files sent by Telegram, extracts wallet addresses (TRC20, BTC, ETH) and email fields from shared strings, confirms which wallet is actually active on-chain.

## Why It Matters
Invoice files contain real wallet addresses used in actual transactions. These are the ONLY wallet addresses that have been verified to work. Addresses found in HTML project files are often stale (e.g., `TLREQThH8cwEXCXtNHQq2QZSi8NHFwo8wG4` → dead; `TRMJuGXKD6hnVsQumiKfSJu4wD1nQhrQx4` → confirmed active).

## Script
```python
import zipfile, xml.etree.ElementTree as ET, re, os

telegram_dir = '/e/Telegram/'
wallet_patterns = {
    'trc20': lambda s: len(s) == 34 and s.startswith('T'),
    'btc': lambda s: s.startswith(('1', '3', 'bc1')),
    'eth': lambda s: s.startswith('0x') and len(s) == 42,
}

for fname in os.listdir(telegram_dir):
    if fname.endswith('.xlsx') and 'invoice' in fname.lower():
        path = os.path.join(telegram_dir, fname)
        print(f"\n=== {fname} ===")
        try:
            with zipfile.ZipFile(path, 'r') as z:
                strings = []
                try:
                    with z.open('xl/sharedStrings.xml') as f:
                        tree = ET.parse(f)
                        strings = [t.text or '' for t in tree.iter() if t.text]
                except: pass

                for wtype, check in wallet_patterns.items():
                    found = [s for s in strings if check(s)]
                    if found:
                        print(f"  [{wtype.upper()}] {found}")

                for fname_xml in z.namelist():
                    if 'sheet' in fname_xml.lower() and fname_xml.endswith('.xml'):
                        try:
                            with z.open(fname_xml) as f:
                                content = f.read().decode('utf-8', errors='ignore')
                                for m in re.finditer(r'<v>([1T0xbc][a-km-zA-HJ-NP-Z0-9]{20,})</v>', content):
                                    val = m.group(1)
                                    for wtype, check in wallet_patterns.items():
                                        if check(val):
                                            print(f"  [{wtype.upper()}] RAW: {val}")
                        except: pass
        except Exception as e:
            print(f"  ERROR: {e}")
```

## On-Chain Verification
```bash
# TRC20
curl -s "https://api.trongrid.io/v1/accounts/TRMJuGXKD6hnVsQumiKfSJu4wD1nQhrQx4"

# BTC
curl -s "https://blockstream.info/api/address/bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
```

## Known Active Addresses (May 2026)
| Currency | Address | Source | Status |
|----------|---------|--------|--------|
| USDT (TRC-20) | `TRMJuGXKD6hnVsQumiKfSJu4wD1nQhrQx4` | `Edward AE1 LITE 300M 1pcs invoice 20250423.xlsx` | CONFIRMED ACTIVE |
| USDT (TRC-20) | `TLREQThH8cwEXCXtNHQq2QZSi8NHFwo8wG4` | cann-ai-music-sale HTML | DEAD — 404 on trongrid.io |
| BTC | `bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh` | cann-ai-music-sale HTML | Unverified |
| ETH | `0xdb78d5C856E0deAB4a422622c21b89B9cdD632b8` | crypto-donate-page HTML | Unverified |