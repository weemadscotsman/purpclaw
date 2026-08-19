const fs = require('fs');
const G = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/artifacts/finish-sweep/gen-registry.js';
let g = fs.readFileSync(G, 'utf8');

const marker = "for (const [name, [category, description, json]] of Object.entries(WIRED_ORPHANS)) {";
if (!g.includes(marker)) { console.error('marker missing'); process.exit(1); }

const override = `// command name -> module name when they differ
const MODULE_OVERRIDE = { personas: 'roster', app: 'desktop' };

` + marker;

g = g.replace(marker, override);
g = g.replace(
  "entries.push({ name, aliases: [], module: name, category, description, json: !!json, legacyFn: false, inSwitch: false });",
  "entries.push({ name, aliases: [], module: MODULE_OVERRIDE[name] || name, category, description, json: !!json, legacyFn: false, inSwitch: false });"
);
fs.writeFileSync(G, g);
console.log('module override added');
