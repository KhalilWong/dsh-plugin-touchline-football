import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const edge =
  process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = process.env.CHECK_BASE || 'http://127.0.0.1:8787';
const date = process.env.CHECK_DATE || '20261024';
const match = process.env.CHECK_MATCH || '401892153';
mkdirSync('tmp', { recursive: true });
const errors = [];
const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

await page.goto(`${base}/?date=${date}&match=${match}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(12000);
await page.screenshot({ path: 'tmp/shot-1-desktop.png' });

const state = await page.evaluate(() => {
  const activeFilter = document.querySelector('.tabs .tab.is-active')?.textContent?.trim();
  const rows = document.querySelectorAll('.match-row').length;
  const canvas = document.querySelector('canvas');
  const title = document.title;
  const teams = [...document.querySelectorAll('.score-team__text strong')].map((el) => el.textContent);
  const clock = document.querySelector('.score-clock__time')?.textContent;
  const ticker = document.querySelector('.ticker__main p')?.textContent;
  const selected = document.querySelector('.match-row.is-selected');
  const selectedRect = selected?.getBoundingClientRect();
  const scrollRect = document.querySelector('.matchlist__scroll')?.getBoundingClientRect();
  return {
    activeFilter,
    rows,
    title,
    canvas: canvas ? { w: canvas.width, h: canvas.height } : null,
    teams,
    clock,
    ticker,
    selectedVisible: selectedRect && scrollRect ? selectedRect.top >= scrollRect.top && selectedRect.bottom <= scrollRect.bottom : null,
  };
});
console.log('STATE', JSON.stringify(state, null, 2));

await page.click('.inspector__tabs button:nth-child(2)');
await page.waitForTimeout(600);
await page.screenshot({ path: 'tmp/shot-2-events.png' });

await page.click('.boss-button');
await page.waitForTimeout(500);
const boss = await page.evaluate(() => ({
  title: document.title,
  visible: !!document.querySelector('.boss'),
  heading: document.querySelector('.boss__sheet-caption h1')?.textContent,
  rows: document.querySelectorAll('.boss__grid tbody tr').length,
}));
console.log('BOSS', JSON.stringify(boss, null, 2));
await page.screenshot({ path: 'tmp/shot-3-boss.png' });

await page.keyboard.press('Control+Shift+X');
await page.waitForTimeout(500);
console.log('RETURN_TITLE', await page.title());

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(900);
await page.screenshot({ path: 'tmp/shot-4-mobile.png' });
await page.evaluate(() => {
  const body = document.querySelector('.app-body');
  if (body) body.scrollTop = body.scrollHeight;
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'tmp/shot-5-mobile-stats.png' });

await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(7000);
const today = await page.evaluate(() => ({
  dateHeading: document.querySelector('.matchlist__head h2')?.textContent,
  activeFilter: document.querySelector('.tabs .tab.is-active')?.textContent?.trim(),
  rows: document.querySelectorAll('.match-row').length,
  matchTitle: document.querySelector('.scoreboard__league')?.textContent,
}));
console.log('TODAY', JSON.stringify(today, null, 2));
await page.screenshot({ path: 'tmp/shot-6-today.png' });

console.log('ERRORS', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exitCode = 1;
