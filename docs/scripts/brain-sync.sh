#!/usr/bin/env bash
# Brain sync — delegates to autonomous memory agent.
set -euo pipefail
exec "$(dirname "$0")/brain-agent.sh" "$@"
