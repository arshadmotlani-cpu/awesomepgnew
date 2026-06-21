#!/usr/bin/env bash
# Background file watcher — debounced auto-sync for the whole project.
set -euo pipefail

ROOT="/Users/aashumotlani/awesomepg"
SYNC="$ROOT/scripts/auto-sync.sh"

if ! command -v fswatch >/dev/null 2>&1; then
  echo "[watch] fswatch not found. Install: brew install fswatch" >&2
  exit 1
fi

chmod +x "$SYNC"

echo "[watch] Auto-sync watcher active"
echo "[watch] Root: $ROOT"
echo "[watch] Press Ctrl+C to stop"

fswatch -0 -l 3 \
  --exclude '\.git/' \
  --exclude 'node_modules' \
  --exclude '\.next/' \
  --exclude '/out/' \
  --exclude '\.auto-sync\.lock' \
  --exclude '\.brain\.lock' \
  --exclude '\.obsidian/' \
  "$ROOT" | while IFS= read -r -d '' _; do
  "$SYNC" || true
done
