# Higgsfield X Claude

Claude Code + Playwright automation for Higgsfield Seedance 2.0. Built as the content pipeline for the Higgsfield brand-deal video.

## What this does

A Claude Code skill (`higgsfield-seedance`) that opens a real Chrome window, navigates to Higgsfield, selects Seedance 2.0, uploads a reference image, pastes a prompt, and generates a video — all visibly, so the browser automation is on-camera.

## Layout

```
.
├── .claude/skills/higgsfield-seedance/   Skill definition + prompt rules
├── automation/                           Playwright scripts
│   ├── higgsfield.js                     Core driver (edit SELECTORS here)
│   ├── run.js                            CLI entry
│   ├── recon.js                          DOM dump for patching selectors
│   └── package.json
├── references/                           Reference images for image-to-video
├── outputs/                              Generated videos + step screenshots
└── .chrome-profile/                      Persistent login state (gitignored)
```

## First run

1. Drop reference images into `references/`.
2. In Claude Code, invoke the skill: describe the shot you want.
3. A Chrome window opens on higgsfield.ai. **Log in manually the first time.** The script waits up to 5 min for you to finish.
4. Once logged in, the script takes over: picks Seedance 2.0, uploads image, types prompt, hits generate.
5. Result video URL + step-by-step screenshots land in `outputs/`.

Login persists via `.chrome-profile/` — subsequent runs skip step 3.

## Manual run (without the skill)

```bash
cd automation
npm install
npx playwright install chromium
node run.js \
  --prompt "your seedance prompt" \
  --image ../references/hero.png \
  --out ../outputs
```

## When Higgsfield changes their UI

Selectors will drift. When that happens:

```bash
cd automation
node recon.js
```

It opens a browser, waits for you to navigate to the generator page, then dumps every button / textarea / file input / video element to `outputs/recon-*.json`. Use that to patch `SELECTORS` in `higgsfield.js`.

## Prompt architecture

See `.claude/skills/higgsfield-seedance/prompt-architecture.md` — the five-slot structure (subject, action, camera, lighting, style) Seedance 2.0 responds best to.
