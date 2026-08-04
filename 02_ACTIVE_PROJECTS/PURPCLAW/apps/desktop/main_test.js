'use strict';
const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

const TEST_URL = process.argv[2] || 'about:blank';

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'PURPCLAW Test',
  });
  console.log('[TEST] Loading:', TEST_URL);
  win.loadURL(TEST_URL).then(() => {
    console.log('[TEST] Loaded OK');
  }).catch((err) => {
    console.error('[TEST] Load failed:', err.message);
  });
  win.on('closed', () => { win = null; });
  win.webContents.on('crashed', () => {
    console.error('[TEST] Renderer crashed!');
  });
  win.webContents.on('render-process-gone', (_evt, details) => {
    console.error('[TEST] Renderer gone:', details.reason);
  });
}

app.whenReady().then(() => {
  createWindow();
});
app.on('window-all-closed', () => { app.quit(); });
