# Generate Text API Reference

## Endpoint
```
POST /api/generate-text
Content-Type: application/json
```

## Request Body
```typescript
{
  prompt: string;
  systemInstruction?: string;
  videoBase64?: string;      // for video understanding
  videoMimeType?: string;
  provider?: 'minimax' | 'deepseek' | 'openrouter' | 'gemini';
  model?: string;
}
```

## Response
```json
{ "text": "AI generated response" }
```

## Error Response
```json
{ "error": "error message" }
```

---

## Provider → Endpoint Mapping

| Provider | Endpoint |
|----------|----------|
| minimax | `https://api.minimax.io/v1/chat/completions` |
| deepseek | `https://api.deepseek.com/chat/completions` |
| openrouter | `https://openrouter.ai/api/v1/chat/completions` |

## Headers

- `Authorization: Bearer {API_KEY}`
- MiniMax/OpenRouter: pass key via `x-minimax-key` or `x-openrouter-key` header, or use env var
- OpenRouter extra headers: `HTTP-Referer: https://karenator.com`, `X-Title: Karenator 3000`

## Common Errors

### 401 Unauthorized
```
{"error":{"message":"User not found","code":401}}
```
→ API key is invalid or placeholder (e.g. `sk-or-v1-placeholder`)

### 404 Model not found
```
{"error":{"message":"deepseek/deepseek-chat-v1.5 is not a valid model ID","code":400}}
```
→ Wrong model ID. Use `deepseek/deepseek-chat` (no version suffix for base model)

### 404 Privacy guardrails
```
{"error":{"message":"No endpoints available matching your guardrail restrictions...","code":404}}
```
→ Free models (`:free` suffix) blocked by OpenRouter privacy settings. Disable at https://openrouter.ai/settings/privacy

---

## Message Format Sent to API
```json
{
  "model": "deepseek/deepseek-chat",
  "messages": [
    ...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []),
    { role: "user", content: prompt }
  ]
}
```

MiniMax checks for `data.base_resp.status_code !== 0` — throws if non-zero.

DeepSeek/OpenRouter checks for `data.choices[0].message.content` — throws if missing.