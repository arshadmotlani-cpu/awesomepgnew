#!/usr/bin/env bash
# Live watcher — event loop → brain-agent (autonomous memory layer).
set -euo pipefail

VAULT="/Users/aashumotlani/awesomepg/docs"
AGENT="$VAULT/scripts/brain-agent.sh"

if ! command -v fswatch >/dev/null 2>&1; then
  echo "[brain-watch] fswatch not found. Install: brew install fswatch" >&2
  exit 1
fi

chmod +x "$AGENT" "$VAULT/scripts/brain-classify.sh" 2>/dev/null || true

cd "$VAULT"
echo "👁️ Brain Watcher Active..."
echo "[brain-watch] Vault: $VAULT"
echo "[brain-watch] Agent: $AGENT (Ctrl+C to stop)"

fswatch -0 -l 2 \
  --exclude '\.git/' \
  --exclude '\.obsidian/' \
  --exclude '\.brain\.lock' \
  --exclude '\.auto-sync\.lock' \
  "$VAULT" | while IFS= read -r -d '' _; do
  "$AGENT" || true
done
