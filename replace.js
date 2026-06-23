const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'components', 'Orchestrator.tsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(/OpenClaw/g, 'PURPCLAW');
content = content.replace(/<Network size=\{20\} className="text-blue-500" \/>/g, '<img src="https://storage.googleapis.com/mako-assets/image-generation/1b918115-4f36-4158-b6d4-83944d187219/1271166373722251322.jpg" alt="PURPCLAW Logo" className="w-6 h-6 rounded border border-purple-500/50" />');
content = content.replace(/text-blue-500/g, 'text-purple-500');
content = content.replace(/bg-blue-500/g, 'bg-purple-500');
content = content.replace(/text-blue-400/g, 'text-purple-400');
content = content.replace(/bg-blue-600/g, 'bg-purple-600');
content = content.replace(/text-blue-300/g, 'text-purple-300');
content = content.replace(/border-blue-500/g, 'border-purple-500');
content = content.replace(/ring-blue-500/g, 'ring-purple-500');
content = content.replace(/bg-blue-900/g, 'bg-purple-900');
content = content.replace(/#3b82f6/g, '#a855f7'); // blue-500 to purple-500

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');
