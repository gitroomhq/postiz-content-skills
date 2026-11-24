---
name: remotion-shorts
description: Render 1080x1920 vertical Shorts from clips with the bundled Remotion templates - one video fullscreen (center-cropped) or two videos stacked top/bottom (split screen). Use for "make a short", "split screen short", "fullscreen short", or when video-shorts assembles its shots.
metadata:
  tags: remotion, video, shorts, vertical, render
---

# Remotion Shorts

The Remotion project lives at `~/.content-skills/remotion-template` (install.sh copies it there from this
skill's `template/` folder and runs `npm ci`). If it is missing:

```bash
mkdir -p ~/.content-skills && cp -R "<this skill's base directory>/template" ~/.content-skills/remotion-template
cd ~/.content-skills/remotion-template && npm ci
```

| Composition | Use | Props |
|---|---|---|
| `Fullscreen` | one clip fills 1080x1920 | `videoSrc` |
| `SplitVertical` | two clips, 1080x960 each, top + bottom | `topVideoSrc`, `bottomVideoSrc` |

Every clip is center-cropped (`object-fit: cover`), never stretched. Duration follows the source
(the longer clip for the split; the shorter one freezes on its last frame). 30 fps.

## Render

1. Local files go into `public/inputs/` and are referenced as `inputs/<name>`. URLs work as-is.

```bash
T=~/.content-skills/remotion-template
mkdir -p $T/public/inputs && cp /tmp/short/top.mp4 /tmp/short/bottom.mp4 $T/public/inputs/
cd $T
npx remotion render SplitVertical /tmp/short/shot-03.mp4 --props='{"topVideoSrc":"inputs/top.mp4","bottomVideoSrc":"inputs/bottom.mp4"}'
npx remotion render Fullscreen /tmp/short/shot-01.mp4 --props='{"videoSrc":"inputs/talk.mp4"}'
```

2. Don't pass `--frames` or `--scale`. Use absolute output paths.
3. Clean `public/inputs/` when the job is done.

## Framing facts

- A 16:9 clip in a split slot keeps only its central ~63% width (1215 of 1920 px). Keep subjects central.
- In Fullscreen a 16:9 clip keeps only the central 32% width. That's fine for a centred talking head, not for wide b-roll.
- A 1080p source shown full-screen is upscaled ~1.8x. Render talking heads at 2k when they go full-screen.

## License note

Remotion is free for individuals and companies with up to 3 people. Bigger companies need a license:
https://www.remotion.dev/license
