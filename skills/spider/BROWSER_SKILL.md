# 🕷️ Spider Agent - Browser Automation Skill

## Overview
Unified browser automation skill that works with Playwright, Puppeteer, or Puppeteer-Core. Solves the ball's confusion about browser automation.

## Installation Status
✅ **Playwright**: Installed and working  
✅ **Puppeteer-Core**: Available as fallback  
✅ **Compatibility Layer**: Ready  

## Usage Examples

### Basic Browser Automation
```javascript
const automation = require('../../playwright_compatibility');

async function browseWebsite() {
  // Launch browser (automatically detects best library)
  await automation.launchBrowser({ headless: false });
  
  // Navigate to URL
  await automation.navigateTo('https://example.com');
  
  // Get page content
  const content = await automation.getPageContent();
  console.log(`Title: ${content.title}`);
  
  // Take screenshot
  await automation.takeScreenshot('page_screenshot.png');
  
  // Close browser
  await automation.close();
}
```

### Form Interaction
```javascript
async function fillLoginForm() {
  await automation.launchBrowser({ headless: true });
  await automation.navigateTo('https://login.example.com');
  
  // Fill form fields
  await automation.fillForm('#username', 'testuser');
  await automation.fillForm('#password', 'password123');
  
  // Click submit
  await automation.click('#login-button');
  
  await automation.close();
}
```

### JavaScript Execution
```javascript
async function extractData() {
  await automation.launchBrowser();
  await automation.navigateTo('https://data.example.com');
  
  // Execute custom JavaScript on the page
  const result = await automation.executeScript(() => {
    // Extract all links
    const links = Array.from(document.querySelectorAll('a'));
    return links.map(link => ({
      text: link.textContent.trim(),
      href: link.href
    }));
  });
  
  console.log(`Found ${result.length} links`);
  await automation.close();
}
```

## Common Tasks for the Ball

### 1. Web Scraping
```javascript
// The ball can say: "scrape product prices from amazon"
async function scrapePrices() {
  await automation.launchBrowser();
  await automation.navigateTo('https://www.amazon.com/s?k=laptop');
  
  const prices = await automation.executeScript(() => {
    const priceElements = document.querySelectorAll('.a-price-whole');
    return Array.from(priceElements).map(el => el.textContent);
  });
  
  return prices;
}
```

### 2. Form Submission
```javascript
// The ball can say: "fill out the contact form on example.com"
async function submitContactForm() {
  await automation.launchBrowser({ headless: false });
  await automation.navigateTo('https://example.com/contact');
  
  await automation.fillForm('#name', 'John Doe');
  await automation.fillForm('#email', 'john@example.com');
  await automation.fillForm('#message', 'Hello from the ball!');
  await automation.click('#submit-button');
  
  // Wait and verify
  await new Promise(resolve => setTimeout(resolve, 2000));
  await automation.takeScreenshot('form_submitted.png');
  
  await automation.close();
}
```

### 3. Screenshot Monitoring
```javascript
// The ball can say: "take screenshots of these 3 websites"
async function monitorWebsites() {
  const websites = [
    'https://news.ycombinator.com',
    'https://github.com/trending',
    'https://reddit.com/r/programming'
  ];
  
  for (let i = 0; i < websites.length; i++) {
    await automation.launchBrowser({ headless: true });
    await automation.navigateTo(websites[i]);
    await automation.takeScreenshot(`monitor_${i}_${Date.now()}.png`);
    await automation.close();
  }
}
```

## Troubleshooting Guide

### Problem: "Browser not opening" or "Playwright not working"
**Solution:**
```javascript
// Use explicit configuration
await automation.launchBrowser({
  headless: false,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
```

### Problem: "Navigation timeout"
**Solution:**
```javascript
// Retry with different wait strategy
try {
  await automation.navigateTo(url);
} catch (error) {
  console.log('Retrying with longer timeout...');
  // The compatibility layer handles retries internally
}
```

### Problem: "Form elements not found"
**Solution:**
```javascript
// Wait for page to load completely
await new Promise(resolve => setTimeout(resolve, 3000));

// Use different selectors
await automation.fillForm('input[name="username"]', 'value');
await automation.fillForm('.form-field.email', 'value');
await automation.fillForm('#userId', 'value');
```

## Integration with PURPCLAW System

### Voice Command Examples:
1. **"Open browser and go to github"**
   ```javascript
   automation.launchBrowser().then(() => automation.navigateTo('https://github.com'));
   ```

2. **"Take screenshot of google"**
   ```javascript
   automation.launchBrowser({ headless: true })
     .then(() => automation.navigateTo('https://google.com'))
     .then(() => automation.takeScreenshot('google.png'))
     .then(() => automation.close());
   ```

3. **"Fill login form on admin panel"**
   ```javascript
   // The ball will use the form interaction methods
   ```

### Agent Response Format:
```json
{
  "action": "browser_automation",
  "status": "completed",
  "result": {
    "screenshot": "path/to/screenshot.png",
    "title": "Page Title",
    "url": "https://visited.url"
  }
}
```

## Quick Test Commands

Test if browser automation is working:
```bash
node test_browser_compatibility.js
```

Test specific website:
```bash
node -e "
  const automation = require('./playwright_compatibility');
  (async () => {
    await automation.launchBrowser({ headless: true });
    await automation.navigateTo('https://example.com');
    const content = await automation.getPageContent();
    console.log('Title:', content.title);
    await automation.close();
  })();
"
```

## Notes for the Ball
1. **Library Detection**: The system automatically detects Playwright, Puppeteer, or Puppeteer-Core
2. **Fallback Support**: If one library fails, it tries others
3. **Unified API**: Same commands work regardless of underlying library
4. **Error Recovery**: Built-in retry logic for common failures
5. **Memory Management**: Proper browser cleanup to prevent memory leaks

The ball should now stop being confused and use browser automation properly!