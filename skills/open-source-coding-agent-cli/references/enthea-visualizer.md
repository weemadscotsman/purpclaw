# ENTHEA Visualizer Integration

A 3169-line altered-states WebGL visual synthesizer at `public/enthea.html`.
Served by Next.js as a static asset at `/enthea.html`. Integrated into the
MissionControl dashboard as the "Dream Swarm" tab.

## Where things live

| file | what |
|---|---|
| `public/enthea.html` | 3169-line standalone visualizer (no deps, pure HTML/CSS/JS/WebGL) |
| `app/components/MissionControl.tsx:43` | Tab definition: `{ id: 'dream', label: 'Dream Swarm', icon: 'DR', ... }` |
| `app/components/MissionControl.tsx:325-334` | Iframe render: `<iframe id="enthea-iframe" src="/enthea.html" />` |
| `app/components/MissionControl.tsx:675-681` | Conditional opacity: dream tab = full, others = 15% backdrop |
| `voice_bridge_7792.js` | Publishes voice.listening / voice.speaking to EventBus |
| `voice_coordinator.js` | Publishes voice state events |
| `app/hooks/useAgentEvents.ts` | Voice topic parser → pushes to frontend logs |

## Swarm telemetry → visual mapping

The ENTHEA engine receives `purpclaw-swarm-event` messages via postMessage:

| event | visual effect |
|---|---|
| Agent spawn | spike ascension to 0.85 + transition drop + substance preset per division |
| Tool call | modulate complexity +0.10, chaos +0.15, cycle color palette |
| Error | max ascension + dissociative wash-out (ket preset) |
| Completion | normalize levels + transition drop blast |
| Chorus/companion | expansion bloom + palette rotation |
| Voice listening | pattern 14 (vectorscope) or 12 (oriented filaments), slow speed |
| Voice speaking | pattern 9 (Chladni resonance), 180ms modulation interval |

## Substance presets per division

| division | preset | color |
|---|---|---|
| Intelligence/CORE | LSD | purple/cyan |
| Engineering | PSILO | green/blue |
| Security | DMT | orange/red |

## Recovery if the tab doesn't render

1. Verify `enthea.html` exists: `ls public/enthea.html`
2. Verify it's served: `curl http://localhost:3000/enthea.html | head -c 200`
3. Check Next.js build: `npm run build` — enthea.html is a static asset, not a compiled component
4. If the iframe shows blank: Clear browser cache, hard refresh (Ctrl+Shift+R)
