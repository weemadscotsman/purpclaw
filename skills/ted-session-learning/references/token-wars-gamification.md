# Token Wars — Gamification Layer (May 20 2026)

## What was added

**AgentStats data class** (`PodcastViewModel.kt`):
```kotlin
data class AgentStats(
    val score: Int = 0,        // Arena score (audience votes)
    val streak: Int = 0,       // Consecutive wins
    val lastWin: String = "N/A",
    val stress: Int = 0,        // 0-100, meltdown at 100
    val twag: Int = 100,       // Currency earned from votes
    val karma: Int = 0,         // Community goodwill
    val level: Int = 1,        // Upgrade level
    val xp: Int = 0,           // Experience points
    val isMeltdown: Boolean = false,
    val meltdownReason: String = ""
)
```

**Stress injection points** (in debate loop):
- Opening statement: +10 stress
- Targeted rebuttal: +15 stress
- Host summary: +12 stress
- Voting: +3 stress per vote

**New ViewModel functions:**
- `injectStressToAgent(agentName, amount)` — direct stress injection
- `ventAgent(agentName)` — therapy: stress → 0, costs karma, gains XP
- `spendTwag(agentName, amount): Boolean` — spend currency
- `persistAgentStats()` — saves to SharedPreferences as JSON

**PreferencesManager** — added `agentStatsJson` field:
```kotlin
var agentStatsJson: String
    get() = prefs.getString("agent_stats", "{}") ?: "{}"
    set(value) = prefs.edit().putString("agent_stats", value).apply()
```

**Stress decay loop** — runs every 5 seconds when podcast is off:
```kotlin
viewModelScope.launch {
    while (true) {
        delay(5000)
        if (!_state.value.isPlaying) {
            _state.update { state ->
                val stats = state.agentStats.mapValues { (_, s) ->
                    if (s.stress > 0) s.copy(stress = (s.stress - 1).coerceAtLeast(0)) else s
                }
                state.copy(agentStats = stats)
            }
        }
    }
}
```

**ArenaView** — added gamification badges:
- Level badge (color per agent)
- TWAG balance (gold)
- Stress % (green → orange → red)
- Meltdown warning icon (red)

**AgentCard** — added to bottom of card:
- Stress bar (color-coded)
- Level / TWAG / Karma badges
- MELTDOWN overlay badge

## Build commands

```bash
cd C:/Users/Admin/Desktop/token-wars
./gradlew assembleDebug --no-daemon
# APK: app/build/outputs/apk/debug/app-debug.apk (18MB)

# Push to phone
adb push app/build/outputs/apk/debug/app-debug.apk /sdcard/Download/

# Force stop + launch
adb shell am force-stop com.example.tokenwars
adb shell am start -n com.example.tokenwars/.MainActivity
```

## Next integration step (not yet done)

The Agent Life Simulator SQLite DB at `E:/god folder/02_ACTIVE_PROJECTS/agent router v2/agent-life-simulator/server/database/` should become the shared world state source. Token Wars should query it for agent stress/karma/TWAG rather than using its own SharedPreferences. The killer concept: agents live in the sim → come on air to debate → sim state updates → loop back. Shared SQLite DB is the integration point.