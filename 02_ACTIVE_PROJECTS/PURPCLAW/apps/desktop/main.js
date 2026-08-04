'use strict';
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

const GATEWAY_PORT = process.env.PURPCLAW_GATEWAY_PORT || 9119;
const NEXT_HOST   = process.env.PURPCLAW_UI_HOST    || '127.0.0.1';
const NEXT_PORT   = process.env.PURPCLAW_UI_PORT    || 3030;
const NEXT_URL    = `http://${NEXT_HOST}:${NEXT_PORT}`;
const MISSION_URL = `${NEXT_URL}/mission`;
const START_PATH  = process.env.PURPCLAW_DESKTOP_START_PATH || '/mission';
const START_URL   = `${NEXT_URL}${START_PATH.startsWith('/') ? START_PATH : `/${START_PATH}`}`;

let win      = null;
let webContents = null;

function createWindow() {
  win = new BrowserWindow({
    width:  1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title:   'PURPCLAW — Autonomous Governance Bridge',
    backgroundColor: '#030508',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  webContents = win.webContents;

  webContents.on('render-process-gone', (_evt, details) => {
    console.error('[PURPCLAW Desktop] Renderer gone:', details.reason);
  });
  webContents.on('crashed', () => {
    console.error('[PURPCLAW Desktop] Renderer crashed');
  });

  const e2eScriptFile = process.env.PURPCLAW_DESKTOP_E2E_SCRIPT_FILE;
  const e2eReceiptFile = process.env.PURPCLAW_DESKTOP_E2E_RECEIPT;
  if (process.env.PURPCLAW_DESKTOP_E2E === '1' && e2eScriptFile && e2eReceiptFile) {
    webContents.once('dom-ready', async () => {
      let receipt;
      let exitCode = 0;
      try {
        const fs = require('fs');
        const source = fs.readFileSync(e2eScriptFile, 'utf8');
        const result = await webContents.executeJavaScript(source, true);
        receipt = { ok: true, result };
      } catch (error) {
        exitCode = 1;
        receipt = {
          ok: false,
          error: error && (error.stack || error.message) || String(error),
        };
      }
      try {
        const fs = require('fs');
        fs.mkdirSync(path.dirname(e2eReceiptFile), { recursive: true });
        fs.writeFileSync(e2eReceiptFile, JSON.stringify(receipt), 'utf8');
      } finally {
        setTimeout(() => app.exit(exitCode), 50);
      }
    });
  }

  const maxLoadRetries = process.env.PURPCLAW_DESKTOP_E2E === '1' ? 3 : 1;
  const loadStartUrl = (attempt = 0) => {
    win.loadURL(START_URL).catch((err) => {
      console.error('[PURPCLAW Desktop] Failed to load:', START_URL, err.message);
      if (attempt < maxLoadRetries && win && !win.isDestroyed()) {
        const retry = attempt + 1;
        console.warn(`[PURPCLAW Desktop] Retrying startup load (${retry}/${maxLoadRetries})`);
        setTimeout(() => loadStartUrl(retry), 1000);
      }
    });
  };
  loadStartUrl();

  win.on('closed', () => { win = null; webContents = null; });
}

function buildMenu() {
  const navigate = (p) => {
    if (!webContents) return;
    const target = p.startsWith('http') ? p : `${NEXT_URL}${p}`;
    webContents.loadURL(target).catch(e =>
      console.error('[PURPCLAW Desktop] Nav failed:', target, e)
    );
  };

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'PURPCLAW',
      submenu: [
        { label: 'Mission Control', click: () => navigate('/mission') },
        { label: 'Asher',           click: () => navigate('/mochi') },
        { label: 'Self-Evolution',  click: () => navigate('/evolution') },
        { label: 'Settings',        click: () => navigate('/settings') },
        { label: 'Providers',       click: () => navigate('/providers') },
        { label: 'Abliterator',     click: () => navigate('/abliterator') },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => webContents?.reload() },
        { label: 'Dev Tools', accelerator: 'F12', click: () => webContents?.toggleDevTools() },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About PURPCLAW', click: () => {
          const { dialog } = require('electron');
          dialog.showMessageBox(win, {
            type: 'info',
            title: 'PURPCLAW Desktop',
            message: 'PURPCLAW — Autonomous Agent Workstation',
            detail: `Gateway: ws://${NEXT_HOST}:${GATEWAY_PORT}\nNext.js: ${NEXT_URL}`,
          });
        }},
      ],
    },
  ]));
}

function setupIPC() {
  ipcMain.on('navigate:to', (_evt, { path: targetPath }) => {
    if (!webContents) return;
    const url = targetPath.startsWith('http')
      ? targetPath
      : `${NEXT_URL}${targetPath}`;
    webContents.loadURL(url).catch(e =>
      console.error('[PURPCLAW Desktop] IPC nav failed:', url, e)
    );
  });
  ipcMain.on('approval:respond', (_evt, { requestId, approved }) => {
    webContents?.send('approval:response', { requestId, approved });
  });
  ipcMain.on('conversation:new', () => {
    webContents?.send('conversation:new');
  });
  ipcMain.on('sessions:show', () => {
    webContents?.send('navigate', 'sessions');
  });
  ipcMain.on('open-external', (_evt, { url }) => {
    require('electron').shell.openExternal(url);
  });
}

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-sandbox');

app.whenReady().then(() => {
  if (process.env.PURPCLAW_DESKTOP_E2E === '1') Menu.setApplicationMenu(null);
  else buildMenu();
  setupIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
