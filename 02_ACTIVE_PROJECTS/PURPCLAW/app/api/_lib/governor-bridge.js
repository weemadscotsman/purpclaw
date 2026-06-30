// app/api/_lib/governor-bridge.js
// Thin proxy from Next route layer (3035) to the API server (7780)
// where the actual usage-governor lives in-process. Avoids webpack bundling
// issues with cross-module dynamic require().

const http = require('http');

function fetchGovernorStatus() {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 7780,
      path: '/api/internal/governor/status',
      method: 'GET',
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('parse: ' + e.message + ' / ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end();
  });
}

module.exports = { fetchGovernorStatus };
