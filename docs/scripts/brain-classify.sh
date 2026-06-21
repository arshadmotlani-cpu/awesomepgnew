#!/usr/bin/env bash
# IDE Activity Intelligence — classify vault changes → MEMORY/ (append-only).
# Signals: filesystem/git only. No UI/keystroke tracking.
set -euo pipefail

VAULT="/Users/aashumotlani/awesomepg/docs"
STATE_FILE="$VAULT/.brain-last-classify"
cd "$VAULT"

TS="$(date -u +%Y-%m-%d)"
TS_FULL="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ── STEP 1: Detect real content change ─────────────────────────────────────
HAS_CHANGE=false
if ! git diff --quiet 2>/dev/null; then HAS_CHANGE=true; fi
if ! git diff --cached --quiet 2>/dev/null; then HAS_CHANGE=true; fi

CHANGED=()
if ! git diff --cached --quiet 2>/dev/null; then
  while IFS= read -r line; do
    [[ -n "$line" ]] && CHANGED+=("$line")
  done < <(git diff --cached --name-only 2>/dev/null || true)
else
  while IFS= read -r line; do
    [[ -n "$line" ]] && CHANGED+=("$line")
  done < <(git status --porcelain 2>/dev/null | awk '{print $2}' || true)
fi

if [[ ${#CHANGED[@]} -eq 0 ]] && [[ "$HAS_CHANGE" == "false" ]]; then
  echo "[intelligence] No changes detected."
  exit 0
fi

# Filter noise (locks, agent state files)
FILTERED=()
for f in "${CHANGED[@]}"; do
  case "$f" in
    .brain.lock|.auto-sync.lock|.brain-last-classify|.brain-last-semantic|.brain-momentum) continue ;;
    scripts/brain-*) continue ;;
  esac
  FILTERED+=("$f")
done

if [[ ${#FILTERED[@]} -eq 0 ]]; then
  echo "[intelligence] Only agent meta changed — skip MEMORY writes."
  exit 0
fi

# ── STEP 2: Classify (one or more types) ───────────────────────────────────
declare -a TYPES=()

classify_path() {
  local f="$1"
  case "$f" in
    MEMORY/tasks.md|*tasks*) echo "TASK" ;;
    PROJECT/features.md|FEATURES.md|*FEATURES*) echo "FEATURE" ;;
    MEMORY/bugs.md|BUGS.md|*BUGS*) echo "BUG" ;;
    MEMORY/mistakes.md) echo "BUG" ;;
    MEMORY/decisions.md|DECISIONS.md|SYSTEM/CURRENT_STATE.md) echo "DECISION" ;;
    MEMORY/insights.md) echo "INSIGHT" ;;
    SYSTEM/ARCHITECTURE.md|ARCHITECTURE.md|SYSTEM/WORKFLOWS.md|SYSTEM/AI_CONTEXT.md)
      echo "REFACTOR" ;;
    PROJECT/roadmap.md|SYSTEM/*|PROJECT/*) echo "REFACTOR" ;;
    MEMORY/ideas.md|*ideas*) echo "INSIGHT" ;;
    scripts/*) echo "REFACTOR" ;;
    *.md)
      # Domain hubs / routes / database → feature or refactor
      case "$f" in
        ROUTES.md|DATABASE.md|WORKFLOWS.md) echo "REFACTOR" ;;
        Vacating.md|Billing.md|Operations.md|Residents.md) echo "FEATURE" ;;
        *) echo "REFACTOR" ;;
      esac
      ;;
    *) echo "REFACTOR" ;;
  esac
}

# Scan diff content for stronger signals
DIFF_TEXT="$(git diff 2>/dev/null; git diff --cached 2>/dev/null || true)"
scan_diff() {
  echo "$DIFF_TEXT" | grep -qiE 'fix|bug|crash|error|regression' && TYPES+=("BUG")
  echo "$DIFF_TEXT" | grep -qiE 'TODO|task|\[ \]' && TYPES+=("TASK")
  echo "$DIFF_TEXT" | grep -qiE 'decided|decision|ADR' && TYPES+=("DECISION")
  echo "$DIFF_TEXT" | grep -qiE 'insight|learned|lesson' && TYPES+=("INSIGHT")
  echo "$DIFF_TEXT" | grep -qiE 'feature|added|new functionality' && TYPES+=("FEATURE")
  echo "$DIFF_TEXT" | grep -qiE 'refactor|restructure|reorganiz' && TYPES+=("REFACTOR")
}

for f in "${FILTERED[@]}"; do
  TYPES+=("$(classify_path "$f")")
done
scan_diff

# Deduplicate types (bash 3.2)
UNIQUE_TYPES=""
for t in "${TYPES[@]}"; do
  [[ "$UNIQUE_TYPES" == *"|$t|"* ]] && continue
  UNIQUE_TYPES="${UNIQUE_TYPES}|${t}|"
done

# Primary type (priority order)
PRIMARY="REFACTOR"
for candidate in BUG FEATURE DECISION TASK INSIGHT REFACTOR; do
  if [[ "$UNIQUE_TYPES" == *"|${candidate}|"* ]]; then
    PRIMARY="$candidate"
    break
  fi
done

# ── Explanation from diff stat ─────────────────────────────────────────────
EXPLAIN=""
STAT="$(git diff --stat 2>/dev/null; git diff --cached --stat 2>/dev/null || true)"
if [[ -n "$STAT" ]]; then
  EXPLAIN="$(echo "$STAT" | tail -1 | sed 's/^[[:space:]]*//')"
else
  EXPLAIN="${#FILTERED[@]} file(s) modified in vault"
fi

FILE_LIST=""
for f in "${FILTERED[@]}"; do
  FILE_LIST="${FILE_LIST}- \`${f}\`"$'\n'
done

# ── STEP 3: MEMORY append ──────────────────────────────────────────────────
memory_file_for() {
  case "$1" in
    TASK) echo "MEMORY/tasks.md" ;;
    FEATURE) echo "MEMORY/ideas.md" ;;
    BUG) echo "MEMORY/bugs.md" ;;
    REFACTOR) echo "MEMORY/insights.md" ;;
    DECISION) echo "MEMORY/decisions.md" ;;
    INSIGHT) echo "MEMORY/insights.md" ;;
    *) echo "MEMORY/changelog.md" ;;
  esac
}

append_entry() {
  local file="$1"
  local marker="$2"
  local body="$3"
  [[ -f "$file" ]] || return 0
  grep -qF "$marker" "$file" 2>/dev/null && return 0
  { echo ""; echo "$marker"; echo "$body"; } >> "$file"
}

replace_block() {
  local file="$1" start="$2" end="$3" blockfile="$4"
  python3 - "$file" "$start" "$end" "$blockfile" <<'PY'
import re, sys, pathlib
path, start, end, blockfile = sys.argv[1:5]
block = pathlib.Path(blockfile).read_text()
text = pathlib.Path(path).read_text()
pattern = re.escape(start) + r".*?" + re.escape(end)
if re.search(pattern, text, re.DOTALL):
    text = re.sub(pattern, block, text, count=1, flags=re.DOTALL)
else:
    text = text.rstrip() + "\n\n" + block + "\n"
pathlib.Path(path).write_text(text)
PY
}

ENTRY_BODY="### ${TS_FULL}

- **Types:** ${UNIQUE_TYPES//|/ · }
- **Primary:** ${PRIMARY}
- **Summary:** ${EXPLAIN}
- **Files:**
${FILE_LIST}"

MARKER="<!-- INTEL_${TS_FULL} -->"

# Append to each unique type target (skip duplicate targets)
APPENDED=""
for t in BUG FEATURE DECISION TASK INSIGHT REFACTOR; do
  [[ "$UNIQUE_TYPES" == *"|${t}|"* ]] || continue
  target="$(memory_file_for "$t")"
  [[ "$APPENDED" == *"|${target}|"* ]] && continue
  APPENDED="${APPENDED}|${target}|"
  append_entry "$target" "$MARKER" "${ENTRY_BODY}"
done

# ── STEP 4: Changelog (skip if semantic layer already wrote entry) ───────────
if [[ "${BRAIN_SEMANTIC_RAN:-0}" != "1" ]]; then
  CHANGELOG="MEMORY/changelog.md"
  CL_MARKER="<!-- INTEL_LOG_${TS_FULL} -->"
  CL_BODY="- **${TS_FULL}** | **${PRIMARY}** | ${EXPLAIN}
  - Files: $(echo "${FILTERED[*]}" | tr ' ' ', ')"
  append_entry "$CHANGELOG" "$CL_MARKER" "$CL_BODY"
fi

# ── STEP 5: active_memory — ONLY on focus/blocker/priority signals ───────────
SHOULD_UPDATE_ACTIVE=false
for f in "${FILTERED[@]}"; do
  case "$f" in
    SYSTEM/CURRENT_STATE.md|PROJECT/roadmap.md|START_HERE.md|MEMORY/active_memory.md|BUGS.md)
      SHOULD_UPDATE_ACTIVE=true
      break
      ;;
  esac
done

ACTIVE="MEMORY/active_memory.md"
DELTA_START="<!-- INTELLIGENCE_DELTAS_START -->"
DELTA_END="<!-- INTELLIGENCE_DELTAS_END -->"

if [[ "$SHOULD_UPDATE_ACTIVE" == "true" ]] && [[ -f "$ACTIVE" ]]; then
  DELTA_TMP="$(mktemp)"
  cat > "$DELTA_TMP" <<EOF
${DELTA_START}
### ${TS_FULL} — review recommended

- **Signal:** ${PRIMARY} change in project state files
- **Action:** Verify Current Focus / Blockers / Priorities still accurate
- **Trigger files:** $(echo "${FILTERED[*]}" | tr ' ' ', ')

${DELTA_END}
EOF
  if grep -qF "$DELTA_START" "$ACTIVE"; then
    replace_block "$ACTIVE" "$DELTA_START" "$DELTA_END" "$DELTA_TMP"
  else
    cat "$DELTA_TMP" >> "$ACTIVE"
  fi
  rm -f "$DELTA_TMP"
fi

# Agent status (telemetry only — does not rewrite focus)
STATUS_START="<!-- AGENT_STATUS_START -->"
STATUS_END="<!-- AGENT_STATUS_END -->"
if [[ -f "$ACTIVE" ]]; then
  STATUS_TMP="$(mktemp)"
  cat > "$STATUS_TMP" <<EOF
${STATUS_START}
## Agent status

> **Last run:** ${TS_FULL}  
> **Primary type:** ${PRIMARY}  
> **All types:** ${UNIQUE_TYPES//|/ · }  
> **Files:** ${#FILTERED[@]}

${STATUS_END}
EOF
  if grep -qF "$STATUS_START" "$ACTIVE"; then
    replace_block "$ACTIVE" "$STATUS_START" "$STATUS_END" "$STATUS_TMP"
  else
    cat "$STATUS_TMP" >> "$ACTIVE"
  fi
  rm -f "$STATUS_TMP"
fi

# Commit message for brain-agent
case "$PRIMARY" in
  TASK) MSG="brain: task update" ;;
  FEATURE) MSG="brain: feature update" ;;
  BUG) MSG="brain: bug fix" ;;
  REFACTOR) MSG="brain: refactor update" ;;
  DECISION) MSG="brain: decision update" ;;
  INSIGHT) MSG="brain: insight update" ;;
  *) MSG="brain: memory sync" ;;
esac

cat > "$STATE_FILE" <<EOF
PRIMARY="${PRIMARY}"
MSG="${MSG}"
TS="${TS_FULL}"
EXPLAIN="${EXPLAIN//\"/}"
EOF

echo "[intelligence] ${PRIMARY} → MEMORY + changelog (${#FILTERED[@]} files)"
echo "[intelligence] commit: ${MSG}"
