import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('response', (r) => { if (r.status() >= 400) console.log(r.status(), r.url().slice(0, 130)); });
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__roverReady, null, { timeout: 60000 });
await page.waitForFunction(() => window.__cameraPhotos && window.__cameraPhotos.photos.length >= 4, null, { timeout: 120000 });
await page.waitForTimeout(3000);
await browser.close();
