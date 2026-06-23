'use strict';
// Capture a screenshot of a running page on OUR schedule — no "wait for
// document-idle" that hangs on animated pages. Usage:
//   node scripts/ui-shot.js [url] [outPath]
const path = require('path');
const fs = require('fs');

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch { console.error('NO_PLAYWRIGHT'); process.exit(3); }

  const url = process.argv[2] || 'http://localhost:3030/mission';
  const out = path.resolve(process.argv[3] || 'agent_work/ui-shot.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    console.error('LAUNCH_FAILED: ' + e.message);
    process.exit(4);
  }
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.goto(url, { waitUntil: 'commit', timeout: 15000 });
  } catch (e) {
    console.log('nav-warn: ' + e.message);
  }
  await page.waitForTimeout(7000); // let client render + data load
  // Freeze animations so the screenshot can grab a stable frame. The heavy
  // rAF/canvas loops (three.js backgrounds) peg the CPU and make screenshot()
  // time out. Kill rAF + CSS animation/transition, then capture.
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;animation-duration:0s!important}' }).catch(() => {});
  await page.evaluate(() => {
    try {
      window.requestAnimationFrame = () => 0;
      window.cancelAnimationFrame = () => {};
    } catch (e) {}
  }).catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: out, timeout: 25000, fullPage: false, animations: 'disabled' }).catch(e => console.log('shot-warn: ' + e.message));
  console.log('SAVED ' + out);
  await browser.close();
})().catch(e => { console.error('ERR ' + (e.stack || e.message)); process.exit(1); });
