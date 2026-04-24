// imagineart.js — core Playwright automation for driving ImagineArt video generation
//
// Design notes:
// - Uses a persistent Chromium user-data-dir so the user stays logged in across runs.
//   First run: user logs in manually, script waits. Subsequent runs: auto-authenticated.
// - Exposes a single drive() function that takes { prompt, imagePath, outputDir } and
//   returns { videoUrl, screenshotPaths }. The CLI wrapper in run.js calls this.
// - Selectors are defined at the top so they can be patched in one place when ImagineArt
//   ships UI changes. Run `node recon.js` to auto-dump the current DOM snapshot.

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const USER_DATA_DIR = path.join(PROJECT_ROOT, '.chrome-profile');

// --- Selectors (confirmed via recon against live DOM) ---
const SELECTORS = {
  // Sign-in gate
  loginIndicator: 'button:has-text("Sign in"), a:has-text("Sign in"), a:has-text("Log in")',

  // Reference image upload (two file inputs present on the video create page)
  imageUploadInput: 'input[type="file"]',

  // Prompt textarea — confirmed placeholder text
  promptTextarea: 'textarea[placeholder="Describe the video you imagine"]',

  // Generate button — confirmed present on video create page
  generateButton: 'button:has-text("Generate")',

  // Result polling
  resultVideo: 'video[src]',
  resultDownloadLink: 'a[href*=".mp4"], a:has-text("Download")',
};

// Navigate directly to Seedance 2 — no model picker interaction needed
const IMAGINEART_URL = 'https://www.imagine.art';
const VIDEO_CREATE_URL = 'https://www.imagine.art/video/create/seedance-2';

// --- Helpers ---

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

function tsSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function screenshot(page, outputDir, label) {
  const file = path.join(outputDir, `${tsSlug()}--${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function waitForUserLogin(page, timeoutMs = 5 * 60 * 1000) {
  // If a sign-in control is visible, block until it disappears (user logged in).
  const loginVisible = await page.locator(SELECTORS.loginIndicator).first().isVisible().catch(() => false);
  if (!loginVisible) return false;

  console.log('\n⚠️  Not signed in. Please log in manually in the opened browser window.');
  console.log('    Waiting up to 5 minutes for login to complete...\n');
  await page.locator(SELECTORS.loginIndicator).first().waitFor({ state: 'detached', timeout: timeoutMs }).catch(() => {});
  return true;
}

// --- Main drive function ---

export async function drive({ prompt, imagePath, outputDir, headless = false }) {
  if (!prompt) throw new Error('drive() requires a prompt');
  await ensureDir(USER_DATA_DIR);
  await ensureDir(outputDir);

  const screenshots = [];

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless,
    viewport: { width: 1440, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    // First hit the home page to check login state
    console.log('→ Navigating to ImagineArt...');
    await page.goto(IMAGINEART_URL, { waitUntil: 'domcontentloaded' });
    screenshots.push(await screenshot(page, outputDir, '01-landing'));

    await waitForUserLogin(page);
    screenshots.push(await screenshot(page, outputDir, '02-authed'));

    // Navigate directly to Seedance 2 video create page — no model picker needed
    console.log('→ Opening Seedance 2 video creator...');
    await page.goto(VIDEO_CREATE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000); // SPA hydration
    screenshots.push(await screenshot(page, outputDir, '03-video-create'));

    // --- Upload reference image if provided ---
    if (imagePath) {
      console.log(`→ Uploading reference image: ${imagePath}`);
      const fileInput = page.locator(SELECTORS.imageUploadInput).first();
      await fileInput.setInputFiles(imagePath);
      await page.waitForTimeout(1500);
      screenshots.push(await screenshot(page, outputDir, '04-image-uploaded'));
    }

    // --- Enter prompt ---
    console.log('→ Entering prompt...');
    const promptEl = page.locator(SELECTORS.promptTextarea).first();
    await promptEl.click();
    await promptEl.fill('');
    await promptEl.type(prompt, { delay: 12 }); // visible typing for camera
    screenshots.push(await screenshot(page, outputDir, '05-prompt-entered'));

    // --- Generate ---
    console.log('→ Triggering generation...');
    const generateBtn = page.locator(SELECTORS.generateButton).first();
    await generateBtn.click();
    screenshots.push(await screenshot(page, outputDir, '06-generating'));

    // --- Wait for result ---
    console.log('→ Waiting for render (up to 5 min)...');
    const videoEl = page.locator(SELECTORS.resultVideo).first();
    await videoEl.waitFor({ state: 'visible', timeout: 5 * 60 * 1000 }).catch(() => {});

    const videoUrl = await videoEl.getAttribute('src').catch(() => null);
    screenshots.push(await screenshot(page, outputDir, '07-result'));

    if (videoUrl) {
      console.log(`✓ Video ready: ${videoUrl}`);
    } else {
      console.warn('⚠️  Video element not found. Check screenshots in outputs/.');
    }

    return { videoUrl, screenshots };
  } finally {
    // Keep window open a beat so the user/camera sees the result, then close.
    await page.waitForTimeout(4000);
    await context.close();
  }
}
