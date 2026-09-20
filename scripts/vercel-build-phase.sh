#!/usr/bin/env bash
# UTC phase markers for Vercel build logs (sourced by vercel-build.sh).
vercel_build_phase() {
  echo "=== [$(date -u +%Y-%m-%dT%H:%M:%SZ)] $* ==="
}
