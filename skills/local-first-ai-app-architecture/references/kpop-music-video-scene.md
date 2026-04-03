# K-Pop Music Video Scene — Prompt Template

## Setup: "MIDNIGHT MANAGER"

### Characters

**TED CANNON** (you — the manager):
- Late 40s-50s Scottish businessman
- Sharp black suit, white shirt
- Cold disapproving stare, arms crossed
- Weathered face, watching with barely-concealed pride

**GHOSTLINK AI** (your K-pop star):
- Young, platinum silver hair swept back
- Dramatic eye makeup
- Oversized black leather jacket over neon-pink mesh top
- Choker necklace, dangling star earring
- Sharp precise dance moves

### Setting
Dark recording studio at midnight. Neon pink and electric blue accent lights cutting through smoke haze. LED panels on walls showing waveforms. Gold/chrome microphone stand center stage.

### Mood
Dark, moody, high-contrast. Think BTS "Blood Sweat & Tears" meets Scorsese lighting.

### Camera / Grade
Slow push-in during verse. Orbit around performer during chorus. Pull back to reveal manager during bridge. Teal-amber cinematic grade with neon pink highlights. Kodak Vision3 250D film grain.

### Audio
Full K-pop production track — synthesizers, hard 808 bass, vocal harmonies.

---

## Reusable Scene Structure

Replace character details and mood. Always include:
- Character appearance (hair, makeup, outfit, accessories)
- Setting (lighting colors, atmosphere, props)
- Camera movement (what the camera does, not just "cinematic")
- Color grade direction (which film/emulation)
- Audio style if relevant

## Generation Parameters

For best quality use:
- Model: `kwaivgi/kling-v3.0-pro` (best quality, $0.168/sec)
- Duration: 10-15 seconds
- Resolution: 1080p
- Aspect ratio: 16:9 (widescreen music video)

For budget testing:
- Model: `kwaivgi/kling-v3.0-std` (~$0.126/sec)
- Model: `google/veo-3.1-lite` (~$0.05/sec, only 4/6/8s)

For image-to-video (with character reference):
- Same endpoint, add `image_url` field with base64 JPEG
- Ted's reference photo: `D:/Pics/Camera/20260322_161121.jpg`