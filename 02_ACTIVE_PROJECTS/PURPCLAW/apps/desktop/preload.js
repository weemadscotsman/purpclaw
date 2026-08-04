'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const GATEWAY_WS  = `ws://127.0.0.1:${process.env.PURPCLAW_GATEWAY_PORT || 9119}`;
const API_BASE    = `http://127.0.0.1:${process.env.PURPCLAW_UI_PORT || 3030}`;

// ── window.purpclaw — shared across all BrowserViews ───────────────────────────
// Each BrowserView gets its own preload context. All share the same gateway WS.

contextBridge.exposeInMainWorld('purpclaw', {

  // ── Agent Gateway WebSocket ────────────────────────────────────────────
  backend: () => ({ ws: GATEWAY_WS }),

  // ── REST API base ───────────────────────────────────────────────────────
  apiBase: API_BASE,

  // ── IPC: navigation between BrowserViews ─────────────────────────────────
  // Desktop-native nav: switch between pages without losing state in any view.
  // Each page is a dedicated BrowserView — like browser tabs, but managed by Electron.
  navigate: (path) => ipcRenderer.send('navigate:to', { path }),

  // ── IPC: approval flow ──────────────────────────────────────────────────
  approvalRespond: (requestId, approved) =>
    ipcRenderer.send('approval:respond', { requestId, approved }),

  // ── IPC: conversation / sessions ─────────────────────────────────────────
  newConversation: () => ipcRenderer.send('conversation:new'),
  showSessions:    () => ipcRenderer.send('sessions:show'),

  // ── IPC: external links ─────────────────────────────────────────────────
  openExternal: (url) => ipcRenderer.send('open-external', { url }),

  // ── Event listeners (per BrowserView) ──────────────────────────────────
  onNavigate:     (fn) => ipcRenderer.on('navigate',         (_e, v) => fn(v)),
  onApprovalResp: (fn) => ipcRenderer.on('approval:response',(_e, v) => fn(v)),
  onNewConv:     (fn) => ipcRenderer.on('conversation:new', ()       => fn()),
  onSessionsShow:(fn) => ipcRenderer.on('sessions:show',     ()       => fn()),

  // ── App info ───────────────────────────────────────────────────────────
  version:  '1.0.0',
  platform: process.platform,
});
