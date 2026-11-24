#!/usr/bin/env bash
# Installs everything the content skills need. Safe to re-run (idempotent).
#
#   bash install-deps.sh            everything
#   bash install-deps.sh --no-system   skip brew/apt packages (ffmpeg, jq)
#   bash install-deps.sh --no-skills   skip third-party skills + the claude-seo plugin
#
# What it installs:
#   system:  ffmpeg, jq                    via Homebrew (macOS) or apt (Debian/Ubuntu)
#   npm -g:  postiz, agent-browser (+ its Chromium), dataforseo-cli, @elevenlabs/cli
#   python:  a venv at ~/.content-skills/venv with openai + pillow
#   skills:  postiz, agent-browser, dataforseo-cli, ai-seo, copy-editing, music, wp-rest-api  (via `npx skills add`)
#   plugin:  claude-seo (Claude Code plugin)
#   files:   ~/.content-skills/{.env,brand.md,remotion-template}
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"          # .../content-setup
SKILLS_ROOT="$(cd "$SKILL_DIR/.." && pwd)"                            # .../skills
HOME_DIR="${CONTENT_SKILLS_HOME:-$HOME/.content-skills}"
DO_SYSTEM=1; DO_SKILLS=1
for a in "$@"; do
  case "$a" in
    --no-system) DO_SYSTEM=0 ;;
    --no-skills) DO_SKILLS=0 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
  esac
done

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✘\033[0m %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
FAILED=()

OS="$(uname -s)"
if [ "$OS" = "Darwin" ]; then PM=brew
elif have apt-get; then PM=apt
else PM=none; fi

# --- 1. Node + Python ---------------------------------------------------------
bold "1/7 Node.js and Python"
if have node && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; then
  ok "node $(node -v)"
else
  fail "Node.js 18+ is required. Install it from https://nodejs.org (or: brew install node / nvm install --lts), then re-run."
  exit 1
fi
PY=""
for c in python3.13 python3.12 python3.11 python3.10 python3; do
  if have "$c" && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3,9) else 1)' 2>/dev/null; then PY="$c"; break; fi
done
if [ -n "$PY" ]; then ok "python $($PY -V 2>&1)"; else
  fail "Python 3.9+ is required (brew install python / apt install python3 python3-venv)."; exit 1
fi

# --- 2. System packages ---------------------------------------------------------
bold "2/7 System packages (ffmpeg, jq)"
if [ "$DO_SYSTEM" = 1 ]; then
  need=()
  have ffmpeg || need+=(ffmpeg)
  have jq || need+=(jq)
  if [ ${#need[@]} -gt 0 ]; then
    case "$PM" in
      brew) have brew || { fail "Homebrew missing: https://brew.sh"; exit 1; }; brew install "${need[@]}" ;;
      apt)  sudo apt-get update -y && sudo apt-get install -y "${need[@]}" ;;
      *)    fail "Install ${need[*]} with your package manager, then re-run."; FAILED+=("${need[*]}") ;;
    esac
  fi
  have ffmpeg && ok "ffmpeg $(ffmpeg -version | head -1 | awk '{print $3}')"
  have jq && ok "jq"
else
  warn "skipped (--no-system)"
fi

# --- 3. Python venv for image generation ---------------------------------------------
bold "3/7 Python environment (~/.content-skills/venv)"
mkdir -p "$HOME_DIR"
if [ ! -x "$HOME_DIR/venv/bin/python" ]; then
  "$PY" -m venv "$HOME_DIR/venv" || { fail "python venv failed (Debian/Ubuntu: sudo apt install python3-venv)"; FAILED+=(venv); }
fi
if [ -x "$HOME_DIR/venv/bin/python" ]; then
  "$HOME_DIR/venv/bin/python" -m pip install -q --upgrade pip >/dev/null 2>&1
  if "$HOME_DIR/venv/bin/python" -m pip install -q --upgrade openai pillow; then ok "openai $("$HOME_DIR/venv/bin/python" -c 'import openai;print(openai.__version__)') + pillow"
  else fail "pip install openai pillow failed"; FAILED+=(openai); fi
fi

# --- 4. npm CLIs ------------------------------------------------------------------------
bold "4/7 Command-line tools (npm -g)"
for pkg in postiz agent-browser dataforseo-cli @elevenlabs/cli; do
  bin="${pkg##*/}"; [ "$bin" = "cli" ] && bin=elevenlabs
  if have "$bin"; then ok "$bin (already installed)"; continue; fi
  if npm install -g "$pkg" >/tmp/content-skills-npm.log 2>&1; then ok "$pkg"
  else
    if grep -q EACCES /tmp/content-skills-npm.log; then
      fail "$pkg: npm has no permission for global installs. Use a user-level Node (nvm) or set an npm prefix: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally"
    else fail "$pkg (see /tmp/content-skills-npm.log)"; fi
    FAILED+=("$pkg")
  fi
done
if have agent-browser; then
  if [ "$OS" = "Linux" ]; then agent-browser install --with-deps >/dev/null 2>&1 || agent-browser install >/dev/null 2>&1
  else agent-browser install >/dev/null 2>&1; fi
  ok "agent-browser browser binaries"
fi

# --- 5. Third-party skills + claude-seo plugin ---------------------------------------
bold "5/7 Third-party skills and plugins"
if [ "$DO_SKILLS" = 1 ]; then
  add_skill() { # repo skill...
    local repo="$1"; shift
    local args=(); for s in "$@"; do args+=(--skill "$s"); done
    if npx -y skills add "$repo" -g -y -a claude-code "${args[@]}" >/tmp/content-skills-skills.log 2>&1; then ok "$* ($repo)"
    else fail "$* from $repo (see /tmp/content-skills-skills.log)"; FAILED+=("$repo"); fi
  }
  add_skill gitroomhq/postiz-agent postiz
  add_skill vercel-labs/agent-browser agent-browser
  add_skill alexgusevski/dataforseo-cli dataforseo-cli
  add_skill coreyhaines31/marketingskills ai-seo copy-editing
  add_skill elevenlabs/skills music
  add_skill nevo-david/wordpress-skill wp-rest-api
  if have claude; then
    claude plugin marketplace add AgriciDaniel/claude-seo >/dev/null 2>&1
    if claude plugin install claude-seo@agricidaniel-claude-seo -s user -y >/tmp/content-skills-plugin.log 2>&1 \
       || grep -qi 'already' /tmp/content-skills-plugin.log; then ok "claude-seo plugin"
    else warn "claude-seo plugin: inside Claude Code run  /plugin marketplace add AgriciDaniel/claude-seo  then  /plugin install claude-seo@agricidaniel-claude-seo"; fi
  else
    warn "claude CLI not found. Install Claude Code (https://claude.com/claude-code), then run: claude plugin marketplace add AgriciDaniel/claude-seo && claude plugin install claude-seo@agricidaniel-claude-seo"
  fi
else
  warn "skipped (--no-skills)"
fi

# --- 6. Remotion template ------------------------------------------------------------------
bold "6/7 Remotion Shorts template (~/.content-skills/remotion-template)"
TPL_SRC="$SKILLS_ROOT/remotion-shorts/template"
TPL="$HOME_DIR/remotion-template"
if [ -d "$TPL_SRC" ]; then
  mkdir -p "$TPL"
  # copy sources, keep node_modules and public/inputs
  (cd "$TPL_SRC" && tar cf - --exclude node_modules --exclude out --exclude public/inputs .) | (cd "$TPL" && tar xf -)
  if [ ! -d "$TPL/node_modules" ] || ! cmp -s "$TPL_SRC/package-lock.json" "$TPL/node_modules/.content-skills-lock"; then
    if (cd "$TPL" && npm ci --no-audit --no-fund >/tmp/content-skills-remotion.log 2>&1); then
      cp "$TPL_SRC/package-lock.json" "$TPL/node_modules/.content-skills-lock"; ok "dependencies installed"
    else fail "npm ci in $TPL (see /tmp/content-skills-remotion.log)"; FAILED+=(remotion); fi
  else ok "up to date"; fi
  mkdir -p "$TPL/public/inputs"
else
  warn "remotion-shorts skill not found next to content-setup; skipping"
fi

# --- 7. Config files -------------------------------------------------------------------------
bold "7/7 Config (~/.content-skills)"
if [ ! -f "$HOME_DIR/.env" ]; then
  cp "$SKILL_DIR/templates/env.example" "$HOME_DIR/.env"; ok "created $HOME_DIR/.env (fill in your keys)"
else ok "$HOME_DIR/.env exists (kept)"; fi
chmod 600 "$HOME_DIR/.env"
if [ ! -f "$HOME_DIR/brand.md" ]; then
  cp "$SKILL_DIR/templates/brand.md" "$HOME_DIR/brand.md"; ok "created $HOME_DIR/brand.md (describe your product)"
else ok "$HOME_DIR/brand.md exists (kept)"; fi

if ! have gcloud; then
  warn "Optional: Google Cloud CLI for Search Console data (macOS: brew install --cask google-cloud-sdk; others: https://cloud.google.com/sdk/docs/install)"
fi

echo
if [ ${#FAILED[@]} -gt 0 ]; then
  fail "Finished with problems: ${FAILED[*]}"
  exit 1
fi
ok "Dependencies installed."
