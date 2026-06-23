# OCAP — Worked Examples

Side-by-side text vs OCAP output for each of the 4 wired tools, captured from a real e2e run on the omnicode-mcp repo itself. Use this as a sanity check when extending the format or debugging parsers.

## repo_map (10,103B OCAP vs 10,587B text — small win on this corpus)

### text
```
Repository Map:
- E:\god folder\02_ACTIVE_PROJECTS\omnicode-mcp\omnicode-mcp\CHANGELOG.md (0 symbols)
- E:\god folder\02_ACTIVE_PROJECTS\omnicode-mcp\omnicode-mcp\README.md (0 symbols)
- E:\god folder\02_ACTIVE_PROJECTS\omnicode-mcp\omnicode-mcp\src\tools\repo_map.ts (1 symbols)
...
```

### ocap
```
OCAP v1
t: repo_map
k: path,lang,symbols
intern path: 0=...CHANGELOG.md 1=...README.md 2=...src/tools/repo_map.ts ...
intern lang: 0=md 1=ts 2=js 3=json 4=cmd 5=sh 6=mjs ...
---
0	0	0
1	0	0
2	1	1
...
## files=104
```

Note: byte savings are small here (5%) because this repo has 100+ unique file paths and most are referenced once. On a real project with deep `src/...` trees and repeated parents, savings jump to 50-70%.

## search_symbols (OCAP recommended for ≥4 hits)

### text
```
[function] repoMap (E:\god folder\.../src/tools/repo_map.ts:4)
[function] searchSymbols (E:\god folder\.../src/tools/search_symbols.ts:101)
[function] spaghettiReport (E:\god folder\.../src/tools/spaghetti_report.ts:53)
[function] getContextBundle (E:\god folder\.../src/tools/get_context_bundle.ts:3)
— confidence 87% (gap 0.42 · strength 0.31 · identity 0.88 · freshness 0.95 · channels: identity+lexical+structural) · C.A.R=on
```

### ocap
```
OCAP v1
t: search_symbols
k: name,kind,path,line,score
intern kind: 0=function 1=class 2=method
intern path: 0=.../src/tools/repo_map.ts 1=.../src/tools/search_symbols.ts ...
---
repoMap		0	0	4	0.95
searchSymbols	0	1	50	0.87
spaghettiReport	0	2	53	0.82
getContextBundle	0	3	3	0.78
## query=repoMap confidence=87 car=on channels=identity+lexical+structural
```

Confidence / C.A.R / channel info lives in the `## ` footer. Path interning collapses 4 long Windows paths into 4 small integers.

## spaghetti_report (7,270B OCAP — biggest win)

### text (excerpt — full report is ~12KB)
```
# Spaghetti Report — Health 64/100  [C (knotted)]
Files: 105 · Lines: 48230 · Dependency edges: 187
Cyclic groups: 1 · God objects: 2 · Long files: 4 · Dead-code candidates: 33

## Cyclic Dependency Groups (1)
  • [high] E:\god folder\.../src/tools/test_map.ts
    Strongly connected files: .../test_map.ts <-> .../test_map.ts
    → Break the group by extracting shared logic into a neutral module...

## God Objects (2)
  • [high] E:\god folder\.../src/store/db.ts
    45 modules depend on this file.
    → Split along responsibilities; expose a smaller, stable interface.
  ...
```

### ocap
```
OCAP v1
t: spaghetti_report
k: type,severity,path,count,description
intern type: 0=Circular Dependency Group 1=God Object 2=Long File 3=Dead Code Candidate
intern severity: 0=high 1=medium 2=low
intern path: 0=.../test_map.ts 1=.../db.ts 2=.../embeddings.ts 3=.../cli.ts ...
---
0	0	0	0	Strongly connected files: ... <-> ...
1	0	1	45	45 modules depend on this file.
1	0	2	29	29 modules depend on this file.
2	1	3	1083	1083 lines.
2	1	4	974	974 lines.
2	1	5	501	501 lines.
2	1	6	590	590 lines.
3	2	7	0	No indexed incoming imports/calls and not recognized as an entry point or dynamic module.
...
## health=64 grade=C files=105 lines=48230 circular=1 god_objects=2 long_files=4 dead_code=33
```

Every violation is a single tab-separated row. Health/grade/file counts are in the footer — the agent can render a markdown table from the rows OR consume the structured form directly.

## get_context_bundle (1,069B OCAP — tightest)

### text
```
Context Bundle for [function] repoMap:
Defined in: E:\.../src/tools/repo_map.ts:4

--- SOURCE ---
export async function repoMap(repoPath: string) { ... }

--- RELATED SYMBOLS (Ranked by Importance) ---
[CALLER] function benchmarkRepo in E:\.../src/tools/benchmark.ts:
...
```

### ocap
```
OCAP v1
t: get_context_bundle
k: rel,name,kind,path,line,importance
intern kind: 0=function
intern path: 0=.../src/tools/repo_map.ts 1=.../src/store/db.ts 2=.../src/engine/manifest_scanner.ts ...
---
TARGET	repoMap		0	0	4	48.4589
CALLEE	initDb		0	1	0	444.4811
CALLEE	scanRepoManifests	0	2	0	137.7498
...
## target=repoMap max_tokens=2000 related=9
```

Note `rel` column: `TARGET` is always row 0 (the queried symbol). `CALLER` / `CALLEE` rows are the call graph around it. Sorted by importance descending.

## Parser sketch (Python)

```python
def parse_ocap(text: str) -> dict:
    lines = [l for l in text.split("\n") if l.strip()]
    assert lines[0] == "OCAP v1", f"bad header: {lines[0]!r}"
    out = {"header": lines[0]}
    buckets = {}
    rows = []
    footer = {}
    state = "head"  # head | rows | footer
    for line in lines[1:]:
        if line.startswith("t:"):
            out["tool"] = line[2:].strip()
        elif line.startswith("k:"):
            out["keys"] = line[2:].strip().split(",")
        elif line.startswith("intern "):
            # "intern kind: 0=function 1=class"
            name, body = line[len("intern "):].split(":", 1)
            buckets[name] = {int(k): v for k, v in (p.split("=", 1) for p in body.split())}
        elif line == "---":
            state = "rows"
        elif line.startswith("## "):
            for k, v in (p.split("=", 1) for p in line[3:].split()):
                footer[k] = v
        elif state == "rows":
            rows.append(line.split("\t"))
    return {"meta": out, "buckets": buckets, "rows": rows, "footer": footer}
```

Resolving a row: `buckets["path"][int(row[path_col])]` gives the file path string. Rows are tuples in the order declared by `k:`.
