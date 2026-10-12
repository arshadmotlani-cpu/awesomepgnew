# Deployment workflow (Awesome PG monorepo)

Production ships through **Git → Vercel** on push to `main`. A change is **not delivered** until the Git-triggered production deployment is **Ready** and serves the intended commit on https://www.awesomepg.in.

**Never** run `vercel deploy --prod` for routine releases (duplicate deploys).

Canonical build entrypoint: `npm run vercel-build` (`scripts/vercel-build.sh`) — PG + Hair + Owner + Platform migrations (when env URLs are set), deploy typecheck, then `next build`.

## A. Before committing

1. `git status` and review the **full diff** (including untracked migration `.sql` files).
2. Identify affected product(s) (PG / Hair / Capital / Owner).
3. Run scoped tests (`npm run test:pg`, `npm run test:hair`, etc.).
4. Run **`npm run typecheck:deploy`** (same graph as Vercel).
5. Run **`npm run build`** locally (or `npm run vercel-build` when DB URLs are available).
6. **Migrations:** every row in `*/migrations/meta/_journal.json` must have a matching `*.sql` file in git; every `*.sql` must be in the journal. CI runs `tests/hair/unit/hairMigrationJournal.test.ts` for Hair.
7. Do not rely on `tsc --noEmit` alone — Next production build and `vercel-build` do more.

## B. After pushing to `main`

1. Confirm Vercel started a deployment for **your commit** (`vercel ls --prod` or dashboard).
2. If status is **Error**, fetch logs: `vercel inspect <deployment-url> --logs`.
3. Wait until status is **Ready**.
4. Confirm production alias: `vercel inspect awesomepg.in` → deployment id and commit.
5. **DB:** Ready ≠ migrations applied. Production runs `db:migrate` / `hair:db:migrate` during build when URLs are set; verify schema with read-only audit scripts when changing Hair checkout or PG billing.

## C. When a deployment fails

1. Read the **first hard error** in Vercel build logs (not warnings).
2. Reproduce locally (`npm run vercel-build` or the failing step).
3. Fix root cause — do not disable checks or delete migrations to go green.
4. Add a regression test when the bug is generic (e.g. journal without SQL file).
5. Commit, push, repeat until **Ready**.
6. Do not report success on push alone or on local tests only.

## D. Retry discipline

- Do not push identical commits repeatedly.
- Use scoped checks while iterating; run full production build before the final push.
- If blocked by missing credentials, quotas, or external outages, state the blocker and last verified deployment.

## E. Production safety

- No destructive DB changes without a reviewed migration and rollback plan.
- No production customer data in tests.
- Do not print secrets in logs or reports.

## Agent / operator references

- Stability phase: `docs/STABILITY_PHASE.md`, `.cursor/rules/stability-phase.mdc`
- Vercel build script: `scripts/vercel-build.sh`
- CI: `.github/workflows/ci.yml`
