# OmniCode Benchmark v2.0.0

Repo: E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW
Generated: 2026-06-01T23:45:44.581Z

Source bytes (MEASURED): 14957147 · Files: 1857 · est. tokens (bytes÷4): 3739287
Indexed: 2261 files · Symbols: 4838 · Edges: 15936 · Blindspots: 1978
Resolution: 88.18% source coverage · 2261 files accounted · 0 unknown · 50 blocking gaps

| Operation | Baseline bytes | Payload bytes | Reduction | Measurement |
|---|---:|---:|---:|---|
| index | 14957147 | 803 | 99.994631% | measured_payload_bytes_vs_measured_source_bytes |
| repo_map | 14957147 | 20755 | 99.861237% | measured_payload_bytes_vs_measured_source_bytes |
| file_outline | 172640 | 2318 | 98.657322% | measured_payload_bytes_vs_measured_parseable_source_file_bytes |
| search_symbols | 14957147 | 1050 | 99.992980% | measured_payload_bytes_vs_measured_source_bytes |
| spaghetti_report | 14957147 | 21516 | 99.856149% | measured_payload_bytes_vs_measured_source_bytes |

Cumulative (MEASURED bytes): 60001228 → 46442 bytes = 99.922598% reduction.
Warm query average payload: 11410 bytes (~2853 est. tokens).

## Anomalies
- scan_stop:complete
- high_blindspot_rate:87.5%
- largest_file_skipped_artifact:yolov8n.pt:6549796
- file_outline_selector:source_only

Measurement: BYTES are exact (file sizes + utf-8 payload byte length) — the ground-truth reduction. Token counts are a labeled estimate (bytes ÷ 4), never the headline. All baselines are measured; no modeled ratios.