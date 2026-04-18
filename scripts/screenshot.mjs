import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:18080/trigger.html';
const out = process.argv[3] || 'docs/screenshot.png';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('saved', out);
