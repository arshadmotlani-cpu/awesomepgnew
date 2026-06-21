# IDE Activity Intelligence Layer

> **Vault-only:** `/Users/aashumotlani/awesomepg/docs`  
> Meaning-aware development journal — what changed, why, and what it means.

---

## Pipeline (v2 — semantic)

```
File change (docs/ only)
        ↓
brain-watch.sh (fswatch)
        ↓
brain-agent.sh
        ↓
git add (stage)
        ↓
brain-semantic.sh  ← intent, impact, reason
        ↓
brain-classify.sh  ← type → MEMORY/ files
        ↓
git add + commit (semantic message) + push
```

---

## Semantic layer (`brain-semantic.sh`)

Analyzes **`git diff --cached`** and infers:

| Field | Values |
|-------|--------|
| **Type** | BUG / FEATURE / REFACTOR / DECISION / TASK / MIXED / UNKNOWN |
| **Impact** | LOW / MEDIUM / HIGH |
| **Reason** | Human-readable intent explanation |

Appends structured block to **`MEMORY/changelog.md`**:

```
---
Time: <timestamp>
Type: <TYPE>
Impact: <IMPACT>
Reason: <semantic explanation>
Files:
<list>
---
```

Updates **`active_memory.md` → Semantic State** (intent, dominant type, momentum, risk).

---

## Classification layer (`brain-classify.sh`)

Maps types → append-only MEMORY files. Skips duplicate changelog when semantic already ran.

---

## Commit messages (semantic)

| Signal | Message |
|--------|---------|
| Feature | `brain: feature expansion` |
| Bug (high) | `brain: bug fix (high impact)` |
| Bug | `brain: bug fix` |
| Refactor | `brain: refactor improvement` |
| Decision | `brain: decision update` |
| Mixed | `brain: mixed semantic update` |

---

## Commands

```bash
./scripts/brain-watch.sh   # live loop
./scripts/brain-agent.sh   # one-shot
```

---

## Hard limits

- Filesystem changes in `/docs` only — no UI/OS tracking
- Heuristic semantics — not LLM embedding
- Append-only MEMORY — never delete history

---

## Related

[[active_memory]] · [[changelog]] · [[START_HERE]] · `docs/.cursor/rules.md`
