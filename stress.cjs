const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = 'E:/god folder/02_ACTIVE_PROJECTS/STRESS';
fs.mkdirSync(OUT, {recursive: true});

const log = (...a) => console.log('[' + new Date().toISOString().slice(11,19) + ']', ...a);

(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({viewport: {width: 1920, height: 1080}});
  const p = await c.newPage();
  const results = [];
  const errors = [];
  p.on('pageerror', e => errors.push('PAGE: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push('CONSOLE: ' + m.text().slice(0,200)); });

  // =====================================================
  // PART 1: NAV TOUR — visit each screen
  // =====================================================
  log('=== PART 1: NAV TOUR ===');
  await p.goto('http://localhost:3000/ui?v=' + Date.now(), {waitUntil: 'networkidle', timeout: 30000});
  await p.waitForTimeout(8000);
  await p.screenshot({path: `${OUT}/00-home.png`});

  const navItems = await p.$$('.nav-item');
  log(`Found ${navItems.length} nav items`);

  for (let i = 0; i < navItems.length; i++) {
    const txt = await navItems[i].innerText();
    const label = txt.split('\n')[0].trim();
    try {
      await navItems[i].click();
      await p.waitForTimeout(2500);
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await p.screenshot({path: `${OUT}/01-nav-${i}-${slug}.png`});
      results.push({action: `NAV[${i}]`, label, status: 'ok'});
      log(`  ${i}. ${label} ✓`);
    } catch (e) {
      results.push({action: `NAV[${i}]`, label, status: 'fail', err: e.message});
      log(`  ${i}. ${label} ✗ ${e.message}`);
    }
  }

  // =====================================================
  // PART 2: MISSION CONTROL chat features
  // =====================================================
  log('=== PART 2: MISSION CONTROL CHAT ===');
  // Back to mission
  await p.evaluate(() => {
    const items = document.querySelectorAll('.nav-item');
    for (const it of items) if (it.textContent.includes('MISSION CONTROL')) { it.click(); break; }
  });
  await p.waitForTimeout(3000);

  // Test: chat input + send
  const ta = await p.$('textarea');
  if (ta) {
    await ta.fill('What is 1+1?');
    await p.screenshot({path: `${OUT}/02-chat-typed.png`});
    const sendBtn = await p.$('button:has-text("SEND")');
    if (sendBtn) {
      await sendBtn.click();
      await p.waitForTimeout(10000);
      await p.screenshot({path: `${OUT}/02-chat-sent.png`});
      results.push({action: 'CHAT_SEND', status: 'ok'});
    }
  } else {
    results.push({action: 'CHAT_SEND', status: 'fail', err: 'no textarea'});
  }

  // Test: model dropdown
  const modelSelect = await p.$('select.ci-select');
  if (modelSelect) {
    const options = await modelSelect.$$eval('option', opts => opts.map(o => o.value || o.textContent));
    log(`  model options: ${options.join(' | ')}`);
    for (const opt of options) {
      try {
        await modelSelect.selectOption(opt);
        await p.waitForTimeout(800);
        await p.screenshot({path: `${OUT}/03-model-${opt.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`});
      } catch (e) {}
    }
    results.push({action: 'MODEL_DROPDOWN', options, status: 'ok'});
  }

  // Test: LOCAL button (the second ci-select span)
  const localBtn = await p.$('span.ci-select:has-text("LOCAL")');
  if (localBtn) {
    await localBtn.click();
    await p.waitForTimeout(1500);
    await p.screenshot({path: `${OUT}/04-local-clicked.png`});
    results.push({action: 'LOCAL_BTN', status: 'ok'});
  }

  // Test: TOOLS dropdown
  const toolsSelect = await p.$('select.ci-select:has(option:text("TOOLS"))');
  if (toolsSelect) {
    const tools = await toolsSelect.$$eval('option', opts => opts.map(o => o.textContent));
    log(`  TOOLS options: ${tools.join(' | ')}`);
    for (const t of tools) {
      try {
        await toolsSelect.selectOption({label: t});
        await p.waitForTimeout(500);
      } catch {}
    }
    await p.screenshot({path: `${OUT}/05-tools.png`});
    results.push({action: 'TOOLS_DROPDOWN', options: tools, status: 'ok'});
  }

  // Test: input row icons (📎, @, /, ⊞, ⚡)
  for (const icon of ['📎', '@', '/', '⊞', '⚡']) {
    try {
      const btn = await p.$(`.ci-icon:has-text("${icon}")`);
      if (btn) {
        await btn.click();
        await p.waitForTimeout(400);
        await p.screenshot({path: `${OUT}/06-icon-${icon}.png`});
        results.push({action: `ICON_${icon}`, status: 'ok'});
      }
    } catch (e) {
      results.push({action: `ICON_${icon}`, status: 'fail', err: e.message});
    }
  }

  // Test: thread PINNED dropdown
  const pinBtn = await p.$('button:has-text("PINNED"), .pinned-trigger, [class*="pinned"]');
  if (pinBtn) {
    await pinBtn.click();
    await p.waitForTimeout(800);
    await p.screenshot({path: `${OUT}/07-thread-pinned.png`});
    results.push({action: 'PINNED_DROPDOWN', status: 'ok'});
  }

  // Test: PROVIDER ROUTER rows (clickable?)
  const provRows = await p.$$('.prov-row');
  if (provRows.length) {
    await provRows[0].click();
    await p.waitForTimeout(500);
    await p.screenshot({path: `${OUT}/08-provider-row-clicked.png`});
  }

  // =====================================================
  // PART 3: SETTINGS OS
  // =====================================================
  log('=== PART 3: SETTINGS OS ===');
  await p.evaluate(() => {
    const items = document.querySelectorAll('.nav-item');
    for (const it of items) if (it.textContent.includes('SETTINGS OS')) { it.click(); break; }
  });
  await p.waitForTimeout(3500);
  await p.screenshot({path: `${OUT}/09-settings-home.png`});

  // Personality presets
  const presets = await p.$$('button:has-text("clean"), button:has-text("goblin"), button:has-text("spooky"), button:has-text("sovereign"), button:has-text("crt-ritual"), button:has-text("mochi-soft")');
  for (const pBtn of presets) {
    try {
      const label = (await pBtn.innerText()).split('\n')[0].trim();
      await pBtn.click();
      await p.waitForTimeout(2000);
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await p.screenshot({path: `${OUT}/10-preset-${slug}.png`});
      results.push({action: `PRESET_${label}`, status: 'ok'});
      log(`  preset: ${label} ✓`);
    } catch (e) {
      results.push({action: 'PRESET', status: 'fail', err: e.message});
    }
  }

  // Intensity buttons
  for (const i of ['off', 'low', 'medium', 'high', 'ceremonial']) {
    try {
      const btn = await p.$(`button:has-text("${i.toUpperCase()}")`);
      if (btn) {
        await btn.click();
        await p.waitForTimeout(1500);
        await p.screenshot({path: `${OUT}/11-intensity-${i}.png`});
        results.push({action: `INTENSITY_${i}`, status: 'ok'});
      }
    } catch (e) {}
  }

  // Channel gates checkboxes
  const channelBoxes = await p.$$('input[type="checkbox"]');
  for (let i = 0; i < channelBoxes.length; i++) {
    try {
      await channelBoxes[i].click();
      await p.waitForTimeout(1000);
      await p.screenshot({path: `${OUT}/12-channel-${i}.png`});
    } catch (e) {}
  }
  results.push({action: 'CHANNEL_GATES', count: channelBoxes.length, status: 'ok'});

  // Test: settings table filter
  const filterBtns = await p.$$('button:has-text("System"), button:has-text("User"), button:has-text("Runtime"), button:has-text("Secret")');
  for (const f of filterBtns) {
    try {
      await f.click();
      await p.waitForTimeout(800);
    } catch {}
  }
  await p.screenshot({path: `${OUT}/13-settings-filtered.png`});

  // Test: search
  const search = await p.$('input[placeholder*="search"], input[placeholder*="Search"]');
  if (search) {
    await search.fill('memory');
    await p.waitForTimeout(500);
    await p.screenshot({path: `${OUT}/14-settings-search.png`});
    await search.fill('');
  }

  // Test: REVIEW CHANGES button
  const reviewBtn = await p.$('button:has-text("REVIEW")');
  if (reviewBtn) {
    await reviewBtn.click();
    await p.waitForTimeout(1000);
    await p.screenshot({path: `${OUT}/15-review-changes.png`});
  }

  // Test: RESET ALL
  const resetBtn = await p.$('button:has-text("RESET")');
  if (resetBtn) {
    await resetBtn.click();
    await p.waitForTimeout(2000);
    await p.screenshot({path: `${OUT}/16-reset-all.png`});
    results.push({action: 'RESET_ALL', status: 'ok'});
  }

  // =====================================================
  // PART 4: AGENT TOWER interactions
  // =====================================================
  log('=== PART 4: AGENT TOWER ===');
  await p.evaluate(() => {
    const items = document.querySelectorAll('.nav-item');
    for (const it of items) if (it.textContent.includes('AGENT TOWER')) { it.click(); break; }
  });
  await p.waitForTimeout(3500);
  await p.screenshot({path: `${OUT}/17-tower-home.png`});
  // Try clicking floors
  const floorEls = await p.$$('[class*="floor"]');
  for (let i = 0; i < Math.min(floorEls.length, 5); i++) {
    try {
      await floorEls[i].click();
      await p.waitForTimeout(800);
    } catch (e) {}
  }
  await p.screenshot({path: `${OUT}/18-tower-clicked.png`});

  // =====================================================
  // PART 5: COCKPIT
  // =====================================================
  log('=== PART 5: COCKPIT ===');
  await p.evaluate(() => {
    const items = document.querySelectorAll('.nav-item');
    for (const it of items) if (it.textContent.includes('COCKPIT')) { it.click(); break; }
  });
  await p.waitForTimeout(3500);
  await p.screenshot({path: `${OUT}/19-cockpit.png`});

  // =====================================================
  // PART 6: GOOP PLAYGROUND
  // =====================================================
  log('=== PART 6: GOOP PLAYGROUND ===');
  await p.evaluate(() => {
    const items = document.querySelectorAll('.nav-item');
    for (const it of items) if (it.textContent.includes('GOOP')) { it.click(); break; }
  });
  await p.waitForTimeout(3500);
  await p.screenshot({path: `${OUT}/20-goop-home.png`});

  const goopSearch = await p.$('input[placeholder*="skill"], input[placeholder*="search"], input[placeholder*="Skill"]');
  if (goopSearch) {
    await goopSearch.fill('agent');
    await p.waitForTimeout(2000);
    await p.screenshot({path: `${OUT}/21-goop-search-agent.png`});
    await goopSearch.fill('orchestrate');
    await p.waitForTimeout(2000);
    await p.screenshot({path: `${OUT}/22-goop-search-orchestrate.png`});
    await goopSearch.fill('');
  }
  // Test buttons in goop
  const goopButtons = await p.$$('button');
  log(`  GOOP has ${goopButtons.length} buttons`);
  for (let i = 0; i < Math.min(goopButtons.length, 5); i++) {
    try {
      const label = (await goopButtons[i].innerText()).slice(0,30);
      await goopButtons[i].click();
      await p.waitForTimeout(500);
      results.push({action: `GOOP_BTN_${i}`, label, status: 'ok'});
    } catch (e) {}
  }

  // =====================================================
  // PART 7: VOICE
  // =====================================================
  log('=== PART 7: VOICE ===');
  await p.evaluate(() => {
    const items = document.querySelectorAll('.nav-item');
    for (const it of items) if (it.textContent.includes('VOICE')) { it.click(); break; }
  });
  await p.waitForTimeout(3000);
  await p.screenshot({path: `${OUT}/23-voice-home.png`});
  // Test sliders
  const sliders = await p.$$('input[type="range"]');
  for (let i = 0; i < sliders.length; i++) {
    try {
      await sliders[i].evaluate((el) => { el.value = 50; el.dispatchEvent(new Event('input', {bubbles: true})); });
      await p.waitForTimeout(500);
    } catch (e) {}
  }
  await p.screenshot({path: `${OUT}/24-voice-sliders.png`});

  // =====================================================
  // PART 8: MOCHI
  // =====================================================
  log('=== PART 8: MOCHI ===');
  await p.evaluate(() => {
    const items = document.querySelectorAll('.nav-item');
    for (const it of items) if (it.textContent.includes('MOCHI')) { it.click(); break; }
  });
  await p.waitForTimeout(3000);
  await p.screenshot({path: `${OUT}/25-mochi-home.png`});
  // Look for any clickable elements
  const mochiClickables = await p.$$('button, [class*="hatch"], [class*="wake"]');
  log(`  MOCHI has ${mochiClickables.length} clickables`);
  for (let i = 0; i < Math.min(mochiClickables.length, 3); i++) {
    try {
      const label = (await mochiClickables[i].innerText()).slice(0,30);
      await mochiClickables[i].click();
      await p.waitForTimeout(800);
      await p.screenshot({path: `${OUT}/26-mochi-click-${i}.png`});
    } catch (e) {}
  }

  // =====================================================
  // PART 9: BENCHMARKS
  // =====================================================
  log('=== PART 9: BENCHMARKS ===');
  await p.evaluate(() => {
    const items = document.querySelectorAll('.nav-item');
    for (const it of items) if (it.textContent.includes('BENCHMARKS')) { it.click(); break; }
  });
  await p.waitForTimeout(3000);
  await p.screenshot({path: `${OUT}/27-bench-home.png`});

  // =====================================================
  // PART 10: MEMORY
  // =====================================================
  log('=== PART 10: MEMORY ===');
  await p.evaluate(() => {
    const items = document.querySelectorAll('.nav-item');
    for (const it of items) if (it.textContent.includes('MEMORY')) { it.click(); break; }
  });
  await p.waitForTimeout(3000);
  await p.screenshot({path: `${OUT}/28-memory-home.png`});

  const memSearch = await p.$('input[placeholder*="memory"], input[placeholder*="recall"], input[placeholder*="Matrix"]');
  if (memSearch) {
    await memSearch.fill('test query');
    await p.waitForTimeout(500);
    const recBtn = await p.$('button:has-text("RECALL")');
    if (recBtn) {
      await recBtn.click();
      await p.waitForTimeout(3000);
      await p.screenshot({path: `${OUT}/29-memory-recall.png`});
      results.push({action: 'MEMORY_RECALL', status: 'ok'});
    }
  }

  // =====================================================
  // FINAL: write report
  // =====================================================
  fs.writeFileSync(`${OUT}/REPORT.json`, JSON.stringify({results, errors}, null, 2));
  log('=== DONE ===');
  log(`Total actions: ${results.length}`);
  log(`Errors: ${errors.length}`);
  if (errors.length) log('First error: ' + errors[0]);

  await b.close();
})();
