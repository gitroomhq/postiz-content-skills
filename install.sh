#!/usr/bin/env bash
# Install the content skills (seo-builder-skill, video-shorts and their helpers) into Claude Code,
# then install all third-party software they use.
#
#   ./install.sh                 install skills + everything they need
#   ./install.sh --skills-only   only copy the skills (no software)
#   ./install.sh --no-system     skip brew/apt (ffmpeg, jq)
#   ./install.sh --no-skills     skip third-party skills and the claude-seo plugin
#
# Re-run any time to update. Your ~/.content-skills/.env and brand.md are never overwritten.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
SKILLS_ONLY=0; PASS=()
for a in "$@"; do
  case "$a" in
    --skills-only) SKILLS_ONLY=1 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) PASS+=("$a") ;;
  esac
done

printf '\n\033[1mInstalling skills into %s\033[0m\n' "$DEST"
mkdir -p "$DEST"
STAMP="$(date +%Y%m%d-%H%M%S)"
for dir in "$REPO"/skills/*/; do
  name="$(basename "$dir")"
  target="$DEST/$name"
  if [ -L "$target" ]; then
    mv "$target" "$target.bak-$STAMP"
    printf '  ! %s was a symlink, moved to %s.bak-%s\n' "$name" "$name" "$STAMP"
  elif [ -d "$target" ] && [ ! -f "$target/.content-skills" ]; then
    mv "$target" "$target.bak-$STAMP"
    printf '  ! you already had a skill called %s; moved it to %s.bak-%s\n' "$name" "$name" "$STAMP"
  fi
  mkdir -p "$target"
  (cd "$dir" && tar cf - --exclude node_modules --exclude out --exclude public/inputs .) | (cd "$target" && tar xf -)
  touch "$target/.content-skills"
  chmod +x "$target"/scripts/*.sh "$target"/*.js 2>/dev/null || true
  printf '  \033[32m✔\033[0m %s\n' "$name"
done

if [ "$SKILLS_ONLY" = 1 ]; then
  echo; echo "Skills copied. Run ./install.sh without --skills-only to install the software they use."
  exit 0
fi

bash "$DEST/content-setup/scripts/install-deps.sh" ${PASS[@]+"${PASS[@]}"}
status=$?

cat <<'EOF'

Next:
  1. Open Claude Code and type:   /content-setup
     It walks you through your API keys, your HeyGen avatar and your brand profile.
  2. Check anytime:               bash ~/.claude/skills/content-setup/scripts/doctor.sh
  3. Then:                        /seo-builder-skill <article URL>
                                  /video-shorts <article URL>
EOF
exit $status
