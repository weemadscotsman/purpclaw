import base64, subprocess, json, os, tempfile

BASE = "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW"
REPO = "weemadscotsman/purpclaw"

files = [
    'CHANGELOG.md',
    'docs/SYSTEM_TRUTH.md',
    'docs/runtime/RUNTIME_CROSSWALK.md',
    'docs/generated/OSRT.md',
]

for fname in files:
    path = f"{BASE}/{fname}"
    with open(path, 'rb') as f:
        content = f.read()
    data = base64.b64encode(content).decode()

    # Get SHA
    r1 = subprocess.run(
        ['gh', 'api', f'repos/{REPO}/contents/{fname}', '--jq', '.sha'],
        capture_output=True, text=True)
    sha = r1.stdout.strip() if r1.returncode == 0 else None

    # Build payload
    payload = {
        'message': f'docs: update {fname}',
        'content': data,
    }
    if sha:
        payload['sha'] = sha

    tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
    json.dump(payload, tmp)
    tmp.close()

    r2 = subprocess.run(
        ['gh', 'api', '-X', 'PUT', f'repos/{REPO}/contents/{fname}',
         '-F', f'@{tmp.name}'],
        capture_output=True, text=True)
    os.unlink(tmp.name)

    if r2.returncode == 0:
        resp = json.loads(r2.stdout)
        print(f'OK: {fname} -> {resp.get("commit",{}).get("sha","?")[:7]}')
    else:
        print(f'FAIL: {fname} -> {r2.stderr[:300]}')
