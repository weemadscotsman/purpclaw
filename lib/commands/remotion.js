'use strict';
/**
 * lib/commands/remotion.js — operator control surface for the Remotion stack.
 *
 *   purpclaw remotion status              — show MCP server + tool count + project count
 *   purpclaw remotion render <name>       — call the native remotion_render tool on demand
 *   purpclaw remotion still <name> [n]    — render frame N (default 30) of <name>
 *   purpclaw remotion verify <file>       — run verify_remotion_render.py against a file
 *   purpclaw remotion list                — list projects in E:/god folder/02_ACTIVE_PROJECTS/remotion-projects/
 *
 * Wraps the same `lib/tools-remotion.js` registration the agent loop uses.
 * No new logic — just a CLI surface over the tool registry.
 */

const path = require('path');
const fs   = require('fs');
const { execSafe } = require('../child-registry');

const PROJECTS_ROOT = 'E:/god folder/02_ACTIVE_PROJECTS/remotion-projects';
const VERIFY_SCRIPT = path.join(__dirname, '..', '..', 'skills', 'remotion', 'scripts', 'verify_remotion_render.py');
const MCP_INDEX     = 'E:/god folder/02_ACTIVE_PROJECTS/remotion-mcp-server/node_modules/@remotion/mcp/dist/esm/index.mjs';

function safeListProjects() {
  if (!fs.existsSync(PROJECTS_ROOT)) return [];
  return fs.readdirSync(PROJECTS_ROOT)
    .filter(n => fs.statSync(path.join(PROJECTS_ROOT, n)).isDirectory())
    .sort();
}

async function status() {
  const out = [];
  out.push('REMOTION STACK');
  out.push('─'.repeat(60));
  out.push('MCP server:');
  out.push('  index:     ' + MCP_INDEX);
  out.push('  exists:    ' + (fs.existsSync(MCP_INDEX) ? 'yes' : 'NO — re-run install'));
  out.push('');
  out.push('Config:');
  out.push('  mcp.json:  C:/Users/Admin/.purpclaw/mcp.json');
  out.push('  exists:    ' + (fs.existsSync('C:/Users/Admin/.purpclaw/mcp.json') ? 'yes' : 'NO'));
  out.push('');
  out.push('Skill:');
  out.push('  location:  C:/Users/Admin/AppData/Local/hermes/skills/remotion/');
  out.push('  port:      E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/skills/remotion/');
  out.push('');
  out.push('Verify script:');
  out.push('  path:      ' + VERIFY_SCRIPT);
  out.push('  exists:    ' + (fs.existsSync(VERIFY_SCRIPT) ? 'yes' : 'NO'));
  out.push('');
  const projects = safeListProjects();
  out.push('Projects (' + projects.length + '):');
  if (projects.length === 0) {
    out.push('  (none) — run: purpclaw remotion render <name>');
  } else {
    for (const p of projects) {
      const out_mp4 = path.join(PROJECTS_ROOT, p, 'out.mp4');
      const rendered = fs.existsSync(out_mp4);
      const size = rendered ? fs.statSync(out_mp4).size : 0;
      out.push('  ' + (rendered ? '✓' : '·') + ' ' + p + (rendered ? '  (out.mp4: ' + size + ' bytes)' : '  (no out.mp4 yet)'));
    }
  }
  return out.join('\n');
}

async function renderProject(name, extra) {
  if (!name) return 'usage: purpclaw remotion render <name> [--scaffold] [--out=file.png] [--frame=N]';
  const dir = path.join(PROJECTS_ROOT, name);
  // CLI defaults to scaffold: true so a single command does the full job
  if (!('scaffold' in extra)) extra.scaffold = true;
  if (!('writeSmoke' in extra)) extra.writeSmoke = true;
  if (!('verify' in extra)) extra.verify = true;
  // Delegate to the tool — let it handle scaffold + render + verify
  const tools = require('../tools');
  return JSON.stringify(await tools.invoke('remotion_render', { project: name, ...extra }), null, 2);
}

async function stillProject(name, frame) {
  if (!name) return 'usage: purpclaw remotion still <name> [frame=30]';
  const tools = require('../tools');
  return JSON.stringify(await tools.invoke('remotion_still', { project: name, frame: Number(frame || 30), scaffold: false }), null, 2);
}

async function verifyFile(file) {
  if (!file) return 'usage: purpclaw remotion verify <video.mp4> [still.png]';
  const tools = require('../tools');
  return JSON.stringify(await tools.invoke('remotion_verify', { video: file }), null, 2);
}

async function listProjects() {
  const projects = safeListProjects();
  if (!projects.length) return '(no projects) — run: purpclaw remotion render <name>';
  return projects.map(p => '  ' + p).join('\n');
}

async function run(args, ctx) {
  const sub = (args[0] || 'status').toLowerCase();
  const rest = args.slice(1);
  try {
    switch (sub) {
      case 'status':   return await status();
      case 'render':   return await renderProject(rest[0], parseKwargs(rest.slice(1)));
      case 'still':    return await stillProject(rest[0], rest[1]);
      case 'verify':   return await verifyFile(rest[0]);
      case 'list':
      case 'ls':       return await listProjects();
      case 'help':
      case '--help':
      case '-h':
        return [
          'usage: purpclaw remotion <subcommand> [args]',
          '',
          '  status                          show MCP server + projects + verify script state',
          '  list                            list projects under remotion-projects/',
          '  render <name> [--frame=N]       render the project to out.mp4 (or out.png if --out=*.png)',
          '  still <name> [frame=30]         render a single frame to out.png',
          '  verify <file>                   run the verify script against a render',
          '',
          'all commands use the same code path as the agent loop — no shell-out to npx.',
        ].join('\n');
      default:
        return 'unknown subcommand: ' + sub + '\nrun: purpclaw remotion help';
    }
  } catch (e) {
    return 'remotion ' + sub + ' failed: ' + (e.message || String(e));
  }
}

function parseKwargs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq >= 0) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        out[a.slice(2)] = argv[++i];
      }
    }
  }
  return out;
}

module.exports = { run, status, renderProject, stillProject, verifyFile, listProjects };
