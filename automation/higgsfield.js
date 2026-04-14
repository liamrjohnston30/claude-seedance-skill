// higgsfield.js — core Playwright automation for driving Higgsfield Seedance 2.0
//
// Design notes:
// - Uses a persistent Chromium user-data-dir so the user stays logged in across runs.
//   First run: user logs in manually, script waits. Subsequent runs: auto-authenticated.
// - Exposes a single drive() function that takes { prompt, imagePath, outputDir } and
//   returns { videoUrl, screenshotPaths }. The CLI wrapper in run.js calls this.
// - Selectors are defined at the top so they can be patched in one place when Higgsfield
//   ships UI changes. Run `node recon.js` to auto-dump the current DOM snapshot.

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const USER_DATA_DIR = path.join(PROJECT_ROOT, '.chrome-profile');

// --- Selectors (update after recon if Higgsfield ships UI changes) ---
// These are initial best-guesses. The first real run will surface the actual selectors
// via recon.js; patch them here and commit.
const SELECTORS = {
  // Sign-in gate
  loginIndicator: 'button:has-text("Sign in"), a:has-text("Sign in"), a:has-text("Log in")',

  // Navigation to Seedance 2.0 model picker
  modelPickerTrigger: 'button:has-text("Model"), [data-testid="model-picker"]',
  seedanceOption: 'text=/Seedance.*2\\.?0/i',

  // Reference image upload
  imageUploadInput: 'input[type="file"]',
  imageUploadDropzone: '[data-testid="upload-zone"], .upload-dropzone, text=/drop.*image/i',

  // Prompt textarea
  promptTextarea: 'textarea[placeholder*="prompt" i], textarea[name="prompt"], [contenteditable="true"]',

  // Generate button
  generateButton: 'button:has-text("Generate"), button:has-text("Create"), button[type="submit"]',

  // Result polling
  resultVideo: 'video[src]',
  resultDownloadLink: 'a[href*=".mp4"], a:has-text("Download")',
};

const HIGGSFIELD_URL = 'https://higgsfield.ai';

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
    console.log('→ Navigating to Higgsfield...');
    await page.goto(HIGGSFIELD_URL, { waitUntil: 'domcontentloaded' });
    screenshots.push(await screenshot(page, outputDir, '01-landing'));

    await waitForUserLogin(page);
    screenshots.push(await screenshot(page, outputDir, '02-authed'));

    // Give the SPA a beat to hydrate
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // --- Pick Seedance 2.0 ---
    // Higgsfield's model picker varies. Try a few strategies:
    console.log('→ Selecting Seedance 2.0...');
    const modelPicker = page.locator(SELECTORS.modelPickerTrigger).first();
    if (await modelPicker.isVisible().catch(() => false)) {
      await modelPicker.click();
      await page.waitForTimeout(500);
    }
    const seedance = page.locator(SELECTORS.seedanceOption).first();
    if (await seedance.isVisible().catch(() => false)) {
      await seedance.click();
    } else {
      console.warn('⚠️  Could not find Seedance 2.0 option with current selectors. Dumping page for recon.');
      screenshots.push(await screenshot(page, outputDir, '03-seedance-not-found'));
    }
    screenshots.push(await screenshot(page, outputDir, '03-model-selected'));

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
