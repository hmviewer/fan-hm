#!/bin/zsh
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ] && [ -x "/Users/junokim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]; then
  NODE_BIN="/Users/junokim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi

if [ -z "$NODE_BIN" ]; then
  echo "Node.js was not found. Install Node.js or run this from Codex's bundled runtime."
  exit 1
fi

PORT="${PORT:-3100}"
URL="http://127.0.0.1:${PORT}/"

echo "Starting THE HM signature manager..."
echo "$URL"
(sleep 1 && open "$URL" >/dev/null 2>&1) &
PORT="$PORT" "$NODE_BIN" local-admin/server.mjs
