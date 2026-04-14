// recon.js — One-shot DOM recon against a specific Higgsfield URL.
//
// Usage:
//   node automation/recon.js <url>
//
// Navigates to the URL (logged in via persistent profile), waits for the SPA
// to hydrate, dumps the DOM once, takes one screenshot, exits. No polling
// loop — no compositor flicker while you watch.

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const USER_DATA_DIR = path.join(PROJECT_ROOT, '.chrome-profile');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'outputs');

const url = process.argv[2] || 'https://higgsfield.ai/create/video?model=seedance_2_0';

await fs.mkdir(OUTPUT_DIR, { recursive: true });

const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
});

const page = context.pages()[0] || (await context.newPage());

console.log(`→ Navigating to: ${url}`);
await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});

// Wait for hydration: either networkidle or 5s, whichever first
await Promise.race([
  page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}),
  new Promise((r) => setTimeout(r, 5000)),
]);

// Extra beat in case of client-side routing
await new Promise((r) => setTimeout(r, 1500));

console.log(`→ Landed on: ${page.url()}`);
console.log(`→ Dumping DOM...`);

const data = await page.evaluate(() => {
  const trim = (s, n = 120) => (s || '').toString().slice(0, n);
  const collect = (selector, limit = 50) => {
    const els = Array.from(document.querySelectorAll(selector));
    return els.slice(0, limit).map((el) => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: trim(el.className?.toString?.(), 160),
      testid: el.getAttribute('data-testid'),
      name: el.getAttribute('name'),
      placeholder: el.getAttribute('placeholder'),
      type: el.getAttribute('type'),
      text: trim(el.innerText, 100),
      ariaLabel: el.getAttribute('aria-label'),
      href: el.tagName === 'A' ? el.getAttribute('href') : null,
    }));
  };
  return {
    url: window.location.href,
    title: document.title,
    buttons: collect('button'),
    links: collect('a', 40),
    textareas: collect('textarea'),
    fileInputs: collect('input[type="file"]'),
    inputs: collect('input:not([type="file"]):not([type="hidden"])'),
    contentEditable: collect('[contenteditable="true"]'),
    videos: collect('video'),
  };
});

const slug = page.url()
  .replace(/^https?:\/\//, '')
  .replace(/[^a-z0-9]/gi, '-')
  .replace(/-+/g, '-')
  .slice(0, 60);
const basename = `probe-${Date.now()}-${slug}`;
const jsonFile = path.join(OUTPUT_DIR, `${basename}.json`);

await fs.writeFile(jsonFile, JSON.stringify(data, null, 2));
// Screenshots removed — they cause compositor flicker on headful macOS
console.log(`✓ Dump: ${path.basename(jsonFile)}`);

await context.close();
process.exit(0);
