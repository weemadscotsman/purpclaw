/**
 * Simple HTTP server for thought_visualizer.html on port 3030
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3030;
const HTML_FILE = path.join(__dirname, 'thought_visualizer.html');

const html = fs.readFileSync(HTML_FILE, 'utf8');

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(html);
});

server.listen(PORT, () => {
  console.log(`🎨 Visualizer running at http://localhost:${PORT}`);
});
