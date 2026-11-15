import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

mkdirSync('check', { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const errors = [];
const roverLogs = [];

page.on('console', (m) => {
  const text = m.text();
  if (text.startsWith('[rover]')) roverLogs.push(text);
  if (!['error', 'warning'].includes(m.type())) return;
  if (text.includes('GL Driver Message')) return;
  errors.push(`[${m.type()}] ${text}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: 'load' });
await page
  .waitForFunction(() => window.__roverReady, null, { timeout: 60000 })
  .catch(() => errors.push('[check] la escena no terminó de cargar'));

await page.waitForTimeout(1200);
await page.screenshot({ path: 'check/01-inicio.png' });

// Congelamos el reloj real y avanzamos por pasos fijos.
await page.evaluate(() => { window.__paused = true; });

// Conducir en recta.
await page.keyboard.down('KeyW');
await page.evaluate(() => window.__sim(150));
await page.keyboard.up('KeyW');
await page.evaluate(() => window.__sim(20));
await page.waitForTimeout(600);
await page.screenshot({ path: 'check/02-avance.png' });

// Girar a la derecha para dejar huellas curvas.
await page.keyboard.down('KeyW');
await page.keyboard.down('KeyD');
await page.evaluate(() => window.__sim(120));
await page.keyboard.up('KeyD');
await page.keyboard.up('KeyW');
await page.evaluate(() => window.__sim(10));

// Vista trasera para comprobar huellas y suspensión.
await page.evaluate(() => {
  const { rig } = window.__test;
  rig.autoFollow = false;
  rig.yaw = Math.PI - 0.3;
  rig.pitch = 0.22;
  rig.dist = 8.5;
});
await page.evaluate(() => window.__sim(30));
await page.waitForTimeout(900);
await page.screenshot({ path: 'check/03-huellas.png' });

// Telemetría final.
const state = await page.evaluate(() => {
  const c = window.__test.controller;
  return {
    x: c.x,
    z: c.z,
    odometer: c.odometer,
    speed: c.speed,
    tilt: c.tiltDeg,
    wheels: c.wheelHeights.length,
  };
});

await browser.close();

roverLogs.forEach((l) => console.log(l));
console.log(
  `[check] odómetro=${state.odometer.toFixed(2)} m · posición=(${state.x.toFixed(1)}, ${state.z.toFixed(1)}) · inclinación=${state.tilt.toFixed(1)}°`
);

if (state.odometer < 1) errors.push('[check] el rover no se desplazó');

if (errors.length) {
  console.log(`Errores (${errors.length}):`);
  errors.forEach((e) => console.log(' ', e));
  process.exit(1);
}
console.log('Sin errores de consola. Capturas en check/');
