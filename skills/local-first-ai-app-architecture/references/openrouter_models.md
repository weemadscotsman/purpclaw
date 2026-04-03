# OpenRouter Models Reference

Date: May 2026
Total models: 356
Free tier models: 25

## Free Tier Models (`:free` suffix)

```
baidu/cobuddy:free
cognitivecomputations/dolphin-mistral-24b-venice-edition:free
deepseek/deepseek-v4-flash:free
google/gemma-4-26b-a4b-it:free
google/gemma-4-31b-it:free
liquid/lfm-2.5-1.2b-instruct:free
liquid/lfm-2.5-1.2b-thinking:free
meta-llama/llama-3.2-3b-instruct:free
meta-llama/llama-3.3-70b-instruct:free
minimax/minimax-m2.5:free
nvidia/nemotron-3-nano-30b-a3b:free
nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
nvidia/nemotron-3-super-120b-a12b:free
nvidia/nemotron-nano-12b-v2-vl:free
nvidia/nemotron-nano-9b-v2:free
nousresearch/hermes-3-llama-3.1-405b:free
openai/gpt-oss-120b:free
openai/gpt-oss-20b:free
openrouter/free
poolside/laguna-m.1:free
poolside/laguna-xs.2:free
qwen/qwen3-coder:free
qwen/qwen3-next-80b-a3b-instruct:free
arcee-ai/trinity-large-thinking:free
z-ai/glm-4.5-air:free
```

## Image Capable Models

```
google/gemini-2.5-flash-image (FREE)
google/gemini-3.1-flash-image-preview (FREE)
google/gemini-3-pro-image-preview (paid)
openai/gpt-5.4-image-2 (paid)
openai/gpt-5-image-mini (paid)
openai/gpt-5-image (paid)
```

## Vision Capable Models

```
nvidia/nemotron-nano-12b-v2-vl:free
qwen/qwen3-vl-8b-instruct
qwen/qwen3-vl-32b-instruct
qwen/qwen3-vl-30b-a3b-instruct
qwen/qwen2.5-vl-72b-instruct
meta-llama/llama-3.2-11b-vision-instruct
baidu/ernie-4.5-vl-28b-a3b
```

## Note on Video Generation

OpenRouter does NOT have video generation models (Sora, Kling, Runway, etc.).
For video: use Runway ML API, Luma Photon API, Kling AI API, or Pika Labs API directly.
These require separate API keys and are paid per second/minute.

## API Endpoint

```
GET https://openrouter.ai/api/v1/models
Authorization: Bearer <your-api-key>
```

No authentication required to list models (uses dummy key).