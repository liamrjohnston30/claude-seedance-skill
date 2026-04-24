// product-shoot.js — Full autopilot product campaign from one photo
//
// Flow (matches the video script):
//   Stage 1 — Hero shot: navigate to Seedance 2 video create, upload product
//             photo, type hero prompt (studio lighting), generate.
//   Stage 2 — Image generation: navigate to image create, type three brand-style
//             variants back-to-back (pulled from BRAND_STYLES), generate each.
//   Stage 3 — Upscale: navigate to /upscale, upload the original photo, trigger.
//
// What you need to do: drop your product photo into references/ and set
// PRODUCT_IMAGE and PRODUCT_DESCRIPTION below. Everything else is autopilot.
//
// Reliability is second to "looks great on camera". Every step is try/catch.
// Selector miss? Log, beat, move on.

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const USER_DATA_DIR = path.join(PROJECT_ROOT, '.chrome-profile');

// =============================================================================
// EDIT THESE — everything else is autopilot
// =============================================================================

// Drop your product photo into references/ and set the filename here
const PRODUCT_IMAGE = path.join(PROJECT_ROOT, 'references', 'product.png');

// One-line description of the product (used to build all prompts)
const PRODUCT_DESCRIPTION = 'bright blue running sneakers with a white midsole, mesh upper, and blue laces';

// Three brand style variants for the image generation stage
const BRAND_STYLES = [
  'clean studio shot, pure white background, soft diffused overhead light, commercial athletic footwear photography, sharp focus, ultra-detailed, product centered',
  'dark performance aesthetic, deep black background, single dramatic rim light highlighting the blue mesh, moody shadows, Nike/Adidas campaign style',
  'outdoor lifestyle shot, running on wet asphalt at golden hour, motion blur on background, crisp shoe in focus, dynamic athletic energy, editorial sports magazine',
];

// =============================================================================
// Selectors — confirmed via recon
// =============================================================================

const SEL = {
  // Video create page (Seedance 2)
  videoPrompt: 'textarea[placeholder="Describe the video you imagine"]',
  videoGenerate: 'button:has-text("Generate")',
  videoFileInput: 'input[type="file"]',

  // Image create page — ProseMirror contenteditable, confirmed via recon
  imagePrompt: 'div.tiptap.ProseMirror',
  imageGenerate: 'button:has-text("Create")',
  imageFileInput: 'input[type="file"]',

  // Upscale page — uses asset picker modal, not direct file input
  upscalePickerBtn: 'button:has-text("Upload Media")',
};

const URLS = {
  videoCreate: 'https://www.imagine.art/video/create/seedance-2',
  imageCreate: 'https://www.imagine.art/image?modelListId=70&mode=create&editorMode=default',
  upscale: 'https://www.imagine.art/upscale',
};

// =============================================================================
// Helpers
// =============================================================================

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) { console.log(msg); }

async function typePrompt(page, selector, text) {
  try {
    const el = page.locator(selector).first();
    await el.waitFor({ state: 'visible', timeout: 10000 });
    await el.click({ timeout: 8000, force: true });
    // Works for both textarea and ProseMirror contenteditable
    await page.keyboard.press('Meta+A').catch(() => {});
    await page.keyboard.press('Backspace').catch(() => {});
    await el.pressSequentially(text, { delay: 18 }); // dramatic typing for camera
    return true;
  } catch (err) {
    log(`  ⚠ typing failed: ${err.message.split('\n')[0]}`);
    return false;
  }
}

async function clickGenerate(page, selector) {
  try {
    const btn = page.locator(selector).first();
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    // Wait up to 8s for button to become enabled (it's disabled until prompt is typed)
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel) ||
          [...document.querySelectorAll('button')].find(b =>
            b.textContent.trim() === 'Generate' || b.textContent.trim() === 'Create'
          );
        return el && !el.disabled;
      },
      selector,
      { timeout: 8000 }
    ).catch(() => {});
    await btn.click({ timeout: 5000, force: true });
    log('  ✓ Generate clicked');
    return true;
  } catch (err) {
    log(`  ⚠ generate failed: ${err.message.split('\n')[0]}`);
    return false;
  }
}

async function uploadFile(page, fileInputSelector, filePath) {
  try {
    // Try direct setInputFiles first (works when input is accessible)
    const input = page.locator(fileInputSelector).first();
    await input.setInputFiles(filePath, { timeout: 5000 });
    log(`  ✓ Uploaded: ${path.basename(filePath)}`);
    return true;
  } catch {
    // Fallback: click the upload button to open file picker, then intercept
    try {
      const [fileChooser] = await Promise.all([
        page.waitForFileChooser({ timeout: 5000 }),
        page.locator(SEL.upscaleUpload).first().click({ timeout: 3000 }).catch(() => {}),
      ]);
      await fileChooser.setFiles(filePath);
      log(`  ✓ Uploaded via file chooser: ${path.basename(filePath)}`);
      return true;
    } catch (err) {
      log(`  ⚠ upload failed: ${err.message.split('\n')[0]}`);
      return false;
    }
  }
}

async function navigate(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await Promise.race([
    page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}),
    pause(4000),
  ]);
  await pause(1500);
}

// =============================================================================
// Main
// =============================================================================

async function run() {
  // Check product image exists
  try {
    await fs.access(PRODUCT_IMAGE);
  } catch {
    log(`✗ Product image not found: ${PRODUCT_IMAGE}`);
    log('  Drop your photo into references/product.png (or update PRODUCT_IMAGE in this file)');
    process.exit(1);
  }

  log('');
  log('╔═══════════════════════════════════════════════════════════╗');
  log('║  Product Shoot Autopilot — ImagineArt × Claude            ║');
  log(`║  Product: ${PRODUCT_DESCRIPTION.slice(0, 44).padEnd(44)}  ║`);
  log(`║  Stages: Hero Video → ${BRAND_STYLES.length} Style Variants → Upscale       ║`);
  log('╚═══════════════════════════════════════════════════════════╝');
  log('');

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });

  const page = context.pages()[0] || (await context.newPage());

  try {
    // -------------------------------------------------------------------------
    // Stage 1 — Hero video shot
    // -------------------------------------------------------------------------
    log('━━━  STAGE 1: Hero video shot  ━━━');
    log('→ Opening Seedance 2 video creator...');
    await navigate(page, URLS.videoCreate);

    const heroVideoPrompt =
      `${PRODUCT_DESCRIPTION}. Product rotates slowly on a clean white pedestal. ` +
      `Smooth 360° orbit, camera at product level. ` +
      `Soft studio three-point lighting, subtle specular highlights on the packaging. ` +
      `Commercial product video, 4K crisp, no motion blur.`;

    log('→ Typing hero video prompt...');
    const videoTyped = await typePrompt(page, SEL.videoPrompt, heroVideoPrompt);
    await pause(500);

    if (videoTyped) {
      log('→ Uploading product image...');
      await uploadFile(page, SEL.videoFileInput, PRODUCT_IMAGE);
      await pause(1500);
      log('→ Generating hero video...');
      await clickGenerate(page, SEL.videoGenerate);
      await pause(3000); // let generation queue, then move on
    }

    log('');

    // -------------------------------------------------------------------------
    // Stage 2 — Three brand style image variants
    // -------------------------------------------------------------------------
    log('━━━  STAGE 2: Brand style variants  ━━━');
    log('→ Opening image generator...');
    await navigate(page, URLS.imageCreate);

    // Wait for the ProseMirror editor to appear (it loads after hydration)
    log('→ Waiting for image editor to load...');
    await page.locator('div.tiptap.ProseMirror').first().waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});

    for (let i = 0; i < BRAND_STYLES.length; i++) {
      log('');
      log(`→ Style ${i + 1}/${BRAND_STYLES.length}: ${BRAND_STYLES[i].slice(0, 55)}...`);

      // Re-wait for editor each iteration — after Create is clicked the UI can shift
      await page.locator(SEL.imagePrompt).first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});

      const fullPrompt = `${PRODUCT_DESCRIPTION}, ${BRAND_STYLES[i]}`;
      const typed = await typePrompt(page, SEL.imagePrompt, fullPrompt);
      if (!typed) { await pause(800); continue; }
      await pause(400);

      if (page.isClosed()) { log('✗ Browser closed — aborting'); break; }
      await clickGenerate(page, SEL.imageGenerate);
      await pause(3500); // beat longer so the generation queues and editor resets
    }

    log('');

    // -------------------------------------------------------------------------
    // Stage 3 — Upscale (Magnific Precision v2, 4x)
    // -------------------------------------------------------------------------
    log('━━━  STAGE 3: 4K upscale  ━━━');
    log('→ Opening upscale tool...');
    await navigate(page, URLS.upscale);

    // Click "Upload Media" to open the asset picker modal
    log('→ Opening asset picker...');
    await page.locator('button:has-text("Upload Media")').first().click({ timeout: 5000 }).catch(() => {});
    await pause(1500);

    // Select the most recent image (first "Select Image" in modal = latest generation)
    log('→ Selecting most recent generated image...');
    const selectImg = page.locator('button:has-text("Select Image")').first();
    await selectImg.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
    await selectImg.click({ timeout: 3000 }).catch(() => {});
    await pause(2000);

    // Set scale to 4x — click through 2x → 4x for on-camera drama
    log('→ Setting scale to 4x...');
    await page.locator('button:has-text("2x")').first().click({ timeout: 3000 }).catch(() => {});
    await pause(600);
    await page.locator('button:has-text("4x")').first().click({ timeout: 3000 }).catch(() => {});
    await pause(600);

    // Open Parameters panel to show Claude adjusting settings
    log('→ Expanding parameters...');
    await page.locator('button:has-text("Parameters")').first().click({ timeout: 3000 }).catch(() => {});
    await pause(1500);

    // Trigger the upscale
    log('→ Triggering upscale...');
    // Use last "Upscale" button — the one inside the editor panel, not the sidebar nav
    const upscaleBtns = page.locator('button:has-text("Upscale")');
    const count = await upscaleBtns.count().catch(() => 0);
    const upscaleBtn = count > 1 ? upscaleBtns.last() : upscaleBtns.first();
    await upscaleBtn.click({ timeout: 5000, force: true }).catch(() => {});
    log('  ✓ Upscale triggered');

    await pause(3000);

    log('');
    log('━━━  Campaign complete  ━━━');
    log(`✓ Hero video + ${BRAND_STYLES.length} style variants + upscale — all queued on ImagineArt.`);
    log('');

    // Hold so camera catches the final state
    await pause(6000);

  } catch (err) {
    log('');
    log(`✗ Top-level error: ${err.message}`);
  } finally {
    await context.close();
  }
}

run();
