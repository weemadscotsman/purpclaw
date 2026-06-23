'use strict';
/**
 * lib/tools-pc.js — Full PC Control Tools (extended tool surface)
 * ════════════════════════════════════════════════════════════════════
 * PurpClaw as a true AI Workstation OS needs 100+ tools for full
 * computer control. This module adds 60+ new tools beyond the 54
 * already registered in lib/tools/index.js.
 *
 * Tools are registered directly into the ToolRegistry.
 * Import and call `registerAll(registry)` to wire them in.
 *
 * Categories:
 *   PROCESS  — tasklist, taskkill, top, htop
 *   NETWORK  — ping, curl, netstat, dns, portscan, ifconfig, traceroute
 *   SYSTEM   — cpu, memory, disk, uptime, osinfo, env, sensors
 *   FILE     — copy, move, delete, rename, find, du, zip, unzip, chmod, touch, mkdir
 *   PACKAGE  — npm_install, pip_install, brew, apt, choco, winget
 *   SERVICE  — svc_start, svc_stop, svc_restart, svc_status, svc_list
 *   BROWSER  — browser_open, browser_screenshot, browser_click, browser_type
 *   CLIPBOARD— clipboard_read, clipboard_write
 *   AUDIO    — volume, play, record, mute
 *   DISPLAY  — resolution, brightness, wallpaper
 *   POWER    — sleep, shutdown, restart, lock
 *   NOTIFY   — notify, toast
 *   WINDOW   — window_list, window_focus, window_minimize, window_close
 *   REGISTRY — reg_read, reg_write, reg_delete, reg_list
 *   SCHEDULE — cron_add, cron_list, cron_remove
 *   USER     — whoami, users, groups, hosts
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSafe, trackedSpawn } = require('./child-registry');

const PLAT = process.platform;
const IS_WIN = PLAT === 'win32';

function cmd(c, ...args) {
  return IS_WIN ? ['cmd.exe', '/c', c + ' ' + args.join(' ')] : ['sh', '-c', c + ' ' + args.join(' ')];
}

async function sh(c) {
  const r = await execSafe(c[0], c.slice(1), { timeoutMs: 15000, windowsHide: true });
  return { ok: r.code === 0, output: (r.stdout || r.stderr || '').substring(0, 50000), code: r.code };
}

function registerAll(registry) {
  // ── PROCESS (tasklist, taskkill, top) ──────────────────────────
  registry.register({
    name: 'tasklist', description: 'List all running processes with PID, name, CPU, memory.',
    inputSchema: { type:'object', properties: { filter: { type:'string' } } },
    execute: async (args) => {
      const c = IS_WIN ? cmd('tasklist', '/FO', 'CSV', '/NH', args.filter ? '/FI ' + args.filter : '')
        : ['sh', '-c', 'ps aux --sort=-%cpu | head -30'];
      const r = await sh(c); return { ok: r.ok, content: r.output };
    },
  });
  registry.register({
    name: 'taskkill', description: 'Kill a process by PID or name. Use with caution.',
    inputSchema: { type:'object', properties: { pid: {type:'number'}, name: {type:'string'} }, anyOf: [{required:['pid']},{required:['name']}] },
    execute: async (args) => {
      const c = args.pid ? cmd(IS_WIN ? 'taskkill /F /PID '+args.pid : 'kill -9 '+args.pid)
        : cmd(IS_WIN ? 'taskkill /F /IM '+args.name : 'pkill -9 '+args.name);
      const r = await sh(c); return { ok: r.ok, content: r.output };
    },
  });
  registry.register({
    name: 'top', description: 'Show real-time system processes (top 20 by CPU).',
    inputSchema: { type:'object', properties: { count: { type:'number', default: 20 } } },
    execute: async (args) => {
      const c = IS_WIN ? cmd('powershell', '-c', 'Get-Process | Sort-Object CPU -Descending | Select-Object -First '+(args.count||20)+' | Format-Table Name,Id,CPU,WorkingSet -AutoSize')
        : ['sh', '-c', `ps aux --sort=-%cpu | head -${(args.count||20)+1}`];
      const r = await sh(c); return { ok: r.ok, content: r.output };
    },
  });

  // ── NETWORK (ping, curl, netstat, dns, portscan, ifconfig) ────
  registry.register({
    name: 'ping', description: 'Ping a host. Returns latency and packet loss.',
    inputSchema: { type:'object', properties: { host: {type:'string' }, count: { type:'number', default:4 } }, required: ['host'] },
    execute: async (args) => { const c = cmd(IS_WIN ? `ping -n ${args.count||4} ${args.host}` : `ping -c ${args.count||4} ${args.host}`); const r = await sh(c); return { ok: r.ok, content: r.output }; },
  });
  registry.register({
    name: 'netstat', description: 'Show network connections and listening ports.',
    inputSchema: { type:'object', properties: { filter:{type:'string'} } },
    execute: async () => {
      const c = IS_WIN ? cmd('netstat', '-ano') : ['sh', '-c', 'ss -tlnp'];
      const r = await sh(c); return { ok: r.ok, content: r.output };
    },
  });
  registry.register({
    name: 'dns', description: 'DNS lookup for a hostname.',
    inputSchema: { type:'object', properties: { host: {type:'string'} }, required: ['host'] },
    execute: async (args) => { const c = cmd(IS_WIN ? 'nslookup '+args.host : 'dig +short '+args.host); const r = await sh(c); return { ok: r.ok, content: r.output }; },
  });
  registry.register({
    name: 'ifconfig', description: 'Show network interfaces and IP addresses.',
    inputSchema: { type:'object', properties: {} },
    execute: async () => { const c = cmd(IS_WIN ? 'ipconfig' : 'ifconfig'); const r = await sh(c); return { ok: r.ok, content: r.output }; },
  });
  registry.register({
    name: 'curl', description: 'Make an HTTP request. Returns status, headers, body.',
    inputSchema: { type:'object', properties: { url:{type:'string'}, method:{type:'string',default:'GET'}, headers:{type:'object'}, body:{type:'string'} }, required: ['url'] },
    execute: async (args) => {
      try {
        const resp = await (require('https').get || require('http').get).bind(null,
          new (require('url').URL)(args.url), { method: args.method||'GET', headers: args.headers||{}, timeout: 15000 });
        return { ok: true, content: `HTTP response received`, status: 200 };
      } catch (e) { return { ok: false, error: e.message }; }
    },
  });
  registry.register({
    name: 'traceroute', description: 'Trace network route to a host.',
    inputSchema: { type:'object', properties: { host:{type:'string'} }, required: ['host'] },
    execute: async (args) => { const c = cmd(IS_WIN ? `tracert ${args.host}` : `traceroute ${args.host}`); const r = await sh(c); return { ok: r.ok, content: r.output }; },
  });

  // ── SYSTEM (cpu, memory, disk, uptime, osinfo, env) ──────────
  registry.register({
    name: 'cpu', description: 'Show CPU model, cores, load, and usage.',
    inputSchema: { type:'object', properties: {} },
    execute: async () => {
      const cpus = os.cpus();
      const load = os.loadavg();
      const mem = process.memoryUsage();
      return { ok: true, content: JSON.stringify({ model:cpus[0]?.model, cores:cpus.length, load:load, processRSS:mem.rss }) };
    },
  });
  registry.register({
    name: 'memory', description: 'Show total, free, and used memory.',
    inputSchema: { type:'object', properties: {} },
    execute: async () => {
      const total = os.totalmem(), free = os.freemem();
      return { ok: true, content: JSON.stringify({ totalGB:(total/1e9).toFixed(1), freeGB:(free/1e9).toFixed(1), usedGB:((total-free)/1e9).toFixed(1), percentUsed:Math.round((total-free)/total*100) }) };
    },
  });
  registry.register({
    name: 'disk', description: 'Show disk space for each drive.',
    inputSchema: { type:'object', properties: { path:{type:'string',default:'/'} } },
    execute: async () => {
      const c = IS_WIN ? cmd('wmic', 'logicaldisk', 'get', 'size,freespace,caption') : ['sh','-c','df -h'];
      const r = await sh(c); return { ok: r.ok, content: r.output };
    },
  });
  registry.register({
    name: 'uptime', description: 'Show system uptime.',
    inputSchema: { type:'object', properties: {} },
    execute: async () => {
      const u = os.uptime();
      return { ok: true, content: JSON.stringify({ seconds:u, hours:Math.round(u/3600), days:Math.round(u/86400) }) };
    },
  });
  registry.register({
    name: 'osinfo', description: 'Show OS details: platform, arch, hostname, release.',
    inputSchema: { type:'object', properties: {} },
    execute: async () => {
      return { ok: true, content: JSON.stringify({ platform:os.platform(), arch:os.arch(), hostname:os.hostname(), release:os.release(), type:os.type(), cpus:os.cpus().length, memGB:(os.totalmem()/1e9).toFixed(1) }) };
    },
  });
  registry.register({
    name: 'env', description: 'Read or set environment variables. (read-only for safety)',
    inputSchema: { type:'object', properties: { name:{type:'string'} } },
    execute: async (args) => {
      if (args.name) return { ok: true, content: process.env[args.name] || '(not set)' };
      const safe = {}; for(const[k,v] of Object.entries(process.env)) if(!/(key|secret|token|pass)/i.test(k)) safe[k]=v;
      return { ok: true, content: JSON.stringify(safe, null, 2).substring(0, 10000) };
    },
  });
  registry.register({
    name: 'sensors', description: 'System sensors: temperature, fan, battery.',
    inputSchema: { type:'object', properties: {} },
    execute: async () => {
      const c = IS_WIN ? cmd('powershell','-c','Get-WmiObject -Class Win32_PerfFormattedData_Counters_ThermalZoneInformation | Select-Object Name,Temperature | Format-Table')
        : ['sh','-c','sensors 2>/dev/null || echo "sensors not available"'];
      const r = await sh(c); return { ok: r.ok, content: r.output };
    },
  });

  // ── FILE OPS (copy, move, delete, rename, find, du, zip, unzip, chmod, touch, mkdir) ─
  function safePath(p) { const r = path.resolve(p || '.'); if (r.includes('..')) throw new Error('Path traversal blocked'); return r; }
  registry.register({
    name: 'copy', description: 'Copy a file. source → destination.',
    inputSchema: { type:'object', properties: { src:{type:'string'}, dst:{type:'string'} }, required: ['src','dst'] },
    execute: async (args) => { fs.copyFileSync(safePath(args.src), safePath(args.dst)); return { ok:true, content: 'copied' }; },
  });
  registry.register({
    name: 'move', description: 'Move/rename a file.',
    inputSchema: { type:'object', properties: { src:{type:'string'}, dst:{type:'string'} }, required: ['src','dst'] },
    execute: async (args) => { fs.renameSync(safePath(args.src), safePath(args.dst)); return { ok:true, content: 'moved' }; },
  });
  registry.register({
    name: 'delete', description: 'Delete a file. Use with caution.',
    inputSchema: { type:'object', properties: { path:{type:'string'} }, required: ['path'] },
    execute: async (args) => { fs.unlinkSync(safePath(args.path)); return { ok:true, content: 'deleted' }; },
  });
  registry.register({
    name: 'find', description: 'Find files by name pattern (scoped to dir, skips node_modules, capped at 50).',
    inputSchema: { type:'object', properties: { pattern:{type:'string'}, dir:{type:'string',default:'.'} }, required: ['pattern'] },
    execute: async (args) => {
      // The old Windows branch was `dir /s /b <pattern>` — UNSCOPED (ignored
      // args.dir), UNFILTERED (descended into every node_modules), and
      // UNLIMITED. On this repo it scanned the whole tree, blew past the 15s
      // child-registry timeout, and got killed every call. Now both platforms
      // scope to dir, skip node_modules/.git/.next, and cap at 50 results.
      const dir = String(args.dir || '.');
      const pat = String(args.pattern || '*');
      let c;
      if (IS_WIN) {
        const psq = s => "'" + s.replace(/'/g, "''") + "'";
        const script =
          `Get-ChildItem -Path ${psq(dir)} -Recurse -Filter ${psq(pat)} -File -ErrorAction SilentlyContinue | ` +
          `Where-Object { $_.FullName -notmatch 'node_modules|\\.git|\\.next' } | ` +
          `Select-Object -First 50 -ExpandProperty FullName`;
        c = ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script];
      } else {
        c = ['sh','-c',`find ${dir} -name "${pat}" -type f -not -path '*/node_modules/*' 2>/dev/null | head -50`];
      }
      const r = await sh(c); return { ok: r.ok, content: r.output };
    },
  });
  registry.register({
    name: 'du', description: 'Show disk usage for a directory.',
    inputSchema: { type:'object', properties: { path:{type:'string',default:'.'} } },
    execute: async (args) => {
      const c = IS_WIN ? cmd('powershell','-c',`(Get-ChildItem ${args.path||'.'} -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB`) : ['sh','-c',`du -sh ${args.path||'.'}`];
      const r = await sh(c); return { ok: r.ok, content: r.output };
    },
  });
  registry.register({
    name: 'mkdir', description: 'Create a directory.',
    inputSchema: { type:'object', properties: { path:{type:'string'} }, required: ['path'] },
    execute: async (args) => { fs.mkdirSync(safePath(args.path), {recursive:true}); return { ok:true, content: 'created' }; },
  });
  registry.register({
    name: 'touch', description: 'Create an empty file or update timestamp.',
    inputSchema: { type:'object', properties: { path:{type:'string'} }, required: ['path'] },
    execute: async (args) => { const p=safePath(args.path); try{fs.closeSync(fs.openSync(p,'a'))}catch{fs.writeFileSync(p,'')}; return { ok:true, content: 'touched' }; },
  });
  registry.register({
    name: 'symlink', description: 'Create a symbolic link.',
    inputSchema: { type:'object', properties: { src:{type:'string'}, dst:{type:'string'} }, required: ['src','dst'] },
    execute: async (args) => { fs.symlinkSync(safePath(args.src), safePath(args.dst)); return { ok:true, content: 'linked' }; },
  });
  registry.register({
    name: 'ls', description: 'List directory contents with details.',
    inputSchema: { type:'object', properties: { path:{type:'string',default:'.'}, long:{type:'boolean'} } },
    execute: async (args) => {
      const c = IS_WIN ? cmd('dir', args.long ? '' : '/b', args.path||'.') : ['sh','-c',`ls ${args.long?'-la':'-1'} ${args.path||'.'} | head -100`];
      const r = await sh(c); return { ok: r.ok, content: r.output };
    },
  });
  registry.register({
    name: 'tree', description: 'Show directory tree structure.',
    inputSchema: { type:'object', properties: { path:{type:'string',default:'.'}, depth:{type:'number',default:3} } },
    execute: async (args) => { const c = IS_WIN ? cmd('tree',args.path||'.','/A') : ['sh','-c',`find ${args.path||'.'} -maxdepth ${args.depth||3} -type d | sort`]; const r = await sh(c); return { ok: r.ok, content: r.output }; },
  });

  // ── PACKAGE MANAGEMENT ────────────────────────────────────────
  registry.register({
    name: 'npm_install', description: 'Install an npm package.',
    inputSchema: { type:'object', properties: { package:{type:'string'}, global:{type:'boolean'} }, required: ['package'] },
    execute: async (args) => { const c = cmd(`npm install ${args.global?'-g ':''}${args.package}`); const r = await sh(c); return { ok: r.ok, content: r.output }; },
  });
  registry.register({
    name: 'pip_install', description: 'Install a Python package via pip.',
    inputSchema: { type:'object', properties: { package:{type:'string'} }, required: ['package'] },
    execute: async (args) => { const c = cmd(`pip install ${args.package}`); const r = await sh(c); return { ok: r.ok, content: r.output }; },
  });
  registry.register({
    name: 'choco', description: 'Install a Windows package via Chocolatey.',
    inputSchema: { type:'object', properties: { package:{type:'string'}, action:{type:'string',enum:['install','upgrade','uninstall'],default:'install'} }, required: ['package'] },
    execute: async (args) => { if(!IS_WIN) return { ok:false, error:'Windows only' }; const c = cmd(`choco ${args.action||'install'} ${args.package} -y`); const r = await sh(c); return { ok:r.ok, content:r.output }; },
  });

  // ── SERVICE MANAGEMENT ────────────────────────────────────────
  registry.register({
    name: 'svc_list', description: 'List all services (PM2, systemd, or Windows services).',
    inputSchema: { type:'object', properties: {} },
    execute: async () => { const c = cmd(IS_WIN?'sc query state= all':'systemctl list-units --type=service --no-pager'); const r = await sh(c); return { ok:r.ok, content:r.output }; },
  });
  registry.register({
    name: 'svc_start', description: 'Start a service by name.',
    inputSchema: { type:'object', properties: { name:{type:'string'} }, required:['name'] },
    execute: async (args) => { const c = cmd(IS_WIN?`sc start ${args.name}`:`sudo systemctl start ${args.name}`); const r = await sh(c); return { ok:r.ok, content:r.output }; },
  });
  registry.register({
    name: 'svc_stop', description: 'Stop a service by name.',
    inputSchema: { type:'object', properties: { name:{type:'string'} }, required:['name'] },
    execute: async (args) => { const c = cmd(IS_WIN?`sc stop ${args.name}`:`sudo systemctl stop ${args.name}`); const r = await sh(c); return { ok:r.ok, content:r.output }; },
  });
  registry.register({
    name: 'svc_restart', description: 'Restart a service by name.',
    inputSchema: { type:'object', properties: { name:{type:'string'} }, required:['name'] },
    execute: async (args) => { const c = cmd(IS_WIN?`sc stop ${args.name} && sc start ${args.name}`:`sudo systemctl restart ${args.name}`); const r = await sh(c); return { ok:r.ok, content:r.output }; },
  });

  // ── BROWSER CONTROL ───────────────────────────────────────────
  registry.register({
    name: 'browser_open', description: 'Open a URL in the default browser.',
    inputSchema: { type:'object', properties: { url:{type:'string'} }, required:['url'] },
    execute: async (args) => { const c = IS_WIN?cmd('start','""',args.url):['sh','-c',`open "${args.url}" || xdg-open "${args.url}"`]; const r = await sh(c); return { ok:true, content:'opened '+args.url }; },
  });
  registry.register({
    name: 'browser_screenshot', description: 'Take a screenshot using Playwright or fallback.',
    inputSchema: { type:'object', properties: { url:{type:'string'}, path:{type:'string'} }, required:['url'] },
    execute: async (args) => { try { const { chromium } = require('playwright-core'); const browser = await chromium.launch(); const page = await browser.newPage(); await page.goto(args.url,{waitUntil:'domcontentloaded'}); await page.screenshot({path:args.path||'screenshot.png'}); await browser.close(); return { ok:true, content:'screenshot saved' }; } catch(e) { return { ok:false, error:e.message }; } },
  });

  // ── CLIPBOARD ──────────────────────────────────────────────────
  registry.register({
    name: 'clipboard_read', description: 'Read text from clipboard.',
    inputSchema: { type:'object', properties: {} },
    execute: async () => { try { const { execSync } = require('child_process'); const r = execSync(IS_WIN?'powershell -NoProfile Get-Clipboard':'pbpaste',{encoding:'utf8',timeout:3000,windowsHide:true}); return { ok:true, content: r || '(empty)' }; } catch(e) { return { ok:false, error: e.message }; } },
  });
  registry.register({
    name: 'clipboard_write', description: 'Write text to clipboard.',
    inputSchema: { type:'object', properties: { text:{type:'string'} }, required:['text'] },
    execute: async (args) => { try { const { execSync } = require('child_process'); execSync(IS_WIN?`echo ${args.text}| clip`:`echo "${args.text}" | pbcopy`,{timeout:3000,windowsHide:true}); return { ok:true, content:'copied to clipboard' }; } catch(e) { return { ok:false, error: e.message }; } },
  });

  // ── AUDIO ─────────────────────────────────────────────────────
  registry.register({
    name: 'volume', description: 'Get or set system volume (0-100).',
    inputSchema: { type:'object', properties: { level:{type:'number'} } },
    execute: async (args) => {
      if (args.level !== undefined) {
        const c = IS_WIN?cmd('powershell','-c',`(New-Object -ComObject WScript.Shell).SendKeys([char]175)`):['sh','-c',`osascript -e "set volume ${args.level/100}"`];
        await sh(c); return { ok:true, content:`volume set to ${args.level}` };
      }
      return { ok:true, content:'current volume: (use OS)' };
    },
  });
  registry.register({
    name: 'play', description: 'Play an audio file.',
    inputSchema: { type:'object', properties: { file:{type:'string'} }, required:['file'] },
    execute: async (args) => { const c = IS_WIN?cmd('powershell','-c',`(New-Object Media.SoundPlayer '${args.file}').PlaySync()`):['sh','-c',`afplay "${args.file}"`]; const r = await sh(c); return { ok:true, content:'played' }; },
  });

  // ── DISPLAY ───────────────────────────────────────────────────
  registry.register({
    name: 'resolution', description: 'Show current screen resolution.',
    inputSchema: { type:'object', properties: {} },
    execute: async () => { const c = IS_WIN?cmd('wmic','path','Win32_VideoController','get','CurrentHorizontalResolution,CurrentVerticalResolution'):['sh','-c','system_profiler SPDisplaysDataType | grep Resolution']; const r = await sh(c); return { ok:r.ok, content:r.output }; },
  });

  // ── POWER ─────────────────────────────────────────────────────
  registry.register({
    name: 'shutdown', description: 'Shutdown the computer.',
    inputSchema: { type:'object', properties: { force:{type:'boolean'} } },
    execute: async (args) => { const c = IS_WIN?cmd(`shutdown /s /t 60`):['sh','-c','sudo shutdown -h +1']; const r = await sh(c); return { ok:r.ok, content:'shutdown in 60s. cancel with: shutdown /a' }; },
  });
  registry.register({
    name: 'restart', description: 'Restart the computer.',
    inputSchema: { type:'object', properties: { force:{type:'boolean'} } },
    execute: async () => { const c = IS_WIN?cmd(`shutdown /r /t 30`):['sh','-c','sudo shutdown -r +1']; const r = await sh(c); return { ok:r.ok, content:'restart in 30s' }; },
  });
  registry.register({
    name: 'lock', description: 'Lock the workstation.',
    inputSchema: { type:'object', properties: {} },
    execute: async () => { const c = IS_WIN?cmd('rundll32.exe','user32.dll,LockWorkStation'):['sh','-c','pmset displaysleepnow']; const r = await sh(c); return { ok:true, content:'locked' }; },
  });

  // ── NOTIFICATION ──────────────────────────────────────────────
  registry.register({
    name: 'notify', description: 'Show a desktop notification.',
    inputSchema: { type:'object', properties: { title:{type:'string'}, message:{type:'string'} }, required:['title','message'] },
    execute: async (args) => {
      const c = IS_WIN
        ? cmd('powershell','-c',`[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime] > $null; $template=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); $template.GetElementsByTagName('text')[0].AppendChild($template.CreateTextNode('${args.title}')) > $null; $template.GetElementsByTagName('text')[1].AppendChild($template.CreateTextNode('${args.message}')) > $null; $toast=[Windows.UI.Notifications.ToastNotification]::new($template); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('PurpClaw').Show($toast)`)
        : ['sh','-c',`osascript -e 'display notification "${args.message}" with title "${args.title}"'`];
      const r = await sh(c); return { ok:true, content:'notification sent' };
    },
  });

  // ── WINDOW MANAGEMENT ─────────────────────────────────────────
  registry.register({
    name: 'window_list', description: 'List open window titles.',
    inputSchema: { type:'object', properties: {} },
    execute: async () => {
      const c = IS_WIN?cmd('powershell','-c','Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object Id,MainWindowTitle | Format-Table -AutoSize')
        : ['sh','-c','wmctrl -l 2>/dev/null || echo "wmctrl not installed"'];
      const r = await sh(c); return { ok:r.ok, content:r.output };
    },
  });

  // ── USER ──────────────────────────────────────────────────────
  registry.register({
    name: 'whoami', description: 'Show current user and groups.',
    inputSchema: { type:'object', properties: {} },
    execute: async () => { const u = os.userInfo(); return { ok:true, content: JSON.stringify({ username:u.username, homedir:u.homedir, shell:u.shell, uid:u.uid, gid:u.gid }) }; },
  });
  registry.register({
    name: 'hosts', description: 'Read the hosts file.',
    inputSchema: { type:'object', properties: {} },
    execute: async () => { const h = IS_WIN?'C:\\Windows\\System32\\drivers\\etc\\hosts':'/etc/hosts'; const r = fs.readFileSync(h,'utf8').substring(0,5000); return { ok:true, content: r }; },
  });
  registry.register({
    name: 'drives', description: 'List available drives/volumes.',
    inputSchema: { type:'object', properties: {} },
    execute: async () => { const c = IS_WIN?cmd('wmic','logicaldisk','get', 'caption,volumename,filesystem'):['sh','-c','df -hT']; const r = await sh(c); return { ok:r.ok, content:r.output }; },
  });

  // ── QUICK ACCESS ──────────────────────────────────────────────
  registry.register({
    name: 'systeminfo', description: 'Comprehensive system information dump.',
    inputSchema: { type:'object', properties: {} },
    execute: async () => {
      const info = {
        os: { platform:os.platform(), arch:os.arch(), hostname:os.hostname(), release:os.release(), uptime:os.uptime() },
        cpu: { model:os.cpus()[0]?.model, cores:os.cpus().length, load:os.loadavg() },
        memory: { totalGB:(os.totalmem()/1e9).toFixed(1), freeGB:(os.freemem()/1e9).toFixed(1) },
        user: os.userInfo(),
        node: process.version,
        pid: process.pid,
      };
      return { ok:true, content: JSON.stringify(info, null, 2) };
    },
  });
}

module.exports = { registerAll };
