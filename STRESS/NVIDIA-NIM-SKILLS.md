# NVIDIA NIM Skills — Wired into PURPCLAW

**Date:** 2026-06-14
**Keys active:** 4 (hermes, purpclaw1, purpclaw2, purpclaw3)
**Rotation:** round-robin, ~160 RPM aggregate

## The 15 skills, by domain + division

### developer_tools → ENGINEERING (5)
| Tool | Model | What it does |
|---|---|---|
| `nim_build_with_nim` | meta/llama-3.1-8b-instruct | Walk a dev through their first NIM chat app |
| `nim_embeddings_quickstart` | nvidia/nv-embedqa-e5-v5 | Generate embeddings for a corpus |
| `nim_code_review` | deepseek-ai/deepseek-v4-flash | AI code review for a single file |
| `nim_pr_summary` | meta/llama-3.1-70b-instruct | Summarize a diff in under 200 words |
| `nim_test_generator` | deepseek-ai/deepseek-coder-6.7b-instruct | Unit tests for a function |

### accelerated_computing → INFRASTRUCTURE (5)
| Tool | Model | What it does |
|---|---|---|
| `nim_gpu_perf_hints` | meta/llama-3.1-8b-instruct | GPU perf tuning tips |
| `nim_tensorrt_llm_build` | mistralai/mistral-7b-instruct-v0.3 | TensorRT-LLM engine build commands |
| `nim_cuda_kernel_explain` | meta/llama-3.1-70b-instruct | Line-by-line CUDA kernel walkthrough |
| `nim_nemo_train` | meta/llama-3.1-8b-instruct | NeMo framework train command |
| `nim_triton_serve` | meta/llama-3.1-8b-instruct | Triton Inference Server config |

### ai_and_machine_learning → INTELLIGENCE (5)
| Tool | Model | What it does |
|---|---|---|
| `nim_rag_langchain` | meta/llama-3.1-70b-instruct | LangChain + NIM RAG pipeline |
| `nim_nemo_guardrails` | meta/llama-3.1-8b-instruct | NeMo Guardrails config |
| `nim_finetune_lora` | meta/llama-3.1-8b-instruct | LoRA fine-tune recipe |
| `nim_prompt_optimize` | meta/llama-3.1-70b-instruct | Optimize a prompt for a target model |
| `nim_model_compare` | deepseek-ai/deepseek-v4-pro | Compare two NIM models on a prompt |

## End-to-end proof (just now)

```
node -e "TOOLS.tools.get('nim_gpu_perf_hints').execute({prompt: '...'});"
  ok:    true
  model: meta/llama-3.1-8b-instruct
  text:  Here are three bullets on optimizing GPU performance...
  usage: prompt=48, completion=293, total=341 tokens
```

## Tool counts (final)

| Bucket | Count |
|---|---:|
| Hermes skills | 378 |
| PC tools | 49 |
| Native tools | 29 |
| **NIM skills** | **15** |
| **Total** | **471** |

## Files

- `lib/nvidia/nim-skills.js` (NEW, 220 lines) — 15 skills + 4-key rotation + retry/timeout
- `lib/tools/index.js` (MODIFIED) — registers NIM skills at boot
- `STRESS/NVIDIA-NIM-SKILLS.md` (NEW, this doc)

## ⚠️ Security note (added 2026-06-14)

The 4 NVIDIA API keys (hermes, purpclaw1, purpclaw2, purpclaw3) were **pasted in chat history**. Treat them as **exposed**. Recommended action:

1. **Delete the 4 keys in https://build.nvidia.com → API Keys**
2. **Generate 4 fresh ones** (still free, still 1-year validity)
3. **Update .env** with the new values
4. **Add `.env.nvidia` to .gitignore** — done in this commit
5. **Never paste full keys in chat again** — use masked `***` in notes

The 5-key lane assignment architecture (hermes / purp1 / purp2 / purp3) is correct and working — only the actual key values need rotation.
