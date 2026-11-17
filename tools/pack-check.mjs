// Packaged-copy check for Lumen Lines v2.1: serves the main.ts output
// (/tmp/lumen-out/game) on localhost with all non-localhost hosts blocked at
// the resolver, loads it in headless Chromium, and confirms the packaged game
// plays with no external request and no console error.
//
// Usage: MAKEFUN_OUTPUT_DIR=/tmp/lumen-out node main.ts && node tools/pack-check.mjs

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright-core';

const CHROME = '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const ROOT = '/tmp/lumen-out/game';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg' };

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost:8099');
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const body = await readFile(join(ROOT, decodeURIComponent(path)));
    response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
await new Promise((resolve) => server.listen(8099, resolve));

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const requests = [];
const errors = [];
page.on('request', (request) => requests.push(request.url()));
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto('http://localhost:8099/?debug=1', { waitUntil: 'networkidle' });
await new Promise((resolve) => setTimeout(resolve, 500));
console.log('packaged title screen:', await page.evaluate(() => window.__lumen.screen()));
await page.keyboard.press('Space');
await new Promise((resolve) => setTimeout(resolve, 200));
console.log('packaged level select:', await page.evaluate(() => window.__lumen.screen()));
const external = requests.filter((url) => !url.startsWith('http://localhost:8099'));
console.log(`external requests: ${external.length} of ${requests.length} total`);
console.log(`errors: ${errors.length}`, errors.join(' | '));
await browser.close();
server.close();
process.exit(errors.length === 0 && external.length === 0 ? 0 : 1);
