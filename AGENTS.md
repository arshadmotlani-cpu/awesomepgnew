<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Ecosystem v2 (Brain / Engine constitution)

Before any feature: classify **Engine** (actions) vs **Brain** (knowledge). Never hardcode knowledge in an Engine if another Engine could benefit — move it into the owning Brain (e.g. customer LTV → Customer Brain). Follow `docs/ECOSYSTEM_V2.md` and `.cursor/rules/ecosystem-brains.mdc`.

## Stability Phase (from 2026-08-01)

All changes follow `.cursor/rules/stability-phase.mdc` and `docs/STABILITY_PHASE.md`:

- Map dependents before editing and list them in the reply before edits; run related tests first.
- After changes: `npm run stability:report` (build + scoped tests + billing suite when applicable).
- **STOP** on unrelated test failures. Bug fixes require regression tests; add a minimal test if the path has none.
- Shared contracts: update every consumer in the same task, or stop and report.
- Reuse SSOT services — no duplicated business logic.
- Billing changes: read-only production audit before deploy.
- Commit/push only when the regression report is green. End with an Impact Summary.
