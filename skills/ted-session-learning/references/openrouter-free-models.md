# OpenRouter Free Models (May 25 2026 — UPDATED)

All models with `pricing.prompt == "0"` (free to use). HOWEVER: most are blocked by account settings.

## CONFIRMED WORKING (7 models — test with curl before assuming available)

| Model ID | Context | Modalities | Notes |
|----------|---------|------------|-------|
| google/gemma-4-31b-it:free | 262K | text+image+video | Best all-rounder, Google MoE |
| google/gemma-4-26b-a4b-it:free | 262K | text+image+video | Multimodal, slightly smaller |
| arcee-ai/trinity-large-thinking:free | 262K | text | Chain-of-thought reasoning |
| openai/gpt-oss-120b:free | 131K | text | Huge model, slower |
| openai/gpt-oss-20b:free | 131K | text | Fast, mid-size |
| z-ai/glm-4.5-air:free | 131K | text | Good multilingual/Chinese |
| openrouter/free | 200K | text+image | Smart router, picks available free model |

**Most reliable:** `openrouter/free` (always routes to whatever's up) and `openai/gpt-oss-20b:free` (smallest, fastest, least 429s).

## BLOCKED BY GUARDRAIL / DATA POLICY (15 models)

All return: `{"error":{"message":"No endpoints available matching your guardrail restrictions and data policy...","code":404}}`

Fix: openrouter.ai/settings → Account → disable data policy restrictions.

Once disabled, these would unlock:
- `deepseek/deepseek-v4-flash:free` (1M ctx — BEST context)
- `nvidia/nemotron-3-super-120b-a12b:free` (1M ctx, 120B)
- `minimax/minimax-m2.5:free` (204K ctx)
- `nvidia/nemotron-3-nano-30b-a3b:free` (256K ctx)
- `qwen/qwen3-coder:free` (1M ctx)
- `qwen/qwen3-next-80b-a3b-instruct:free` (262K ctx)
- `poolside/laguna-m.1:free` (131K ctx)
- `poolside/laguna-xs.2:free` (131K ctx)
- `meta-llama/llama-3.3-70b-instruct:free` (131K ctx)
- `meta-llama/llama-3.2-3b-instruct:free` (131K ctx)
- `nousresearch/hermes-3-llama-3.1-405b:free` (131K ctx, 405B)
- `nvidia/nemotron-nano-9b-v2:free` (128K ctx)
- `liquid/lfm-2.5-1.2b-instruct:free` (32K ctx)
- `liquid/lfm-2.5-1.2b-thinking:free` (32K ctx)
- `baidu/cobuddy:free` (131K ctx)

## PROVIDER-SIDE DOWN / RATE-LIMITED (not your account)

| Model | Status |
|-------|--------|
| `google/lyria-3-pro-preview` | 502 — provider down |
| `google/lyria-3-clip-preview` | 502 — provider down |
| `qwen/qwen3-coder:free` | 429 — rate-limited upstream, retry with 10-20s backoff |
| `nousresearch/hermes-3-llama-3.1-405b:free` | 429 — rate-limited |
| `meta-llama/llama-3.3-70b-instruct:free` | 429 — rate-limited |
| `cognitivecomputations/dolphin-mistral-24b-venice-edition:free` | 404 — endpoint removed |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | 404 — endpoint removed |
| `nvidia/nemotron-nano-12b-v2-vl:free` | 404 — endpoint removed |

## How to Test a Model

```python
import urllib.request, json, urllib.error

token = 'sk-or-... YOUR_OPENROUTER_KEY_HERE'
model = 'google/gemma-4-31b-it:free'

body = json.dumps({'model': model, 'messages': [{'role': 'user', 'content': 'OK'}], 'max_tokens': 5}).encode()
req = urllib.request.Request('https://openrouter.ai/api/v1/chat/completions', data=body,
    headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json',
             'HTTP-Referer': 'https://www.openrouter.ai', 'X-Title': 'Test'}, method='POST')
try:
    resp = urllib.request.urlopen(req, timeout=30)
    print('WORKS:', json.loads(resp.read())['choices'][0]['message']['content'])
except urllib.error.HTTPError as e:
    err = e.read().decode()
    print(f'ERR {e.code}: {err[:120]}')
```

## How to Fetch All Free Models (live list)

```python
import urllib.request, json
key = open(r'C:\\Users\\Admin\\AppData\\Local\\hermes\\.env').read()
token = [l.split('=',1)[1] for l in key.split('\\n')
         if 'OPENROUTER_API_KEY' in l and not l.strip().startswith('#')][0]
req = urllib.request.Request('https://openrouter.ai/api/v1/models',
    headers={'Authorization': f'Bearer {token}'})
resp = urllib.request.urlopen(req, timeout=15)
data = json.loads(resp.read())
free = [m for m in data['data'] if m.get('pricing',{}).get('prompt') == '0']
for m in sorted(free, key=lambda x: x.get('id','')):
    ctx = m.get('context_length',0) or 0
    mod = ' '.join(m.get('architecture',{}).get('input_modalities',[]))
    print(f"{m['id']} | ctx:{ctx//1000}K | {mod}")
```

## Error Code Reference

| HTTP | Error Contains | Meaning | Fix |
|------|---------------|---------|-----|
| 401 | `"User not found"` | OpenRouter account closed/revoked | Get new key |
| 401 | `"Unauthorized"` | Bad token format | Check `sk-or-` prefix |
| 404 | `"guardrail restrictions"` | Account data policy blocking | openrouter.ai/settings → disable |
| 404 | `"No endpoints found"` | Provider removed endpoint | No fix — wait for provider |
| 429 | anything | Provider rate-limiting | Retry with 10-20s backoff |
| 502 | anything | Provider down | No fix — wait for recovery |

**Key insight:** A 404 with "guardrail" in the error body means the MODEL IS FREE and AVAILABLE — your account is just blocking it. This is different from "No endpoints found" which means the provider took the endpoint offline.

## OpenRouter API Key Location
`.env` at `C:\\Users\\Admin\\AppData\\Local\\hermes\\.env` — working key: `OPENROUTER_API_KEY=sk-or-... PLACEHOLDER`

## API Key History
- Old key (revoked May 25 2026): was in .env but commented, returned 401 "User not found"
- New key (working May 25 2026): `sk-or-... PLACEHOLDER`
