#!/usr/bin/env zsh
#
# Copy this into ~/.zshrc, or source it from ~/.zshrc:
#   source ~/projects/quick-scripts/porta/scripts_davidroberts/launch_bg_app.zsh

launch_bg_app() {
    local app_name="$1"
    if [[ -z "$app_name" ]]; then
        echo "Usage: launch_bg_app \"App Name\""
        return 1
    fi

    nohup open -na "$app_name" >/tmp/${app_name// /_}.log 2>&1 &
}

alias runantigravity='launch_bg_app "Antigravity"'
alias runcodex='launch_bg_app "Codex"'
alias runporta="$HOME/runporta.sh"
