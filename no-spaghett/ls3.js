const fs = require('fs');
console.log('CWD:', process.cwd());
try { console.log('Dir . :', fs.readdirSync('.')); } catch (e) { console.log(e.message); }
try { console.log('Dir /app :', fs.readdirSync('/app')); } catch (e) { console.log(e.message); }
try { console.log('Dir /app/applet:', fs.readdirSync('/app/applet')); } catch (e) { console.log(e.message); }
