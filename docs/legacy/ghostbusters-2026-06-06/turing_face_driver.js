/**
 * PURPCLAW TURING LCD FACE DRIVER v7.0
 * ======================================
 * Drives the Turing Smart Screen 3.5" LCD (COM7/COM8)
 * Displays PURPCLAW's face with mood-driven expressions.
 * 
 * Protocol: Sends 6-byte commands via serial at 115200 baud
 */

const SerialPort = require('serialport');
const path = require('path');

// TURING screen configuration
const TURING_CONFIG = {
  // Auto-detect COM port
  autoDetect: true,
  ports: ['COM7', 'COM8', 'COM5', 'COM6'],
  baudRate: 115200,
  vidPid: '1A86:5722', // Standard Turing USB VID:PID
  
  // Screen dimensions
  width: 480,
  height: 320,
  
  // Colors (RGB565)
  BLACK: 0x0000,
  WHITE: 0xFFFF,
  PURPLE: 0x7800,
  PINK: 0xF81F,
  CYAN: 0x07FF,
  YELLOW: 0xFFE0,
  RED: 0xF800,
  GREEN: 0x07E0,
  
  // Mood colors
  MOOD_COLORS: {
    hype: { bg1: 0x7800, bg2: 0xF81F, text: 0xFFFF },      // Purple → Pink
    focused: { bg1: 0x1A1A, bg2: 0x1621, text: 0x07E0 },   // Dark blue, green text
    chill: { bg1: 0x0F0F, bg2: 0x1A1A, text: 0xA0A0 },     // Very dark, gray text
    chaotic: { bg1: 0xF81F, bg2: 0x07FF, text: 0xFFFF },   // Pink → Cyan
    sad: { bg1: 0x1A1A, bg2: 0x0F0F, text: 0x6495 },      // Dark, blue text
    angry: { bg1: 0xF800, bg2: 0x8B00, text: 0xFFFF },     // Red gradient
    excited: { bg1: 0xFD00, bg2: 0xF80C, text: 0x0000 },    // Gold gradient, dark text
    sleeping: { bg1: 0x0F0F, bg2: 0x1A1A, text: 0x6060 }   // Dark, dim text
  }
};

// TURING command bytes
const CMD = {
  CLEAR: 0x01,
  FILL: 0x02,
  DRAW_RECT: 0x03,
  DRAW_LINE: 0x04,
  DRAW_CIRCLE: 0x05,
  DRAW_TEXT: 0x06,
  SET_BRIGHTNESS: 0x07,
  DRAW_PIXEL: 0x08,
  // Extended commands for revB/revC
  HELLO: 0x0F,
  UPLOAD_IMAGE: 0x10
};

class TuringFaceDriver {
  constructor() {
    this.port = null;
    this.connected = false;
    this.currentMood = 'chill';
    this.faceData = null;
    this.animationFrame = 0;
    this.animationInterval = null;
    this.revision = 'unknown';
  }

  /**
   * Auto-detect and connect to TURING screen
   */
  async autoConnect() {
    console.log('[Turing] Auto-detecting TURING screen...');
    
    for (const portName of TURING_CONFIG.ports) {
      try {
        console.log(`[Turing] Trying ${portName}...`);
        const port = new SerialPort(portName, { baudRate: TURING_CONFIG.baudRate });
        
        await new Promise((resolve, reject) => {
          port.open(err => {
            if (err) reject(err);
            else resolve();
          });
        });

        // Try to identify
        const revision = await this.identify(port);
        if (revision) {
          this.port = port;
          this.revision = revision;
          this.connected = true;
          console.log(`[Turing] Connected to ${portName} (Revision: ${revision})`);
          
          port.on('error', err => {
            console.error('[Turing] Serial error:', err.message);
            this.connected = false;
          });
          
          port.on('close', () => {
            console.log('[Turing] Port closed');
            this.connected = false;
          });
          
          return true;
        }
        
        port.close();
      } catch (e) {
        console.error('AutoConnect failed:', e.message);
      }
    }
    
    console.log('[Turing] No TURING screen detected');
    return false;
  }

  /**
   * Identify TURING revision
   */
  async identify(port) {
    return new Promise(resolve => {
      // Try HELLO command (revB+)
      const helloCmd = Buffer.from([0xAA, CMD.HELLO, 0x00, 0x00, 0x00, 0x55]);
      port.write(helloCmd);
      
      const timeout = setTimeout(() => resolve(null), 1000);
      
      port.once('data', data => {
        clearTimeout(timeout);
        if (data.length >= 6 && data[0] === 0xAA && data[1] === CMD.HELLO) {
          resolve(`rev${String.fromCharCode(data[2])}`);
        } else {
          resolve('revA'); // Default to revA if no proper response
        }
      });
    });
  }

  /**
   * Send command to TURING
   */
  sendCommand(cmd, data = []) {
    if (!this.connected || !this.port) return false;
    
    const packet = Buffer.from([
      0xAA,           // Header
      cmd,            // Command
      ...data,        // Data bytes
      0x55            // Footer
    ]);
    
    this.port.write(packet);
    return true;
  }

  /**
   * Clear screen
   */
  clear(color = TURING_CONFIG.BLACK) {
    const colorBytes = Buffer.from([
      (color >> 8) & 0xFF,
      color & 0xFF
    ]);
    return this.sendCommand(CMD.CLEAR, colorBytes);
  }

  /**
   * Fill screen with gradient
   */
  fillGradient(color1, color2, vertical = true) {
    // For TURING, we draw rectangles to simulate gradient
    const steps = 32;
    
    for (let i = 0; i < steps; i++) {
      const ratio = i / steps;
      const r1 = (color1 >> 11) & 0x1F;
      const g1 = (color1 >> 5) & 0x3F;
      const b1 = color1 & 0x1F;
      const r2 = (color2 >> 11) & 0x1F;
      const g2 = (color2 >> 5) & 0x3F;
      const b2 = color2 & 0x1F;
      
      const r = Math.round(r1 + (r2 - r1) * ratio);
      const g = Math.round(g1 + (g2 - g1) * ratio);
      const b = Math.round(b1 + (b2 - b1) * ratio);
      
      const color = (r << 11) | (g << 5) | b;
      
      if (vertical) {
        const y = Math.floor((i / steps) * TURING_CONFIG.height);
        const h = Math.ceil(TURING_CONFIG.height / steps);
        this.drawRect(0, y, TURING_CONFIG.width, h, color, true);
      }
    }
    return true;
  }

  /**
   * Draw rectangle
   */
  drawRect(x, y, w, h, color, filled = false) {
    const cmd = filled ? CMD.FILL : CMD.DRAW_RECT;
    const colorBytes = Buffer.from([
      (color >> 8) & 0xFF,
      color & 0xFF,
      (x >> 8) & 0xFF,
      x & 0xFF,
      (y >> 8) & 0xFF,
      y & 0xFF,
      (w >> 8) & 0xFF,
      w & 0xFF,
      (h >> 8) & 0xFF,
      h & 0xFF
    ]);
    return this.sendCommand(cmd, colorBytes);
  }

  /**
   * Draw text (simplified - actual implementation depends on revision)
   */
  drawText(x, y, text, color = TURING_CONFIG.WHITE, size = 16) {
    // Text implementation varies by revision
    // For revA, we send raw bytes
    // For revB+, we have better text support
    const colorBytes = Buffer.from([
      (color >> 8) & 0xFF,
      color & 0xFF,
      (x >> 8) & 0xFF,
      x & 0xFF,
      (y >> 8) & 0xFF,
      y & 0xFF,
      size & 0xFF
    ]);
    
    const textBytes = Buffer.from(text, 'ascii');
    const packet = Buffer.concat([colorBytes, textBytes, Buffer.from([0x00])]);
    return this.sendCommand(CMD.DRAW_TEXT, packet);
  }

  /**
   * Render PURPCLAW face based on mood
   */
  renderFace(faceData) {
    if (!this.connected) return false;
    
    this.faceData = faceData;
    const colors = TURING_CONFIG.MOOD_COLORS[faceData.moodName.toLowerCase()] || TURING_CONFIG.MOOD_COLORS.chill;
    
    // Clear and fill with gradient background
    this.clear(colors.bg1);
    
    // Draw PURPLE PURPCLAW brand bar at top
    this.drawRect(0, 0, TURING_CONFIG.width, 30, TURING_CONFIG.PURPLE, true);
    
    // Draw eyes (emoji-style, approximated)
    const eyeY = 100;
    const eyeSize = 60;
    
    // Left eye
    this.drawRect(100, eyeY, eyeSize, eyeSize, TURING_CONFIG.WHITE, false);
    // Right eye  
    this.drawRect(320, eyeY, eyeSize, eyeSize, TURING_CONFIG.WHITE, false);
    
    // Draw eye content based on mood
    const eyeContentColor = colors.text;
    switch(faceData.moodName.toLowerCase()) {
      case 'hype':
        // Crown eyes
        this.drawRect(110, eyeY + 10, 40, 20, TURING_CONFIG.YELLOW, true);
        this.drawRect(330, eyeY + 10, 40, 20, TURING_CONFIG.YELLOW, true);
        break;
      case 'focused':
        // Brain eyes
        this.drawRect(115, eyeY + 15, 30, 30, TURING_CONFIG.PINK, true);
        this.drawRect(335, eyeY + 15, 30, 30, TURING_CONFIG.PINK, true);
        break;
      case 'sad':
        // Tear eyes
        this.drawRect(120, eyeY + 20, 20, 20, TURING_CONFIG.CYAN, true);
        this.drawRect(340, eyeY + 20, 20, 20, TURING_CONFIG.CYAN, true);
        break;
      case 'angry':
        // Red eyes
        this.drawRect(110, eyeY + 10, 40, 40, TURING_CONFIG.RED, true);
        this.drawRect(330, eyeY + 10, 40, 40, TURING_CONFIG.RED, true);
        break;
      case 'sleeping':
        // Closed eyes (lines)
        this.drawRect(110, eyeY + 25, 40, 5, TURING_CONFIG.WHITE, true);
        this.drawRect(330, eyeY + 25, 40, 5, TURING_CONFIG.WHITE, true);
        break;
      default:
        // Normal eyes
        this.drawRect(120, eyeY + 15, 20, 20, TURING_CONFIG.BLACK, true);
        this.drawRect(340, eyeY + 15, 20, 20, TURING_CONFIG.BLACK, true);
    }
    
    // Draw mouth
    const mouthY = 220;
    switch(faceData.moodName.toLowerCase()) {
      case 'hype':
      case 'excited':
        this.drawRect(180, mouthY, 120, 30, TURING_CONFIG.WHITE, true); // Big smile
        break;
      case 'sad':
      case 'sleeping':
        this.drawRect(200, mouthY + 10, 80, 15, TURING_CONFIG.WHITE, true); // Frown
        break;
      case 'angry':
        this.drawRect(190, mouthY + 5, 100, 15, TURING_CONFIG.WHITE, true); // Flat angry
        break;
      default:
        this.drawRect(200, mouthY, 80, 20, TURING_CONFIG.WHITE, true); // Neutral
    }
    
    // Draw accessory below mouth
    this.drawText(200, 270, faceData.accessory, colors.text, 24);
    
    // Draw PURPCLAW label
    this.drawText(180, 5, 'PURPCLAW', TURING_CONFIG.WHITE, 16);
    
    // Draw mood name
    this.drawText(180, 290, faceData.moodName, colors.text, 12);
    
    return true;
  }

  /**
   * Start face animation loop
   */
  startAnimation() {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
    }
    this.animationInterval = setInterval(() => {
      if (this.faceData) {
        this.animationFrame++;
        if (this.animationFrame > 1000000) this.animationFrame = 0;
        
        // Trigger re-render for animated moods
        const animation = this.faceData.animation;
        if (['bounce', 'hop', 'shake', 'sway'].includes(animation)) {
          // Subtle position offset for bounce effect
          const offset = Math.sin(this.animationFrame * 0.2) * 3;
          // Re-render with slight variation
          this.renderFace(this.faceData);
        }
      }
    }, 50); // 20fps animation
  }

  /**
   * Stop animation loop
   */
  stopAnimation() {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
  }

  /**
   * Disconnect from TURING
   */
  disconnect() {
    if (!this.port || !this.isConnected) return;
    this.stopAnimation();
    if (this.port && this.port.isOpen) {
      this.port.close();
    }
    this.connected = false;
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected;
  }
}

// Export singleton
module.exports = new TuringFaceDriver();
