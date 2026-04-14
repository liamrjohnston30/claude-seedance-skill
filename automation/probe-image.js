// probe-image.js — Click the "Image" tab on the home page and dump all links
// on the resulting view. The image model cards (Soul, Nano Banana, Flux, etc)
// should surface href values we can use.

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const USER_DATA_DIR = path.join(PROJECT_ROOT, '.chrome-profile');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'outputs');

await fs.mkdir(OUTPUT_DIR, { recursive: true });

const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
});

const page = context.pages()[0] || (await context.newPage());

console.log('→ Opening home...');
await page.goto('https://higgsfield.ai/', { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(3000);

console.log('→ Clicking Image tab...');
await page.locator('nav button:has-text("Image")').first().click().catch(() => {});
await page.waitForTimeout(3500);

console.log(`→ URL after click: ${page.url()}`);

const data = await page.evaluate(() => {
  const abs = (href) => {
    if (!href) return null;
    try {
      return new URL(href, location.href).toString();
    } catch {
      return href;
    }
  };
  return {
    url: location.href,
    title: document.title,
    links: [...document.querySelectorAll('a')]
      .map((a) => ({
        href: abs(a.getAttribute('href')),
        text: ((a.innerText || '').slice(0, 50)).replace(/\s+/g, ' ').trim(),
      }))
      .filter((l) => l.href && l.href !== 'https://higgsfield.ai/'),
    headings: [...document.querySelectorAll('h1, h2, h3')]
      .slice(0, 20)
      .map((h) => (h.innerText || '').slice(0, 80)),
  };
});

// De-dupe links by href
const seen = new Set();
const uniqueLinks = data.links.filter((l) => {
  if (seen.has(l.href)) return false;
  seen.add(l.href);
  return true;
});

console.log('');
console.log(`=== HEADINGS (${data.headings.length}) ===`);
data.headings.forEach((h, i) => console.log(`  ${i + 1}. ${h}`));

console.log('');
console.log(`=== UNIQUE LINKS (${uniqueLinks.length}) ===`);
uniqueLinks.forEach((l) => {
  console.log(`  ${(l.text || '').padEnd(30).slice(0, 30)}  ->  ${l.href}`);
});

// Save full dump
const basename = `probe-image-click-${Date.now()}`;
await fs.writeFile(
  path.join(OUTPUT_DIR, `${basename}.json`),
  JSON.stringify({ ...data, uniqueLinks }, null, 2),
);
await page.screenshot({ path: path.join(OUTPUT_DIR, `${basename}.png`) }).catch(() => {});

await context.close();
process.exit(0);
