#!/usr/bin/env bash
# IDE Activity Intelligence Agent — semantic + classify → MEMORY → git → GitHub
# Pipeline: detect → git add → semantic → classify → git add → commit → push
set -euo pipefail

VAULT="/Users/aashumotlani/awesomepg/docs"
LOCK_FILE="$VAULT/.brain.lock"
SEMANTIC="$VAULT/scripts/brain-semantic.sh"
CLASSIFY="$VAULT/scripts/brain-classify.sh"
SEM_STATE="$VAULT/.brain-last-semantic"
CLS_STATE="$VAULT/.brain-last-classify"
cd "$VAULT"

echo "🧠 Brain Agent (Semantic Intelligence Layer)..."

if [[ -f "$LOCK_FILE" ]]; then
  echo "Agent already running..."
  exit 0
fi

touch "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# 1 — Detect change
if git diff --quiet 2>/dev/null && git diff --cached --quiet 2>/dev/null; then
  if [[ -z "$(git status --porcelain 2>/dev/null || true)" ]]; then
    echo "No changes detected."
    exit 0
  fi
fi

# 2 — Stage changes (exclude lock/state artifacts from index)
git add -A
git reset -q HEAD -- \
  .brain.lock .auto-sync.lock \
  .brain-last-classify .brain-last-semantic .brain-momentum \
  2>/dev/null || true

if git diff --cached --quiet; then
  echo "No staged changes."
  exit 0
fi

# 3 — Semantic analysis (staged diff)
if [[ -x "$SEMANTIC" ]]; then
  if "$SEMANTIC"; then
    export BRAIN_SEMANTIC_RAN=1
  fi
fi

# 4 — Classification engine (MEMORY type files; skips duplicate changelog if semantic ran)
if [[ -x "$CLASSIFY" ]]; then
  export BRAIN_SEMANTIC_RAN="${BRAIN_SEMANTIC_RAN:-0}"
  "$CLASSIFY" || true
fi

# Re-stage MEMORY updates from semantic + classify
git add -A
git reset -q HEAD -- \
  .brain.lock .auto-sync.lock \
  .brain-last-classify .brain-last-semantic .brain-momentum \
  2>/dev/null || true

if git diff --cached --quiet; then
  echo "No staged changes after intelligence pass."
  exit 0
fi

# 7 — Commit with semantic-enriched message
MSG="brain: memory sync"
if [[ -f "$SEM_STATE" ]]; then
  # shellcheck disable=SC1090
  source "$SEM_STATE"
elif [[ -f "$CLS_STATE" ]]; then
  # shellcheck disable=SC1090
  source "$CLS_STATE"
fi

git commit -m "$MSG"

# 8 — Push
if git remote get-url origin >/dev/null 2>&1; then
  git push origin HEAD
  echo "✅ Semantic intelligence sync → GitHub ($MSG)"
else
  echo "⚠️  No origin remote — committed locally ($MSG)"
  exit 0
fi
