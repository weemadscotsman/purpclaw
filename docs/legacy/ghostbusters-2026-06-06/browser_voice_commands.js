#!/usr/bin/env node
/**
 * Browser Voice Commands Handler
 *
 * Processes voice commands related to browser automation
 * and provides clear feedback to the ball about what's happening.
 */

const automation = require('./playwright_compatibility');
const fs = require('fs');
const path = require('path');

class BrowserVoiceHandler {
  constructor() {
    this.commands = {
      // Basic browser commands
      'open browser': this.openBrowser,
      'close browser': this.closeBrowser,
      'go to': this.navigateTo,
      'take screenshot': this.takeScreenshot,
      'get page info': this.getPageInfo,

      // Form interaction commands
      'fill form': this.fillForm,
      'click': this.clickElement,
      'submit form': this.submitForm,

      // Data extraction commands
      'extract links': this.extractLinks,
      'get text': this.getTextContent,
      'scrape data': this.scrapeData,

      // Utility commands
      'test browser': this.testBrowser,
      'list commands': this.listCommands,
      'help': this.showHelp
    };
  }

  async processCommand(voiceCommand) {
    console.log(`🎤 Voice command: "${voiceCommand}"`);

    // Normalize command
    const normalized = voiceCommand.toLowerCase().trim();

    // Find matching command
    for (const [pattern, handler] of Object.entries(this.commands)) {
      if (normalized.includes(pattern)) {
        console.log(`🔍 Matched pattern: "${pattern}"`);

        // Extract parameters
        const params = this.extractParameters(normalized, pattern);

        try {
          const result = await handler.call(this, params, normalized);
          return this.formatResponse('success', result);
        } catch (error) {
          return this.formatResponse('error', {
            message: error.message,
            suggestion: this.getSuggestion(error)
          });
        }
      }
    }

    return this.formatResponse('unknown', {
      message: `Command not recognized: "${voiceCommand}"`,
      available: Object.keys(this.commands)
    });
  }

  extractParameters(command, pattern) {
    const params = {};

    // Extract URL if present
    const urlMatch = command.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      params.url = urlMatch[0];
    }

    // Extract filename for screenshots
    if (pattern === 'take screenshot') {
      const fileMatch = command.match(/as\s+(\S+)/);
      if (fileMatch) {
        params.filename = fileMatch[1];
      }
    }

    // Extract form field values
    if (pattern === 'fill form') {
      const fieldMatch = command.match(/field\s+(\S+)\s+with\s+(.+?)(?:\s+and|$)/);
      if (fieldMatch) {
        params.field = fieldMatch[1];
        params.value = fieldMatch[2];
      }
    }

    return params;
  }

  async openBrowser(params) {
    console.log('🚀 Opening browser...');
    const options = {
      headless: params.headless !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };

    await automation.launchBrowser(options);
    return { message: 'Browser opened successfully', headless: options.headless };
  }

  async closeBrowser() {
    console.log('🔌 Closing browser...');
    await automation.close();
    return { message: 'Browser closed successfully' };
  }

  async navigateTo(params) {
    if (!params.url) {
      throw new Error('No URL specified. Example: "go to https://example.com"');
    }

    console.log(`🌐 Navigating to: ${params.url}`);
    const success = await automation.navigateTo(params.url);

    if (success) {
      const content = await automation.getPageContent();
      return {
        message: `Navigated to ${params.url}`,
        title: content.title,
        url: params.url
      };
    } else {
      throw new Error(`Failed to navigate to ${params.url}`);
    }
  }

  async takeScreenshot(params) {
    const filename = params.filename || `screenshot_${Date.now()}.png`;
    console.log(`📸 Taking screenshot: ${filename}`);

    await automation.takeScreenshot(filename);

    // Check if file was created
    if (fs.existsSync(filename)) {
      const stats = fs.statSync(filename);
      return {
        message: `Screenshot saved as ${filename}`,
        filename: filename,
        size: `${(stats.size / 1024).toFixed(1)} KB`,
        path: path.resolve(filename)
      };
    } else {
      throw new Error(`Screenshot file not created: ${filename}`);
    }
  }

  async getPageInfo() {
    console.log('📄 Getting page information...');
    const content = await automation.getPageContent();

    if (!content) {
      throw new Error('No page loaded. Use "go to [url]" first.');
    }

    return {
      message: 'Page information retrieved',
      title: content.title,
      contentLength: content.content.length,
      preview: content.content.substring(0, 200) + '...'
    };
  }

  async fillForm(params) {
    if (!params.field || !params.value) {
      throw new Error('Specify field and value. Example: "fill form field username with testuser"');
    }

    console.log(`📝 Filling form field: ${params.field} = ${params.value}`);

    // Try different selector patterns
    const selectors = [
      `#${params.field}`,
      `[name="${params.field}"]`,
      `[id="${params.field}"]`,
      `.${params.field}`,
      `input[type="${params.field}"]`
    ];

    let success = false;
    for (const selector of selectors) {
      try {
        success = await automation.fillForm(selector, params.value);
        if (success) break;
      } catch (e) {
        // Try next selector
      }
    }

    if (success) {
      return {
        message: `Form field "${params.field}" filled with "${params.value}"`,
        field: params.field,
        value: params.value
      };
    } else {
      throw new Error(`Could not find form field: ${params.field}`);
    }
  }

  async clickElement(params) {
    if (!params.selector) {
      throw new Error('Specify what to click. Example: "click submit button"');
    }

    console.log(`🖱️ Clicking: ${params.selector}`);

    // Map common terms to selectors
    const selectorMap = {
      'submit': 'button[type="submit"], input[type="submit"], .submit',
      'login': '#login, .login, [name="login"]',
      'search': '#search, .search, [type="search"]',
      'menu': '.menu, #menu, nav',
      'link': 'a'
    };

    const selector = selectorMap[params.selector] || params.selector;
    const success = await automation.click(selector);

    if (success) {
      return {
        message: `Clicked: ${params.selector}`,
        selector: selector
      };
    } else {
      throw new Error(`Could not click: ${params.selector}`);
    }
  }

  async submitForm() {
    console.log('📤 Submitting form...');

    // Try common submit selectors
    const selectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      '.submit',
      '#submit',
      'form button:last-child'
    ];

    let success = false;
    for (const selector of selectors) {
      try {
        success = await automation.click(selector);
        if (success) break;
      } catch (e) {
        // Try next selector
      }
    }

    if (success) {
      return { message: 'Form submitted successfully' };
    } else {
      throw new Error('Could not find submit button');
    }
  }

  async extractLinks() {
    console.log('🔗 Extracting links...');

    const links = await automation.executeScript(() => {
      const linkElements = document.querySelectorAll('a');
      return Array.from(linkElements).map(link => ({
        text: link.textContent.trim(),
        href: link.href,
        title: link.title || ''
      }));
    });

    return {
      message: `Found ${links.length} links`,
      links: links.slice(0, 10), // Return first 10 links
      total: links.length
    };
  }

  async getTextContent() {
    console.log('📝 Getting text content...');

    const text = await automation.executeScript(() => {
      return document.body.innerText;
    });

    return {
      message: 'Text content extracted',
      length: text.length,
      preview: text.substring(0, 300) + '...'
    };
  }

  async scrapeData(params) {
    console.log('🕷️ Scraping data...');

    const data = await automation.executeScript(() => {
      // Simple data extraction - can be customized
      const items = [];

      // Extract headings
      const headings = document.querySelectorAll('h1, h2, h3');
      headings.forEach(h => {
        items.push({ type: 'heading', level: h.tagName, text: h.textContent.trim() });
      });

      // Extract paragraphs
      const paragraphs = document.querySelectorAll('p');
      paragraphs.forEach((p, i) => {
        if (i < 5) { // Limit to first 5 paragraphs
          items.push({ type: 'paragraph', text: p.textContent.trim() });
        }
      });

      // Extract images
      const images = document.querySelectorAll('img');
      images.forEach((img, i) => {
        if (i < 3) { // Limit to first 3 images
          items.push({
            type: 'image',
            src: img.src,
            alt: img.alt,
            width: img.width,
            height: img.height
          });
        }
      });

      return items;
    });

    return {
      message: `Scraped ${data.length} data items`,
      data: data,
      summary: {
        headings: data.filter(d => d.type === 'heading').length,
        paragraphs: data.filter(d => d.type === 'paragraph').length,
        images: data.filter(d => d.type === 'image').length
      }
    };
  }

  async testBrowser() {
    console.log('🧪 Testing browser automation...');

    const library = await automation.detectLibraries();

    // Try to launch browser
    let launchSuccess = false;
    try {
      await automation.launchBrowser({ headless: true });
      launchSuccess = true;
      await automation.close();
    } catch (error) {
      // Continue with test
    }

    return {
      message: 'Browser test completed',
      library: library,
      launchSuccess: launchSuccess,
      status: launchSuccess ? 'READY' : 'NEEDS_SETUP',
      suggestion: launchSuccess ? null : 'Check Chrome installation and permissions'
    };
  }

  async listCommands() {
    return {
      message: 'Available browser commands',
      commands: Object.keys(this.commands).map(cmd => ({
        command: cmd,
        example: this.getCommandExample(cmd)
      }))
    };
  }

  async showHelp() {
    return {
      message: 'Browser Automation Help',
      usage: 'Say commands like:',
      examples: [
        '"open browser" - Opens a browser window',
        '"go to https://example.com" - Navigates to a website',
        '"take screenshot as mypage.png" - Takes a screenshot',
        '"fill form field username with testuser" - Fills a form field',
        '"click submit button" - Clicks a button',
        '"extract links" - Gets all links from page',
        '"test browser" - Tests if browser automation works',
        '"close browser" - Closes the browser'
      ],
      tips: [
        'Make sure Chrome is installed',
        'For forms, use simple field names like "username", "email", "password"',
        'Screenshots are saved in current directory',
        'Use "list commands" to see all available commands'
      ]
    };
  }

  getCommandExample(command) {
    const examples = {
      'open browser': 'open browser',
      'close browser': 'close browser',
      'go to': 'go to https://example.com',
      'take screenshot': 'take screenshot as mypage.png',
      'get page info': 'get page info',
      'fill form': 'fill form field username with testuser',
      'click': 'click submit button',
      'submit form': 'submit form',
      'extract links': 'extract links',
      'get text': 'get text',
      'scrape data': 'scrape data',
      'test browser': 'test browser',
      'list commands': 'list commands',
      'help': 'help'
    };

    return examples[command] || command;
  }

  getSuggestion(error) {
    const suggestions = {
      'No URL specified': 'Add a URL like: "go to https://example.com"',
      'Failed to navigate': 'Check internet connection and URL validity',
      'No page loaded': 'Use "go to [url]" first',
      'Could not find form field': 'Try simpler field names like "username" or "email"',
      'Could not click': 'Try "click submit" or "click login"',
      'Chrome executable not found': 'Install Google Chrome browser',
      'No browser automation library found': 'Run: npm install playwright'
    };

    for (const [pattern, suggestion] of Object.entries(suggestions)) {
      if (error.message.includes(pattern)) {
        return suggestion;
      }
    }

    return 'Try "test browser" to diagnose the issue';
  }

  formatResponse(status, data) {
    return {
      timestamp: new Date().toISOString(),
      status: status,
      data: data
    };
  }
}

// CLI interface for testing
if (require.main === module) {
  const handler = new BrowserVoiceHandler();

  // Test with command line argument or interactive mode
  const args = process.argv.slice(2);

  if (args.length > 0) {
    // Command line mode
    const command = args.join(' ');
    handler.processCommand(command)
      .then(response => {
        console.log('\n📋 RESPONSE:');
        console.log(JSON.stringify(response, null, 2));
      })
      .catch(error => {
        console.error('❌ Error:', error.message);
      });
  } else {
    // Interactive mode
    console.log('🎤 BROWSER VOICE COMMAND TESTER');
    console.log('===============================\n');
    console.log('Type browser commands (or "exit" to quit):\n');

    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const ask = () => {
      rl.question('> ', async (command) => {
        if (command.toLowerCase() === 'exit') {
          rl.close();
          return;
        }

        const response = await handler.processCommand(command);
        console.log('\n📋 Response:', JSON.stringify(response, null, 2));
        console.log();
        ask();
      });
    };

    ask();
  }
}

module.exports = BrowserVoiceHandler;