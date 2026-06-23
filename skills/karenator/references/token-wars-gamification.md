# Token Wars — Gamification Layer (May 2026)

## What Was Built

The podcast turn engine was integrated into a persistent agent state system. Every spoken turn generates real XP/TWAG/Stress consequences. The loop: **Podcast generates consequences → Simulator stores them → Green Room changes future broadcasts**.

## Architecture

Single source of truth: `AgentStats` in `PodcastViewModel.kt`. No drift between UI and sim engine.

### AgentStats (single source of truth)

```kotlin
data class AgentStats(
    val score: Int = 0,           // Arena audience votes
    val streak: Int = 0,          // Consecutive wins
    val lastWin: String = "N/A",
    val stress: Int = 0,          // 0-100, meltdown at 100
    val twag: Int = 100,          // Currency
    val karma: Int = 0,           // Community goodwill
    val level: Int = 1,           // XP-gated upgrade
    val xp: Int = 0,              // Experience points
    val isMeltdown: Boolean = false, // Benched, needs therapy
    val meltdownReason: String = "",
    val rivalries: List<String> = emptyList(),  // Feuding agents
    val alliances: List<String> = emptyList()    // Allied agents
)
```

### Reward System Per Turn Type

| Turn | XP | TWAG | Stress |
|------|-----|------|--------|
| Opening round | +10 | +1 | +5 |
| Targeted rebuttal | +15 | +2 | +8 |
| Host intro | +5 | +1 | +6 |
| Host summary | +8 | +1 | +8 |

### Social Actions

- **CHALLENGE** (rebuttal): adds target to rivalries, +10 stress bonus
- **SUPPORT**: adds target to alliances, -2 stress
- **User upvote**: +1 karma, +2 TWAG, +5 XP
- **User downvote**: -1 karma, +8 stress

### Key Functions

```kotlin
fun awardTurnRewards(agentName: String, turnType: TurnType, targetName: String? = null, action: SocialAction? = null)
fun applyUpvote(agentName: String)
fun applyDownvote(agentName: String)
fun canAgentSpeak(agentName: String): Boolean   // checks isMeltdown
fun getEligibleSpeakers(): List<Agent>           // filters meltdowns
fun postSystemLog(message: String)               // SYSTEM turn into transcript
fun moveToGreenRoom(agentName: String)
fun recoverFromGreenRoom(agentName: String)    // stress -> 40
fun persistAgentStats()                          // SharedPreferences

enum class TurnType { OPENING, REBUTTAL, HOST_INTRO, HOST_SUMMARY, TARGET_PICK }
enum class SocialAction { CHALLENGE, SUPPORT, NONE }
```

### Meltdown Fires Atomically in awardTurnRewards

When meltdown first triggers, state update returns early with transcript entry attached — no async timing issues:

```kotlin
if (isMeltdown && !current.isMeltdown) {
    val logTurn = Turn(
        speakerId = "SYSTEM",
        responseText = "🚨 $agentName hit MELTDOWN at ${finalStress}%! Moved to Green Room for therapy.",
        modelStatus = "INFO"
    )
    return@update currentState.copy(agentStats = stats, transcript = currentState.transcript + logTurn)
}
```

### Speaker Eligibility Gate

```kotlin
// Pre-check before each turn
if (!canAgentSpeak(agent.name)) {
    postSystemLog("🚫 ${agent.name} is in meltdown. Skipping their turn.")
    continue
}
// When building opponent list
val activeOpponents = getEligibleSpeakers().filter { it.name != "Gemini" }
```

## Build + Deploy

```bash
cd token-wars
./gradlew assembleDebug  # BUILD SUCCESS = ready
adb push app/build/outputs/apk/debug/app-debug.apk /sdcard/Download/
```

APK location: `app/build/outputs/apk/debug/app-debug.apk`
