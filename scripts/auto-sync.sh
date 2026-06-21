#!/usr/bin/env bash
# Reliable auto-sync — git add, commit, push. No classification or intelligence.
set -euo pipefail

ROOT="/Users/aashumotlani/awesomepg"
LOCK="$ROOT/.auto-sync.lock"
MSG="auto-sync: update"

if [[ -f "$LOCK" ]]; then
  exit 0
fi
touch "$LOCK"
trap 'rm -f "$LOCK"' EXIT

sync_repo() {
  local dir="$1"
  local name="$2"

  if [[ ! -d "$dir/.git" ]]; then
    return 0
  fi

  cd "$dir"

  if ! git remote get-url origin >/dev/null 2>&1; then
    echo "[auto-sync] ERROR: no git remote in ${name} (${dir})" >&2
    echo "[auto-sync] Add remote: git remote add origin <url>" >&2
    return 1
  fi

  git add -A
  git reset -q HEAD -- .auto-sync.lock .brain.lock .brain-last-classify .brain-last-semantic .brain-momentum 2>/dev/null || true

  if git diff --cached --quiet; then
    return 0
  fi

  git commit -m "$MSG"
  git push origin main
  echo "[auto-sync] ${name} → pushed (${dir})"
}

# Docs vault has its own GitHub repo — sync first
sync_repo "$ROOT/docs" "docs"
# Main application repo
sync_repo "$ROOT" "awesomepg"
