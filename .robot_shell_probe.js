const fs = require('fs');
const path = require('path');
const stamp = new Date().toISOString();
const out = path.join(__dirname, '.robot_shell_probe.log');
fs.writeFileSync(out, `PROBE_OK ${stamp}\n`);
try {
  const r = require('./lib/team-router');
  const lines = [
    'EXPORT_KEYS=' + Object.keys(r).sort().join(','),
    'TEAMOWNER=' + r.TEAM.owner,
    'OVERVIEW_LEN=' + r.teamOverview().length,
    '---OVERVIEW---',
    r.teamOverview(),
  ];
  fs.appendFileSync(out, lines.join('\n') + '\n');
} catch (e) {
  fs.appendFileSync(out, 'ERR=' + e.message + '\n' + e.stack + '\n');
}
