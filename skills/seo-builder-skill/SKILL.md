---
name: seo-builder-skill
description: Turn an article, post or X article (often someone else's story about using your product) into an SEO-optimized, captivating blog article for your own site, with real keyword data, a matching AI cover, animated inline images, and publishing to WordPress. Use for "write an SEO article from this URL", "turn this post into a blog article", "seo-builder".
metadata: {"openclaw":{"emoji":"🌎","requires":{"bins":["node","ffmpeg","postiz"],"env":["OPENAI_API_KEY"]}}}
---

# SEO Builder

Takes a source URL and ships an article that **ranks and converts**: ranking with boring content doesn't convert,
and great content nobody finds doesn't either. Run the steps in order.

**Working files:** keep everything in a temp folder (`/tmp/seo-builder/<slug>/`), never in the user's project.
**Keep context clean:** don't paste raw page dumps or tool logs into the chat. Keep compact facts and file paths.

---

## Step 0 - Preflight

1. Read `~/.content-skills/brand.md`. It defines the product, audience (ICP), angle, CTA, links to strip,
   competitors, and the WordPress author. If it is missing or a field this skill needs still has a `<...>`
   placeholder, stop and run the `content-setup` skill first.
2. Load keys: `source ~/.claude/skills/content-setup/scripts/load-env.sh` before any shell command that needs them.
3. Run `bash ~/.claude/skills/content-setup/scripts/doctor.sh seo`. Missing optional pieces (Search Console,
   WordPress) don't block the run; this skill falls back (see each step). Tell the user once what is skipped.
4. Ask for the source URL if it wasn't given.

---

## Step 1 - Load the source

Get the full text, every image, the author and the cover.

- **X (Twitter) articles and posts:** no browser needed. `curl -s https://api.fxtwitter.com/<user>/status/<id>`
  returns the tweet and, for X articles, `tweet.article` with Draft.js `content.blocks` + `entityMap`.
  MEDIA entities carry a `mediaId`; map it to `media_entities[].media_info.original_img_url` and append `?name=orig`
  for full size. Headless browsers get HTTP 403 from x.com.
- **Everything else:** use the Claude in Chrome tools (the user's real browser gets past Cloudflare and logins).
  If Chrome isn't connected, use the `agent-browser` skill.
- **Download every image** into the working folder now. LinkedIn and X image URLs expire or block hotlinking,
  so never link them directly. They get uploaded to the user's own WordPress media in Step 6.
- Capture: the storyline and key facts, concrete numbers/results, tools and companies named, the author's name
  and profile link, and the original cover image.

---

## Step 2 - Find the keywords with real data

Don't guess keywords. Pick one primary keyword and 3-6 secondary ones from data:

- **Google Search Console** (if `GSC_PROPERTY` is set): queries the site already gets impressions for around this
  topic are the easiest wins.
  ```bash
  TOKEN=$(gcloud auth application-default print-access-token)
  curl -s -X POST "https://searchconsole.googleapis.com/webmasters/v3/sites/$(python3 -c 'import urllib.parse,os;print(urllib.parse.quote(os.environ["GSC_PROPERTY"],safe=""))')/searchAnalytics/query" \
    -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $GSC_QUOTA_PROJECT" -H "Content-Type: application/json" \
    -d '{"startDate":"<90 days ago>","endDate":"<today>","dimensions":["query","page"],"rowLimit":250}'
  ```
  A 403 about scopes means the login lacks Search Console scope; a 403 about quota means the
  `x-goog-user-project` header or project is wrong. See `content-setup` for the one-time login.
- **DataForSEO** (`dataforseo-cli` skill): search volume, keyword difficulty, related keywords, and who ranks now.
- **`ai-seo` skill:** shape the piece so AI assistants cite it (answer-first passages, clear definitions,
  stats with sources, FAQ).
- Check what already ranks for the primary keyword and make this article clearly more useful.

---

## Step 3 - Write the article

- **Same story, company voice.** Most sources are a person describing how they used the product. Keep their
  storyline and what made it captivating, but write it as a company article about the use case, not a personal post.
- **Lean into the angle and ICP from brand.md.** That is who the article is for.
- **Author credit goes at the end** (e.g. "Based on the story by <author>, <link>"), not in the intro.
  It is optional unless the source requires attribution.
- **Strip links** to the domains listed in brand.md (affiliate/referral links). **Never link or name the competitors**
  listed in brand.md; cite official sources (the platform's own docs) instead, or state the fact without a link.
- **SEO structure:** primary keyword in the title, slug, first 100 words and one H2. Answer-first intro.
  Descriptive H2/H3s (questions where natural). Lists and tables where they help. A short FAQ when the topic has
  real questions. Internal links to 2-3 relevant pages on the user's site. Outbound links only to trustworthy sources.
- **Captivating:** concrete numbers, short paragraphs, a hook in the first two lines, no filler.
- **CTA at the end:** the main CTA from brand.md.
- Also write: SEO title (<= 60 chars), meta description (<= 155 chars), slug, and excerpt.
- Polish with the `copy-editing` skill, then check with the `claude-seo` plugin (`/seo page` or the seo-content
  skill) and fix what it finds.

---

## Step 4 - Cover image

Use the `gpt-image` skill with the **original cover as `--reference`** so the new cover keeps the same style,
but is new and on-topic. Landscape `--size 3840x2160`, then export a 1600-1920px wide JPEG/WebP for the web.

---

## Step 5 - Animated inline images

Add 2-4 pictures that explain the article (not decoration):

1. Generate each still with `gpt-image` (4:3 or 16:9, subject central, no text that must stay readable).
2. Animate with the `seedance-video` skill (`--mode i2v --quality 1080p --duration 4 --silent`, locked camera).
   About $2 per clip. Review frames before using a clip.
3. Optimize with ffmpeg for the web (content columns are ~840px wide):
   ```bash
   # MP4 for <video autoplay muted loop playsinline>
   ffmpeg -y -i clip.mp4 -an -vf "scale=840:-2,fps=24" -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p -movflags +faststart inline-1.mp4
   # Animated AVIF for themes that strip <video> attributes (use as a normal <img>)
   ffmpeg -y -i clip.mp4 -an -vf "scale=840:-2,fps=20" -c:v libsvtav1 -crf 38 -f avif -loop 0 inline-1.avif
   ```
   For a seamless loop, crossfade the end into the start (ffmpeg `xfade`, ~12 frames) before encoding.
   Some front ends sanitize `<video>` down to `src`+`controls`; if autoplay is stripped, use the AVIF `<img>`.
4. Every image gets descriptive `alt` text that includes context (not keyword stuffing).

---

## Step 6 - Publish

**WordPress** (`WORDPRESS_API_URL` + `WORDPRESS_API_KEY` set; use the `wp-rest-api` skill for endpoint details):

1. **Check the slug through the REST API only**: `GET $WORDPRESS_API_URL/posts?slug=<slug>&status=any`.
   Don't open the planned public URL before the post exists: some headless/ISR front ends cache the 404 or redirect.
2. **Upload media** (`POST /media`, `Content-Disposition: attachment; filename=...`, correct `Content-Type`,
   including `image/avif`). Parse responses with Python, not jq. **Never blind-retry an upload:** on an error,
   first search `/media?search=<filename>` so you don't create duplicates. Set `alt_text` on each item.
3. **Create the post** with `author` = the WordPress author ID from brand.md (API users often default to a
   technical account), `status` = the publish status from brand.md (default `draft`), `slug`, `title`,
   `content`, `excerpt` (becomes the social description), `featured_media` = the cover, and the category.
4. **Save the post once more** with just `{"featured_media": <id>}`. Some SEO plugins pick the first inline image
   as og:image when the cover is set in the create call; a re-save fixes it.
5. SEO plugins (Yoast, Rank Math) usually don't expose their meta fields over REST. Give the user the SEO title,
   meta description and focus keyphrase to paste in wp-admin.
6. Before finishing: grep the final HTML for outbound links and confirm none go to stripped domains or competitors.

**No WordPress configured:** write `article.html`, `article.md`, the images and a `meta.json`
(title, slug, meta description, excerpt, keywords) to `~/content-skills-output/<slug>/` and tell the user.

---

## Step 7 - Report

Give the user: the post link (preview link if draft), primary + secondary keywords and why (the data),
anything to paste manually (SEO plugin fields), and what it cost roughly (images + Seedance clips).
Offer to turn the article into a Short with the `video-shorts` skill.
