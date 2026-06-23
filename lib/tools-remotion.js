'use strict';
/**
 * lib/tools-remotion.js — native PurpClaw tools for the Remotion video stack.
 *
 * Registers three tools that wrap the same npm-installed CLI that the
 * Hermes side uses (`@remotion/cli` via `npx remotion`). They take a
 * project root and a few high-level options, then run the canonical
 * `npx remotion render` / `npx remotion still` / verify script.
 *
 * They DO NOT use the MCP `remotion-documentation` tool for composition
 * code — that's for the LLM's doc lookups, not for production tooling.
 * The actual rendering goes through the npm CLI in `node_modules`.
 *
 * Project root convention: `E:/god folder/02_ACTIVE_PROJECTS/remotion-projects/<name>/`.
 * Each call assumes the project is already scaffolded (or pass `scaffold: true`).
 *
 * The verify script lives at PURPCLAW skills/remotion/scripts/verify_remotion_render.py.
 */

const path  = require('path');
const fs    = require('fs');
const { execSafe } = require('./child-registry');

const PROJECTS_ROOT = 'E:/god folder/02_ACTIVE_PROJECTS/remotion-projects';
const VERIFY_SCRIPT = path.join(__dirname, '..', 'skills', 'remotion', 'scripts', 'verify_remotion_render.py');
const SMOKE_TEMPLATE = path.join(__dirname, '..', 'skills', 'remotion', 'templates', 'smoke-composition.tsx');

function projectRoot(name) {
  // Normalize Windows backslashes for safety
  const safe = String(name).replace(/[\\/]/g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(PROJECTS_ROOT, safe);
}

function findFirstComposition(projectDir) {
  const rootPath = path.join(projectDir, 'src', 'Root.tsx');
  if (!fs.existsSync(rootPath)) return null;
  const text = fs.readFileSync(rootPath, 'utf-8');
  const m = text.match(/<Composition\s+id="([^"]+)"/);
  return m ? m[1] : null;
}

async function ensureScaffolded(projectDir, opts = {}) {
  if (fs.existsSync(path.join(projectDir, 'package.json'))) return { ok: true, already: true };
  const name = path.basename(projectDir);
  const cmd = `npx --yes create-video@latest --yes --blank --no-tailwind ${name}`;
  const r = await execSafe('cmd', ['/c', cmd], { cwd: PROJECTS_ROOT, timeoutMs: 180000, windowsHide: true });
  // create-video exits 0 on success. It also writes a "Welcome to Remotion" banner
  // to stdout. Trust the banner — the exit code can be non-zero on some shells
  // (and we already validated package.json below).
  const ok = r.code === 0 || /Welcome to Remotion/i.test(r.stdout || '');
  if (!ok && r.code !== 0) return { ok: false, error: r.stderr || r.stdout };
  if (!fs.existsSync(path.join(projectDir, 'package.json'))) {
    return { ok: false, error: 'scaffold did not create package.json' };
  }
  // npm install — required for npx remotion to find node_modules/.bin/remotion
  if (!fs.existsSync(path.join(projectDir, 'node_modules'))) {
    const installR = await execSafe('cmd', ['/c', 'npm install'], { cwd: projectDir, timeoutMs: 300000, windowsHide: true });
    // npm install emits a lot of "warn deprecated" noise but exits 0 on success.
    // Trust the exit code, not the stderr — npm uses stderr for warnings.
    if (installR.code !== 0) {
      return { ok: false, error: 'npm install failed: ' + (installR.stderr || installR.stdout).slice(0, 500) };
    }
  }
  if (opts.writeSmoke) {
    const rootTsx = path.join(projectDir, 'src', 'Root.tsx');
    const rootText = fs.readFileSync(rootTsx, 'utf-8');
    fs.writeFileSync(rootTsx, rootText.replace('import "./index.css";', '// import "./index.css"; // tailwind off'), 'utf-8');
    const smoke = fs.readFileSync(SMOKE_TEMPLATE, 'utf-8');
    fs.writeFileSync(path.join(projectDir, 'src', 'Composition.tsx'), smoke, 'utf-8');
  }
  return { ok: true, already: false };
}

function registerRemotionTools(registry) {
  registry.register({
    name: 'remotion_render',
    description: 'Render a Remotion composition to MP4 video (or PNG still). Scaffolds the project if missing. Uses the canonical npx remotion CLI in the project node_modules. Returns the absolute path of the output file plus the ffprobe summary.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name (subfolder of E:/god folder/02_ACTIVE_PROJECTS/remotion-projects/)' },
        composition: { type: 'string', description: 'Composition id from src/Root.tsx (defaults to the first one found)' },
        outFile: { type: 'string', description: 'Output file name (e.g. "out.mp4" or "out.png"). Default: out.mp4' },
        props: { type: 'string', description: 'Optional JSON string of input props (passed to --props via file). Quote carefully on Windows.' },
        scaffold: { type: 'boolean', description: 'If true, run npx create-video and npm install. Default: true.' },
        writeSmoke: { type: 'boolean', description: 'If true, replace blank Composition with the smoke template. Default: true.' },
        verify: { type: 'boolean', description: 'If true, run verify_remotion_render.py on the output. Default: true.' },
      },
      required: ['project'],
    },
    execute: async ({ project, composition, outFile = 'out.mp4', props, scaffold = true, writeSmoke = true, verify = true }) => {
      try {
        const dir = projectRoot(project);
        if (scaffold) {
          const s = await ensureScaffolded(dir, { writeSmoke });
          if (!s.ok) return { ok: false, error: 'scaffold failed: ' + s.error };
        }
        if (!fs.existsSync(dir)) return { ok: false, error: 'project not found: ' + dir };

        const comp = composition || findFirstComposition(dir);
        if (!comp) return { ok: false, error: 'no composition id found in src/Root.tsx' };

        const outPath = path.join(dir, outFile);
        const isStill = outFile.toLowerCase().endsWith('.png');
        const cmd = isStill ? 'still' : 'render';

        const args = ['remotion', cmd, comp, outFile];
        if (isStill) args.push('--frame=30');
        if (props) {
          // write props to a temp file because Windows shells mangle inline JSON
          const propsFile = path.join(dir, '.remotion-props.json');
          fs.writeFileSync(propsFile, props, 'utf-8');
          args.push(`--props=${propsFile}`);
        }

        // Wrap in cmd /c so PATH is resolved — bare 'npx' fails on Windows when
        // the child process inherits a stripped PATH (the cmd /c chain keeps it).
        const cmdLine = 'npx ' + args.map(a => /\s/.test(a) ? `"${a}"` : a).join(' ');
        const r = await execSafe('cmd', ['/c', cmdLine], { cwd: dir, timeoutMs: 480000, windowsHide: true });
        if (r.code !== 0) {
          return { ok: false, error: 'remotion ' + cmd + ' failed', code: r.code, stderr: r.stderr, stdout: r.stdout };
        }

        const out = { ok: true, project, projectDir: dir, composition: comp, output: outPath, size: fs.statSync(outPath).size };

        if (verify && fs.existsSync(VERIFY_SCRIPT)) {
          const v = await execSafe('python', [VERIFY_SCRIPT, outPath], { timeoutMs: 30000, windowsHide: true });
          out.verify = { ok: v.ok, code: v.code, stdout: v.stdout, stderr: v.stderr };
          out.verified = v.ok === true;
        }

        return out;
      } catch (e) {
        return { ok: false, error: e.message || String(e) };
      }
    },
  });

  registry.register({
    name: 'remotion_still',
    description: 'Render a single frame of a Remotion composition to PNG. Lighter than remotion_render — use for previewing a specific timecode.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name' },
        composition: { type: 'string', description: 'Composition id (defaults to first in Root.tsx)' },
        frame: { type: 'integer', description: 'Frame number to render (0-indexed). Default: 30 (1s at 30fps).' },
        outFile: { type: 'string', description: 'Output PNG name. Default: out.png' },
        scaffold: { type: 'boolean', description: 'Scaffold if missing. Default: true.' },
      },
      required: ['project'],
    },
    execute: async ({ project, composition, frame = 30, outFile = 'out.png', scaffold = true }) => {
      try {
        const dir = projectRoot(project);
        if (scaffold) {
          const s = await ensureScaffolded(dir, { writeSmoke: true });
          if (!s.ok) return { ok: false, error: 'scaffold failed: ' + s.error };
        }
        if (!fs.existsSync(dir)) return { ok: false, error: 'project not found: ' + dir };

        const comp = composition || findFirstComposition(dir);
        if (!comp) return { ok: false, error: 'no composition id found' };

        const cmdLine = `npx remotion still ${comp} ${outFile} --frame=${frame}`;
        const r = await execSafe('cmd', ['/c', cmdLine], {
          cwd: dir, timeoutMs: 120000, windowsHide: true,
        });
        if (r.code !== 0) return { ok: false, error: r.stderr || r.stdout };

        const outPath = path.join(dir, outFile);
        return { ok: true, project, composition: comp, frame, output: outPath, size: fs.statSync(outPath).size };
      } catch (e) {
        return { ok: false, error: e.message || String(e) };
      }
    },
  });

  registry.register({
    name: 'remotion_verify',
    description: 'Run the verify_remotion_render.py script against a rendered file. Catches the blank-template trap (alpha=0 everywhere) and ffprobe failures. Exit code 0 = real content with real codec.',
    inputSchema: {
      type: 'object',
      properties: {
        video: { type: 'string', description: 'Absolute path to the .mp4 or .png to verify' },
        still: { type: 'string', description: 'Optional: also verify a .png still for pixel alpha' },
      },
      required: ['video'],
    },
    execute: async ({ video, still }) => {
      try {
        const args = [VERIFY_SCRIPT, video];
        if (still) args.push(still);
        const r = await execSafe('python', args, { timeoutMs: 30000, windowsHide: true });
        return { ok: r.ok === true, code: r.code, stdout: r.stdout, stderr: r.stderr };
      } catch (e) {
        return { ok: false, error: e.message || String(e) };
      }
    },
  });
}

module.exports = { registerRemotionTools };
