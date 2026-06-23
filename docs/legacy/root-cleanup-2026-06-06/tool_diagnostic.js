#!/usr/bin/env node
/**
 * Tool Diagnostic - Check why tools are failing
 */

console.log('🔍 Tool Failure Diagnostic\n');

// Check for common dependencies
const checks = [
  { name: 'Node.js', check: () => true, desc: 'Version: ' + process.version },
  { name: 'Playwright', check: async () => {
    try {
      require('playwright');
      return true;
    } catch {
      return false;
    }
  }, desc: 'Browser automation' },
  { name: 'Puppeteer', check: async () => {
    try {
      require('puppeteer');
      return true;
    } catch {
      return false;
    }
  }, desc: 'Chrome automation' },
  { name: 'Tesseract', check: async () => {
    try {
      const { execSync } = require('child_process');
      // Use EXPLICIT PATH — Tesseract not always in subprocess PATH
      const tesseractPath = 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe';
      execSync(`"${tesseractPath}" --version`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }, desc: 'OCR engine — C:\\Program Files\\Tesseract-OCR' },
  { name: 'Python', check: async () => {
    try {
      const { execSync } = require('child_process');
      execSync('python --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }, desc: 'Python for pynput' },
  { name: 'PowerShell', check: async () => {
    try {
      const { execSync } = require('child_process');
      execSync('powershell -Command "Write-Host OK"', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }, desc: 'Windows automation' },
  { name: 'WebSocket Server', check: async () => {
    try {
      const net = require('net');
      return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(7778, '127.0.0.1', () => {
          server.close();
          resolve(true);
        });
        server.on('error', () => resolve(false));
      });
    } catch {
      return false;
    }
  }, desc: 'LCD bridge port 7778' },
];

async function runChecks() {
  console.log('✅ System Checks:\n');

  for (const check of checks) {
    try {
      const result = await check.check();
      console.log(`  ${result ? '✅' : '❌'} ${check.name}: ${check.desc}`);
      if (!result) {
        console.log(`     ⚠️  Missing: ${check.name}`);
      }
    } catch (err) {
      console.log(`  ❌ ${check.name}: Failed - ${err.message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('💡 DIAGNOSIS:');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('Common tool failure reasons:');
  console.log('1. Playwright/Puppeteer: Need Chrome/Firefox installed');
  console.log('2. Tesseract: Install from https://github.com/UB-Mannheim/tesseract/wiki');
  console.log('3. Python pynput: pip install pynput');
  console.log('4. Port conflicts: Check netstat -ano | findstr :7777');
  console.log('5. Bridge not running: Check start_xiaozhi_bridge.bat');
  console.log('6. Dependencies: npm install playwright puppeteer');

  console.log('\n🔧 Quick fixes:');
  console.log('1. Install Tesseract: winget install UB-Mannheim.Tesseract');
  console.log('2. Install Playwright: npx playwright install');
  console.log('3. Install Python packages: pip install pynput opencv-python');
  console.log('4. Restart bridge: Stop and restart start_xiaozhi_bridge.bat');

  console.log('\n🧪 Test simple tools first:');
  console.log('   file_read, file_write, system_status, lcd_display');
  console.log('   These should work without external dependencies');
}

// Check bridge status
console.log('Checking bridge processes...\n');
const { execSync } = require('child_process');

try {
  const result = execSync('netstat -ano | findstr :7777', { encoding: 'utf8' });
  console.log('📡 Port 7777 (Python bridge):');
  console.log(result);
} catch {
  console.log('📡 Port 7777: No Python bridge detected');
}

try {
  const result = execSync('netstat -ano | findstr :7778', { encoding: 'utf8' });
  console.log('\n📡 Port 7778 (LCD bridge):');
  console.log(result);
} catch {
  console.log('\n📡 Port 7778: No LCD bridge detected');
}

// Check Node processes
try {
  const result = execSync('tasklist | findstr node', { encoding: 'utf8' });
  console.log('\n🖥️  Node.js processes:');
  console.log(result);
} catch {
  console.log('\n🖥️  No Node.js processes found');
}

runChecks();