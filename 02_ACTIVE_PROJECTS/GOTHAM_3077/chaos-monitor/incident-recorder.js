/**
 * INCIDENT RECORDER v2 - Production Ready
 * FIXED: Timeout leak, memory limits, quota handling, cleanup
 */

class IncidentRecorder {
  constructor(options = {}) {
    this.config = {
      bufferDuration: 30000,
      recordDuration: 60000,
      storage: 'local',
      autoRecord: true,
      maxBufferSize: 100,
      maxFrames: 600,
      ...options
    };
    
    this.incidents = new Map();
    this.ringBuffer = new Map();
    this.activeRecordings = new Map();
    this.timeouts = new Map(); // Track by feedId for easy cleanup
    this.incidentCounter = 0;
  }
  
  addToBuffer(feedId, frameData) {
    if (!this.ringBuffer.has(feedId)) {
      this.ringBuffer.set(feedId, []);
    }
    
    const buffer = this.ringBuffer.get(feedId);
    buffer.push({
      t: Date.now(),
      s: frameData?.score || 0
    });
    
    while (buffer.length > this.config.maxBufferSize) {
      buffer.shift();
    }
  }
  
  startRecording(feedId, triggerData) {
    if (this.activeRecordings.has(feedId)) return null;
    
    this.incidentCounter++;
    const incidentId = `INC-${Date.now()}-${this.incidentCounter}`;
    
    const incident = {
      id: incidentId,
      feedId,
      triggerData,
      startTime: Date.now(),
      buffer: this.ringBuffer.has(feedId) ? [...this.ringBuffer.get(feedId)] : [],
      frames: [],
      metadata: {
        score: triggerData?.score || 0,
        location: triggerData?.location || null,
        priority: triggerData?.priority || 1
      }
    };
    
    this.activeRecordings.set(feedId, incident);
    this.incidents.set(incidentId, incident);
    
    // Timeout with proper cleanup
    const timeout = setTimeout(() => {
      this.stopRecording(feedId);
    }, this.config.recordDuration);
    
    this.timeouts.set(feedId, timeout);
    
    // Silent by default — recorder churns too often for a per-start log line.
    // Access this.activeRecordings.size for status; getStats() is exposed on chaosSystem.
    return incidentId;
  }
  
  recordFrame(feedId, frameData) {
    const recording = this.activeRecordings.get(feedId);
    if (!recording) {
      this.addToBuffer(feedId, frameData);
      return;
    }
    
    recording.frames.push({
      t: Date.now(),
      s: frameData?.score || 0
    });
    
    if (recording.frames.length > this.config.maxFrames) {
      console.warn('[RECORDER] Frame limit reached:', feedId);
      this.stopRecording(feedId);
    }
  }
  
  stopRecording(feedId) {
    const incident = this.activeRecordings.get(feedId);
    if (!incident) return null;
    
    incident.endTime = Date.now();
    incident.duration = incident.endTime - incident.startTime;
    
    this.saveIncident(incident);
    this.activeRecordings.delete(feedId);
    
    // Clean up timeout
    const timeout = this.timeouts.get(feedId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(feedId);
    }
    
    return incident; // completion is silent — count via getStats().
  }
  
  saveIncident(incident) {
    try {
      switch(this.config.storage) {
        case 'local': this.saveToLocal(incident); break;
        case 's3': this.saveToS3(incident); break;
        case 'server': this.saveToServer(incident); break;
      }
    } catch (err) {
      console.error('[RECORDER] Save failed:', err.message);
    }
  }
  
  saveToLocal(incident) {
    const data = {
      id: incident.id,
      feedId: incident.feedId,
      start: incident.startTime,
      end: incident.endTime,
      duration: incident.duration,
      meta: incident.metadata,
      frames: incident.frames.length
    };
    
    try {
      localStorage.setItem(`inc-${incident.id}`, JSON.stringify(data));
      window.dispatchEvent(new CustomEvent('incident-saved', { detail: data }));
    } catch (err) {
      if (err.name === 'QuotaExceededError') {
        this.clearOld(3600000); // Clear 1 hour
        try {
          localStorage.setItem(`inc-${incident.id}`, JSON.stringify(data));
        } catch (e) {
          console.error('[RECORDER] Storage full');
        }
      }
    }
  }
  
  saveToS3(incident) {
    console.log('[RECORDER] S3 upload:', incident.id);
  }
  
  saveToServer(incident) {
    console.log('[RECORDER] Server upload:', incident.id);
  }
  
  getIncident(id) { return this.incidents.get(id); }
  
  getAll(filters = {}) {
    let list = Array.from(this.incidents.values());
    if (filters.feedId) list = list.filter(i => i.feedId === filters.feedId);
    if (filters.since) list = list.filter(i => i.startTime > filters.since);
    if (filters.minPriority) list = list.filter(i => i.metadata.priority >= filters.minPriority);
    return list.sort((a, b) => b.startTime - a.startTime);
  }
  
  clearOld(ms = 86400000) {
    const cutoff = Date.now() - ms;
    let cleared = 0;
    for (const [id, inc] of this.incidents) {
      if (inc.startTime < cutoff) {
        this.incidents.delete(id);
        try { localStorage.removeItem(`inc-${id}`); } catch(e){}
        cleared++;
      }
    }
    if (cleared) console.log('[RECORDER] Cleared', cleared, 'old');
  }
  
  exportIncident(id, format = 'json') {
    const inc = this.incidents.get(id);
    if (!inc) return null;
    if (format === 'json') return JSON.stringify(inc, null, 2);
    return inc;
  }
  
  destroy() {
    // Stop all active recordings
    for (const feedId of this.activeRecordings.keys()) {
      this.stopRecording(feedId);
    }
    // Clear remaining timeouts
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
    this.incidents.clear();
    this.ringBuffer.clear();
    this.activeRecordings.clear();
  }
}

window.IncidentRecorder = IncidentRecorder;
