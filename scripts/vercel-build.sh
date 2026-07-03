#!/usr/bin/env bash
# Vercel build entrypoint — production always migrates; preview can build when DB is unset.
set -euo pipefail

has_db_url() {
  [[ -n "${DATABASE_URL:-}" ]] || [[ -n "${POSTGRES_URL:-}" ]] || [[ -n "${POSTGRES_PRISMA_URL:-}" ]]
}

is_production_deployment() {
  [[ "${VERCEL_ENV:-}" == "production" ]]
}

run_migrate() {
  npm run db:migrate
}

if has_db_url; then
  if is_production_deployment; then
    run_migrate
  elif ! run_migrate; then
    echo "⚠ Non-production: db:migrate failed — continuing build so the PR preview can still deploy."
    echo "  Fix migrations on a branch or run db:migrate against preview DB manually."
  fi
elif is_production_deployment; then
  echo "✗ Production build requires DATABASE_URL (or POSTGRES_URL)."
  exit 1
else
  echo "⚠ Non-production: DATABASE_URL not set — skipping db:migrate (UI preview only)."
  echo "  Add DATABASE_URL to Vercel → Settings → Environment Variables → Preview for full API/DB behavior."
fi

bash scripts/vercel-build-repair.sh
next build
