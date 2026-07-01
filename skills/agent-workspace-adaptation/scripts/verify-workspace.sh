#!/bin/bash
# verify-workspace.sh — run after an agent-workspace adaptation
#
# Checks:
#   1. All 12 expected files exist
#   2. Each file is non-empty
#   3. Brace / paren / bracket balance is OK in the .md files (catches
#      a half-written file)
#   4. INDEX.md references the same 12 files that exist on disk
#
# Usage: bash scripts/verify-workspace.sh <workspace_dir>

set -e

WORKSPACE="${1:-./workspace}"

EXPECTED=(
  "INDEX.md"
  "SOUL.md"
  "IDENTITY.md"
  "USER.md"
  "AGENTS.md"
  "HEARTBEAT.md"
  "TOOLS.md"
  "MEMORY.md"
  "SYSTEM_PROMPT.md"
  "BOOT.md"
  "BOOTSTRAP.md"
  "SKILL_SUMMARY.md"
)

fail=0

echo "═══ agent-workspace-adaptation :: verify-workspace ═══"
echo "workspace: $WORKSPACE"
echo

# 1. Existence + non-empty
echo "[1] existence + non-empty"
for f in "${EXPECTED[@]}"; do
  path="$WORKSPACE/$f"
  if [ ! -f "$path" ]; then
    echo "    ✗ MISSING: $f"
    fail=1
  elif [ ! -s "$path" ]; then
    echo "    ✗ EMPTY:   $f"
    fail=1
  else
    lines=$(wc -l < "$path")
    bytes=$(wc -c < "$path")
    echo "    ✓ $f  ($lines lines, $bytes bytes)"
  fi
done

# 2. Brace/paren/bracket balance (best-effort — these are markdown
#    so there can be code blocks, but a wildly unbalanced file is a
#    red flag for a half-written adaptation)
echo
echo "[2] brace/paren/bracket balance (best-effort)"
for f in "${EXPECTED[@]}"; do
  path="$WORKSPACE/$f"
  [ -f "$path" ] || continue
  python3 - "$path" <<'PYEOF' || true
import sys
p = sys.argv[1]
with open(p, 'r', encoding='utf-8') as fh:
    src = fh.read()
# strip code fences to avoid counting code
in_fence = False
clean = []
for line in src.split('\n'):
    if line.strip().startswith('```'):
        in_fence = not in_fence
        continue
    if in_fence:
        continue
    clean.append(line)
src = '\n'.join(clean)
depth = paren = bracket = 0
for c in src:
    if c == '{': depth += 1
    elif c == '}': depth -= 1
    elif c == '(': paren += 1
    elif c == ')': paren -= 1
    elif c == '[': bracket += 1
    elif c == ']': bracket -= 1
if depth or paren or bracket:
    print(f"    ⚠ {p.split('/')[-1]}: braces={depth} parens={paren} brackets={bracket}")
    sys.exit(1)
else
    print(f"    ✓ {p.split('/')[-1]}: balanced")
PYEOF
done

# 3. INDEX.md mentions the 12 files
echo
echo "[3] INDEX.md cross-references"
index="$WORKSPACE/INDEX.md"
if [ -f "$index" ]; then
  missing_in_index=()
  for f in "${EXPECTED[@]}"; do
    if ! grep -q "$f" "$index"; then
      missing_in_index+=("$f")
    fi
  done
  if [ ${#missing_in_index[@]} -gt 0 ]; then
    echo "    ⚠ INDEX.md does not mention: ${missing_in_index[*]}"
  else
    echo "    ✓ INDEX.md mentions all 12 expected files"
  fi
fi

echo
if [ $fail -eq 0 ]; then
  echo "═══ verify-workspace: PASS ═══"
  exit 0
else
  echo "═══ verify-workspace: FAIL ═══"
  exit 1
fi
