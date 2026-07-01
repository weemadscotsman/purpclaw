/**
 * CHAOS SYSTEM v2 - Production Bootstrap
 * FIXED: UI init, memory leaks, performance, proper integration
 */

(function() {
  'use strict';
  
  let system = null;
  
  function init() {
    if (system) {
      console.warn('[CHAOS] Already initialized');
      return;
    }
    
    console.log('[CHAOS] Initializing v2...');
    
    // Validate deps
    const deps = ['ScalableFeedManager', 'AlertDispatcher', 'IncidentRecorder', 'ChaosMonitor'];
    for (const dep of deps) {
      if (typeof window[dep] === 'undefined') {
        console.error('[CHAOS] Missing dependency:', dep);
        return;
      }
    }
    
    // Config
    const CONFIG = {
      feeds: [
        { id: 'border-01', name: 'Border Sector 1', priority: 5, geo: { lat: 49.0, lon: -122.0 } },
        { id: 'border-02', name: 'Border Sector 2', priority: 5, geo: { lat: 49.1, lon: -122.1 } },
        { id: 'transit-main', name: 'Transit Hub Main', priority: 4, geo: { lat: 51.5, lon: -0.1 } },
        { id: 'transit-north', name: 'Transit Hub North', priority: 3, geo: { lat: 51.51, lon: -0.09 } },
        { id: 'downtown-01', name: 'Downtown Cam 1', priority: 3, geo: { lat: 40.7, lon: -74.0 } },
        { id: 'downtown-02', name: 'Downtown Cam 2', priority: 3, geo: { lat: 40.71, lon: -74.01 } }
      ],
      thresholds: { alert: 82, record: 88 },  // raised — was 70/80, too noisy
      globalRate: { maxPerMinute: 6 },        // hard cap across ALL feeds combined
      intervals: { update: 1000, cleanup: 3600000 }
    };
    
    try {
      // 1. Initialize Feed Manager
      const feedManager = new ScalableFeedManager({
        maxFeeds: 500,
        workers: 4,
        batchSize: 10,
        analysisInterval: 500,
        adaptiveSampling: true
      });
      
      // 2. Initialize Alert Dispatcher
      const alertDispatcher = new AlertDispatcher({
        websocket: true,
        sms: false,
        push: false,
        radio: false
      });
      
      // 3. Initialize Incident Recorder
      const incidentRecorder = new IncidentRecorder({
        bufferDuration: 30000,
        recordDuration: 60000,
        storage: 'local',
        autoRecord: true,
        maxBufferSize: 100,
        maxFrames: 600
      });
      
      // 4. Initialize Chaos Monitor (properly)
      const chaosMonitor = new ChaosMonitor(CONFIG.feeds, {
        threshold: CONFIG.thresholds.alert,
        hysteresis: 10,
        minSwitchInterval: 3000
      });
      
      // 5. Initialize Cesium Overlay UI (auto-hiding panels)
      let chaosUI = null;
      if (window.ChaosCesiumOverlay) {
        chaosUI = new ChaosCesiumOverlay();
        chaosUI.init();
        window.chaosOverlay = chaosUI;
      } else {
        console.warn('[CHAOS] ChaosCesiumOverlay not found, UI disabled');
      }
      
      // 6. Bulk add feeds to manager
      feedManager.bulkAdd(CONFIG.feeds);
      feedManager.start();
      
      // 7. Start chaos monitor
      chaosMonitor.start();
      alertDispatcher.start();
      
      // 8. Sync feedManager scores to chaosMonitor (single source of truth)
      const syncInterval = setInterval(() => {
        feedManager.feeds.forEach((feed, id) => {
          chaosMonitor.scores.set(id, feed.score);
        });
        
        // Dispatch feed update event for Cesium overlay
        const feedsArray = Array.from(feedManager.feeds.values()).map(f => ({
          id: f.id,
          name: f.name,
          score: f.score,
          location: f.geo ? `${f.geo.lat.toFixed(2)}, ${f.geo.lon.toFixed(2)}` : 'Unknown',
          active: f.id === chaosMonitor.activeFeed?.id
        }));
        
        window.dispatchEvent(new CustomEvent('chaos-feed-update', {
          detail: {
            feeds: feedsArray,
            name: chaosMonitor.activeFeed?.name || 'None',
            score: chaosMonitor.currentScore || 0
          }
        }));
        
        // Dispatch score change event
        window.dispatchEvent(new CustomEvent('chaos-score-change', {
          detail: { score: chaosMonitor.currentScore || 0 }
        }));
      }, 500);
      
      // 9. Handle switch events
      const feedCooldown = new Map(); // Track per-feed alert cooldown
      const FEED_COOLDOWN_MS = 180000; // 3 min between alerts from same feed (was 60s — too noisy)
      const globalBucket = { start: 0, count: 0 }; // rolling 60s window
      
      window.addEventListener('chaos-switch', (e) => {
        const { feed, score, detected } = e.detail;
        
        // Check per-feed cooldown
        const lastAlert = feedCooldown.get(feed.id);
        const now = Date.now();
        if (lastAlert && now - lastAlert < FEED_COOLDOWN_MS) {
          return; // Still in cooldown, skip alert
        }
        
        // Dispatch alert via dispatcher
        if (score > CONFIG.thresholds.alert) {
          // Global rate limit: reset every 60s, cap at CONFIG.globalRate.maxPerMinute
          if (now - globalBucket.start > 60000) { globalBucket.start = now; globalBucket.count = 0; }
          if (globalBucket.count >= CONFIG.globalRate.maxPerMinute) {
            return; // Over the global cap — drop this cycle's alerts entirely
          }
          globalBucket.count += 1;

          feedCooldown.set(feed.id, now); // Record alert time

          const alertData = {
            feed: { id: feed.id, name: feed.name, geo: feed.geo },
            score,
            detected,
            location: feed.geo,
            timestamp: now
          };
          alertDispatcher.dispatch(alertData);

          // Dispatch UI alert event for Cesium overlay
          window.dispatchEvent(new CustomEvent('chaos-alert-dispatched', {
            detail: {
              type: 'FIELD ALERT',
              severity: score > 90 ? 'critical' : score > 82 ? 'warning' : 'info',
              message: `Unrest detected at ${feed.name} (Score: ${score.toFixed(1)})`,
              location: feed.geo ? `${feed.geo.lat.toFixed(2)}, ${feed.geo.lon.toFixed(2)}` : 'Unknown',
              timestamp: now
            }
          }));
        }
        
        // Start recording
        if (score > CONFIG.thresholds.record) {
          incidentRecorder.startRecording(feed.id, { score, location: feed.geo });
        }
      });
      
      // 10. Time-based buffer adds
      const bufferInterval = setInterval(() => {
        CONFIG.feeds.forEach(feed => {
          const feedData = feedManager.feeds.get(feed.id);
          if (feedData) {
            incidentRecorder.addToBuffer(feed.id, { score: feedData.score });
          }
        });
      }, 500);
      
      // 11. Record frames for active recordings
      const recordInterval = setInterval(() => {
        incidentRecorder.activeRecordings.forEach((incident, feedId) => {
          const feed = feedManager.feeds.get(feedId);
          if (feed) {
            incidentRecorder.recordFrame(feedId, { score: feed.score });
          }
        });
      }, 100); // 10fps for recordings
      
      // 12. Register units
      alertDispatcher.registerUnit('UNIT-001', { type: 'patrol', callsign: 'Alpha-1' });
      alertDispatcher.registerUnit('UNIT-002', { type: 'command', callsign: 'Command' });
      
      // 13. Cleanup interval
      const cleanupInterval = setInterval(() => {
        incidentRecorder.clearOld(86400000);
        alertDispatcher.clearOldHistory(86400000);
      }, CONFIG.intervals.cleanup);
      
      // Store system
      system = {
        feedManager,
        alertDispatcher,
        incidentRecorder,
        chaosMonitor,
        chaosUI,
        intervals: [syncInterval, bufferInterval, recordInterval, cleanupInterval],
        
        destroy() {
          this.intervals.forEach(clearInterval);
          feedManager.stop();
          feedManager.destroy();
          chaosMonitor.stop();
          chaosMonitor.destroy();
          alertDispatcher.stop();
          alertDispatcher.destroy();
          incidentRecorder.destroy();
          if (chaosUI && chaosUI.destroy) chaosUI.destroy();
          console.log('[CHAOS] System destroyed');
        },
        
        getStats() {
          return {
            feeds: feedManager.feeds.size,
            active: chaosMonitor.activeFeed?.id || null,
            units: alertDispatcher.units.size,
            incidents: incidentRecorder.incidents.size,
            recording: incidentRecorder.activeRecordings.size
          };
        }
      };
      
      window.chaosSystem = system;
      
      console.log('[CHAOS] v2 Active - Feeds:', CONFIG.feeds.length);
      console.log('[CHAOS] Commands: chaosSystem.getStats(), chaosSystem.destroy()');
      
    } catch (err) {
      console.error('[CHAOS] Init failed:', err);
    }
  }
  
  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
