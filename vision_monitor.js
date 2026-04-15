/**
 * PURPCLAW Vision Monitor Service v3
 * Node.js wrapper for continuous webcam monitoring
 * Uses Python/OpenCV for capture, YOLO service for detection
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 7781;
const WATCH_INTERVAL_MS = 500;  // 2 FPS continuous monitoring
const CAM_INDEX = 0;

// Neuro-Symbolic Bridge integration
const BRIDGE_HOST = '127.0.0.1';
const BRIDGE_PORT = 7784;
const BRIDGE_LIFT_ENTITY = '/lift/entity';
const BRIDGE_LIFT_PATTERN = '/lift/pattern';

class VisionMonitor {
  constructor() {
    this.running = false;
    this.monitorTimer = null;
    this.lastFrameHash = '';
    this.motionEvents = [];
    this.sceneChanges = [];
    this.trackedObjects = new Map();
    this.alertCallbacks = [];
    this.frameCount = 0;
    this.startTime = Date.now();
    this.bridgeConnected = false;
    this.bridgeLastSuccess = 0;
    this.bridgeFailureCount = 0;
    this.liftedEntities = new Set();  // dedup: prevent lifting same entity type repeatedly
    this._initBridgeHealth();
    this._registerBridgeAlerts();  // wire vision events to neuro-symbolic bridge
  }

  // ===== NEURO-SYMBOLIC BRIDGE INTEGRATION =====
  _initBridgeHealth() {
    // Check bridge health every 30 seconds
    this._bridgeHealthTimer = setInterval(() => {
      this._checkBridgeHealth();
    }, 30000);
    this._checkBridgeHealth();
  }

  async _checkBridgeHealth() {
    try {
      const ok = await this._bridgeRequest('GET', '/health', null);
      this.bridgeConnected = ok && ok.status === 'healthy';
      if (this.bridgeConnected) this.bridgeFailureCount = 0;
    } catch (e) {
      this.bridgeConnected = false;
    }
  }

  async _bridgeRequest(method, path, data) {
    return new Promise((resolve) => {
      const postData = data ? Buffer.from(JSON.stringify(data)) : null;
      const reqOptions = {
        hostname: BRIDGE_HOST,
        port: BRIDGE_PORT,
        path: path,
        method: method,
        headers: {}
      };
      if (postData) {
        reqOptions.headers['Content-Type'] = 'application/json';
        reqOptions.headers['Content-Length'] = postData.length;
      }
      const req = http.request(reqOptions, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(2000, () => { req.destroy(); resolve(null); });
      if (postData) req.write(postData);
      req.end();
    });
  }

  async _liftEntityToBridge(objType, confidence, position) {
    // Deduplicate: only lift a given object class once per 10-second window
    const now = Date.now();
    const dedupKey = `${objType}_${Math.floor(now / 10000)}`;
    if (this.liftedEntities.has(dedupKey)) return;
    this.liftedEntities.add(dedupKey);
    // Prune old dedup keys
    for (const k of this.liftedEntities) {
      const age = now - parseInt(k.split('_')[1]) * 10000;
      if (age > 30000) this.liftedEntities.delete(k);
    }

    // bridge expects: entity_type, entity_text, confidence, source, metadata
    const payload = {
      entity_type: objType,
      entity_text: `pos_${Math.round(position[0])}_${Math.round(position[1])}`,
      confidence: confidence,
      source: 'vision_monitor',
      metadata: {
        frame_time: now,
        grid_x: Math.floor(position[0] / 60),
        grid_y: Math.floor(position[1] / 60)
      }
    };
    try {
      const result = await this._bridgeRequest('POST', BRIDGE_LIFT_ENTITY, payload);
      if (result && result.success) {
        this.bridgeLastSuccess = now;
      }
    } catch (e) {
      // Silently ignore bridge errors - vision continues independently
    }
  }

  async _liftPatternToBridge(event, trackedObjects) {
    const now = Date.now();
    const uniqueTypes = event.types || [];
    // bridge expects: pattern_name, confidence, source, subject, context, metadata
    const payload = {
      pattern_name: uniqueTypes.length > 0 ? uniqueTypes.join('+') : 'empty_scene',
      confidence: event.count > 0 ? 0.9 : 0.3,
      source: 'vision_monitor',
      subject: 'vision_monitor',
      context: `objects:${event.count} tracked:${event.tracked} scene_change:${event.sceneChange || false}`,
      metadata: {
        frame_time: now,
        object_count: event.count,
        tracked_count: event.tracked,
        scene_change: event.sceneChange || false,
        top_objects: uniqueTypes.slice(0, 5)
      }
    };
    try {
      await this._bridgeRequest('POST', BRIDGE_LIFT_PATTERN, payload);
    } catch (e) {
      // Silently ignore
    }
  }

  _registerBridgeAlerts() {
    // Hook alert callbacks to lift data to neuro-symbolic bridge
    this.onAlert((event, trackedEntries) => {
      // Lift each detected object type to bridge
      const seenTypes = new Set();
      for (const [key, track] of trackedEntries) {
        if (!seenTypes.has(track.class)) {
          seenTypes.add(track.class);
          const lastPos = track.positions[track.positions.length - 1];
          this._liftEntityToBridge(track.class, track.confidence, lastPos.center);
        }
      }
      // Lift scene pattern to bridge
      this._liftPatternToBridge(event, trackedEntries);
    });
  }

  getBridgeStatus() {
    return {
      connected: this.bridgeConnected,
      lastSuccess: this.bridgeLastSuccess,
      failureCount: this.bridgeFailureCount,
      liftedEntities: this.liftedEntities.size
    };
  }

  stop() {
    this.running = false;
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
    if (this._bridgeHealthTimer) {
      clearInterval(this._bridgeHealthTimer);
      this._bridgeHealthTimer = null;
    }
    console.log('[VISION] Monitor stopped');
  }

  async captureFrame() {
    return new Promise((resolve) => {
      const ts = Date.now();
      const tmpPath = `C:/Users/Admin/AppData/Local/Temp/vision_${ts}.jpg`;

      const pyScript = `
import cv2, base64, json, sys, os

cam_idx = ${CAM_INDEX}
cap = cv2.VideoCapture(cam_idx, cv2.CAP_DSHOW)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
if not cap.isOpened():
    cap = cv2.VideoCapture(cam_idx, cv2.CAP_MSMF)
if not cap.isOpened():
    print(json.dumps({"error": "Cannot open camera"}))
    sys.exit(1)

for _ in range(3):
    cap.read()
ret, frame = cap.read()
cap.release()

if not ret or frame is None:
    print(json.dumps({"error": "No frame captured"}))
    sys.exit(1)

# Save small image for faster processing
small = cv2.resize(frame, (320, 240))
out_path = r"${tmpPath.replace(/\\/g, '\\\\')}"
cv2.imwrite(out_path, small)

# Compute hash from grayscale
gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
hash_val = hash(gray.tobytes()) & 0xFFFFFFFF

# Encode full frame as base64
_, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
b64 = base64.b64encode(buf).decode('ascii')

print(json.dumps({
    "frame_b64": b64,
    "gray_hash": str(hash_val),
    "timestamp": ${ts / 1000},
    "frame_num": ${this.frameCount}
}))
`;

      const tmpPy = path.join(process.env.TEMP || 'C:/Users/Admin/AppData/Local/Temp', `vision_cap_${ts}.py`);
      fs.writeFileSync(tmpPy, pyScript, 'utf8');

      const child = spawn('py', ['-3.11', tmpPy], { timeout: 15000 });
      let stdout = '', stderr = '';
      child.stdout.on('data', d => stdout += d);
      child.stderr.on('data', d => stderr += d);

      child.on('close', () => {
        try { fs.unlinkSync(tmpPy); } catch (e) {}
        try {
          const lines = stdout.trim().split('\n');
          const data = JSON.parse(lines[lines.length - 1]);
          if (data.error) {
            resolve(data);
          } else {
            // Clean up temp image
            try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (e) {}
            resolve(data);
          }
        } catch (e) {
          try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (e) {}
          resolve({ error: stderr || 'Parse failed' });
        }
      });

      child.on('error', () => {
        try { fs.unlinkSync(tmpPy); } catch (e) {}
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (e) {}
        resolve({ error: 'Process failed' });
      });
    });
  }

  async detectObjects(frameB64) {
    return new Promise((resolve) => {
      const body = JSON.stringify({ image: frameB64, confidence: 0.35 });
      const postData = Buffer.from(body);

      const req = http.request({
        hostname: '127.0.0.1',
        port: 7779,
        path: '/detect',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': postData.length
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { resolve({ success: false, error: 'Parse error' }); }
        });
      });

      req.on('error', () => resolve({ success: false, error: 'Connection failed' }));
      req.write(postData);
      req.end();
    });
  }

  updateTrackedObjects(detections) {
    const now = Date.now();
    const seen = new Set();

    for (const obj of detections) {
      // Grid-based object key for tracking
      const gridX = Math.floor(obj.center[0] / 60);
      const gridY = Math.floor(obj.center[1] / 60);
      const key = `${obj.class}_${gridX}_${gridY}`;
      seen.add(key);

      if (this.trackedObjects.has(key)) {
        const track = this.trackedObjects.get(key);
        track.lastSeen = now;
        track.confidence = obj.conf;
        track.positions.push({ center: obj.center, time: now });
        if (track.positions.length > 20) track.positions.shift();
      } else {
        this.trackedObjects.set(key, {
          class: obj.class,
          firstSeen: now,
          lastSeen: now,
          confidence: obj.conf,
          positions: [{ center: obj.center, time: now }]
        });
      }
    }

    // Age out stale tracks (5 seconds)
    for (const [key, track] of this.trackedObjects) {
      if (now - track.lastSeen > 5000) {
        this.trackedObjects.delete(key);
      }
    }
  }

  async monitorCycle() {
    if (!this.running) return;

    try {
      const frame = await this.captureFrame();
      if (frame.error) return;

      // Scene change detection
      const isSceneChange = frame.gray_hash !== this.lastFrameHash && this.lastFrameHash !== '';
      if (isSceneChange) {
        this.sceneChanges.push({ time: Date.now(), hash: frame.gray_hash });
        if (this.sceneChanges.length > 100) this.sceneChanges.shift();
      }
      this.lastFrameHash = frame.gray_hash;

      // Object detection via YOLO service
      const detections = await this.detectObjects(frame.frame_b64);

      if (detections.success && detections.count > 0) {
        this.updateTrackedObjects(detections.objects);

        const event = {
          time: Date.now(),
          count: detections.count,
          types: [...new Set(detections.objects.map(o => o.class))],
          tracked: this.trackedObjects.size,
          sceneChange: isSceneChange
        };

        this.motionEvents.push(event);
        if (this.motionEvents.length > 200) this.motionEvents.shift();

        // Fire alert callbacks
        for (const cb of this.alertCallbacks) {
          try { cb(event, Array.from(this.trackedObjects.entries())); } catch (e) {}
        }
      }
    } catch (e) {
      console.log(`[VISION] Cycle error: ${e.message}`);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startTime = Date.now();
    this.monitorTimer = setInterval(() => this.monitorCycle(), WATCH_INTERVAL_MS);
    console.log('[VISION] Monitor started at 2 FPS');
  }

  onAlert(callback) {
    this.alertCallbacks.push(callback);
  }

  getStatus() {
    return {
      running: this.running,
      uptime_ms: Date.now() - this.startTime,
      fps: Math.round(1000 / WATCH_INTERVAL_MS),
      trackedObjects: this.trackedObjects.size,
      motionEvents: this.motionEvents.length,
      sceneChanges: this.sceneChanges.length,
      totalFrames: this.frameCount,
      bridgeConnected: this.bridgeConnected
    };
  }

  getTrackedObjects() {
    return Array.from(this.trackedObjects.entries()).map(([id, data]) => ({ id, ...data }));
  }

  getRecentEvents(n = 20) {
    return this.motionEvents.slice(-n);
  }
}

// ===== HTTP SERVER =====
const monitor = new VisionMonitor();

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  try {
    switch (pathname) {
      case '/start':
        monitor.start();
        sendJson(res, { success: true, status: monitor.getStatus() });
        break;
      case '/stop':
        monitor.stop();
        sendJson(res, { success: true });
        break;
      case '/status':
        sendJson(res, monitor.getStatus());
        break;
      case '/tracked':
        sendJson(res, { objects: monitor.getTrackedObjects() });
        break;
      case '/events': {
        const n = parseInt(url.searchParams.get('n') || '20');
        sendJson(res, { events: monitor.getRecentEvents(n) });
        break;
      }
      case '/snapshot': {
        monitor.captureFrame().then(frame => {
          if (frame.error) sendJson(res, { error: frame.error }, 500);
          else sendJson(res, { success: true, timestamp: frame.timestamp, hash: frame.gray_hash });
        });
        break;
      }
      case '/health':
        sendJson(res, { ok: true, port: PORT, ...monitor.getStatus() });
        break;
      case '/bridge':
        sendJson(res, { ok: true, ...monitor.getBridgeStatus() });
        break;
      default:
        sendJson(res, { error: 'Not found' }, 404);
    }
  } catch (e) {
    sendJson(res, { error: e.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`[VISION] Monitor running on port ${PORT}`);
  console.log('[VISION] Endpoints: /start /stop /status /tracked /events /snapshot /health');
  monitor.start();
});

process.on('SIGINT', () => {
  monitor.stop();
  server.close();
  process.exit(0);
});

module.exports = { VisionMonitor };