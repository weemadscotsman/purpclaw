// Write output to file immediately
const fs = require('fs');
const { generateCritique } = require('./src/minimax');

const outFile = 'C:\\Users\\Admin\\Desktop\\companion-chorus\\ai-test-output.txt';
fs.writeFileSync(outFile, 'Starting MiniMax AI test...\n');

function log(msg) {
  const line = msg + '\n';
  fs.appendFileSync(outFile, line);
  console.log(msg);
}

log('Testing MiniMax AI companions...');

// Test with delay
generateCritique('duck', 'function hello() { return "world" }', (err, resp) => {
  log('🦆 DUCK: ' + (resp || 'ERROR: ' + (err ? err.message : 'no response')));
  log('[DONE 1]');
});

generateCritique('dragon', 'const x = 1; if(x = 2) console.log(x)', (err, resp) => {
  log('🐉 DRAGON: ' + (resp || 'ERROR: ' + (err ? err.message : 'no response')));
  log('[DONE 2]');
});

generateCritique('void', 'try { JSON.parse(undefined) } catch(e) {}', (err, resp) => {
  log('🌀 VOID: ' + (resp || 'ERROR: ' + (err ? err.message : 'no response')));
  log('[DONE 3]');
});

generateCritique('chonk', '// TODO: fix this later', (err, resp) => {
  log('💀 CHONK: ' + (resp || 'ERROR: ' + (err ? err.message : 'no response')));
  log('[DONE 4]');
  log('\nAll done! File: ' + outFile);
});

// Exit after 10s regardless
setTimeout(() => {
  log('\n[TIMEOUT - exiting]');
  process.exit(0);
}, 10000);
