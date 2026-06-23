'use strict';

/**
 * lib/tools-cli-anything.js — bridge CLI-Anything harnesses into PURPCLAW as
 * native agent tools. Makes "any GUI app, agent-native" usable by PURPCLAW's
 * own brain (Blender, GIMP, Godot, LibreOffice, Obsidian, … 49 harnesses).
 *
 * Lowest overhead by design:
 *   - No daemon, no HTTP hop — each tool shells out to `python -m cli_anything.<app>`.
 *   - No global pip install — runs the harness package in-place via PYTHONPATH.
 *   - Auto-discovers harnesses on disk at load. Adding/updating a CLI = `git pull`
 *     in the CLI-Anything repo + restart. Zero code changes here.
 *
 * Each harness becomes a tool `cli_<app>` taking { args, json }:
 *   cli_blender { args: ["object","add","cube"], json: true }
 *   → python -m cli_anything.blender --json object add cube   (cwd = harness dir)
 *
 * Point at the repo with CLI_ANYTHING_DIR (default below).
 */

const fs = require('fs');
const path = require('path');
const { execSafe } = require('./child-registry');

const ROOT = process.env.CLI_ANYTHING_DIR
  || 'E:/god folder/02_ACTIVE_PROJECTS/CLI-Anything';
const PYTHON = process.env.PYTHON_BIN || 'python';
const TIMEOUT_MS = parseInt(process.env.CLI_ANYTHING_TIMEOUT_MS || '60000', 10);

// Discover every harness: <app>/agent-harness/cli_anything/<module>/__main__.py
function discover() {
  const out = [];
  let apps = [];
  try { apps = fs.readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory()); } catch { return out; }
  for (const app of apps) {
    const pkgRoot = path.join(ROOT, app.name, 'agent-harness', 'cli_anything');
    let mods = [];
    try { mods = fs.readdirSync(pkgRoot, { withFileTypes: true }).filter(d => d.isDirectory()); } catch { continue; }
    for (const mod of mods) {
      const main = path.join(pkgRoot, mod.name, '__main__.py');
      if (!fs.existsSync(main)) continue;
      out.push({
        module: mod.name,
        harnessDir: path.join(ROOT, app.name, 'agent-harness'), // PYTHONPATH root
        pkgDir: path.join(pkgRoot, mod.name),
        app: app.name,
      });
    }
  }
  return out;
}

// First meaningful line of the harness README, for the tool description.
function blurb(pkgDir, module) {
  try {
    const txt = fs.readFileSync(path.join(pkgDir, 'README.md'), 'utf8');
    const line = txt.split(/\r?\n/).map(l => l.replace(/^#+\s*/, '').trim())
      .find(l => l && !l.startsWith('![') && !l.startsWith('<') && l.length > 8);
    if (line) return line.slice(0, 160);
  } catch { /* no readme */ }
  return `Drive ${module} via its CLI-Anything agent harness.`;
}

function normalizeArgs(args) {
  if (Array.isArray(args)) return args.map(String);
  if (typeof args === 'string' && args.trim()) return args.trim().split(/\s+/);
  return [];
}

function registerAll(registry) {
  const harnesses = discover();
  for (const h of harnesses) {
    registry.register({
      name: `cli_${h.module}`,
      description: `[CLI-Anything] ${blurb(h.pkgDir, h.module)} Pass args as an array (preferred), e.g. {"args":["--help"]}. Set json:true for machine output.`,
      inputSchema: {
        type: 'object',
        properties: {
          args: { description: 'CLI arguments — array of strings (preferred) or a space-separated string', type: ['array', 'string'], items: { type: 'string' } },
          json: { type: 'boolean', description: 'Append --json for structured output', default: false },
        },
      },
      execute: async (input = {}) => {
        const argv = ['-m', `cli_anything.${h.module}`];
        if (input.json) argv.push('--json');
        argv.push(...normalizeArgs(input.args));
        try {
          const r = await execSafe(PYTHON, argv, {
            cwd: h.harnessDir,
            env: { ...process.env, PYTHONPATH: h.harnessDir + path.delimiter + (process.env.PYTHONPATH || '') },
            timeoutMs: TIMEOUT_MS,
            windowsHide: true,
            tag: `cli-anything:${h.module}`,
          });
          const body = (r.stdout || '') + (r.stderr && !r.ok ? `\n[stderr] ${r.stderr}` : '');
          return { ok: r.ok, content: body.trim() || `(no output, exit ${r.code ?? '?'})` };
        } catch (e) {
          return { ok: false, content: `cli_${h.module} failed: ${e.message}` };
        }
      },
    });
  }
  return { count: harnesses.length, modules: harnesses.map(h => h.module) };
}

module.exports = { registerAll, discover };
