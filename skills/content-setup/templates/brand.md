# Brand profile

Every content skill reads this file before it starts (~/.content-skills/brand.md).
Replace every placeholder in angle brackets. The skills stop and ask you if a field they need is still a placeholder.

## Product

- **Name:** <Your product name>
- **Website:** <https://example.com>
- **One-paragraph description:** <What it does, for whom, and the main benefit. 3-5 sentences.>
- **Main CTA (end of every article):** <e.g. "Start your free trial at https://example.com">

## Audience and angle

- **Ideal customer (ICP):** <e.g. founders who run their marketing with AI agents>
- **The angle every piece leans into:** <e.g. how AI agents (Claude Code, ChatGPT, OpenClaw) run social media through our product>
- **Content language:** English

## Links

- **Domains to strip from source content (affiliate or referral links):** <e.g. example.pro, ref.example.com, or "none">
- **Competitors never to link or cite:** <comma-separated names and domains, or "none">

## Pronunciation (for the AI presenter)

Words the voice gets wrong and how to spell them in the script so they sound right.

- <ProductName> -> <ProductNamme>

## WordPress (seo-builder-skill)

- **Author user ID:** <number. Find it: GET $WORDPRESS_API_URL/users?context=edit>
- **Default category ID:** <number, or "none">
- **Publish status:** draft
  (`draft` = you review and press publish in wp-admin. `publish` = goes live right away.)
- **Blog URL pattern:** <https://example.com/blog/{slug}>

## Short videos (video-shorts)

- **Presenter name (the HeyGen avatar):** <Your name>
- **Postiz group or channels to post Shorts to:** <Postiz customer/group name, or a list of channel names>
- **Posting time:** 20:00
- **Timezone:** <e.g. America/New_York, Europe/London, Asia/Bangkok>
- **One Short per day per platform:** yes
- **Product footage folder (optional):** <absolute path to screen recordings of your product, or "none">
