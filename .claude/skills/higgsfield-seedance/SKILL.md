---
name: higgsfield-seedance
description: Drive Higgsfield Seedance 2.0 via Playwright to generate a video from a prompt (and optional reference image). Use when the user asks to "generate a video", "make a Seedance shot", "create a Higgsfield clip", or names a shot they want rendered. Opens a visible Chrome window so the browser automation is on-camera.
---

# Higgsfield Seedance 2.0 — automated generator

This skill turns a creative brief into a finished Seedance 2.0 clip by driving Higgsfield's web UI directly. It's designed to be **visible** — a real Chrome window opens, Claude's script clicks through the UI, and the user watches the generation happen in real time. This is the shot used in the Higgsfield X Claude video.

## When to invoke

- User says some variant of: "generate a video of X", "make a Seedance clip", "run it through Higgsfield", "create a shot".
- User provides a prompt, an optional reference image, or both.
- User is ready for a visible browser automation run (not silent/headless).

### Special intent: "create AI UGC" / "create a UGC creator"

If the user says "create AI UGC", "make a UGC creator", "generate a creator", "run the UGC factory", or anything that implies *synthesizing a character and animating it through multiple shots*, route to the **UGC factory flow** instead of the single-shot flow:

```bash
cd "/Users/liamjohnston/Coding Projects/Higgsfield X Claude" && \
  node automation/ugc.js
```

That script has the full character brief + shot library hardcoded at the top (`BRIEF` constant in `automation/ugc.js`). It generates an image via Soul/Nano Banana/Flux, then runs it through Seedance 2.0 for each shot in the library. Edit `BRIEF` in `ugc.js` to change the character or shot list. This is the demo flow used in the Higgsfield × Claude video — prioritizes on-camera drama over reliability (try/catch everything, keep going on selector misses).

## What to do

### 1. Gather the brief

If the user gave a vague brief ("make me a cool robot shot"), **do not invoke the automation yet**. First, architect the prompt using the rules in `prompt-architecture.md` (read it now if you haven't). A good Seedance 2.0 prompt specifies:

- **Subject** — who/what, described visually
- **Action** — what they're doing, with specific verbs
- **Camera motion** — dolly in, orbit, handheld, static, crane
- **Lighting** — key light direction, color, hardness
- **Style** — cinematic, documentary, anime, etc.
- **Duration/pacing cue** — optional

Draft the prompt, show it to the user in a code block, and confirm before running. If the user already wrote a prompt, skip confirmation and use theirs verbatim.

### 2. Decide on a reference image

Seedance 2.0 is image-to-video. Options:
- User supplied an image path → use it
- User wants a fresh image → pause and ask if they want to generate one first (e.g., with a text-to-image tool) or proceed text-only
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

On the first run, Higgsfield will show the sign-in page. The script detects this and waits up to 5 minutes for the user to log in manually. **Do not try to enter credentials yourself** — credentials handling is a prohibited action. Tell the user out loud: "Log into Higgsfield in the window that just opened, then I'll take over."

Subsequent runs reuse the `.chrome-profile/` directory and skip login.

### 5. Report the result

When `node run.js` exits, parse its `=== RESULT ===` JSON block. Surface:
- The video URL (`videoUrl` field)
- The screenshot paths (for the user to drop into their video edit)
- Any warnings (e.g., "Seedance option not found" — means selectors need patching)

If selectors failed, run `node automation/recon.js` next — it dumps the current DOM so you can patch `SELECTORS` in `automation/higgsfield.js`.

## Files in this skill

- `SKILL.md` — this file
- `prompt-architecture.md` — how to write a good Seedance 2.0 prompt (read before drafting)

## Files in the project used by this skill

- `automation/higgsfield.js` — Playwright driver (selectors + flow)
- `automation/run.js` — CLI wrapper
- `automation/recon.js` — DOM dump for patching selectors
- `references/` — source images for image-to-video
- `outputs/` — generated videos + step-by-step screenshots
- `.chrome-profile/` — persistent Chromium profile (login state)

## Failure modes and recovery

| Symptom | Cause | Fix |
|---|---|---|
| "Could not find Seedance 2.0 option" warning | Higgsfield renamed/moved the model picker | Run `recon.js`, patch `SELECTORS.modelPickerTrigger` and `SELECTORS.seedanceOption` in `higgsfield.js` |
| Video never appears, 5min timeout | Generation queue slow, or result DOM changed | Check screenshots in `outputs/`. If generation finished visually but selector missed it, patch `SELECTORS.resultVideo` |
| Login loop — script keeps waiting | Cloudflare or 2FA blocking | User finishes challenge manually; the wait-for-login loop handles it |
| Prompt typed into wrong element | Multiple textareas/contenteditables on page | Tighten `SELECTORS.promptTextarea` using recon output |
