/**
 * Chaos Monitor Cesium Overlay UI
 * Disabled UI rendering to prevent 4 panels. Logic only.
 */

(function() {
  'use strict';

  class ChaosCesiumOverlay {
    constructor() {
      this.isInitialized = false;
    }

    init() {
      if (this.isInitialized) return this;
      this.bindEvents();
      this.isInitialized = true;
      console.log('[CHAOS] Cesium Overlay (Logic Only) initialized');
      return this;
    }

    bindEvents() {
      window.addEventListener('chaos-feed-update', (e) => this.handleFeedUpdate(e.detail));
      window.addEventListener('chaos-alert-dispatched', (e) => this.handleAlert(e.detail));
      window.addEventListener('chaos-score-change', (e) => this.handleScoreChange(e.detail));
    }

    handleFeedUpdate(data) {
      // Logic only, UI handled by GothamHUD
    }

    handleAlert(data) {
      // Logic only, UI handled by GothamHUD
    }

    handleScoreChange(data) {
      // Logic only, UI handled by GothamHUD
    }

    destroy() {
      this.isInitialized = false;
    }
  }

  window.ChaosCesiumOverlay = ChaosCesiumOverlay;
  
  if (window.chaosInit) {
    window.chaosInit.onReady(() => {
      window.chaosOverlay = new ChaosCesiumOverlay().init();
    });
  }
})();
