/**
 * ALERT DISPATCHER v2 - Production Ready
 * FIXED: ID collision, dead code, missing methods, cleanup
 */

class AlertDispatcher {
  constructor(options = {}) {
    this.config = {
      websocket: true,
      sms: false,
      push: false,
      radio: false,
      ...options
    };
    
    this.units = new Map();
    this.history = [];
    this.idCounter = 0;
    this.isRunning = false;
    
    // Deduplication tracking
    this.recentAlerts = new Map(); // Track recent alerts by feed ID
    this.dedupeWindow = 60000; // 60 seconds
  }
  
  start() {
    this.isRunning = true;
    console.log('[ALERT] Dispatcher started');
  }
  
  stop() {
    this.isRunning = false;
    console.log('[ALERT] Dispatcher stopped');
  }
  
  registerUnit(id, metadata) {
    if (!id || typeof id !== 'string') {
      console.error('[ALERT] Unit ID must be string');
      return false;
    }
    
    this.units.set(id, {
      id,
      ...metadata,
      registeredAt: Date.now(),
      lastSeen: Date.now(),
      status: 'active'
    });
    
    console.log('[ALERT] Unit registered:', id);
    return true;
  }
  
  unregisterUnit(id) {
    if (this.units.delete(id)) {
      console.log('[ALERT] Unit unregistered:', id);
      return true;
    }
    return false;
  }
  
  updateUnitStatus(id, status) {
    const unit = this.units.get(id);
    if (unit) {
      unit.status = status;
      unit.lastSeen = Date.now();
    }
  }
  
  dispatch(alert) {
    if (!this.isRunning) {
      console.warn('[ALERT] Dispatcher not running');
      return null;
    }
    
    if (!alert || !alert.feed) {
      console.error('[ALERT] Invalid alert');
      return null;
    }
    
    // Deduplication check - skip if same feed alerted recently
    const feedKey = alert.feed.id;
    const lastDispatch = this.recentAlerts.get(feedKey);
    const now = Date.now();
    if (lastDispatch && now - lastDispatch < this.dedupeWindow) {
      return null; // Duplicate within window, skip
    }
    
    // Clean up old entries occasionally
    if (this.recentAlerts.size > 100) {
      for (const [key, time] of this.recentAlerts) {
        if (now - time > this.dedupeWindow) {
          this.recentAlerts.delete(key);
        }
      }
    }
    
    this.recentAlerts.set(feedKey, now);
    this.idCounter++;
    const enriched = {
      ...alert,
      alertId: `ALERT-${Date.now().toString(36)}-${this.idCounter}`,
      priority: this.calcPriority(alert),
      timestamp: new Date().toISOString()
    };
    
    this.history.push(enriched);
    if (this.history.length > 1000) {
      this.history.shift(); // Remove oldest
    }
    
    // Dispatch to enabled channels
    if (this.config.websocket) this.sendWebSocket(enriched);
    if (this.config.sms) this.sendSMS(enriched);
    if (this.config.push) this.sendPush(enriched);
    if (this.config.radio) this.sendRadio(enriched);
    
    // Only log high-priority to the console — low-tier spam kills the dev experience.
    if (enriched.priority >= 4) {
      console.log('[ALERT] Dispatched:', enriched.alertId, 'Priority:', enriched.priority);
    }
    return enriched;
  }
  
  sendWebSocket(alert) {
    window.dispatchEvent(new CustomEvent('field-alert', { detail: alert }));
  }
  
  sendSMS(alert) {
    console.log('[ALERT] SMS:', alert.alertId);
  }
  
  sendPush(alert) {
    console.log('[ALERT] Push:', alert.alertId);
  }
  
  sendRadio(alert) {
    console.log('[ALERT] Radio:', alert.alertId);
  }
  
  calcPriority(alert) {
    const weights = {
      violence: 5, gunshot: 5, explosion: 5,
      stampede: 4, fire: 4,
      crowd_panic: 3, fighting: 3,
      smoke: 2
    };
    
    const base = weights[alert.detected] || 1;
    const multiplier = alert.score > 90 ? 2 : alert.score > 75 ? 1.5 : 1;
    return Math.min(Math.floor(base * multiplier), 5);
  }
  
  getActiveUnits() {
    const now = Date.now();
    return Array.from(this.units.values()).filter(u => 
      u.status === 'active' && (now - u.lastSeen) < 300000
    );
  }
  
  getUnit(id) { return this.units.get(id); }
  getAllUnits() { return Array.from(this.units.values()); }
  
  getHistory(filters = {}) {
    let h = this.history;
    if (filters.priority) h = h.filter(a => a.priority === filters.priority);
    if (filters.type) h = h.filter(a => a.detected === filters.type);
    if (filters.since) h = h.filter(a => new Date(a.timestamp) > filters.since);
    return h;
  }
  
  clearOldHistory(olderThanMs = 86400000) {
    const cutoff = new Date(Date.now() - olderThanMs);
    this.history = this.history.filter(a => new Date(a.timestamp) > cutoff);
  }
  
  destroy() {
    this.stop();
    this.units.clear();
    this.history = [];
    this.idCounter = 0;
  }
}

window.AlertDispatcher = AlertDispatcher;
