#!/usr/bin/env bash
# Watch vault folder and run auto-sync on changes (Mac: requires fswatch).
set -euo pipefail

VAULT="$(cd "$(dirname "$0")/.." && pwd)"
SYNC="$VAULT/scripts/auto-sync.sh"

if ! command -v fswatch >/dev/null 2>&1; then
  echo "[watch-auto-sync] fswatch not found. Install: brew install fswatch" >&2
  exit 1
fi

chmod +x "$SYNC"
echo "[watch-auto-sync] Watching $VAULT (Ctrl+C to stop)"
echo "[watch-auto-sync] Sync script: $SYNC"

fswatch -0 -l 2 \
  --exclude '\.git/' \
  --exclude '\.obsidian/' \
  --exclude '\.auto-sync\.lock' \
  "$VAULT" | while IFS= read -r -d '' _; do
  "$SYNC" || true
done
