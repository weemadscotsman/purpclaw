const fs = require('fs');
const G = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/artifacts/finish-sweep/gen-registry.js';
let g = fs.readFileSync(G, 'utf8');

const marker = "// explicit extra: offline parity alias";
if (!g.includes(marker)) { console.error('marker missing'); process.exit(1); }

const preDispatch = [
  "// pre-dispatch commands: handled before the switch in bin/purpclaw.js;",
  "// registry identity only (no module, never reaches the dispatcher).",
  "const PRE_DISPATCH = {",
  "  help:    ['workspace', 'Show help (all commands, or one command)', 0],",
  "  version: ['workspace', 'Print the purpclaw version', 0],",
  "};",
  "for (const [name, [category, description, json]] of Object.entries(PRE_DISPATCH)) {",
  "  entries.push({ name, aliases: [], module: null, category, description, json: !!json, legacyFn: false, inSwitch: false });",
  "}",
  "",
].join('\n');

g = g.replace(marker, preDispatch + marker);
g = g.replace(
  "weather: ['workspace', 'Operational weather report', 1],",
  "weather: ['workspace', 'Operational weather report', 1],\n  completion: ['workspace', 'Emit shell completion script (bash/zsh/powershell)', 0],"
);
fs.writeFileSync(G, g);
console.log('generator updated');
