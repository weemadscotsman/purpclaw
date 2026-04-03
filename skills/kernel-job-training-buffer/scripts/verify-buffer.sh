#!/bin/bash
# verify-buffer.sh — verify the kernel-job-training-buffer is wired correctly.
#
# Checks:
#   1. Training directory exists and is writable
#   2. lib/training-buffer.js exists and exports { TrainingBuffer }
#   3. The kernel's finishJob() hooks the buffer (grep for the marker)
#   4. The CLI's training subcommand is wired into the dispatcher
#   5. The buffer can record a synthetic job and export it
#   6. Disk usage is sane
#
# Usage: bash scripts/verify-buffer.sh [stack_root]

set -e

STACK_ROOT="${1:-.}"
TRAIN_DIR="${PURPCLAW_TRAINING_DIR:-E:/training}"

fail=0

echo "═══ kernel-job-training-buffer :: verify-buffer ═══"
echo "stack: $STACK_ROOT"
echo "train dir: $TRAIN_DIR"
echo

# 1. Directory exists + writable
echo "[1] training directory exists + writable"
if [ -d "$TRAIN_DIR" ]; then
  if [ -w "$TRAIN_DIR" ]; then
    echo "    ✓ $TRAIN_DIR exists and is writable"
  else
    echo "    ✗ $TRAIN_DIR exists but is NOT writable"
    fail=1
  fi
else
  echo "    ⚠ $TRAIN_DIR does not exist (will be created on first record)"
  mkdir -p "$TRAIN_DIR" 2>/dev/null || {
    echo "    ✗ cannot create $TRAIN_DIR"
    fail=1
  }
fi

# 2. training-buffer.js exists and exports TrainingBuffer
echo
echo "[2] lib/training-buffer.js exists + exports"
if [ -f "$STACK_ROOT/lib/training-buffer.js" ]; then
  if grep -q "class TrainingBuffer" "$STACK_ROOT/lib/training-buffer.js"; then
    echo "    ✓ TrainingBuffer class defined"
  else
    echo "    ✗ TrainingBuffer class not found in lib/training-buffer.js"
    fail=1
  fi
  if grep -q "module.exports" "$STACK_ROOT/lib/training-buffer.js"; then
    echo "    ✓ module.exports present"
  else
    echo "    ✗ no module.exports in lib/training-buffer.js"
    fail=1
  fi
else
  echo "    ✗ lib/training-buffer.js not found"
  fail=1
fi

# 3. Kernel hooks the buffer
echo
echo "[3] kernel finishJob() hooks the buffer"
# Look for the marker we used: "_trainingBuffer.record" or
# "TrainingBuffer().record" in the kernel's finishJob
if grep -qE "(TrainingBuffer|training-buffer)" "$STACK_ROOT/lib/api-harness-kernel.js" 2>/dev/null; then
  echo "    ✓ buffer is referenced in api-harness-kernel.js"
else
  echo "    ✗ buffer is NOT referenced in api-harness-kernel.js — finishJob() doesn't record"
  fail=1
fi

# 4. CLI dispatcher
echo
echo "[4] 'training' subcommand is wired into the CLI"
if grep -qE "case 'training'" "$STACK_ROOT/bin/"*.js 2>/dev/null; then
  echo "    ✓ case 'training' found in CLI dispatcher"
else
  echo "    ⚠ 'training' subcommand not found — operators can't run 'your-cli training status'"
fi

# 5. End-to-end record + export
echo
echo "[5] end-to-end: record a synthetic job, export as chatml"
node -e "
const { TrainingBuffer } = require('$STACK_ROOT/lib/training-buffer.js');
const buf = new TrainingBuffer();
const r = buf.record({
  id: 'verify-' + Date.now(),
  route: 'verify-test',
  state: 'completed',
  goal: 'verify test query',
  finalReport: 'verified',
  events: [{ stage: 'kernel', type: 'completed' }],
  createdAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  tags: ['verify'],
});
if (!r.recorded) { console.error('    ✗ record failed:', r); process.exit(1); }
const exp = buf.export({ format: 'chatml' });
if (exp.error) { console.error('    ✗ export failed:', exp); process.exit(1); }
console.log('    ✓ recorded to ' + r.file);
console.log('    ✓ exported ' + exp.count + ' records to ' + exp.file);
" 2>&1 | sed 's/^/    /' || { echo "    ✗ end-to-end test failed"; fail=1; }

# 6. Disk usage
echo
echo "[6] disk usage under $TRAIN_DIR"
if [ -d "$TRAIN_DIR" ]; then
  raw_size=$(du -sh "$TRAIN_DIR/raw" 2>/dev/null | awk '{print $1}')
  exp_size=$(du -sh "$TRAIN_DIR/exports" 2>/dev/null | awk '{print $1}')
  echo "    raw/:     ${raw_size:-empty}"
  echo "    exports/: ${exp_size:-empty}"
  echo "    (a single trajectory is ~500 bytes; 1k trajectories ≈ 500KB)"
fi

echo
if [ $fail -eq 0 ]; then
  echo "═══ verify-buffer: PASS ═══"
  exit 0
else
  echo "═══ verify-buffer: FAIL ═══"
  exit 1
fi
