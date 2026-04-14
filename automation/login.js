// login.js — Open Higgsfield and hold the window open for manual login.
//
// The automation scripts depend on a pre-authenticated Chromium profile at
// .chrome-profile/. This script sets that up once: opens a fresh Playwright
// Chrome window pointed at higgsfield.ai, then does nothing. The user signs
// in manually, clicks around until they're comfortable on the dashboard,
// then closes the window. Exit handler saves the profile to disk.
//
// Run this ONCE before running ugc.js / run.js for the first time.
//
// Usage:
//   node automation/login.js

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const USER_DATA_DIR = path.join(PROJECT_ROOT, '.chrome-profile');

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Higgsfield login setup');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('  Opening a Chrome window — sign into Higgsfield there.');
console.log('  When you see the logged-in dashboard, just CLOSE the');
console.log('  window. Your session will be saved and future runs');
console.log('  will skip login entirely.');
console.log('');
console.log('  (This script does nothing automated — it\'s just a');
console.log('   browser you control manually.)');
console.log('');

const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
});

const page = context.pages()[0] || (await context.newPage());

await page.goto('https://higgsfield.ai', { waitUntil: 'domcontentloaded' }).catch(() => {});

console.log('→ Window open. Log in, then close the window to save your session.');
console.log('');

// Hold until the user closes the browser. Both page-close and context-close
// resolve the wait, so quitting either way works.
await new Promise((resolve) => {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    resolve();
  };
  context.on('close', finish);
  page.on('close', finish);
});

// Context already closing at this point — nothing else to do. Profile is
// persisted automatically by launchPersistentContext.
console.log('');
console.log('✓ Window closed. Session saved to .chrome-profile/');
console.log('  You can now run: node automation/ugc.js');
console.log('');
process.exit(0);
