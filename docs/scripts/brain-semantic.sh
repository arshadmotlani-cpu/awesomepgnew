#!/usr/bin/env bash
# Semantic Intelligence Layer — infer intent, impact, and meaning from staged vault diff.
# Reads: git diff --cached only. No OS/UI tracking.
set -euo pipefail

VAULT="/Users/aashumotlani/awesomepg/docs"
STATE_FILE="$VAULT/.brain-last-semantic"
MOMENTUM_FILE="$VAULT/.brain-momentum"
CHANGELOG="$VAULT/MEMORY/changelog.md"
ACTIVE="$VAULT/MEMORY/active_memory.md"
cd "$VAULT"

TS_FULL="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if git diff --cached --quiet 2>/dev/null; then
  echo "[semantic] No staged changes — skip."
  exit 0
fi

DIFF="$(git diff --cached 2>/dev/null || true)"
STAT="$(git diff --cached --stat 2>/dev/null || true)"
FILES=()
while IFS= read -r line; do
  [[ -n "$line" ]] && FILES+=("$line")
done < <(git diff --cached --name-only 2>/dev/null || true)

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "[semantic] No staged files."
  exit 0
fi

# Filter agent noise from file list for analysis
ANALYZE=()
for f in "${FILES[@]}"; do
  case "$f" in
    .brain.lock|.auto-sync.lock|.brain-last-*|.brain-momentum) continue ;;
  esac
  ANALYZE+=("$f")
done

[[ ${#ANALYZE[@]} -eq 0 ]] && exit 0

FILE_LIST=""
for f in "${ANALYZE[@]}"; do
  FILE_LIST="${FILE_LIST}- ${f}"$'\n'
done

# ── TYPE inference (priority order) ──────────────────────────────────────────
TYPE="UNKNOWN"
SCORE_BUG=0 SCORE_FEATURE=0 SCORE_REFACTOR=0 SCORE_DECISION=0 SCORE_TASK=0

score_keywords() {
  local text="$1"
  echo "$text" | grep -qiE '\b(fix|fixed|bug|crash|error|regression|broken|issue)\b' && SCORE_BUG=$((SCORE_BUG + 3)) || true
  echo "$text" | grep -qiE '\b(feature|added|adds|new capability|introduce)\b' && SCORE_FEATURE=$((SCORE_FEATURE + 3)) || true
  echo "$text" | grep -qiE '\b(refactor|restructure|reorganiz|rename|move|layout)\b' && SCORE_REFACTOR=$((SCORE_REFACTOR + 3)) || true
  echo "$text" | grep -qiE '\b(decision|decided|ADR|architectural|policy)\b' && SCORE_DECISION=$((SCORE_DECISION + 3)) || true
  echo "$text" | grep -qiE '\b(TODO|task|\[ \]|implement|WIP)\b' && SCORE_TASK=$((SCORE_TASK + 2)) || true
}

score_keywords "$DIFF"
for f in "${ANALYZE[@]}"; do
  score_keywords "$f"
  case "$f" in
    MEMORY/bugs.md|BUGS.md) SCORE_BUG=$((SCORE_BUG + 4)) ;;
    PROJECT/features.md|*features*) SCORE_FEATURE=$((SCORE_FEATURE + 3)) ;;
    MEMORY/decisions.md|DECISIONS.md|SYSTEM/CURRENT_STATE.md) SCORE_DECISION=$((SCORE_DECISION + 4)) ;;
    MEMORY/tasks.md) SCORE_TASK=$((SCORE_TASK + 3)) ;;
    scripts/brain-*|INTELLIGENCE.md) SCORE_REFACTOR=$((SCORE_REFACTOR + 2)) ;;
    SYSTEM/*|ARCHITECTURE.md) SCORE_REFACTOR=$((SCORE_REFACTOR + 2)) ;;
    Vacating.md|Billing.md|Operations.md|Residents.md) SCORE_FEATURE=$((SCORE_FEATURE + 2)) ;;
  esac
done

MAX=$SCORE_BUG
TYPE="BUG"
[[ $SCORE_FEATURE -gt $MAX ]] && MAX=$SCORE_FEATURE && TYPE="FEATURE"
[[ $SCORE_REFACTOR -gt $MAX ]] && MAX=$SCORE_REFACTOR && TYPE="REFACTOR"
[[ $SCORE_DECISION -gt $MAX ]] && MAX=$SCORE_DECISION && TYPE="DECISION"
[[ $SCORE_TASK -gt $MAX ]] && MAX=$SCORE_TASK && TYPE="TASK"
[[ $MAX -eq 0 ]] && TYPE="UNKNOWN"

# Multiple strong signals → mixed
STRONG=0
[[ $SCORE_BUG -ge 3 ]] && STRONG=$((STRONG + 1))
[[ $SCORE_FEATURE -ge 3 ]] && STRONG=$((STRONG + 1))
[[ $SCORE_REFACTOR -ge 3 ]] && STRONG=$((STRONG + 1))
[[ $SCORE_DECISION -ge 3 ]] && STRONG=$((STRONG + 1))
[[ $SCORE_TASK -ge 3 ]] && STRONG=$((STRONG + 1))
[[ $STRONG -ge 2 ]] && TYPE="MIXED"

# ── IMPACT ───────────────────────────────────────────────────────────────────
IMPACT="LOW"
N=${#ANALYZE[@]}
LINES=$(echo "$STAT" | tail -1 | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo 0)
LINES=${LINES:-0}

if [[ $N -ge 6 ]] || [[ ${LINES:-0} -ge 200 ]]; then
  IMPACT="HIGH"
elif [[ $N -ge 2 ]] || [[ ${LINES:-0} -ge 40 ]] || [[ "$TYPE" == "DECISION" ]]; then
  IMPACT="MEDIUM"
fi
if [[ "$TYPE" == "BUG" ]] && [[ $N -ge 3 ]]; then
  IMPACT="HIGH"
fi

# ── REASON (human-readable intent) ───────────────────────────────────────────
infer_intent() {
  local joined
  joined="$(echo "${ANALYZE[*]}" | tr ' ' '\n')"
  if echo "$joined" | grep -qE 'Vacating|vacating|checkout|move-out'; then
    echo "Move-out and checkout documentation is evolving — likely reflecting vacating ops or refund workflow changes."
  elif echo "$joined" | grep -qE 'brain-|INTELLIGENCE|MEMORY/'; then
    echo "The AI memory / intelligence automation layer is being extended — cognition pipeline or MEMORY structure changed."
  elif echo "$joined" | grep -qE 'SYSTEM/CURRENT_STATE|CURRENT_STATE'; then
    echo "Project operational state documentation updated — priorities, shipped work, or known issues may have shifted."
  elif echo "$joined" | grep -qE 'DECISIONS|decisions'; then
    echo "An architectural or business decision was recorded or revised in the knowledge base."
  elif echo "$joined" | grep -qE 'BUGS|bugs'; then
    echo "Bug tracking or incident documentation was updated — likely a fix, workaround, or new known issue."
  elif echo "$joined" | grep -qE 'PROJECT/features|features'; then
    echo "Feature inventory expanded or corrected — product surface area documentation changed."
  elif echo "$joined" | grep -qE 'ROUTES|DATABASE|ARCHITECTURE|WORKFLOWS'; then
    echo "Core system reference docs updated — routes, schema, architecture, or workflows may affect implementation guidance."
  else
    case "$TYPE" in
      BUG) echo "Documentation change suggests error correction or regression tracking in the vault." ;;
      FEATURE) echo "Documentation change suggests new or expanded product capability being captured." ;;
      REFACTOR) echo "Knowledge base structure or organization improved without necessarily changing product behavior." ;;
      DECISION) echo "A deliberate choice was documented for future AI and developer alignment." ;;
      TASK) echo "Actionable work or TODO items were added or progressed in the vault." ;;
      *) echo "General vault maintenance — review diff for specific intent." ;;
    esac
  fi
}

REASON="$(infer_intent)"

# ── Momentum (commit frequency) ──────────────────────────────────────────────
RECENT="$(git log --since='24 hours ago' --oneline 2>/dev/null | wc -l | tr -d ' ')"
MOMENTUM="LOW"
[[ $RECENT -ge 2 && $RECENT -le 6 ]] && MOMENTUM="MEDIUM"
[[ $RECENT -ge 7 ]] && MOMENTUM="HIGH"
echo "$TS_FULL" >> "$MOMENTUM_FILE" 2>/dev/null || true

# ── Risk (BUG/DECISION ratio from recent log) ────────────────────────────────
RECENT_BUGS="$(git log --since='7 days ago' --oneline 2>/dev/null | grep -ci 'bug' || true)"
RECENT_DEC="$(git log --since='7 days ago' --oneline 2>/dev/null | grep -ci 'decision' || true)"
RECENT_BUGS=${RECENT_BUGS:-0}
RECENT_DEC=${RECENT_DEC:-0}
RISK="LOW"
if [[ "$TYPE" == "BUG" && "$IMPACT" == "HIGH" ]]; then
  RISK="HIGH"
elif [[ "$TYPE" == "BUG" || "$TYPE" == "DECISION" || $RECENT_BUGS -ge 3 ]]; then
  RISK="MEDIUM"
fi
[[ $RECENT_DEC -ge 5 ]] && RISK="MEDIUM"

# ── Append semantic entry to changelog (append-only) ─────────────────────────
SEM_MARKER="<!-- SEMANTIC_${TS_FULL} -->"
if [[ -f "$CHANGELOG" ]] && ! grep -qF "$SEM_MARKER" "$CHANGELOG" 2>/dev/null; then
  {
    echo ""
    echo "$SEM_MARKER"
    echo "---"
    echo "Time: ${TS_FULL}"
    echo "Type: ${TYPE}"
    echo "Impact: ${IMPACT}"
    echo "Reason: ${REASON}"
    echo "Files:"
    echo "$FILE_LIST"
    echo "---"
  } >> "$CHANGELOG"
fi

# ── Update Semantic State in active_memory ───────────────────────────────────
SEM_START="<!-- SEMANTIC_STATE_START -->"
SEM_END="<!-- SEMANTIC_STATE_END -->"

DOMINANT="$TYPE"
[[ "$TYPE" == "MIXED" ]] && DOMINANT="MIXED (see changelog)"
[[ "$TYPE" == "UNKNOWN" ]] && DOMINANT="REFACTOR"

INTENT_SUMMARY="$REASON"

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

if [[ -f "$ACTIVE" ]]; then
  SEM_TMP="$(mktemp)"
  cat > "$SEM_TMP" <<EOF
${SEM_START}
## Semantic State

> **Last analyzed:** ${TS_FULL}

- **Current system intent:** ${INTENT_SUMMARY}
- **Dominant change type:** ${DOMINANT}
- **System momentum:** ${MOMENTUM} (${RECENT} vault commits in 24h)
- **Risk level:** ${RISK}

${SEM_END}
EOF
  if grep -qF "$SEM_START" "$ACTIVE"; then
    replace_block "$ACTIVE" "$SEM_START" "$SEM_END" "$SEM_TMP"
  else
    cat "$SEM_TMP" >> "$ACTIVE"
  fi
  rm -f "$SEM_TMP"
fi

# ── Commit message ───────────────────────────────────────────────────────────
build_msg() {
  local t="$1" i="$2"
  case "$t" in
    MIXED) echo "brain: mixed semantic update" ;;
    BUG)
      [[ "$i" == "HIGH" ]] && echo "brain: bug fix (high impact)" || echo "brain: bug fix" ;;
    FEATURE) echo "brain: feature expansion" ;;
    REFACTOR) echo "brain: refactor improvement" ;;
    DECISION) echo "brain: decision update" ;;
    TASK) echo "brain: task update" ;;
    *) echo "brain: memory sync" ;;
  esac
}

MSG="$(build_msg "$TYPE" "$IMPACT")"

cat > "$STATE_FILE" <<EOF
TYPE="${TYPE}"
IMPACT="${IMPACT}"
REASON="${REASON//\"/}"
MSG="${MSG}"
TS="${TS_FULL}"
MOMENTUM="${MOMENTUM}"
RISK="${RISK}"
EOF

export BRAIN_SEMANTIC_RAN=1
echo "[semantic] ${TYPE} | ${IMPACT} impact | ${MSG}"
echo "[semantic] ${REASON}"
exit 0
