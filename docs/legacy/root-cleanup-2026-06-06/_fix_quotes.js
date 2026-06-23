const fs = require('fs');
let c = fs.readFileSync('E:\\god folder\\02_ACTIVE_PROJECTS\\PURPCLAW\\ecosystem.config.js', 'utf8');
c = c.replace(/\u201c/g, '"').replace(/\u201d/g, '"');
fs.writeFileSync('E:\\god folder\\02_ACTIVE_PROJECTS\\PURPCLAW\\ecosystem.config.js', c);
console.log('fixed curly quotes');
