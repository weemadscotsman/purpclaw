import base64, subprocess, json, sys

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

    sha_result = subprocess.run(
        ['gh', 'api', f'repos/{REPO}/contents/{fname}', '--jq', '.sha'],
        capture_output=True, text=True)
    sha = sha_result.stdout.strip() if sha_result.returncode == 0 else None

    args = ['gh', 'api', '-X', 'PUT', f'repos/{REPO}/contents/{fname}',
            '-f', f'message=docs: update {fname}',
            '-f', f'content={data}']
    if sha:
        args += ['-f', f'sha={sha}']

    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode == 0:
        resp = json.loads(result.stdout)
        print(f'OK: {fname} -> {resp.get("commit",{}).get("sha","?")[:7]}')
    else:
        print(f'FAIL: {fname} -> {result.stderr[:300]}')
