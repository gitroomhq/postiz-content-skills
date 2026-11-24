---
name: content-setup
description: First-time setup and health check for the seo-builder-skill and video-shorts skills. Installs the third-party software, connects the accounts (Postiz, OpenAI, EvoLink/Seedance, HeyGen, ElevenLabs, DataForSEO, WordPress, Google Search Console), picks the user's HeyGen avatar, and fills in the brand profile. Use for "set up the content skills", "content-setup", "doctor", or when another content skill says setup is incomplete.
allowed-tools: Bash, Read, Write, Edit
---

# Content skills setup

Everything lives in `~/.content-skills/`:
- `.env` - API keys and settings (chmod 600). Template: `templates/env.example`.
- `brand.md` - who the content is for and where it goes. Template: `templates/brand.md`.
- `venv/` - Python for image generation. `remotion-template/` - the Shorts renderer.

Scripts in this skill (`<base>` = this skill's base directory):
- `bash <base>/scripts/install-deps.sh` installs all software (idempotent).
- `bash <base>/scripts/doctor.sh [seo|shorts]` checks what's ready. Never prints secrets.

## Flow

Work through these in order, skip whatever doctor already shows as ✔. Keep it conversational, one area at a time.

### 1. Software
Run `doctor.sh --offline`. If tools or skills are missing, tell the user what `install-deps.sh` will install
(ffmpeg, jq, 4 npm CLIs, a Python venv with openai + pillow, 7 skills, the claude-seo plugin, the Remotion template) and run it after they agree.
If npm fails with EACCES, help them switch to a user-level Node (nvm) rather than using sudo.

### 2. Keys
Ask which skills they want (SEO articles, Shorts, or both) and only set up what's needed:

| Service | Needed for | Where to get it | Setting |
|---|---|---|---|
| Postiz | both (scheduling, public media hosting for Seedance) | postiz.com > Settings > Public API, or `postiz auth:login` | `POSTIZ_API_KEY` |
| OpenAI | both (images) | platform.openai.com/api-keys | `OPENAI_API_KEY` |
| EvoLink | both (Seedance video) | evolink.ai > Dashboard > API Keys | `EVOLINK_API_KEY` |
| HeyGen | Shorts (presenter) | app.heygen.com > Settings > API | `HEYGEN_API_KEY` |
| ElevenLabs | Shorts (music) | elevenlabs.io > Developers > API Keys | `ELEVENLABS_API_KEY` |
| DataForSEO | SEO (keyword data) | app.dataforseo.com > API Access | `dataforseo-cli --set-credentials login=<login> password=<api password>` |
| WordPress | SEO (publishing, optional) | wp-admin > Users > Profile > Application Passwords | `WORDPRESS_API_URL`, `WORDPRESS_API_KEY` |
| Search Console | SEO (real query data, optional) | Google Cloud project with the Search Console API enabled | `GSC_QUOTA_PROJECT`, `GSC_PROPERTY` |

**Handling secrets:** suggest the user pastes keys straight into the file so they never go through the chat:
`open -e ~/.content-skills/.env` (macOS) or `nano ~/.content-skills/.env`. If they paste a key in chat anyway, write it
to the file with Edit and never repeat it back. Never print the file's contents.

Logins the user runs themselves (interactive; suggest the `!` prefix so the output lands in the session):
- `! postiz auth:login` (device flow), unless they use an API key.
- `! gcloud auth application-default login --scopes=https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform`
  A plain `gcloud auth login` token lacks the Search Console scope. Then enable the API on their project:
  `gcloud services enable searchconsole.googleapis.com --project <project>` and set `GSC_QUOTA_PROJECT=<project>`.
  Requests must send the header `x-goog-user-project: <project>` or they fail with a quota 403.
  `GSC_PROPERTY` is exactly as Search Console shows it: `sc-domain:example.com` or `https://www.example.com/`.

### 3. WordPress
1. `WORDPRESS_API_URL` = site URL + `/wp-json/wp/v2`.
2. Build the header from their username and Application Password (spaces in the password are fine):
   `python3 -c 'import base64,sys;print("Basic "+base64.b64encode(f"{sys.argv[1]}:{sys.argv[2]}".encode()).decode())' '<user>' '<app password>'`
   and save it as `WORDPRESS_API_KEY`.
3. `GET $WORDPRESS_API_URL/users/me?context=edit` confirms it. Then list `GET /users?context=edit&per_page=100`
   and ask which user should be the **author** of articles (often not the API user). Save the ID in brand.md.
4. List categories (`GET /categories?per_page=100`) and save the default category ID.

### 4. HeyGen presenter (Shorts only)
1. `node ~/.claude/skills/heygen-avatar-video/generate-video.js --list-looks` shows their own avatar looks.
   Ask which one. Prefer a landscape look. Save `HEYGEN_AVATAR_ID`.
2. Voice: empty `HEYGEN_VOICE_ID` uses the look's own voice. `--list-voices` if they want another clone.
3. `--whoami` to confirm.
4. No looks? They need a HeyGen digital twin first: https://app.heygen.com/avatars (a short recording + consent).

### 5. Brand profile
Fill `~/.content-skills/brand.md` with the user. Speed it up: ask for their website, read it (Claude in Chrome
or `curl`), draft the Product and Audience sections, and confirm with them. Then ask about the rest:
links to strip, competitors, pronunciation fixes, WordPress author/category, publish status (recommend `draft`
for the first runs), Postiz group or channels (`postiz integrations:groups` and `postiz integrations:list`),
posting time and timezone, and an optional product footage folder.

### 6. Check
Run `doctor.sh` (online). Fix every ✘. Then tell them how to start:
- `/seo-builder-skill <article URL>`
- `/video-shorts <article URL>`

## Rough cost per run (list prices, check each provider)

- SEO article: cover + 3 stills (OpenAI, a few dollars at max quality) + 3 Seedance clips at 4 s 1080p (~$6) + DataForSEO lookups (cents).
- Short: ~8 stills + ~8 Seedance clips (~$16) + HeyGen credits for ~30 s + one ElevenLabs track.
