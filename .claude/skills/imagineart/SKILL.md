---
name: imagineart
description: Drive ImagineArt via Playwright to generate a video from a prompt (and optional reference image). Use when the user asks to "generate a video", "make an ImagineArt shot", "create an ImagineArt clip", or names a shot they want rendered. Opens a visible Chrome window so the browser automation is on-camera.
---

# ImagineArt — automated generator

This skill turns a creative brief into a finished video clip by driving ImagineArt's web UI directly. It's designed to be **visible** — a real Chrome window opens, Claude's script clicks through the UI, and the user watches the generation happen in real time. This is the shot used in the ImagineArt × Claude video.

## When to invoke

- User says some variant of: "generate a video of X", "make an ImagineArt clip", "run it through ImagineArt", "create a shot".
- User provides a prompt, an optional reference image, or both.
- User is ready for a visible browser automation run (not silent/headless).

### Special intent: "run the product shoot" / "full campaign" / "autopilot"

If the user says "run the product shoot", "full campaign", "autopilot", "build me a campaign", or anything that implies *generating a complete set of hero video + style variants + upscale from one product photo*, route to the **product shoot flow**:

```bash
cd "/Users/liamjohnston/Coding Projects/Higgsfield X Claude" && \
  node automation/product-shoot.js
```

Edit `PRODUCT_IMAGE` and `PRODUCT_DESCRIPTION` at the top of `product-shoot.js` to match the product. The script runs three stages automatically: hero video (Seedance 2, 360° orbit), three brand-style image variants, and a 4K upscale — all without touching anything.

### Special intent: "create AI UGC" / "create a UGC creator"

If the user says "create AI UGC", "make a UGC creator", "generate a creator", "run the UGC factory", or anything that implies *synthesizing a character and animating it through multiple shots*, route to the **UGC factory flow** instead of the single-shot flow:

```bash
cd "/Users/liamjohnston/Coding Projects/Higgsfield X Claude" && \
  node automation/ugc.js
```

That script has the full character brief + shot library hardcoded at the top. It generates images then runs them through the video generator for each shot in the library. Edit the constants in `ugc.js` to change the character or shot list.

## What to do

### 1. Gather the brief

If the user gave a vague brief ("make me a cool product shot"), **do not invoke the automation yet**. First, architect the prompt using the rules in `prompt-architecture.md` (read it now if you haven't). A good ImagineArt video prompt specifies:

- **Subject** — who/what, described visually
- **Action** — what they're doing, with specific verbs
- **Camera motion** — dolly in, orbit, handheld, static, crane
- **Lighting** — key light direction, color, hardness
- **Style** — cinematic, documentary, anime, etc.
- **Duration/pacing cue** — optional

Draft the prompt, show it to the user in a code block, and confirm before running. If the user already wrote a prompt, skip confirmation and use theirs verbatim.

### 2. Decide on a reference image

ImagineArt supports image-to-video. Options:
- User supplied an image path → use it
- User wants a fresh image → pause and ask if they want to generate one first or proceed text-only
- Check `references/` folder — if there's an obvious match for the brief, offer it

### 3. Run the automation

Invoke from the project root:

```bash
cd "/Users/liamjohnston/Coding Projects/Higgsfield X Claude" && \
  (cd automation && npm install --silent 2>&1 | tail -5 && npx playwright install chromium --with-deps 2>&1 | tail -3) && \
  node automation/run.js \
    --prompt "FULL_PROMPT_HERE" \
    --image "references/IMAGE_FILE" \
    --out outputs
```

Notes:
- `npm install` and `playwright install chromium` are idempotent — safe to re-run, they no-op if already installed.
- Run without `--image` for text-only generation.
- Watch the terminal output. The script screenshots each step into `outputs/` so you have visual evidence of every click.

### 4. First-run login

On the first run, ImagineArt will show the sign-in page. The script detects this and waits up to 5 minutes for the user to log in manually. **Do not try to enter credentials yourself** — credentials handling is a prohibited action. Tell the user out loud: "Log into ImagineArt in the window that just opened, then I'll take over."

Subsequent runs reuse the `.chrome-profile/` directory and skip login.

### 5. Report the result

When `node run.js` exits, parse its `=== RESULT ===` JSON block. Surface:
- The video URL (`videoUrl` field)
- The screenshot paths (for the user to drop into their video edit)
- Any warnings (e.g., "video model option not found" — means selectors need patching)

If selectors failed, run `node automation/recon.js` next — it dumps the current DOM so you can patch `SELECTORS` in `automation/imagineart.js`.

## Files in this skill

- `SKILL.md` — this file
- `prompt-architecture.md` — how to write a good ImagineArt video prompt (read before drafting)

## Files in the project used by this skill

- `automation/imagineart.js` — Playwright driver (selectors + flow)
- `automation/run.js` — CLI wrapper
- `automation/recon.js` — DOM dump for patching selectors
- `references/` — source images for image-to-video
- `outputs/` — generated videos + step-by-step screenshots
- `.chrome-profile/` — persistent Chromium profile (login state)

## Failure modes and recovery

| Symptom | Cause | Fix |
|---|---|---|
| "Could not find video model option" warning | ImagineArt renamed/moved the model picker | Run `recon.js`, patch `SELECTORS.modelPickerTrigger` and `SELECTORS.videoModelOption` in `imagineart.js` |
| Video never appears, 5min timeout | Generation queue slow, or result DOM changed | Check screenshots in `outputs/`. If generation finished visually but selector missed it, patch `SELECTORS.resultVideo` |
| Login loop — script keeps waiting | Cloudflare or 2FA blocking | User finishes challenge manually; the wait-for-login loop handles it |
| Prompt typed into wrong element | Multiple textareas/contenteditables on page | Tighten `SELECTORS.promptTextarea` using recon output |
