---
name: seedance-video
description: Generate AI video with ByteDance Seedance 2.0 through the EvoLink API, from one or two images (image-to-video, first/last frame) or from a mix of reference images, videos and audio (omni reference: copy camera moves, edit or extend a clip). Submits, polls and downloads the MP4 in one command; local files are made public automatically through Postiz. Use for "animate this image", "make a Seedance clip", "b-roll from this still", "reference to video", "replace X in this video".
metadata: {"openclaw":{"requires":{"bins":["node","postiz","ffmpeg"],"env":["EVOLINK_API_KEY"]},"primaryEnv":"EVOLINK_API_KEY"}}
---

# Seedance 2.0 video (EvoLink)

```bash
S="<this skill's base directory>/seedance.js"

# Image to video (b-roll)
node "$S" --mode i2v --image /tmp/still.png --duration 4 --silent \
  --prompt "Static locked-off camera: no zoom, no pan. ..." --out /tmp/broll-01.mp4

# Omni reference: tag inputs as @image1.., @video1.., @audio1.. in the prompt
node "$S" --mode reference --image /tmp/product.png --video /tmp/move.mp4 \
  --prompt "Follow the camera movement of @video1. The product in @image1 rotates on a desk." --out /tmp/ref.mp4
```

Stdout is JSON with `file.path`. Logs go to stderr. Run long jobs in the background.
`--dry-run` shows the request and the estimated cost without spending anything.
`--no-wait` returns a `task_id`; `--task <id> --out x.mp4` resumes later.

Local paths are uploaded with `postiz upload` (EvoLink needs public URLs, and its own upload takes images only).
Images over 8 MB are downscaled to 2560px JPEG first, because Postiz rejects very large files.

## Cost and timing (list price, check https://evolink.ai)

- Billed per output second: 480p $0.092/s, 720p $0.199/s, **1080p $0.496/s** (4 s at 1080p is about $1.99).
- Reference videos also bill their input seconds.
- A 4-5 s 1080p job takes 3-13 minutes. It often sits at 95% for a few minutes; it is not stuck.
- Duration is 4-15 s. 4 is the minimum, so generate 4-5 s and cut the best 2-3 s.

## Quality bar (never ship a sloppy clip)

- **Always `--quality 1080p` on the full model.** No 480p/720p or fast variants for anything that ships.
- **The first frame decides the quality.** Feed a sharp, finished still: clean edges, correct logos, readable text.
  Fix or regenerate the still first. Never animate a weak image hoping the video hides it.
- **Lock the camera when anything must stay in frame.** Seedance pushes in hard by default and moves logos out of
  frame within 2 s. Start the prompt with: `Static locked-off camera: no zoom, no pan.`
- **Precise motion prompt:** what moves, how, and what the camera does. "The scene comes to life" gives mushy morphing.
- **Text, numbers and logos:** say they stay perfectly static and sharp. Better: leave text out of the still and
  overlay it afterwards as a Pillow-rendered transparent PNG with ffmpeg `overlay`. Warping letters are the #1 sloppy tell.
- **Line art and diagrams:** a drawn arrow or dotted trail makes the model act the motion out and rearrange the layout.
  Say every element stays where it is drawn; allow only subtle bobbing, blinking and glow.
- **Constant effects:** say "continuously, never fading". "A surge every second" gives on/off gaps.
- **Reference mode copies a held object almost exactly** and pastes a background plate nearly pixel for pixel.
  Describe the space in text instead of passing a background image. Don't ask for "rim light" (it draws a cut-out outline).
- **Editing real talking footage:** send only the segment that needs the effect, starting in a speech pause, and
  splice it back onto the real footage. Sending the whole talking clip breaks lip-sync. Mux the original audio back.
- **Review every clip:** pull frames from start, middle and end and look at them. Reject on warped faces or hands,
  melting text, a logo changing shape, flicker, blur, jitter or morphing. Regenerate until clean.

```bash
for t in 0.3 2 3.7; do ffmpeg -loglevel error -y -ss $t -i clip.mp4 -frames:v 1 /tmp/check_$t.jpg; done
```

## Output facts

- i2v output is 1920x1080 (at 16:9), 24 fps, H.264 + AAC. Reference 4k output is HEVC.
- `aspect_ratio: adaptive` crops to the nearest supported ratio (a 3:2 still becomes 4:3).
- Result URLs expire after 24 hours; the script downloads immediately.
- Failure codes are strings such as `content_policy_violation`:
  https://docs.evolink.ai/en/api-manual/task-management/error-codes
