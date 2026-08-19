const fs = require('fs');
const P = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/bin/purpclaw.js';
let src = fs.readFileSync(P, 'utf8');
// Match from the (possibly curly-quoted) vector case line through the drift guard's exit.
const re = /[ \t]*case .vector.:\s*return cmdVectorBench\(args\);\s*\r?\n[ \t]*default:[\s\S]*?process\.exit\(2\);/;
const m = src.match(re);
if (!m) { console.error('block not found'); process.exit(1); }
const fixed = [
  "    case 'vector':    return cmdVectorBench(args);",
  '    default:',
  '      // Unreachable in the registry era: unknown commands are rejected before',
  '      // the switch. Kept as a hard guard - a command reaching here means the',
  '      // registry and the switch have drifted apart.',
  '      console.error(col(C.red, \'\\n  Internal dispatch drift: "\' + command + \'" passed the registry check but has no case.\'));',
  "      console.error(col(C.gray, '  Report this - lib/cli/registry.js and the switch disagree.'));",
  '      process.exit(2);',
].join('\n');
src = src.replace(re, fixed);
fs.writeFileSync(P, src);
console.log('patched', m[0].length, 'bytes');
