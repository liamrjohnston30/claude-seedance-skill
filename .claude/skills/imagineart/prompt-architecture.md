# ImagineArt video — prompt architecture

ImagineArt's video generator is an image-to-video model. The reference image carries subject and composition; the prompt primarily describes **motion, camera, and atmosphere**. Think of it less like a text-to-image prompt and more like a one-shot director's note.

## The five-slot structure

Every prompt should fill these five slots, in this order. Skipping slots produces floaty, generic motion.

### 1. Subject anchor (1 sentence)
Ground the viewer in what the reference image shows, in your own words. This tells the model what to preserve. Don't describe things not in the image.

> "A woman in a red trench coat standing in a rain-soaked Tokyo alley at night."

### 2. Action verb (specific, not abstract)
What happens. Use concrete verbs — "turns", "reaches", "exhales", "steps forward" — not vague ones like "moves" or "does".

> "She slowly turns her head toward the camera and raises a gloved hand."

### 3. Camera motion (named technique)
Name the cinematic technique: *dolly in*, *dolly out*, *orbit left/right*, *crane up*, *handheld push*, *static locked-off*, *whip pan*, *rack focus*. If the shot should not move, say so explicitly — "static camera, no movement".

> "Slow dolly in from medium to close-up."

### 4. Lighting and atmosphere
Describe the dominant light source and quality. Name color temperature, hardness, direction. Mention practicals (neon, candlelight, screen glow) if visible.

> "Hard neon key from camera left, cyan and magenta spill, volumetric rain haze."

### 5. Style and pacing
Reference aesthetic + optional tempo. Cinematic film emulation, anime, documentary handheld, commercial glossy, film grain. Add pacing if the shot has a beat: "deliberate", "urgent", "languid".

> "Cinematic, 35mm film grain, deliberate pacing."

## Full example

Bad (generic, no structure):
> "Woman in red coat walking in Tokyo, cool vibe"

Good (five slots filled):
> "A woman in a red trench coat stands in a rain-soaked Tokyo alley at night. She slowly turns her head toward the camera and raises a gloved hand. Slow dolly in from medium to close-up. Hard neon key from camera left, cyan and magenta spill, volumetric rain haze. Cinematic, 35mm film grain, deliberate pacing."

## Common failure modes

| Symptom | Usually caused by | Fix |
|---|---|---|
| Subject melts / morphs | Describing something not in the reference image | Anchor the subject to what's actually there |
| Camera drifts randomly | No camera motion specified | Name the technique explicitly, even if it's "static" |
| Motion looks AI-generic | Abstract action verbs ("moves", "does something") | Use concrete physical verbs |
| Lighting flickers | No light source specified | Name the key light direction and color |
| Over-long, ignored details | More than ~80 words | Cut to the five essentials |

## Shot types worth memorizing

- **Reveal**: static subject → slow dolly in or crane down → detail snaps into focus
- **Orbit hero**: subject centered, camera orbits 90–180°, used for product/logo reveals
- **Parallax push**: foreground + midground + background, slow handheld push, feels filmic
- **Locked-off beauty**: static camera, subject action-driven — easiest to get clean, best for cutaways
- **Whip transition**: fast camera pan in one direction, used as an edit hinge between two shots

## Length budget

Keep prompts under 80 words. Front-load the five slots; cut adjectives that don't change what the model does.
