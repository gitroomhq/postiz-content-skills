#!/usr/bin/env bash
# Checks that everything the content skills need is installed and configured.
#   bash doctor.sh            check everything
#   bash doctor.sh seo        only what seo-builder-skill needs
#   bash doctor.sh shorts     only what video-shorts needs
#   bash doctor.sh --offline  skip the live API key checks
# Never prints secret values. Exit code 1 if something required is missing.
set -uo pipefail

MODE="all"; ONLINE=1
for a in "$@"; do
  case "$a" in
    seo|shorts|all) MODE="$a" ;;
    --offline) ONLINE=0 ;;
  esac
done

HOME_DIR="${CONTENT_SKILLS_HOME:-$HOME/.content-skills}"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
ENV_FILE="$HOME_DIR/.env"
. "$(dirname "${BASH_SOURCE[0]}")/load-env.sh"

REQ_FAIL=0
ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31m✘\033[0m %s\n' "$*"; REQ_FAIL=1; }
hdr()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
want() { [ "$MODE" = all ] || [ "$MODE" = "$1" ]; }       # want seo / want shorts
http() { curl -s -m 15 -o /dev/null -w '%{http_code}' "$@"; }

hdr "Tools"
if have node && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; then ok "node $(node -v)"; else bad "node 18+ (https://nodejs.org)"; fi
if [ -x "$HOME_DIR/venv/bin/python" ] && "$HOME_DIR/venv/bin/python" -c 'import openai, PIL' 2>/dev/null; then ok "python venv (openai, pillow)"; else bad "python venv: run install-deps.sh"; fi
if have ffmpeg && have ffprobe; then
  ok "ffmpeg"
else bad "ffmpeg / ffprobe"; fi
have postiz && ok "postiz CLI" || bad "postiz CLI (npm i -g postiz)"
have agent-browser && ok "agent-browser" || warn "agent-browser (fallback when Claude in Chrome isn't connected): npm i -g agent-browser && agent-browser install"
if want seo; then have dataforseo-cli && ok "dataforseo-cli" || bad "dataforseo-cli (npm i -g dataforseo-cli)"; fi
if want shorts; then have elevenlabs && ok "elevenlabs CLI" || bad "elevenlabs CLI (npm i -g @elevenlabs/cli)"; fi
have gcloud && ok "gcloud (Search Console)" || warn "gcloud not installed: Search Console data will be skipped (optional)"

hdr "Skills (in $SKILLS_DIR)"
need_skills=(content-setup gpt-image seedance-video postiz agent-browser)
want seo && need_skills+=(seo-builder-skill dataforseo-cli ai-seo copy-editing wp-rest-api)
want shorts && need_skills+=(video-shorts heygen-avatar-video remotion-shorts music)
missing=()
for s in "${need_skills[@]}"; do [ -f "$SKILLS_DIR/$s/SKILL.md" ] || missing+=("$s"); done
if [ ${#missing[@]} -eq 0 ]; then ok "${#need_skills[@]} skills installed"; else bad "missing skills: ${missing[*]} (run install.sh)"; fi
if want seo; then
  if grep -qs '"claude-seo@' "$HOME/.claude/plugins/installed_plugins.json"; then ok "claude-seo plugin"; else warn "claude-seo plugin not found (/plugin install claude-seo@agricidaniel-claude-seo)"; fi
fi
if want shorts; then
  if [ -d "$HOME_DIR/remotion-template/node_modules" ]; then ok "Remotion template"; else bad "Remotion template not installed (run install-deps.sh)"; fi
fi

hdr "Brand profile ($HOME_DIR/brand.md)"
if [ -f "$HOME_DIR/brand.md" ]; then
  ph=$(grep -nE '<[^>]+>' "$HOME_DIR/brand.md" | grep -v '^\s*$' || true)
  if [ -z "$ph" ]; then ok "filled in"
  else
    bad "still has placeholders on these lines (run the content-setup skill):"
    echo "$ph" | sed 's/^/      /' | cut -c1-110
  fi
else bad "missing (run install-deps.sh, then the content-setup skill)"; fi

hdr "Keys and accounts ($ENV_FILE)"
[ -f "$ENV_FILE" ] || bad "missing .env"
if [ -f "$ENV_FILE" ] && [ "$(stat -f '%Lp' "$ENV_FILE" 2>/dev/null || stat -c '%a' "$ENV_FILE")" != "600" ]; then warn ".env should be private: chmod 600 $ENV_FILE"; fi

# OpenAI (both skills)
if [ -n "${OPENAI_API_KEY:-}" ]; then
  if [ $ONLINE = 1 ]; then c=$(http -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models); [ "$c" = 200 ] && ok "OpenAI key works" || bad "OpenAI key rejected (HTTP $c)"; else ok "OPENAI_API_KEY set"; fi
else bad "OPENAI_API_KEY (images)"; fi

# EvoLink (both skills)
if [ -n "${EVOLINK_API_KEY:-}" ]; then
  if [ $ONLINE = 1 ]; then c=$(http -H "Authorization: Bearer $EVOLINK_API_KEY" https://api.evolink.ai/v1/tasks/doctor-check); case "$c" in 401|403) bad "EvoLink key rejected (HTTP $c)";; *) ok "EvoLink key accepted";; esac; else ok "EVOLINK_API_KEY set"; fi
else bad "EVOLINK_API_KEY (Seedance video)"; fi

# Postiz (both: media hosting for Seedance + scheduling)
if have postiz; then
  if [ $ONLINE = 1 ]; then
    if postiz integrations:list >/dev/null 2>&1; then ok "Postiz connected"; else bad "Postiz not authenticated: run  postiz auth:login  or set POSTIZ_API_KEY"; fi
  elif [ -n "${POSTIZ_API_KEY:-}" ] || [ -f "$HOME/.postiz/credentials.json" ]; then ok "Postiz credentials present"; else bad "Postiz: run postiz auth:login or set POSTIZ_API_KEY"; fi
fi

if want shorts; then
  if [ -n "${HEYGEN_API_KEY:-}" ]; then
    if [ -z "${HEYGEN_AVATAR_ID:-}" ]; then bad "HEYGEN_AVATAR_ID empty: node $SKILLS_DIR/heygen-avatar-video/generate-video.js --list-looks"
    elif [ $ONLINE = 1 ]; then c=$(http -H "X-Api-Key: $HEYGEN_API_KEY" "https://api.heygen.com/v3/avatars/looks/$HEYGEN_AVATAR_ID"); [ "$c" = 200 ] && ok "HeyGen key + avatar look found" || bad "HeyGen key or HEYGEN_AVATAR_ID rejected (HTTP $c)"
    else ok "HeyGen configured"; fi
  else bad "HEYGEN_API_KEY (presenter video)"; fi
  if [ -n "${ELEVENLABS_API_KEY:-}" ]; then
    if [ $ONLINE = 1 ]; then
      body=$(curl -s -m 15 -H "xi-api-key: $ELEVENLABS_API_KEY" https://api.elevenlabs.io/v1/user)
      if echo "$body" | grep -q '"subscription"\|"user_id"'; then ok "ElevenLabs key works"
      elif echo "$body" | grep -q 'missing_permissions'; then ok "ElevenLabs key valid (scoped key; make sure it allows Music)"
      else bad "ElevenLabs key rejected"; fi
    else ok "ELEVENLABS_API_KEY set"; fi
  else bad "ELEVENLABS_API_KEY (music)"; fi
fi

if want seo; then
  if have dataforseo-cli; then dataforseo-cli status >/dev/null 2>&1 && ok "DataForSEO credentials" || bad "DataForSEO: dataforseo-cli --set-credentials login=... password=..."; fi
  if [ -n "${WORDPRESS_API_URL:-}" ] && [ -n "${WORDPRESS_API_KEY:-}" ]; then
    if [ $ONLINE = 1 ]; then
      case "$WORDPRESS_API_URL" in
        */wp-json/wp/v2|*/wp-json/wp/v2/) ;;
        *) bad "WORDPRESS_API_URL must be the REST base, e.g. ${WORDPRESS_API_URL%/}/wp-json/wp/v2" ;;
      esac
      c=$(http -L -H "Authorization: $WORDPRESS_API_KEY" "${WORDPRESS_API_URL%/}/users/me?context=edit")
      case "$c" in
        200) ok "WordPress login works" ;;
        401|403) bad "WordPress rejected the login (HTTP $c): check the Application Password and that WORDPRESS_API_KEY starts with 'Basic '" ;;
        *) bad "WordPress REST not reachable at ${WORDPRESS_API_URL%/}/users/me (HTTP $c)" ;;
      esac
    else ok "WordPress configured"; fi
  else warn "WordPress not configured: articles will be saved as files in ~/content-skills-output instead"; fi
  if [ -n "${GSC_PROPERTY:-}" ]; then
    if have gcloud && [ $ONLINE = 1 ]; then
      tok=$(gcloud auth application-default print-access-token 2>/dev/null || true)
      if [ -z "$tok" ]; then warn "Search Console: no gcloud application-default login (see content-setup)"
      else c=$(http -H "Authorization: Bearer $tok" -H "x-goog-user-project: ${GSC_QUOTA_PROJECT:-}" https://searchconsole.googleapis.com/webmasters/v3/sites); [ "$c" = 200 ] && ok "Search Console reachable" || warn "Search Console HTTP $c (scopes or GSC_QUOTA_PROJECT; see content-setup)"; fi
    else ok "GSC_PROPERTY set"; fi
  else warn "Search Console not configured (optional, adds real query data)"; fi
fi

echo
if [ $REQ_FAIL = 0 ]; then printf '\033[32mReady (%s).\033[0m\n' "$MODE"; else printf '\033[31mNot ready: fix the ✘ items above.\033[0m\n'; fi
exit $REQ_FAIL
