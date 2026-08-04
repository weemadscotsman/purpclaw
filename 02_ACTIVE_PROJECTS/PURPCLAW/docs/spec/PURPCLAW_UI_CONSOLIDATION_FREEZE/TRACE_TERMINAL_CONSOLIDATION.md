# PURPCLAW Trace Terminal Consolidation

## Current problem

Trace Terminal renders too much repeated service-proxy noise, and identical log groups appear duplicated. This makes the panel look broken even when services are working.

## Required behaviour

Trace Terminal must be a dock, not a floating layout invader.

Controls:
- pause
- auto-scroll
- filter
- source selector
- copy
- clear
- expand
- collapse

## Event shape

Normalize all terminal events to:

| Field | Meaning |
|---|---|
| timestamp | event time |
| source | service / route / agent / job |
| level | ok / info / warn / error |
| type | proxy_fetch / proxy_failed / job_event / agent_action |
| message | concise readable line |
| raw | optional payload |

## Dedupe rule

If identical events repeat within a short window, collapse them:

Example:
GET :7792/health -> fetch failed x8

Instead of rendering the same failure eight times like a possessed receipt printer.

## Display rule

- cap visible logs
- virtualize large lists
- newest at bottom
- auto-scroll only when enabled
- pause stops UI updates
- clear only clears UI buffer unless backend clear is explicit
