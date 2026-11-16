#!/bin/bash
# Private ChatGPT transport for this local Hacksfield installation.
# Literal credentials live only in deploy/run/chatgpt/, with owner-only permissions.
set -euo pipefail

CONNECTION_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$CONNECTION_DIR/../.." && pwd)"
STATE_DIR="$APP_DIR/deploy/run/chatgpt"
CLIENT="$STATE_DIR/bin/tunnel-client"
ACTION="${1:-status}"
ALIAS="parallax-chatgpt"

export XDG_CONFIG_HOME="$STATE_DIR/config"
export XDG_STATE_HOME="$STATE_DIR/state"
export MCP_EXTRA_HEADERS="Authorization: file:$STATE_DIR/mcp-authorization.key"
export MCP_DISCOVERY_EXTRA_HEADERS="$MCP_EXTRA_HEADERS"
export MCP_OAUTH_DISCOVERY=disabled
export HEALTH_LISTEN_ADDR=127.0.0.1:0

if [ ! -x "$CLIENT" ]; then
  echo "OpenAI's tunnel client is not installed for this connection." >&2
  exit 1
fi

case "$ACTION" in
  connect)
    for required in tunnel-id.txt runtime-api.key mcp-authorization.key; do
      if [ ! -s "$STATE_DIR/$required" ]; then
        echo "The ChatGPT connection is awaiting its approved account setup ($required)." >&2
        exit 1
      fi
    done
    TUNNEL_ID="$(tr -d '\r\n' < "$STATE_DIR/tunnel-id.txt")"
    case "$TUNNEL_ID" in tunnel_*) ;; *) echo "Invalid tunnel identity." >&2; exit 1 ;; esac
    exec "$CLIENT" runtimes connect --json \
      --alias "$ALIAS" --tunnel-id "$TUNNEL_ID" \
      --profile parallax-chatgpt --profile-dir "$STATE_DIR/profiles" \
      --runtime-api-key "file:$STATE_DIR/runtime-api.key" \
      --mcp-server-url http://127.0.0.1:3000/api/mcp
    ;;
  status)
    exec "$CLIENT" runtimes status "$ALIAS" --json
    ;;
  stop)
    exec "$CLIENT" runtimes stop "$ALIAS" --json
    ;;
  *)
    echo "Usage: connection.sh connect|status|stop" >&2
    exit 2
    ;;
esac
