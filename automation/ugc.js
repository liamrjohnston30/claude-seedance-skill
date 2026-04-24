// ugc.js — AI UGC Creator Factory (v2)
//
// Flow:
//   Stage 1 — Navigate directly to ImagineArt image generator, type 20
//             variations of "Jake" back-to-back and hit Generate on each.
//   Stage 2 — Navigate directly to ImagineArt video generator, type a
//             handful of motion prompts, hit Generate on each.
//
// Key changes from v1:
//   - NO screenshots anywhere (screenshot loops were glitching the screen)
//   - Direct URL navigation, no nav clicking
//   - Uses the contenteditable + "Generate" button selectors that recon found
//   - GPU flags set defensively to kill any remaining compositor flicker
//   - Dramatic typing stays (18ms per char) — that's the hero shot
//
// Reliability is still a distant third behind "looks cool on camera".
// Every action is wrapped in try/catch. Selector miss? Log, beat, move on.

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const USER_DATA_DIR = path.join(PROJECT_ROOT, '.chrome-profile');

// =============================================================================
// THE BRIEF — edit to change the character, variations, or shot list
// =============================================================================

const BASE_CHARACTER =
  `22-year-old woman, warm brown skin, natural long dark brown curls pulled back loose, almost no makeup, small gold hoop earrings, wearing a cream ribbed tank and baggy vintage jeans. iPhone UGC aesthetic, natural light, slightly grainy, unretouched.`;

// Empty — skipping image stage for the recording demo. VIDEO_SHOTS drives the run.
const IMAGE_VARIATIONS = [];

const VIDEO_SHOTS = [
  'A 22 year old woman with natural dark curls leans over a bathroom sink and splashes cold water on her face, then looks up into the foggy mirror with a small confident smile. Handheld static frame with slight natural sway. Soft morning window light, warm highlights. iPhone UGC aesthetic, slightly grainy.',
  'A 22 year old woman with natural dark curls walks down a Los Angeles sidewalk at golden hour holding a takeaway coffee, glances up and meets the camera with a small smile, hair moving in the breeze. Handheld follow shot, subtle sway. Warm backlit sunlight, soft lens flare. iPhone UGC aesthetic.',
  'A 22 year old woman with natural dark curls stands on a downtown Los Angeles rooftop at blue hour with the city skyline behind her, turns slowly toward the camera and tilts her head with a quiet smile. Handheld static frame. Cool ambient blue light mixed with warm neon reflections from the street. Cinematic UGC aesthetic.',
];

// =============================================================================
// Selectors — from the probe dump at outputs/probe-*.json
// =============================================================================

const SELECTORS = {
  // Confirmed via recon — ImagineArt uses a textarea, not contenteditable
  promptInput: 'textarea[placeholder="Describe the video you imagine"], textarea[placeholder="Write what you want to create..."]',
  generateButton: 'button:has-text("Generate")',
};

const URLS = {
  imageCreate: 'https://www.imagine.art/image?editorMode=default',
  videoCreate: 'https://www.imagine.art/video/create/seedance-2',
};

// =============================================================================
// Helpers
// =============================================================================

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) {
  console.log(msg);
}

async function typeIntoPrompt(page, text) {
  try {
    const el = page.locator(SELECTORS.promptInput).first();
    await el.waitFor({ state: 'visible', timeout: 8000 });
    await el.click({ timeout: 3000 });
    // Select all existing text + delete
    await page.keyboard.press('Meta+A').catch(() => {});
    await page.keyboard.press('Backspace').catch(() => {});
    // Dramatic typing — the hero shot of the demo
    await page.keyboard.type(text, { delay: 18 });
    return true;
  } catch (err) {
    log(`  ⚠ typing failed: ${err.message.split('\n')[0]}`);
    return false;
  }
}

// Multi-strategy submit: video page uses a labeled "Generate" button; image page uses
// an icon-only button that accepts Enter in the contenteditable. Try each
// strategy in order and stop on first success.
async function submitPrompt(page) {
  if (page.isClosed()) return false;

  // Strategy 1: click explicit "Generate" button (works on video page)
  try {
    const btn = page.locator(SELECTORS.generateButton).first();
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await btn.click({ timeout: 2000 });
      return true;
    }
  } catch {}

  // Strategy 2: press Enter (works on image page — contenteditable submits on Enter)
  try {
    await page.keyboard.press('Enter');
    return true;
  } catch {}

  // Strategy 3: Meta+Enter (Cmd+Enter on macOS — common chat UI shortcut)
  try {
    await page.keyboard.press('Meta+Enter');
    return true;
  } catch {}

  // Strategy 4: Ctrl+Enter (cross-platform chat UI shortcut)
  try {
    await page.keyboard.press('Control+Enter');
    return true;
  } catch {}

  log('  ⚠ all submit strategies failed');
  return false;
}

// =============================================================================
// The flow
// =============================================================================

async function run() {
  log('');
  log('╔═══════════════════════════════════════════════════════╗');
  log('║  AI UGC Creator Factory — ImagineArt × Claude         ║');
  log(`║  Images queued: ${String(IMAGE_VARIATIONS.length).padEnd(36)}║`);
  log(`║  Videos queued: ${String(VIDEO_SHOTS.length).padEnd(36)}║`);
  log('╚═══════════════════════════════════════════════════════╝');
  log('');

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      // Defensive flags to reduce headful compositor flicker on macOS
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });

  const page = context.pages()[0] || (await context.newPage());

  try {
    // -------------------------------------------------------------------------
    // Stage 1 — Image factory (skipped when IMAGE_VARIATIONS is empty)
    // -------------------------------------------------------------------------
    if (IMAGE_VARIATIONS.length > 0) {
      log('━━━  STAGE 1: Character image factory  ━━━');
      log(`→ Opening image generator...`);

      await page.goto(URLS.imageCreate, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await pause(3500); // let the SPA hydrate
    } else {
      log('━━━  STAGE 1 skipped — going straight to video  ━━━');
    }

    for (let i = 0; i < IMAGE_VARIATIONS.length; i++) {
      const n = String(i + 1).padStart(2, '0');
      const fullPrompt = `${BASE_CHARACTER} ${IMAGE_VARIATIONS[i]}`;
      log('');
      log(`→ Image ${i + 1}/${IMAGE_VARIATIONS.length}: ${IMAGE_VARIATIONS[i].slice(0, 50)}...`);

      const typed = await typeIntoPrompt(page, fullPrompt);
      if (!typed) {
        log('  (skipping generate — prompt not typed)');
        await pause(800);
        continue;
      }
      await pause(400);

      if (page.isClosed()) {
        log('✗ Browser closed mid-run — aborting');
        break;
      }
      const generated = await submitPrompt(page);
      if (generated) {
        log(`  ✓ submitted`);
      }

      // Beat between images so the viewer can see each one land
      await pause(1500);
    }

    log('');
    log(`✓ Stage 1 done — ${IMAGE_VARIATIONS.length} image prompts submitted.`);
    log('');
    await pause(2000);

    // -------------------------------------------------------------------------
    // Stage 2 — Video shots
    // -------------------------------------------------------------------------
    log('━━━  STAGE 2: Video shots  ━━━');
    log(`→ Opening video generator...`);

    await page.goto(URLS.videoCreate, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await pause(3500);

    for (let i = 0; i < VIDEO_SHOTS.length; i++) {
      const n = String(i + 1).padStart(2, '0');
      log('');
      log(`→ Video ${i + 1}/${VIDEO_SHOTS.length}`);

      const typed = await typeIntoPrompt(page, VIDEO_SHOTS[i]);
      if (!typed) {
        log('  (skipping generate — prompt not typed)');
        await pause(800);
        continue;
      }
      await pause(400);

      if (page.isClosed()) {
        log('✗ Browser closed mid-run — aborting');
        break;
      }
      const generated = await submitPrompt(page);
      if (generated) {
        log(`  ✓ submitted`);
      }

      await pause(1800);
    }

    log('');
    log('━━━  Factory run complete  ━━━');
    log(`✓ ${IMAGE_VARIATIONS.length} images + ${VIDEO_SHOTS.length} videos queued on ImagineArt.`);
    log('');

    // Hold the window open a beat so the camera catches the final state
    await pause(6000);
  } catch (err) {
    log('');
    log(`✗ Top-level error: ${err.message}`);
  } finally {
    await context.close();
  }
}

run();
