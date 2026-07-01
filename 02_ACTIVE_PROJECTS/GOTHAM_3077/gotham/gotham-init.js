/**
 * GOTHAM 3077 - Globe Bootstrap v3.6
 * v3.6 - TTS QUEUE + USERNAME
 * - Async TTS queue: speak() awaits completion before next utterance
 * - Username capture between "INITIALIZE" and boot continuation
 * - Personalized welcome using real user name
 */
(function () {
  'use strict'

  async function boot () {
    if (window._gothamBooted) return;
    window._gothamBooted = true;
    
    const term = document.getElementById('boot-terminal')
    const bar = document.getElementById('boot-progress-bar')
    const status = document.getElementById('boot-status-text')
    const overlay = document.getElementById('gotham-boot-overlay')

    function log(msg, color) {
      if (!term) return;
      const div = document.createElement('div');
      div.textContent = '> ' + msg;
      if (color) div.style.color = color;
      term.appendChild(div);
      term.scrollTop = term.scrollHeight;
    }

    function setProgress(pct, text) {
      if (bar) bar.style.width = pct + '%';
      if (status) status.textContent = text + ': ' + pct + '%';
    }

    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    let appRevealed = false;
    function revealApp(reason) {
      if (appRevealed) return;
      appRevealed = true;
      try {
        log('DISPLAY ONLINE: ' + reason, '#0f8');
        setProgress(100, 'READY');
        if (overlay) {
          overlay.style.opacity = '0';
          overlay.style.pointerEvents = 'none';
          setTimeout(() => { overlay.style.display = 'none'; }, 250);
        }
        if (typeof viewer !== 'undefined' && viewer && viewer.scene) {
          viewer.resize?.();
          viewer.scene.requestRender?.();
        }
      } catch (e) {
        console.warn('[GOTHAM] revealApp fallback failed:', e);
      }
    }

    function createFallbackEarthTexture() {
      const c = document.createElement('canvas');
      c.width = 2048;
      c.height = 1024;
      const ctx = c.getContext('2d');
      const sea = ctx.createLinearGradient(0, 0, 0, c.height);
      sea.addColorStop(0, '#071a2c');
      sea.addColorStop(0.5, '#123a58');
      sea.addColorStop(1, '#061522');
      ctx.fillStyle = sea;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = 'rgba(34, 110, 78, 0.92)';
      const poly = (pts) => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.closePath();
        ctx.fill();
      };
      poly([[260,330],[390,230],[520,260],[575,420],[500,595],[380,700],[285,620],[220,470]]);
      poly([[610,520],[705,555],[760,705],[720,860],[650,800],[615,665]]);
      poly([[900,285],[1060,245],[1240,310],[1305,450],[1200,555],[990,520],[860,415]]);
      poly([[1025,545],[1210,560],[1340,690],[1280,835],[1110,790],[1010,660]]);
      poly([[1295,275],[1500,250],[1710,340],[1800,480],[1620,575],[1410,520],[1280,420]]);
      poly([[1550,635],[1700,675],[1805,790],[1735,870],[1580,820]]);
      ctx.fillStyle = 'rgba(240, 250, 255, 0.7)';
      ctx.fillRect(0, 0, c.width, 34);
      ctx.fillRect(0, c.height - 42, c.width, 42);
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.14)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= c.width; x += 128) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke();
      }
      for (let y = 0; y <= c.height; y += 128) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke();
      }
      return c.toDataURL('image/png');
    }

    // STAGE 0: DEPENDENCY CHECK
    log('VERIFYING SYSTEM DEPENDENCIES...');
    if (typeof Cesium === 'undefined') {
      log('WARNING: CESIUM KERNEL NOT FOUND, DOWNLOADING...', '#ffaa00');
      try {
        await new Promise((resolve, reject) => {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = '/js/widgets.css';
          document.head.appendChild(link);

          const script = document.createElement('script');
          script.src = '/js/Cesium.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      } catch (err) {
        log('CRITICAL ERROR: CESIUM KERNEL DOWNLOAD FAILED', '#f44');
        setProgress(0, 'FAILED');
        return;
      }
    }
    log('CESIUM KERNEL DETECTED', '#0f8');

    // Register the tile-cache service worker. On the very first boot this is a
    // no-op (nothing cached yet); on every reload after, ESRI/CARTO tiles come
    // straight from the local cache = no network flicker, no grey squares.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/gotham-sw.js', { scope: '/' })
        .then(() => log('TILE CACHE ONLINE', '#0f8'))
        .catch(err => console.warn('[GOTHAM] Service worker registration failed:', err));
    }

    // ── ASYNC TTS QUEUE ─────────────────────────────────────────────
    // Sequentializes all utterances — each speak() waits for the previous
    // to finish so TTS lines never overlap. Returns a Promise.
    let _ttsQueue = Promise.resolve();
    let ttsVoice = null;
    let ttsEnabled = false;
    let hasGoogleTilesKey = false;
    let _currentUtterance = null;

    // Rank voices — highest score wins. Curated for young/female/English/sweet timbre.
    // Names sourced from Windows (Zira/Aria/Jenny), macOS (Samantha/Ava/Karen),
    // Chrome (Google UK English Female), Edge (Aria/Jenny), Android (en-us-x-sfg).
    const scoreVoice = (v) => {
      const n = (v.name || '').toLowerCase();
      const lang = (v.lang || '').toLowerCase();
      let s = 0;
      // language weight — GB > AU > US > IE > other en
      if (lang.startsWith('en-gb')) s += 40;
      else if (lang.startsWith('en-au')) s += 30;
      else if (lang.startsWith('en-us')) s += 25;
      else if (lang.startsWith('en-ie')) s += 20;
      else if (lang.startsWith('en')) s += 10;
      else s -= 50;
      // top-tier young female names, sweet timbre
      if (/\b(ava|aria|jenny|zira|samantha|karen|susan|serena|libby|sonia|olivia|natasha)\b/.test(n)) s += 60;
      // known female names, still solid
      else if (/\b(hazel|amy|catherine|kate|fiona|allison|moira|tessa|victoria)\b/.test(n)) s += 40;
      // "google uk english female" style
      else if (/female/.test(n)) s += 25;
      // Windows "Microsoft X Online" cloud voices sound cleaner
      if (/microsoft.*(natural|online|neural)/.test(n)) s += 15;
      // Google WaveNet also cleaner
      if (/google/.test(n) && /uk|british/.test(n)) s += 12;
      // downrank male
      if (/\b(david|mark|george|james|paul|thomas|richard|guy|tom|alex|daniel|ryan|arthur)\b/.test(n)) s -= 80;
      if (/male\b/.test(n) && !/female/.test(n)) s -= 40;
      // downrank compact / robotic
      if (/compact/.test(n)) s -= 20;
      return s;
    };

    function initTTS() {
      if (!window.speechSynthesis) return;
      const voices = window.speechSynthesis.getVoices();
      if (!voices || !voices.length) return;
      const ranked = voices.map(v => ({ v, s: scoreVoice(v) })).sort((a, b) => b.s - a.s);
      ttsVoice = ranked[0].v;
      console.log('[GOTHAM TTS] Voice selected:', ttsVoice.name, '(' + ttsVoice.lang + ') score=' + ranked[0].s);
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = initTTS;
      initTTS();
    }

    /**
     * speak() — enqueues a TTS utterance and WAITS for it to finish.
     * Consecutive calls are fully serialized; no overlap.
     * Returns the utterance so callers can cancel on unmount.
     */
    async function speak(msg) {
      if (!window.speechSynthesis || !msg) return;
      if (!ttsEnabled) return;

      const text = String(msg).replace(/\s+/g, ' ').trim().slice(0, 400);
      if (!text) return;

      _ttsQueue = _ttsQueue.then(() => new Promise((resolve) => {
        // 1) Preferred path: Microsoft Edge Neural voices via /api/tts (server-proxied).
        //    Sonia (en-GB) is warm and young; falls back to system voices on failure.
        const preferredVoice = window._gothamTTSVoice || 'en-GB-SoniaNeural';
        const url = `/api/tts?voice=${encodeURIComponent(preferredVoice)}&text=${encodeURIComponent(text)}`;

        // Skip network path if the last 3 requests failed (quick backoff)
        if (window._gothamTTSFailures >= 3) { fallbackSystem(); return; }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        fetch(url, { signal: controller.signal })
          .then(r => { clearTimeout(timeout); if (!r.ok) throw new Error('http ' + r.status); return r.blob(); })
          .then(blob => {
            window._gothamTTSFailures = 0;
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            audio.volume = 0.85;
            _currentUtterance = audio;
            const finish = () => { _currentUtterance = null; URL.revokeObjectURL(audioUrl); resolve(); };
            audio.onended = finish;
            audio.onerror = finish;
            audio.play().catch(finish);
          })
          .catch(() => {
            window._gothamTTSFailures = (window._gothamTTSFailures || 0) + 1;
            fallbackSystem();
          });

        function fallbackSystem() {
          // 2) Fallback: browser speechSynthesis (system voice)
          const initTimeout = setTimeout(() => resolve(), 2000);
          const trySpeak = () => {
            if (!ttsVoice) { clearTimeout(initTimeout); resolve(); return; }
            clearTimeout(initTimeout);
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.voice = ttsVoice;
            utterance.pitch = 1.15; utterance.rate = 0.98; utterance.volume = 0.85;
            _currentUtterance = utterance;
            utterance.onend = () => { _currentUtterance = null; resolve(); };
            utterance.onerror = () => { _currentUtterance = null; resolve(); };
            window.speechSynthesis.speak(utterance);
          };
          if (window.speechSynthesis.getVoices().length) trySpeak();
          else { window.speechSynthesis.onvoiceschanged = () => { initTTS(); trySpeak(); }; setTimeout(trySpeak, 500); }
        }
      }));

      try { await _ttsQueue; } catch (e) { /* queue keeps moving on error */ }
    }

    // Alias for legacy code
    const speakForce = (msg) => { ttsEnabled = true; speak(msg); };

    // Curated natural-voice presets (via /api/tts → edge-tts). Ordered by
    // "sweet young English female" fit. Switch at runtime with gothamVoice.setNaturalVoice(id).
    const NATURAL_VOICES = [
      { id: 'en-GB-SoniaNeural',    label: 'Sonia — warm young British (default)' },
      { id: 'en-GB-LibbyNeural',    label: 'Libby — bright young British' },
      { id: 'en-US-AriaNeural',     label: 'Aria — warm US' },
      { id: 'en-US-JennyNeural',    label: 'Jenny — friendly US' },
      { id: 'en-US-AvaNeural',      label: 'Ava — soft young US' },
      { id: 'en-AU-NatashaNeural',  label: 'Natasha — young Australian' },
      { id: 'en-IE-EmilyNeural',    label: 'Emily — warm Irish' },
      { id: 'en-GB-MaisieNeural',   label: 'Maisie — child-tone British' }
    ];
    // Default the runtime voice to Sonia.
    if (typeof window._gothamTTSVoice === 'undefined') window._gothamTTSVoice = 'en-GB-SoniaNeural';

    // Canonical globals
    window.gothamVoice = {
      speak,
      speakForce,
      stop: () => { try { window.speechSynthesis?.cancel(); _ttsQueue = Promise.resolve(); if (_currentUtterance?.pause) _currentUtterance.pause(); } catch (e) {} },
      setEnabled: (enabled) => { ttsEnabled = enabled === true; return ttsEnabled; },
      getEnabled: () => ttsEnabled,
      getVoice: () => ({ natural: window._gothamTTSVoice, system: ttsVoice ? { name: ttsVoice.name, lang: ttsVoice.lang } : null }),
      listNaturalVoices: () => NATURAL_VOICES,
      setNaturalVoice: (id) => {
        if (NATURAL_VOICES.some(v => v.id === id) || (id && id.startsWith('en-') && id.endsWith('Neural'))) {
          window._gothamTTSVoice = id;
          window._gothamTTSFailures = 0; // clear backoff — new voice deserves a fresh chance
          return id;
        }
        return null;
      }
    };
    window.gothamTTS = { speak: (m) => { ttsEnabled = true; speak(m); } };
    window.gothamReply = (msg) => { ttsEnabled = true; speak(msg); };

    // ── STAGE 1B: CAPTURE USERNAME ─────────────────────────────────
    log('AWAITING COMMANDER AUTHORIZATION...', '#ffaa00');

    // Username from localStorage (persist across sessions)
    const savedName = localStorage.getItem('gotham_commander_name') || '';

    const termEl = document.getElementById('boot-terminal');
    const bootContent = document.getElementById('boot-content');

    // Create the full authorization panel
    function buildAuthPanel() {
      // Remove old panel if any
      const old = document.getElementById('boot-auth-panel');
      if (old) old.remove();

      const panel = document.createElement('div');
      panel.id = 'boot-auth-panel';
      panel.style.cssText = `
        display: flex; flex-direction: column; gap: 12px;
        margin-top: 16px; padding: 20px;
        border: 1px solid rgba(0,240,255,0.2);
        background: rgba(0,240,255,0.03);
        border-radius: 4px;
      `;

      const title = document.createElement('div');
      title.style.cssText = `font-size: 10px; color: #4488aa; letter-spacing: 3px; text-align: center;`;
      title.textContent = '// COMMANDER IDENTIFICATION REQUIRED';
      panel.appendChild(title);

      const inputWrap = document.createElement('div');
      inputWrap.style.cssText = `display: flex; gap: 8px;`;

      const input = document.createElement('input');
      input.id = 'boot-username-input';
      input.type = 'text';
      input.placeholder = 'Enter your callsign...';
      input.autocomplete = 'off';
      input.autocorrect = 'off';
      input.autocapitalize = 'words';
      input.spellcheck = false;
      input.maxLength = 32;
      input.value = savedName;
      input.style.cssText = `
        flex: 1; background: rgba(0,0,0,0.6); border: 1px solid rgba(0,240,255,0.3);
        color: #00f0ff; font-family: 'Share Tech Mono', monospace;
        font-size: 14px; letter-spacing: 3px; padding: 10px 14px;
        outline: none; border-radius: 3px;
      `;
      input.addEventListener('focus', () => { input.style.borderColor = '#00f0ff'; input.style.boxShadow = '0 0 10px rgba(0,240,255,0.3)'; });
      input.addEventListener('blur', () => { input.style.borderColor = 'rgba(0,240,255,0.3)'; input.style.boxShadow = 'none'; });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') authBtn.click(); });
      inputWrap.appendChild(input);

      const authBtn = document.createElement('button');
      authBtn.id = 'boot-init-trigger';
      authBtn.style.cssText = `
        background: rgba(0,240,255,0.12); border: 1px solid #00f0ff;
        color: #00f0ff; font-family: 'Share Tech Mono', monospace;
        font-size: 11px; letter-spacing: 3px; padding: 10px 18px;
        cursor: pointer; border-radius: 3px; white-space: nowrap;
        transition: all 0.2s;
      `;
      authBtn.textContent = 'AUTHENTICATE';
      authBtn.addEventListener('mouseenter', () => { authBtn.style.background = 'rgba(0,240,255,0.25)'; authBtn.style.boxShadow = '0 0 15px rgba(0,240,255,0.4)'; });
      authBtn.addEventListener('mouseleave', () => { authBtn.style.background = 'rgba(0,240,255,0.12)'; authBtn.style.boxShadow = 'none'; });
      inputWrap.appendChild(authBtn);

      panel.appendChild(inputWrap);

      // Pre-fill hint
      if (savedName) {
        const hint = document.createElement('div');
        hint.style.cssText = `font-size: 9px; color: #334455; text-align: center; letter-spacing: 2px;`;
        hint.textContent = `Welcome back, ${savedName}.`;
        panel.appendChild(hint);
      }

      return { panel, authBtn, input };
    }

    const { panel: authPanel, authBtn, input: nameInput } = buildAuthPanel();
    if (termEl && termEl.parentNode) {
      termEl.parentNode.insertBefore(authPanel, termEl.nextSibling);
    }

    // Expose commander name globally so any system can use it
    let commanderName = savedName;
    window.gothamCommanderName = commanderName;

    // Wait for authenticate click
    await new Promise(resolve => {
      authBtn.addEventListener('click', () => {
        const name = (nameInput.value || '').trim();
        if (!name) {
          nameInput.style.borderColor = '#ff4444';
          nameInput.style.boxShadow = '0 0 10px rgba(255,68,68,0.4)';
          nameInput.placeholder = 'Callsign required...';
          return;
        }
        commanderName = name;
        localStorage.setItem('gotham_commander_name', commanderName);
        ttsEnabled = true;
        authPanel.style.opacity = '0';
        authPanel.style.transition = 'opacity 0.3s';
        setTimeout(() => { authPanel.remove(); resolve(); }, 300);
      });
    });

    // TTS: personalised greeting at the start of the boot sequence
    speak('Welcome back, ' + commanderName + '.');
    await wait(2000);

    // STAGE 3: ION & GOOGLE KEYS
    log('VERIFYING SYSTEM ENCRYPTION KEYS...');
    speak('Verifying system encryption keys.');
    try {
      const res = await fetch('/api/cesium-token', { signal: AbortSignal.timeout(5000) });
      const d = await res.json();
      // Apply Cesium Ion Token
      if (d.token) Cesium.Ion.defaultAccessToken = d.token;
      // Apply Google Maps API Key
      if (d.googleKey) {
        Cesium.GoogleMaps.defaultApiKey = d.googleKey;
        hasGoogleTilesKey = true;
        Cesium.RequestScheduler.requestsByServer["tile.googleapis.com:443"] = 18;
      }
      log('ACCESS KEYS GRANTED', '#0f8');
    } catch (e) {
      log('WARNING: AUTH TIMEOUT, USING LOCAL CACHE', '#f80');
    }
    setProgress(15, 'NETWORK');
    await wait(800);

    // STAGE 4: WORLD ENGINE
    log('SPAWNING OPTIMIZED WORLD ENGINE...');
    speak('Spawning optimized 3D world engine.');
    let viewer;
    try {
      const container = document.getElementById('cesiumContainer');
      if (!container) throw new Error('Missing #cesiumContainer');

      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        container.style.width = '100vw';
        container.style.height = '100vh';
        log('WARNING: CESIUM CONTAINER SIZE REPAIRED', '#f80');
      }

      const lowPowerDevice = (() => {
        const memory = navigator.deviceMemory || 4;
        const cores = navigator.hardwareConcurrency || 4;
        const smallViewport = Math.min(window.innerWidth || 1920, window.innerHeight || 1080) < 700;
        const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches === true;
        return smallViewport || coarsePointer || memory <= 4 || cores <= 4;
      })();

      // Cesium 1.112+ removed imageryProvider from Viewer constructor.
      // We must wire imagery via imageryLayers AFTER viewer creation.
      // baseLayer:false (Cesium 1.99+) prevents the default Bing layer from
      // being created at all — stops the dev.virtualearth.net CSP violation.
      viewer = new Cesium.Viewer('cesiumContainer', {
        baseLayerPicker: false, geocoder: false, homeButton: false,
        sceneModePicker: false, selectionIndicator: false, navigationHelpButton: false,
        animation: false, timeline: false, fullscreenButton: false,
        vrButton: false, infoBox: false, shadows: false, shouldAnimate: true,
        requestRenderMode: false,
        msaaSamples: lowPowerDevice ? 1 : 4,
        tileCacheSize: lowPowerDevice ? 220 : 1000,
        baseLayer: false,
      });
      // Belt-and-suspenders: nuke anything Cesium snuck in anyway (sync, before event loop yields)
      viewer.imageryLayers.removeAll();
      viewer.resolutionScale = lowPowerDevice ? Math.min(0.85, 1 / Math.max(1, window.devicePixelRatio || 1)) : 1;
      viewer.scene.fxaa = !lowPowerDevice;
      viewer.targetFrameRate = lowPowerDevice ? 30 : 60;
      window.gothamLowPowerMode = lowPowerDevice;

      try {
        viewer.scene.setTerrain(Cesium.Terrain.fromWorldTerrain({
          requestWaterMask: false,
          requestVertexNormals: false
        }));
        log('WORLD TERRAIN ONLINE', '#0f8');
      } catch (terrainErr) {
        log('INFO: WORLD TERRAIN DISABLED', '#f80');
        console.warn('[GOTHAM] Terrain unavailable, continuing with ellipsoid:', terrainErr);
      }

      viewer.scene.globe.preloadAncestors = true;
      viewer.scene.globe.preloadSiblings = !lowPowerDevice;
      viewer.scene.globe.maximumScreenSpaceError = lowPowerDevice ? 10 : 4;
      viewer.scene.globe.enableLighting = false;
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#123a58');
      viewer.scene.requestRenderMode = false;
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 500;
      window.gothamFallbackEarthLayer = null;

      // ── Imagery (must be post-creation in Cesium 1.112+) ──────────────────
      // Free/open providers with TOS that permit our use — NOT tile.openstreetmap.org
      // (blocked for third-party apps per osm.wiki/Blocked).
      // Chain: ESRI World Imagery (satellite, attribution-only) → CARTO Voyager (OSM data, CC-BY)
      //        → OpenTopoMap → local Natural Earth (offline fallback).
      ;(async () => {
        const tryProvider = async (name, providerFactory) => {
          try {
            const p = await providerFactory();
            viewer.imageryLayers.addImageryProvider(p);
            log(`${name} ONLINE`, '#0f8');
            console.log(`[GOTHAM] Imagery provider: ${name}`);
            return true;
          } catch (e) {
            console.warn(`[GOTHAM] Imagery provider "${name}" failed:`, e.message || e);
            return false;
          }
        };

        viewer.imageryLayers.removeAll();

        if (await tryProvider('ESRI WORLD IMAGERY', async () => new Cesium.UrlTemplateImageryProvider({
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          maximumLevel: 19,
          credit: 'Tiles © Esri — Source: Esri, DigitalGlobe, GeoEye, i-cubed, USDA, USGS, AEX, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        }))) return;

        if (await tryProvider('CARTO VOYAGER', async () => new Cesium.UrlTemplateImageryProvider({
          url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
          subdomains: ['a','b','c','d'],
          maximumLevel: 19,
          credit: '© OpenStreetMap contributors © CARTO'
        }))) return;

        if (await tryProvider('OPENTOPOMAP', async () => new Cesium.UrlTemplateImageryProvider({
          url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
          subdomains: ['a','b','c'],
          maximumLevel: 17,
          credit: '© OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)'
        }))) return;

        if (await tryProvider('NATURAL EARTH (OFFLINE)', async () =>
          Cesium.TileMapServiceImageryProvider.fromUrl('/js/Assets/Textures/NaturalEarthII')
        )) return;

        log('IMAGERY FAILED — ALL PROVIDERS DOWN', '#f04');
        console.error('[GOTHAM] All imagery providers failed');
      })();

      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(-40, 20, 18000000),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 }
      });

      window.gothamViewer = viewer;
      window.gothamGlobe = { viewer: viewer };
      setTimeout(() => {
        if (window.gothamViewer && !appRevealed) revealApp('VIEWER WATCHDOG');
      }, 12000);
      let resizeTimer = null;
      let _lastFrameTime = 0;
      const getViewportSize = () => {
        const vv = window.visualViewport;
        return {
          w: Math.max(320, Math.round((vv && vv.width) || window.innerWidth || document.documentElement.clientWidth || 1920)),
          h: Math.max(240, Math.round((vv && vv.height) || window.innerHeight || document.documentElement.clientHeight || 1080)),
          dpr: window.devicePixelRatio || 1
        };
      };
      const forceBox = (node, w, h) => {
        if (!node) return;
        node.style.position = 'fixed';
        node.style.left = '0px';
        node.style.top = '0px';
        node.style.right = 'auto';
        node.style.bottom = 'auto';
        node.style.width = w + 'px';
        node.style.height = h + 'px';
        node.style.minWidth = w + 'px';
        node.style.minHeight = h + 'px';
        node.style.maxWidth = w + 'px';
        node.style.maxHeight = h + 'px';
        node.style.margin = '0';
      };
      const repairViewerSize = () => {
        // Throttle to 30fps max
        const now = Date.now();
        if (now - _lastFrameTime < 33) return;
        _lastFrameTime = now;

        const el = document.getElementById('cesiumContainer');
        if (!el || !window.gothamViewer || window.gothamViewer.isDestroyed?.()) return;

        const { w, h, dpr } = getViewportSize();
        window.applyGothamResponsiveShell?.();
        forceBox(document.body, w, h);
        forceBox(document.getElementById('viewport-wrapper'), w, h);
        forceBox(document.getElementById('viewport-overlay'), w, h);
        forceBox(el, w, h);
        el.querySelectorAll('.cesium-viewer, .cesium-viewer-cesiumWidgetContainer, .cesium-widget').forEach(node => forceBox(node, w, h));
        const canvas = el.querySelector('canvas');
        if (canvas) {
          forceBox(canvas, w, h);
          canvas.width = Math.max(1, Math.round(w * dpr));
          canvas.height = Math.max(1, Math.round(h * dpr));
        }
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          try {
            window.gothamViewer.resize();
            window.gothamViewer.scene.requestRender?.();
          } catch (resizeErr) {
            console.warn('[GOTHAM] Viewer resize repair skipped:', resizeErr.message);
          }
        }, 80);
      };
      window.addEventListener('resize', repairViewerSize);
      window.addEventListener('orientationchange', repairViewerSize);
      window.addEventListener('focus', repairViewerSize);
      window.addEventListener('pageshow', repairViewerSize);
      if (window.visualViewport) window.visualViewport.addEventListener('resize', repairViewerSize);
      if (window.visualViewport) window.visualViewport.addEventListener('scroll', repairViewerSize);
      let lastViewportKey = '';
      window.gothamResizePoll = setInterval(() => {
        const vp = getViewportSize();
        const key = `${vp.w}x${vp.h}@${vp.dpr}:${window.screen?.width}x${window.screen?.height}:${window.screen?.availWidth}x${window.screen?.availHeight}`;
        if (key !== lastViewportKey) {
          lastViewportKey = key;
          repairViewerSize();
        }
      }, 250);
      const repairUntil = Date.now() + 3000;
      const repairLoop = () => {
        repairViewerSize();
        if (Date.now() < repairUntil) requestAnimationFrame(repairLoop);
      };
      requestAnimationFrame(repairLoop);
      repairViewerSize();
      log('ENGINE STABILIZED', '#0f8');
    } catch (e) {
      log('CRITICAL ENGINE FAILURE', '#f44');
      console.error(e);
      return;
    }
    setProgress(35, 'ENGINE');
    await wait(800);

    // STAGE 5: VIEWPORT & OPTICS
    log('MAPPING CIRCULAR VIEWPORT...');
    speak('Mapping circular viewport.');
    if (typeof GothamViewport !== 'undefined') {
      try {
        window.gothamViewport = new GothamViewport(viewer);
        log('RETICLE LOCK ACQUIRED', '#0f8');
      } catch (e) {
        log('VIEWPORT INITIALIZATION PARTIAL', '#f80');
      }
    }
    setProgress(45, 'OPTICS');
    await wait(800);

    // STAGE 6: CITY MESH — OSM Buildings (free open-source 3D building overlay)
    // Uses Cesium Ion asset 96188 (OSM Buildings) — no paid tier, only the Ion token
    // already wired via /api/cesium-token. Zero per-request billing.
    log('INJECTING 3D BUILDINGS [OSM]...');
    speak('Injecting three-D building layer from OpenStreetMap.');
    try {
      const buildings = await Promise.race([
        Cesium.createOsmBuildingsAsync(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 15000))
      ]);
      buildings.showCreditsOnScreen = true;
      viewer.scene.primitives.add(buildings);
      window.gothamOsmBuildings = buildings;
      log('OSM BUILDINGS ACTIVE', '#0f8');
      console.log('[GOTHAM] OSM Buildings tileset loaded (Cesium Ion asset 96188)');
    } catch (e) {
      log('OSM BUILDINGS BYPASSED', '#f80');
      console.warn('[GOTHAM] OSM Buildings failed:', e);

      // Optional legacy Google fallback if the operator explicitly enables it and provides a key
      if (window.GOTHAM_ENABLE_GOOGLE_3D_TILES === true && hasGoogleTilesKey) {
        try {
          const tileset = await Promise.race([
            Cesium.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 15000))
          ]);
          tileset.showCreditsOnScreen = true;
          viewer.scene.primitives.add(tileset);
          log('GOOGLE 3D FALLBACK ACTIVE', '#0f8');
        } catch (g) {
          console.warn('[GOTHAM] Google 3D fallback also failed:', g);
        }
      }
    }
    setProgress(60, 'RENDERER');
    await wait(800);

    // STAGE 7: LOGIC & SHADERS
    log('BOOTING OMNI-EYE LOGIC...');
    speak('Booting omni-eye logic.');
    let gothamSystem = null;
    if (typeof Gotham3077System !== 'undefined') {
      try {
        gothamSystem = new Gotham3077System(viewer);
        window.gothamSystem = gothamSystem;
        window.gothamEntitySystem = gothamSystem;
        log('ENTITY SYNC READY', '#0f8');
        
        // Initialize ShadowBroker Bridge
        if (typeof ShadowBrokerBridge !== 'undefined') {
          window.shadowBrokerBridge = new ShadowBrokerBridge(viewer, gothamSystem);
          window.gothamShadowBroker = window.shadowBrokerBridge; // canonical alias
          log('SHADOWBROKER ONLINE', '#0f8');

          // Hydrate from the last session's IndexedDB snapshot BEFORE the first fetch
          // returns, so the globe renders instantly rather than staring at a blank
          // sphere for 2-3 seconds. Fresh live data overwrites this the moment it lands.
          if (typeof window.shadowBrokerBridge.hydrateFromCache === 'function') {
            window.shadowBrokerBridge.hydrateFromCache().then(r => {
              if (r.hydrated > 0) log(`CACHE HYDRATED — ${r.hydrated} entities`, '#0f8');
            }).catch(() => {});
          }
        }
      } catch (e) {
        log('ENTITY SYSTEM PARTIAL', '#f80');
        console.error(e);
      }
    }
    setProgress(70, 'LOGIC');
    await wait(800);

    log('CALIBRATING VISUAL MODES...');
    speak('Calibrating visual modes.');
    if (typeof GothamShaders !== 'undefined') {
      try {
        window.gothamShaders = new GothamShaders(viewer);
        log('SHADERS ONLINE', '#0f8');
      } catch (e) {
        log('SHADER SYSTEM PARTIAL', '#f80');
      }
    }
    setProgress(80, 'SHADERS');
    await wait(800);

    // STAGE 8: HUD & COMMS
    log('SPAWNING SUPREME COMMAND HUD...');
    speak('Spawning supreme command interface.');
    if (typeof GothamHUD !== 'undefined' && window.gothamShaders) {
      try {
        window.gothamHUD = new GothamHUD(viewer, window.gothamShaders, gothamSystem);
        log('HUD v40.0 CONNECTED', '#0f8');
        revealApp('HUD READY');
      } catch (e) {
        log('HUD PARTIAL', '#f80');
        console.error(e);
        revealApp('HUD SAFE MODE');
      }
    }
    setProgress(85, 'HUD');
    await wait(800);

    // STAGE 8a: EVENT ENGINE, PREDICTION ENGINE & AI ANALYST
    log('ACTIVATING INTELLIGENCE SYSTEMS...');
    speak('Activating intelligence systems.');
    
    // Initialize Event Engine (with HUD reference for layer-aware alerts)
    if (typeof GothamEventEngine !== 'undefined' && gothamSystem && window.gothamHUD) {
      try {
        window.gothamEventEngine = new GothamEventEngine(gothamSystem, window.gothamHUD);
        window.gothamEventEngine.enableAlerts();
        log('EVENT ENGINE ONLINE', '#0f8');
      } catch (e) {
        log('EVENT ENGINE PARTIAL', '#f80');
        console.error(e);
      }
    }
    
    // Initialize Prediction Engine
    if (typeof GothamPredictionEngine !== 'undefined' && gothamSystem) {
      try {
        window.gothamPredictionEngine = new GothamPredictionEngine(gothamSystem);
        log('PREDICTION ENGINE ONLINE', '#0f8');
      } catch (e) {
        log('PREDICTION ENGINE PARTIAL', '#f80');
        console.error(e);
      }
    }
    
    // Initialize AI Analyst
    if (typeof GothamAIAnalyst !== 'undefined' && gothamSystem && window.gothamHUD) {
      try {
        window.gothamAIAnalyst = new GothamAIAnalyst(
          gothamSystem,
          window.gothamEventEngine,
          window.gothamPredictionEngine,
          window.gothamHUD
        );
        log('AI ANALYST ONLINE', '#0f8');
        speak('AI analyst autonomous analysis active.');
      } catch (e) {
        log('AI ANALYST PARTIAL', '#f80');
        console.error(e);
      }
    }
    await wait(600);

    // STAGE 8b: ACCOUNTABILITY ENGINE (Public Cameras + UFO Tracking)
    log('ACTIVATING ACCOUNTABILITY ENGINE...');
    speak('Activating accountability engine.');
    if (typeof accountabilityEngine !== 'undefined' && viewer && window.gothamHUD) {
      try {
        window.gothamAccountability = new accountabilityEngine(viewer, window.gothamHUD);
        await window.gothamAccountability.init();
        // Globe markers need the scene to be ready — use readyPromise or a brief settle period
        if (viewer.scene.readyPromise) {
          await viewer.scene.readyPromise;
        }
        await window.gothamAccountability.whenGlobeReady();
        log('ACCOUNTABILITY ENGINE ONLINE', '#0f8');
        speak('Public camera and UFO tracking active.');
      } catch (e) {
        log('ACCOUNTABILITY PARTIAL', '#f80');
        console.error(e);
      }
    }
    await wait(400);

    // STAGE 8a.5: ROAD NETWORK
    log('INITIALIZING ROAD NETWORK...');
    speak('Initializing road network.');
    if (typeof RoadNetwork !== 'undefined' && viewer) {
      try {
        window.gothamRoads = new RoadNetwork(viewer);
        log('ROAD NETWORK ONLINE', '#0f8');
      } catch (e) {
        log('ROAD NETWORK PARTIAL', '#f80');
        console.error(e);
      }
    }
    await wait(400);

    // STAGE 8b: WORLDVIEW + TRAJECTORY FIELDS
    log('INITIALIZING WORLDVIEW SUBSYSTEMS...');
    speak('Initializing worldview subsystems.');
    if (typeof WorldviewComplete !== 'undefined') {
      try {
        window.gothamWorldview = new WorldviewComplete(viewer);
        log('WORLDVIEW COMPLETE ONLINE', '#0f8');
      } catch (e) {
        log('WORLDVIEW PARTIAL', '#f80');
        console.error(e);
      }
    }
    if (typeof TrajectoryFieldSystem !== 'undefined' && window.gothamWorldview) {
      try {
        window.gothamTrajectory = new TrajectoryFieldSystem(viewer, window.gothamWorldview);
        log('TRAJECTORY FIELDS ONLINE', '#0f8');
      } catch (e) {
        log('TRAJECTORY FIELDS PARTIAL', '#f80');
        console.error(e);
      }
    }
    setProgress(88, 'SUBSYSTEMS');
    await wait(400);

    // STAGE 8c: WORLD STREAMING CONTROLLER
    log('INITIALIZING WORLD STREAMING LAYER...');
    speak('Initializing world streaming layer.');
    if (typeof WorldStreamingController !== 'undefined') {
      try {
        window.worldStreaming = new WorldStreamingController(viewer, {
          tileThreshold: 500,
          transitionZone: 200,
          regionThreshold: 1000,
          planetThreshold: 10000
        });
        
        // Connect to existing systems
        if (window.gothamHUD) {
          window.worldStreaming.on('tileworld:entered', (data) => {
            window.gothamHUD._sysLog(`Sector entry: ${data.biome.biome} biome`);
          });
          
          window.worldStreaming.on('mode:changed', (data) => {
            window.gothamHUD._sysLog(`View mode: ${data.to}`);
          });
        }
        
        // Listen for propagated events
        window.worldStreaming.on('tileworld:event', (data) => {
          if (data.type === 'seismic' && window.gothamHUD) {
            window.gothamHUD._sysLog(`SEISMIC ALERT: M${data.magnitude}`);
          }
        });
        
        log('WORLD STREAMING ONLINE', '#0f8');
        speak('World streaming layer active. Seamless zoom transition ready.');
      } catch (e) {
        log('WORLD STREAMING PARTIAL', '#f80');
        console.error(e);
      }
    }
    setProgress(92, 'SUBSYSTEMS');
    await wait(400);

    // STAGE 8e: RESTORED MODULES — SequentialLoader, HUD Enhanced, Timeline, Emotional, Airspace
    log('ACTIVATING RESTORED MODULES...');
    speak('Activating restored modules.');

    // Sequential Layer Loader — prevents data stampedes on dense areas
    if (typeof SequentialLoader !== 'undefined' && viewer) {
      try {
        window.gothamSequentialLoader = new SequentialLoader(viewer, { maxConcurrentLoads: 2, throttleMs: 150 });
        log('SEQUENTIAL LOADER ONLINE', '#0f8');
      } catch (e) {
        log('SEQUENTIAL LOADER PARTIAL', '#f80');
        console.error(e);
      }
    }

    // HUD Enhanced — enhanced heads-up display
    if (typeof GothamEnhancedHUD !== 'undefined' && viewer && window.gothamShaders && gothamSystem) {
      try {
        window.gothamEnhancedHUD = new GothamEnhancedHUD(viewer, window.gothamShaders, gothamSystem);
        log('HUD ENHANCED ONLINE', '#0f8');
      } catch (e) {
        log('HUD ENHANCED PARTIAL', '#f80');
        console.error(e);
      }
    }

    // Timeline Engine — correlation timeline with events
    if (typeof TimelineEngine !== 'undefined' && viewer) {
      try {
        const worldStateDB = window.worldStateDB || null;
        window.gothamTimeline = new TimelineEngine(viewer, { worldState: worldStateDB });
        log('TIMELINE ENGINE ONLINE', '#0f8');
      } catch (e) {
        log('TIMELINE ENGINE PARTIAL', '#f80');
        console.error(e);
      }
    }

    // Emotional Engine — agent affect state
    if (typeof EmotionalEngine !== 'undefined' && window.gothamEventBus) {
      try {
        window.gothamEmotional = new EmotionalEngine(window.gothamEventBus);
        log('EMOTIONAL ENGINE ONLINE', '#0f8');
      } catch (e) {
        log('EMOTIONAL ENGINE PARTIAL', '#f80');
        console.error(e);
      }
    }

    // Airspace Manager — airspace tracking overlay
    if (typeof AirspaceManager !== 'undefined' && window.gothamEventBus) {
      try {
        window.gothamAirspace = new AirspaceManager({ eventBus: window.gothamEventBus });
        log('AIRSPACE MANAGER ONLINE', '#0f8');
      } catch (e) {
        log('AIRSPACE MANAGER PARTIAL', '#f80');
        console.error(e);
      }
    }

    // worldmonitor integration — WorldMonitor intelligence panel bridge
    if (typeof window.WorldMonitorIntegration !== 'undefined' && viewer) {
      try {
        window.gothamWorldMonitor = window.WorldMonitorIntegration;
        log('WORLDMONITOR INTEGRATION ONLINE', '#0f8');
      } catch (e) {
        log('WORLDMONITOR PARTIAL', '#f80');
        console.error(e);
      }
    }

    setProgress(94, 'RESTORED MODULES');
    await wait(400);

    // STAGE 8d: CORE INFRASTRUCTURE SYSTEMS
    log('INITIALIZING CORE INFRASTRUCTURE...');
    speak('Initializing core infrastructure systems.');
    
    // Global Event Bus
    if (typeof GothamEventBus !== 'undefined') {
      try {
        window.gothamEventBus = window.gothamEventBus || new GothamEventBus();
        window.gothamBus = window.gothamEventBus; // Alias for task system
        log('EVENT BUS v2.0 ONLINE', '#0f8');
      } catch (e) {
        log('EVENT BUS PARTIAL', '#f80');
      }
    }
    await wait(200);
    
    // TITAN Cache System
    if (typeof GothamCache !== 'undefined') {
      try {
        window.gothamCache = new GothamCache();
        log('TITAN CACHE ONLINE', '#0f8');
      } catch (e) {
        log('TITAN CACHE PARTIAL', '#f80');
        console.error(e);
      }
    }
    await wait(200);
    
    // TITAN Spatial Index
    if (typeof SpatialIndex !== 'undefined') {
      try {
        window.gothamSpatial = new SpatialIndex();
        log('SPATIAL INDEX ONLINE', '#0f8');
      } catch (e) {
        log('SPATIAL INDEX PARTIAL', '#f80');
        console.error(e);
      }
    }
    await wait(200);
    
    // World State Database
    if (typeof WorldStateDatabase !== 'undefined') {
      try {
        window.worldStateDB = new WorldStateDatabase({ eventBus: window.gothamEventBus });
        log('WORLD STATE DB ONLINE', '#0f8');
      } catch (e) {
        log('WORLD STATE DB PARTIAL', '#f80');
        console.error(e);
      }
    }
    await wait(200);
    
    // Satellite Coverage System
    if (typeof SatelliteCoverageSystem !== 'undefined' && viewer) {
      try {
        window.satCoverage = new SatelliteCoverageSystem(viewer);
        log('SATELLITE COVERAGE ONLINE', '#0f8');
      } catch (e) {
        log('SATELLITE COVERAGE PARTIAL', '#f80');
        console.error(e);
      }
    }
    await wait(200);
    
    // Performance Monitor
    if (typeof GothamPerformanceMonitor !== 'undefined' && viewer) {
      try {
        window.gothamPerfMonitor = new GothamPerformanceMonitor(viewer, {
          targetFPS: 60,
          warningThreshold: 30
        });
        log('PERFORMANCE MONITOR ONLINE', '#0f8');
      } catch (e) {
        log('PERFORMANCE MONITOR PARTIAL', '#f80');
        console.error(e);
      }
    }
    await wait(200);
    
    // Scenario Engine
    if (typeof ScenarioEngine !== 'undefined') {
      try {
        window.scenarioEngine = new ScenarioEngine({ 
          eventBus: window.gothamEventBus,
          worldState: window.worldStateDB 
        });
        window.scenarioEngine.start();
        log('SCENARIO ENGINE ONLINE', '#0f8');
        speak('Disaster simulation ready. 8 scenarios loaded.');
      } catch (e) {
        log('SCENARIO ENGINE PARTIAL', '#f80');
        console.error(e);
      }
    }
    await wait(200);
    
    // GitHub Marketplace
    if (typeof GitHubMarketplace !== 'undefined') {
      try {
        window.githubMarketplace = new GitHubMarketplace({
          eventBus: window.gothamEventBus,
          agentSystem: window.agentController
        });
        log('GITHUB MARKETPLACE ONLINE', '#0f8');
        speak('Agent work marketplace active.');
      } catch (e) {
        log('GITHUB MARKETPLACE PARTIAL', '#f80');
        console.error(e);
      }
    }
    await wait(200);

    // Phase 2: CCTV Projector
    if (typeof CCTVProjector !== 'undefined' && viewer) {
      try {
        window.cctvProjector = new CCTVProjector(viewer);
        log('CCTV PROJECTOR ONLINE', '#0f8');
      } catch (e) {
        log('CCTV PROJECTOR PARTIAL', '#f80');
        console.error(e);
      }
    }
    await wait(200);

    // Phase 2: Credits Engine
    if (typeof CreditsEngine !== 'undefined') {
      try {
        window.gothamCredits = new CreditsEngine({
          eventBus: window.gothamEventBus,
          hud: window.gothamHUD,
          system: gothamSystem
        });
        log('CREDITS ENGINE ONLINE', '#0f8');
      } catch (e) {
        log('CREDITS ENGINE PARTIAL', '#f80');
        console.error(e);
      }
    }
    await wait(200);

    setProgress(94, 'INFRASTRUCTURE');
    await wait(400);

    log('ESTABLISHING DATA UPLINK...');
    speak('Establishing data uplink.');
    window.addEventListener('gotham-data', function (e) {
      if (gothamSystem) {
        try {
          gothamSystem._updateLayers(e.detail);
        } catch (err) {
          console.warn('[GOTHAM] Layer update error:', err);
        }
      }
    });

    // Flush any buffered WebSocket data that arrived before we were ready
    if (window._gothamFlushDataBuffer) {
      console.log('[GOTHAM] Flushing buffered WebSocket data...');
      window._gothamFlushDataBuffer();
    }

    // Data flows via WebSocket in index.html → gotham-data event → _updateLayers
    // Also trigger initial viewport fetch + periodic polling as backup
    if (gothamSystem && gothamSystem._fetchViewportData) {
      setTimeout(() => {
        console.log('[GOTHAM] Initial viewport data fetch');
        gothamSystem._fetchViewportData();
      }, 3000);

      // Periodic fallback poll every 30s
      setInterval(() => {
        if (gothamSystem && !gothamSystem._isDestroyed) {
          gothamSystem._fetchViewportData();
        }
      }, 30000);
    }



    log('UPLINK STABLE', '#0f8');
    setProgress(95, 'COMMS');
    await wait(800);

    // STAGE 9: FINALIZATION
    log('VERIFYING BASE LAYER...');
    speak('Attaching global overlays.');
    try {
      if (false && !viewer.imageryLayers.length) {
        viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
          url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          credit: 'Tiles © Esri'
        }));
      }
    } catch (e) { log('INFO: OSM PARTIAL LOAD'); }
    await wait(500);
    // ── PERSONALISED FINAL WELCOME ─────────────────────────────────
    // Wait for TTS queue to drain before the final greeting
    await speak('System ready.');
    await wait(600);
    await speak(commanderName + ', welcome back, Commander. All tactical feeds are stabilised, and planetary monitoring is online.');
    log('SYSTEM READY. WELCOME BACK, ' + commanderName.toUpperCase() + '.', '#0ff');
    revealApp('BOOT COMPLETE');

    // ── DEMO DIRECTOR LAUNCHER ─────────────────────────────────────────
    // Available from browser console or boot screen buttons:
    //   _startDemo('full')      — all 14 layers, 60s each
    //   _startDemo('investor')  — high-value layers only, ~8min
    //   _startDemo('technical') — architecture tour, ~10min
    //   _startDemo('cinematic') — dramatic zooms, theatrical narration
    //   _startDemo('silent')    — camera only, no voice
    window._startDemo = (mode) => {
      if (typeof DemoDirector === 'undefined') {
        alert('Demo Director not loaded. Refresh and try again.');
        return;
      }
      if (!window.gothamViewer) { console.warn('[DemoDirector] Viewer not ready yet.'); return; }
      if (!window.gothamHUD)    { console.warn('[DemoDirector] HUD not ready yet.'); return; }
      if (window.demoDirector)   { window.demoDirector.stop(); }
      window.demoDirector = new DemoDirector(window.gothamViewer, window.gothamHUD);
      window.demoDirector.start(mode || 'full');
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (window.gothamResizePoll) {
      clearInterval(window.gothamResizePoll);
      window.gothamResizePoll = null;
    }
  });
})();
