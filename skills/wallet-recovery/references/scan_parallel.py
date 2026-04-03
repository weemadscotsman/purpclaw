"""Parallel wallet scanner for large image folders.
Usage: python scan_parallel.py <start_idx> <end_idx> [output_log]

Scans files sorted(os.listdir(IMG_DIR))[start_idx:end_idx] and writes findings to LOG_FILE.
"""
import subprocess, os, re, sys

TESSERACT = r'C:\Program Files\Tesseract-OCR\tesseract'
IMG_DIR = r'D:\Pics\ALL_PICTURES'
OUTPUT_FILE = r'D:\Pics\wallet_findings.txt'
LOG_FILE = r'D:\Pics\scan_progress.log'

PATTERNS = {
    'bitcoin_p2pkh': re.compile(r'\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b'),
    'bitcoin_bech32': re.compile(r'\bbc1[a-zA-HJ-NP-Z0-9]{25,87}\b'),
    'ethereum': re.compile(r'\b0x[a-fA-F0-9]{40}\b'),
    'privkey_hex': re.compile(r'\b[a-fA-F0-9]{64}\b'),
    'privkey_base58': re.compile(r'\b[5KL][1-9a-km-zA-HJ-NP-Z]{50,51}\b'),
}

def ocr(path):
    try:
        r = subprocess.run([TESSERACT, path, 'stdout', '-l', 'eng', '--psm', '6'],
                          capture_output=True, text=True, timeout=30)
        return r.stdout
    except:
        return ""

def find_crypto(text, fname):
    results = []
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        for m in PATTERNS['ethereum'].finditer(line):
            v = m.group()
            if not v.startswith('0x0000000000'):
                results.append((fname, 'ethereum', v))
        for m in PATTERNS['bitcoin_p2pkh'].finditer(line):
            results.append((fname, 'bitcoin', m.group()))
        for m in PATTERNS['bitcoin_bech32'].finditer(line):
            results.append((fname, 'bitcoin_bc1', m.group()))
        for m in PATTERNS['privkey_hex'].finditer(line):
            results.append((fname, 'privkey_hex', m.group()))
        for m in PATTERNS['privkey_base58'].finditer(line):
            results.append((fname, 'privkey_base58', m.group()))
        words = line.split()
        if 12 <= len(words) <= 24 and all(re.match(r'^[a-z]+$', w) for w in words):
            results.append((fname, 'seed_phrase', line))
    return results

if __name__ == '__main__':
    start_idx = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    end_idx = int(sys.argv[2]) if len(sys.argv) > 2 else start_idx + 3000

    files = sorted(os.listdir(IMG_DIR))
    total = len(files)
    found = []

    print(f"Worker: files {start_idx}-{end_idx} ({total} total)", flush=True)

    for i in range(start_idx, min(end_idx, total)):
        if (i - start_idx) % 200 == 0:
            print(f"Progress: {i-start_idx}/{end_idx-start_idx}", flush=True)

        fname = files[i]
        path = os.path.join(IMG_DIR, fname)
        if not os.path.isfile(path):
            continue

        text = ocr(path)
        results = find_crypto(text, fname)

        if results:
            for item in results:
                found.append(item)
                print(f"  *** FOUND: {item[0]} | {item[1]} | {item[2][:50]}", flush=True)

    print(f"Worker done: {len(found)} items found", flush=True)