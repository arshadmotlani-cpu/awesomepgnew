#!/usr/bin/env bash
# Install Awesome PG git hooks (pre-commit doc sync).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

chmod +x .githooks/pre-commit
chmod +x scripts/install-git-hooks.sh 2>/dev/null || true

# Use project-local hooks directory
git config core.hooksPath .githooks

echo "[hooks] Installed pre-commit → .githooks/pre-commit (core.hooksPath=.githooks)"
echo "[hooks] Doc sync runs via: npx tsx scripts/sync-docs-pre-commit.ts"
