#!/usr/bin/env bash
# Safe auto-commit + push for the docs vault. Skips when nothing changed.
set -euo pipefail

VAULT="$(cd "$(dirname "$0")/.." && pwd)"
LOCK="$VAULT/.auto-sync.lock"
cd "$VAULT"

if [[ -f "$LOCK" ]]; then
  exit 0
fi
touch "$LOCK"
trap 'rm -f "$LOCK"' EXIT

if [[ ! -d .git ]]; then
  echo "[auto-sync] No git repo in $VAULT — run git init first." >&2
  exit 1
fi

if git diff --quiet && git diff --cached --quiet && [[ -z "$(git ls-files --others --exclude-standard)" ]]; then
  exit 0
fi

git add -A
if git diff --cached --quiet; then
  exit 0
fi

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
git commit -m "auto-sync update ${TS}"

if git remote get-url origin >/dev/null 2>&1; then
  git push origin HEAD
  echo "[auto-sync] Committed and pushed at ${TS}"
else
  echo "[auto-sync] Committed at ${TS} (no origin remote — run: git remote add origin <url>)"
fi
