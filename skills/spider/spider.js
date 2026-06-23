const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class SpiderSkill {
  constructor() {
    this.name = 'spider';
    this.description = 'Web scraping, data collection, and browser automation';
    this.browser = null;
    this.page = null;
  }

  getInfo() {
    return { name: this.name, description: this.description };
  }

  async launchBrowser(options = {}) {
    const defaults = {
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    const config = { ...defaults, ...options };
    
    try {
      const { chromium } = require('playwright');
      this.browser = await chromium.launch({
        headless: config.headless,
        args: config.args
      });
      this.page = await this.browser.newPage();
      return { success: true, library: 'playwright' };
    } catch (playwrightErr) {
      try {
        const puppeteer = require('puppeteer-core');
        const executablePath = config.executablePath || 
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        this.browser = await puppeteer.launch({
          headless: config.headless,
          executablePath,
          args: config.args
        });
        this.page = await this.browser.newPage();
        return { success: true, library: 'puppeteer' };
      } catch (puppeteerErr) {
        return { 
          success: false, 
          error: `Browser launch failed: ${playwrightErr.message}` 
        };
      }
    }
  }

  async navigateTo(url) {
    if (!this.page) {
      throw new Error('Browser not launched. Call launchBrowser() first.');
    }
    await this.page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    return { url, title: await this.page.title() };
  }

  async getPageContent() {
    if (!this.page) {
      throw new Error('Browser not launched.');
    }
    return {
      title: await this.page.title(),
      url: this.page.url(),
      content: await this.page.content()
    };
  }

  async takeScreenshot(filename = `screenshot_${Date.now()}.png`) {
    if (!this.page) {
      throw new Error('Browser not launched.');
    }
    const screenshotPath = path.join(os.tmpdir(), filename);
    await this.page.screenshot({ path: screenshotPath });
    return screenshotPath;
  }

  async executeScript(script) {
    if (!this.page) {
      throw new Error('Browser not launched.');
    }
    return await this.page.evaluate(script);
  }

  async fillForm(selector, value) {
    if (!this.page) {
      throw new Error('Browser not launched.');
    }
    await this.page.type(selector, value);
    return { selector, value };
  }

  async click(selector) {
    if (!this.page) {
      throw new Error('Browser not launched.');
    }
    await this.page.click(selector);
    return { clicked: selector };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
    return { closed: true };
  }

  async scrape(url, extractor) {
    await this.launchBrowser({ headless: true });
    await this.navigateTo(url);
    await new Promise(resolve => setTimeout(resolve, 2000));
    const data = await this.executeScript(extractor);
    await this.close();
    return data;
  }

  async monitorWebsites(urls) {
    const results = [];
    for (const url of urls) {
      try {
        await this.launchBrowser({ headless: true });
        await this.navigateTo(url);
        const screenshot = await this.takeScreenshot(`monitor_${Date.now()}.png`);
        const content = await this.getPageContent();
        results.push({ url, screenshot, title: content.title, status: 'success' });
        await this.close();
      } catch (err) {
        results.push({ url, status: 'error', error: err.message });
      }
    }
    return results;
  }
}

module.exports = {
  name: 'spider',
  description: 'Web scraping, data collection, and browser automation using Playwright/Puppeteer',
  SpiderSkill,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['launch', 'navigate', 'screenshot', 'scrape', 'monitor', 'close'],
        description: 'Action to perform'
      },
      url: {
        type: 'string',
        description: 'URL to navigate to (required for navigate, scrape, monitor actions)'
      },
      options: {
        type: 'object',
        description: 'Browser launch options (headless, executablePath, args, etc.)'
      },
      selector: {
        type: 'string',
        description: 'CSS selector for form filling or clicking'
      },
      value: {
        type: 'string',
        description: 'Value to fill in form field'
      },
      script: {
        type: 'string',
        description: 'JavaScript to execute on page (as string)'
      },
      urls: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of URLs to monitor'
      },
      filename: {
        type: 'string',
        description: 'Screenshot filename'
      }
    },
    required: ['action']
  },
  async handler(args, context) {
    const spider = new SpiderSkill();

    try {
      switch (args.action) {
        case 'launch':
          const launchResult = await spider.launchBrowser(args.options || {});
          return {
            success: true,
            library: launchResult.library,
            message: `Browser launched using ${launchResult.library}`
          };

        case 'navigate':
          if (!args.url) {
            throw new Error('URL is required for navigate action');
          }
          const navResult = await spider.navigateTo(args.url);
          return {
            success: true,
            url: navResult.url,
            title: navResult.title,
            message: `Navigated to ${args.url}`
          };

        case 'screenshot':
          const screenshotPath = await spider.takeScreenshot(args.filename || `screenshot_${Date.now()}.png`);
          return {
            success: true,
            screenshot: screenshotPath,
            message: `Screenshot saved to ${screenshotPath}`
          };

        case 'scrape':
          if (!args.url) {
            throw new Error('URL is required for scrape action');
          }
          await spider.launchBrowser({ headless: true });
          await spider.navigateTo(args.url);
          const content = await spider.getPageContent();
          await spider.close();

          return {
            success: true,
            url: content.url,
            title: content.title,
            content_length: content.content.length,
            message: `Scraped content from ${args.url}`
          };

        case 'monitor':
          if (!args.urls || !Array.isArray(args.urls)) {
            throw new Error('URLs array is required for monitor action');
          }
          const monitorResults = await spider.monitorWebsites(args.urls);
          return {
            success: true,
            results: monitorResults,
            message: `Monitored ${args.urls.length} websites`
          };

        case 'close':
          await spider.close();
          return {
            success: true,
            message: 'Browser closed'
          };

        default:
          throw new Error(`Unknown action: ${args.action}`);
      }
    } catch (error) {
      try {
        await spider.close();
      } catch (e) {
      }

      return {
        success: false,
        error: error.message,
        message: `Spider action failed: ${error.message}`
      };
    }
  }
};
