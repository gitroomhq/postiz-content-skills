---
name: heygen-avatar-video
description: |
  Generate a HeyGen talking-head video of the user's own avatar (digital twin + cloned voice) from a script.
  Use when: "make a video of me saying...", "generate my HeyGen video", "turn this script into a video of me",
  or when another skill (video-shorts) needs the presenter clip. The avatar and voice come only from
  ~/.content-skills/.env and must never be changed from the task.
argument-hint: "[script or topic] [--aspect 9:16] [--out file.mp4]"
allowed-tools: Bash, Read, Write
metadata:
  openclaw:
    requires:
      env:
        - HEYGEN_API_KEY
        - HEYGEN_AVATAR_ID
    primaryEnv: HEYGEN_API_KEY
---

# HeyGen avatar video

One command submits, polls and downloads:

```bash
node "<this skill's base directory>/generate-video.js" --script-file /tmp/script.txt --out /tmp/talk.mp4 --caption --json
```

## First-time setup

The presenter is configured once, in `~/.content-skills/.env`:

1. `HEYGEN_API_KEY` from https://app.heygen.com (Settings > API).
2. Run `node generate-video.js --list-looks`. It prints the user's own avatar looks. Ask the user which one,
   then set `HEYGEN_AVATAR_ID=<id>`. Prefer a **landscape** look: video-shorts crops it into split screens.
3. `HEYGEN_VOICE_ID` can stay empty (the look's own voice is used). To pick another clone: `--list-voices`.
4. `node generate-video.js --whoami` confirms what will be used.

If `--list-looks` is empty, the user has no avatar yet. Point them to https://app.heygen.com/avatars to create
a digital twin (needs a short recording and consent). Do not fall back to a stock avatar without asking.

## Hard rules

1. **Never change the presenter from the task.** Do not pass `--avatar-id`, `--voice-id` or similar; the script
   rejects them. The only way to change the presenter is to edit `~/.content-skills/.env`, and only when the user asks.
2. **Only call HeyGen through `generate-video.js`.**
3. **Never invent a script.** Given a topic, draft it, show it, and get a yes. Rendering costs credits.
4. **Keep chat clean.** No ids, request bodies or polling chatter. Deliver the file.

## Options

| Need | Flag | Default |
|---|---|---|
| Vertical | `--aspect 9:16` | `16:9` |
| Save locally (+ `.srt` with `--caption`) | `--out <path.mp4>` | not downloaded |
| Captions sidecar / burned in | `--caption` / `--caption burn` | off |
| Background | `--background "#0f172a"` or `--background <https url>` | the look's own |
| Delivery speed | `--speed 0.5-1.5` | 1.0 |
| Calmer gestures | `--motion-expressiveness less` | default |
| Engine | `--engine heygen-avatar-6` or `heygen-avatar-6-turbo` (older: `avatar_v`, `avatar_iv`) | `heygen-avatar-6` |
| Resolution | `--resolution 2k\|1080p` | `1080p` |
| Check the request without spending | `--dry-run` | off |

Use `--resolution 2k` when the clip will be shown full-screen in a 1080x1920 Short: 1080p landscape gets upscaled ~1.8x.

The command blocks until done (1-5 min for a short script). Run it in the background and do not narrate the wait.
Stdout is JSON: `video_id`, `status`, `video_url` (presigned, expires), `duration`, `file`, `subtitle_file`.

## Script guidelines

- First person, conversational, as the presenter would say it. Contractions are fine.
- 130-150 words per minute. **A 30 second Short is about 70 words.** 87 words came out at 36 s.
- Open with the point. End with one clear ask.
- No stage directions, emojis or markdown. It is read verbatim.
- Spell numbers and acronyms the way they should be spoken.
- Apply the **Pronunciation** list in `~/.content-skills/brand.md` (e.g. a product name the voice mispronounces).

## Errors

| Symptom | Action |
|---|---|
| `HEYGEN_AVATAR_ID is not set` | Run the first-time setup above. |
| `401` | Key invalid or revoked. Tell the user. |
| `429` | Backs off automatically; if it persists, wait and retry once. |
| `status=failed` + `failure_code` | Report it verbatim. Usually moderation on the script or a bad background URL. |
| Timed out after 20 minutes | Give the dashboard link `https://app.heygen.com/videos/<id>`; it may still finish. |
