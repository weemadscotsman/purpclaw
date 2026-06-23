# Feature matrix template

Use this to map N divergent versions of a codebase before merging.

## Version inventory

| Version | Path | Status | Language | Build system | Has Docker | Has tests | Has docs |
|---|---|---|---|---|---|---|---|
| V1 (GENESIS) | path/ | working/broken/abandoned | ts/js/py | ts-node/esm/cjs | yes/no | yes/no | yes/no |
| V2 (OPERATIONAL) | path/ | ... | | | | | |
| V3 (TERMINAL) | path/ | ... | | | | | |

## Service comparison

| Service | V1 has? | V2 has? | V3 has? | Best impl | Action |
|---|---|---|---|---|---|
| oracle (price feed) | | | | | keep from X / port / bin |
| governor (risk) | | | | | |
| trader (execution) | | | | | |
| ui (dashboard) | | | | | |
| dre (kill switch) | | | | | |
| telegraph (telegram) | | | | | |

## NATS subject naming

| Subject | V1 name | V2 name | V3 name | Standardize to |
|---|---|---|---|---|
| oracle tick | | | | |
| governor decision | | | | |
| trade propose | | | | |

## Issues / bugs (per ACTUALLY_TESTED_REPORT)

| Issue | Where | Fixed in merge? |
|---|---|---|
| | | |

## Bin list

| Path | Reason for binning | Preserved in _archive? |
|---|---|---|
| | | |
