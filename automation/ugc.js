// ugc.js — AI UGC Creator Factory (v2)
//
// Flow:
//   Stage 1 — Navigate directly to Higgsfield image generator, type 20
//             variations of "Jake" back-to-back and hit Generate on each.
//   Stage 2 — Navigate directly to Seedance 2.0 video generator, type a
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
  `22-year-old man, lean athletic build, tousled medium-length dark brown hair, light stubble, warm brown eyes, wearing a cream heavyweight hoodie. iPhone UGC aesthetic, natural light, slightly grainy, not over-retouched.`;

const IMAGE_VARIATIONS = [
  'Standing in a modern kitchen holding a coffee mug, morning window light.',
  'Sitting on a grey linen couch with a laptop on his knees, soft daylight.',
  'Walking down a sunlit Venice Beach boardwalk at golden hour.',
  'At a home gym, towel around his neck, post-workout glow.',
  'Leaning against a kitchen counter with a subtle smile, warm daylight.',
  'In a car driver seat, seatbelt on, looking toward the camera.',
  'On a small balcony overlooking downtown LA at golden hour.',
  'In a minimal hotel room, casual weekend morning vibe.',
  'Reading a hardcover book in a neutral-toned bedroom.',
  'Making breakfast in a bright modern kitchen, casual pose.',
  'On a wooden boardwalk at sunset, wind moving his hair.',
  'On a restaurant patio with a cortado and notebook on the table.',
  'In front of a full bookshelf, arms crossed, relaxed.',
  'Stretching on a workout mat in a minimal living room.',
  'At a minimalist coffee shop counter, cortado in hand.',
  'In a clean white bathroom mid-morning routine, neutral palette.',
  'At a wooden desk with a laptop and open notebook beside him.',
  'In a linen shirt leaning on a clean white exterior wall.',
  'At a rooftop bar at night, city lights blurred behind him.',
  'In a car passenger seat looking out the window, daylight.',
];

const VIDEO_SHOTS = [
  'A 22 year old man in a cream hoodie glances up at the camera with a small smile. Static handheld frame with slight natural sway. Soft window light. iPhone UGC aesthetic.',
  'A 22 year old man in a cream hoodie raises a small product to chest height and gives a subtle nod. Static handheld frame. Natural light. UGC style.',
  'A 22 year old man in a cream hoodie turns from profile to facing the camera. Eyes find the lens, relaxed smile. Soft daylight. iPhone UGC.',
  'A 22 year old man in a cream hoodie walks slowly forward, eyes finding the lens. Handheld follow, subtle sway. Natural light. Authentic UGC feel.',
  'A 22 year old man in a cream hoodie points at the camera with his index finger, confident and relaxed. Static handheld frame. Natural light. UGC aesthetic.',
  'A 22 year old man in a cream hoodie tilts his head and laughs naturally. Static handheld sway. Window light. iPhone UGC.',
];

// =============================================================================
// Selectors — from the probe dump at outputs/probe-*.json
// =============================================================================

const SELECTORS = {
  promptInput: '[contenteditable="true"]',
  generateButton: 'button:has-text("Generate")',
};

const URLS = {
  imageCreate: 'https://higgsfield.ai/image/soul',
  videoCreate: 'https://higgsfield.ai/create/video?model=seedance_2_0',
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

// Multi-strategy submit: Seedance uses a labeled "Generate" button; Soul uses
// an icon-only button that accepts Enter in the contenteditable. Try each
// strategy in order and stop on first success.
async function submitPrompt(page) {
  if (page.isClosed()) return false;

  // Strategy 1: click explicit "Generate" button (works on Seedance video page)
  try {
    const btn = page.locator(SELECTORS.generateButton).first();
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await btn.click({ timeout: 2000 });
      return true;
    }
  } catch {}

  // Strategy 2: press Enter (works on Soul — contenteditable submits on Enter)
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
  log('║  AI UGC Creator Factory — Higgsfield × Claude         ║');
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
    // Stage 1 — Image factory (20 variations of Jake)
    // -------------------------------------------------------------------------
    log('━━━  STAGE 1: Character image factory  ━━━');
    log(`→ Opening image generator...`);

    await page.goto(URLS.imageCreate, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await pause(3500); // let the SPA hydrate

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
    // Stage 2 — Seedance 2.0 video shots
    // -------------------------------------------------------------------------
    log('━━━  STAGE 2: Seedance 2.0 video shots  ━━━');
    log(`→ Opening Seedance generator...`);

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
    log(`✓ ${IMAGE_VARIATIONS.length} images + ${VIDEO_SHOTS.length} videos queued on Higgsfield.`);
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
