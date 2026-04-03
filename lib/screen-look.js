'use strict';

/**
 * PURPCLAW Screen Look
 * ====================
 * Multi-monitor screenshot capture + vision analysis pipeline.
 *
 * Requires Python 3:  pip install mss Pillow
 *
 * Services used (all optional — degrade gracefully):
 *   YOLO object detection → http://localhost:7779/detect
 *   LLM vision describe   → configured LLM_PROVIDER with vision support
 *
 * Usage:
 *   const { look, listScreens, parseScreenSpec } = require('./lib/screen-look');
 *   const results = await look([1, 2], { vision: true });
 *   //  → [{ screen:1, width, height, description, objects[], objectCount }, ...]
 *
 * Screen indices are 1-based (1 = primary, 2 = second monitor, etc.)
 */

const { spawn } = require('child_process');
const fs        = require('fs');
const path      = require('path');
const http      = require('http');
const workspace = require('./workspace-awareness.js');

const YOLO_PORT = parseInt(process.env.YOLO_PORT || '7779', 10);
const TEMP      = process.env.TEMP || 'C:/Users/Admin/AppData/Local/Temp';
const PURP_DIR  = path.resolve(__dirname, '..');

// ── Python runner ─────────────────────────────────────────────────────────────

function runPython(script, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const ts  = Date.now();
    const pyf = path.join(TEMP, `purp_look_${ts}.py`);
    fs.writeFileSync(pyf, script, 'utf8');

    let stdout = '';
    let stderr = '';

    const child = spawn('py', ['-3.11', pyf], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());

    const cleanup = () => { try { fs.unlinkSync(pyf); } catch {} };

    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(val);
    };

    child.on('close', () => {
      try {
        const lines = stdout.trim().split('\n').filter(Boolean);
        finish(JSON.parse(lines[lines.length - 1]));
      } catch {
        finish({ error: `parse_failed: ${stderr.slice(0, 120) || stdout.slice(0, 120)}` });
      }
    });

    child.on('error', (e) => {
      finish({ error: `spawn_failed: ${e.message}` });
    });

    setTimeout(() => {
      child.kill();
      finish({ error: 'timeout (12s)' });
    }, timeoutMs);
  });
}

// ── Screen enumeration ────────────────────────────────────────────────────────

/**
 * List all available monitors.
 * @returns {{ count: number, screens: Array<{ index, width, height, left, top }>, error? }}
 */
async function listScreens() {
  return runPython(`
import json, sys
try:
    import mss
    with mss.mss() as sct:
        screens = [
            {"index": i, "width": m["width"], "height": m["height"],
             "left": m["left"], "top": m["top"]}
            for i, m in enumerate(sct.monitors[1:], 1)
        ]
        print(json.dumps({"count": len(screens), "screens": screens}))
except ImportError as e:
    print(json.dumps({"error": f"Missing: {e} — run: pip install mss Pillow", "count": 0, "screens": []}))
except Exception as e:
    print(json.dumps({"error": str(e), "count": 0, "screens": []}))
`, 5000);
}

// ── Single screen capture ─────────────────────────────────────────────────────

/**
 * Capture one monitor as base64 JPEG.
 * @param {number} idx — 1-based monitor index
 * @returns {{ base64, width, height, screen, error? }}
 */
function captureScreen(idx) {
  // Build Python script with idx baked in (no string interpolation inside Python)
  const script = `
import json, sys, base64, io

IDX = ${Math.floor(idx)}

try:
    import mss
    from PIL import Image

    with mss.mss() as sct:
        monitors = sct.monitors
        count = len(monitors) - 1  # monitors[0] is combined

        if IDX < 1 or IDX > count:
            print(json.dumps({"error": f"Screen {IDX} not found. Available: 1-{count}", "screen": IDX}))
            sys.exit(0)

        shot = sct.grab(monitors[IDX])
        img  = Image.frombytes("RGB", shot.size, shot.rgb)

        # Cap at 1280px wide for speed — keeps quality for vision LLMs
        if img.width > 1280:
            ratio = 1280 / img.width
            img = img.resize((1280, int(img.height * ratio)), Image.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=82)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")

        print(json.dumps({
            "base64":  b64,
            "width":   img.width,
            "height":  img.height,
            "screen":  IDX,
            "monitor_count": count,
        }))

except ImportError as e:
    print(json.dumps({"error": f"Missing: {e} — pip install mss Pillow", "screen": IDX}))
except Exception as e:
    print(json.dumps({"error": str(e), "screen": IDX}))
`;
  return runPython(script);
}

// ── YOLO object detection ─────────────────────────────────────────────────────

function detectOnScreen(base64) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ image: base64, confidence: 0.35 });
    const buf  = Buffer.from(body);
    const req  = http.request({
      hostname : '127.0.0.1',
      port     : YOLO_PORT,
      path     : '/detect',
      method   : 'POST',
      headers  : { 'Content-Type': 'application/json', 'Content-Length': buf.length },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
    req.write(buf);
    req.end();
  });
}

// ── LLM vision description ────────────────────────────────────────────────────

async function describeScreen(base64, idx) {
  let llm;
  try { llm = require('./llm-provider.js'); } catch { return null; }

  const provider = (process.env.LLM_PROVIDER || 'openai').toLowerCase();

  try {
    let userContent;

    if (provider === 'anthropic') {
      // Anthropic native vision format — passes through chatAnthropic unchanged
      userContent = [
        {
          type   : 'image',
          source : { type: 'base64', media_type: 'image/jpeg', data: base64 },
        },
        {
          type : 'text',
          text : `This is screen ${idx} of a developer's multi-monitor setup. In 2-3 sentences: what application(s) are open, what they appear to be working on, any notable content (code, file names, browser tabs, terminal commands). Be specific and practical. No filler.`,
        },
      ];
    } else {
      // OpenAI-compatible vision (gpt-4o, openrouter, etc.)
      userContent = [
        {
          type      : 'image_url',
          image_url : { url: `data:image/jpeg;base64,${base64}`, detail: 'low' },
        },
        {
          type : 'text',
          text : `This is screen ${idx} of a developer's multi-monitor setup. In 2-3 sentences: what application(s) are open, what they appear to be working on, any notable content (code, file names, browser tabs, terminal commands). Be specific and practical. No filler.`,
        },
      ];
    }

    const resp = await llm.chat(
      [{ role: 'user', content: userContent }],
      { maxTokens: 220, temperature: 0.3 },
    );

    return resp?.content || null;
  } catch {
    return null;
  }
}

// ── Main look() ───────────────────────────────────────────────────────────────

/**
 * Look at specified monitors and return analysis.
 *
 * @param {number[]} indices — 1-based monitor indices
 * @param {{ vision?: boolean, yolo?: boolean }} opts
 * @returns {Promise<Array<{
 *   screen, width, height,
 *   description: string|null,
 *   objects: string[],
 *   objectCount: number,
 *   yoloOnline: boolean,
 *   error?: string
 * }>>}
 */
async function look(indices, opts = {}) {
  const doVision = opts.vision !== false;
  const doYolo   = opts.yolo   !== false;
  const results  = [];

  for (const idx of indices) {
    const capture = await captureScreen(idx);

    if (capture.error) {
      results.push({ screen: idx, error: capture.error });
      continue;
    }

    const [yolo, description] = await Promise.all([
      doYolo   ? detectOnScreen(capture.base64)      : Promise.resolve(null),
      doVision ? describeScreen(capture.base64, idx)  : Promise.resolve(null),
    ]);

    results.push({
      screen      : idx,
      width       : capture.width,
      height      : capture.height,
      description : description || null,
      objects     : yolo?.objects?.map(o => o.class) || [],
      objectCount : yolo?.count || 0,
      yoloOnline  : yolo?.success === true,
    });
  }

  // Persist as context for agents — they read this before working on a task
  try {
    const ctxDir = path.join(PURP_DIR, 'agent_work');
    fs.mkdirSync(ctxDir, { recursive: true });
    fs.writeFileSync(
      path.join(ctxDir, '.screen_context.json'),
      JSON.stringify({
        ts      : new Date().toISOString(),
        screens : results.map(r => ({
          screen      : r.screen,
          description : r.description,
          objects     : r.objects,
          error       : r.error || undefined,
        })),
      }, null, 2),
    );
  } catch {}

  try {
    workspace.updateWorkspace(results, { source: 'look' });
  } catch {}

  return results;
}

// ── Screen spec parser ────────────────────────────────────────────────────────

/**
 * Parse screen spec from CLI argv tokens.
 *   ["1","2","3"] → [1, 2, 3]
 *   ["1-3"]       → [1, 2, 3]
 *   []            → null  (caller interprets as "all screens")
 */
function parseScreenSpec(tokens) {
  if (!tokens || tokens.length === 0) return null;
  const set = new Set();
  for (const t of tokens) {
    if (/^\d+-\d+$/.test(t)) {
      const [lo, hi] = t.split('-').map(Number);
      for (let i = lo; i <= Math.min(hi, 16); i++) set.add(i);
    } else if (/^\d+$/.test(t)) {
      set.add(Number(t));
    }
  }
  return set.size > 0 ? [...set].sort((a, b) => a - b) : null;
}

// ── Read last stored screen context ──────────────────────────────────────────

/**
 * Read the most recent screen context (written by look()).
 * Returns null if no context exists or it's older than maxAgeMs.
 */
function readLastContext(maxAgeMs = 5 * 60 * 1000) {
  try {
    const file = path.join(PURP_DIR, 'agent_work', '.screen_context.json');
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.ts) return null;
    const age = Date.now() - new Date(data.ts).getTime();
    if (age > maxAgeMs) return null;
    return data;
  } catch {
    return null;
  }
}

module.exports = {
  look,
  listScreens,
  captureScreen,
  describeScreen,
  parseScreenSpec,
  readLastContext,
  readWorkspace: workspace.readWorkspace,
};
