#!/usr/bin/env bash
# Vercel build entrypoint — production always migrates; preview can build when DB is unset.
set -euo pipefail

has_db_url() {
  [[ -n "${DATABASE_URL:-}" ]] || [[ -n "${POSTGRES_URL:-}" ]] || [[ -n "${POSTGRES_PRISMA_URL:-}" ]]
}

run_migrate() {
  npm run db:migrate
}

if has_db_url; then
  if [[ "${VERCEL_ENV:-}" == "preview" ]]; then
    if ! run_migrate; then
      echo "⚠ Preview: db:migrate failed — continuing build so the PR preview can still deploy."
      echo "  Fix migrations on a branch or run db:migrate against preview DB manually."
    fi
  else
    run_migrate
  fi
elif [[ "${VERCEL_ENV:-}" == "preview" ]]; then
  echo "⚠ Preview: DATABASE_URL not set — skipping db:migrate (UI preview only)."
  echo "  Add DATABASE_URL to Vercel → Settings → Environment Variables → Preview for full API/DB behavior."
else
  echo "✗ Production build requires DATABASE_URL (or POSTGRES_URL)."
  exit 1
fi

bash scripts/vercel-build-repair.sh
next build
