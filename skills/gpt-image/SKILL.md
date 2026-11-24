---
name: gpt-image
description: Generate images with OpenAI GPT Image at maximum settings, or make a new image from reference images (same style as an article cover, same location as a video frame). Use for article covers, b-roll stills for Seedance, illustrations, logos-on-scene shots, social images. Not for editing photos pixel-for-pixel.
metadata: {"openclaw":{"requires":{"bins":["python3"],"env":["OPENAI_API_KEY"]},"primaryEnv":"OPENAI_API_KEY"}}
---

# GPT Image

```bash
PY=~/.content-skills/venv/bin/python
G="<this skill's base directory>/scripts/generate_image.py"

# New image
$PY "$G" --prompt "<prompt>" --size 3840x2160 --output-dir /tmp/img/cover

# New image that follows reference images (style, location, brand assets). Up to 16 references.
$PY "$G" --prompt "<prompt>" --reference /tmp/original-cover.jpg --reference /tmp/logo.png --size 3840x2160 --output-dir /tmp/img/cover
```

The script prints the saved file paths. Files are named `generated_<i>.<format>` and get overwritten,
so give every image its own `--output-dir`. A max-settings image takes about 2 minutes: use a 10 minute timeout.

## Defaults (maximum quality; lower only when the user asks for a draft)

| Setting | Default | Notes |
|---|---|---|
| `--model` | `$OPENAI_IMAGE_MODEL` or `gpt-image-2.6-sunburst` | `gpt-image-2.6-flare` for fast drafts |
| `--quality` | `max` | `low, medium, high, xhigh, max, auto` |
| `--complexity` | `high` | how much the model plans first |
| `--size` | `2880x2880` | landscape `3840x2160`, portrait `2160x3840` |
| `--format` | `png` | `png, webp, jpeg` |
| `--background` | `opaque` | `transparent` for cut-out assets |

Size rules: both edges multiples of 16, max 3840 per edge, 655,360 to 8,294,400 pixels, ratio between 1:3 and 3:1.
Sizes above 2560x1440 are experimental. If one fails, retry once, then use 2560x1440 / 1440x2560 / 1920x1920 and say so.

## Prompting tips that held up

- **Match an existing look:** pass the original cover or a frame of the user's footage as `--reference` and say
  "create a NEW image in exactly this style / on this exact location, same light, same lens". Name what must NOT
  appear (e.g. "the person must not appear").
- **Real brand context beats metaphors.** Show the actual logos, products and proof (a #1 Product of the Day badge,
  the real app UI) rather than generic symbols. Fetch real logos from the company website and pass them as references.
- **Stills for Seedance:** keep the subject in the central 60% (split screens crop the sides), 4:3 or 16:9,
  and leave text out if it will be animated (overlay it later).
- **Watch literal objects:** "golden trophy" became an Oscar statuette; "two-handled loving cup" did not.
- Before uploading a 4K still to Postiz, downscale to 2560px; very large PNGs are rejected.

## Requirements

`OPENAI_API_KEY` in `~/.content-skills/.env`. The `openai` Python package lives in `~/.content-skills/venv` (install.sh).
