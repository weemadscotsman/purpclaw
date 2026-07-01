// Quick test
const fs = require('fs');
const os = require('os');
const out = {
  node: process.version,
  platform: os.platform(),
  release: os.release(),
  hostname: os.hostname(),
  cpus: os.cpus().length,
  interfaces: Object.keys(os.networkInterfaces()).filter(n => !n.includes('Loopback') && !n.includes('VMware')).map(n => ({ name: n, addrs: os.networkInterfaces()[n].filter(a => a.family === 'IPv4').map(a => a.address) })),
  userInfo: os.userInfo(),
  cwd: process.cwd(),
  tmpdir: os.tmpdir()
};
fs.writeFileSync('.cactus/probe_test.out.json', JSON.stringify(out, null, 2));
process.stdout.write(JSON.stringify(out));
