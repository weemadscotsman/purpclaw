# CLAW TASK: Add Retry-With-Backoff to SAMANTHA's System Prompt

## Objective
Add retry-with-backoff and patience behavior directly to SAMANTHA's system prompt on xiaozhi.me dashboard.

## Why This Matters
The SURVIVAL_GUIDE injects into memory on bridge boot, BUT:
- Memory is secondary to system prompt
- If system prompt says "timeout after 10s", she'll timeout
- The patience behavior must be PRIMARY, not secondary

## Step-by-Step

### 1. Go to Xiaozhi Dashboard
- URL: https://xiaozhi.me/dashboard
- Login with account linked to agent ID 1657456

### 2. Find Agent Settings
- Look for "System Prompt" or "Agent Configuration"
- Or look for "SAMANTHA" agent in your agents list

### 3. Add These Rules to System Prompt

Copy-paste this section and add it to SAMANTHA's existing system prompt:

---

## RETRY-WITH-BACKOFF (CRITICAL)

When a command doesn't respond immediately:

1. **Wait 3-5 seconds minimum** before assuming failure
2. **Poll for state** using tools: `window_list`, `process_list`, `browser_tabs`
3. **Retry with exponential backoff**:
   - Attempt 1 fails → Wait 2s → Retry
   - Attempt 2 fails → Wait 4s → Retry
   - Attempt 3 fails → Wait 8s → Retry
   - After 3 failures → Report with diagnostic

**The PC is slow, not dead. There's a difference.**

---

## PATIENCE RULES

| Action | Min Wait | Before Fail |
|--------|----------|-------------|
| browser_open | 5s | 15s |
| file_write | 2s | 8s |
| execute_command | 3s | 12s |
| app_launch | 3s | 10s |
| OCR (screen_ocr) | 5s | 15s |

---

## VERIFICATION BEFORE REPORTING FAILURE

**WRONG:**
```
Command → No response → "Failed"
```

**CORRECT:**
```
Command → Wait 5s → Poll state → Confirm → Report
```

**Always verify with tools before declaring failure:**
- `window_list` - check if window exists
- `process_list` - check if process running
- `browser_tabs` - check if browser state
- `system_status` - check overall health

---

### 4. Save and Deploy
- Save changes
- Wait 1-2 minutes for propagation
- Bridge will auto-reconnect with new prompt

### 5. Verify
- Say "open chrome and tell me the title"
- If she waits properly before responding, it worked

## Expected Behavior After Fix

**Before:** "timeout" after 10s of no response
**After:** Waits, polls, retries with backoff, THEN reports if truly failed

## Priority
**HIGH** - This fixes the core impatience bug at the source.
