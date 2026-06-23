(() => {
  if (window.__menuMochiV12) return;
  window.__menuMochiV12 = true;
  if (!['http:', 'https:', 'file:'].includes(location.protocol)) return;

  const DEFAULT_STATE = {
    name:'Mochi', stage:'Arcade Blob', hunger:82, happiness:78, cleanliness:85,
    energy:72, boredom:18, bond:10, xp:0, coins:0, level:1, mood:'idle',
    createdAt:Date.now(), lastTick:Date.now(), lastSeen:Date.now(), diary:['Day 1: Mochi arrived in the tab bar.']
  };

  const originalTitle = document.title || location.hostname || 'MenuMochi';
  const originalIcons = [...document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')].map(node => ({ rel: node.rel, href: node.href, type: node.type, sizes: node.sizes?.value || '' }));
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
  const randomFrom = (list) => list[Math.floor(Math.random() * list.length)];

  let active = false;
  let interval = null;
  let titleIndex = 0;
  let currentLine = '';
  let lastMood = '';
  let flashLine = '';
  let flashUntil = 0;
  let frame = 0;
  let cachedIcon = '';
  let lastInteraction = Date.now();
  let idleStage = 0;
  let switchBurst = 0;
  let pageDockEnabled = true;

  const faces = {
    idle: ['(•ᴗ•)','(•‿•)','(•◡•)','(・ᴗ・)','(｡•ᴗ•｡)','(๑•ᴗ•๑)','(˶•ᴗ•˶)','(◕ᴗ◕)','(●ᴗ●)','(ᵔᴗᵔ)','(＾▽＾)','(=^ᴗ^=)'],
    happy: ['(★‿★)','(≧◡≦)','(ﾉ◕ヮ◕)ﾉ','(づ｡◕‿‿◕｡)づ','(๑˃ᴗ˂)ﻭ','(✿◠‿◠)','(｡♥‿♥｡)','(♡＾▽＾♡)','(๑>ᴗ<๑)','(ᗒᗨᗕ)','(⌒‿⌒)','(☆▽☆)'],
    hungry: ['(｡•́︿•̀｡)','(っ˘̩╭╮˘̩)っ','(๑•́ ₃ •̀๑)','(◕﹏◕)','(｡ŏ﹏ŏ)','(；ω；)','(っ◞‸◟c)','(╥﹏╥)','(•́⍛•̀)','(›´ω`‹ )'],
    sad: ['(｡•́︿•̀｡)','(╥﹏╥)','(っ˘̩╭╮˘̩)っ','(ಥ﹏ಥ)','(｡T ω T｡)','(；へ：)','(｡╯︵╰｡)','(ᵕ̣̣̣̣̣̣﹏ᵕ̣̣̣̣̣̣)','(╯︵╰,)','( ´•̥̥̥ω•̥̥̥` )'],
    sleeping: ['(-_-) zzz','(￣o￣) zzZ','(－ω－) zzZ','(ᴗ˳ᴗ)','(｡-_-｡)','(－.－)zzZ','(눈_눈)','(￣ρ￣)..zzZZ','(｡-ω-)zzz','( ˘ω˘ )zzz'],
    dirty: ['(×_×)','(；￣Д￣)','(｡ŏ﹏ŏ)','(>_<)','(；一_一)','(╥ω╥)','(×﹏×)','(￣□￣;)','(눈_눈)','(。ヘ°)'],
    bored: ['(￣ヘ￣)','(－‸ლ)','(눈_눈)','(¬_¬)','(￣ー￣)','(-_-)','(；一_一)','(ಠ_ಠ)','(￢_￢)','(￣ω￣;)'],
    worried: ['(⊙_⊙)','(°ロ°)','(ʘᗩʘ’)','(☉_☉)','(ﾟДﾟ;)','(⊙﹏⊙)','(๑°⌓°๑)','(꒪⌓꒪)','(っ °Д °;)っ','(⚆_⚆)'],
    danger: ['(╥_╥)','(⊙﹏⊙)','(ﾟДﾟ;)','(ᗒᗣᗕ)','(ノಠ益ಠ)ノ','(×﹏×)','(｡>﹏<｡)','(；´д｀)','(இ﹏இ`｡)','(꒪⌓꒪)'],
    darren: ['(¬_¬)','(ಠ_ಠ)','(눈_눈)','(╬ಠ益ಠ)','(；¬д¬)','(￣ヘ￣)','(￢_￢)','(ᓀ ᓀ)','(ಠ益ಠ)','(ง\'̀-\'́)ง'],
    glitch: ['(●__●)','(◉_◉)','(◇_◇)','(▣_▣)','(⧉_⧉)','(▓_▓)','(▒_▒)','(░_░)','(☉_☉)','(×_×)'],
    care: ['(づ｡◕‿‿◕｡)づ','(っ˘ڡ˘ς)','(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧','(ღ˘⌣˘ღ)','(✧ᴗ✧)','(✨ᴗ✨)','(｡•̀ᴗ-)✧','(♡＾▽＾♡)','(๑˃ᴗ˂)ﻭ✧','(◍•ᴗ•◍)❤'],
    arrival: ['(｡♥‿♥｡)','(๑>ᴗ<๑)','(づ｡◕‿‿◕｡)づ','(★‿★)','(ﾉ◕ヮ◕)ﾉ'],
    leaving: ['(｡•́︿•̀｡)','(╥﹏╥)','(ಥ﹏ಥ)','(ノ﹏ヽ)','(っ◞‸◟c)']
  };

  const messages = {
    idle: ['Mochi is watching this tab...','Tiny blob patrol active.','Mochi has claimed this tab as nest space.','Mochi is counting your open tabs.','Soft surveillance blob online.','Mochi is blinking in 16 pixels.','Tiny friend. Large opinions.','This tab has been emotionally occupied.','Mochi is quietly judging the scrollbar.'],
    happy: ['Mochi found crumbs in your browser cache...','Mochi is doing a tiny victory wiggle.','The blob is pleased. Dangerous development.','Mochi loves this tab more than it deserves.','Pixel joy detected.','Mochi has upgraded this tab with cuteness.','A wee happy creature is living up here.','Mochi is sparkling at medical nonsense levels.','Tab morale has improved.'],
    hungry: ['Mochi is hungry...','Feed the blob or face consequences...','Mochi is licking the favicon.','This tab contains zero snacks. Explain yourself.','Tiny stomach. Massive legal case.','Mochi is chewing the page title.','Snack deficit detected.','Mochi has filed a biscuit complaint.','The blob requires tribute.','One crumb could save this relationship.'],
    sad: ['You have ignored Mochi for too long...','Mochi is doing the tiny sad eyes.','Closing this tab would be emotionally reckless.','Mochi will live in the next tab, but still. Rude.','The blob remembers neglect. Gently.','Mochi is staring through the glass.','Tiny friend needs one click of kindness.','This tab feels cold without attention.','Mochi has become a small grey weather system.','Mochi is not angry. Just disappointed in pixels.'],
    sleeping: ['Mochi is asleep in the tab corner...','Do not wake the tiny bean.','Dreaming of snacks and clean cache.','Soft blob hibernation mode.','Mochi is snoring in low resolution.','Tab buddy is recharging the cute battery.','Sleepy Mochi has melted slightly.','The browser bean is folded up.','Mochi is dreaming inside the title bar.'],
    dirty: ['Mochi smells like hot browser dust.','Clean the blob. This is not optional.','This tab has developed a strange odour.','Mochi found something sticky in local storage.','The favicon is becoming biohazardous.','Mochi is wearing cache crumbs as armour.','Tiny bath required immediately.','The blob has entered swamp mode.','Pixel hygiene emergency.'],
    bored: ['Mochi is bored of this tab...','Zero enrichment detected.','Mochi requests entertainment.','The blob has started narrating dust.','Mochi is considering chewing the reload button.','This tab has failed the vibe check.','Tiny boredom alarm active.'],
    worried: ['Mochi is doing tiny panic maths.','Something is wrong with the blob economy.','Mochi checked the stats and made a noise.','The tab buddy is mildly alarmed.','Mochi is pacing across the favicon.','Tiny stress goblin detected.','The browser bean requires supervision.','Mochi suspects this tab knows too much.','Darren has been notified...'],
    danger: ['Feed the blob or face consequences...','Mochi has entered goblin court.','Darren has been notified...','The blob is preparing a tiny lawsuit.','Critical cuteness failure incoming.','Mochi is waving a red flag with both arms.','This tab is now an incident report.','Emergency bean protocols active.','Mochi is one snack away from drama.'],
    darren: ['Darren has been notified...','Darren is watching your posture.','Darren disapproves of this tab.','Darren has escalated the matter.','Darren saw the tab count.','Darren has opened a file named concern.txt.'],
    glitch: ['Mochi signal unstable...','CRT blob recalibrating...','Tiny pet has seen the source code.','Mochi is buffering emotionally...','The favicon is making modem noises.'],
    care: ['Mochi forgives you instantly.','Tiny heart restored.','Mochi received care and became smug.','The blob has accepted your offering.','Cuteness levels restored.','Mochi is doing the wee happy bounce.','Tab buddy has been emotionally repaired.','Mochi says thanks, then steals one pixel.'],
    arrival: ['Mochi found you!','There you are!','Mochi followed the tab trail.','Tiny stalker blob has arrived.','Mochi was looking for you... found you.'],
    leaving: ['Mochi is leaving this tab...','Tiny blob has to follow you now.','Mochi will remember this tab.','The bean has exited the area.'],
    night: ['Mochi is sleepy... you should rest too.','Mochi worries about your sleep schedule.','It is late. Tiny bean recommends bed.','Mochi has put on imaginary pyjamas.'],
    return: ['YOU CAME BACK!!','Mochi missed you. Sparkle mode engaged.','The blob is overreacting with joy.','Return detected. Tiny heart restarted.'],
    closing: ['Mochi saw your cursor near the X.','Mochi will live in the next tab, but still. Rude.','One last look at the tiny face...','Mochi will remember this...']
  };

  createDock();
  initSettings();
  chrome.runtime.sendMessage({ type: 'MENU_MOCHI_READY' });

  ['mousemove','keydown','click','scroll','touchstart'].forEach(evt => window.addEventListener(evt, () => {
    if (!active) return;
    const wasIdle = Date.now() - lastInteraction > 5 * 60000;
    lastInteraction = Date.now();
    if (wasIdle) flash(randomFrom(messages.return), 'arrival', 12000);
  }, { passive: true }));

  window.addEventListener('pagehide', async () => {
    const s = await getState();
    await setState(addDiary(s, 'Human closed or left a tab. Mochi pretended to be fine.'));
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'MENU_MOCHI_ACTIVE') activate(message);
    if (message?.type === 'MENU_MOCHI_INACTIVE') deactivate(true);
    if (message?.type === 'MENU_MOCHI_FLASH') flash(message.line || randomFrom(messages.care), 'care', 9000);
    if (message?.type === 'MENU_MOCHI_TOGGLE_WIDGET') toggleDock(true);
  });

  async function initSettings() {
    const data = await chrome.storage.local.get('mochiSettings');
    pageDockEnabled = data.mochiSettings?.pageDock !== false;
    const root = document.getElementById('menu-mochi-dock');
    if (root) root.style.display = pageDockEnabled ? 'block' : 'none';
  }

  function activate(meta = {}) {
    active = true;
    switchBurst = meta.switchBurst || 0;
    flash(switchBurst >= 5 ? 'Fast tabber, huh? Mochi still found you.' : randomFrom(messages.arrival), 'arrival', 10000);
    if (!interval) interval = setInterval(tick, 1150);
    tick();
  }

  function deactivate(showFarewell) {
    if (showFarewell) {
      currentLine = `${randomFrom(faces.leaving)} ${randomFrom(messages.leaving)}`;
      titleIndex = 0;
      setFavicon('sad');
      scrollTitle();
    }
    active = false;
    if (interval) clearInterval(interval);
    interval = null;
    setTimeout(restoreOriginals, showFarewell ? 350 : 0);
  }

  async function tick() {
    if (!active) return;
    const state = await getState();
    const idleMs = Date.now() - lastInteraction;
    const night = new Date().getHours() >= 22 || new Date().getHours() < 5;
    let mood = state.mood || moodOf(state);
    let forcedLine = '';

    if (night && mood === 'idle') {
      mood = 'sleeping';
      if (Math.random() < 0.2) forcedLine = randomFrom(messages.night);
    }
    if (idleMs > 60 * 60000) { mood = 'sad'; idleStage = 5; forcedLine = 'Mochi is updating its will...'; }
    else if (idleMs > 30 * 60000) { mood = 'sad'; idleStage = 4; forcedLine = 'You abandoned Mochi...'; }
    else if (idleMs > 15 * 60000) { mood = 'sad'; idleStage = 3; forcedLine = 'Mochi is watching the cursor... alone...'; }
    else if (idleMs > 10 * 60000) { mood = 'sad'; idleStage = 2; forcedLine = 'It has been 10 minutes...'; }
    else if (idleMs > 5 * 60000) { mood = 'sad'; idleStage = 1; forcedLine = 'Mochi misses you...'; }
    else idleStage = 0;

    const activeMood = chooseLine(mood, forcedLine);
    setFavicon(activeMood);
    scrollTitle();
    renderDock(state);
  }

  function moodOf(s) {
    const min = Math.min(s.hunger, s.happiness, s.cleanliness, s.energy, 100 - (s.boredom || 0));
    if (min <= 10) return 'danger';
    if (s.energy < 18) return 'sleeping';
    if (s.cleanliness < 20) return 'dirty';
    if (s.hunger < 22) return 'hungry';
    if ((s.boredom || 0) > 82) return 'bored';
    if (s.happiness < 22) return 'sad';
    if (min < 38) return 'worried';
    if (min > 75) return 'happy';
    return 'idle';
  }

  function decay(s) {
    const now = Date.now();
    const mins = Math.max(0, Math.floor((now - (s.lastTick || now)) / 60000));
    const blocks = Math.min(96, mins / 30);
    const next = { ...s };
    if (mins >= 5) {
      next.hunger = clamp(next.hunger - blocks * 3);
      next.happiness = clamp(next.happiness - blocks * 2.4);
      next.cleanliness = clamp(next.cleanliness - blocks * 1.8);
      next.energy = clamp(next.energy - blocks * 1.2);
      next.boredom = clamp((next.boredom || 18) + blocks * 2.5);
      next.lastTick = now;
    }
    next.mood = moodOf(next);
    next.level = Math.max(1, Math.floor((next.xp || 0) / 100) + 1);
    next.stage = next.level >= 6 ? 'CRT Gremlin' : next.level >= 4 ? 'Pixel Rascal' : next.level >= 2 ? 'Menu Critter' : 'Arcade Blob';
    return next;
  }

  async function getState() {
    try {
      const data = await chrome.storage.local.get('petState');
      return decay(data.petState || DEFAULT_STATE);
    } catch (err) { return { ...DEFAULT_STATE, mood: 'idle' }; }
  }

  async function setState(s) {
    const next = decay(s);
    await chrome.storage.local.set({ petState: next });
    renderDock(next);
  }

  function addDiary(state, entry) {
    const day = Math.max(1, Math.floor((Date.now() - (state.createdAt || Date.now())) / 86400000) + 1);
    const diary = Array.isArray(state.diary) ? state.diary.slice(-79) : [];
    diary.push(`Day ${day}: ${entry}`);
    return { ...state, diary };
  }

  function chooseLine(mood, forcedLine = '') {
    const now = Date.now();
    let activeMood = flashUntil > now ? 'care' : mood;
    if (forcedLine) activeMood = mood;
    if (Math.random() < 0.04 && mood !== 'danger' && mood !== 'sad') activeMood = 'darren';
    if (Math.random() < 0.03 && mood !== 'danger') activeMood = 'glitch';

    if (activeMood !== lastMood || forcedLine || !currentLine || titleIndex >= currentLine.length + 12) {
      const line = forcedLine || flashLine || randomFrom(messages[activeMood] || messages.idle);
      currentLine = `${randomFrom(faces[activeMood] || faces.idle)} ${line}`;
      titleIndex = 0;
      lastMood = activeMood;
      if (flashUntil <= now) flashLine = '';
    }
    return activeMood;
  }

  function scrollTitle() {
    const padded = `   ${currentLine}   ${originalTitle}   `;
    const visible = padded.slice(titleIndex) + padded.slice(0, titleIndex);
    document.title = visible.slice(0, 76);
    titleIndex = (titleIndex + 1) % padded.length;
  }

  function flash(line, mood = 'care', ms = 9000) {
    flashLine = line || randomFrom(messages.care);
    flashUntil = Date.now() + ms;
    titleIndex = 0;
    currentLine = '';
    lastMood = mood;
  }

  function ensureFavicon() {
    let link = document.querySelector('link#menu-mochi-tab-icon');
    if (!link) {
      link = document.createElement('link');
      link.id = 'menu-mochi-tab-icon';
      link.rel = 'icon';
      link.type = 'image/png';
      document.head.appendChild(link);
    }
    return link;
  }

  function drawIcon(mood, frameNo) {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const palette = {
      idle:['#9bbc0f','#0f380f'], happy:['#ffe14d','#3a2400'], hungry:['#ffb6d9','#4a0030'], sad:['#9fd8ff','#06283d'],
      sleeping:['#c8b6ff','#21153d'], dirty:['#b8f06a','#214000'], bored:['#d1d1d1','#222222'], worried:['#ff9f43','#3d1e00'], danger:['#ff4f61','#ffffff'], care:['#ff3df2','#ffffff'], arrival:['#6dff7a','#073d14'], darren:['#222222','#ffe14d'], glitch:['#38f8ff','#05050a']
    };
    const [body, ink] = palette[mood] || palette.idle;
    const bob = frameNo % 2 === 0 ? 0 : 2;
    ctx.clearRect(0,0,64,64);
    if (mood === 'glitch') {
      ctx.fillStyle = frameNo % 2 ? '#ff3df2' : '#38f8ff'; ctx.fillRect(7, 10, 50, 43);
      ctx.fillStyle = '#05050a'; ctx.fillRect(12, 14, 42, 35);
      ctx.fillStyle = '#9bbc0f'; ctx.fillRect(16, 18, 34, 27);
    } else {
      ctx.fillStyle = '#05050a'; ctx.fillRect(10, 12 + bob, 44, 40);
      ctx.fillStyle = body; ctx.fillRect(14, 10 + bob, 36, 38);
      ctx.fillStyle = '#ffffff33'; ctx.fillRect(18, 14 + bob, 10, 6);
    }
    ctx.fillStyle = ink;
    const blink = frameNo % 6 === 4;
    const eyeY = 25 + bob; const mouthY = 37 + bob;
    if (mood === 'sleeping') { ctx.fillRect(22, eyeY, 7, 2); ctx.fillRect(36, eyeY, 7, 2); ctx.fillRect(30, mouthY, 6, 2); ctx.font='bold 14px monospace'; ctx.fillText('z',45,20+bob); }
    else if (mood === 'danger') { ctx.fillRect(21, eyeY, 8, 8); ctx.fillRect(37, eyeY, 8, 8); ctx.fillRect(27, mouthY, 12, 5); }
    else if (mood === 'sad' || mood === 'hungry') { ctx.fillRect(22, eyeY, 6, 6); ctx.fillRect(38, eyeY, 6, 6); ctx.fillRect(29, mouthY + 4, 9, 2); }
    else if (mood === 'dirty' || mood === 'bored' || mood === 'darren') { ctx.fillRect(21, eyeY, 9, 2); ctx.fillRect(37, eyeY, 9, 2); ctx.fillRect(29, mouthY, 9, 4); }
    else if (mood === 'worried') { ctx.fillRect(22, eyeY, 6, 8); ctx.fillRect(38, eyeY, 6, 8); ctx.fillRect(31, mouthY + 2, 4, 4); }
    else { if (blink) { ctx.fillRect(22, eyeY + 3, 7, 2); ctx.fillRect(37, eyeY + 3, 7, 2); } else { ctx.fillRect(23, eyeY, 6, 8); ctx.fillRect(37, eyeY, 6, 8); } ctx.fillRect(28, mouthY, 10, 2); ctx.fillRect(30, mouthY + 2, 6, 2); }
    return canvas.toDataURL('image/png');
  }

  function setFavicon(mood) {
    const data = drawIcon(mood, frame++);
    if (data === cachedIcon) return;
    cachedIcon = data;
    ensureFavicon().href = data;
  }

  function restoreOriginals() {
    document.title = originalTitle;
    const injected = document.querySelector('link#menu-mochi-tab-icon');
    if (injected) injected.remove();
    if (!document.querySelector('link[rel~="icon"], link[rel="shortcut icon"]')) {
      originalIcons.forEach(icon => {
        const link = document.createElement('link');
        link.rel = icon.rel; link.href = icon.href; link.type = icon.type; if (icon.sizes) link.sizes = icon.sizes;
        document.head.appendChild(link);
      });
    }
  }

  function createDock() {
    const root = document.createElement('div');
    root.id = 'menu-mochi-dock';
    root.innerHTML = `
      <style>
        #menu-mochi-dock{all:initial;position:fixed;top:12px;right:12px;z-index:2147483647;font-family:'Courier New',monospace;color:#fff6d6}
        #menu-mochi-dock *{box-sizing:border-box;font-family:inherit;image-rendering:pixelated}
        .mm-pill{width:96px;height:42px;border:3px solid #05050a;border-radius:14px;background:linear-gradient(135deg,#ff3df2,#38f8ff);box-shadow:4px 4px 0 #05050a;display:flex;align-items:center;justify-content:center;cursor:pointer;animation:mmFloat 1.6s steps(2) infinite;user-select:none}
        .mm-face{width:58px;height:28px;border:3px solid #05050a;border-radius:8px;background:#9bbc0f;color:#0f380f;display:grid;place-items:center;font-size:12px;font-weight:900;box-shadow:inset 0 0 0 2px #306230;overflow:hidden}
        .mm-panel{display:none;margin-top:10px;width:300px;border:4px solid #05050a;border-radius:18px;background:#101018;color:#fff6d6;box-shadow:6px 6px 0 #05050a,inset 0 0 0 3px #ff3df2;padding:12px;cursor:default}
        .mm-panel.open{display:block}.mm-drag{cursor:move}.mm-title{display:flex;justify-content:space-between;align-items:center;font-size:16px;font-weight:900;margin:0 0 8px;text-shadow:2px 0 #38f8ff,-2px 0 #ff3df2}.mm-close{border:2px solid #05050a;background:#ff4f61;color:white;font-weight:900;box-shadow:2px 2px 0 #000;cursor:pointer}
        .mm-screen{height:80px;border:3px solid #05050a;background:#9bbc0f;color:#0f380f;border-radius:12px;display:grid;place-items:center;position:relative;overflow:hidden;box-shadow:inset 0 0 0 4px #306230}.mm-screen:after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.17),rgba(0,0,0,.17) 1px,transparent 1px,transparent 4px);pointer-events:none}.mm-bigface{font-size:22px;font-weight:900;animation:mmBob 1s steps(2) infinite}.mm-note{font-size:10px;line-height:1.25;margin-top:8px;opacity:.95;min-height:28px}.mm-stat{display:grid;grid-template-columns:72px 1fr 34px;align-items:center;gap:6px;margin-top:8px;font-size:11px;font-weight:900}.mm-bar{height:12px;border:2px solid #05050a;background:#24243a;box-shadow:2px 2px 0 #000}.mm-fill{height:100%;background:linear-gradient(90deg,#6dff7a,#38f8ff)}.mm-buttons{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:7px;margin-top:10px}.mm-buttons button,.mm-tools button{border:3px solid #05050a;border-radius:10px;padding:7px 4px;font-size:11px;font-weight:900;cursor:pointer;box-shadow:3px 3px 0 #000;color:#05050a;background:#ffe14d}.mm-buttons button:nth-child(2){background:#38f8ff}.mm-buttons button:nth-child(3){background:#ff3df2;color:white}.mm-buttons button:nth-child(4){background:#6dff7a}.mm-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.mm-diary{display:none;margin-top:8px;border:3px solid #05050a;background:#060611;box-shadow:3px 3px 0 #000;padding:8px;max-height:128px;overflow:auto;font-size:10px;line-height:1.35}.mm-diary.open{display:block}.mm-critical{display:none;margin-top:8px;border:3px solid #05050a;background:#2b1320;padding:8px;font-size:11px;font-weight:900}.mm-critical.open{display:block}@keyframes mmFloat{50%{transform:translateY(-4px)}}@keyframes mmBob{50%{transform:translateY(-4px) scale(1.04)}}
      </style>
      <div class="mm-pill" title="MenuMochi"><div class="mm-face">•ᴗ•</div></div>
      <div class="mm-panel">
        <div class="mm-drag mm-title"><span>MenuMochi</span><button class="mm-close">×</button></div>
        <div class="mm-screen"><div class="mm-bigface">(•ᴗ•)</div></div>
        <div class="mm-note">Tiny browser goblin active. Pixels keep receipts.</div>
        <div class="mm-critical"><div>(╥﹏╥) Mochi thought you forgot...</div><button data-mm="apologize">❤️ APOLOGISE</button></div>
        <div class="mm-stat"><span>FOOD</span><div class="mm-bar"><div class="mm-fill" data-k="hunger"></div></div><b data-v="hunger">0%</b></div>
        <div class="mm-stat"><span>CLEAN</span><div class="mm-bar"><div class="mm-fill" data-k="cleanliness"></div></div><b data-v="cleanliness">0%</b></div>
        <div class="mm-stat"><span>BORED</span><div class="mm-bar"><div class="mm-fill" data-k="boredom"></div></div><b data-v="boredom">0%</b></div>
        <div class="mm-stat"><span>SLEEP</span><div class="mm-bar"><div class="mm-fill" data-k="energy"></div></div><b data-v="energy">0%</b></div>
        <div class="mm-stat"><span>BOND</span><div class="mm-bar"><div class="mm-fill" data-k="bond"></div></div><b data-v="bond">0%</b></div>
        <div class="mm-buttons"><button data-mm="feed">🍪</button><button data-mm="clean">🧼</button><button data-mm="play">🎾</button><button data-mm="sleep">💤</button></div>
        <div class="mm-tools"><button data-mm="diary">📔 Diary</button><button data-mm="hide">Hide</button></div>
        <div class="mm-diary"></div>
      </div>`;
    document.documentElement.appendChild(root);

    const pill = root.querySelector('.mm-pill');
    const panel = root.querySelector('.mm-panel');
    const close = root.querySelector('.mm-close');
    pill.addEventListener('click', () => toggleDock(true));
    close.addEventListener('click', () => toggleDock(false));
    root.querySelector('[data-mm="hide"]').addEventListener('click', () => toggleDock(false));
    root.querySelector('[data-mm="diary"]').addEventListener('click', async () => {
      const d = root.querySelector('.mm-diary');
      d.classList.toggle('open');
      const s = await getState();
      d.innerHTML = (s.diary || []).slice(-14).reverse().map(x => `<div>${escapeHtml(x)}</div>`).join('') || '<div>No diary yet. Suspiciously peaceful.</div>';
    });
    root.querySelectorAll('[data-mm="feed"],[data-mm="clean"],[data-mm="play"],[data-mm="sleep"],[data-mm="apologize"]').forEach(btn => btn.addEventListener('click', () => care(btn.dataset.mm)));
    makeDraggable(root, root.querySelector('.mm-drag'));
  }

  function toggleDock(force) {
    const panel = document.querySelector('#menu-mochi-dock .mm-panel');
    if (!panel) return;
    if (typeof force === 'boolean') panel.classList.toggle('open', force);
    else panel.classList.toggle('open');
  }

  async function care(kind) {
    let s = await getState();
    let line = 'Mochi accepts this offering.';
    if (kind === 'feed') { s.hunger = clamp(s.hunger + 34); s.energy = clamp(s.energy - 3); s.xp = (s.xp || 0) + 8; line = '(★‿★) Crumb acquired!'; s = addDiary(s, 'Human fed me. I felt loved and slightly crumbly.'); }
    if (kind === 'clean') { s.cleanliness = clamp(s.cleanliness + 45); s.xp = (s.xp || 0) + 7; line = '(✧ᴗ✧) Sparkle mode engaged.'; s = addDiary(s, 'Human cleaned me. I became legally shiny.'); }
    if (kind === 'play') { s.happiness = clamp(s.happiness + 20); s.boredom = clamp((s.boredom || 18) - 50); s.energy = clamp(s.energy - 8); s.bond = clamp((s.bond || 0) + 4); s.xp = (s.xp || 0) + 14; line = '(｡•̀ᴗ-)✧ WHEEEE.'; s = addDiary(s, 'Human played with me. Best tab moment so far.'); }
    if (kind === 'sleep') { s.energy = clamp(s.energy + 38); s.happiness = clamp(s.happiness + 5); s.xp = (s.xp || 0) + 5; line = '( ˘ω˘ ) zzz best human ever.'; s = addDiary(s, 'Human let me rest. The favicon became peaceful.'); }
    if (kind === 'apologize') { s.hunger = Math.max(s.hunger, 50); s.happiness = Math.max(s.happiness, 50); s.cleanliness = Math.max(s.cleanliness, 50); s.energy = Math.max(s.energy, 50); s.boredom = Math.min(s.boredom || 0, 50); s.bond = clamp((s.bond || 0) + 8); line = '(╥﹏╥) Mochi forgives you. Obviously.'; s = addDiary(s, 'Human apologised. I forgave them, but wrote it down.'); }
    await setState(s);
    flash(line, 'care', 12000);
    try { chrome.runtime.sendMessage({ type: 'MENU_MOCHI_CARE_EVENT', text: line, line }); } catch (err) {}
  }

  function renderDock(s) {
    const root = document.getElementById('menu-mochi-dock');
    if (!root) return;
    const mood = s.mood || moodOf(s);
    const face = randomFrom(faces[mood] || faces.idle);
    root.querySelector('.mm-face').textContent = face.replace(/[()]/g, '').slice(0, 7);
    root.querySelector('.mm-bigface').textContent = face;
    const bondLevel = getBondLevel(s);
    const note = root.querySelector('.mm-note');
    if (note) note.textContent = `${bondLevel}: ${currentLine || randomFrom(messages[mood] || messages.idle)}`;
    root.querySelectorAll('.mm-fill').forEach(el => {
      const k = el.dataset.k; const v = k === 'boredom' ? 100 - (s[k] || 0) : (s[k] || 0);
      el.style.width = clamp(v) + '%';
      el.style.background = v < 25 ? '#ff4f61' : v < 55 ? '#ffe14d' : 'linear-gradient(90deg,#6dff7a,#38f8ff)';
    });
    root.querySelectorAll('[data-v]').forEach(el => {
      const k = el.dataset.v; const v = k === 'boredom' ? 100 - (s[k] || 0) : (s[k] || 0);
      el.textContent = clamp(v) + '%';
    });
    const critical = root.querySelector('.mm-critical');
    const min = Math.min(s.hunger, s.happiness, s.cleanliness, s.energy, 100 - (s.boredom || 0));
    if (critical) critical.classList.toggle('open', min < 20);
  }

  function getBondLevel(s) {
    const days = Math.floor((Date.now() - (s.createdAt || Date.now())) / 86400000);
    if (days >= 7 || (s.bond || 0) >= 90) return 'Family';
    if (days >= 1 || (s.bond || 0) >= 65) return 'Best Friend';
    if ((s.bond || 0) >= 40) return 'Friend';
    if ((s.bond || 0) >= 15) return 'Acquaintance';
    return 'Stranger';
  }

  function makeDraggable(root, handle) {
    let down = false, ox = 0, oy = 0;
    handle.addEventListener('mousedown', (e) => { down = true; ox = e.clientX - root.offsetLeft; oy = e.clientY - root.offsetTop; e.preventDefault(); });
    window.addEventListener('mousemove', (e) => { if (!down) return; root.style.left = Math.max(0, e.clientX - ox) + 'px'; root.style.top = Math.max(0, e.clientY - oy) + 'px'; root.style.right = 'auto'; });
    window.addEventListener('mouseup', () => { down = false; });
  }

  function escapeHtml(str) { return String(str).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
})();
