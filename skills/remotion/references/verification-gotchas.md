# Remotion on Eddie's stack — verification gotchas, install recipe, and known traps

This is the session-specific detail for Remotion work. The main `SKILL.md` covers the API; this file covers what goes wrong on this machine.

## The "I rendered a video but it's empty" trap

`npx create-video@latest --blank` scaffolds a `Composition.tsx` whose body is:

```tsx
export const MyComposition = () => {
  return null;
};
```

The CLI succeeds, `out.png` is a valid 1280×720 RGBA PNG (~20 KB), `out.mp4` is a valid 60-frame H.264 video. The file looks correct. The content is `null` everywhere — fully transparent (alpha=0 at every sampled pixel).

**Always replace the blank composition with real content before claiming a render worked.** See `templates/smoke-composition.tsx` for a known-good starter.

**Pixel-sampling check (Python):**

```python
from PIL import Image
im = Image.open("out.png").convert("RGBA")
for label, (x, y) in [("center", (640, 360)), ("top-left", (10, 10))]:
    px = im.getpixel((x, y))
    if px[3] == 0:
        print(f"FAIL: {label} pixel is fully transparent (alpha=0) — blank composition")
    else:
        print(f"OK: {label} = {px}")
```

## Mandatory verification sequence

```bash
# 1. Render
npx remotion render <CompositionId> out.mp4

# 2. File exists and is real media
ls -la out.mp4
file out.mp4   # must say: ISO Media, MP4 Base Media v1

# 3. ffprobe — confirms duration, codec, resolution, fps, audio
ffmpeg -i out.mp4 2>&1 | grep -E "Duration|Stream|Video"

# 4. Pixel alpha on a still — catches the null-composition trap
npx remotion still <CompositionId> out.png --frame=30
python -c "from PIL import Image; im=Image.open('out.png').convert('RGBA'); \
           print('alpha at center:', im.getpixel((640, 360))[3])"
#   alpha=255 → real content
#   alpha=0   → blank composition, you shipped a transparent frame
```

Report the path, byte size, duration, and resolution to the user. Not "it should work."

## Install recipe (already done on this machine, for reference)

**Skill:** cloned from `https://github.com/remotion-dev/skills` (the official Remotion team's skill) into `C:/Users/Admin/AppData/Local/hermes/skills/remotion/`. Do NOT use `anthropics/skills` — that repo has no Remotion entry.

**MCP server:** `@remotion/mcp` v4.0.479 from npm (official, by Jonny Burger, 53k weekly downloads). It exposes ONE tool: `remotion-documentation`, which fetches `https://mcp.remotion.dev/mcp/67cad4626afeae106c6ffb50?query=...` over HTTPS. No auth, no rate limit (in the response we got back).

```bash
# Install
mkdir -p "E:/god folder/02_ACTIVE_PROJECTS/remotion-mcp-server"
cd "E:/god folder/02_ACTIVE_PROJECTS/remotion-mcp-server"
npm init -y >/dev/null
npm install @remotion/mcp

# Register with Hermes (use mcp add, NOT config set)
echo y | hermes mcp add remotion \
  --command "C:/nvm4w/nodejs/node.exe" \
  --args "E:/god folder/02_ACTIVE_PROJECTS/remotion-mcp-server/node_modules/@remotion/mcp/dist/esm/index.mjs"

# Verify
hermes mcp test remotion   # should say "Connected (500ms), 1 tool"
```

**Why `hermes mcp add` and not `hermes config set`:** on Windows, `hermes config set mcp_servers.<name>.args "<list>"` serializes the value as a YAML-quoted string instead of a list. The launcher then passes the string as one arg, and the subprocess fails. `hermes mcp add` writes proper YAML list format. Same gotcha applies to any MCP with args.

## Scaffolding a new project (proven recipe)

```bash
cd "E:/god folder/02_ACTIVE_PROJECTS"
mkdir -p remotion-test && cd remotion-test
npx --yes create-video@latest --yes --blank --no-tailwind my-video
cd my-video
npm install
```

Then:

1. **Comment out the tailwind CSS import** in `src/Root.tsx`:
   ```tsx
   // import "./index.css";   // tailwind off
   ```
   The `--no-tailwind` flag stops the scaffold from generating a tailwind config, but `package.json` still lists `@remotion/tailwind-v4` and `tailwindcss` as deps, and `src/Root.tsx` still tries to `import "./index.css"` (which contains `@import "tailwindcss";`). On a fresh install that import can resolve to a partial PostCSS pipeline and cause subtle render errors. Commenting it out is the safe path.

2. **Replace `src/Composition.tsx`** with real content (use `templates/smoke-composition.tsx` as a starter).

3. **Render and verify** per the sequence above.

## Direct MCP stdio call (Windows ESM gotcha)

If you want to call the Remotion MCP server outside Hermes (e.g. from a one-off node script), the import path MUST be a `file://` URL on Windows, otherwise the ESM loader rejects it with `ERR_UNSUPPORTED_ESM_URL_SCHEME`.

```javascript
// test_mcp_call.mjs
import { Client } from 'file:///E:/god%20folder/02_ACTIVE_PROJECTS/remotion-mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from 'file:///E:/god%20folder/02_ACTIVE_PROJECTS/remotion-mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'C:/nvm4w/nodejs/node.exe',
  args: ['E:/god folder/02_ACTIVE_PROJECTS/remotion-mcp-server/node_modules/@remotion/mcp/dist/esm/index.mjs'],
});
const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);
const r = await client.callTool({ name: 'remotion-documentation', arguments: { query: 'useCurrentFrame' } });
console.log(r.content?.[0]?.text?.slice(0, 500));
await client.close();
```

`CJS` requires don't need the `file://` wrapper, but `@remotion/mcp` is ESM-only (its `package.json` has `"type": "module"`), so you must use `.mjs` + `file://` URLs.

## Known broken paths (do not use)

- `npx remotion lambda still` — needs AWS Lambda config, will fail without `AWS_ACCESS_KEY_ID` etc. Use the local `npx remotion still` instead.
- `anthropics/skills` repo — has no Remotion entry. Don't waste time looking.
- `remotion-dev/remotion-mcp` git repo — does not exist. The package lives at `remotion-dev/remotion/tree/main/packages/mcp` and is published to npm as `@remotion/mcp`.

## End-to-end test that worked (2026-06-17)

For the record, this exact sequence produced a real 1280×720 H.264 MP4:

1. Skill installed at `C:/Users/Admin/AppData/Local/hermes/skills/remotion/` (194K, SKILL.md + 30+ rules/).
2. MCP server installed at `E:/god folder/02_ACTIVE_PROJECTS/remotion-mcp-server/` (`@remotion/mcp` v4.0.479).
3. Project scaffolded at `E:/god folder/02_ACTIVE_PROJECTS/remotion-test/my-video/`.
4. `src/Composition.tsx` replaced with gradient + fade-in + slide-up content.
5. `npx remotion still MyComp out.png --frame=45` → 778 KB PNG, alpha=255 at center.
6. `npx remotion render MyComp out.mp4` → 395 KB MP4, 2.05s, 1280×720, h264 High, 30 fps, AAC audio track.

Working files: `E:/god folder/02_ACTIVE_PROJECTS/remotion-test/my-video/{src/Composition.tsx, out.mp4, out.png}`.
