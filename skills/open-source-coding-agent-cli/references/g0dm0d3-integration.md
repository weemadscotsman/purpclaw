# G0DM0D3 Integration — Full Pipeline Documentation

Ported from [G0DM0D3](https://github.com/elder-plinius/G0DM0D3) by Elder Plinius (AGPL-3.0).

## Architecture

Three engines ported as standalone lib files, zero external deps:

| file | lines | what it does |
|---|---|---|
| `lib/parseltongue.js` | 432 | Input obfuscation engine |
| `lib/autotune.js` | 639 | Context-adaptive sampling params |
| `lib/stm.js` | 153 | Semantic output normalization |
| `lib/tools/index.js` | +67 | 4 tool registrations |

All registered as tools: `parseltongue`, `autotune`, `stm`, `godmode`.

## Parseltongue — Input Obfuscation

6 techniques × 3 intensities (light/medium/heavy):

| technique | what it does |
|---|---|
| `leetspeak` | a→4, e→3, i→1, o→0, etc. |
| `unicode` | Cyrillic/Greek lookalikes (a→а, e→е) |
| `zwj` | Invisible zero-width characters between letters |
| `mixedcase` | aLtErNaTiNg or random case disruption |
| `phonetic` | ph→f, ck→k, qu→kw, soft c→s |
| `random` | Random mix of all above per word |

50 default triggers: hack, exploit, bypass, crack, malware, virus, jailbreak, nsfw, uncensored, etc.

Tool args: `{text, technique, intensity}`. Returns `{transformedText, triggersFound, transformations}`.

## AutoTune — Context-Adaptive Parameters

5 context types detected via regex patterns:
- `code` — programming/technical queries
- `creative` — writing/storytelling
- `analytical` — research/analysis
- `conversational` — casual chat
- `chaotic` — wild/experimental queries

5 strategies: `precise`, `balanced`, `creative`, `chaotic`, `adaptive` (auto-detects context).

Parameters tuned: temperature, top_p, top_k, frequency_penalty, presence_penalty, repetition_penalty.

Tool args: `{message, strategy}`. Returns `{params, detectedContext, confidence, reasoning}`.

## STM — Semantic Transformation Modules

3 modules:
1. **hedgeReducer**: Removes "I think", "perhaps", "It seems like", etc.
2. **directMode**: Removes preambles ("Sure!", "Great question!", "I'd be happy to help")
3. **casualMode**: Converts formal→casual (However→But, utilize→use, etc.)

Tool args: `{text, modules: ['hedgeReducer', 'directMode', 'casualMode']}`. Returns `{content}`.

## GODMODE Pipeline

Combined tool: `parseltongue(random, medium) → computeAutoTuneParams(adaptive) → output`. One call for red-teaming power.

## Known Limitations

- Parseltongue `detectTriggers()` uses word-boundary regex — won't catch compound words or leetspeak-encoded input
- AutoTune's adaptive strategy blends balanced at low confidence (<0.6) — conservative
- STM is regex-based, doesn't handle context-aware hedge removal
- NO external deps — pure JS, no npm install needed
- G0DM0D3 is AGPL-3.0 — the ported code portions inherit this license

## Live Verification

```
Parseltongue: "how to hack" → "how to #λck" (leetspeak, medium)
AutoTune: "write a function" → temp=0.425 (programming/technical 50% confidence)
STM: "Sure, I think perhaps the answer is 42" → "The answer is 42" (hedgeReducer + directMode)
```