const fs = require('fs');
console.log('CWD:', process.cwd());
console.log('Dir . :', fs.readdirSync('.'));
console.log('Dir /app/applet:', fs.readdirSync('/app/applet').catch ? 'error' : 'ok'); // wait, fs.readdirSync will throw 
