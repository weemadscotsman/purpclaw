"""
Telegram ChatExport JSON parser — extracts crypto addresses, seed phrases, and credentials.
Run: python scan_telegram.py <path_to_result.json>

Finds: BTC, ETH, SOL, DOGE, XRP, XLM addresses + seed phrase candidates + private keys
Outputs: structured findings with timestamps
"""

import json, re, sys
from pathlib import Path

PATTERNS = {
    'BTC_P2PKH': re.compile(r'\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b'),
    'BTC_P2SH': re.compile(r'\b3[a-km-zA-HJ-NP-Z1-9]{25,34}\b'),
    'BTC_bech32': re.compile(r'\bbc1[a-zA-HJ-NP-Z0-9]{25,87}\b'),
    'ETH': re.compile(r'\b0x[a-fA-F0-9]{40}\b'),
    'SOL': re.compile(r'\b[1-9A-HJ-NP-Za-km-z]{32,44}\b'),
    'DOGE': re.compile(r'\bD[5-9A-HJ-NP-U][1-9A-HJ-NP-Z]{33}\b'),
    'XRP': re.compile(r'\br[1-9A-HJ-NP-Za-km-z]{24,34}\b'),
    'TRX': re.compile(r'\bT[1-9A-HJ-NP-Za-km-z]{33}\b'),
    'ALEO': re.compile(r'\baleo1[qpzryupx5]{48}\b'),
    'PK_hex': re.compile(r'\b[a-fA-F0-9]{64}\b'),
}

BIP39 = set(open(Path(__file__).parent / 'bip39_wordlist.txt').read().split()) if (Path(__file__).parent / 'bip39_wordlist.txt').exists() else set()

def extract_text(msg):
    text = msg.get('text', '')
    if isinstance(text, list):
        text = ' '.join(t.get('text', '') if isinstance(t, dict) else str(t) for t in text)
    return str(text)

def find_crypto(msg):
    findings = []
    text = extract_text(msg)
    for pname, rx in PATTERNS.items():
        for m in rx.finditer(text):
            v = m.group()
            if 30 <= len(v) <= 87:
                findings.append((pname, v, msg.get('date', ''), text[:80]))
    # Seed phrases: 12-24 word sequences with high BIP39 match
    words = re.findall(r'\b[a-z]{3,10}\b', text.lower())
    if 12 <= len(words) <= 24:
        match = sum(1 for w in words if w in BIP39) if BIP39 else 0
        if (BIP39 and match >= 8) or (not BIP39 and len(words) >= 12):
            findings.append(('SEED', ' '.join(words[:24]), msg.get('date', ''), f'{match} BIP39 words'))
    return findings

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else 'result.json'
    with open(path) as f:
        data = json.load(f)
    
    messages = data.get('messages', data)  # handle both dict and list formats
    if isinstance(data, dict):
        messages = data['messages']
    
    seen = set()
    for msg in messages:
        for ftype, val, date, ctx in find_crypto(msg):
            key = f'{ftype}:{val[:40]}'
            if key not in seen:
                seen.add(key)
                print(f'[{ftype}] {date}')
                print(f'  {val}')
                print(f'  ctx: {ctx[:60]}')
                print()

if __name__ == '__main__':
    main()