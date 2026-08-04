#!/usr/bin/env python3
import base64, subprocess, json, os, tempfile, sys

interp = sys.executable
BASE = "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW"
REPO = "weemadscotsman/purpclaw"

files = [
    'divisions/engineering/memory/handoff-engineering.md',
    'docs/generated/OSRT.md',
    'docs/generated/DOC_VS_STACK_COMPARISON.md',
    'docs/generated/push.py',
]

for fname in files:
    path = os.path.join(BASE, fname)
    if not os.path.exists(path):
        print(f"SKIP: {fname} (not found)")
        continue
    with open(path, 'rb') as f:
        content = f.read()
    data = base64.b64encode(content).decode()

    r1 = subprocess.run(
        [interp, '-c',
         f'import subprocess; r=subprocess.run(["gh","api","repos/{REPO}/contents/{fname}","--jq",".sha"],capture_output=True,text=True); print(r.stdout.strip() if r.returncode==0 else "")'],
        capture_output=True, text=True)
    sha = r1.stdout.strip()

    payload = json.dumps({'message': f'docs: update {fname}', 'content': data, 'sha': sha if sha else None})

    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8') as tmp:
        tmp.write(payload)
        tmp_path = tmp.name

    r2 = subprocess.run(
        ['gh', 'api', '-X', 'PUT', f'repos/{REPO}/contents/{fname}',
         '--input', tmp_path],
        capture_output=True, text=True)
    os.unlink(tmp_path)

    if r2.returncode == 0:
        resp = json.loads(r2.stdout)
        sha7 = resp.get('commit', {}).get('sha', '?')[:7]
        print(f'OK: {fname} -> {sha7}')
    else:
        print(f'FAIL: {fname}')
        print(r2.stderr[:200])
