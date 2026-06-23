# Remotion skill (PurpClaw port)
The official Remotion best-practices skill, kept up-to-date by the Remotion team. Load this skill whenever the user asks to design, scaffold, render, or troubleshoot a Remotion video.

## When to use
Any work involving Remotion: scaffold a new project, write a Composition, animate properties, add audio/video/images, render to MP4 or PNG, troubleshoot a render, query API surface. Triggers on phrases like "remotion video", "react video", "animate the logo", "render a still", "MP4 from code".

## Sources
- Upstream: https://github.com/remotion-dev/skills
- Local copy: `C:/Users/Admin/AppData/Local/hermes/skills/remotion/`
- Ported at: `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/skills/remotion/`

## Composition authoring (the only path on Eddie's stack)
- Use `useCurrentFrame()` + `interpolate()` + `Easing.bezier(...)`. CSS transitions and Tailwind animation classes are FORBIDDEN.
- Wrap root in `<AbsoluteFill>`.
- Reference assets from `public/` via `staticFile()` and the `<Img>` / `<Video>` / `<Audio>` components.
- Define composition in `src/Root.tsx` with `<Composition id component durationInFrames fps width height />`.

## Scaffolding (verified recipe on this machine)
```bash
cd "E:/god folder/02_ACTIVE_PROJECTS"
mkdir -p remotion-projects && cd remotion-projects
npx --yes create-video@latest --yes --blank --no-tailwind <project-name>
cd <project-name>
npm install
# Then in src/Root.tsx comment out:  // import "./index.css";
# Then in src/Composition.tsx replace `return null;` with real content.
```

## Rendering
- Still (single frame): `npx remotion still <CompositionId> out.png --frame=30`
- Video: `npx remotion render <CompositionId> out.mp4`

## Mandatory verification (the blank-template trap)
After every render, run `python E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/skills/remotion/scripts/verify_remotion_render.py out.mp4 [out.png]`. The blank `create-video --blank` template literally returns `null` from the composition — the file is valid, the content is a fully transparent canvas. The pixel-alpha check catches this.

## Native tools (PurpClaw)
- `remotion_render` — scaffold + write + render MP4/PNG in one call
- `remotion_still` — render single frame at a chosen time
- `remotion_verify` — run the verify script against an existing render
- `mcp__remotion__remotion-documentation` — search the live Remotion docs (uses the `@remotion/mcp` server)

## Known broken paths
- `npx remotion lambda still` — needs AWS Lambda config, use local `npx remotion still` instead
- `anthropics/skills` — has no Remotion entry, don't bother
- `remotion-dev/remotion-mcp` git repo — doesn't exist, the package lives in `remotion-dev/remotion/tree/main/packages/mcp` and is published to npm as `@remotion/mcp`

## See also
- `references/verification-gotchas.md` — the blank-template trap, install recipe, Windows ESM gotcha
- `templates/smoke-composition.tsx` — known-good starter (gradient + fade + slide)
- `scripts/verify_remotion_render.py` — post-render verifier
