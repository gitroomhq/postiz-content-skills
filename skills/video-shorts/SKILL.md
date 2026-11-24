---
name: video-shorts
description: Turn an article (yours, or someone else's story about your product) into a ~30s vertical Short with your AI presenter (HeyGen), Seedance b-roll, split screens, burned-in captions and music, then schedule it to your channels with Postiz. Use for "make a short from this article", "turn this into a reel/TikTok/Short", "video-shorts".
metadata: {"openclaw":{"emoji":"🎬","requires":{"bins":["node","ffmpeg","ffprobe","postiz"],"env":["HEYGEN_API_KEY","HEYGEN_AVATAR_ID","EVOLINK_API_KEY","OPENAI_API_KEY","ELEVENLABS_API_KEY"]}}}
---

# Video Shorts

Article in, ~30 s 1080x1920 Short out, scheduled to Postiz. Run the steps **in order**.
There are **three approval gates** (script, b-rolls, final video). Stop and wait for the user at each one.

## Global rules

- **Read `~/.content-skills/brand.md` first.** It has the product, angle, presenter, pronunciation fixes, Postiz
  channels, posting time and timezone. If it is missing or a field this skill needs is still a `<...>` placeholder,
  run the `content-setup` skill first.
- Load keys before shell commands: `source ~/.claude/skills/content-setup/scripts/load-env.sh`.
- Run `bash ~/.claude/skills/content-setup/scripts/doctor.sh shorts` once. Fix anything it marks as required.
- **Goal:** a ~30 s Short. The presenter's voice runs the whole length, several shots are cut together, captions burned in.
- **Final video is 1080x1920.** Generate every source video **horizontal (16:9)**; it crops better into split screens.
- **Tone: up.** High energy from the first word to the last, simple words a 6th grader gets, one single idea,
  always open with a hook, no confusing jumps between scenes.
- **The Short is a trailer for the article.** Everything builds toward the viewer wanting the article and commenting for it.
- **Tell THEIR story.** If the source is someone else's use case, name the author and tell their story. Never imply
  you built what they did. (If the article is the user's own, first person is fine.)
- **Lean into the angle from brand.md.**
- **Files:** everything goes in a temp folder (`/tmp/video-shorts/<slug>/`), which is also how steps hand assets over.
- **Context:** no raw page dumps, transcripts or logs in chat. Keep compact facts and temp paths.

---

## Step 0 - Get the article URL
Ask for it if it wasn't given. Also ask for the X/LinkedIn post URL if there is one (for the description and view count).

---

## Step 1 - Extract the article + assets

1. **Load the content.** X posts/articles: `curl -s https://api.fxtwitter.com/<user>/status/<id>` (text, article
   blocks, media, author, `views`). No browser needed and headless browsers get 403 from x.com.
   Other sites: Claude in Chrome tools, else the `agent-browser` skill. Download images locally (URLs expire).
2. Capture: the full text, the **author's name**, **company names** mentioned (for logos), and the **view count** if notable.
3. **Author card:** screenshot the post header (cover + author name) in the browser and crop it. If no browser can
   reach it, build the card yourself from the fxtwitter data (cover image + avatar + name) with ffmpeg or PIL.
4. **Style:** load the article's main image and write down its style (palette, medium, lighting) for Step 3.

**Keep:** hook angle, the result achieved, how (a few sentences each), author, views, companies, and temp paths.

---

## Step 2 - Write the script

- **Structure: hook -> result -> a taste of how -> comment CTA.**
  - Hook first, always: tension, curiosity or surprise. Big view counts make great social proof here.
  - The result: lead with the most impressive concrete number.
  - A taste of how: one or two concrete details, then make clear the full step-by-step is in the article.
- **About 70 spoken words for 30 s.** (87 words came out at 36 s.)
- Hype only what the article really delivers. One single idea. Short, punchy sentences.
- Apply the **Pronunciation** list from brand.md in the script text (e.g. spell a product name so the voice says it right).
- **Spoken CTA (last line, the only CTA):** `Comment "<KEYWORD>" and I'll send you <the thing>`.
  - KEYWORD: one short word tied to the topic (`AI`, `AGENT`, `CLAUDE`). Easy to say and type, no numbers or punctuation.
  - The thing: the article by default, or what it really is (a guide, a prompt, a workflow).
  - Nothing after it. No free-trial pitch, no website plug, not in the script and not in the description.
- **Description:** link to the article, link to the original post (if any), and ends with the same comment CTA.

## ✅ GATE 1: SCRIPT
Show the script, the keyword + what gets sent, and the description. Revise until approved. **Don't continue without a yes.**

---

## Step 3 - Start the presenter right away, then make the b-roll

**Immediately after the script is approved, start the HeyGen render in the background** (Step 4). It only needs the
script and takes several minutes, so it runs while you make b-roll.

**B-roll principles**
- Every b-roll explains the line it sits under. Literal and real beats metaphor: show the actual logos, apps,
  numbers and proof, not generic symbols.
- Never reuse a b-roll. Mix close-ups, wide shots, graphs, logos, UI. Each used clip is 2-3 s.

**How**
1. Break the script into beats (~2-3 s each) and decide a distinct b-roll for each.
2. **Stills:** `gpt-image` skill in the style you noted in Step 1 (pass the article's cover as `--reference`).
   16:9, subject in the **central 60%** (a split slot keeps only the middle ~63% of a 16:9 frame), no text that must
   stay readable.
3. **Company logos:** grab each real logo from the company website (browser), pass it to `gpt-image` as `--reference`.
4. **Animate:** `seedance-video` skill, `--mode i2v --quality 1080p --aspect 16:9 --duration 4 --silent`. Start the
   prompt with `Static locked-off camera: no zoom, no pan.` whenever a logo or overlay must stay in frame. Make it
   dramatic and "trailer-like" in what moves, not in the camera. About $2 per clip.
5. **Numbers and text:** overlay them yourself afterwards (render a transparent PNG with Pillow from the venv and use ffmpeg `overlay`; Homebrew's ffmpeg has no drawtext). Don't ask Seedance to hold text.
6. **Product footage:** if brand.md has a product footage folder, pick clips that match the line. Otherwise you can
   record the product's site with `agent-browser` (see its video recording reference), or skip it.
7. **Review every clip** (frames from start, middle, end). Reject warped hands or faces, melting text, a changing logo,
   flicker, blur or morphing, and regenerate. Only clean clips reach the gate.

**Keep:** a map of beat -> b-roll temp path, plus logos and product footage paths.

## ✅ GATE 2: B-ROLL
Show the stills/clips (open them or give paths). Regenerate specific beats if asked. **Don't continue without a yes.**

---

## Step 4 - Presenter video + captions

`heygen-avatar-video` skill, started right after Gate 1:

```bash
node ~/.claude/skills/heygen-avatar-video/generate-video.js --script-file /tmp/video-shorts/<slug>/script.txt \
  --aspect 16:9 --resolution 2k --caption --out /tmp/video-shorts/<slug>/talk.mp4 --json
```

- Its voice is the backbone of the Short: one continuous track the whole way through.
- `--caption` saves `talk.srt` next to the video.
- If it runs long, cut the pauses at sentence boundaries (`ffmpeg silencedetect=n=-38dB:d=0.25`) on shot changes,
  where cuts are invisible, and/or speed up by up to 1.1x (`setpts` + `atempo`). Don't re-render for a few seconds.

---

## Step 5 - Assemble (1080x1920)

**Shot plan**
- **Shot 1:** the presenter cropped together with the author card / post (the hook).
- Then alternate every 2-3 s between **presenter only** and **split screen: presenter + b-roll**.
- **Author moment:** when the script introduces the author, show the author card centered with a slight zoom
  (ffmpeg `zoompan` or a scale animation), no presenter, and the view count if notable.

**Render and stitch**
- Use the `remotion-shorts` skill for each Fullscreen / SplitVertical shot, then ffmpeg to cut, order and join them
  against the single presenter audio track.
- Never stretch, always crop. Never upscale beyond the source when avoidable. Encode with x264 `-crf 18` or lower,
  and re-encode each clip as few times as possible. Transitions: hard cut or a short dissolve only.

**Captions (burned in)** with the bundled script. It renders text with Pillow and uses only ffmpeg's core
`overlay`, so it works even though Homebrew's ffmpeg has no libass/drawtext.

```bash
~/.content-skills/venv/bin/python ~/.claude/skills/video-shorts/scripts/burn_captions.py \
  --video /tmp/video-shorts/<slug>/edit.mp4 --srt /tmp/video-shorts/<slug>/talk.srt \
  --layout /tmp/video-shorts/<slug>/layout.json --keyword <KEYWORD> --out /tmp/video-shorts/<slug>/captioned.mp4
```

- `layout.json` = `[[start, end, "middle"|"bottom"|"none"], ...]` from your shot plan. **Split screen: `middle`**
  (between the two videos). **Presenter-only: `bottom`**. Author card: `none`.
- Chunks of up to 4 words (`--max-words`). `--font` takes any .ttf/.otf if the user has a brand font.
- Fix `talk.srt` first if the timing drifted after you cut pauses or sped up (shift the cues to match), and undo
  pronunciation spellings so brand names are spelled correctly. For word-level timing, run Whisper on the voice track
  (some transcribers merge spoken numbers into one token; split them).
- `--keyword` forces the CTA keyword to CAPS wherever it appears (`AI`, never `A.I.` or `ai`).

**Length:** about 30 s.

---

## Step 6 - Background music

`music` skill (ElevenLabs). The CLI needs the body as JSON:

```bash
elevenlabs music compose --json '{"prompt":"<upbeat, modern, energetic instrumental, no vocals>","music_length_ms":32000,"model_id":"music_v2_5"}' --output /tmp/video-shorts/<slug>/music.mp3
```

- Atmosphere only. The voice must be clear over every word, especially the hook.
- Mix: voice to about -14 LUFS, music about 18 LU under the voice, ducked a further ~6-9 dB under speech
  (`sidechaincompress` with the voice as key). Fade the music out over the last second.
- Try 2-3 options if the first doesn't fit and pick the best.

---

## Step 7 - SEO the description

Use `dataforseo-cli` and the `ai-seo` skill (and Search Console data if configured) to put the searched phrase for
this topic in the first line, so the Short shows up in Google and YouTube search. Keep the links and end with the same
comment CTA. No free-trial line.

---

## ✅ GATE 3: FINAL VIDEO
Open the final video for the user (`open <path>` on macOS) and give the path. Fix what they ask. **Don't schedule without a yes.**

---

## Step 8 - Schedule to Postiz

Use the `postiz` skill/CLI.

1. **Channels:** brand.md names a Postiz group (customer) or a list of channels. `postiz integrations:groups`,
   then `postiz integrations:list`, and pick the matching integration ids. Run `postiz integrations:settings <id>`
   for each platform to see required settings (YouTube title, TikTok privacy, etc.).
2. **Upload the video:** `postiz upload /tmp/video-shorts/<slug>/final.mp4` and use the returned path.
3. **Pick the slot:** `postiz posts:list` for the coming days. If brand.md says one Short per day per platform,
   start with today and move to the next day until a day has no video for that platform.
   Schedule at the **posting time and timezone from brand.md** (convert to ISO 8601 with offset).
4. **Create the post** with the description from Step 7 on every selected channel.
5. The Postiz API can drop connections (ECONNRESET). Retry the call a few times before reporting a failure, and
   check `posts:list` first so a retry doesn't create a duplicate.

**Report:** the scheduled date/time (in the brand timezone), the channels, the **comment keyword**, and the **link to send**
to everyone who comments it (the article by default). Done.
