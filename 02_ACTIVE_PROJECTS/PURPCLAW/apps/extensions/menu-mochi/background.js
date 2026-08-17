const DEFAULT_STATE = {
  name: 'Mochi',
  stage: 'Arcade Blob',
  hunger: 82,
  happiness: 78,
  cleanliness: 85,
  energy: 72,
  boredom: 18,
  bond: 10,
  xp: 0,
  coins: 0,
  level: 1,
  careMistakes: 0,
  mood: 'idle',
  createdAt: Date.now(),
  lastTick: Date.now(),
  lastSeen: Date.now(),
  lastCareAt: Date.now(),
  activeMinutes: 0,
  tabSwitchesToday: 0,
  tabSwitchStamp: new Date().toDateString(),
  diary: ['Day 1: Mochi hatched inside the browser chrome and immediately became everyone’s problem.']
};

const SETTINGS_DEFAULTS = {
  tabBuddy: true,
  pageDock: true,
  nightShift: true,
  separationAnxiety: true,
  darrenMode: true,
  chaosLevel: 'gremlin'
};

let currentActiveTabId = null;
let currentWindowId = null;
let recentSwitches = [];

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['petState', 'mochiSettings']);
  if (!data.petState) await chrome.storage.local.set({ petState: DEFAULT_STATE });
  if (!data.mochiSettings) await chrome.storage.local.set({ mochiSettings: SETTINGS_DEFAULTS });
  chrome.alarms.create('mochiTick', { periodInMinutes: 5 });
  setTimeout(moveMochiToFocusedTab, 700);
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('mochiTick', { periodInMinutes: 5 });
  setTimeout(moveMochiToFocusedTab, 1200);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'mochiTick') return;
  const { petState } = await chrome.storage.local.get('petState');
  if (!petState) return;
  const next = applyDecay(petState);
  await chrome.storage.local.set({ petState: next });
  await updateAction(next);

  const low = Math.min(next.hunger, next.happiness, next.cleanliness, next.energy, 100 - (next.boredom || 0));
  if (low <= 18) {
    try {
      chrome.notifications.create('mochi-low-' + Date.now(), {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'MenuMochi needs you',
        message: `${next.name} is getting rough. Tiny emotional damage detected.`
      });
    } catch (err) {}
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await moveMochiToTab(activeInfo.tabId, activeInfo.windowId, 'tab-switch');
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const tabs = await chrome.tabs.query({ active: true, windowId });
  if (tabs[0]) await moveMochiToTab(tabs[0].id, windowId, 'window-focus');
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === currentActiveTabId) {
    currentActiveTabId = null;
    currentWindowId = null;
    setTimeout(moveMochiToFocusedTab, 500);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-mochi-widget') return;
  const tab = await getFocusedTab();
  if (tab?.id) safeSend(tab.id, { type: 'MENU_MOCHI_TOGGLE_WIDGET' });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'MENU_MOCHI_CARE_EVENT') {
      const { petState } = await chrome.storage.local.get('petState');
      const next = addDiary(petState || DEFAULT_STATE, message.text || 'Mochi received care and became slightly smug.');
      await chrome.storage.local.set({ petState: next });
      await updateAction(next);
      if (currentActiveTabId) safeSend(currentActiveTabId, { type: 'MENU_MOCHI_FLASH', line: message.line || 'Mochi forgives you instantly.' });
      sendResponse({ ok: true });
    }
    if (message?.type === 'MENU_MOCHI_READY') {
      if (sender.tab?.id === currentActiveTabId) {
        safeSend(sender.tab.id, { type: 'MENU_MOCHI_ACTIVE', reason: 'ready' });
      }
      sendResponse({ ok: true });
    }
  })();
  return true;
});

async function getFocusedTab() {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const focused = windows.find(w => w.focused) || windows[0];
  return focused?.tabs?.find(t => t.active);
}

async function moveMochiToFocusedTab() {
  const tab = await getFocusedTab();
  if (tab?.id) await moveMochiToTab(tab.id, tab.windowId, 'startup');
}

async function moveMochiToTab(tabId, windowId, reason) {
  if (!tabId || tabId === currentActiveTabId) return;
  const { mochiSettings } = await chrome.storage.local.get('mochiSettings');
  const settings = { ...SETTINGS_DEFAULTS, ...(mochiSettings || {}) };
  if (!settings.tabBuddy) return;

  const oldTabId = currentActiveTabId;
  currentActiveTabId = tabId;
  currentWindowId = windowId;
  recentSwitches = recentSwitches.filter(t => Date.now() - t < 10000);
  recentSwitches.push(Date.now());

  if (oldTabId) {
    safeSend(oldTabId, { type: 'MENU_MOCHI_INACTIVE', reason: 'jumping-tabs' });
  }

  const { petState } = await chrome.storage.local.get('petState');
  const today = new Date().toDateString();
  let next = petState || DEFAULT_STATE;
  if (next.tabSwitchStamp !== today) {
    next.tabSwitchStamp = today;
    next.tabSwitchesToday = 0;
  }
  next.tabSwitchesToday = (next.tabSwitchesToday || 0) + 1;
  next.lastSeen = Date.now();
  if (recentSwitches.length >= 5) {
    next = addDiary(next, 'Mochi witnessed rapid tab switching and chose to follow anyway.');
  }
  await chrome.storage.local.set({ petState: next });
  await updateAction(next);

  safeSend(tabId, {
    type: 'MENU_MOCHI_ACTIVE',
    reason,
    switchBurst: recentSwitches.length,
    switchesToday: next.tabSwitchesToday || 0
  });
}

function safeSend(tabId, payload) {
  try { chrome.tabs.sendMessage(tabId, payload, () => void chrome.runtime.lastError); } catch (err) {}
}

function clamp(n, min = 0, max = 100) { return Math.max(min, Math.min(max, Math.round(n))); }

function applyDecay(state) {
  const now = Date.now();
  const mins = Math.max(0, Math.floor((now - (state.lastTick || now)) / 60000));
  if (mins < 5) return { ...state, lastTick: now, mood: calculateMood(state) };
  const blocks = Math.min(96, mins / 30);
  let next = {
    ...state,
    hunger: clamp(state.hunger - blocks * 3),
    happiness: clamp(state.happiness - blocks * 2.4),
    cleanliness: clamp(state.cleanliness - blocks * 1.8),
    energy: clamp(state.energy - blocks * 1.2),
    boredom: clamp((state.boredom || 18) + blocks * 2.5),
    activeMinutes: (state.activeMinutes || 0) + mins,
    lastTick: now
  };
  next.mood = calculateMood(next);
  const low = Math.min(next.hunger, next.happiness, next.cleanliness, next.energy, 100 - (next.boredom || 0));
  if (low <= 20 && mins >= 60) next = addDiary(next, 'Mochi waited for care and did the tiny sad eyes.');
  return next;
}

function calculateMood(p) {
  const min = Math.min(p.hunger, p.happiness, p.cleanliness, p.energy, 100 - (p.boredom || 0));
  if (min <= 10) return 'danger';
  if (p.energy < 18) return 'sleeping';
  if (p.cleanliness < 20) return 'dirty';
  if (p.hunger < 22) return 'hungry';
  if ((p.boredom || 0) > 82) return 'bored';
  if (p.happiness < 22) return 'sad';
  if (min < 38) return 'worried';
  if (min > 75) return 'happy';
  return 'idle';
}

function addDiary(state, entry) {
  const day = Math.max(1, Math.floor((Date.now() - (state.createdAt || Date.now())) / 86400000) + 1);
  const diary = Array.isArray(state.diary) ? state.diary.slice(-79) : [];
  diary.push(`Day ${day}: ${entry}`);
  return { ...state, diary };
}

async function updateAction(state) {
  const mood = state.mood || calculateMood(state);
  const badgeMap = { danger: '!', hungry: '🍪', dirty: '!', sleeping: 'Zz', sad: '♡', bored: '...', worried: '!', happy: '♥', idle: '' };
  const colourMap = { danger: '#ff4f61', hungry: '#ff9f43', dirty: '#7d5a2f', sleeping: '#8d7cff', sad: '#6699ff', bored: '#ffe14d', worried: '#ff9f43', happy: '#6dff7a', idle: '#38f8ff' };
  try {
    await chrome.action.setBadgeText({ text: badgeMap[mood] || '' });
    await chrome.action.setBadgeBackgroundColor({ color: colourMap[mood] || '#38f8ff' });
    await chrome.action.setTitle({ title: `${state.name || 'Mochi'}: ${mood} | Bond ${state.bond || 0}%` });
  } catch (err) {}
}
