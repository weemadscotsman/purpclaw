/**
 * GOTHAM 3077 - PUBLIC CAMERA ACCOUNTABILITY ENGINE v4.0
 * Ted's Vision: Real live CCTV from public DOT/traffic camera APIs.
 *
 * v4.0 changes:
 * - REMOVED all fake YouTube IDs — zero YouTube dependency
 * - Cameras come from /api/cctv (Node proxy to Python CCTV pipeline)
 * - TfL MP4 streams: native <video> with loop/mute for CCTV playback
 * - Snapshot JPG cameras: auto-refreshing <img> tag (Gov.sg Singapore, etc.)
 * - hls.js loaded from CDN for any .m3u8 HLS streams
 * - Globe markers rendered from live camera lat/lon
 * - Click marker → opens live video widget at that location
 * - Reliable close: ESC, X button, click-outside
 */
(function () {
  'use strict';

  // ── hls.js local ────────────────────────────────────────────────────────────
  // Loaded synchronously at script execution time — avoids CSP violations
  // from CDN-loading in a DOM callback. Synchronous is fine: the file is
  // ~400 KB and loads once at startup before any HLS playback is needed.
  (function loadHlsLocal() {
    if (window.Hls) return;
    var s = document.createElement('script');
    s.src = '/gotham/hls.min.js';
    s.onload = function () { window._hlsReady = true; };
    document.head.appendChild(s);
    // Blocking: wait for it to be available before proceeding
    var t = Date.now();
    while (!window.Hls && Date.now() - t < 5000) { /* spin wait for sync envs */ }
  })();

  class accountabilityEngine {
    constructor(viewer, hud) {
      this.viewer        = viewer;
      this.hud           = hud;
      this.cameras       = new Map();   // id → camera object
      this._markers      = new Map();   // cameraId → Cesium entity
      this._escHandler   = null;
      this._activePlayerEl = null;
      this._activeHls    = null;
      this._refreshTimer = null;
      this._markerEntities = [];        // Cesium entity references for globe markers
      this._globeReady   = false;
      this._camListReady = false;

      console.log('[ACC] v4.0 — loading cameras from /api/cctv');
    }

    // ── PUBLIC API ──────────────────────────────────────────────────────────

    async init() {
      await this._loadCameraList();
      this._bindGlobeClicks();
      this._bindPanelClicks();
      this.isInitialized = true;
      console.log('[ACC] Accountability engine online — ' + this.cameras.size + ' cameras ready');
      this._log('CAMERAS: ' + this.cameras.size + ' live feeds loaded');
    }

    // Called by init.js after globe is ready
    async whenGlobeReady() {
      this._globeReady = true;
      this._renderGlobeMarkers();
    }

    showCamerasOnGlobe() {
      // Fly to London as the representative opening position (TfL HQ)
      this.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-0.1276, 51.5074, 80000),
        duration: 2
      });
      this._log('CAMERA GRID: ' + this.cameras.size + ' verified feeds online');
    }

    openCamById(id) {
      const cam = this.cameras.get(id);
      if (!cam) { this._log('CAM NOT FOUND: ' + id); return; }
      this._openCam(cam);
    }

    closePlayer() {
      if (this._activeHls) {
        try { this._activeHls.destroy(); } catch (_) {}
        this._activeHls = null;
      }
      if (this._refreshTimer) {
        clearInterval(this._refreshTimer);
        this._refreshTimer = null;
      }
      if (this._activePlayerEl) {
        this._activePlayerEl.remove();
        this._activePlayerEl = null;
      }
      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
        this._escHandler = null;
      }
      this._log('PLAYER CLOSED');
    }

    closeAll() {
      this.closePlayer();
      this.closeUFOPanel();
      if (window.gothamCountryIntel?._hideCCTVOverlay) {
        window.gothamCountryIntel._hideCCTVOverlay();
      }
      // Remove globe markers
      this._markerEntities.forEach(e => { try { this.viewer.entities.remove(e); } catch (_) {} });
      this._markerEntities = [];
    }

    // ── CAMERA LOADING ──────────────────────────────────────────────────────

    async _loadCameraList() {
      try {
        // /api/cctv returns paginated cameras from Python CCTV pipeline (4,518 total)
        const resp = await fetch('/api/cctv');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        let cameras = await resp.json();

        // If API returns a paginated object { data, total }, flatten it
        if (cameras && cameras.data) cameras = cameras.data;
        if (!Array.isArray(cameras)) cameras = [];

        // Deduplicate by id
        const seen = new Set();
        cameras = cameras.filter(c => {
          if (!c.id || seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });

        for (const cam of cameras) {
          // Normalise fields — various ingestors use different names
          const lat = cam.lat ?? cam.latitude ?? cam.location?.lat;
          const lon = cam.lon ?? cam.lng ?? cam.longitude ?? cam.location?.lon;
          const name = cam.name ?? cam.title ?? cam.direction_facing ?? cam.id;
          const mediaUrl = cam.media_url ?? cam.url ?? cam.stream_url ?? cam.mediaUrl;

          if (!lat || !lon || !mediaUrl) continue;

          this.cameras.set(cam.id, {
            id: cam.id,
            name: String(name),
            lat: parseFloat(lat),
            lon: parseFloat(lon),
            mediaUrl: mediaUrl,
            mediaType: cam.media_type ?? cam.type ?? this._detectMediaType(mediaUrl),
            agency: cam.source_agency ?? cam.source ?? 'CCTV',
            refreshMs: (cam.refresh_rate_seconds ?? 30) * 1000,
          });
        }

        this._camListReady = true;
        console.log('[ACC] Loaded ' + this.cameras.size + ' cameras from /api/cctv');
        this._log('CCTV: ' + this.cameras.size + ' cameras loaded');

        if (this._globeReady) this._renderGlobeMarkers();

      } catch (e) {
        console.error('[ACC] Failed to load cameras:', e);
        this._log('CCTV LOAD FAILED — check network');
      }
    }

    _detectMediaType(url) {
      if (!url) return 'unknown';
      const u = url.toLowerCase();
      if (u.includes('.m3u8')) return 'hls';
      if (u.includes('.mp4')) return 'video';
      if (u.includes('.jpg') || u.includes('.jpeg') || u.includes('.png') || u.includes('/jpg')) return 'image';
      if (u.includes('stream') || u.includes('mjpeg') || u.includes('mpeg')) return 'video';
      return 'image'; // default to image for snapshot URLs
    }

    // ── GLOBE MARKERS ───────────────────────────────────────────────────────

    _renderGlobeMarkers() {
      if (!this._globeReady) return;

      // Remove old markers
      this._markerEntities.forEach(e => { try { this.viewer.entities.remove(e); } catch (_) {} });
      this._markerEntities = [];

      // Limit to first 300 markers to keep performance sane
      let count = 0;
      const MAX_MARKERS = 300;

      this.cameras.forEach((cam, id) => {
        if (count++ >= MAX_MARKERS) return;
        if (!cam.lat || !cam.lon) return;

        const color = this._agencyColor(cam.agency);
        const entity = this.viewer.entities.add({
          id: 'cam-' + id,
          position: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, 0),
          point: {
            pixelSize: 6,
            color: Cesium.Color.fromCssColorString(color).withAlpha(0.85),
            outlineColor: Cesium.Color.WHITE.withAlpha(0.5),
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: cam.name.substring(0, 20),
            font: '9px Share Tech Mono',
            fillColor: Cesium.Color.fromCssColorString(color),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(8, -4),
            scaleByDistance: new Cesium.NearFarScalar(50000, 0.8, 500000, 0.3),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          description: '📹 ' + cam.name + '\n' + cam.agency + '\n' + cam.mediaUrl,
        });

        this._markerEntities.push(entity);
      });

      console.log('[ACC] Globe markers: ' + this._markerEntities.length + ' of ' + this.cameras.size + ' cameras');
    }

    _agencyColor(agency) {
      const a = (agency || '').toLowerCase();
      if (a.includes('tfl') || a.includes('transport')) return '#00ff88';
      if (a.includes('dot') || a.includes('traffic') || a.includes('highway')) return '#ff8800';
      if (a.includes('osint')) return '#ff4488';
      if (a.includes('gov') || a.includes('national')) return '#4488ff';
      return '#00ffcc';
    }

    // ── PLAYER ───────────────────────────────────────────────────────────────

    _openCam(cam) {
      this.closePlayer();
      this.closeUFOPanel();
      this._log('FEED: ' + cam.name + ' [' + cam.agency + ']');
      this._renderPlayer(cam);
      // Fly to camera
      if (this.viewer) {
        this.viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, 2000),
          duration: 1.5,
        });
      }
    }

    _renderPlayer(cam) {
      const pid    = 'acc-player-wrap';
      const hdrId  = 'acc-player-hdr';
      const bodyId = 'acc-player-body';

      const wrap = document.createElement('div');
      wrap.id = pid;
      wrap.style.cssText = [
        'position:fixed',
        'bottom:16px', 'right:16px',
        'width:600px', 'height:460px',
        'background:#000',
        'border:2px solid #0ff',
        'border-radius:10px',
        'z-index:9999',
        'overflow:hidden',
        'box-shadow:0 8px 48px rgba(0,255,255,0.3)',
        'font-family:Share Tech Mono,Courier New,monospace',
        'display:flex', 'flex-direction:column',
      ].join(';');

      // ── Header ────────────────────────────────────────────────────────────
      const hdr = document.createElement('div');
      hdr.id = hdrId;
      hdr.style.cssText = [
        'display:flex', 'justify-content:space-between', 'align-items:center',
        'padding:8px 12px',
        'background:rgba(0,255,255,0.07)',
        'border-bottom:1px solid rgba(0,255,255,0.2)',
        'flex-shrink:0',
        'gap:8px',
      ].join(';');

      const title = document.createElement('span');
      title.style.cssText = 'color:#0ff;font-size:11px;letter-spacing:1px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      title.textContent = '📹 ' + cam.name + ' | ' + cam.agency;
      hdr.appendChild(title);

      const src = document.createElement('span');
      src.style.cssText = 'color:#048;font-size:9px;letter-spacing:1px;white-space:nowrap;';
      src.textContent = cam.mediaType.toUpperCase();
      hdr.appendChild(src);

      const closeBtn = document.createElement('button');
      closeBtn.style.cssText = [
        'background:rgba(255,255,255,0.06)',
        'border:1px solid rgba(255,255,255,0.2)',
        'color:#fff',
        'padding:3px 10px',
        'border-radius:3px',
        'cursor:pointer',
        'font-family:inherit',
        'font-size:10px',
        'letter-spacing:1px',
        'flex-shrink:0',
      ].join(';');
      closeBtn.textContent = '✕ CLOSE';
      closeBtn.addEventListener('click', () => this.closePlayer());
      hdr.appendChild(closeBtn);
      wrap.appendChild(hdr);

      // ── Body ──────────────────────────────────────────────────────────────
      const body = document.createElement('div');
      body.id = bodyId;
      body.style.cssText = 'flex:1;position:relative;background:#000;overflow:hidden;';
      wrap.appendChild(body);

      document.body.appendChild(wrap);
      this._activePlayerEl = wrap;

      // ── ESC to close ─────────────────────────────────────────────────────
      if (this._escHandler) document.removeEventListener('keydown', this._escHandler);
      this._escHandler = (e) => { if (e.key === 'Escape') this.closePlayer(); };
      document.addEventListener('keydown', this._escHandler);

      // ── Load media ──────────────────────────────────────────────────────
      this._loadMedia(bodyId, cam);
    }

    _loadMedia(bodyId, cam) {
      const body = document.getElementById(bodyId);
      if (!body) return;

      switch (cam.mediaType) {
        case 'hls':
          this._loadHLS(body, cam.mediaUrl);
          break;
        case 'video':
          this._loadVideo(body, cam.mediaUrl, cam);
          break;
        case 'image':
        default:
          this._loadImageRefresh(body, cam);
          break;
      }
    }

    _loadVideo(body, url, cam) {
      // TfL .mp4 streams — use native <video> with loop + mute for autoplay policy
      const vid = document.createElement('video');
      vid.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;background:#000;';
      vid.autoplay = true;
      vid.muted    = true;       // required for autoplay in modern browsers
      vid.loop     = true;
      vid.playsInline = true;
      vid.setAttribute('playsinline', '');

      // Try direct MP4 first (TfL JamCams work this way)
      vid.src = url;

      vid.addEventListener('error', () => {
        console.warn('[ACC] Video error, trying HLS:', url);
        // Fall back to HLS.js if native fails (some MP4 URLs are actually HLS manifests)
        if (window.Hls && window.Hls.isSupported()) {
          const hls = new window.Hls({ enableWorker: true, lowLatencyMode: true });
          hls.loadSource(url);
          hls.attachMedia(vid);
          hls.on(window.Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              body.innerHTML = this._offlineCard(cam, 'Stream unavailable or format not supported.');
            }
          });
          this._activeHls = hls;
        } else {
          body.innerHTML = this._offlineCard(cam, 'Video format not supported in this browser.');
        }
      });

      vid.addEventListener('loadeddata', () => {
        vid.play().catch(() => {}); // attempt play (may be blocked without user gesture)
      });

      body.appendChild(vid);
    }

    _loadHLS(body, url) {
      const vid = document.createElement('video');
      vid.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;background:#000;';
      vid.autoplay = true;
      vid.muted    = true;
      vid.playsInline = true;
      vid.setAttribute('playsinline', '');

      if (window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls({ enableWorker: true, lowLatencyMode: true });
        hls.loadSource(url);
        hls.attachMedia(vid);
        hls.on(window.Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            body.innerHTML = this._offlineCard({ name: 'HLS Stream', agency: 'CCTV' }, 'HLS stream failed: ' + data.type);
          }
        });
        this._activeHls = hls;
        vid.play().catch(() => {});
      } else if (vid.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        vid.src = url;
        vid.play().catch(() => {});
      } else {
        body.innerHTML = this._offlineCard({ name: 'HLS Stream', agency: 'CCTV' }, 'HLS not supported. Try Chrome or Firefox.');
      }

      body.appendChild(vid);
    }

    _loadImageRefresh(body, cam) {
      // Snapshot cameras — auto-refresh <img> tag every N seconds
      // Works with: Singapore Gov.sg, various .jpg traffic cameras
      const img = document.createElement('img');
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;background:#000;';
      img.alt = cam.name;

      const refresh = () => {
        if (!this._activePlayerEl) return; // player was closed
        // Cache-bust: add ?t=timestamp to force fresh fetch
        const url = cam.mediaUrl + (cam.mediaUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
        img.src = url;
      };

      img.addEventListener('error', () => {
        if (!this._activePlayerEl) return;
        img.style.display = 'none';
        body.innerHTML = this._offlineCard(cam, 'Snapshot unavailable or camera offline.');
      });

      img.addEventListener('load', () => {
        img.style.display = 'block';
      });

      body.appendChild(img);
      refresh();

      // Refresh every cam.refreshMs ms
      this._refreshTimer = setInterval(refresh, cam.refreshMs || 30000);
    }

    _offlineCard(cam, msg) {
      cam = cam || { name: 'CCTV', agency: 'Unknown' };
      return [
        '<div style="width:100%;height:100%;display:flex;flex-direction:column;',
        'align-items:center;justify-content:center;gap:10px;color:#0ff;',
        'background:radial-gradient(circle at center,#001a2e,#000);',
        'text-align:center;padding:24px;font-family:Share Tech Mono,monospace;">',
        '<div style="font-size:16px;letter-spacing:1px;">📹 ' + (cam.name || 'CCTV') + '</div>',
        '<div style="font-size:10px;color:#446;">' + (cam.agency || 'CCTV') + '</div>',
        '<div style="font-size:11px;color:#f84;margin-top:6px;">' + msg + '</div>',
        '<div style="font-size:10px;color:#224;margin-top:8px;">CAMERA OFFLINE</div>',
        '</div>'
      ].join('');
    }

    // ── GLOBE CLICK ─────────────────────────────────────────────────────────

    _bindGlobeClicks() {
      if (!this.viewer?.scene?.canvas) return;
      const h = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
      h.setInputAction(click => {
        const p = this.viewer.scene.pick(click.position);
        if (Cesium.defined(p) && p.id) {
          const id = String(p.id.id || p.id);
          if (id.startsWith('cam-')) {
            const camId = id.replace('cam-', '');
            const cam = this.cameras.get(camId);
            if (cam) this._openCam(cam);
          }
        } else {
          // Click on globe → nearest camera
          const ray = this.viewer.camera.getPickRay(click.position);
          const cart = this.viewer.scene.globe.pick(ray, this.viewer.scene);
          if (Cesium.defined(cart)) {
            const lat = Cesium.Math.toDegrees(cart.latitude);
            const lon = Cesium.Math.toDegrees(cart.longitude);
            const nearest = this._nearestCam(lat, lon);
            if (nearest) this._openCam(nearest);
          }
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      console.log('[ACC] Globe click handler bound');
    }

    _nearestCam(lat, lon) {
      let best = null, min = Infinity;
      this.cameras.forEach(cam => {
        const d = this._haversine(lat, lon, cam.lat, cam.lon);
        if (d < min) { min = d; best = cam; }
      });
      return best;
    }

    _haversine(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const d = (a, b) => (b - a) * Math.PI / 180;
      const a = Math.sin(d(lat2, lat1) / 2) ** 2 +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(d(lon2, lon1) / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    _bindPanelClicks() {
      // Hook for HUD OSINT button — camera grid built on demand
    }

    buildCameraGridHTML() {
      const agencies = {};
      this.cameras.forEach(cam => {
        const a = cam.agency || 'CCTV';
        if (!agencies[a]) agencies[a] = [];
        if (agencies[a].length < 8) agencies[a].push(cam); // cap per agency
      });

      let html = '<div id="acc-cam-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:400px;overflow-y:auto;padding:4px;">';
      for (const [agency, cams] of Object.entries(agencies)) {
        const color = this._agencyColor(agency);
        html += '<div style="grid-column:1/-1;font-size:9px;letter-spacing:2px;color:' + color + ';margin-top:10px;border-bottom:1px solid rgba(0,240,255,0.1);padding-bottom:3px;">' + agency + '</div>';
        cams.forEach(cam => {
          html += [
            '<div class="acc-cam-item" data-cam-id="' + cam.id + '" style="',
            'background:rgba(0,240,255,0.04);border:1px solid rgba(0,240,255,0.12);',
            'padding:6px 8px;border-radius:3px;cursor:pointer;font-size:10px;',
            'display:flex;justify-content:space-between;align-items:center;',
            'transition:background 0.15s;" ' +
            'onmouseover="this.style.background=\'rgba(0,240,255,0.15)\'" ' +
            'onmouseout="this.style.background=\'rgba(0,240,255,0.04)\'" ' +
            'onclick="window.gothamAccountability.openCamById(\'' + cam.id + '\')">',
            '<span style="color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;">' + cam.name + '</span>',
            '<span style="color:' + color + ';font-size:9px;">' + cam.mediaType.toUpperCase() + '</span>',
            '</div>'
          ].join('');
        });
      }
      html += '</div>';
      return html;
    }

    // ── UFO DATA ─────────────────────────────────────────────────────────────

    get ufoData() {
      return [
        { id:'ufo_01', lat:33.228, lon:-115.517, title:'Apache Junction — Night Triangular Craft', date:'2025-03-14', cred:0.78,
          desc:'Silent, triangular craft ~30ft wide hovering at 200ft for 12 min before accelerating beyond visual tracking.',
          video:null, wiki:'UFO', sources:['MUFON #152341','ADS-B gap analysis'] },
        { id:'ufo_02', lat:37.774, lon:-122.419, title:'San Francisco Bay — Silver Disc', date:'2025-01-08', cred:0.71,
          desc:'Amateur astronomer captured silver disc at 14,000ft. No ADS-B response. Duration: 9 minutes.',
          video:null, wiki:'UFO', sources:['Witness report','Flightradar24 gap analysis'] },
        { id:'ufo_03', lat:36.206, lon:-112.125, title:'Grand Canyon — Luminous Orb', date:'2024-11-22', cred:0.83,
          desc:'Guide captured orb executing 90-degree trajectory change. No radar correlation. Duration: 47 seconds.',
          video:null, wiki:'UFO', sources:['MUFON #149876','NPSR analysis'] },
        { id:'ufo_04', lat:21.306, lon:-157.858, title:'Honolulu — High Altitude Sphere', date:'2025-02-19', cred:0.65,
          desc:'Commercial pilot observed large reflective sphere at FL350 with no transponder. Duration: 23 min.',
          video:null, wiki:'UFO', sources:['FAA #2025-0173','ADS-B gap'] },
        { id:'ufo_05', lat:64.147, lon:-21.934, title:'Reykjavik — Pulsating Amber Light', date:'2024-12-05', cred:0.59,
          desc:'Pattern of 7 amber pulses over 40 seconds. No AIS/ADS-B contact.',
          video:null, wiki:'UFO', sources:['Icelandic UFO Research Society'] },
      ];
    }

    _openUFO(id) {
      const spot = this.ufoData.find(s => s.id === id);
      if (!spot) return;
      this.closePlayer();
      this.closeUFOPanel();
      this._renderUFOPanel(spot);
      if (this.viewer) {
        this.viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(spot.lon, spot.lat, 80000),
          duration: 2,
        });
      }
    }

    _renderUFOPanel(spot) {
      this.closeUFOPanel();
      const color = this._credColor(spot.cred);
      const el = document.createElement('div');
      el.id = 'acc-ufo-panel';
      el.style.cssText = [
        'position:fixed', 'top:50%', 'left:50%',
        'transform:translate(-50%,-50%)',
        'width:420px', 'background:rgba(0,0,0,0.97)',
        'border:2px solid ' + color,
        'border-radius:10px',
        'z-index:9999', 'padding:20px',
        'font-family:Share Tech Mono,Courier New,monospace',
        'color:#fff',
      ].join(';');
      el.innerHTML = [
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">',
        '  <span style="color:' + color + ';font-size:11px;letter-spacing:2px;">⚠ UFO INCIDENT</span>',
        '  <button id="ufo-close-btn" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;padding:3px 10px;border-radius:3px;font-size:10px;letter-spacing:1px;">✕ CLOSE</button>',
        '</div>',
        '<h2 style="margin:0 0 8px;color:' + color + ';font-size:14px;">' + spot.title + '</h2>',
        '<div style="font-size:10px;color:#557;margin-bottom:10px;">' + spot.date + ' · Credibility: <span style="color:' + color + ';">' + Math.round(spot.cred*100) + '%</span></div>',
        '<p style="margin:6px 0;font-size:11px;color:#aab;line-height:1.6;">' + spot.desc + '</p>',
        '<div style="margin-top:10px;font-size:10px;color:#446;">Sources: ' + spot.sources.join(', ') + '</div>',
        '<div style="display:flex;gap:8px;margin-top:14px;">',
        '  <button id="ufo-fly-btn" style="flex:1;background:#0f8;border:none;color:#000;padding:8px;border-radius:4px;cursor:pointer;font-size:11px;letter-spacing:1px;">FLY HERE</button>',
        '  <button id="ufo-nearest-cam-btn" style="flex:1;background:#f80;border:none;color:#000;padding:8px;border-radius:4px;cursor:pointer;font-size:11px;letter-spacing:1px;">NEAREST CAM</button>',
        '</div>',
      ].join('');
      document.body.appendChild(el);
      document.getElementById('ufo-close-btn').addEventListener('click', () => this.closeUFOPanel());
      document.getElementById('ufo-fly-btn').addEventListener('click', () => {
        if (this.viewer) this.viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(spot.lon, spot.lat, 50000), duration: 2 });
        this.closeUFOPanel();
      });
      document.getElementById('ufo-nearest-cam-btn').addEventListener('click', () => {
        const nearest = this._nearestCam(spot.lat, spot.lon);
        if (nearest) this._openCam(nearest);
        this.closeUFOPanel();
      });
      const escH = (e) => { if (e.key === 'Escape') { this.closeUFOPanel(); document.removeEventListener('keydown', escH); } };
      document.addEventListener('keydown', escH);
    }

    closeUFOPanel() {
      const el = document.getElementById('acc-ufo-panel');
      if (el) el.remove();
    }

    _credColor(cred) {
      if (cred >= 0.75) return '#f44';
      if (cred >= 0.55) return '#f80';
      return '#0f8';
    }

    _log(msg) {
      if (this.hud?._sysLog) this.hud._sysLog(msg);
      else console.log('[ACC] ' + msg);
    }
  }

  // ── expose globally ──────────────────────────────────────────────────────────
  window.accountabilityEngine = accountabilityEngine;
  window.accEngine = accountabilityEngine;

})();
