#!/usr/bin/env bash
# Install Awesome PG git hooks (pre-commit doc sync).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

chmod +x .githooks/pre-commit
chmod +x scripts/install-git-hooks.sh 2>/dev/null || true

# Skip on Vercel/CI — no local git config needed in deploy environments.
if [ -n "${VERCEL:-}" ] || [ -n "${CI:-}" ]; then
  echo "[hooks] Skipping git hook install (CI/Vercel)"
  exit 0
fi

if [ ! -d .git ]; then
  echo "[hooks] Skipping git hook install (not a git repo)"
  exit 0
fi

# Use project-local hooks directory
git config core.hooksPath .githooks

echo "[hooks] Installed pre-commit → .githooks/pre-commit (core.hooksPath=.githooks)"
echo "[hooks] Doc sync runs via: npx tsx scripts/sync-docs-pre-commit.ts"
