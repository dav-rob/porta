#!/usr/bin/env zsh

PORTA_DIR=~/projects/quick-scripts/porta

_porta_stop() {
    local pids=$(pgrep -f "quick-scripts/porta")
    if [[ -z "$pids" ]]; then
        echo "Porta is not running."
    else
        echo "$pids" | xargs kill
        echo "✓ Porta stopped."
    fi
}

_porta_start() {
    local tailscale_ip=$(tailscale ip -4 2>/dev/null)
    if [[ -z "$tailscale_ip" ]]; then
        echo "❌ Tailscale is not running. Start Tailscale first."
        return 1
    fi

    local pid=$(pgrep -f "quick-scripts/porta" | head -n 1)
    if [[ -n "$pid" ]]; then
        echo "Porta is already running (PID: $pid)."
    else
        echo "Starting Porta..."
        (cd "$PORTA_DIR" && PORTA_AUTO_APPROVE_COMMANDS=1 nohup pnpm dev:tailscale > /dev/null 2>&1 &)
    fi

    echo "  Phone/iPad: http://${tailscale_ip}:5173"
    echo "  Command auto-approve: enabled"
    echo "  Logs: ${PORTA_DIR}/logs/"
}

case "${1:-start}" in
    start)   _porta_start ;;
    stop)    _porta_stop ;;
    restart) _porta_stop && sleep 1 && _porta_start ;;
    *)       echo "Usage: runporta [start|stop|restart]" ;;
esac
