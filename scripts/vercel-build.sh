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
    echo "=== Production data consistency audit (read-only) ==="
    npx tsx scripts/audit-production-data-consistency.ts || true
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

has_invest_db_url() {
  [[ -n "${INVEST_DATABASE_URL:-}" ]] \
    || [[ -n "${INVEST_DATABASE_DATABASE_URL:-}" ]] \
    || [[ -n "${INVEST_POSTGRES_URL:-}" ]] \
    || [[ -n "${INVEST_POSTGRES_PRISMA_URL:-}" ]]
}

if has_invest_db_url; then
  echo "=== Capital database migrations ==="
  if is_production_deployment; then
    npm run capital:db:migrate
    npm run capital:db:seed || true
  elif npm run capital:db:migrate; then
    npm run capital:db:seed || true
  else
    echo "⚠ Capital db:migrate failed — continuing build."
  fi
else
  echo "⚠ Capital database URL not set (INVEST_DATABASE_URL or INVEST_DATABASE_DATABASE_URL) — skipping Capital migrations."
fi

has_hair_db_url() {
  if is_production_deployment; then
    [[ -n "${HAIR_DATABASE_URL:-}" ]] \
      || [[ -n "${FORYOURHAIR_DATABASE_URL:-}" ]] \
      || [[ -n "${HAIR_DATABASE_DATABASE_URL:-}" ]] \
      || [[ -n "${HAIR_POSTGRES_URL:-}" ]] \
      || [[ -n "${HAIR_POSTGRES_PRISMA_URL:-}" ]]
    return
  fi
  # Preview: canonical staging URL only — never fall back to production Neon integration.
  [[ -n "${HAIR_DATABASE_URL:-}" ]] || [[ -n "${FYH_STAGING_DATABASE_URL:-}" ]]
}

has_platform_db_url() {
  if is_production_deployment; then
    [[ -n "${PLATFORM_DATABASE_URL:-}" ]] \
      || [[ -n "${PLATFORM_DATABASE_DATABASE_URL:-}" ]] \
      || [[ -n "${PLATFORM_DATABASE_POSTGRES_URL:-}" ]] \
      || [[ -n "${PLATFORM_DATABASE_POSTGRES_PRISMA_URL:-}" ]] \
      || [[ -n "${PLATFORM_POSTGRES_URL:-}" ]]
    return
  fi
  [[ -n "${PLATFORM_DATABASE_URL:-}" ]] || [[ -n "${PLATFORM_STAGING_DATABASE_URL:-}" ]]
}

if has_hair_db_url; then
  echo "=== For Your Hair database migrations ==="
  if is_production_deployment; then
    npm run hair:db:migrate
    npm run hair:db:seed || true
  elif npm run hair:db:migrate; then
    npm run hair:db:seed || true
  else
    echo "⚠ Hair db:migrate failed — continuing build."
  fi
else
  echo "⚠ Hair database URL not set (HAIR_DATABASE_URL / FYH_STAGING_DATABASE_URL on Preview) — skipping For Your Hair migrations."
fi

has_owner_db_url() {
  [[ -n "${OWNER_DATABASE_URL:-}" ]] \
    || [[ -n "${OWNER_DATABASE_DATABASE_URL:-}" ]] \
    || [[ -n "${OWNER_DATABASE_POSTGRES_URL:-}" ]] \
    || [[ -n "${OWNER_DATABASE_POSTGRES_PRISMA_URL:-}" ]] \
    || [[ -n "${OWNER_POSTGRES_URL:-}" ]]
}

if has_owner_db_url; then
  echo "=== Owner OS database migrations ==="
  if is_production_deployment; then
    npm run owner:db:migrate
    npm run owner:db:seed || true
  elif npm run owner:db:migrate; then
    npm run owner:db:seed || true
  else
    echo "⚠ Owner db:migrate failed — continuing build."
  fi
else
  echo "⚠ Owner database URL not set (OWNER_DATABASE_URL or OWNER_DATABASE_POSTGRES_URL) — skipping Owner OS migrations."
fi

if has_platform_db_url; then
  echo "=== Platform database migrations ==="
  if is_production_deployment; then
    npm run platform:db:migrate
  elif npm run platform:db:migrate; then
    true
  else
    echo "⚠ Platform db:migrate failed — continuing build."
  fi
else
  echo "⚠ Platform database URL not set (PLATFORM_DATABASE_URL) — skipping Platform migrations."
fi

bash scripts/vercel-build-repair.sh

# Monorepo TS graph OOMs under Node's default ~2GB heap; 8GB is the known-working ceiling.
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}"

echo "=== Deploy typecheck (app graph, excludes tests) ==="
# Generate Next PageProps/Route types first — plain tsc cannot see them until typegen/build.
npx next typegen
# Fail with the full app error list before Next's first-error typecheck.
npx tsc -p tsconfig.deploy.json --noEmit --pretty false

next build
