#!/usr/bin/env node
/**
 * Playwright Compatibility Layer
 *
 * Provides a unified interface for browser automation that works with
 * both Playwright and Puppeteer, allowing the ball to use whichever is available.
 */

const fs = require('fs');
const path = require('path');

class BrowserAutomation {
  constructor() {
    this.availableLibraries = [];
    this.detectedLibrary = null;
    this.browser = null;
    this.page = null;
  }

  async detectLibraries() {
    console.log('🔍 Detecting browser automation libraries...');

    // Check for Playwright
    try {
      require.resolve('playwright');
      this.availableLibraries.push('playwright');
      console.log('✅ Playwright detected');
    } catch (e) {
      console.log('❌ Playwright not found');
    }

    // Check for Puppeteer
    try {
      require.resolve('puppeteer');
      this.availableLibraries.push('puppeteer');
      console.log('✅ Puppeteer detected');
    } catch (e) {
      console.log('❌ Puppeteer not found');
    }

    // Check for Puppeteer Core
    try {
      require.resolve('puppeteer-core');
      this.availableLibraries.push('puppeteer-core');
      console.log('✅ Puppeteer Core detected');
    } catch (e) {
      console.log('❌ Puppeteer Core not found');
    }

    // Choose the best available library
    if (this.availableLibraries.includes('playwright')) {
      this.detectedLibrary = 'playwright';
    } else if (this.availableLibraries.includes('puppeteer')) {
      this.detectedLibrary = 'puppeteer';
    } else if (this.availableLibraries.includes('puppeteer-core')) {
      this.detectedLibrary = 'puppeteer-core';
    }

    console.log(`🎯 Selected library: ${this.detectedLibrary || 'None'}`);
    return this.detectedLibrary;
  }

  async launchBrowser(options = {}) {
    if (!this.detectedLibrary) {
      await this.detectLibraries();
    }

    if (!this.detectedLibrary) {
      throw new Error('No browser automation library found. Install playwright or puppeteer.');
    }

    console.log(`🚀 Launching browser with ${this.detectedLibrary}...`);

    try {
      switch (this.detectedLibrary) {
        case 'playwright':
          const { chromium } = require('playwright');
          this.browser = await chromium.launch({
            headless: options.headless !== false,
            args: options.args || []
          });
          break;

        case 'puppeteer':
          const puppeteer = require('puppeteer');
          this.browser = await puppeteer.launch({
            headless: options.headless !== false,
            args: options.args || []
          });
          break;

        case 'puppeteer-core':
          const puppeteerCore = require('puppeteer-core');
          // Find Chrome executable
          const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
            process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
            process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
          ];

          let executablePath = options.executablePath;
          if (!executablePath) {
            for (const path of chromePaths) {
              if (fs.existsSync(path)) {
                executablePath = path;
                console.log(`✅ Found Chrome at: ${path}`);
                break;
              }
            }
          }

          if (!executablePath) {
            throw new Error('Chrome executable not found. Please specify executablePath.');
          }

          this.browser = await puppeteerCore.launch({
            executablePath,
            headless: options.headless !== false,
            args: options.args || []
          });
          break;
      }

      this.page = await this.browser.newPage();
      console.log('✅ Browser launched successfully');
      return { browser: this.browser, page: this.page };

    } catch (error) {
      console.error('❌ Failed to launch browser:', error.message);
      throw error;
    }
  }

  async navigateTo(url) {
    if (!this.page) {
      throw new Error('Browser not launched. Call launchBrowser() first.');
    }

    console.log(`🌐 Navigating to: ${url}`);
    try {
      await this.page.goto(url, { waitUntil: 'networkidle' });
      console.log('✅ Page loaded successfully');
      return true;
    } catch (error) {
      console.error('❌ Navigation failed:', error.message);
      return false;
    }
  }

  async takeScreenshot(path = 'screenshot.png') {
    if (!this.page) {
      throw new Error('Browser not launched. Call launchBrowser() first.');
    }

    console.log(`📸 Taking screenshot: ${path}`);
    try {
      await this.page.screenshot({ path, fullPage: true });
      console.log('✅ Screenshot saved');
      return true;
    } catch (error) {
      console.error('❌ Screenshot failed:', error.message);
      return false;
    }
  }

  async getPageContent() {
    if (!this.page) {
      throw new Error('Browser not launched. Call launchBrowser() first.');
    }

    try {
      const content = await this.page.content();
      const title = await this.page.title();
      return { title, content };
    } catch (error) {
      console.error('❌ Failed to get page content:', error.message);
      return null;
    }
  }

  async close() {
    if (this.browser) {
      console.log('🔌 Closing browser...');
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log('✅ Browser closed');
    }
  }

  async executeScript(script, ...args) {
    if (!this.page) {
      throw new Error('Browser not launched. Call launchBrowser() first.');
    }

    try {
      const result = await this.page.evaluate(script, ...args);
      return result;
    } catch (error) {
      console.error('❌ Script execution failed:', error.message);
      throw error;
    }
  }

  async fillForm(selector, value) {
    if (!this.page) {
      throw new Error('Browser not launched. Call launchBrowser() first.');
    }

    try {
      await this.page.fill(selector, value);
      console.log(`✅ Filled form field: ${selector}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to fill form field ${selector}:`, error.message);
      return false;
    }
  }

  async click(selector) {
    if (!this.page) {
      throw new Error('Browser not launched. Call launchBrowser() first.');
    }

    try {
      await this.page.click(selector);
      console.log(`✅ Clicked: ${selector}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to click ${selector}:`, error.message);
      return false;
    }
  }
}

// Export singleton instance
const browserAutomation = new BrowserAutomation();
module.exports = browserAutomation;

// CLI interface
if (require.main === module) {
  (async () => {
    console.log('🕷️  Browser Automation Compatibility Test');
    console.log('==========================================\n');

    const automation = new BrowserAutomation();

    try {
      // Detect libraries
      const library = await automation.detectLibraries();
      if (!library) {
        console.log('\n❌ No browser automation library found.');
        console.log('💡 Install one of:');
        console.log('   npm install playwright');
        console.log('   npm install puppeteer');
        console.log('   npm install puppeteer-core');
        process.exit(1);
      }

      console.log(`\n✅ Using: ${library}`);

      // Test browser launch
      console.log('\n🚀 Testing browser launch...');
      const { browser, page } = await automation.launchBrowser({ headless: true });

      // Test navigation
      console.log('\n🌐 Testing navigation...');
      const success = await automation.navigateTo('https://example.com');

      if (success) {
        // Get page info
        const content = await automation.getPageContent();
        console.log(`\n📄 Page title: ${content.title}`);
        console.log(`📄 Content length: ${content.content.length} characters`);

        // Take screenshot
        console.log('\n📸 Testing screenshot...');
        await automation.takeScreenshot('test_screenshot.png');
      }

      // Close browser
      await automation.close();

      console.log('\n🎉 All tests passed!');
      console.log('\n💡 Usage example:');
      console.log(`
        const automation = require('./playwright_compatibility');

        async function test() {
          await automation.launchBrowser();
          await automation.navigateTo('https://example.com');
          const content = await automation.getPageContent();
          console.log(content.title);
          await automation.close();
        }
      `);

    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
      console.error('\n💡 Troubleshooting:');
      console.error('1. Make sure Chrome is installed');
      console.error('2. For puppeteer-core, specify executablePath');
      console.error('3. Check firewall/network settings');
      process.exit(1);
    }
  })();
}