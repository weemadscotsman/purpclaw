#!/bin/bash
# run-round-1.sh — Agent benchmark runner
# Runs all 4 agents non-interactively with the identical prompt.
# Captures diff, runtime, files touched, errors.

set -uo pipefail

ROOT="/e/god folder/02_ACTIVE_PROJECTS/PURPCLAW"
BENCH_DIR="$ROOT/docs/benchmark/round-1"
PROMPT_FILE="$ROOT/docs/benchmark/PROMPT.txt"

mkdir -p "$BENCH_DIR"
cd "$ROOT" || exit 2

# Sanity: baseline state
echo "===BASELINE STATE===" > "$BENCH_DIR/baseline.txt"
git status --short 2>&1 | grep -v "GOTHAM\|MLM\|ZAMP\|^D \.\." >> "$BENCH_DIR/baseline.txt"
echo "" >> "$BENCH_DIR/baseline.txt"
echo "Files tracked at HEAD:" >> "$BENCH_DIR/baseline.txt"
git ls-files 2>&1 | wc -l >> "$BENCH_DIR/baseline.txt"

# Sanity: prompt file exists
if [ ! -f "$PROMPT_FILE" ]; then
  echo "ERROR: $PROMPT_FILE not found"
  exit 2
fi
echo ""
echo "Prompt size: $(wc -c < "$PROMPT_FILE") bytes"
echo "Prompt lines: $(wc -l < "$PROMPT_FILE")"

# Pre-check: capture starting ref so we can diff after each run
START_REF=$(git rev-parse HEAD 2>&1)
echo "Starting ref: $START_REF"

run_agent() {
  local NAME=$1
  local CMD=$2
  local WORKDIR="${3:-$ROOT}"

  local AGENT_DIR="$BENCH_DIR/$NAME"
  mkdir -p "$AGENT_DIR"

  echo ""
  echo "=========================================="
  echo "RUNNING: $NAME"
  echo "  cmd: $CMD"
  echo "  workdir: $WORKDIR"
  echo "  output: $AGENT_DIR/output.txt"
  echo "=========================================="

  # Snapshot pre-state
  local PRE_REF=$(cd "$ROOT" && git rev-parse HEAD 2>&1)
  local PRE_TIME=$(date +%s)

  # Run the agent with the prompt
  cd "$WORKDIR" 2>&1
  echo "$PROMPT_FILE contents:" > "$AGENT_DIR/output.txt"
  cat "$PROMPT_FILE" >> "$AGENT_DIR/output.txt"
  echo "" >> "$AGENT_DIR/output.txt"
  echo "=== AGENT OUTPUT ===" >> "$AGENT_DIR/output.txt"

  cd "$WORKDIR" && timeout 600 $CMD < "$PROMPT_FILE" >> "$AGENT_DIR/output.txt" 2>&1
  local EXIT_CODE=$?
  local POST_TIME=$(date +%s)
  local RUNTIME=$((POST_TIME - PRE_TIME))

  cd "$ROOT"
  local POST_REF=$(git rev-parse HEAD 2>&1)

  # Capture diff vs pre-state
  echo "$POST_REF" > "$AGENT_DIR/post_ref.txt"
  echo "$RUNTIME" > "$AGENT_DIR/runtime.txt"
  echo "$EXIT_CODE" > "$AGENT_DIR/exit_code.txt"
  echo "$PRE_REF" "$POST_REF" > "$AGENT_DIR/refs.txt"

  # Files created/modified since this run started
  git diff --name-status "$PRE_REF" "$POST_REF" 2>&1 | grep -v "GOTHAM\|MLM\|ZAMP" > "$AGENT_DIR/files.txt"
  # Add any untracked files
  git status --short 2>&1 | grep -v "GOTHAM\|MLM\|ZAMP\|^D \.\." | grep "^??" > "$AGENT_DIR/untracked.txt"

  # Full diff
  git diff "$PRE_REF" "$POST_REF" 2>&1 > "$AGENT_DIR/full_diff.txt"

  # Stats
  local LINES_ADDED=$(git diff "$PRE_REF" "$POST_REF" 2>&1 | grep -c "^+[^+]")
  local LINES_REMOVED=$(git diff "$PRE_REF" "$POST_REF" 2>&1 | grep -c "^-[^-]")
  local FILES_TOUCHED=$(git diff --name-only "$PRE_REF" "$POST_REF" 2>&1 | wc -l)
  echo "lines_added: $LINES_ADDED" > "$AGENT_DIR/stats.txt"
  echo "lines_removed: $LINES_REMOVED" >> "$AGENT_DIR/stats.txt"
  echo "files_touched: $FILES_TOUCHED" >> "$AGENT_DIR/stats.txt"
  echo "exit_code: $EXIT_CODE" >> "$AGENT_DIR/stats.txt"
  echo "runtime_seconds: $RUNTIME" >> "$AGENT_DIR/stats.txt"

  # node --check on every JS file touched
  local SYNTAX_ERRORS=0
  > "$AGENT_DIR/syntax_check.txt"
  for f in $(git diff --name-only "$PRE_REF" "$POST_REF" 2>&1 | grep -E '\.(js|ts|jsx|tsx)$'); do
    if [ -f "$ROOT/$f" ]; then
      node --check "$ROOT/$f" 2>&1 >> "$AGENT_DIR/syntax_check.txt"
      local RC=$?
      if [ $RC -ne 0 ]; then
        SYNTAX_ERRORS=$((SYNTAX_ERRORS + 1))
      fi
    fi
  done
  echo "syntax_errors: $SYNTAX_ERRORS" >> "$AGENT_DIR/stats.txt"

  echo ""
  echo "Agent: $NAME"
  echo "  Runtime: ${RUNTIME}s"
  echo "  Exit: $EXIT_CODE"
  echo "  Files touched: $FILES_TOUCHED"
  echo "  Lines: +$LINES_ADDED -$LINES_REMOVED"
  echo "  Syntax errors: $SYNTAX_ERRORS"
}

# Sanity: each agent binary exists
for agent in codex claude hermes kilocode; do
  if ! command -v "$agent" >/dev/null 2>&1; then
    echo "ERROR: $agent not found on PATH"
    exit 2
  fi
done

# Verify the prompt is the same file used for all 4 agents
PROMPT_SHA=$(sha256sum "$PROMPT_FILE" | cut -d' ' -f1)
echo ""
echo "Prompt SHA256: $PROMPT_SHA"
echo "$PROMPT_SHA" > "$BENCH_DIR/prompt_sha256.txt"

# Run each agent
run_agent "codex" "codex exec --skip-git-repo-check -m gpt-5-codex"
run_agent "claude" "claude --print --dangerously-skip-permissions"
run_agent "hermes" "hermes --once --auto"
run_agent "kilocode" "kilocode --print --auto"

echo ""
echo "=========================================="
echo "ALL AGENTS COMPLETE"
echo "Results: $BENCH_DIR"
echo "=========================================="