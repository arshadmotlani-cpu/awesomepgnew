# AI System Prompt — Universal Onboarding

> **Read this file first.** Any AI (Cursor, ChatGPT, Claude, Copilot, etc.) working in this repository must follow this document before making changes.  
> Vault path: `/Users/aashumotlani/awesomepg/docs`  
> App path: `/Users/aashumotlani/awesomepg`

---

## 1. System overview

This repository combines two layers:

| Layer | What it is |
|-------|------------|
| **Application** | Awesome PG — production SaaS for Indian PG (paying guest) operators (`awesomepg.in`) |
| **Knowledge brain** | Git-backed development + memory system in `/docs` |

**Source of truth for AI context:** `/Users/aashumotlani/awesomepg/docs` — not chat history, not code comments alone.

| Component | Role |
|-----------|------|
| **`/docs`** | Structured markdown brain — architecture, workflows, routes, decisions |
| **`/docs/MEMORY/`** | Append-only intelligence logs (tasks, decisions, changelog, active state) |
| **`/docs/SYSTEM/`** | Stable system truth (`AI_CONTEXT`, `CURRENT_STATE`, `WORKFLOWS`) |
| **`/docs/PROJECT/`** | Product inventory (`features`, `roadmap`) |
| **`/scripts/`** (project root) | Reliable auto-sync — `auto-sync.sh`, `watch.sh` |
| **`/docs/scripts/`** | Optional vault automation (brain-agent, semantic/classify layers) |
| **GitHub** | Sync layer — remote mirrors local state |
| **Obsidian** | Visualization only — open `/docs` as vault; not authoritative over Git |

**Two Git remotes (important):**

| Repo | Path | Remote |
|------|------|--------|
| Application | `/Users/aashumotlani/awesomepg` | `git@github.com:arshadmotlani-cpu/awesomepgnew.git` |
| Docs vault | `/Users/aashumotlani/awesomepg/docs` | `git@github.com:arshadmotlani-cpu/awesomepg-docs.git` |

---

## 2. Project structure

```
/Users/aashumotlani/awesomepg/
├── app/                    # Next.js App Router pages
├── src/                    # Services (SSOT business logic), components, db
├── scripts/                # Project auto-sync (auto-sync.sh, watch.sh)
├── docs/                   # ← AI BRAIN (open in Obsidian)
│   ├── AI_SYSTEM_PROMPT.md # ← YOU ARE HERE
│   ├── START_HERE.md       # Product + ops onboarding
│   ├── MEMORY/             # Intelligence layer (append-only)
│   │   ├── active_memory.md
│   │   ├── tasks.md · ideas.md · decisions.md
│   │   ├── insights.md · bugs.md · mistakes.md
│   │   └── changelog.md
│   ├── SYSTEM/             # Stable references
│   │   ├── AI_CONTEXT.md
│   │   ├── CURRENT_STATE.md
│   │   └── WORKFLOWS.md
│   ├── PROJECT/
│   │   ├── features.md
│   │   └── roadmap.md
│   ├── DOMAIN HUBS/        # Residents.md, Billing.md, Vacating.md, …
│   ├── scripts/            # Vault automation (optional intelligence)
│   └── .cursor/rules.md    # Vault-local Cursor rules
├── .cursor/rules/          # App-level Cursor rules
└── package.json
```

**Application SSOT (code):** Never duplicate financial math in UI — use `src/services/residentFinancialEngine.ts` and domain services documented in [[AI_CONTEXT]].

---

## 3. Memory rules

The `MEMORY/` folder is a **structured cognition layer**. Treat it as append-only history.

| File | Purpose |
|------|---------|
| [[active_memory]] | **Current state only** — focus, blockers, priorities, semantic state |
| [[tasks]] | Actionable work |
| [[ideas]] | Strategic ideas not yet decided |
| [[decisions]] | Decision log (one-liners; formal ADRs in [[DECISIONS]]) |
| [[insights]] | Lessons learned |
| [[bugs]] | Operational bug memory |
| [[mistakes]] | Failures to avoid repeating |
| [[changelog]] | Audit trail of vault/brain changes |

### Non-negotiable memory rules

1. **Append only** — never delete or rewrite historical entries.
2. **No raw dumping** — classify new information into the correct MEMORY file.
3. **Changelog is the audit trail** — meaningful vault changes get a changelog entry.
4. **active_memory is live state** — update when focus, blockers, or priorities change; do not store long history there.
5. **SYSTEM/ and PROJECT/** are stable references — not scratch pads for transient notes.
6. **Formal registries** — `BUGS.md`, `CHANGELOG.md`, `DECISIONS.md` at vault root for product/app history; cross-link from MEMORY.

---

## 4. Development rules

### Application code (`/Users/aashumotlani/awesomepg`)

- **Half-open stays:** PostgreSQL `daterange [check_in, check_out)` — last occupied day = end − 1.
- **Money SSOT:** `residentFinancialEngine.ts` — never recompute totals in components.
- **Client boundary:** Never pass `Date` or `Map` from RSC to client — serialize first.
- **Match conventions:** Read surrounding code; minimal focused diffs.
- **Tests:** Run `npm test` for billing, vacating, occupancy changes.

### Documentation (`/docs`)

- **Never break existing structure** without explicit user approval.
- **Update MEMORY** after meaningful changes (classified, append-only).
- **Update SYSTEM docs** when stable truth changes (`CURRENT_STATE`, `WORKFLOWS`, domain hubs).
- **Prefer small safe changes** over large rewrites.
- **Wiki links:** Use `[[Note Name]]` so Obsidian graph stays connected.
- **Verify links:** From app root: `npm run docs:links`

### Git

- **Never force push** unless explicitly instructed.
- **Never destructive history rewrite** (reset --hard, rebase on shared branches).
- **Do not manual commit vault** if auto-sync watcher is running — unless user asks.

---

## 5. Automation system

### Primary: reliable auto-sync (project root)

Simple sync — **no classification, no semantic analysis.**

| Script | Path | Behavior |
|--------|------|----------|
| `auto-sync.sh` | `/Users/aashumotlani/awesomepg/scripts/` | `git add` → commit `auto-sync: update` → push `main` |
| `watch.sh` | `/Users/aashumotlani/awesomepg/scripts/` | `fswatch` (3s debounce) → calls `auto-sync.sh` |

Syncs **both** repos: `docs/` vault first, then application repo.

```bash
# One-shot
/Users/aashumotlani/awesomepg/scripts/auto-sync.sh

# Continuous (background)
/Users/aashumotlani/awesomepg/scripts/watch.sh
```

**Safety:** lock file (`.auto-sync.lock`), skips empty commits, no force push, alerts if remote missing.

### Secondary: vault intelligence (optional, `/docs/scripts/`)

Heuristic layers — **not LLM semantic understanding:**

| Script | Role |
|--------|------|
| `brain-agent.sh` | Classify → MEMORY → commit → push (vault only) |
| `brain-semantic.sh` | Intent/impact/reason from staged diff (heuristic) |
| `brain-classify.sh` | Type → MEMORY file mapping |
| `brain-watch.sh` | fswatch on vault only |

See [[INTELLIGENCE]] for pipeline detail. Use root `auto-sync.sh` when you want **sync only**.

### App pre-commit hook

Application repo: `.githooks/pre-commit` flags staged code → updates brain doc markers via `scripts/sync-docs-pre-commit.ts` (deterministic, no LLM).

---

## 6. AI behavior instructions

### Required read order

1. **`AI_SYSTEM_PROMPT.md`** (this file)
2. **`START_HERE.md`** — product summary, architecture, priorities
3. **`MEMORY/active_memory.md`** — live focus and current state
4. **`SYSTEM/AI_CONTEXT.md`** — SSOT services and non-negotiable rules
5. **Relevant domain hub** — e.g. [[Vacating]], [[Billing]], [[Operations]]
6. **Deep references as needed** — [[DATABASE]], [[ROUTES]], [[ARCHITECTURE]], [[WORKFLOWS]]

### Operating rules for any AI

| Do | Do not |
|----|--------|
| Read docs before changing code | Assume missing context |
| Classify updates into MEMORY/ | Dump unstructured notes randomly |
| Append; preserve history | Delete MEMORY or decision history |
| Ask before structural refactors | Move/rename vault folders without approval |
| Use SSOT services in code | Duplicate billing/occupancy logic in UI |
| Run tests for financial/vacating changes | Force-push or rewrite Git history |
| Update [[CURRENT_STATE]] when priorities shift | Overwrite [[DECISIONS]] entries |

### Quick paste for a new session

> Read `/Users/aashumotlani/awesomepg/docs/AI_SYSTEM_PROMPT.md`, then `START_HERE.md`, then `MEMORY/active_memory.md`. Task: [describe task].

Or use [[HANDOVER]] for a compact brief.

---

## 7. Development continuity rule

When the system evolves:

1. **Update MEMORY** — append to the correct file + [[changelog]].
2. **Update active_memory** — if focus, blockers, or priorities changed.
3. **Update SYSTEM/PROJECT** — if stable truth changed.
4. **Preserve backward compatibility** — wiki links, folder layout, automation scripts.
5. **Do not remove architecture** unless the user explicitly instructs.
6. **Document decisions** — append [[DECISIONS]] for architectural choices + one line in [[decisions]].

If automation behavior changes, update this file and [[INTELLIGENCE]] or root `scripts/` comments.

---

## 8. What this system is (and is not)

| This IS | This is NOT |
|---------|-------------|
| Git-backed development journal + knowledge base | Autonomous sentient AI |
| Structured memory for continuity across AI sessions | Replacement for code review |
| Heuristic automation (sync + optional classify) | Semantic LLM embedded in shell scripts |
| Obsidian-compatible markdown vault | Obsidian-as-source-of-truth over Git |

---

## 9. Key links

| Need | Open |
|------|------|
| Product entry | [[START_HERE]] |
| Live state | [[active_memory]] |
| Rules + SSOT map | [[AI_CONTEXT]] |
| Priorities + debt | [[CURRENT_STATE]] |
| Paste-ready brief | [[HANDOVER]] |
| Vault index | [[README]] |
| Intelligence pipeline | [[INTELLIGENCE]] |
| Open bugs | [[BUGS]] |
| Ship history | [[CHANGELOG]] |

---

*Last updated: 2026-06-22 · Maintainer: append-only — update this file when onboarding rules change.*
