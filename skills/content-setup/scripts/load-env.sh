# Source this file:  source ~/.claude/skills/content-setup/scripts/load-env.sh
# Exports the values from ~/.content-skills/.env, skipping empty ones and never
# overriding a variable that is already set in your shell.
__cs_env="${CONTENT_SKILLS_HOME:-$HOME/.content-skills}/.env"
if [ -f "$__cs_env" ]; then
  while IFS= read -r __cs_line || [ -n "$__cs_line" ]; do
    case "$__cs_line" in ''|\#*) continue ;; esac
    __cs_line="${__cs_line#export }"
    __cs_key="${__cs_line%%=*}"
    __cs_val="${__cs_line#*=}"
    case "$__cs_key" in *[!A-Za-z0-9_]*|'') continue ;; esac
    __cs_val="${__cs_val%\"}"; __cs_val="${__cs_val#\"}"
    __cs_val="${__cs_val%\'}"; __cs_val="${__cs_val#\'}"
    [ -z "$__cs_val" ] && continue
    eval "__cs_cur=\${$__cs_key:-}"
    [ -n "$__cs_cur" ] && continue
    export "$__cs_key=$__cs_val"
  done < "$__cs_env"
fi
unset __cs_env __cs_line __cs_key __cs_val __cs_cur
